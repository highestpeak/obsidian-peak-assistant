import { create } from 'zustand';
import type { SearchQuery, SearchResultItem, SearchScopeValue } from '@/service/search/types';
import type { App } from 'obsidian';
import { getActiveNoteDetail } from '@/core/utils/obsidian-utils';

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

export type QuickSearchMode = 'vault' | 'inFile' | 'inFolder' | 'goToLine';

interface VaultSearchStore {
	// State
	quickSearchMode: QuickSearchMode;
	inFileSearch?: InFileSearch;
	goToLine?: GoToLine;
	parsedQuery?: SearchQuery;
	lastSearchDuration: number | null;
	isSearching: boolean;
	lastSearchResults: SearchResultItem[];

	// Actions
	updateParsedQuery: (app: App, searchQuery: string) => void;
	setLastSearchData: (data: { results: SearchResultItem[]; duration: number | null }) => void;
	setIsSearching: (isSearching: boolean) => void;
}

export const DEFAULT_SEARCH_QUERY: SearchQuery = { text: '', scopeMode: 'vault', topK: 50 };

export const useVaultSearchStore = create<VaultSearchStore>((set) => ({
	// Initial state
	quickSearchMode: 'vault',
	inFileSearch: undefined,
	goToLine: undefined,
	parsedQuery: DEFAULT_SEARCH_QUERY,
	lastSearchDuration: null,
	isSearching: false,
	lastSearchResults: [],

	// Actions
	updateParsedQuery: (app, searchQuery) => {
		const { mode, text, scope } = parseQuickSearchInput({
			app,
			rawInput: searchQuery,
		});
		// Validate and parse line number for goToLine mode
		let lineNumber: number | undefined;
		if (mode === 'goToLine') {
			const parsed = parseInt(text);
			if (Number.isInteger(parsed) && parsed > 0) {
				lineNumber = parsed;
			}
		}

		set({
			quickSearchMode: mode,
			inFileSearch: mode === 'inFile' ? { text, path: scope?.currentFilePath ?? '' } : undefined,
			goToLine: lineNumber !== undefined ? { line: lineNumber, path: scope?.currentFilePath ?? '', text: text } : undefined,
			parsedQuery: mode === 'vault' || mode === 'inFolder' ? { text, scopeMode: mode, scopeValue: scope } : undefined,
		});
	},
	setLastSearchData: ({ results, duration }) => set({
		lastSearchResults: results,
		lastSearchDuration: duration,
	}),
	setIsSearching: (isSearching) => set({ isSearching }),
}));


/**
 * Parse the user input according to quick-search conventions.
 *
 * Conventions:
 * - `#` prefix: in-file search (current active file)
 * - `@` prefix: in-folder search (current active file folder)
 * - Default: vault-wide search
 */
function parseQuickSearchInput(params: {
	app: App;
	rawInput: string;
}): { mode: QuickSearchMode; text: string; scope?: SearchScopeValue; } {
	const { app, rawInput } = params;
	const input = rawInput ?? '';
	const trimmed = input.trimStart();

	let mode: QuickSearchMode = 'vault';
	let text = input;

	if (trimmed.startsWith('#')) {
		mode = 'inFile';
		text = trimmed.slice(1).trimStart();
	} else if (trimmed.startsWith('@')) {
		mode = 'inFolder';
		text = trimmed.slice(1).trimStart();
	} else if (trimmed.startsWith(':')) {
		mode = 'goToLine';
		text = trimmed.slice(1).trimStart();
	}

	const activeNoteDetail = getActiveNoteDetail(app);
	const currentFilePath = activeNoteDetail.activeFile?.path ?? null;
	const folderPath = currentFilePath ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/')) : null;
	const scope = { currentFilePath, folderPath };
	if (mode === 'inFolder' && !scope.folderPath) {
		// Fallback to vault mode if no folder context.
		mode = 'vault';
	}
	if (mode === 'inFile' && !scope.currentFilePath) {
		mode = 'vault';
	}
	if (mode === 'goToLine') {
		const parsedLine = parseInt(text);
		if (!Number.isInteger(parsedLine) || parsedLine <= 0 || !scope.currentFilePath) {
			// Fallback to vault mode if invalid line number or no file context.
			mode = 'vault';
			text = input; // Restore original input for vault search
		}
	}

	return {
		text,
		mode,
		scope,
	};
}
