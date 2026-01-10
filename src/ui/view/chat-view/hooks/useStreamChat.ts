import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { createChatErrorMessage } from '@/service/chat/utils/chat-message-builder';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { MessageStore } from '@/ui/view/chat-view/store/messageStore';

export interface StreamChatOptions {
	conversation: ChatConversation;
	project: ChatProject | null;
	userContent: string;
	attachments?: string[];
	onDelta?: (text: string) => void;
	onComplete?: (message: ChatMessage, usage?: LLMUsage) => void;
	onError?: (error: unknown) => void;
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
	// Always create a message if we don't have one or if onlyIfNoMessage is false
	if (!finalMessage || !onlyIfNoMessage) {
		finalMessage = createFinalAssistantMessage(
			conversation,
			manager,
			assistantMessageId
		);
	}

	messageStore.clearStreaming();
	messageStore.clearReasoning();
	messageStore.clearToolCalls();
	return { finalMessage, finalUsage };
}

/**
 * Create a final assistant message with all necessary fields from streaming state
 */
function createFinalAssistantMessage(
	conversation: ChatConversation,
	manager: AIServiceManager,
	messageId: string,
	additionalFields: Record<string, any> = {},
	error?: unknown
): ChatMessage {
	// Get all required data
	const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
	const provider = conversation.meta.activeProvider || manager.getSettings().defaultModel.provider;
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const streamingContent = useMessageStore.getState().streamingContent;
	const reasoningContent = useMessageStore.getState().reasoningContent;
	const currentToolCalls = useMessageStore.getState().currentToolCalls;

	// Merge streaming content with error message if error occurred
	let finalContent = streamingContent;
	let hasError = false;

	if (error) {
		hasError = true;
		const errorMessage = createChatErrorMessage(error, modelId, provider, timezone);
		finalContent = streamingContent
			? `${streamingContent}\n\n${errorMessage.content}`
			: errorMessage.content;
	}

	return {
		id: messageId,
		role: 'assistant',
		content: finalContent,
		createdAtTimestamp: Date.now(),
		createdAtZone: timezone,
		starred: false,
		model: modelId,
		provider,
		// Include reasoning and tool calls
		...(reasoningContent && {
			reasoning: { content: reasoningContent }
		}),
		...(currentToolCalls.length > 0 && {
			toolCalls: currentToolCalls.map(call => ({
				toolName: call.toolName,
				input: call.input,
				output: call.output,
				isActive: call.isActive
			}))
		}),
		...additionalFields,
	};
}

/**
 * Check if an event type is tool-related
 */
function isToolEvent(eventType: LLMStreamEvent['type']): boolean {
	return ['tool-call', 'tool-input-start', 'tool-input-delta', 'tool-result'].includes(eventType);
}

/**
 * Check if an event type is reasoning-related
 */
function isReasoningEvent(eventType: LLMStreamEvent['type']): boolean {
	return eventType === 'reasoning-delta';
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
				console.debug('[useStreamChat] Event:', event.type, event);
				// Check if aborted before processing event
				if (abortSignal?.aborted) {
					console.debug('[useStreamChat] Stream aborted by user');
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

				// Check if we need to end tool sequence (when receiving non-tool event while tool sequence is active)
				// This includes reasoning-delta, text-delta, and other non-tool events
				if (useMessageStore.getState().isToolSequenceActive && !isToolEvent(event.type)) {
					console.debug('[useStreamChat] Ending tool sequence due to non-tool event:', event.type);
					messageStore.endToolSequence();
				}

				// Check if we need to end reasoning (when receiving non-reasoning event while reasoning is active)
				// This includes tool events, text-delta, and other non-reasoning events
				if (useMessageStore.getState().isReasoningActive && !isReasoningEvent(event.type)) {
					console.debug('[useStreamChat] Ending reasoning due to non-reasoning event:', event.type);
					messageStore.completeReasoning();
				}

				// Handle different event types
				switch (event.type) {
					case 'text-delta':
						messageStore.appendStreamingDelta(event.text);
						onDelta?.(event.text);
						break;

					case 'reasoning-delta':
						// Start reasoning if not already active
						if (!useMessageStore.getState().isReasoningActive) {
							messageStore.startReasoning();
						}
						messageStore.appendReasoningDelta(event.text);
						break;

					case 'tool-call':
						messageStore.startToolCall(event.toolName, event.input);
						break;

					case 'tool-input-start':
						messageStore.startToolCall(event.toolName);
						break;

					case 'tool-input-delta':
						const currentToolName = useMessageStore.getState().currentToolName;
						if (currentToolName) {
							messageStore.updateToolCall(currentToolName, event.delta);
						}
						break;

					case 'tool-result':
						messageStore.completeToolCall(event.toolName, event.output);
						break;

					case 'complete':
						// End tool sequence if active
						if (useMessageStore.getState().isToolSequenceActive) {
							messageStore.endToolSequence();
						}

						// Complete reasoning if active
						if (useMessageStore.getState().isReasoningActive) {
							messageStore.completeReasoning();
						}

						// Construct final message from accumulated streaming content
						finalMessage = createFinalAssistantMessage(
							conversation,
							manager,
							assistantMessageId
						);
						messageStore.completeStreaming(finalMessage);

						if (event.usage) {
							finalUsage = event.usage;
						}
						onComplete?.(finalMessage!, finalUsage);
						break;
					case 'source':
					case 'on-step-finish':
					case 'error':
					case 'unSupported':
					default:
						console.debug('[useStreamChat] Unsupported chunk:');
						break;
				}
			}

			// Check if aborted after stream completes (in case abort happened during final processing)
			if (abortSignal?.aborted) {
				console.debug('[useStreamChat] Stream aborted after completion');
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
			finalMessage = createFinalAssistantMessage(
				conversation,
				manager,
				assistantMessageId,
				{ isErrorMessage: true },
				streamError
			);
		} finally {
			// Ensure all streaming states are cleared regardless of how the function exits
			// This handles cases where the stream ends unexpectedly without proper cleanup
			messageStore.clearStreaming();
			messageStore.clearReasoning();
			messageStore.clearToolCalls();
		}

		return { finalMessage, finalUsage };
	}, [manager, messageStore]);

	return {
		streamChat,
		updateConv,
	};
}

