// B5.chat — chat-side RunEnvelopeStore projection.
//
// This module bundles the chat feature's RunEnvelope surface into a
// UI-consumable shape. The Wave 1 B2.chat wire-in already routes every
// chat turn through `runChatConversation`, which emits standard
// `RunEvent`s (`status` → running/completed/failed, `progress`,
// `artifact`, `error`). Wave 3 B5.chat lands the *derivation* layer:
//
//   - `createChatRunEnvelopeStore()` composes an `InMemoryRunRecorder`
//     with a `RunEventProjection` and pre-registers four common derives
//     UI code needs when rendering chat progress:
//
//     - `lastStatus`      : most recent `RunStatus` seen (or `null`).
//     - `isStreaming`     : `true` after `status:running` and before any
//                           terminal status (`completed`/`failed`/
//                           `cancelled`).
//     - `activePhase`     : last `progress.phase` seen, or `null`.
//     - `latestArtifact`  : most recent `ArtifactRef`, or `null`.
//
//   - `chatRunEnvelopeAdapter()` returns the `onEvent` sink the
//     `runChatConversation` runner accepts, so the projection wakes up
//     as events flow — no extra plumbing at the call site.
//
// UI components adopt this via a follow-up hook (`useChatRunStatus`)
// that consumes `store.subscribe('isStreaming', ...)` and drives the
// spinner/progress dot. That hook lives in the UI layer and is not
// part of this file — this module stays framework-agnostic so the
// service layer can also read it (e.g. for offline replays).
//
// Boundary discipline:
//   - No imports from React, Obsidian, zustand, or `@/app/*`.
//   - Depends only on `@/service/run-envelope`.

import {
	InMemoryRunRecorder,
	RunEnvelopeStore,
	createProjectingRecorder,
	defaultClock,
	defaultIdFactory,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunEventProjection,
	type RunIdFactory,
	type RunStatus,
} from '@/service/run-envelope';

export const CHAT_RUN_DERIVE_LAST_STATUS = 'chat.lastStatus';
export const CHAT_RUN_DERIVE_IS_STREAMING = 'chat.isStreaming';
export const CHAT_RUN_DERIVE_ACTIVE_PHASE = 'chat.activePhase';
export const CHAT_RUN_DERIVE_LATEST_ARTIFACT = 'chat.latestArtifact';

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
	'completed',
	'failed',
	'cancelled',
]);

export interface ChatRunEnvelopeStoreHandle {
	readonly recorder: InMemoryRunRecorder;
	readonly projection: RunEventProjection;
	readonly store: RunEnvelopeStore;
}

export interface ChatRunEnvelopeStoreOptions {
	clock?: RunClock;
	idFactory?: RunIdFactory;
}

/**
 * Compose the four B5.chat derives on top of a fresh recorder +
 * projection. Callers wire the recorder into `runChatConversation`
 * (or `ClaudeAgentSDKBridge`) and hand the store to the UI layer.
 */
export function createChatRunEnvelopeStore(
	options: ChatRunEnvelopeStoreOptions = {},
): ChatRunEnvelopeStoreHandle {
	const clock = options.clock ?? defaultClock();
	const idFactory = options.idFactory ?? defaultIdFactory('chat-run');
	let recorderRef: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) =>
			new InMemoryRunRecorder({
				clock,
				idFactory,
				onEvent: (event) => {
					const snapshot = recorderRef?.getEvents() ?? [];
					onEvent(event, snapshot);
				},
			}),
	});
	recorderRef = recorder;

	const store = new RunEnvelopeStore(projection);
	registerChatDerives(store);
	return { recorder, projection, store };
}

/**
 * Register the four canonical chat derives on an existing store. Useful
 * when tests supply a pre-built projection to avoid the recorder
 * boot; also called by `createChatRunEnvelopeStore`.
 */
export function registerChatDerives(store: RunEnvelopeStore): void {
	store.register<RunStatus | null>(
		CHAT_RUN_DERIVE_LAST_STATUS,
		selectLastStatus,
	);
	store.register<boolean>(
		CHAT_RUN_DERIVE_IS_STREAMING,
		selectIsStreaming,
	);
	store.register<string | null>(
		CHAT_RUN_DERIVE_ACTIVE_PHASE,
		selectActivePhase,
	);
	store.register<ArtifactRef | null>(
		CHAT_RUN_DERIVE_LATEST_ARTIFACT,
		selectLatestArtifact,
	);
}

// ── Selectors ─────────────────────────────────────────────────────────

export function selectLastStatus(events: readonly RunEvent[]): RunStatus | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'status') return event.status;
	}
	return null;
}

export function selectIsStreaming(events: readonly RunEvent[]): boolean {
	const last = selectLastStatus(events);
	if (last === null) return false;
	if (TERMINAL_STATUSES.has(last)) return false;
	return last === 'running';
}

export function selectActivePhase(events: readonly RunEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'progress') return event.phase;
	}
	return null;
}

export function selectLatestArtifact(
	events: readonly RunEvent[],
): ArtifactRef | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'artifact') return event.artifact;
	}
	return null;
}
