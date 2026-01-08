import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Menu, TFile, App } from 'obsidian';
import { ChatMessage, ChatConversation, ChatProject } from '@/service/chat/types';
import { useChatViewStore } from '../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { useStreamChat } from '../hooks/useStreamChat';
import { cn } from '@/ui/react/lib/utils';
import { COLLAPSED_USER_MESSAGE_CHAR_LIMIT } from '@/core/constant';
import { Copy, RefreshCw, Star, Loader2, Check, ChevronDown, ChevronUp, FileText } from 'lucide-react';
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
import { ResourcePreviewHover } from '@/ui/component/mine/resource-preview-hover';
import { Streamdown } from 'streamdown';
import type { FileUIPart } from 'ai';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { formatTimestampLocale } from '@/ui/view/shared/date-utils';
import { isUrl, getExtensionFromSource, getImageMimeType, isImageExtension } from '@/core/document/helper/FileTypeUtils';
import { ChatResourceRef } from '@/service/chat/types';
import { ResourceKind } from '@/core/document/types';
import { openFile } from '@/core/utils/obsidian-utils';
import { SafeModelIcon, SafeProviderIcon } from '@/ui/component/mine/SafeIconWrapper';
import { ProviderServiceFactory } from '@/core/providers/base/factory';

/**
 * UI representation of a resource attachment
 */
interface ResourceUIAttachment extends FileUIPart {
	resource: ChatResourceRef;
	fileType: ResourceKind;
}

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

		return message.resources.map((resource) => {
			const source = resource.source;
			const extension = getExtensionFromSource(source);

			let mediaType: string;
			if (resource.kind === 'image') {
				mediaType = getImageMimeType(extension);
			} else if (resource.kind === 'pdf') {
				mediaType = 'application/pdf';
			} else {
				mediaType = 'application/octet-stream';
			}

			return {
				type: 'file' as const,
				url: source,
				filename: source.split('/').pop() || source,
				mediaType: mediaType,
				resource: resource,
				fileType: resource.kind,
			};
		});
	}, [message.resources, app]);

	/**
	 * Handle opening a resource based on its type
	 */
	const handleOpenResource = useCallback(async (attachment: ResourceUIAttachment) => {
		const url = attachment.url;
		if (!url) return;

		// Handle URL resources - open in new tab
		if (isUrl(url)) {
			window.open(url, '_blank', 'noopener,noreferrer');
			return;
		}

		// Handle file resources
		await openFile(app, url);
	}, [app]);

	if (fileAttachments.length === 0) {
		return null;
	}

	/**
	 * Render a single attachment with preview hover
	 */
	const renderAttachment = (attachment: ResourceUIAttachment, index: number, isImage: boolean) => {
		const isPdf = attachment.fileType === 'pdf';
		
		const handleClick = async (e: React.MouseEvent) => {
			e.stopPropagation();
			await handleOpenResource(attachment);
		};

		const wrappedContent = (
			<ResourcePreviewHover
				resource={attachment.resource}
				app={app}
				previewClassName="pktw-z-[100]"
			>
				<div 
					className={cn(
						"pktw-cursor-pointer pktw-transition-opacity hover:pktw-opacity-90",
						isPdf || !isImage ? "pktw-w-full" : "pktw-flex-shrink-0"
					)}
					onClick={handleClick}
				>
					{isPdf ? (
						<div className="pktw-flex pktw-flex-row pktw-w-full pktw-shrink-0 pktw-items-center pktw-rounded-lg pktw-border-1 pktw-border-solid pktw-border-gray-200 dark:pktw-border-gray-600 pktw-bg-white pktw-px-3 pktw-py-3 pktw-gap-3 pktw-min-h-[48px]">
							<div className="pktw-flex-shrink-0 pktw-w-8 pktw-h-8 pktw-bg-red-500 pktw-rounded pktw-flex pktw-items-center pktw-justify-center">
								<FileText className="pktw-size-4 pktw-text-white" />
							</div>
							<div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
								<span className="pktw-text-sm pktw-font-medium pktw-text-gray-900 pktw-truncate">
									{attachment.filename}
								</span>
								<span className="pktw-text-xs pktw-text-gray-500 pktw-uppercase pktw-font-medium">
									PDF
								</span>
							</div>
						</div>
					) : (
						<MessageAttachment data={attachment} onClick={handleClick} />
					)}
				</div>
			</ResourcePreviewHover>
		);

		// Only wrap with TooltipProvider for non-PDF files
		if (isPdf) {
			return <React.Fragment key={`attachment-${index}`}>{wrappedContent}</React.Fragment>;
		}

		return (
			<TooltipProvider key={`attachment-${index}`}>
				{wrappedContent}
			</TooltipProvider>
		);
	};

	// Group attachments by type for layout
	const imageAttachments = fileAttachments.filter(att => att.fileType === 'image');
	const otherAttachments = fileAttachments.filter(att => att.fileType !== 'image');

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
			{/* Images: horizontal layout with wrapping */}
			{imageAttachments.length > 0 && (
				<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
					{imageAttachments.map((attachment, index) => renderAttachment(attachment, index, true))}
				</div>
			)}
			{/* Other attachments (PDFs, etc.): vertical layout, full width */}
			{otherAttachments.length > 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
					{otherAttachments.map((attachment, index) => renderAttachment(attachment, index, false))}
				</div>
			)}
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
	const [isHovered, setIsHovered] = useState(false);

	if (isStreaming) {
		return null;
	}

	const showTime = message.role === 'assistant' && isHovered;

	return (
		<div
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="pktw-flex pktw-items-center pktw-gap-1"
		>
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
						message.starred && 'pktw-fill-red-500 pktw-text-red-500'
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
				<>
					<ModelIconButton message={message} />
					<TokenCountButton message={message} />
				</>
			)}

			</MessageActions>
			{showTime && <TimeDisplay message={message} />}
		</div>
	);
};

/**
 * Component for displaying model/provider icon with tooltip
 */
const ModelIconButton: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const { manager } = useServiceContext();
	const [copied, setCopied] = useState(false);
	const [modelIcon, setModelIcon] = useState<string | null>(null);
	const [providerIcon, setProviderIcon] = useState<string | null>(null);

	const modelInfo = useMemo(() => {
		if (!message.model) return null;
		return `${message.provider || ''}/${message.model}`.replace(/^\//, '');
	}, [message.model, message.provider]);

	// Get provider and model icons
	useEffect(() => {
		if (!message.provider || !message.model || !manager) {
			setModelIcon(null);
			setProviderIcon(null);
			return;
		}

		const loadIcons = async () => {
			try {
				// Get provider metadata
				const providerMetadata = ProviderServiceFactory.getInstance().getAllProviderMetadata();
				const providerMeta = providerMetadata.find(m => m.id === message.provider);
				if (providerMeta?.icon) {
					setProviderIcon(providerMeta.icon);
				}

				// Get model metadata
				const allModels = await manager.getAllAvailableModels();
				const modelInfo = allModels.find(
					m => m.id === message.model && m.provider === message.provider
				);
				if (modelInfo?.icon) {
					setModelIcon(modelInfo.icon);
				}
			} catch (err) {
				console.error('Failed to load model/provider icons:', err);
			}
		};

		loadIcons();
	}, [message.provider, message.model, manager]);

	if (!modelInfo) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(modelInfo);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy model info:', err);
		}
	}, [modelInfo]);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						className="pktw-h-6 pktw-w-6 pktw-p-0 pktw-cursor-pointer"
						onClick={handleCopy}
					>
						{modelIcon ? (
							<SafeModelIcon
								model={modelIcon}
								size={16}
								className="pktw-flex-shrink-0"
								fallback={
									providerIcon ? (
										<SafeProviderIcon
											provider={providerIcon}
											size={16}
											className="pktw-flex-shrink-0"
											fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />}
										/>
									) : (
										<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />
									)
								}
							/>
						) : providerIcon ? (
							<SafeProviderIcon
								provider={providerIcon}
								size={16}
								className="pktw-flex-shrink-0"
								fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />}
							/>
						) : (
							<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />
						)}
						<span className="pktw-sr-only">Model: {modelInfo}</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent
					className="pktw-select-text"
					side="top"
					align="start"
					sideOffset={4}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<p className="pktw-select-text">{copied ? 'Copied!' : modelInfo}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

/**
 * Component for displaying token count
 */
const TokenCountButton: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const [copied, setCopied] = useState(false);
	const tokenCount = useMemo(() => {
		if (!message.tokenUsage) return null;
		const usage = message.tokenUsage as any;
		return usage.totalTokens ?? usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
	}, [message.tokenUsage]);

	if (tokenCount === null) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(`${tokenCount} tokens`);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy token count:', err);
		}
	}, [tokenCount]);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			className="pktw-h-auto pktw-w-auto pktw-px-1.5 pktw-cursor-pointer"
			onClick={handleCopy}
		>
			<span className="pktw-text-xs">
				{tokenCount} tokens{copied ? ' copied!' : ''}
			</span>
			<span className="pktw-sr-only">Token count: {tokenCount}</span>
		</Button>
	);
};

/**
 * Component for displaying time (shown on hover of MessageActions)
 */
const TimeDisplay: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const [copied, setCopied] = useState(false);
	const timeInfo = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		// Use user's local timezone instead of message's timezone
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const date = formatTimestampLocale(message.createdAtTimestamp, userTimezone);
		return date ? `${date} (${userTimezone})` : null;
	}, [message.createdAtTimestamp]);

	if (!timeInfo) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(timeInfo);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy time info:', err);
		}
	}, [timeInfo]);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			className="pktw-h-auto pktw-w-auto pktw-px-1.5 pktw-cursor-pointer"
			onClick={handleCopy}
		>
			<span className="pktw-text-xs">
				{copied ? `${timeInfo} copied!` : timeInfo}
			</span>
			<span className="pktw-sr-only">Time: {timeInfo}</span>
		</Button>
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
	const isUser = message.role === 'user'; // 'user' = user message, 'assistant' = AI message

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

