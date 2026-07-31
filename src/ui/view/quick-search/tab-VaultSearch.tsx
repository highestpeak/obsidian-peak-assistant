import React, { useEffect, useRef } from 'react';
import { Bug, Filter, SearchX } from 'lucide-react';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';
import { EmptyState } from '../../component/mine/EmptyState';
import { ResultBrowserFooterHints } from '@/ui/component/result-browser';
import { SearchResultRow } from './components/VaultSearchResult';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from './store';
import { useSharedStore } from './store';
import { useVaultSearch, useSearchQuery } from './hooks/useVaultSearch';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useHasSearchQuery } from './hooks/useVaultSearch';
import { ModeHelpList } from './components/ModeHelpList';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SearchUpgradePrompt } from './components/SearchUpgradePrompt';
import { RecentQueriesDropdown } from './components/RecentQueriesDropdown';
import { ResultGraphView } from './components/result-graph/ResultGraphView';
import { ResultTreeView } from './components/result-tree/ResultTreeView';
import { useOpenHubGraphSubview } from './hooks/useOpenHubGraphSubview';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_A11Y_STRINGS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

const NoResultsState: React.FC = () => (
	<EmptyState
		icon={SearchX}
		title="No results found"
		description="Try different keywords or check your spelling, or try AI Analysis."
	/>
);

const NoRecentlyAccessedState: React.FC = () => (
	<EmptyState
		icon={SearchX}
		title="No recently accessed files"
		description="Start searching or open some files to see them here. Run “Update index” from Settings → Advanced → Maintenance if results look stale."
	/>
);

/**
 * Compact filter-syntax hint. Rendered in the "Recently opened" browse mode
 * and again at the tail of a long results list. Wording is intentionally
 * light — pointing at existing grammar (see `query-parser.ts`), not asking
 * the user to memorise anything. Part of the 2026-07-07 ranking research
 * doc's recommended UI change.
 */
const FilterSyntaxHint: React.FC<{ variant: 'browse' | 'results' }> = ({ variant }) => {
	const chip = 'pktw-inline-flex pktw-items-center pktw-rounded pktw-bg-pk-surface-2 pktw-px-1.5 pktw-py-0.5 pktw-font-mono pktw-text-pk-xs pktw-text-pk-text-secondary';
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-1.5 pktw-text-pk-sm pktw-text-pk-text-tertiary">
			<Filter className="pktw-h-3 pktw-w-3 pktw-shrink-0 pktw-opacity-70" />
			<span className="pktw-shrink-0">
				{variant === 'browse' ? 'Narrow it down:' : 'Too many results? Try:'}
			</span>
			<span className={chip}>folder:研究</span>
			<span className={chip}>tag:idea</span>
			<span className={chip}>ext:md</span>
			<span className={chip}>-drafts</span>
			<span className={chip}>"exact phrase"</span>
		</div>
	);
};

/** Show the tail syntax hint once the result count is worth filtering. */
const RESULT_HINT_THRESHOLD = 15;

/** Footer hints for vault search tab. Exported for use in SearchModal footer. */
export const VaultSearchFooterHints = ResultBrowserFooterHints;

interface VaultSearchTabProps {
	onClose?: () => void;
	/** Callback when a result is selected while inspector is open. */
	onSelectForInspector?: (path: string) => void;
	/** When set, selects the result matching this path (from inspector navigation). */
	navigateToPath?: string | null;
	/** Move focus into the Inspector after the explicit Right-arrow command. */
	onRequestInspectorFocus?: () => void;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({
	onClose,
	onSelectForInspector,
	navigateToPath,
	onRequestInspectorFocus,
}) => {
	const { vaultNavigation, debugTracePort, vaultStats } = useServiceContext();
	const { quickSearchMode, isSearching, lastSearchResults: displayedResults, fuzzyCorrection, parsedQuery } = useVaultSearchStore();
	const inspectorOpen = useVaultSearchStore((s) => s.inspectorOpen);
	const resultView = useVaultSearchStore((s) => s.resultView);
	const hasSearchQuery = useHasSearchQuery();
	const searchQuery = useSearchQuery();
	const [selectedIndex, setSelectedIndex] = React.useState(-1);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Use vault search hook for data fetching
	const { lastDebugRunIdRef } = useVaultSearch();
	const copyDebugTrace = useDebugTraceCopy();
	// T7: Cmd+click on a hub anchor in Result Graph View pins the result set
	// to that hub's constituents and keeps `resultView === 'graph'`.
	const openHubGraphSubview = useOpenHubGraphSubview();

	// Debounced selection tracking for inspector panel
	useEffect(() => {
		if (!inspectorOpen || selectedIndex < 0) return;
		const result = displayedResults[selectedIndex];
		if (!result?.path) return;
		const t = setTimeout(() => {
			onSelectForInspector?.(result.path);
		}, 150);
		return () => clearTimeout(t);
	}, [selectedIndex, inspectorOpen]);

	// Task 12: Navigate to a path from inspector (select matching result)
	useEffect(() => {
		if (!navigateToPath) return;
		const idx = displayedResults.findIndex((r) => r.path === navigateToPath);
		if (idx >= 0) {
			setSelectedIndex(idx);
		}
	}, [navigateToPath]);

	// Task 13: Pre-select first result on open when no query
	useEffect(() => {
		if (!hasSearchQuery && displayedResults.length > 0 && selectedIndex === -1) {
			setSelectedIndex(0);
		}
	}, [displayedResults.length, hasSearchQuery]);

	useRovingComposite(scrollContainerRef, {
		itemSelector: '[data-result-browser-row]',
		orientation: 'vertical',
		rememberBy: 'data-peak-focus-id',
		onActiveItem: (item) => {
			const index = Number(item.dataset.resultIndex);
			if (Number.isInteger(index)) setSelectedIndex(index);
		},
	});

	// Scroll to selected item when selection changes
	useEffect(() => {
		const selectedItem = itemRefs.current[selectedIndex];
		if (selectedItem && scrollContainerRef.current) {
			const container = scrollContainerRef.current;
			const itemTop = selectedItem.offsetTop;
			const itemHeight = selectedItem.offsetHeight;
			const containerTop = container.scrollTop;
			const containerHeight = container.clientHeight;

			// Scroll if item is above visible area
			if (itemTop < containerTop) {
				container.scrollTo({ top: itemTop, behavior: 'smooth' });
			}
			// Scroll if item is below visible area
			else if (itemTop + itemHeight > containerTop + containerHeight) {
				container.scrollTo({ top: itemTop + itemHeight - containerHeight, behavior: 'smooth' });
			}
		}
	}, [selectedIndex]);

	// T3: graph view is only meaningful for `all` and `heading` — `help`
	// has no result payload to graph.
	const showGraph = resultView === 'graph'
		&& (quickSearchMode === 'all' || quickSearchMode === 'heading');
	// Same for tree view (2026-07-08).
	const showTree = resultView === 'tree'
		&& (quickSearchMode === 'all' || quickSearchMode === 'heading');

	// Heading mode moved to Copilot Modal's Atlas tab — Vault Search no
	// longer renders `HeadingModeContainer` even if the query happens to
	// parse into 'heading' mode.

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0 pktw-overflow-hidden">
			{/* Results — list or (T4) graph. Inspector is rendered side-by-side in parent. */}
			<div
				ref={scrollContainerRef}
				className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto"
				style={{ flexBasis: 0, minHeight: 0 }}
				role={showTree || showGraph ? undefined : 'listbox'}
				aria-label={PEAK_KEYBOARD_A11Y_STRINGS.vaultSearchResults}
				onKeyDown={(event) => {
					if (event.key !== 'Escape') return;
					const view = useVaultSearchStore.getState().resultView;
					if (view !== 'tree' && view !== 'graph') return;
					event.preventDefault();
					event.stopPropagation();
					useVaultSearchStore.getState().setResultView('list');
				}}
			>
				{showGraph ? (
					<ResultGraphView
						onClose={onClose}
						onOpenHubGraphSubview={(hubNodeId) => void openHubGraphSubview(hubNodeId)}
						onSelectForInspector={onSelectForInspector}
					/>
				) : showTree ? (
					<ResultTreeView
						onClose={onClose}
						onSelectForInspector={onSelectForInspector}
					/>
				) : quickSearchMode === 'help' ? (
					<ModeHelpList
						onSelectMode={(prefix) => {
							useSharedStore.getState().setVaultSearchQuery(prefix);
						}}
						selectedIndex={selectedIndex}
						onSelectIndex={setSelectedIndex}
					/>
				) : (
					<>
						<div className={cn(
							'pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-0.5 pktw-z-20',
							isSearching ? 'line-progress-loader' : 'pktw-bg-transparent'
						)} />
						{fuzzyCorrection && (
							<div className="pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-muted-foreground pktw-bg-muted/30">
								Showing results for "<span className="pktw-font-medium">{fuzzyCorrection}</span>"
								{' '}(similar to "{parsedQuery?.text || searchQuery.text}")
							</div>
						)}
						{/* Empty State - No Results */}
						{hasSearchQuery && !isSearching && displayedResults.length === 0 ? (
							<NoResultsState />
						) : !isSearching && displayedResults.length === 0 ? (
							<NoRecentlyAccessedState />
						) : (
							<>
								{!hasSearchQuery && (
									<>
										<RecentQueriesDropdown
											queries={useSharedStore.getState().recentQueries}
											onSelect={(query) => {
												useSharedStore.getState().setVaultSearchQuery(query);
											}}
											onClear={() => useSharedStore.getState().clearRecentQueries()}
										/>
										<FilterSyntaxHint variant="browse" />
										<div className="pktw-px-4 pktw-pb-2">
											<span className="pktw-text-xs pktw-text-pk-text-tertiary">Recently opened</span>
										</div>
									</>
								)}
								{displayedResults.map((result, index) => (
									<SearchResultRow
										currentQuery={searchQuery.text}
										key={result.id}
										index={index}
										result={result}
										isSelected={index === selectedIndex}
										onSelect={setSelectedIndex}
										itemRef={(el) => {
											itemRefs.current[index] = el;
										}}
										onClose={onClose}
										newTab={quickSearchMode !== 'heading'}
										onInspect={(selected) => {
											setSelectedIndex(index);
											useVaultSearchStore.getState().setInspectorOpen(true);
											onSelectForInspector?.(selected.path);
											onRequestInspectorFocus?.();
										}}
									/>
								))}
								{hasSearchQuery && !isSearching && displayedResults.length >= RESULT_HINT_THRESHOLD && (
									<FilterSyntaxHint variant="results" />
								)}
								{hasSearchQuery && !isSearching && displayedResults.length > 0 && debugTracePort?.isEnabled() && (
									<div className="pktw-flex pktw-justify-end pktw-px-3 pktw-py-1.5">
										<button
											type="button"
											className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-pk-foreground-faint hover:pktw-text-pk-foreground pktw-transition"
											onClick={() => void copyDebugTrace(lastDebugRunIdRef.current)}
											aria-label="Copy debug trace for this search"
										>
											<Bug className="pktw-w-3 pktw-h-3" />
											Copy search trace
										</button>
									</div>
								)}
								<SearchUpgradePrompt />
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
};
