import { create } from 'zustand';
import type { SearchQuery, SearchResultItem, SearchScopeValue } from '@/core/search/searchTypes';

/**
 * T0 (2026-07-07 heading-mode refactor):
 * QuickSearchMode collapsed from `vault | inFile | inFolder | goToLine | help`
 * to `all | heading | help`. Folder (`@`) and go-to-line (`:`) parsers were
 * removed — see spec `docs/superpowers/specs/2026-07-07-vault-search-heading-graph-navigation.md`.
 * `inFile` was renamed to `heading` (# prefix still triggers it).
 */
export type QuickSearchMode = 'all' | 'heading' | 'help';

/**
 * T3 (2026-07-07 result graph): the result pane can render either the
 * ranked list (default) or a graph visualization of the same result set
 * (T4 will fill in). Store owns the toggle so `ResultPaneHeader`,
 * `tab-VaultSearch`, and the keyboard handler can coordinate.
 */
export type ResultView = 'list' | 'graph';

interface VaultSearchStore {
	// State
	quickSearchMode: QuickSearchMode;
	parsedQuery?: SearchQuery;
	lastSearchDuration: number | null;
	isSearching: boolean;
	lastSearchResults: SearchResultItem[];
	fuzzyCorrection: string | null;
	inspectorOpen: boolean;
	setInspectorOpen: (open: boolean) => void;
	toggleInspector: () => void;

	// T3: result-view toggle shell (list ↔ graph) + graph overlay toggles.
	// Graph content lands in T4; these fields exist now so T3/T4 can build in
	// parallel without a mid-branch schema shift.
	resultView: ResultView;
	setResultView: (view: ResultView) => void;
	graphOverlaySemantic: boolean;
	setGraphOverlaySemantic: (on: boolean) => void;
	toggleGraphOverlaySemantic: () => void;
	graphOverlayFolder: boolean;
	setGraphOverlayFolder: (on: boolean) => void;
	toggleGraphOverlayFolder: () => void;

	/**
	 * T7 (2026-07-07 hub graph subview): when set, the result set is pinned to
	 * these doc paths (member_path from hub_constituent). Populated by
	 * `useOpenHubGraphSubview` when the user Cmd+clicks a hub anchor or a hub
	 * reference row. Query text still filters *within* the pinned set —
	 * `useVaultSearch` post-filters `lastSearchResults` by this list, and an
	 * empty query renders every pinned doc regardless of substring match.
	 * `null` = no pin (default vault-wide behavior).
	 */
	pinnedResultDocIds: string[] | null;
	setPinnedResultDocIds: (ids: string[] | null) => void;

	// Actions
	/**
	 * T11P (Track D/H): caller passes `currentFilePath` from
	 * `useServiceContext().vaultStats.activeFilePath()` so the store does
	 * not require an Obsidian `App` reference.
	 */
	updateParsedQuery: (currentFilePath: string | null, searchQuery: string) => void;
	setLastSearchData: (data: { results: SearchResultItem[]; duration: number | null; fuzzyCorrection?: string | null }) => void;
	setIsSearching: (isSearching: boolean) => void;
	reset: () => void;
}

export const DEFAULT_SEARCH_QUERY: SearchQuery = { text: '', scopeMode: 'all', topK: 50 };

export const useVaultSearchStore = create<VaultSearchStore>((set) => ({
	// Initial state
	quickSearchMode: 'all',
	parsedQuery: DEFAULT_SEARCH_QUERY,
	lastSearchDuration: null,
	isSearching: false,
	lastSearchResults: [],
	fuzzyCorrection: null,
	inspectorOpen: false,
	setInspectorOpen: (open) => set({ inspectorOpen: open }),
	toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

	// T3: result-view toggle shell
	resultView: 'list',
	setResultView: (view) => set({ resultView: view }),
	graphOverlaySemantic: false,
	setGraphOverlaySemantic: (on) => set({ graphOverlaySemantic: on }),
	toggleGraphOverlaySemantic: () => set((s) => ({ graphOverlaySemantic: !s.graphOverlaySemantic })),
	graphOverlayFolder: false,
	setGraphOverlayFolder: (on) => set({ graphOverlayFolder: on }),
	toggleGraphOverlayFolder: () => set((s) => ({ graphOverlayFolder: !s.graphOverlayFolder })),

	// T7: hub-graph-subview pin
	pinnedResultDocIds: null,
	setPinnedResultDocIds: (ids) => set({ pinnedResultDocIds: ids }),

	// Actions
	updateParsedQuery: (currentFilePath, searchQuery) => {
		const { mode, text, scope } = parseQuickSearchInput({
			currentFilePath,
			rawInput: searchQuery,
		});
		set({
			quickSearchMode: mode,
			// `heading` currently reuses the same SearchQuery pipeline as `all`
			// (T5 will replace this with the outline-tree service). `help` has
			// no query object — the ModeHelpList renders directly off the mode.
			parsedQuery: mode === 'help' ? undefined : { text, scopeMode: mode, scopeValue: scope },
		});
	},
	setLastSearchData: ({ results, duration, fuzzyCorrection }) => set({
		lastSearchResults: results,
		lastSearchDuration: duration,
		fuzzyCorrection: fuzzyCorrection ?? null,
	}),
	setIsSearching: (isSearching) => set({ isSearching }),
	reset: () => set({
		quickSearchMode: 'all',
		parsedQuery: DEFAULT_SEARCH_QUERY,
		lastSearchDuration: null,
		isSearching: false,
		lastSearchResults: [],
		fuzzyCorrection: null,
		resultView: 'list',
		graphOverlaySemantic: false,
		graphOverlayFolder: false,
		pinnedResultDocIds: null,
	}),
}));


/**
 * Parse the user input according to quick-search conventions.
 *
 * Conventions (post-T0, 2026-07-07):
 * - `?` prefix: help / cheat-sheet mode
 * - `#` prefix: heading mode (outline tree of the current active file)
 * - Default: `all` — vault-wide search
 *
 * Folder (`@`) and go-to-line (`:`) prefixes were removed by T0. The
 * corresponding features are being retired in T1.
 */
function parseQuickSearchInput(params: {
	currentFilePath: string | null;
	rawInput: string;
}): { mode: QuickSearchMode; text: string; scope?: SearchScopeValue; } {
	const { currentFilePath, rawInput } = params;
	const input = rawInput ?? '';
	const trimmed = input.trimStart();

	let mode: QuickSearchMode = 'all';
	let text = input;

	if (trimmed.startsWith('?')) {
		mode = 'help';
		text = trimmed.slice(1).trimStart();
	} else if (trimmed.startsWith('#')) {
		mode = 'heading';
		text = trimmed.slice(1).trimStart();
	}

	const scope: SearchScopeValue = { currentFilePath };

	// Heading mode requires a current file; fall back to `all` when there is
	// no file context (desktop / mock harness).
	if (mode === 'heading' && !scope.currentFilePath) {
		mode = 'all';
	}

	return {
		text,
		mode,
		scope,
	};
}
