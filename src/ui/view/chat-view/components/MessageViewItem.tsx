import React, { useCallback, useMemo, useState } from 'react';
import { Menu, TFile, App } from 'obsidian';
import { ChatMessage, ChatConversation, ChatProject } from '@/service/chat/types';
import { useChatViewStore } from '../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { useStreamChat } from '../hooks/useStreamChat';
import { cn } from '@/ui/react/lib/utils';
import { COLLAPSED_USER_MESSAGE_CHAR_LIMIT } from '@/core/constant';
import { Copy, RefreshCw, Star, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useMessageStore } from '@/ui/store/messageStore';
import { StreamingStepsView } from './StreamingStepsView';
import {
	Message,
	MessageContent,
	MessageActions,
	MessageAction,
	MessageAttachment,
} from '@/ui/component/ai-elements';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { Button } from '@/ui/component/shared-ui/button';
import { FilePreviewHover } from '@/ui/component/mine/file-preview-hover';
import { Streamdown } from 'streamdown';
import type { FileUIPart } from 'ai';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { formatTimestampLocale } from '@/ui/view/shared/date-utils';

/**
 * Component for rendering message attachments
 */
const MessageAttachmentsList: React.FC<{
	message: ChatMessage;
	app: App;
}> = ({ message, app }) => {
	const fileAttachments = useMemo(() => {
		if (!message.resources || message.resources.length === 0) {
			return [];
		}

		const fileParts: Array<FileUIPart & { _originalPath?: string; _fileType?: 'image' | 'markdown' | 'file' }> = [];

		// Process resources
		message.resources.forEach((resource) => {
			const normalizedPath = resource.source.startsWith('/') ? resource.source.slice(1) : resource.source;
			const file = app.vault.getAbstractFileByPath(normalizedPath);
			const fileName = resource.source.split('/').pop() || resource.source;

			if (file instanceof TFile) {
				const resourcePath = app.vault.getResourcePath(file);
				const isImage = file.extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(file.extension.toLowerCase());
				const isMarkdown = file.extension === 'md';

				fileParts.push({
					type: 'file',
					url: resourcePath,
					filename: fileName,
					mediaType: isImage ? `image/${file.extension}` : 'application/octet-stream',
					_originalPath: normalizedPath,
					_fileType: isImage ? 'image' : isMarkdown ? 'markdown' : 'file',
				});
			}
		});

		return fileParts;
	}, [message.resources, app]);

	if (fileAttachments.length === 0) {
		return null;
	}

	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
			{fileAttachments.map((attachment, index) => {
				const originalPath = (attachment as any)._originalPath;
				const fileType = (attachment as any)._fileType;

				const attachmentElement = (
					<div className="pktw-cursor-pointer pktw-transition-opacity hover:pktw-opacity-90 pktw-flex-shrink-0">
						<MessageAttachment
							data={attachment}
							onClick={async (e) => {
								e.stopPropagation();
								if (!originalPath) return;
								const file = app.vault.getAbstractFileByPath(originalPath);
								if (file instanceof TFile) {
									const leaf = app.workspace.getLeaf(false);
									await leaf.openFile(file);
								}
							}}
						/>
					</div>
				);

				// Use FilePreviewHover for images and markdown files
				if (fileType === 'image' || fileType === 'markdown') {
					return (
						<FilePreviewHover
							key={index}
							filePath={originalPath}
							fileType={fileType}
							app={app}
							previewClassName="pktw-z-[100]"
						>
							{attachmentElement}
						</FilePreviewHover>
					);
				}

				// For other files, return without preview
				return (
					<React.Fragment key={index}>
						{attachmentElement}
					</React.Fragment>
				);
			})}
		</div>
	);
};

/**
 * Component for rendering message action buttons
 */
const MessageActionsList: React.FC<{
	message: ChatMessage;
	isLastMessage: boolean;
	isStreaming: boolean;
	copied: boolean;
	onToggleStar: (messageId: string, starred: boolean) => void;
	onCopy: () => void;
	onRegenerate: (messageId: string) => void;
}> = ({ message, isLastMessage, isStreaming, copied, onToggleStar, onCopy, onRegenerate }) => {
	if (isStreaming) {
		return null;
	}

	return (
		<MessageActions>
			<MessageAction
				tooltip={message.starred ? 'Unstar message' : 'Star message'}
				label={message.starred ? 'Unstar message' : 'Star message'}
				onClick={(e) => {
					e.stopPropagation();
					onToggleStar(message.id, !message.starred);
				}}
			>
				<Star
					size={12}
					strokeWidth={2}
					className={cn(
						message.starred && 'pktw-fill-current'
					)}
				/>
			</MessageAction>

			<MessageAction
				tooltip={copied ? 'Copied!' : 'Copy message'}
				label="Copy message"
				onClick={(e) => {
					e.stopPropagation();
					onCopy();
				}}
			>
				{copied ? (
					<Check size={12} strokeWidth={copied ? 3 : 2} />
				) : (
					<Copy size={12} strokeWidth={2} />
				)}
			</MessageAction>

			{message.role === 'assistant' && isLastMessage && (
				<MessageAction
					tooltip="Regenerate response"
					label="Regenerate response"
					onClick={async (e) => {
						e.stopPropagation();
						onRegenerate(message.id);
					}}
				>
					<RefreshCw size={12} strokeWidth={2} />
				</MessageAction>
			)}

			{message.role === 'assistant' && (
				<MessageMetadataButton message={message} />
			)}
		</MessageActions>
	);
};

/**
 * Component for displaying message metadata as a button in action area
 */
const MessageMetadataButton: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const [copied, setCopied] = useState(false);
	const { tokenCount, modelInfo, formatDate, timezone, hasMetadata } = useMemo(() => {
		const totalTokens = message.tokenUsage
			? (() => {
				const usage = message.tokenUsage as any;
				return usage.totalTokens ?? usage.total_tokens ??
					((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
			})()
			: null;

		const model = message.model ? `${message.provider || ''}/${message.model}`.replace(/^\//, '') : null;

		const date = message.createdAtTimestamp
			? formatTimestampLocale(message.createdAtTimestamp, message.createdAtZone)
			: null;

		const tz = message.createdAtZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

		const hasMeta = totalTokens !== null || model || date;

		return {
			tokenCount: totalTokens,
			modelInfo: model,
			formatDate: date,
			timezone: tz,
			hasMetadata: hasMeta,
		};
	}, [message.tokenUsage, message.model, message.provider, message.createdAtTimestamp, message.createdAtZone]);

	if (!hasMetadata) return null;

	const tooltipContent = (() => {
		const lines: string[] = [];
		if (modelInfo && tokenCount !== null) {
			lines.push(`${modelInfo} ${tokenCount} tokens`);
		} else if (modelInfo) {
			lines.push(modelInfo);
		} else if (tokenCount !== null) {
			lines.push(`${tokenCount} tokens`);
		}
		if (formatDate) {
			lines.push(formatDate + (timezone ? ` (${timezone})` : ''));
		} else if (timezone) {
			lines.push(`(${timezone})`);
		}
		return lines.join('\n');
	})();

	const handleCopyTooltip = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(tooltipContent);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy tooltip content:', err);
		}
	}, [tooltipContent]);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						className="pktw-h-auto pktw-w-auto pktw-px-1.5 pktw-cursor-pointer"
						onClick={handleCopyTooltip}
					>
						<span className="pktw-text-xs">
							{tokenCount !== null ? `${tokenCount} tokens${copied ? ' copied!' : ''}` : ''}
						</span>
						<span className="pktw-sr-only">Message metadata</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent 
					className="pktw-whitespace-pre-line pktw-select-text"
					side="top"
					align="start"
					sideOffset={4}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<p className="pktw-select-text">{tooltipContent}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

/**
 * Component for displaying message metadata (time, timezone, tokens, model)
 * @deprecated This component is no longer used. Metadata is now shown as a button in the action area.
 */
const MessageMetadata: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const formatDate = useMemo(() => {
		if (!message.createdAtTimestamp) return '';
		const date = new Date(message.createdAtTimestamp);
		return date.toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: message.createdAtZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
		});
	}, [message.createdAtTimestamp, message.createdAtZone]);

	const timezone = message.createdAtZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

	const totalTokens = message.tokenUsage
		? (() => {
			const usage = message.tokenUsage as any;
			return usage.totalTokens ?? usage.total_tokens ??
				((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
		})()
		: null;

	const modelInfo = message.model ? `${message.provider || ''}/${message.model}`.replace(/^\//, '') : null;

	const hasFirstLine = modelInfo || totalTokens !== null;
	const hasSecondLine = formatDate || timezone;

	if (!hasFirstLine && !hasSecondLine) return null;

	return (
		<div className="pktw-mt-2 pktw-text-xs pktw-text-muted-foreground pktw-flex pktw-flex-col pktw-gap-1 pktw-select-text">
			{/* First line: model and token */}
			{hasFirstLine && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
					{modelInfo && (
						<span className="pktw-whitespace-nowrap">{modelInfo}</span>
					)}
					{totalTokens !== null && (
						<span className="pktw-whitespace-nowrap">{totalTokens} tokens</span>
					)}
				</div>
			)}
			{/* Second line: date and timezone */}
			{hasSecondLine && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
					{formatDate && (
						<span className="pktw-whitespace-nowrap">{formatDate}</span>
					)}
					{timezone && (
						<span className="pktw-whitespace-nowrap">({timezone})</span>
					)}
				</div>
			)}
		</div>
	);
};

interface MessageItemProps {
	message: ChatMessage;
	activeConversation: ChatConversation | null;
	activeProject: ChatProject | null;
	isStreaming?: boolean;
	streamingContent?: string;
	isLastMessage?: boolean;
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
	isLastMessage = false,
	onScrollToBottom,
}) => {
	const { manager, app, eventBus } = useServiceContext();

	const handleToggleStar = useCallback(async (messageId: string, starred: boolean) => {
		console.debug('[MessageItem] Toggling star for message:', { messageId, starred });
		if (!activeConversation) return;
		await manager.toggleStar({
			messageId,
			conversationId: activeConversation.meta.id,
			starred,
		});
		// Update conversation state locally
		const updatedMessages = activeConversation.messages.map(msg =>
			msg.id === messageId ? { ...msg, starred } : msg
		);
		const updatedConv = {
			...activeConversation,
			messages: updatedMessages,
		};
		useChatViewStore.getState().setConversation(updatedConv);
		useProjectStore.getState().updateConversation(updatedConv);
		useProjectStore.getState().setActiveConversation(updatedConv);
		// Dispatch event to notify other components
		eventBus.dispatch(new ConversationUpdatedEvent({ conversation: updatedConv }));
	}, [activeConversation, manager, eventBus]);

	const { streamChat, updateConv } = useStreamChat();

	const handleRegenerate = useCallback(async (messageId: string) => {
		if (!activeConversation) return;
		if (!isLastMessage) return; // Only allow regenerating the last message

		// Find the assistant message
		const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
		if (messageIndex === -1) return;
		const assistantMessage = activeConversation.messages[messageIndex];
		if (assistantMessage.role !== 'assistant') return;

		// Find the user message before the assistant message
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
			// Create a conversation context up to the user message (for LLM request)
			const conversationContext: ChatConversation = {
				...activeConversation,
				messages: activeConversation.messages.slice(0, userMessageIndex + 1),
			};

			// Stream chat to generate new assistant message
			const streamResult = await streamChat({
				conversation: conversationContext,
				project: activeProject,
				userContent: userMessage.content,
				onScrollToBottom,
			});

			// Replace the assistant message with the new one
			if (streamResult.finalMessage) {
				// Remove old message and add new one
				// First, create a conversation with messages up to and including the user message
				const conversationWithoutOldMessage: ChatConversation = {
					...activeConversation,
					messages: activeConversation.messages.slice(0, messageIndex),
				};

				// Add the new message using addMessage (this will update storage properly)
				await manager.addMessage({
					conversationId: conversationWithoutOldMessage.meta.id,
					message: streamResult.finalMessage,
					model: streamResult.finalMessage.model,
					provider: streamResult.finalMessage.provider,
					usage: streamResult.finalUsage ?? { inputTokens: -1, outputTokens: -1, totalTokens: -1 },
				});
			}
		} catch (error) {
			console.error('Failed to regenerate message:', error);
			// Error handling is done inside streamChat hook
		}
	}, [activeConversation, activeProject, isLastMessage, streamChat, manager, updateConv, onScrollToBottom]);

	const [copied, setCopied] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	// Determine if this is a user message or assistant message
	const isUser = message.role === 'user'; // 'user' = 用户消息, 'assistant' = AI消息

	// Get streaming steps if this is the streaming message
	const streamingSteps = useMessageStore((state) => 
		state.streamingMessageId === message.id ? state.streamingSteps : []
	);

	// Get display content: if streaming, use streamingContent; otherwise use message.content
	// Streaming logic: when AI is generating, isStreaming=true and streamingContent contains partial content
	const displayContent = isStreaming ? (streamingContent || '') : message.content;

	// Character limit for collapsed user messages (only for user messages, not streaming)
	const contentLength = String(displayContent || '').length;
	const shouldShowExpand = isUser && !isStreaming && contentLength > COLLAPSED_USER_MESSAGE_CHAR_LIMIT;
	const displayText = shouldShowExpand && !isExpanded
		? String(displayContent).slice(0, COLLAPSED_USER_MESSAGE_CHAR_LIMIT) + '...'
		: String(displayContent);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(message.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
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

		// Regenerate (only for last assistant message)
		if (message.role === 'assistant' && isLastMessage) {
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
	}, [message, handleCopy, handleToggleStar, handleRegenerate, isLastMessage]);

	return (
		<div
			className={cn(
				"pktw-mb-4 pktw-px-4 pktw-flex pktw-w-full",
				isUser ? "pktw-justify-end" : "pktw-justify-start"
			)}
			data-message-id={message.id}
			data-message-role={message.role}
			onContextMenu={handleContextMenu}
		>
			<Message from={message.role} className="pktw-max-w-[85%]">
				{/* Render attachments if any - images should appear above text bubble */}
				{message.resources && message.resources.length > 0 && (
					<div className="pktw-mb-2 pktw-w-full pktw-max-w-full pktw-min-w-0 pktw-overflow-hidden">
						<MessageAttachmentsList message={message} app={app} />
					</div>
				)}

				{/* Chain of Thought: Show streaming steps for assistant messages */}
				{!isUser && <StreamingStepsView steps={streamingSteps} />}
				
				<MessageContent
					className={cn(
						isUser && "pktw-rounded-lg pktw-bg-secondary pktw-px-4 pktw-py-4 pktw-w-full"
					)}
				>
					{/* Render message content */}
					{/* Case 1: Streaming started but no content yet - show loading spinner */}
					{isStreaming && !streamingContent ? (
						<div className="pktw-flex pktw-items-center pktw-justify-start pktw-py-2">
							<Loader2 className="pktw-size-4 pktw-animate-spin pktw-text-muted-foreground" />
						</div>
					) : displayContent ? (
						/* Case 2: Has content (either streaming or complete) - render content */
						<div className="pktw-relative">
							{
								isUser ? (
									<div className="pktw-select-text">
										{displayText}
									</div>
								) : (
									<div
										className="pktw-select-text"
										data-streamdown-root
									>
										{/* Streamdown component handles animated rendering of streaming text */}
										{/* isAnimating=true when streaming, false when complete */}
										<Streamdown isAnimating={isStreaming}>{displayText}</Streamdown>
									</div>
								)
							}
							{/* Case 3: Show expand/collapse button for long user messages (not streaming, not AI) */}
							{shouldShowExpand && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setIsExpanded(!isExpanded);
									}}
									className={cn(
										"pktw-mt-2 pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-text-muted-foreground",
										"hover:pktw-text-foreground pktw-transition-colors pktw-cursor-pointer"
									)}
								>
									{isExpanded ? (
										<>
											<ChevronUp className="pktw-w-3 pktw-h-3" />
											<span>Show less</span>
										</>
									) : (
										<>
											<ChevronDown className="pktw-w-3 pktw-h-3" />
											<span>Expand</span>
										</>
									)}
								</button>
							)}
						</div>
					) : null}
				</MessageContent>

				{/* Render actions */}
				<MessageActionsList
					message={message}
					isLastMessage={isLastMessage}
					isStreaming={isStreaming}
					copied={copied}
					onToggleStar={handleToggleStar}
					onCopy={handleCopy}
					onRegenerate={handleRegenerate}
				/>
			</Message>
		</div>
	);
};

