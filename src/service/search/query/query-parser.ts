import type { App } from 'obsidian';
import type { SearchMode, SearchQuery, SearchScope } from '@/service/search/types';

/**
 * Parsed representation of quick search input.
 */
export interface ParsedQuickSearchInput {
	/**
	 * Whether the UI should show the mode selection list.
	 */
	showModeList: boolean;
	/**
	 * The effective search query object to send to the worker.
	 */
	query: SearchQuery;
}

function getActiveFileScope(app: App): SearchScope {
	const active = app.workspace.getActiveFile();
	const currentFilePath = active?.path ?? null;
	const folderPath = currentFilePath ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/')) : null;
	return { currentFilePath, folderPath };
}

/**
 * Parse the user input according to quick-search conventions.
 *
 * Conventions (MVP):
 * - `#` prefix: in-file search (current active file)
 * - `@` prefix: in-folder search (current active file folder)
 * - `/` prefix alone: open mode list (no search)
 */
export function parseQuickSearchInput(params: {
	app: App;
	rawInput: string;
	modeOverride?: SearchMode | null;
	topK?: number;
}): ParsedQuickSearchInput {
	const { app, rawInput, modeOverride, topK } = params;
	const input = rawInput ?? '';

	const trimmed = input.trimStart();
	if (trimmed === '/') {
		return {
			showModeList: true,
			query: {
				text: '',
				mode: modeOverride ?? 'vault',
				scope: getActiveFileScope(app),
				topK,
			},
		};
	}

	// Explicit prefix takes priority over override.
	let mode: SearchMode = modeOverride ?? 'vault';
	let text = input;
	if (trimmed.startsWith('#')) {
		mode = 'inFile';
		text = trimmed.slice(1).trimStart();
	} else if (trimmed.startsWith('@')) {
		mode = 'inFolder';
		text = trimmed.slice(1).trimStart();
	} else if (trimmed.startsWith('/')) {
		// If user typed "/something", treat it as a normal query but open mode list.
		return {
			showModeList: true,
			query: {
				text: trimmed.slice(1).trimStart(),
				mode: modeOverride ?? 'vault',
				scope: getActiveFileScope(app),
				topK,
			},
		};
	}

	const scope = getActiveFileScope(app);
	if (mode === 'inFolder' && !scope.folderPath) {
		// Fallback to vault mode if no folder context.
		mode = 'vault';
	}
	if (mode === 'inFile' && !scope.currentFilePath) {
		mode = 'vault';
	}

	return {
		showModeList: false,
		query: {
			text,
			mode,
			scope,
			topK,
		},
	};
}
