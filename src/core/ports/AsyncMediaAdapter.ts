/**
 * AsyncMediaAdapter — durable async media pipeline port (Task D2 §R1).
 *
 * Where `MediaGenerationPort` executes a synchronous generate() and returns
 * bytes, an async adapter models the fal.ai queue lifecycle explicitly:
 * submit → poll (0..N times) → download. The `MediaJobRunner` schedules the
 * polls between ticks so the tool call NEVER blocks the chat turn and so
 * plugin restart can resume mid-poll from persisted `providerRequestId` +
 * `providerResponseUrl`.
 *
 * Any provider that fits queue semantics implements this port. The concrete
 * `FalAsyncMediaAdapter` wraps the same fetch + payload logic FalMediaAdapter
 * uses today; the sync `generate()` path stays valid for image (D1) and TTS
 * (command entry point) so this port sits alongside — never replaces — the
 * existing MediaGenerationPort registry.
 */

import type {
	MediaGenerationRequest,
	MediaGenerationResult,
} from '@/core/ports/MediaGenerationPort';
import type { MediaKind, MediaOperation } from '@/core/types/media-generation';

export interface AsyncSubmitResult {
	/** Provider-side request id — MUST be persisted so restart can resume. */
	providerRequestId: string;
	/** Provider-side poll URL — MUST be persisted so restart can resume. */
	providerResponseUrl: string;
}

export type AsyncPollStatus =
	/** Job is still executing on the provider; runner should schedule next tick. */
	| { kind: 'pending' }
	/** Job finished; final response payload ready — runner calls `.download()`. */
	| { kind: 'ready'; final: Record<string, unknown> }
	/** Terminal failure — runner marks job failed with the given reason. */
	| { kind: 'failed'; reason: string };

export interface AsyncMediaAdapter {
	readonly providerId: string;
	isConfigured(): boolean;
	supportedKinds(): readonly MediaKind[];
	/**
	 * Operations this adapter can execute per kind. Absent = generate-only.
	 * Preflight consults this so an edit request never routes to a submit-
	 * only sync path (image edits stay on `MediaGenerationPort`).
	 */
	supportedOperations?(kind: MediaKind): readonly MediaOperation[];
	/**
	 * Submit an async job. MUST NOT poll — returns immediately with
	 * providerRequestId + providerResponseUrl the runner persists.
	 */
	submit(req: MediaGenerationRequest): Promise<AsyncSubmitResult>;
	/**
	 * Poll a previously-submitted job. `pending` means "call me again after
	 * the next tick"; `ready`/`failed` are terminal for the poll loop.
	 * Adapter MUST NOT sleep — the runner controls scheduling.
	 */
	poll(providerResponseUrl: string): Promise<AsyncPollStatus>;
	/**
	 * Turn a `ready` payload into MediaGenerationResult (bytes + ext + mime).
	 * Kept separate from `poll` so the runner can retry download without
	 * re-polling.
	 */
	download(
		req: MediaGenerationRequest,
		final: Record<string, unknown>,
	): Promise<MediaGenerationResult>;
	/**
	 * Best-effort remote cancel. Many providers (fal today) do not support
	 * cancel; returning `false` means the runner should still stop tracking
	 * the job locally (see MediaJobRunner semantics for the "cancel = stop
	 * tracking" fall-back).
	 */
	cancel?(providerRequestId: string, providerResponseUrl: string): Promise<boolean>;
}
