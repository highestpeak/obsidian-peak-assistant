import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ParsedConversationFile, ParsedProjectFile, ChatMessage, PendingConversation } from '@/service/chat/types';
import { generateUuidWithoutHyphens } from '@/service/chat/utils';
import { uploadFilesToVault } from '@/core/utils/vault-utils';
import { useMessageStore } from '@/ui/store/messageStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { getFileType, FileType } from '@/ui/view/shared/file-utils';
import { cn } from '@/ui/react/lib/utils';
import { FileText, Image, File } from 'lucide-react';

/**
 * Pending file with preview for images
 */
interface PendingFile {
	file: File;
	preview?: string;
	type: FileType;
}

interface ChatInputAreaComponentProps {
	onScrollToBottom?: () => void;
}

/**
 * React component for chat input area
 */
export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
	onScrollToBottom,
}) => {
	const { app, manager } = useServiceContext();
	const { startStreaming, appendStreamingDelta, completeStreaming, errorStreaming } = useMessageStore();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const pendingConversation = useChatViewStore((state) => state.pendingConversation);
	const [inputValue, setInputValue] = useState('');
	const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [textareaHeight, setTextareaHeight] = useState(22.5);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputContainerRef = useRef<HTMLDivElement>(null);

	// Auto-resize textarea
	useEffect(() => {
		if (!textareaRef.current) return;

		const textarea = textareaRef.current;
		const singleLineHeight = 22.5;

		const updateHeight = () => {
			if (!textarea.value || textarea.value.trim() === '') {
				setTextareaHeight(singleLineHeight);
			} else {
				textarea.style.height = 'auto';
				const newHeight = Math.min(textarea.scrollHeight, 200);
				setTextareaHeight(Math.max(newHeight, singleLineHeight));
			}
		};

		textarea.addEventListener('input', updateHeight);
		updateHeight();

		return () => {
			textarea.removeEventListener('input', updateHeight);
		};
	}, []);

	// Focus textarea on mount
	useEffect(() => {
		if (textareaRef.current) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [activeConversation]);

	// Handle keyboard shortcuts (Cmd/Ctrl+K to focus input)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Command+K or Ctrl+K to focus input
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;

			if (isModKey && isKKey) {
				// Only handle if not already in input
				const activeElement = document.activeElement;
				if (textareaRef.current && activeElement !== textareaRef.current) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => {
						textareaRef.current?.focus();
					}, 100);
					return false;
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, []);

	/**
	 * Create image preview from file
	 */
	const createImagePreview = useCallback((file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					resolve(e.target.result as string);
				} else {
					reject(new Error('Failed to read file'));
				}
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}, []);

	/**
	 * Add files to pending list
	 */
	const handleFileSelect = useCallback(async (files: File[]) => {
		const newFiles: PendingFile[] = [];

		for (const file of files) {
			const type = getFileType(file);
			const fileItem: PendingFile = {
				file,
				type,
			};

			if (type === 'image') {
				try {
					const preview = await createImagePreview(file);
					fileItem.preview = preview;
				} catch (error) {
					console.error('Failed to create image preview:', error);
				}
			}

			newFiles.push(fileItem);
		}

		setPendingFiles(prev => [...prev, ...newFiles]);
	}, [createImagePreview]);

	/**
	 * Remove file from pending list
	 */
	const handleRemoveFile = useCallback((index: number) => {
		setPendingFiles(prev => prev.filter((_, i) => i !== index));
	}, []);

	const handleSend = useCallback(async () => {
		if (!inputValue.trim() && pendingFiles.length === 0) return;
		if (isSending) return;

		setIsSending(true);
		try {
			// Create conversation if needed
			let conversation = activeConversation;
			if (!conversation && pendingConversation) {
				conversation = await manager.createConversation({
					title: pendingConversation.title,
					project: pendingConversation.project?.meta ?? null,
				});
			}
			if (!conversation) {
				console.error('Failed to create conversation');
				setIsSending(false);
				return;
			}

			// Upload files if any
			let uploadedPaths: string[] = [];
			if (pendingFiles.length > 0) {
				const files = pendingFiles.map(item => item.file);
				uploadedPaths = await uploadFilesToVault(app, files, manager.getSettings().uploadFolder);
			}

			// Create temporary user message
			const modelId = conversation.meta.activeModel || manager.getSettings().defaultModelId;
			const provider = conversation.meta.activeProvider || 'other';
			const tempUserMessage: ChatMessage = {
				id: generateUuidWithoutHyphens(),
				role: 'user',
				content: inputValue,
				model: modelId,
				provider: provider,
				createdAtTimestamp: Date.now(),
				createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				starred: false,
				attachments: uploadedPaths.length > 0 ? uploadedPaths : undefined,
			};

			// Show user message immediately
			const tempConversation: ParsedConversationFile = {
				...conversation,
				messages: [...conversation.messages, tempUserMessage],
			};
			useChatViewStore.getState().setConversation(tempConversation);

			// Create assistant message ID for streaming
			const assistantMessageId = generateUuidWithoutHyphens();
			startStreaming(assistantMessageId, 'assistant');

			// Stream chat
			const stream = manager.streamChat({
				conversation: conversation,
				project: activeProject,
				userContent: inputValue,
				autoSave: true,
			});

			let finalConversation: ParsedConversationFile | null = null;
			let finalMessage: ChatMessage | null = null;

			try {
				for await (const event of stream) {
					if (event.type === 'delta') {
						appendStreamingDelta(event.text);
						onScrollToBottom?.();
					} else if (event.type === 'complete') {
						if (event.message) {
							finalMessage = event.message;
							completeStreaming(event.message);
						}
						if (event.conversation) {
							finalConversation = event.conversation;
						}
						onScrollToBottom?.();
					} else if (event.type === 'error') {
						console.error('Streaming error:', event.error);
						errorStreaming();
						throw event.error;
					}
				}
			} catch (error) {
				errorStreaming();
				throw error;
			}

			// Get final conversation
			if (!finalConversation) {
				const allConversations = await manager.listConversations(activeProject?.meta);
				finalConversation = allConversations.find(c => c.meta.id === conversation.meta.id) || conversation;
			}

			// Generate title if needed
			if (finalConversation &&
				(finalConversation.meta.title === 'New Conversation' || finalConversation.meta.title === 'new-conversation') &&
				finalConversation.messages.length >= 2) {
				try {
					const messagesForName = finalConversation.messages.map(msg => ({
						role: msg.role,
						content: msg.content,
					}));
					const generatedName = await manager.getApplicationService().generateConvName({
						conversation: {
							id: finalConversation.meta.id,
							messages: messagesForName,
						},
					});

					finalConversation = await manager.updateConversationTitle({
						conversation: finalConversation,
						project: activeProject,
						title: generatedName,
					});
				} catch (error) {
					console.warn('Failed to generate conversation name', error);
				}
			}

			if (finalConversation) {
				useChatViewStore.getState().setConversation(finalConversation);
			}

			// Clear state
			setPendingFiles([]);
			setInputValue('');
			setTextareaHeight(22.5);
		} finally {
			setIsSending(false);
		}
	}, [inputValue, pendingFiles, activeConversation, activeProject, pendingConversation, manager, startStreaming, appendStreamingDelta, completeStreaming, errorStreaming, onScrollToBottom, isSending]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}, [handleSend]);

	const [isDragOver, setIsDragOver] = useState(false);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback(() => {
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFileSelect(Array.from(files));
		}
	}, [handleFileSelect]);

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = hasMessages ? 'Ask anything' : 'Ready when you are.';

	return (
		<div className="pktw-px-6 pktw-pt-5 pktw-pb-6 pktw-bg-primary pktw-border-t pktw-border-border pktw-flex-shrink-0 pktw-w-full pktw-box-border">
			{/* File preview container */}
			{pendingFiles.length > 0 && (
				<div className="pktw-flex pktw-items-center pktw-w-full pktw-mb-3">
					<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-w-full pktw-overflow-x-auto pktw-pb-1 pktw-min-h-[70px]">
						{pendingFiles.map((fileItem, index) => (
							<div
								key={index}
								className={cn(
									"pktw-flex-[0_0_auto] pktw-flex pktw-items-center pktw-gap-2.5 pktw-bg-secondary pktw-border pktw-border-border pktw-rounded-[14px] pktw-px-3 pktw-py-2 pktw-min-h-[66px] pktw-min-w-[160px] pktw-max-w-[220px] pktw-shadow-sm",
									fileItem.type === 'pdf' && "pktw-bg-[#c92a2a] pktw-border-[#ca1f1f] pktw-text-white pktw-shadow-[0_4px_12px_rgba(201,42,42,0.35)]",
									fileItem.type === 'image' && "pktw-bg-[#ecfeff] pktw-border-[#67e8f9]",
									fileItem.type === 'file' && "pktw-bg-secondary pktw-border-border"
								)}
							>
								{fileItem.type === 'image' && fileItem.preview ? (
									<img
										src={fileItem.preview}
										alt={fileItem.file.name}
										className="pktw-h-12 pktw-w-auto pktw-rounded-md pktw-object-contain"
									/>
								) : (
									<div className="pktw-flex pktw-items-center pktw-justify-center">
										{fileItem.type === 'pdf' ? (
											<FileText
												size={24}
												strokeWidth={2}
												className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
											/>
										) : fileItem.type === 'image' ? (
											<Image
												size={24}
												strokeWidth={2}
												className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
											/>
										) : (
											<File
												size={24}
												strokeWidth={2}
												className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
											/>
										)}
									</div>
								)}
								<div className={cn(
									"pktw-flex-1 pktw-text-[13px] pktw-text-foreground pktw-font-medium pktw-m-0 pktw-overflow-hidden pktw-text-ellipsis pktw-whitespace-nowrap",
									fileItem.type === 'pdf' && "pktw-text-white"
								)} title={fileItem.file.name}>
									{fileItem.file.name}
								</div>
								<button
									className="pktw-border-0 pktw-bg-primary pktw-text-muted-foreground pktw-w-7 pktw-h-7 pktw-inline-flex pktw-items-center pktw-justify-center pktw-text-sm pktw-rounded-full pktw-shadow-[inset_0_0_0_1px_var(--background-modifier-border)] pktw-cursor-pointer pktw-transition-all pktw-duration-200 pktw-p-0 hover:pktw-text-foreground hover:pktw-bg-secondary hover:pktw-shadow-[inset_0_0_0_1px_var(--interactive-accent)]"
									aria-label="Remove file"
									onClick={(e) => {
										e.stopPropagation();
										handleRemoveFile(index);
									}}
								>
									×
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Input container */}
			<div
				ref={inputContainerRef}
				className={cn(
					"pktw-flex pktw-items-center pktw-gap-3 pktw-w-full pktw-max-w-none pktw-m-0 pktw-bg-gradient-to-b pktw-from-white/90 pktw-to-white/60 pktw-border pktw-border-white/40 pktw-rounded-[28px] pktw-px-[18px] pktw-py-3.5 pktw-shadow-[0_15px_30px_rgba(0,0,0,0.12),inset_0_0_0_1px_rgba(255,255,255,0.2)] pktw-transition-all pktw-duration-200 pktw-relative pktw-box-border",
					"focus-within:pktw-border-accent focus-within:pktw-shadow-[0_20px_30px_rgba(var(--interactive-accent-rgb),0.25),inset_0_0_0_1px_rgba(var(--interactive-accent-rgb),0.25)] focus-within:pktw-translate-y-[-1px] focus-within:pktw-bg-gradient-to-b focus-within:pktw-from-white focus-within:pktw-to-white/70",
					isDragOver && "pktw-border-accent pktw-bg-hover"
				)}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					style={{ display: 'none' }}
					accept="*"
					onChange={(e) => {
						const files = e.target.files;
						if (files && files.length > 0) {
							handleFileSelect(Array.from(files));
						}
					}}
				/>

				{/* Plus icon for file upload */}
				<div
					className="pktw-text-xl pktw-text-muted-foreground pktw-flex-shrink-0 pktw-leading-none pktw-p-1 pktw-cursor-pointer pktw-transition-colors pktw-duration-200 hover:pktw-text-foreground"
					title="Upload file"
					onClick={() => fileInputRef.current?.click()}
				>
					+
				</div>

				{/* Textarea */}
				<div className="pktw-flex-1 pktw-min-w-0">
					<textarea
						ref={textareaRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						className="pktw-w-full pktw-border-0 pktw-bg-transparent pktw-resize-none pktw-text-[15px] pktw-leading-[1.5] pktw-text-foreground pktw-p-0 pktw-outline-none pktw-font-inherit pktw-box-border pktw-caret-foreground pktw-transition-colors pktw-duration-200 placeholder:pktw-text-muted-foreground focus-visible:pktw-outline-none focus-visible:pktw-shadow-none"
						style={{
							resize: 'none',
							minHeight: `${textareaHeight}px`,
							height: `${textareaHeight}px`,
						}}
					/>
				</div>

				{/* Send button */}
				<div className="pktw-flex-shrink-0">
					<button
						className="pktw-bg-accent pktw-text-[var(--text-on-accent)] pktw-border-0 pktw-rounded-[20px] pktw-px-4 pktw-py-2 pktw-text-sm pktw-font-medium pktw-cursor-pointer pktw-transition-all pktw-duration-200 hover:pktw-bg-[var(--interactive-accent-hover)] hover:pktw-scale-[1.02] disabled:pktw-opacity-50 disabled:pktw-cursor-not-allowed"
						onClick={handleSend}
						disabled={isSending}
					>
						Send
					</button>
				</div>
			</div>
		</div>
	);
};

