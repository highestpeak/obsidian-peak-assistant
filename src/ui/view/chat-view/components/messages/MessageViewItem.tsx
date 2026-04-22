import React, { useCallback, useState } from 'react';
import { Menu } from 'obsidian';
import { ChatMessage, ChatConversation } from '@/service/chat/types';
import { useChatViewStore } from '../../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useStreamChat } from '../../hooks/useStreamChat';
import { cn } from '@/ui/react/lib/utils';
import { COLLAPSED_USER_MESSAGE_CHAR_LIMIT } from '@/core/constant';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
	Message,
	MessageContent,
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from '@/ui/component/ai-elements';
import { Button } from '@/ui/component/shared-ui/button';
import { AnimatedSparkles } from '@/ui/component/mine';
import { StreamdownIsolated } from '@/ui/component/mine';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { MessageAttachmentsList } from './MessageAttachmentsList';
import { ToolCallsDisplay } from './ToolCallsDisplay';
import { MessageActionsList } from './MessageActionsList';

interface StreamingState {
	isStreaming: boolean;
	streamingContent: string;
	reasoningContent: string;
	isReasoningActive: boolean;
	currentToolCalls: Array<{
		toolName: string;
		input?: any;
		isActive?: boolean;
		output?: any;
	}>;
	isToolSequenceActive: boolean;
}

export interface MessageItemProps {
	message: ChatMessage;
	streamingState?: StreamingState;
	isLastMessage?: boolean;
}

/**
 * Component for rendering a single message
 */
export const MessageItem: React.FC<MessageItemProps> = ({
	message,
	streamingState = {
		isStreaming: false,
		streamingContent: '',
		reasoningContent: '',
		isReasoningActive: false,
		currentToolCalls: [],
		isToolSequenceActive: false,
	},
	isLastMessage = false,
}) => {
	const { manager, app, eventBus } = useServiceContext();

	const activeConversation = useChatDataStore((state) => state.activeConversation);
	const activeProject = useChatDataStore((state) => state.activeProject);

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
		useChatDataStore.getState().updateConversation(updatedConv);
		useChatDataStore.getState().setActiveConversation(updatedConv);
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
	}, [activeConversation, activeProject, isLastMessage, streamChat, manager, updateConv]);

	const [copied, setCopied] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	// Determine if this is a user message or assistant message
	const isUser = message.role === 'user'; // 'user' = user message, 'assistant' = AI message

	// Get display content: if streaming, use streamingContent; otherwise use message.content
	// Streaming logic: when AI is generating, isStreaming=true and streamingContent contains partial content
	const displayContent = message.content;

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

	// Character limit for collapsed user messages (only for user messages, not streaming)
	const contentLength = String(displayContent || '').length;
	const shouldShowExpand = isUser && !streamingState.isStreaming && contentLength > COLLAPSED_USER_MESSAGE_CHAR_LIMIT;
	const displayText = shouldShowExpand && !isExpanded
		? String(displayContent).slice(0, COLLAPSED_USER_MESSAGE_CHAR_LIMIT) + '...'
		: String(displayContent);

	// should show loader
	const shouldShowLoader = streamingState.isStreaming && !displayContent && !streamingState.isReasoningActive && !streamingState.isToolSequenceActive;

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

				<MessageContent
					className={cn(
						isUser && "pktw-rounded-lg pktw-bg-secondary pktw-px-4 pktw-py-4 pktw-w-full"
					)}
				>
					{/* Streaming started but no content yet - show loading spinner */}
					{shouldShowLoader ? (
						<div className="pktw-flex pktw-items-center pktw-justify-start pktw-py-2">
							<div className="pktw-scale-50 pktw-origin-left">
								<AnimatedSparkles isAnimating={true} />
							</div>
						</div>
					) : null}

					{/* Render reasoning content for assistant messages */}
					{!isUser && streamingState.reasoningContent && (
						<Reasoning isStreaming={streamingState.isReasoningActive} className="pktw-w-full pktw-mb-0">
							<ReasoningTrigger/>
							<ReasoningContent>
								{streamingState.reasoningContent}
							</ReasoningContent>
						</Reasoning>
					)}

					{/* Render tool calls for assistant messages */}
					{!isUser && streamingState.currentToolCalls.length > 0 && (
						<ToolCallsDisplay expanded={streamingState.isToolSequenceActive} toolCalls={streamingState.currentToolCalls.map(call => ({
							toolName: call.toolName,
							input: call.input,
							output: call.output,
							isActive: call.isActive ?? false,
						}))} />
					)}

					{/* Render message content */}
					{(!shouldShowLoader && displayContent) ? (
						/* Has content (either streaming or complete) - render content */
						<div className="pktw-relative">
							{
								isUser ? (
									<div className="pktw-select-text">
										{displayText}
									</div>
								) : (
									<StreamdownIsolated
										className="pktw-select-text"
										isAnimating={streamingState.isStreaming}
									>
										{displayText}
									</StreamdownIsolated>
								)
							}
							{/* Show expand/collapse button for long user messages (not streaming, not AI) */}
							{shouldShowExpand && (
								<Button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setIsExpanded(!isExpanded);
									}}
									className={cn(
										"pktw-mt-2 pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs",
										"pktw-transition-colors pktw-cursor-pointer"
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
								</Button>
							)}
						</div>
					) : null}
				</MessageContent>

				{/* Render actions */}
				<MessageActionsList
					message={message}
					isLastMessage={isLastMessage}
					isStreaming={streamingState.isStreaming}
					copied={copied}
					onToggleStar={handleToggleStar}
					onCopy={handleCopy}
					onRegenerate={handleRegenerate}
				/>
			</Message>
		</div>
	);
};
