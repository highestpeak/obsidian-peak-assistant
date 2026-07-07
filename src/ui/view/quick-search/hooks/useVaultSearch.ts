import { useEffect, useRef } from 'react';
import { DEFAULT_RECENT_SEARCH_RESULTS_COUNT } from '@/core/constant';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { DEFAULT_SEARCH_QUERY, useVaultSearchStore } from '../store/vaultSearchStore';
import { SearchQuery } from '@/core/search/searchTypes';

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
		}, 200); // Wait 200ms after user stops typing

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	}, [hasSearchQuery, parsedQuery?.text, parsedQuery?.scopeMode, parsedQuery?.scopeValue, searchClient, setLastSearchData, setIsSearching]);

	return {
		currentSearchId,
		lastDebugRunIdRef,
	};
};
