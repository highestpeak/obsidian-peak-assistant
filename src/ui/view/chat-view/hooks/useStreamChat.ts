import { useCallback } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../store/chatViewStore';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { PromptId } from '@/core/types/prompt';
import { createChatErrorMessage } from '@/service/chat/utils/chat-message-builder';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { ChatDataStore } from '@/ui/store/chatDataStore';
import { runChatConversation } from '@/service/chat/ChatConversationRun';
import type { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';

export interface StreamChatOptions {
	conversation: ChatConversation;
	project: ChatProject | null;
	userContent: string;
	attachments?: string[];
	onDelta?: (text: string) => void;
	onComplete?: (message: ChatMessage, usage?: LLMUsage) => void;
	onError?: (error: unknown) => void;
	abortSignal?: AbortSignal;
	/** Per-turn actual-source receipt accumulator (chat-studio RUN-02). */
	receipts?: SourceReceiptCollector;
}

export interface StreamChatResult {
	finalMessage: ChatMessage | null;
	finalUsage: LLMUsage | undefined;
	userMessage?: ChatMessage; // User message with resources (from prepareChatRequest)
	/**
	 * Runtime run id (A3): the Harness AgentLoop's `loopId`, mirrored on the
	 * debug run so TurnExecutionReceipt.runId + message.debugRunId + trace
	 * span parent all agree.
	 */
	runId?: string;
	/**
	 * Coarse Harness lifecycle status. Chat maps this to MessageStatus /
	 * TurnExecutionReceipt.status in useChatSubmit; the AbortError path
	 * remains as a structural fallback for legacy code.
	 */
	harnessStatus?: 'completed' | 'failed' | 'cancelled' | 'timeout';
	/**
	 * B2 (plan §5.3.5): the model that actually served this turn, resolved
	 * per the precedence chain (conversation-fixed > assistant-preferred >
	 * Auto default). useChatSubmit writes this into
	 * `TurnExecutionReceipt.effectiveModel` — no more guessing from
	 * `conversation.meta.activeModel`, which is stale whenever the assistant
	 * or Auto picked a different model.
	 */
	effectiveModel?: { provider: string; modelId: string; profileId?: string };
	/** Which step of the precedence chain served this turn (§5.3.5). */
	modelSource?: 'conversation-fixed' | 'assistant-preferred' | 'auto-routed' | 'auto-default';
	/**
	 * COMP-05 (2026-07-21): honest reason string when Auto routed this turn.
	 * Present only when `modelSource === 'auto-routed'`. Persisted on the
	 * TurnExecutionReceipt so a reload can prove why Auto picked a model.
	 */
	routeReason?: string;
	/** COMP-05: required capabilities the router applied for this turn. */
	requiredCapabilities?: string[];
	/**
	 * True when the assistant's preferredModel was requested but the profile
	 * was disabled / deleted / the model id was empty — the runtime dropped
	 * to the Auto default and this flag lets the receipt / UI show the
	 * degradation honestly.
	 */
	assistantPreferredUnavailable?: boolean;
}

/**
 * Save partial streaming content and return result when stream is aborted.
 */
function handleAbortedStream(
	conversation: ChatConversation,
	manager: AIServiceManager,
	assistantMessageId: string,
	messageStore: ChatDataStore,
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
	const modelId = conversation.meta.activeModel;
	const provider = conversation.meta.activeProvider;
	if (!modelId || !provider) throw new Error('This conversation has no configured model route. Runtime model fallback is disabled.');
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const streamingContent = useChatDataStore.getState().streamingContent;
	const reasoningContent = useChatDataStore.getState().reasoningContent;
	const currentToolCalls = useChatDataStore.getState().currentToolCalls;
	// Snapshot the debug run id for this turn while the recorder still
	// holds it — once the retention buffer rolls over it may vanish.
	const debugRunId = manager.conv.getLastDebugRunId() ?? undefined;

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
		...(debugRunId ? { debugRunId } : {}),
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
	const messageStore = useChatDataStore();

	/**
	 * Update all stores with conversation.
	 */
	const updateConv = useCallback((conversation: ChatConversation) => {
		useChatViewStore.getState().setConversation(conversation);
		useChatDataStore.getState().updateConversation(conversation);
		useChatDataStore.getState().setActiveConversation(conversation);
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
			receipts,
		} = options;

		// Create assistant message ID for streaming
		const assistantMessageId = generateUuidWithoutHyphens();
		messageStore.startStreaming(assistantMessageId, 'assistant');

		// MSG-07 — per-run permission allowlist. Scoped to this streamChat
		// invocation so `Allow for this run` cannot leak between user turns.
		const runAllowlist = new Set<string>();

		let finalMessage: ChatMessage | null = null;
		let finalUsage: LLMUsage | undefined;

		// B2.chat (2026-07-03): wrap the conversation turn in a
		// RunEnvelope so each send gets a runId + start/finish trace.
		// Behaviour-preserving: the entire try/catch/finally body runs
		// inside `runChatConversation({ send })`; UI stores keep
		// getting token deltas the same way. Errors surface via the
		// existing try/catch AND via `error` events on the envelope.
		let runId: string | undefined;
		let harnessStatus: 'completed' | 'failed' | 'cancelled' | 'timeout' | undefined;
		let effectiveModel: { provider: string; modelId: string; profileId?: string } | undefined;
		let modelSource: 'conversation-fixed' | 'assistant-preferred' | 'auto-routed' | 'auto-default' | undefined;
		let routeReason: string | undefined;
		let requiredCapabilities: string[] | undefined;
		let assistantPreferredUnavailable: boolean | undefined;
		let streamErrorEvent: Error | null = null;
		const result = await runChatConversation<StreamChatResult>({
			trigger: 'manual',
			send: async () => {
				try {
			// Start streaming
			// A3: signal is threaded into ConversationService → harness
			// → provider fetch so cancellation actually aborts the HTTP
			// call, not just the UI reader.
			// B1 §5.2 R4: per-turn permission resolver. On each ask event
			// we push a PendingPermissionAsk into chatDataStore so the
			// inline confirmation card renders; the card's Allow/Deny
			// click resolves the pending promise, which the harness then
			// consumes to continue or skip the tool call.
			const stream = manager.conv.streamChat({
				conversation,
				project,
				userContent,
				attachments,
				receipts,
				abortSignal,
				// D1 §R2: anchor tool receipts (e.g. media_generate) to the
				// same assistant message id the UI streams into.
				assistantMessageId,
				// MSG-07 — per-run allow-for-run cache. When the user chooses
				// "Allow for this run" for a tool, subsequent asks for the
				// SAME tool inside this turn's run short-circuit to `allow`
				// without popping another card. Scoped to `runAllowlist` so
				// the next user submit starts with a fresh, empty set.
				resolvePermissionAsk: (request) =>
					new Promise<{ decision: 'allow' | 'deny'; reason?: string }>((resolve) => {
						if (runAllowlist.has(request.toolName)) {
							resolve({ decision: 'allow', reason: 'run-allowlisted' });
							return;
						}
						// If the abort fires while awaiting, deny so the loop
						// unwinds cleanly (matches harness safe-fallback).
						const onAbort = () => {
							useChatDataStore.getState().setPendingPermissionAsk(null);
							resolve({ decision: 'deny', reason: 'cancelled' });
						};
						if (request.signal.aborted) return onAbort();
						request.signal.addEventListener('abort', onAbort, { once: true });
						useChatDataStore.getState().setPendingPermissionAsk({
							requestId: request.requestId,
							toolName: request.toolName,
							stepIndex: request.stepIndex,
							args: request.args,
							resolve: (decision, reason) => {
								request.signal.removeEventListener('abort', onAbort);
								useChatDataStore.getState().setPendingPermissionAsk(null);
								if (decision === 'allow-for-run') {
									runAllowlist.add(request.toolName);
									// The AgentLoop only knows `allow`/`deny`,
									// so coerce the resolution — the caching
									// is what makes "for this run" real.
									resolve({ decision: 'allow', reason: reason ?? 'allow-for-run' });
									return;
								}
								resolve({ decision, reason });
							},
						});
					}),
			});

			// Process stream events. Manually iterate so we can catch the
			// generator's return value (Harness runId + status).
			while (true) {
				const iter = await stream.next();
				if (iter.done) {
					const ret = iter.value as {
						runId?: string;
						status?: string;
						effectiveModel?: { provider: string; modelId: string; profileId?: string };
						modelSource?: 'conversation-fixed' | 'assistant-preferred' | 'auto-routed' | 'auto-default';
						assistantPreferredUnavailable?: boolean;
						routeReason?: string;
						requiredCapabilities?: string[];
					} | undefined;
					if (ret) {
						runId = ret.runId ?? runId;
						if (ret.status === 'completed' || ret.status === 'failed' || ret.status === 'cancelled' || ret.status === 'timeout') {
							harnessStatus = ret.status;
						}
						effectiveModel = ret.effectiveModel ?? effectiveModel;
						modelSource = ret.modelSource ?? modelSource;
						routeReason = ret.routeReason ?? routeReason;
						requiredCapabilities = ret.requiredCapabilities ?? requiredCapabilities;
						assistantPreferredUnavailable =
							ret.assistantPreferredUnavailable ?? assistantPreferredUnavailable;
					}
					break;
				}
				const event = iter.value;
				// Per-event logging removed: floods DevTools IPC and crashes renderer
				// Check if aborted before processing event
				if (abortSignal?.aborted) {
					return {
						...handleAbortedStream(
							conversation,
							manager,
							assistantMessageId,
							messageStore,
							finalMessage,
							finalUsage,
							false,
						),
						runId,
						harnessStatus: 'cancelled',
					};
				}

				// Check if we need to end tool sequence (when receiving non-tool event while tool sequence is active)
				// This includes reasoning-delta, text-delta, and other non-tool events
				if (useChatDataStore.getState().isToolSequenceActive && !isToolEvent(event.type)) {
					messageStore.endToolSequence();
				}

				// Check if we need to end reasoning (when receiving non-reasoning event while reasoning is active)
				// This includes tool events, text-delta, and other non-reasoning events
				if (useChatDataStore.getState().isReasoningActive && !isReasoningEvent(event.type)) {
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
						if (!useChatDataStore.getState().isReasoningActive) {
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
						const currentToolName = useChatDataStore.getState().currentToolName;
						if (currentToolName) {
							messageStore.updateToolCall(currentToolName, event.delta);
						}
						break;

					case 'tool-result':
						messageStore.completeToolCall(event.toolName, event.output);
						break;

					case 'complete':
						// End tool sequence if active
						if (useChatDataStore.getState().isToolSequenceActive) {
							messageStore.endToolSequence();
						}

						// Complete reasoning if active
						if (useChatDataStore.getState().isReasoningActive) {
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
						// PR-Chat-4 §11.4: mark assistant completion so the next
						// user submit can record a `continuation` outcome event
						// if it lands within the 60s engagement window.
						useChatViewStore.getState().markAssistantCompleted(assistantMessageId);
						onComplete?.(finalMessage!, finalUsage);

						// Suggested-followups: kick off a one-shot generation
						// (fire-and-forget) and persist to sqlite when it returns.
						// Chips show up in the UI via the store update; reloading
						// the conversation reads them from sqlite, so we never
						// regenerate on remount.
						if (finalMessage && !finalMessage.isErrorMessage && finalMessage.content) {
							void generateAndPersistSuggestedFollowups(
								manager,
								conversation.meta.id,
								assistantMessageId,
								userContent,
								finalMessage.content,
							);
						}
						break;
					case 'error':
						// A3 fix (§5.1 R3): provider `error` events must
						// surface, not vanish. Capture the first one seen so
						// the terminal branch below marks the message ERROR
						// and the outer receipt records a real error code.
						// Continue draining the stream — the harness will
						// yield its terminal `complete` next so downstream
						// bookkeeping (usage totals, run status) still runs.
						if (!streamErrorEvent) {
							streamErrorEvent = event.error instanceof Error
								? event.error
								: new Error(String(event.error));
						}
						break;
					case 'chat-run-status':
						// B1 §5.2 R4: keep the store informed of harness
						// lifecycle transitions. `waiting-permission` drives
						// the "waiting" hint next to the streaming message.
						useChatDataStore.getState().setRunStatus(event.state);
						break;
					case 'chat-permission-request':
						// The resolver bound above already pushed the
						// PendingPermissionAsk; this event is only kept for
						// symmetry with debug consumers.
						break;
					case 'chat-permission-resolved':
						// Card was already cleared by the resolver; keep
						// this branch so future consumers (analytics, PR-1
						// dashboards) can hook in.
						break;
					case 'source':
					case 'on-step-finish':
					case 'unSupported':
					default:
						break;
				}
			}

			// Check if aborted after stream completes (in case abort happened during final processing)
			if (abortSignal?.aborted) {
				return {
					...handleAbortedStream(
						conversation,
						manager,
						assistantMessageId,
						messageStore,
						finalMessage,
						finalUsage,
						true, // Only create message if finalMessage is null
					),
					runId,
					harnessStatus: 'cancelled',
				};
			}

			// A3 fix (§5.1 R3): if a provider `error` event was seen mid-
			// stream but the harness still emitted `complete` (partial
			// answer), overwrite the final message so it lands as ERROR.
			// This closes the "silent truncated answer" bug — previously
			// the switch's default branch dropped error events.
			if (streamErrorEvent && (!finalMessage || !finalMessage.isErrorMessage)) {
				console.error('[useStreamChat] Provider error event captured:', streamErrorEvent);
				finalMessage = createFinalAssistantMessage(
					conversation,
					manager,
					assistantMessageId,
					{ isErrorMessage: true },
					streamErrorEvent,
				);
				messageStore.completeStreaming(finalMessage);
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
				// Clear reasoning and tool calls; streaming state is kept alive
				// until commitStreamingMessage() atomically swaps it for the saved message
				messageStore.clearReasoning();
				messageStore.clearToolCalls();
				// B1 §5.2 R4: never leak a pending permission ask past turn
				// end — the harness has already unwound whether we allowed,
				// denied, or aborted.
				useChatDataStore.getState().clearPermissionState();
			}

				// B2 (plan §5.3.5): apply the runtime-resolved effective model to
			// the assistant message so persistence + receipt line up with the
			// step of the precedence chain that actually served this turn.
			if (finalMessage && effectiveModel && !finalMessage.isErrorMessage) {
				finalMessage.model = effectiveModel.modelId;
				finalMessage.provider = effectiveModel.provider;
			}
			return {
				finalMessage,
				finalUsage,
				runId,
				harnessStatus,
				effectiveModel,
				modelSource,
				routeReason,
				requiredCapabilities,
				assistantPreferredUnavailable,
			};
			},
		});

		return result.payload;
	}, [manager, messageStore]);

	return {
		streamChat,
		updateConv,
	};
}

const SUGGEST_FOLLOWUPS_CONTENT_LIMIT = 500;
const SUGGEST_FOLLOWUPS_MAX = 5;

/**
 * Fire-and-forget: generate the suggested-followup chips for a just-completed
 * assistant message, push them to the in-memory store (so chips render
 * immediately), and persist to sqlite (so reloads don't regenerate).
 *
 * Errors are swallowed — followups are a nice-to-have, never block the chat.
 */
async function generateAndPersistSuggestedFollowups(
	manager: AIServiceManager,
	conversationId: string,
	assistantMessageId: string,
	userContent: string,
	assistantContent: string,
): Promise<void> {
	try {
		const result = await manager.queryStructured<string[]>(
			PromptId.ChatSuggestFollowups,
			{
				userMessage: userContent.slice(0, SUGGEST_FOLLOWUPS_CONTENT_LIMIT),
				assistantMessage: assistantContent.slice(0, SUGGEST_FOLLOWUPS_CONTENT_LIMIT),
			},
		);
		if (!Array.isArray(result)) return;
		const followups = result
			.filter((s): s is string => typeof s === 'string')
			.slice(0, SUGGEST_FOLLOWUPS_MAX);
		if (followups.length === 0) return;

		useChatDataStore.getState().updateMessage(assistantMessageId, { suggestedFollowups: followups });

		try {
			await manager.conv.updateMessageSuggestedFollowups(conversationId, assistantMessageId, followups);
		} catch (persistErr) {
			console.debug('[useStreamChat] Failed to persist suggestedFollowups:', persistErr);
		}
	} catch (genErr) {
		console.debug('[useStreamChat] Failed to generate suggestedFollowups:', genErr);
	}
}
