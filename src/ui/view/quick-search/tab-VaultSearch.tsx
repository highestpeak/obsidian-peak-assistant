import React, { useEffect, useRef } from 'react';
import { SearchX, Database } from 'lucide-react';
import { KeyboardShortcut } from '../../component/mine/KeyboardShortcut';
import { EmptyState } from '../../component/mine/EmptyState';
import { SearchResultRow } from './components/VaultSearchResult';
import { formatDuration } from '@/core/utils/format-utils';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from './store';
import { useSharedStore } from './store';
import { useVaultSearch, useSearchQuery } from './hooks/useVaultSearch';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useHasSearchQuery } from './hooks/useVaultSearch';
import { ModeHelpList, MODE_COUNT } from './components/ModeHelpList';

const NoResultsState: React.FC<{ mode?: string }> = ({ mode }) => (
	<EmptyState
		icon={SearchX}
		title={mode === 'goToLine' ? 'Line number out of range' : 'No results found'}
		description={mode === 'goToLine'
			? 'Please enter a valid line number within the file range.'
			: 'Try different keywords or check your spelling, or try AI Analysis.'}
	/>
);

const NoRecentlyAccessedState: React.FC = () => (
	<EmptyState
		icon={SearchX}
		title="No recently accessed files"
		description="Start searching or open some files to see them here. Run Search: reindex vault to enable full-text search."
	/>
);

/**
 * Footer hints section for vault search tab
 */
/** Footer hints for vault search tab. */
const VaultSearchFooterHints: React.FC = () => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="↑↓" description="navigate" />
		<KeyboardShortcut keys="Enter" description="open" />
		<KeyboardShortcut keys="→" description="inspector" />
		<KeyboardShortcut keys="#" description="in-file" />
		<KeyboardShortcut keys="?" description="modes" />
	</div>
);

interface VaultSearchTabProps {
	onClose?: () => void;
	/** When true, hide search results and show note-context hint. */
	inspectorOpen?: boolean;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({ onClose, inspectorOpen }) => {
	const { quickSearchMode, lastSearchDuration, isSearching, lastSearchResults: displayedResults } = useVaultSearchStore();
	const hasSearchQuery = useHasSearchQuery();
	const searchQuery = useSearchQuery();
	const [selectedIndex, setSelectedIndex] = React.useState(-1);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	// Use vault search hook for data fetching
	useVaultSearch();

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			// Navigation keys (ArrowUp, ArrowDown, Enter) should work even when focus is in input
			// Other keys should be ignored if focus is in input/textarea
			const isNavigationKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter';
			if (
				(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
				!isNavigationKey
			) {
				return;
			}

			const currentMode = useVaultSearchStore.getState().quickSearchMode;
			const maxIndex = currentMode === 'help' ? MODE_COUNT - 1 : displayedResults.length - 1;
			if (maxIndex < 0) return;

			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
					break;
				case 'ArrowDown':
					e.preventDefault();
					setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
					break;
				case 'Enter': {
					e.preventDefault();
					if (currentMode === 'help') {
						const prefixes = ['', '#', '@', ':', '?'];
						const prefix = prefixes[selectedIndex] ?? '';
						useSharedStore.getState().setVaultSearchQuery(prefix);
						break;
					}
					// Open selected result
					const selectedResult = displayedResults[selectedIndex];
					if (selectedResult) {
						await createOpenSourceCallback(onClose, currentMode !== 'goToLine' && currentMode !== 'inFile')(selectedResult);
					}
					break;
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [selectedIndex, displayedResults]);

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

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0 pktw-overflow-hidden">
			{/* Results List - hidden when Inspector is open so user sees note context only */}
			<div ref={scrollContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto" style={{ flexBasis: 0, minHeight: 0 }}>
				{inspectorOpen ? (
					<></>
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
						{/* Empty State - No Results */}
						{hasSearchQuery && !isSearching && displayedResults.length === 0 ? (
							<NoResultsState mode={quickSearchMode} />
						) : !isSearching && displayedResults.length === 0 ? (
							<NoRecentlyAccessedState />
						) : (
							<>
								{!hasSearchQuery && (
									<div className="pktw-px-4 pktw-pb-2">
										<span className="pktw-text-xs pktw-text-[#999999]">Recently accessed</span>
									</div>
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
										newTab={quickSearchMode !== 'goToLine' && quickSearchMode !== 'inFile'}
									/>
								))}
							</>
						)}
					</>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasSearchQuery && (
						isSearching ? (
							<span className="pktw-text-xs pktw-text-[#999999]">Searching...</span>
						) : (
							<>
								<span className="pktw-text-xs pktw-text-[#999999]">
									{displayedResults.length} result{displayedResults.length !== 1 ? 's' : ''}
								</span>
								{lastSearchDuration !== null && (
									<span className="pktw-text-xs pktw-text-[#999999]">
										• <strong className="pktw-text-[#2e3338]">{formatDuration(lastSearchDuration)}</strong>
									</span>
								)}
							</>
						)
					)}
				</div>
			</div>
		</div>
	);
};
