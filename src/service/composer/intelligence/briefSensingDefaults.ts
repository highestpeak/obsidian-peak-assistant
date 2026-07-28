/**
 * Fallback timing for the document-local Brief sensing runtime.
 *
 * This mirrors `templates/config/composer.json#sidecar`. Keeping the fallback
 * beside the runtime (rather than in a TSX component) makes the timing policy
 * explicit and testable when the template provider is not available.
 */
export interface BriefSensingPolicy {
	readonly idleRefreshDelayMs: number;
	readonly continuousRefreshMinIntervalMs: number;
}

export const DEFAULT_BRIEF_SENSING_POLICY: BriefSensingPolicy = Object.freeze({
	idleRefreshDelayMs: 900,
	continuousRefreshMinIntervalMs: 2400,
});
