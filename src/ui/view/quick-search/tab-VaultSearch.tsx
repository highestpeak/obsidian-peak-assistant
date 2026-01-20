import React, { useEffect, useRef } from 'react';
import { Sparkles, SearchX } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { SearchResultRow } from './components/VaultSearchResult';
import { formatDuration } from '@/core/utils/format-utils';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from './store';
import { useVaultSearch, useSearchQuery } from './hooks/useVaultSearch';
import { createOpenSourceCallback } from './callbacks/open-source-file';
import { useHasSearchQuery } from './hooks/useVaultSearch';
import { useSharedStore } from './store/sharedStore';
import { useAIAnalysisStore } from './store';

/**
 * Empty state when no search results found
 */
const NoResultsState: React.FC<{ mode?: string }> = ({ mode }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-2">
			<SearchX className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338]  pktw-text-lg">
			{mode === 'goToLine' ? 'Line number out of range' : 'No results found'}
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4">
			{mode === 'goToLine'
				? 'Please enter a valid line number within the file range.'
				: 'Try different keywords or check your spelling. Or report the case to the developer. Or try ask AI ↘︎ to help you. 🥰'
			}
		</span>
	</div>
);

const NoRecentlyAccessedState: React.FC = () => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<SearchX className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			No recently accessed files
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-max-w-md">
			Start searching or open some files to see them here.
		</span>
	</div>
);

/**
 * Footer hints section for vault search tab
 */
const VaultSearchFooterHints: React.FC = () => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="↑↓" description="navigate" />
		<KeyboardShortcut keys="Enter" description="open" />
		<KeyboardShortcut keys="#" description="in-file" />
		<KeyboardShortcut keys=":" description="to line" />
		{/* <KeyboardShortcut keys="@" description="folder" /> */}
	</div>
);

interface VaultSearchTabProps {
	onClose?: () => void;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({ onClose }) => {
	const { quickSearchMode, lastSearchDuration, isSearching, lastSearchResults: displayedResults } = useVaultSearchStore();
	const hasSearchQuery = useHasSearchQuery();
	const searchQuery = useSearchQuery();
	const [selectedIndex, setSelectedIndex] = React.useState(-1);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const { setActiveTab } = useSharedStore();
	const { incrementTriggerAnalysis } = useAIAnalysisStore();

	// Use vault search hook for data fetching
	useVaultSearch();

	// Handle "Ask AI" button click
	const vaultSearchResultToAskAI = () => {
		setActiveTab('ai');
		// Trigger AI analysis immediately after switching to AI tab
		incrementTriggerAnalysis();
	};

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

			const maxIndex = displayedResults.length - 1;
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
					// Open selected result
					const selectedResult = displayedResults[selectedIndex];
					if (selectedResult) {
						await createOpenSourceCallback(onClose, quickSearchMode !== 'goToLine' && quickSearchMode !== 'inFile')(selectedResult);
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
			{/* Results List */}
			<div ref={scrollContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto" style={{ flexBasis: 0, minHeight: 0 }}>
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
					// search results
					<>
						{/* Show hint text for recently accessed */}
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
			</div>

			{/* Footer */}
			<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasSearchQuery && (
						<>
							{isSearching ? (
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
							)}
						</>
					)}
					<Button
						onClick={vaultSearchResultToAskAI}
						size="sm"
						className="pktw-px-3 pktw-py-1 pktw-text-xs pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md"
					>
						<Sparkles className="pktw-w-3 pktw-h-3" />
						Ask AI
					</Button>
				</div>
			</div>
		</div>
	);
};
