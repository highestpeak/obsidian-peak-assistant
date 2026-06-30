// T11Y-7c: vector-search read port that *explicitly* distinguishes
// "search subsystem not ready" from "search ran and returned zero
// hits". The previous `CopilotActionSearchPort` collapsed both into
// `{ items: [] }`, so action UIs could not render "search index not
// ready" any differently than "no matches".
//
// Result discriminator carries the reason on the unavailable branch so
// product code can render a useful empty state and observability code
// can record the boot-order / mobile-degraded mode.

/**
 * One vector-search result item. Shape matches the previous
 * `CopilotActionSearchPort.vectorSearch` return — actions can swap in
 * the new port with no field rename.
 */
export interface SearchAvailabilityHit {
	path: string;
	title?: string;
	score?: number;
	finalScore?: number;
	content?: string;
	highlight?: { text?: string };
}

/** Discriminated result: search ran. */
export interface SearchAvailableResult {
	available: true;
	items: SearchAvailabilityHit[];
}

/** Discriminated result: search did not run because the subsystem was unavailable. */
export interface SearchUnavailableResult {
	available: false;
	/**
	 * Machine-readable reason. Product UI can render a friendlier label;
	 * observability code records the raw reason.
	 *
	 * Known reasons today:
	 *   - 'search-client-unavailable' — no SearchClient bound yet
	 *     (mobile mode, or SQLite-deferred window on desktop).
	 */
	reason: 'search-client-unavailable' | (string & {});
}

export type SearchAvailabilityResult = SearchAvailableResult | SearchUnavailableResult;

/**
 * Narrow vector-search read port used by the Copilot action runtime.
 *
 * Implementations must:
 *   - return `{ available: false, reason }` when the underlying search
 *     subsystem is not ready or cannot be reached;
 *   - return `{ available: true, items }` even when `items.length === 0`
 *     (search ran, just found nothing).
 */
export interface SearchAvailabilityPort {
	vectorSearch(input: {
		text: string;
		scopeMode: 'vault' | 'current-note';
		topK: number;
	}): Promise<SearchAvailabilityResult>;
}
