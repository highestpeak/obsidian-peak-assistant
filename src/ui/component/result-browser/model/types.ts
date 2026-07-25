/**
 * Neutral, framework-agnostic vocabulary for the shared Result Browser.
 *
 * These are the single source of truth for the browser's projection state.
 * Host stores (Quick Search's `vaultSearchStore`, and a future Composer
 * adapter) alias these instead of declaring parallel string unions — see the
 * 2026-07-21 shared-component plan §"Shared contracts" and §A ("do not define
 * parallel DTOs").
 *
 * The data payloads themselves stay in their production homes: ranked items
 * are `SearchResultItem[]` (`@/core/search/searchTypes`) and the graph is
 * `ResultSubgraphOutput` (`@/service/search/graph/resultSubgraph`). This file
 * only owns the *view* vocabulary and the immutable snapshot envelope.
 */
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';

/** Result projection surfaces. */
export type ResultBrowserView = 'list' | 'graph' | 'tree';

/** Row density shared across List and Tree (Graph ignores it). */
export type ResultBrowserDensity = 'compact' | 'detailed';

/**
 * Graph layout presets. Structurally identical to
 * `AtlasGraphPreset` (`@/ui/component/graph`) — the canvas is the renderer,
 * this is the browser's copy of the vocabulary so host stores don't reach
 * into the canvas module for a type.
 */
export type ResultBrowserGraphPreset =
	| 'constellation'
	| 'flow-tb'
	| 'flow-lr'
	| 'folder'
	| 'orbit';

/** Stable, cross-view identity for a single result. */
export type ResultItemId = string;

/**
 * One immutable snapshot the browser renders. Both hosts build this once and
 * hand it in; the browser never mutates it and never rebuilds it in response
 * to a projection change (view/density/preset/semantic/selection/inspector/
 * collapse). Contract #2 + #4 of the shared plan.
 */
export interface ResultBrowserSnapshot {
	/** Complete ranked items — the List/Tree source. */
	readonly items: readonly SearchResultItem[];
	/**
	 * One capped subgraph — the Graph source. `null` while a host is still
	 * computing it (the canvas renders an empty frame, not a rebuild).
	 */
	readonly subgraph: ResultSubgraphOutput | null;
}
