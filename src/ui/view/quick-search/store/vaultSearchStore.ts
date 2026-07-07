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

// TODO T1: `InFileSearch` / `GoToLine` types are retained as unused re-exports
// so that T1-owned files (useVaultSearch, SearchModal) still compile during
// the T0 → T1 handoff. Delete along with the corresponding removed feature paths.
export interface InFileSearch {
	text: string;
	path: string;
}

export interface GoToLine {
	line: number;
	path: string;
	/**
	 * same as line number. but str type
	 */
	text: string;
}

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
