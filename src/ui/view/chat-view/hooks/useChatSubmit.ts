import { useCallback, useRef } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatViewStore } from '../store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { useStreamChat } from './useStreamChat';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';
import { MessageStatus } from '@/service/chat/types';
import { TopicAggregationService } from '@/service/chat/TopicAggregationService';
import { MESSAGE_TIMEOUT_MS } from '@/core/constant';
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';

/** Engagement window for `continuation` outcome events (PR-Chat-4 §11.4). */
const CONTINUATION_WINDOW_MS = 60_000;

export interface ChatSubmitOptions {
	text: string;
	files: File[];
	conversation: ChatConversation | null;
	project: ChatProject | null;
}

/**
 * Hook for handling chat message submission.
 * Handles conversation creation, file upload, and message streaming.
 */
export function useChatSubmit() {
	const { manager } = useServiceContext();
	const { streamChat, updateConv } = useStreamChat();
	const { addMessage: addMessageToStore, commitStreamingMessage } = useChatDataStore();

	// AbortController for canceling streaming
	const abortControllerRef = useRef<AbortController | null>(null);
	const topicServiceRef = useRef<TopicAggregationService | null>(null);

	/**
	 * Add message to both manager (backend) and messageStore (frontend state)
	 */
	const addMessageToBoth = useCallback(async (
		conversationId: string,
		message: ChatMessage,
		model: string,
		provider: string,
		usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
	) => {
		// Add to backend manager
		await manager.conv.addMessage({
			conversationId,
			message,
			model,
			provider,
			usage: {
				inputTokens: usage.inputTokens ?? -1,
				outputTokens: usage.outputTokens ?? -1,
				totalTokens: usage.totalTokens ?? -1,
			},
		});

		// Use commitStreamingMessage for atomic streaming→saved transition (no flash)
		commitStreamingMessage(message);
	}, [manager, commitStreamingMessage]);

	/**
	 * Ensure conversation exists, create if needed.
	 * Use primitive values as dependencies to avoid object reference issues.
	 * Get values directly from store (no subscription) since we use getState() inside callbacks.
	 */
	const activeConversationId = useChatDataStore.getState().activeConversation?.meta.id;
	const pendingConversationTitle = useChatViewStore.getState().pendingConversation?.title;
	const pendingProjectId = useChatViewStore.getState().pendingConversation?.project?.meta?.id;
	const initialModelId = useChatViewStore.getState().initialSelectedModel?.modelId;
	const initialProvider = useChatViewStore.getState().initialSelectedModel?.provider;
	
	const ensureConversation = useCallback(async (): Promise<ChatConversation | null> => {
		// Get latest values from store to avoid stale closure
		const latestActiveConversation = useChatDataStore.getState().activeConversation;
		const latestPendingConversation = useChatViewStore.getState().pendingConversation;
		const latestInitialSelectedModel = useChatViewStore.getState().initialSelectedModel;
		// Fallback chain: initialSelectedModel → UI selectedModel → mode-aware profile
		const latestSelectedModel = useChatViewStore.getState().selectedModel;
		const currentMode = useChatViewStore.getState().chatMode;
		const modeConfig = ProfileRegistry.getInstance().getConfigForMode(currentMode);
		const profileFallback = modeConfig ? { provider: modeConfig.profile.kind, modelId: modeConfig.modelId } : null;
		const modelForNewConversation = latestInitialSelectedModel ?? latestSelectedModel ?? profileFallback;

		let conversation = latestActiveConversation || null;
		if (!conversation && latestPendingConversation) {
			conversation = await manager.conv.createConversation({
				title: latestPendingConversation.title,
				project: latestPendingConversation.project?.meta ?? null,
				modelId: modelForNewConversation?.modelId,
				provider: modelForNewConversation?.provider,
				conversationType: latestPendingConversation.conversationType,
			});
			useChatViewStore.getState().setInitialSelectedModel(null);
			updateConv(conversation);
		}
		if (!conversation) {
			console.error('[useChatSubmit] Failed to create conversation');
		}
		return conversation;
	}, [activeConversationId, pendingConversationTitle, pendingProjectId, initialModelId, initialProvider]);


	/**
	 * Create temporary user message for immediate UI display.
	 * Note: manager is intentionally omitted from dependencies as it's a stable reference from context.
	 */
	const createUserMessage = useCallback((
		conversation: ChatConversation,
		content: string
	): ChatMessage => {
		const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
		const provider = conversation.meta.activeProvider || 'other';
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		return createChatMessage('user', content, modelId, provider, timezone);
	}, []);

	/**
	 * Cancel the current streaming operation.
	 * Saves any partial content that has been generated.
	 */
	const cancelStream = useCallback(async (): Promise<void> => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort('cancelled');
			abortControllerRef.current = null;
		}
	}, []);

	/**
	 * Submit a chat message and handle the complete flow.
	 * Tracks message lifecycle status: sending -> completed/error/timeout/cancelled.
	 */
	const submitMessage = useCallback(async (options: ChatSubmitOptions): Promise<void> => {
		const { text, files, conversation: inputConversation, project } = options;

		// Record input text in session history for Ctrl+Up/Down recall (#81)
		if (text.trim()) {
			useChatViewStore.getState().pushInputHistory(text);
		}

		// Ensure conversation exists
		const conversation = inputConversation || await ensureConversation();
		if (!conversation) {
			console.error('[useChatSubmit] Failed to ensure conversation');
			return;
		}
		// Create user message with sending status
		const userMessage = createUserMessage(conversation, text);
		userMessage.status = MessageStatus.SENDING;

		// PR-Chat-4 §11.4 — record a `continuation` outcome event if the user
		// sent this follow-up within 60s of the previous assistant completion.
		// Fire-and-forget; failure here MUST NOT block the send.
		const viewState = useChatViewStore.getState();
		const prevAssistantId = viewState.lastAssistantMessageId;
		const prevTs = viewState.lastAssistantCompletedAt;
		if (prevAssistantId && prevTs && Date.now() - prevTs < CONTINUATION_WINDOW_MS) {
			void UsageOutcomeService.getInstance()
				.recordContinuation(prevAssistantId, conversation.meta.id, userMessage.id)
				.catch((err) => {
					console.warn('[useChatSubmit] recordContinuation failed:', err);
				});
		}
		// Clear regardless so the same completion isn't double-counted for the
		// next message.
		viewState.clearAssistantCompletion();
		// Upload files and create resource references if any. no summary will be generated until start streaming.
		const resources = files.length > 0
			? await manager.conv.uploadFilesAndCreateResources(files)
			: [];
		// Add resources to user message if any
		if (resources.length > 0) {
			userMessage.resources = resources;
		}

		// Mark user message as completed once saved
		userMessage.status = MessageStatus.COMPLETED;
		await addMessageToBoth(
			conversation.meta.id,
			userMessage,
			userMessage.model,
			userMessage.provider,
			{ inputTokens: -1, outputTokens: -1, totalTokens: -1 }
		);
		// Show user message immediately in UI using tempConversation
		// We already have the userMessage object and know it's been saved, so we can construct
		// the conversation directly without reloading from storage (faster for better UX)
		// Resolve actual model for this message: store selection → chat profile → conversation meta
		const currentSelectedModel = useChatViewStore.getState().selectedModel;
		const currentChatConfig = ProfileRegistry.getInstance().getActiveChatConfig();
		const actualModel = currentSelectedModel?.modelId ?? currentChatConfig?.modelId ?? conversation.meta.activeModel;
		const actualProvider = currentSelectedModel?.provider ?? (currentChatConfig ? currentChatConfig.profile.kind : null) ?? conversation.meta.activeProvider;

		const conversationWithUserMessage: ChatConversation = {
			...conversation,
			messages: [...(conversation.messages || []), userMessage],
			meta: {
				...conversation.meta,
				activeModel: actualModel,
				activeProvider: actualProvider,
				updatedAtTimestamp: Date.now(),
			},
		};
		updateConv(conversationWithUserMessage);

		// Create new AbortController for this stream with timeout
		abortControllerRef.current = new AbortController();
		const timeoutId = setTimeout(() => {
			// If still streaming with no content after timeout, abort
			const state = useChatDataStore.getState();
			if (state.streamingMessageId && !state.streamingContent) {
				abortControllerRef.current?.abort('timeout');
			}
		}, MESSAGE_TIMEOUT_MS);

		// Capture start time for usage durationMs (§11.6).
		const streamStartMs = Date.now();

		// Stream chat (use conversationWithUserMessage which includes the user message)
		// Note: The userMessage already saved above includes resources, so we don't need to pass attachments
		// to streamChat since the resources are already in the conversation messages
		const streamResult = await streamChat({
			conversation: conversationWithUserMessage, // Use conversation with user message
			project: project,
			userContent: text,
			attachments: resources.map(resource => resource.source),
			abortSignal: abortControllerRef.current.signal,
		});
		clearTimeout(timeoutId);
		// Clear abort controller
		abortControllerRef.current = null;

		// Always save assistant message, even if streaming was interrupted
		// If streaming was interrupted, finalMessage might be null, but we should still
		// save any partial content from the streaming state
		if (streamResult.finalMessage) {
			// Determine assistant message status based on error/cancellation
			if (streamResult.finalMessage.isErrorMessage) {
				streamResult.finalMessage.status = MessageStatus.ERROR;
			} else {
				streamResult.finalMessage.status = MessageStatus.COMPLETED;
			}

			await addMessageToBoth(
				conversation.meta.id,
				streamResult.finalMessage,
				streamResult.finalMessage.model,
				streamResult.finalMessage.provider,
				streamResult.finalUsage ?? { inputTokens: -1, outputTokens: -1, totalTokens: -1 }
			);

			// PR-Chat-4 §11.6 — chat-side usage_log with the metadata contract.
			// Skipped silently when usage data is absent (error / cancel paths).
			try {
				const turnCount = (conversationWithUserMessage.messages?.length ?? 0) + 1;
				manager.emitChatUsage({
					usage: streamResult.finalUsage,
					startMs: streamStartMs,
					conversationId: conversation.meta.id,
					conversationTitle: conversation.meta.title ?? '',
					turnIndex: turnCount - 1,
					turnCount,
					messageId: streamResult.finalMessage.id,
					modelId: streamResult.finalMessage.model ?? actualModel ?? '',
					provider: streamResult.finalMessage.provider ?? actualProvider ?? '',
					promptText: text,
					responseText: String(streamResult.finalMessage.content ?? ''),
					attachedFiles: (userMessage.resources ?? []).map((r) => r.source),
					toolCalls: streamResult.finalMessage.toolCalls ?? [],
				});
			} catch (emitErr) {
				console.warn('[useChatSubmit] emitChatUsage failed:', emitErr);
			}

			// Update UI immediately with assistant message (don't reload from file to avoid timing issues)
			const conversationWithAssistantMessage: ChatConversation = {
				...conversationWithUserMessage,
				messages: [...(conversationWithUserMessage.messages || []), streamResult.finalMessage],
				meta: {
					...conversationWithUserMessage.meta,
					updatedAtTimestamp: Date.now(),
				},
			};
			updateConv(conversationWithAssistantMessage);

			// Background: auto-aggregate topics if enough ungrouped messages
			if (!topicServiceRef.current) {
				topicServiceRef.current = new TopicAggregationService(manager);
			}
			topicServiceRef.current.maybeAggregate(conversationWithAssistantMessage).then(updated => {
				if (updated) updateConv(updated);
			});
		} else {
			// No final message — clear streaming state as fallback
			useChatDataStore.getState().clearStreaming();
		}
		// Note: manager and updateConv are intentionally omitted from dependencies
		// manager is a stable reference from context, updateConv is from useStreamChat hook
	}, [ensureConversation, createUserMessage, streamChat]);

	return {
		submitMessage,
		cancelStream,
		ensureConversation,
		createTempUserMessage: createUserMessage,
	};
}

