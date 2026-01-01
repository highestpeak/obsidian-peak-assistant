import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useMessageStore } from '@/ui/store/messageStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { createChatErrorMessage } from '@/service/chat/utils/chat-message-builder';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';
import type { LLMUsage } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { MessageStore } from '@/ui/store/messageStore';

export interface StreamChatOptions {
	conversation: ChatConversation;
	project: ChatProject | null;
	userContent: string;
	attachments?: string[];
	onDelta?: (text: string) => void;
	onComplete?: (message: ChatMessage, usage?: LLMUsage) => void;
	onError?: (error: unknown) => void;
	onScrollToBottom?: () => void;
	abortSignal?: AbortSignal;
}

export interface StreamChatResult {
	finalMessage: ChatMessage | null;
	finalUsage: LLMUsage | undefined;
	userMessage?: ChatMessage; // User message with resources (from prepareChatRequest)
}

/**
 * Save partial streaming content and return result when stream is aborted.
 */
function handleAbortedStream(
	conversation: ChatConversation,
	manager: AIServiceManager,
	assistantMessageId: string,
	messageStore: MessageStore,
	finalMessage: ChatMessage | null,
	finalUsage: LLMUsage | undefined,
	onlyIfNoMessage: boolean = false
): StreamChatResult {
	const streamingContent = messageStore.streamingContent;

	// Check if we should create a message from partial content
	const shouldCreateMessage = streamingContent && streamingContent.trim() && (!onlyIfNoMessage || !finalMessage);

	if (shouldCreateMessage) {
		const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
		const provider = conversation.meta.activeProvider || manager.getSettings().defaultModel.provider;
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		finalMessage = {
			id: assistantMessageId,
			role: 'assistant',
			content: streamingContent,
			createdAtTimestamp: Date.now(),
			createdAtZone: timezone,
			starred: false,
			model: modelId,
			provider: provider,
		};
	}

	messageStore.clearStreaming();
	return { finalMessage, finalUsage };
}

/**
 * Hook for streaming chat messages and handling the complete flow.
 * Handles streaming, error handling, and state updates.
 */
export function useStreamChat() {
	const { manager, eventBus } = useServiceContext();
	const messageStore = useMessageStore();

	/**
	 * Update all stores with conversation.
	 */
	const updateConv = useCallback((conversation: ChatConversation) => {
		useChatViewStore.getState().setConversation(conversation);
		useProjectStore.getState().updateConversation(conversation);
		useProjectStore.getState().setActiveConversation(conversation);
		eventBus.dispatch(new ConversationUpdatedEvent({ conversation }));
	}, [eventBus]);

	/**
	 * Stream a chat message and handle the complete flow.
	 * Does NOT save the message - caller should call saveMessage separately.
	 */
	const streamChat = useCallback(async (options: StreamChatOptions): Promise<StreamChatResult> => {
		const {
			conversation,
			project,
			userContent,
			attachments,
			onDelta,
			onComplete,
			onError,
			onScrollToBottom,
			abortSignal,
		} = options;

		// Create assistant message ID for streaming
		const assistantMessageId = generateUuidWithoutHyphens();
		messageStore.startStreaming(assistantMessageId, 'assistant');

		let finalMessage: ChatMessage | null = null;
		let finalUsage: LLMUsage | undefined;

		try {
			// Start streaming
			const stream = manager.streamChat({
				conversation,
				project,
				userContent,
				attachments,
			});

			// Process stream events
			for await (const event of stream) {
				// Check if aborted before processing event
				if (abortSignal?.aborted) {
					console.log('[useStreamChat] Stream aborted by user');
					return handleAbortedStream(
						conversation,
						manager,
						assistantMessageId,
						messageStore,
						finalMessage,
						finalUsage,
						false
					);
				}

				if (event.type === 'delta') {
					messageStore.appendStreamingDelta(event.text);
					onDelta?.(event.text);
					onScrollToBottom?.();
				} else if (event.type === 'complete') {
					console.log('[useStreamChat] Streaming completed, final message:', event.message);
					if (event.message) {
						finalMessage = event.message;
						messageStore.completeStreaming(event.message);
					}
					if (event.usage) {
						finalUsage = event.usage;
					}
					onComplete?.(finalMessage!, finalUsage);
					onScrollToBottom?.();
				} else if (event.type === 'error') {
					console.error('[useStreamChat] Streaming error:', event.error);
					messageStore.clearStreaming();
					throw event.error;
				}
			}

			// Check if aborted after stream completes (in case abort happened during final processing)
			if (abortSignal?.aborted) {
				console.log('[useStreamChat] Stream aborted after completion');
				return handleAbortedStream(
					conversation,
					manager,
					assistantMessageId,
					messageStore,
					finalMessage,
					finalUsage,
					true // Only create message if finalMessage is null
				);
			}
		} catch (streamError) {
			console.error('[useStreamChat] Stream error:', streamError);

			// Get model/provider/timezone once (used in multiple places)
			const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
			const provider = conversation.meta.activeProvider || manager.getSettings().defaultModel.provider;
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

			// Try to save any partial content before clearing streaming state
			const streamingContent = messageStore.streamingContent;
			const streamingMessageId = messageStore.streamingMessageId;

			if (streamingMessageId && streamingContent && streamingContent.trim()) {
				console.log('[useStreamChat] Saving partial assistant message due to error/interruption');
				// Create a message from partial content
				finalMessage = {
					id: streamingMessageId,
					role: 'assistant',
					content: streamingContent,
					createdAtTimestamp: Date.now(),
					createdAtZone: timezone,
					starred: false,
					model: modelId,
					provider: provider,
					isErrorMessage: true,
				};
			}

			messageStore.clearStreaming();

			// Create error message and merge with partial content if exists
			const errorMessage = createChatErrorMessage(streamError, modelId, provider, timezone);
			if (!finalMessage) {
				finalMessage = errorMessage;
			} else {
				// Merge error message content into finalMessage
				finalMessage = {
					...finalMessage,
					content: `${finalMessage.content}\n\n${errorMessage.content}`,
					isErrorMessage: true,
				};
			}
		}

		return { finalMessage, finalUsage };
	}, [manager, messageStore]);

	return {
		streamChat,
		updateConv,
	};
}

