/**
 * Quick Search host adapter for the shared Result Browser List row.
 *
 * Presentation lives in `@/ui/component/result-browser/list/ResultBrowserListRow`.
 * This adapter binds the Quick-Search-only concerns the shared row must not
 * know about: `vaultSearchStore` density, click telemetry (`SearchClickRepo`),
 * behavior recording, and the vault open/new-tab policy. Keeping the export
 * name `SearchResultRow` means the tab wiring is unchanged.
 */
import React from 'react';
import type { SearchResultItem } from '@/core/search/searchTypes';
import { ResultBrowserListRow } from '@/ui/component/result-browser/list/ResultBrowserListRow';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { useVaultSearchStore } from '../store';
import { resolveListOpenNewTab } from '../QuickSearchResultBrowserAdapter';

function recordSearchClick(currentQuery: string, path: string, rank: number): void {
	try {
		const db = sqliteStoreManager.getDatabase('vault');
		if (db && currentQuery) {
			const clickRepo = new SearchClickRepo(db);
			const queryStems = SearchClickRepo.buildQueryStems(currentQuery.split(/\s+/).filter(Boolean));
			if (queryStems) clickRepo.record(queryStems, path, rank);
		}
	} catch { /* non-critical */ }
}

/**
 * Individual search result row — Quick Search binding of the shared controlled
 * row. Owns telemetry + open policy; delegates rendering.
 */
export const SearchResultRow: React.FC<{
	currentQuery: string;
	index: number;
	result: SearchResultItem;
	isSelected: boolean;
	onSelect: (index: number) => void;
	itemRef: (el: HTMLDivElement | null) => void;
	onClose?: () => void;
	newTab?: boolean;
	onInspect?: (result: SearchResultItem) => void;
}> = ({ currentQuery, result, index, isSelected, onSelect, itemRef, onClose, newTab, onInspect }) => {
	const { vaultNavigation } = useServiceContext();
	const density = useVaultSearchStore((s) => s.resultDensity);

	// 800ms hover threshold feeds the AI-Suggest behavior recorder (filters out
	// incidental hovers). Owned by the adapter — the shared row is telemetry-free.
	const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const startHover = (r: SearchResultItem) => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(() => {
			behaviorRecorder.push('focusedFile', { path: r.path, durationMs: 800 });
		}, 800);
	};
	const endHover = () => {
		if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
	};
	React.useEffect(() => () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }, []);

	const handleOpen = (r: SearchResultItem, opts: { newTab: boolean; viaNewTabButton?: boolean }) => {
		recordSearchClick(currentQuery, r.path, index);
		if (!opts.viaNewTabButton) behaviorRecorder.push('openedFile', { path: r.path });
		// The dedicated new-tab button always forces a new tab; otherwise the
		// mode default (`newTab` prop) wins over the body-click modifier — the
		// pre-extraction behavior, resolved through the shared adapter contract.
		const openInNewTab = resolveListOpenNewTab(opts, newTab);
		createOpenSourceCallback(onClose, openInNewTab, vaultNavigation)(r);
	};

	return (
		<ResultBrowserListRow
			result={result}
			index={index}
			isSelected={isSelected}
			density={density}
			highlightQuery={currentQuery}
			itemRef={itemRef}
			onSelect={onSelect}
			onOpen={handleOpen}
			onInspect={onInspect}
			onHoverStart={startHover}
			onHoverEnd={endHover}
		/>
	);
};
