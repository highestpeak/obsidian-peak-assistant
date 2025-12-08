import React, { useCallback, useState } from 'react';
import { Menu, TFile } from 'obsidian';
import { ChatMessage, ParsedConversationFile, ParsedProjectFile } from '@/service/chat/types';
import { getFileTypeFromPath, getAttachmentStats } from '@/ui/view/shared/file-utils';
import { useChatViewStore } from '../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { Copy, Check, RefreshCw, FileText, File } from 'lucide-react';

/**
 * Copy button component with visual feedback
 */
const CopyButton: React.FC<{ onCopy: () => Promise<void> }> = ({ onCopy }) => {
	const [copied, setCopied] = useState(false);

	const handleClick = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		await onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [onCopy]);

	const Icon = copied ? Check : Copy;

	return (
		<button
			className="pktw-bg-transparent pktw-border-0 pktw-shadow-none pktw-cursor-pointer pktw-text-[14px] pktw-text-muted-foreground pktw-p-0 pktw-rounded-none pktw-transition-all pktw-duration-200 pktw-flex pktw-items-center pktw-justify-center pktw-min-w-6 pktw-h-6 pktw-box-border pktw-outline-none pktw-leading-none hover:pktw-bg-accent hover:pktw-text-white focus-visible:pktw-outline-none focus-visible:pktw-shadow-none"
			aria-label="Copy message"
			title="Copy"
			onClick={handleClick}
		>
			<Icon 
				size={14} 
				strokeWidth={copied ? 3 : 2}
				className={cn(
					'pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200',
					copied && 'pktw-text-[var(--interactive-accent)]'
				)}
			/>
		</button>
	);
};

interface MessageItemProps {
	message: ChatMessage;
	activeConversation: ParsedConversationFile | null;
	activeProject: ParsedProjectFile | null;
	isStreaming?: boolean;
	streamingContent?: string;
	onScrollToBottom?: () => void;
}

/**
 * Component for rendering a single message
 */
export const MessageItem: React.FC<MessageItemProps> = ({
	message,
	activeConversation,
	activeProject,
	isStreaming = false,
	streamingContent = '',
	onScrollToBottom,
}) => {
	const { manager, app } = useServiceContext();
	const handleToggleStar = useCallback(async (messageId: string, starred: boolean) => {
		if (!activeConversation) return;
		const updatedConv = await manager.toggleStar({
			messageId,
			conversation: activeConversation,
			project: activeProject,
			starred,
		});
		useChatViewStore.getState().setConversation(updatedConv);
	}, [activeConversation, activeProject, manager]);

	const handleRegenerate = useCallback(async (messageId: string) => {
		if (!activeConversation) return;
		
		const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
		if (messageIndex === -1 || messageIndex === 0) return;
		
		const assistantMessage = activeConversation.messages[messageIndex];
		if (assistantMessage.role !== 'assistant') return;
		
		let userMessageIndex = -1;
		for (let i = messageIndex - 1; i >= 0; i--) {
			if (activeConversation.messages[i].role === 'user') {
				userMessageIndex = i;
				break;
			}
		}
		
		if (userMessageIndex === -1) return;
		
		const userMessage = activeConversation.messages[userMessageIndex];
		
		try {
			const result = await manager.blockChat({
				conversation: activeConversation,
				project: activeProject,
				userContent: userMessage.content,
			});
			useChatViewStore.getState().setConversation(result.conversation);
			onScrollToBottom?.();
		} catch (error) {
			console.error('Failed to regenerate message:', error);
		}
	}, [activeConversation, activeProject, manager, onScrollToBottom]);
	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(message.content);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}, [message.content]);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const menu = new Menu();

		// Check if there's selected text
		const selection = window.getSelection();
		const selectedText = selection?.toString().trim();

		// Copy selected text if there's a selection
		if (selectedText && selectedText.length > 0) {
			menu.addItem((item) => {
				item.setTitle('Copy selection');
				item.setIcon('copy');
				item.onClick(async () => {
					try {
						await navigator.clipboard.writeText(selectedText);
					} catch (err) {
						console.error('Failed to copy selection:', err);
					}
				});
			});
			menu.addSeparator();
		}

		// Copy message content
		menu.addItem((item) => {
			item.setTitle('Copy message');
			item.setIcon('copy');
			item.onClick(handleCopy);
		});

		// Toggle star
		menu.addItem((item) => {
			item.setTitle(message.starred ? 'Unstar message' : 'Star message');
			item.setIcon('lucide-star');
			item.onClick(() => {
				handleToggleStar(message.id, !message.starred);
			});
		});

		// Regenerate (only for assistant messages)
		if (message.role === 'assistant') {
			menu.addItem((item) => {
				item.setTitle('Regenerate response');
				item.setIcon('refresh-cw');
				item.onClick(() => {
					handleRegenerate(message.id);
				});
			});
		}

		// Show menu at cursor position
		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	}, [message, handleCopy, handleToggleStar, handleRegenerate]);

	const renderAttachments = useCallback((attachments: string[]) => {
		const stats = getAttachmentStats(attachments);
		const statsText: string[] = [];
		if (stats.pdf > 0) statsText.push(`${stats.pdf} PDF${stats.pdf > 1 ? 's' : ''}`);
		if (stats.image > 0) statsText.push(`${stats.image} image${stats.image > 1 ? 's' : ''}`);
		if (stats.file > 0) statsText.push(`${stats.file} file${stats.file > 1 ? 's' : ''}`);

		return (
			<div className="pktw-flex pktw-flex-col pktw-items-start pktw-gap-1.5 pktw-w-full pktw-max-w-[420px] pktw-pt-1.5">
				{statsText.length > 0 && (
					<div className="pktw-text-xs pktw-text-muted-foreground">
						{statsText.join(', ')}
					</div>
				)}
				<div className="pktw-grid pktw-grid-cols-[repeat(auto-fit,minmax(140px,1fr))] pktw-gap-2 pktw-w-full">
					{attachments.map((attachmentPath, index) => {
						const type = getFileTypeFromPath(attachmentPath);
						const normalizedPath = attachmentPath.startsWith('/') ? attachmentPath.slice(1) : attachmentPath;
						const file = app.vault.getAbstractFileByPath(normalizedPath);
						const isImage = type === 'image' && file && file instanceof TFile;
						const fileName = attachmentPath.split('/').pop() || attachmentPath;

						return (
							<div
								key={index}
								className={cn(
									"pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-1.5 pktw-min-h-24 pktw-border pktw-rounded-xl pktw-p-2.5 pktw-shadow-sm pktw-cursor-pointer pktw-transition-colors",
									type === 'pdf' && "pktw-bg-[#c92a2a] pktw-border-[#ca1f1f] pktw-text-white pktw-shadow-[0_4px_12px_rgba(201,42,42,0.35)]",
									type === 'image' && "pktw-bg-[#ecfeff] pktw-border-[#67e8f9]",
									type === 'file' && "pktw-bg-secondary pktw-border-border",
									"hover:pktw-border-accent"
								)}
								onClick={async () => {
									if (isImage && file instanceof TFile) {
										const leaf = app.workspace.getLeaf(false);
										await leaf.openFile(file);
									} else {
										await app.workspace.openLinkText(attachmentPath, '', true);
									}
								}}
							>
								{isImage && file instanceof TFile ? (
									<img
										src={app.vault.getResourcePath(file)}
										alt={file.name}
										className="pktw-max-w-full pktw-max-h-20 pktw-rounded-lg pktw-object-contain"
									/>
								) : (
									<>
										<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1">
											{type === 'pdf' ? (
												<FileText 
													size={32} 
													strokeWidth={2}
													className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
												/>
											) : (
												<File 
													size={32} 
													strokeWidth={2}
													className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
												/>
											)}
										</div>
										<div className={cn(
											"pktw-text-[13px] pktw-text-foreground pktw-text-center pktw-overflow-hidden pktw-text-ellipsis pktw-whitespace-nowrap pktw-w-full",
											type === 'pdf' && "pktw-text-white"
										)} title={attachmentPath}>
											{fileName}
										</div>
									</>
								)}
							</div>
						);
					})}
				</div>
			</div>
		);
	}, [app]);


	return (
		<div
			className={cn(
				"pktw-flex pktw-w-full pktw-mb-4 pktw-px-4 pktw-box-border",
				message.role === 'user' && "pktw-justify-end pktw-bg-transparent",
				message.role === 'assistant' && "pktw-justify-start pktw-bg-transparent",
				message.role === 'system' && "pktw-justify-center"
			)}
			data-message-id={message.id}
			data-message-role={message.role}
		>
			<div
				className={cn(
					"pktw-max-w-[70%] pktw-relative pktw-flex pktw-flex-col pktw-gap-2",
					message.role === 'user' && "pktw-items-end",
					message.role === 'assistant' && "pktw-items-start"
				)}
				onContextMenu={handleContextMenu}
			>
				{message.attachments && message.attachments.length > 0 && renderAttachments(message.attachments)}
				
				<div 
					data-message-bubble
					className={cn(
						"pktw-whitespace-pre-wrap pktw-break-words pktw-leading-[1.6] pktw-text-[15px] pktw-px-4 pktw-py-3 pktw-rounded-[18px] pktw-shadow-sm pktw-box-border pktw-max-w-full pktw-transition-shadow pktw-duration-200 pktw-select-text pktw-cursor-text",
						message.role === 'user' && "pktw-bg-accent pktw-text-white pktw-rounded-br-[4px] pktw-shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:pktw-shadow-[0_2px_4px_rgba(0,0,0,0.12)]",
						message.role === 'assistant' && "pktw-bg-secondary pktw-text-foreground pktw-border pktw-border-border pktw-rounded-bl-[4px] hover:pktw-shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:pktw-border-[var(--background-modifier-border-hover)]"
					)}
				>
					{isStreaming ? streamingContent : message.content}
				</div>

				{!isStreaming && (
					<div className={cn(
						"pktw-flex pktw-gap-1 pktw-mt-0 pktw-mb-0 pktw-opacity-100 pktw-w-auto pktw-p-0 pktw-box-border",
						message.role === 'user' && "pktw-justify-end",
						message.role === 'assistant' && "pktw-justify-start"
					)}>
						<button
							className="pktw-bg-transparent pktw-border-0 pktw-shadow-none pktw-cursor-pointer pktw-text-[14px] pktw-text-muted-foreground pktw-p-0 pktw-rounded-none pktw-transition-all pktw-duration-200 pktw-flex pktw-items-center pktw-justify-center pktw-min-w-6 pktw-h-6 pktw-box-border pktw-outline-none pktw-leading-none hover:pktw-bg-accent hover:pktw-text-white focus-visible:pktw-outline-none focus-visible:pktw-shadow-none"
							aria-label={message.starred ? 'Unstar message' : 'Star message'}
							title={message.starred ? 'Unstar' : 'Star'}
							onClick={(e) => {
								e.stopPropagation();
								handleToggleStar(message.id, !message.starred);
							}}
						>
							{message.starred ? '★' : '☆'}
						</button>

						<CopyButton onCopy={handleCopy} />

						{message.role === 'assistant' && (
							<button
								className="pktw-bg-transparent pktw-border-0 pktw-shadow-none pktw-cursor-pointer pktw-text-[14px] pktw-text-muted-foreground pktw-p-0 pktw-rounded-none pktw-transition-all pktw-duration-200 pktw-flex pktw-items-center pktw-justify-center pktw-min-w-6 pktw-h-6 pktw-box-border pktw-outline-none pktw-leading-none hover:pktw-bg-accent hover:pktw-text-white focus-visible:pktw-outline-none focus-visible:pktw-shadow-none"
								aria-label="Regenerate response"
								title="Regenerate"
								onClick={async (e) => {
									e.stopPropagation();
									handleRegenerate(message.id);
								}}
							>
								<RefreshCw 
									size={14} 
									strokeWidth={2}
									className="pktw-flex-shrink-0 pktw-align-middle pktw-inline-block pktw-transition-colors pktw-duration-200"
								/>
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

