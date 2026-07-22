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
import { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import {
	emptySourceScope,
	type ExplicitContextRef,
	type TurnExecutionReceipt,
	type TurnSourceScope,
} from '@/core/types/chat-studio';

/** Engagement window for `continuation` outcome events (PR-Chat-4 §11.4). */
const CONTINUATION_WINDOW_MS = 60_000;

export interface ChatSubmitOptions {
	text: string;
	files: File[];
	conversation: ChatConversation | null;
	project: ChatProject | null;
	/** Explicit context refs from the draft shelf ([[docs]], links). */
	explicitRefs?: ExplicitContextRef[];
	/** Targeted follow-up parent (chat-studio §7.8). */
	replyToMessageId?: string;
	/** Edit-and-resend revision source (§7.7). */
	revisionOfMessageId?: string;
	/** Workflow chip active for this turn (e.g. 'plan'). */
	workflowId?: string;
	/** Requested source scope snapshot for the turn receipt (RUN-02). */
	requestedSources?: TurnSourceScope;
}

/**
 * Hook for handling chat message submission.
 * Handles conversation creation, file upload, and message streaming.
 */
export function useChatSubmit() {
	const { manager, usageServices } = useServiceContext();
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
		// Fallback chain: initialSelectedModel → UI selectedModel → default
		// assistant profile.
		//
		// 2026-07 F.B: mode routing retired. The AI does not have a
		// Chat/Agent/Plan concept — every submission resolves to the single
		// default assistant profile. "Planning" or "chat-only" UX is a
		// prompt-level concern layered on top of the same profile, not a
		// separate routing branch. `getConfigForMode()` still exists on
		// ProfileRegistry for history-restore reasons, but we no longer call
		// it here; using `getActiveAgentConfig()` directly makes the intent
		// explicit and stops future readers from thinking mode influences
		// profile selection.
		const latestSelectedModel = useChatViewStore.getState().selectedModel;
		const defaultConfig = ProfileRegistry.getInstance().getActiveAgentConfig();
		const profileFallback = defaultConfig ? { provider: defaultConfig.profile.kind, modelId: defaultConfig.modelId } : null;
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
	const submitMessage = useCallback(async (options: ChatSubmitOptions): Promise<ChatConversation | null> => {
		const { text, files, conversation: inputConversation, project } = options;

		// Record input text in session history for Ctrl+Up/Down recall (#81)
		if (text.trim()) {
			useChatViewStore.getState().pushInputHistory(text);
		}

		// Ensure conversation exists
		const conversation = inputConversation || await ensureConversation();
		if (!conversation) {
			console.error('[useChatSubmit] Failed to ensure conversation');
			return null;
		}
		// Create user message with sending status
		const userMessage = createUserMessage(conversation, text);
		userMessage.status = MessageStatus.SENDING;
		// Turn relationships (chat-studio §12.1) — persisted with the message.
		if (options.replyToMessageId) userMessage.replyToMessageId = options.replyToMessageId;
		if (options.revisionOfMessageId) userMessage.revisionOfMessageId = options.revisionOfMessageId;

		// PR-Chat-4 §11.4 — record a `continuation` outcome event if the user
		// sent this follow-up within 60s of the previous assistant completion.
		// Fire-and-forget; failure here MUST NOT block the send.
		const viewState = useChatViewStore.getState();
		const prevAssistantId = viewState.lastAssistantMessageId;
		const prevTs = viewState.lastAssistantCompletedAt;
		if (prevAssistantId && prevTs && Date.now() - prevTs < CONTINUATION_WINDOW_MS) {
			void usageServices?.outcome
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
		const requestId = generateUuidWithoutHyphens();

		// Actual-source receipt accumulator (RUN-02): tools record real
		// vault/web queries and documents into this collector during the run.
		const receipts = new SourceReceiptCollector();

		// Explicit vault/url refs become real request context — they flow
		// through the same attachment/resource loading pipeline instead of
		// being plain [[text]] hints (chat-studio F4).
		const explicitRefSources = (options.explicitRefs ?? [])
			.filter((ref) => ref.kind === 'vault-file' || ref.kind === 'vault-folder' || ref.kind === 'url')
			.map((ref) => ref.uri);

		// Stream chat (use conversationWithUserMessage which includes the user message)
		const streamResult = await streamChat({
			conversation: conversationWithUserMessage, // Use conversation with user message
			project: project,
			userContent: text,
			attachments: [...resources.map(resource => resource.source), ...explicitRefSources],
			abortSignal: abortControllerRef.current.signal,
			receipts,
		});
		clearTimeout(timeoutId);
		// Capture the abort reason BEFORE clearing so cancel vs timeout is
		// distinguishable in message status + turn receipt (RUN-03).
		const abortedSignal = abortControllerRef.current?.signal;
		const abortReason = abortedSignal?.aborted ? String(abortedSignal.reason ?? 'cancelled') : null;
		// Clear abort controller
		abortControllerRef.current = null;

		// Always save assistant message, even if streaming was interrupted
		// If streaming was interrupted, finalMessage might be null, but we should still
		// save any partial content from the streaming state
		if (streamResult.finalMessage) {
			// RUN-03: cancel/timeout must NOT be recorded as completed. Partial
			// output is kept but the persisted status tells the truth.
			if (abortReason === 'timeout') {
				streamResult.finalMessage.status = MessageStatus.TIMEOUT;
			} else if (abortReason) {
				streamResult.finalMessage.status = MessageStatus.CANCELLED;
			} else if (streamResult.finalMessage.isErrorMessage) {
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

		// Persist the turn execution receipt (chat-studio §12.1 / RUN-02):
		// requested vs actual sources, effective model, final status. Fire and
		// forget — receipt persistence must never block the send flow.
		const receiptStatus: TurnExecutionReceipt['status'] =
			abortReason === 'timeout' ? 'timeout'
			: abortReason ? 'cancelled'
			: streamResult.finalMessage?.isErrorMessage ? 'error'
			: 'completed';
		// Zero-gap Track D (2026-07-21) — MSG-05/RUN-06: collect the artifact
		// receipt ids produced during this turn so a reload can reconstruct
		// the turn → artifacts join without walking every receipt in the
		// conversation. Media_generate and artifact_create both persist their
		// receipts before the stream returns, so a message-scoped lookup here
		// captures the full set.
		let artifactIdsForTurn: string[] = [];
		if (streamResult.finalMessage?.id) {
			try {
				const receipts = await manager.conv.listArtifactReceiptsByMessage(
					streamResult.finalMessage.id,
				);
				artifactIdsForTurn = receipts.map((r) => r.artifactId);
			} catch (err) {
				console.warn('[useChatSubmit] listArtifactReceiptsByMessage failed:', err);
			}
		}
		const receipt: TurnExecutionReceipt = {
			requestId,
			messageId: streamResult.finalMessage?.id ?? userMessage.id,
			conversationId: conversation.meta.id,
			// A3 (§5.1 R2): fill runId so debug trace, message.debugRunId
			// and the persisted receipt all agree on one identifier. Fixes
			// the audit finding that receipts.runId was never populated.
			...(streamResult.runId ? { runId: streamResult.runId } : {}),
			// B2 (plan §5.3.5): prefer the runtime-resolved effective model
			// over the conversation-meta guess. `streamResult.effectiveModel`
			// comes from the assistant/model precedence resolver in
			// service-conversation.streamChat; falling back to finalMessage
			// / conversation.meta preserves the pre-B2 receipt when the
			// runtime did not produce a value (e.g. abort-before-stream).
			effectiveModel: {
				provider:
					streamResult.effectiveModel?.provider
					?? streamResult.finalMessage?.provider
					?? actualProvider
					?? '',
				modelId:
					streamResult.effectiveModel?.modelId
					?? streamResult.finalMessage?.model
					?? actualModel
					?? '',
				...(streamResult.effectiveModel?.profileId
					? { profileId: streamResult.effectiveModel.profileId }
					: {}),
			},
			assistantId: conversation.meta.assistantId,
			workflowId: options.workflowId,
			// COMP-05 (2026-07-21): persist the ModelSelection the user had at
			// send time — the runtime may have routed Auto to a concrete
			// model, but a reload must still show Auto in the picker if that
			// was the persisted selection.
			...(conversation.meta.modelSelection
				? { requestedSelection: conversation.meta.modelSelection }
				: {}),
			...(streamResult.modelSource ? { modelSource: streamResult.modelSource } : {}),
			...(streamResult.routeReason ? { routeReason: streamResult.routeReason } : {}),
			...(streamResult.requiredCapabilities
				? { requiredCapabilities: streamResult.requiredCapabilities }
				: {}),
			requestedSources: options.requestedSources ?? emptySourceScope(conversation.meta.projectId ?? null),
			actualSources: receipts.snapshot(),
			status: receiptStatus,
			artifactIds: artifactIdsForTurn,
			startedAt: streamStartMs,
			finishedAt: Date.now(),
			...(receiptStatus === 'error' && streamResult.finalMessage
				? { error: { code: 'stream-error', message: streamResult.finalMessage.content.slice(0, 500), recoverable: true } }
				: {}),
			...(receiptStatus === 'timeout'
				? { error: { code: 'timeout', message: 'No response within the timeout window', recoverable: true } }
				: {}),
		};
		void manager.conv.saveTurnReceipt(receipt).catch((err) => {
			console.warn('[useChatSubmit] saveTurnReceipt failed:', err);
		});

		return conversation;
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

