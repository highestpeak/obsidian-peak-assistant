// T11E (2026-06-25): Curator Push runtime ports.
//
// The runtime is constructed with a `CuratorPushPorts` bag. The
// concrete adapters live in `src/app/usage/composeCuratorPushRuntime.ts`
// — the single place where EventBus, Obsidian `App`, the chat-bridge
// stub, and the Zustand projection store are wired in.

import type { CuratorPushPayload } from './types';

export interface UsageEventEnvelope {
	/** Cost of the recorded turn in USD. `0` when free or unknown. */
	costUsd: number;
}

export interface UsageEventPort {
	/** Subscribe to `usage-recorded` events. Returns an unsubscribe fn. */
	onUsageRecorded(handler: (event: UsageEventEnvelope) => void): () => void;
}

export interface ContextUtilizationSnapshot {
	used: number;
	max: number;
	ratio: number;
}

export interface ContextUtilizationPort {
	/** Latest known context utilization for the active chat session. */
	get(): ContextUtilizationSnapshot;
}

export interface CuratorPushProjectionPort {
	/** Render a new push (write into the UI store). */
	show(payload: CuratorPushPayload): void;
	/** Reset projection state — used on `dispose()`. */
	reset(): void;
	/** True once a push has been shown this session. */
	hasPushedThisSession(): boolean;
	/** True when the user dismissed this dismiss-key for the session. */
	isDismissed(dismissKey: string): boolean;
}

export interface CuratorPushSettingsSnapshot {
	usagePreviewEnabled: boolean;
}

export interface CuratorPushSettingsPort {
	/** Live read so settings changes propagate without re-binding. */
	get(): CuratorPushSettingsSnapshot;
}

export interface CuratorPushPorts {
	usageEvents: UsageEventPort;
	context: ContextUtilizationPort;
	projection: CuratorPushProjectionPort;
	settings: CuratorPushSettingsPort;
}
