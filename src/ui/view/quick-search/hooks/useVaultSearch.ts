import { useEffect, useRef } from 'react';
import { DEFAULT_RECENT_SEARCH_RESULTS_COUNT } from '@/core/constant';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { DEFAULT_SEARCH_QUERY, useVaultSearchStore } from '../store/vaultSearchStore';
import { SearchQuery, SearchResultItem } from '@/core/search/searchTypes';

// T1 (2026-07-07): the previous polymorphic return type
// (InFileSearch | GoToLine | SearchQuery) and the dedicated
// performInFileSearch / performGoToLine helpers were deleted along with
// the inFolder / goToLine quick-search modes. Heading mode reuses this
// shared SearchClient path until T5 lands the outline-tree service.

export const useSearchQuery = (): SearchQuery => {
	const { parsedQuery } = useVaultSearchStore();
	return parsedQuery ?? DEFAULT_SEARCH_QUERY;
};

export const useHasSearchQuery = () => {
	const { parsedQuery } = useVaultSearchStore();
	return (parsedQuery?.text.trim().length ?? 0) > 0;
};

/**
 * Custom hook for vault search data fetching logic.
 * Handles both recent files fetching and search with debouncing.
 *
 * T0/T1 (2026-07-07): dropped the mode-specific `performInFileSearch` /
 * `performGoToLine` branches. All modes now share the SearchClient path.
 * T5 will reintroduce heading-mode-specific behavior via the new outline
 * tree service.
 */
export const useVaultSearch = () => {
	const { searchClient, debugTracePort } = useServiceContext();
	const lastDebugRunIdRef = useRef<string | null>(null);
	const { parsedQuery, setLastSearchData, setIsSearching } = useVaultSearchStore();
	const pinnedResultDocIds = useVaultSearchStore((s) => s.pinnedResultDocIds);
	const hasSearchQuery = useHasSearchQuery();

	// avoid duplicate search
	const currentSearchId = useRef<string | null>(null);

	// Handle data fetching: recent files or search results
	useEffect(() => {
		if (!searchClient) {
			console.warn('[useVaultSearch] Search client is not ready yet');
			return;
		}

		// T7 (2026-07-07 hub graph subview): when a hub pin is active we
		// short-circuit the regular pipeline. Empty query → return every
		// pinned member (stub SearchResultItems from path). Non-empty query →
		// run the shared SearchClient path, then post-filter to the pin set
		// so query text keeps filtering *within* the pin.
		if (pinnedResultDocIds) {
			const pinSet = new Set(pinnedResultDocIds);
			currentSearchId.current = null;
			setIsSearching(false);

			if (!hasSearchQuery || !parsedQuery) {
				setLastSearchData({
					results: pinnedResultDocIds.map((path) => buildStubResultFromPath(path)),
					duration: null,
				});
				return;
			}

			let cancelled = false;
			(async () => {
				try {
					const res = await searchClient.search(parsedQuery, false);
					if (cancelled) return;
					const filtered = res.items.filter((item) => pinSet.has(item.path));
					setLastSearchData({
						results: filtered,
						duration: res.duration ?? null,
						fuzzyCorrection: res.fuzzyCorrection ?? null,
					});
				} catch (e) {
					console.error('Vault search (pinned) failed:', e);
					if (!cancelled) setLastSearchData({ results: [], duration: null });
				}
			})();
			return () => { cancelled = true; };
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
		}

		if (!parsedQuery) {
			// No valid search query (e.g. help mode)
			setLastSearchData({ results: [], duration: null });
			setIsSearching(false);
			return;
		}

		// Perform regular vault search (heading mode currently reuses the same
		// pipeline until T5 lands the dedicated outline service).
		const searchId = `${parsedQuery.text}-${parsedQuery.scopeMode}-${parsedQuery.scopeValue}`;
		currentSearchId.current = searchId;

		setIsSearching(true);

		let cancelled = false;
		const timeoutId = setTimeout(async () => {
			const debugRun = debugTracePort?.isEnabled()
				? debugTracePort.startRun({
					surface: 'search',
					capabilityId: 'search.query',
				})
				: null;
			try {
				const res = await searchClient.search(parsedQuery, false, debugRun ?? undefined);
				if (debugRun) {
					debugRun.finish('completed');
					lastDebugRunIdRef.current = debugRun.runId;
				}
				if (!cancelled && currentSearchId.current === searchId) {
					setLastSearchData({ results: res.items, duration: res.duration ?? null, fuzzyCorrection: res.fuzzyCorrection ?? null });
					setIsSearching(false);
				}
			} catch (e) {
				if (debugRun) {
					debugRun.finish('failed');
					lastDebugRunIdRef.current = debugRun.runId;
				}
				console.error('Vault search failed:', e);
				if (!cancelled && currentSearchId.current === searchId) {
					setLastSearchData({ results: [], duration: null });
					setIsSearching(false);
				}
			}
		}, 400); // Wait 400ms after user stops typing

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	}, [hasSearchQuery, parsedQuery?.text, parsedQuery?.scopeMode, parsedQuery?.scopeValue, pinnedResultDocIds, searchClient, setLastSearchData, setIsSearching]);

	return {
		currentSearchId,
		lastDebugRunIdRef,
	};
};

/**
 * T7: minimal SearchResultItem shim for pinned constituents when there is no
 * query text. `ResultGraphView` reads `docId ?? id` and `path`, and its
 * subgraph builder resolves node metadata off the doc path — so this stub is
 * enough for the graph view. The list view still shows the row title from
 * `path` if a user flips back to list while pinned.
 */
function buildStubResultFromPath(path: string): SearchResultItem {
	const label = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
	return {
		id: path,
		type: 'markdown',
		title: label,
		path,
		lastModified: 0,
	};
}
