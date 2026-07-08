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
 * ranked list (default) or a graph visualization of the same result set.
 *
 * 2026-07-08: added `tree` — folder-hierarchy view of the same result set.
 * See `docs/research/2026-07-08-tree-view-mockup/`.
 */
export type ResultView = 'list' | 'graph' | 'tree';

/**
 * Tree view density. Compact mimics Obsidian's own file explorer (24px
 * single-line rows, filename + hit-count badge). Detailed adds heading
 * anchor + modified date + snippet under each file. See mockup at
 * `docs/research/2026-07-08-tree-view-mockup/index.html`.
 */
export type TreeDensity = 'compact' | 'detailed';

/**
 * Graph view mode presets (distilled from user's preferred layouts in the
 * 2026-07-07 layout sandbox). Each preset bundles a Cytoscape layout
 * algorithm + grouping + edge kind defaults into one named mode:
 *
 *  - `constellation` — force-directed cluster (fcose), no grouping
 *  - `flow-tb`       — dagre top-down, no grouping
 *  - `flow-lr`       — dagre left-right, no grouping
 *  - `folder`        — cola + full-depth folder tree compound
 *  - `orbit`         — concentric with hubs at center + semantic on
 */
export type GraphPreset = 'constellation' | 'flow-tb' | 'flow-lr' | 'folder' | 'orbit';

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

	// Result view toggle (list ↔ graph) + graph preset + semantic overlay.
	// Preset bundles layout algorithm + grouping + default edge kinds; the
	// semantic toggle is the one dial the user still sees inside every mode.
	resultView: ResultView;
	setResultView: (view: ResultView) => void;
	graphPreset: GraphPreset;
	setGraphPreset: (preset: GraphPreset) => void;
	graphShowSemantic: boolean;
	setGraphShowSemantic: (on: boolean) => void;
	toggleGraphShowSemantic: () => void;

	// Tree view state.
	// - density: whether file rows are single-line or 3-line (see TreeDensity).
	// - collapsedFolders: folder paths the user manually collapsed. Default is
	//   empty (all folders auto-expanded since we only show hit-containing
	//   subtrees). New search resets this — otherwise a stale collapse from a
	//   prior query would hide new matches.
	// - cursor: focused file path for keyboard nav. `null` = none yet.
	treeDensity: TreeDensity;
	setTreeDensity: (density: TreeDensity) => void;
	treeCollapsedFolders: string[];
	toggleTreeFolderCollapsed: (folderPath: string) => void;
	treeCursor: string | null;
	setTreeCursor: (path: string | null) => void;

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

	// Result view toggle + graph preset + semantic overlay
	resultView: 'list',
	setResultView: (view) => set({ resultView: view }),
	graphPreset: 'constellation',
	setGraphPreset: (preset) => {
		// Orbit shows semantic edges by default (its whole point is showing
		// hubs as gravitational centers, which needs the wider edge set).
		// Every other preset defaults to semantic off; user can still toggle.
		const preferSemantic = preset === 'orbit';
		set({ graphPreset: preset, graphShowSemantic: preferSemantic });
	},
	graphShowSemantic: false,
	setGraphShowSemantic: (on) => set({ graphShowSemantic: on }),
	toggleGraphShowSemantic: () => set((s) => ({ graphShowSemantic: !s.graphShowSemantic })),

	// Tree view initial state
	treeDensity: 'compact',
	setTreeDensity: (density) => set({ treeDensity: density }),
	treeCollapsedFolders: [],
	toggleTreeFolderCollapsed: (folderPath) => set((s) => ({
		treeCollapsedFolders: s.treeCollapsedFolders.includes(folderPath)
			? s.treeCollapsedFolders.filter((p) => p !== folderPath)
			: [...s.treeCollapsedFolders, folderPath],
	})),
	treeCursor: null,
	setTreeCursor: (path) => set({ treeCursor: path }),

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
		// New result set invalidates the previous tree cursor + user-collapsed
		// folders — a stale collapse from a prior query would hide new matches,
		// and the cursor path may no longer exist. Both auto-reset on load.
		treeCollapsedFolders: [],
		treeCursor: null,
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
		graphPreset: 'constellation',
		graphShowSemantic: false,
		pinnedResultDocIds: null,
		treeCollapsedFolders: [],
		treeCursor: null,
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
