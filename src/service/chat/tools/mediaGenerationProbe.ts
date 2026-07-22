/**
 * MediaGenerationProbe — availability boundary for the Chat
 * `media_generate` tool (Task D1 §R1).
 *
 * The resolver in `toolAvailability.ts` must decide, at every UI tick,
 * whether the tool should appear on the model's tool list. Reaching into
 * `MediaGenerationService` directly would (a) invert the layering
 * (service imports port, port imports service) and (b) couple every
 * `resolveToolAvailability` call to config load. This seam is the same
 * shape as `WebSearchProvider`: a small interface with a null default and
 * a real implementation wired by the app layer.
 *
 * The null default reports `null` (probe unwired) → the resolver renders
 * `unconfigured` with a "media runtime not wired" reason so the UI does
 * not surface the tool as available when the runtime never bound.
 */

import type { MediaGenerationSyncSnapshot } from '@/service/media/MediaGenerationService';

export interface MediaGenerationProbe {
	/**
	 * Sync snapshot of "which kinds have at least one ready route right
	 * now?". Return `null` when the underlying service is not yet bound
	 * (e.g. mobile boot before initSqlite, or unit tests without wiring).
	 */
	snapshot(): MediaGenerationSyncSnapshot | null;
}

export const NULL_MEDIA_GENERATION_PROBE: MediaGenerationProbe = {
	snapshot: () => null,
};

/**
 * Bind a MediaGenerationService as a MediaGenerationProbe. Kept as a
 * standalone helper so tests can construct a probe from a fake snapshot
 * without pulling in the whole service.
 */
export function mediaGenerationServiceAsProbe(getService: () => {
	probeSyncAvailability(): MediaGenerationSyncSnapshot;
} | null): MediaGenerationProbe {
	return {
		snapshot: () => {
			const svc = getService();
			if (!svc) return null;
			return svc.probeSyncAvailability();
		},
	};
}
