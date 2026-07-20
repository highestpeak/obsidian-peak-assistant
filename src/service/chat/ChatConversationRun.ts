// T3 Wave 3.A — RunEnvelope adoption: Chat Conversation entry.
//
// Additive wrapper for one chat conversation turn (send-message + agent
// loop + streamed response). This runner is intentionally *behavior
// preserving*: it takes a caller-supplied `send()` function and drives
// it inside a fresh RunSession so we get the same observability +
// golden-trace conformance as the other adopters (index-init, cascade,
// graph-cleanup, vault-lint).
//
// Boundary discipline (mirrors IndexInitializerRun):
//   - No AppContext / zustand / provider-manager imports here. All
//     dependencies flow in through the `options` argument.
//   - No module-level mutable state.
//
// The wrapper does not currently emit token-level `progress` — the
// existing chat streaming stack already surfaces token deltas via UI
// stores. This adopter's job is only to enclose the *conversation*
// under a RunSession so agent-loop lifecycle + failure-trace + timing
// are captured uniformly.

import {
	InMemoryRunRecorder,
	defaultClock,
	defaultIdFactory,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
	type RunSession,
	type RunTrigger,
} from '@/service/run-envelope';

export const CHAT_CONVERSATION_CAPABILITY_ID = 'chat.conversation.run';
const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.chat-conversation+json';

export interface ChatConversationRunResult<T = unknown> {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly payload: T;
}

export interface ChatConversationRunOptions<T = unknown> {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	trigger?: RunTrigger;
	/** Async worker that performs the actual chat turn. */
	send: () => Promise<T>;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runChatConversation<T = unknown>(
	options: ChatConversationRunOptions<T>,
): Promise<ChatConversationRunResult<T>> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('chat-conv'),
			...(userOnEvent !== undefined
				? {
						onEvent: (event) => {
							const snapshot = recorderRef?.getEvents() ?? [];
							userOnEvent(event, snapshot);
						},
					}
				: {}),
		});
	recorderRef = recorder;

	recorder.start({
		capabilityId: CHAT_CONVERSATION_CAPABILITY_ID,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let payload: T;
	try {
		payload = await options.send();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// chat-studio RUN-03: user/timeout aborts finish as 'cancelled', not
		// 'failed', so run status stays consistent with message/tool receipts.
		// Timeout aborts also land here; the TurnExecutionReceipt distinguishes
		// timeout from manual cancel at the receipt layer.
		//
		// Classify STRUCTURALLY: a genuine abort surfaces as an error /
		// DOMException named 'AbortError' (aborted fetch, AI SDK re-throw).
		// Trust that name first. The message-text fallback fires ONLY when no
		// name is present, and matches abort phrasing alone — deliberately NOT
		// "cancelled", which providers also emit for server-side FAILURES that
		// must trace as 'failed', not as a user cancel.
		const errName =
			typeof err === 'object' && err !== null && 'name' in err
				? String((err as { name: unknown }).name)
				: undefined;
		const isAbort =
			errName === 'AbortError' ||
			(errName === undefined && /\baborted\b/i.test(message));
		recorder.recordError(message, isAbort);
		recorder.finish(isAbort ? 'cancelled' : 'failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'Chat conversation turn completed',
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
		payload,
	};
}
