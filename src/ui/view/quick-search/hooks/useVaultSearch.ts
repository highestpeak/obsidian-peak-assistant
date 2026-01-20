import { useEffect, useRef } from 'react';
import { DEFAULT_RECENT_SEARCH_RESULTS_COUNT } from '@/core/constant';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { DEFAULT_SEARCH_QUERY, GoToLine, InFileSearch, useVaultSearchStore } from '../store/vaultSearchStore';
import { SearchQuery } from '@/service/search/types';
import { AppContext } from '@/app/context/AppContext';
import { readFileAsText, openFileAtLine } from '@/core/utils/obsidian-utils';
import type { SearchResultItem } from '@/service/search/types';

export const useSearchQuery = (): InFileSearch | GoToLine | SearchQuery => {
	const { quickSearchMode, inFileSearch, goToLine, parsedQuery } = useVaultSearchStore();
	if (quickSearchMode === 'vault' || quickSearchMode === 'inFolder') {
		return parsedQuery ?? DEFAULT_SEARCH_QUERY;
	} else if (quickSearchMode === 'inFile') {
		return { text: inFileSearch?.text ?? '', path: inFileSearch?.path ?? '' };
	} else if (quickSearchMode === 'goToLine') {
		return { text: goToLine?.text ?? '', path: goToLine?.path ?? '', line: goToLine?.line };
	}
	return DEFAULT_SEARCH_QUERY;
};

export const useHasSearchQuery = () => {
	const { quickSearchMode, inFileSearch, goToLine, parsedQuery } = useVaultSearchStore();
	if (quickSearchMode === 'vault' || quickSearchMode === 'inFolder') {
		return (parsedQuery?.text.trim().length ?? 0) > 0;
	} else if (quickSearchMode === 'inFile') {
		return (inFileSearch?.text.trim().length ?? 0) > 0;
	} else if (quickSearchMode === 'goToLine') {
		const line = goToLine?.line;
		return line !== undefined && Number.isInteger(line) && line > 0;
	}
	return false;
};

/**
 * Extract heading title from a markdown line
 */
function extractHeadingTitle(line: string): string | null {
	const trimmed = line.trim();
	if (trimmed.startsWith('#')) {
		// Remove leading # and spaces
		const headingText = trimmed.replace(/^#+\s*/, '');
		return headingText || null;
	}
	return null;
}

/**
 * Find the most recent heading title before the given line index
 */
function findRecentHeadingTitle(lines: string[], currentIndex: number): string | null {
	// Search backwards from current line to find the most recent heading
	for (let i = currentIndex; i >= 0; i--) {
		const heading = extractHeadingTitle(lines[i]);
		if (heading) {
			return heading;
		}
	}
	return null;
}

/**
 * Perform in-file search by reading file content and using string matching
 */
async function performInFileSearch(text: string, filePath: string): Promise<{ results: SearchResultItem[]; duration: number }> {
	const startTime = Date.now();

	try {
		const fileContent = await readFileAsText(filePath);
		if (!fileContent) {
			return { results: [], duration: Date.now() - startTime };
		}

		const lines = fileContent.split('\n');
		const results: SearchResultItem[] = [];
		const searchText = text.toLowerCase();

		// Calculate character offsets for each line
		let charOffset = 0;
		const lineOffsets: number[] = [];
		for (let i = 0; i < lines.length; i++) {
			lineOffsets.push(charOffset);
			charOffset += lines[i].length + 1; // +1 for newline
		}

		// Search through each line
		lines.forEach((line, index) => {
			if (!line.toLowerCase().includes(searchText)) {
				return;
			}

			// Find the most recent heading title before this line
			const recentHeadingTitle = findRecentHeadingTitle(lines, index);
			// If no heading found, show line number
			const displayTitle = recentHeadingTitle || `Line ${index + 1}`;

			results.push({
				id: `${filePath}:${index + 1}`,
				path: filePath,
				title: displayTitle,
				type: 'heading',
				lastModified: Date.now(),
				highlight: {
					text: line.toLowerCase(),
					highlights: [{
						start: line.toLowerCase().indexOf(searchText),
						end: line.toLowerCase().indexOf(searchText) + searchText.length
					}]
				},
				loc: {
					line: index + 1, // 1-based line number
					charOffset: lineOffsets[index]
				}
			});
		});

		return { results, duration: Date.now() - startTime };
	} catch (error) {
		console.error('In-file search failed:', error);
		return { results: [], duration: Date.now() - startTime };
	}
}

/**
 * Perform go-to-line operation by opening file and navigating to line
 */
async function performGoToLine(lineNumber: number, filePath: string): Promise<{ results: SearchResultItem[]; duration: number }> {
	const startTime = Date.now();

	try {
		// Validate line number - should be a positive integer
		if (!Number.isInteger(lineNumber) || lineNumber < 1) {
			throw new Error(`Invalid line number: ${lineNumber}. Line numbers must be positive integers.`);
		}

		// Read file content to get the target line
		const fileContent = await readFileAsText(filePath);
		if (!fileContent) {
			throw new Error(`Could not read file: ${filePath}`);
		}

		const lines = fileContent.split('\n');

		// Validate line number is within file bounds
		if (lineNumber > lines.length) {
			throw new Error(`Line number ${lineNumber} exceeds file length (${lines.length} lines)`);
		}

		// Get the target line (0-indexed)
		const targetLineIndex = lineNumber - 1;
		const targetLine = lines[targetLineIndex];

		// Calculate character offset for the target line
		let charOffset = 0;
		for (let i = 0; i < targetLineIndex; i++) {
			charOffset += lines[i].length + 1; // +1 for newline
		}

		// Find the most recent heading title before this line
		const recentHeadingTitle = findRecentHeadingTitle(lines, targetLineIndex);
		const displayTitle = recentHeadingTitle || `Line ${lineNumber}`;

		// Create a search result item for the target line
		const result: SearchResultItem = {
			id: `goto:${filePath}:${lineNumber}`,
			path: filePath,
			title: displayTitle,
			type: 'heading',
			lastModified: Date.now(),
			content: targetLine, // Full content of the target line
			highlight: null, // No search highlighting for go-to-line
			loc: {
				line: lineNumber, // 1-based line number
				charOffset: charOffset
			}
		};

		// Convert to 0-indexed line number and open file at line
		const zeroIndexedLine = Math.max(0, lineNumber - 1);
		const app = AppContext.getInstance().app;

		// Open file and scroll to line
		openFileAtLine(app, filePath, zeroIndexedLine, false);

		return {
			results: [result],
			duration: Date.now() - startTime
		};

	} catch (error) {
		console.error('Go to line failed:', error);
		return { results: [], duration: Date.now() - startTime };
	}
}

/**
 * Custom hook for vault search data fetching logic.
 * Handles both recent files fetching and search with debouncing.
 * Special handling for in-file search and go-to-line operations.
 */
export const useVaultSearch = () => {
	const { searchClient } = useServiceContext();
	const { quickSearchMode, inFileSearch, goToLine, parsedQuery, setLastSearchData, setIsSearching } = useVaultSearchStore();
	const hasSearchQuery = useHasSearchQuery();

	// avoid duplicate search
	const currentSearchId = useRef<string | null>(null);

	// Handle data fetching: recent files or search results
	useEffect(() => {
		if (!searchClient) {
			console.warn('[useVaultSearch] Search client is not ready yet');
			return;
		}

		if (!hasSearchQuery) {
			// Get recent files
			let cancelled = false;
			(async () => {
				try {
					const items = await searchClient.getRecent(DEFAULT_RECENT_SEARCH_RESULTS_COUNT);
					if (!cancelled) setLastSearchData({ results: items, duration: null });
				} catch (e) {
					console.error('Get recent failed:', e);
					if (!cancelled) setLastSearchData({ results: [], duration: null });
				}
			})();
			currentSearchId.current = null;
			setIsSearching(false);
			return () => {
				cancelled = true;
			};
		} else {
			// Handle different search modes
			if (quickSearchMode === 'inFile' && inFileSearch) {
				// Perform in-file search by reading file content directly
				const searchId = `inFile-${inFileSearch.text}-${inFileSearch.path}`;
				currentSearchId.current = searchId;

				setIsSearching(true);

				let cancelled = false;
				const timeoutId = setTimeout(async () => {
					try {
						const res = await performInFileSearch(inFileSearch.text, inFileSearch.path);
						if (!cancelled && currentSearchId.current === searchId) {
							setLastSearchData({ results: res.results, duration: res.duration });
							setIsSearching(false);
						}
					} catch (e) {
						console.error('In-file search failed:', e);
						if (!cancelled && currentSearchId.current === searchId) {
							setLastSearchData({ results: [], duration: 0 });
							setIsSearching(false);
						}
					}
				}, 300); // Shorter debounce for in-file search

				return () => {
					cancelled = true;
					clearTimeout(timeoutId);
				};
			} else if (quickSearchMode === 'goToLine' && goToLine) {
				// Perform go-to-line operation with a short delay to allow user to finish typing
				const searchId = `goToLine-${goToLine.line}-${goToLine.path}`;
				currentSearchId.current = searchId;

				// Use a shorter delay than other search modes to make it responsive
				// but still allow user to finish typing multi-digit line numbers
				setTimeout(() => {
					if (currentSearchId.current !== searchId) return; // Cancelled

					setIsSearching(true);

					(async () => {
						try {
							const result = await performGoToLine(goToLine.line, goToLine.path);
							if (currentSearchId.current === searchId) {
								setLastSearchData(result);
								setIsSearching(false);
							}
						} catch (e) {
							console.error('Go to line failed:', e);
							if (currentSearchId.current === searchId) {
								setLastSearchData({ results: [], duration: 0 });
								setIsSearching(false);
							}
						}
					})();
				}, 500); // 500ms delay - shorter than vault search but prevents immediate triggering
			} else if (parsedQuery) {
				// Perform regular vault/folder search
				const searchId = `${parsedQuery.text}-${parsedQuery.scopeMode}-${parsedQuery.scopeValue}`;
				currentSearchId.current = searchId;

				setIsSearching(true);

				let cancelled = false;
				const timeoutId = setTimeout(async () => {
					try {
						const res = await searchClient.search(parsedQuery);
						if (!cancelled && currentSearchId.current === searchId) {
							setLastSearchData({ results: res.items, duration: res.duration ?? null });
							setIsSearching(false);
						}
					} catch (e) {
						console.error('Vault search failed:', e);
						if (!cancelled && currentSearchId.current === searchId) {
							setLastSearchData({ results: [], duration: null });
							setIsSearching(false);
						}
					}
				}, 500); // Wait 500ms after user stops typing

				return () => {
					cancelled = true;
					clearTimeout(timeoutId);
				};
			} else {
				// No valid search query
				setLastSearchData({ results: [], duration: null });
				setIsSearching(false);
				return;
			}
		}
	}, [hasSearchQuery, quickSearchMode, inFileSearch?.text, inFileSearch?.path, goToLine?.line, goToLine?.path, parsedQuery?.text, parsedQuery?.scopeMode, parsedQuery?.scopeValue, searchClient, setLastSearchData, setIsSearching]);

	return {
		currentSearchId,
	};
};