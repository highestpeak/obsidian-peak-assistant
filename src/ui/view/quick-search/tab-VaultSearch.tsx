import React, { useEffect, useRef } from 'react';
import { ChevronRight, Sparkles, SearchX } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { formatRelativeTime } from '@/ui/view/shared/date-utils';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import type { SearchQuery, SearchResultItem as SearchResultItemType } from '@/service/search/types';
import type { SearchClient } from '@/service/search/SearchClient';
import { useServiceContext } from '@/ui/context/ServiceContext';

// Mock recently accessed files
const mockRecentlyAccessed: SearchResultItemType[] = [
	{
		id: 'ra-1',
		type: 'markdown',
		title: 'Daily Notes - 2024-12-15',
		path: 'Daily',
		snippet: { text: 'Today\'s meeting notes and tasks' },
		lastModified: Date.now() - 30 * 60 * 1000, // 30 minutes ago
	},
	{
		id: 'ra-2',
		type: 'markdown',
		title: 'Project Planning',
		path: 'Projects/Active',
		snippet: { text: 'Q1 2025 roadmap and milestones' },
		lastModified: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
	},
	{
		id: 'ra-3',
		type: 'pdf',
		title: 'Research Notes - AI Trends',
		path: 'Research',
		snippet: { text: 'Key findings from recent AI research papers' },
		lastModified: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
	},
	{
		id: 'ra-4',
		type: 'markdown',
		title: 'Meeting Notes - Team Sync',
		path: 'Work/Meetings',
		snippet: { text: 'Weekly team synchronization discussion' },
		lastModified: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
	},
	{
		id: 'ra-5',
		type: 'folder',
		title: 'Personal',
		path: 'Notes',
		snippet: { text: '8 notes inside' },
		lastModified: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
	},
];

/**
 * Filter search results based on query.
 */
const filterResults = (results: SearchResultItemType[], query: string): SearchResultItemType[] => {
	if (!query.trim()) return results;
	const lowerQuery = query.toLowerCase();
	return results.filter(
		(result) =>
			result.title.toLowerCase().includes(lowerQuery) ||
			result.path.toLowerCase().includes(lowerQuery) ||
			result.snippet?.text?.toLowerCase().includes(lowerQuery),
	);
};

/**
 * Highlight matching text in search results
 */
const highlightMatch = (text: string, highlight: string) => {
	if (!highlight) return text;

	const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === highlight.toLowerCase() ? (
					<mark key={i} className="pktw-bg-amber-100 pktw-text-amber-800 pktw-px-0.5 pktw-rounded">
						{part}
					</mark>
				) : (
					<span key={i}>{part}</span>
				),
			)}
		</>
	);
};

/**
 * Empty state when no search results found
 */
const NoResultsState: React.FC<{ searchInput: string }> = ({ searchInput }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<SearchX className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			No results found
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-max-w-md">
			We couldn&apos;t find anything matching &quot;{searchInput}&quot;. Try different keywords or check your spelling.
		</span>
	</div>
);

/**
 * Individual search result item component
 */
const SearchResultRow: React.FC<{
	result: SearchResultItemType;
	index: number;
	isSelected: boolean;
	isSearching: boolean;
	searchQuery: string;
	onSelect: (index: number) => void;
	itemRef: (el: HTMLDivElement | null) => void;
}> = ({ result, index, isSelected, isSearching, searchQuery, onSelect, itemRef }) => (
	<div
		ref={itemRef}
		className={`pktw-relative pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-transition-colors pktw-mb-2 ${
			isSelected ? 'pktw-bg-[#eef2ff]' : 'hover:pktw-bg-[#fafafa]'
		}`}
		onClick={() => onSelect(index)}
	>
		{/* Leading accent bar */}
		<div
			className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-1 pktw-rounded-r-full"
			style={{ backgroundColor: '#7c3aed', opacity: isSelected ? 1 : 0 }}
		/>

		<div className="pktw-flex pktw-items-start pktw-gap-3">
			{/* File Icon */}
			<div className="pktw-flex-shrink-0 pktw-mt-1">{getFileIcon(result.type)}</div>

			{/* Content */}
			<div className="pktw-flex-1 pktw-min-w-0">
				{/* Title and Path */}
				<div className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-mb-1">
					<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-truncate" style={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: '1.2' }}>
						{isSearching ? highlightMatch(result.title, searchQuery) : result.title}
					</span>
					<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
					<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
						{result.path}
					</span>
				</div>

				{/* Snippet */}
				{result.snippet?.text && (
					<span className="pktw-text-sm pktw-text-[#6c757d] pktw-line-clamp-2 pktw-mt-1">
						{isSearching ? highlightMatch(result.snippet.text, searchQuery) : result.snippet.text}
					</span>
				)}
			</div>

			{/* Last Modified Time */}
			<div className="pktw-flex-shrink-0 pktw-ml-4 pktw-text-xs pktw-text-[#999999] pktw-whitespace-nowrap">
				{formatRelativeTime(result.lastModified)}
			</div>
		</div>
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
		<KeyboardShortcut keys="@" description="folder" />
	</div>
);

interface VaultSearchTabProps {
	searchInput: string;
	searchQuery: SearchQuery;
	onSwitchToAI: () => void;
	searchClient: SearchClient | null;
	indexProgress: { processed: number; total?: number } | null;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({ searchInput, searchQuery, onSwitchToAI, searchClient, indexProgress }) => {
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const [remoteResults, setRemoteResults] = React.useState<SearchResultItemType[] | null>(null);
	const [recentResults, setRecentResults] = React.useState<SearchResultItemType[] | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const { app } = useServiceContext();

	// Determine which results to show
	const isSearching = searchQuery.text.trim().length > 0;
	const displayedResults = isSearching
		? (remoteResults ?? [])
		: (recentResults && recentResults.length ? recentResults : mockRecentlyAccessed);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (isSearching) return;
			if (!searchClient) {
				setRecentResults(null);
				return;
			}
			try {
				const items = await searchClient.getRecent(30);
				if (!cancelled) setRecentResults(items);
			} catch (e) {
				console.error('Get recent failed:', e);
				if (!cancelled) setRecentResults(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isSearching, searchClient]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!isSearching) {
				setRemoteResults(null);
				return;
			}
			if (!searchClient) {
				setRemoteResults([]);
				return;
			}
			try {
				const res = await searchClient.search(searchQuery);
				if (!cancelled) setRemoteResults(res.items);
			} catch (e) {
				console.error('Vault search failed:', e);
				if (!cancelled) setRemoteResults([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isSearching, searchQuery, searchClient]);

	// Reset selected index when results change
	useEffect(() => {
		setSelectedIndex(0);
	}, [isSearching, searchQuery.text, searchQuery.mode]);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
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
						try {
							const file = app.vault.getAbstractFileByPath(selectedResult.path);
							if (file && (file as any).path) {
								void app.workspace.getLeaf(false).openFile(file as any);
							}
						} catch (err) {
							console.error('Open result failed:', err);
						}
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
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Results List */}
			<div ref={scrollContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				{/* Empty State - No Results */}
				{isSearching && displayedResults.length === 0 ? (
					<NoResultsState searchInput={searchInput} />
				) : (
					<>
						{/* Show hint text for recently accessed */}
						{!isSearching && (
							<div className="pktw-px-4 pktw-pt-3 pktw-pb-2">
								<span className="pktw-text-xs pktw-text-[#999999]">Recently accessed</span>
							</div>
						)}
						{displayedResults.map((result, index) => (
							<SearchResultRow
								key={result.id}
								result={result}
								index={index}
								isSelected={index === selectedIndex}
								isSearching={isSearching}
								searchQuery={searchQuery.text}
								onSelect={setSelectedIndex}
								itemRef={(el) => {
									itemRefs.current[index] = el;
								}}
							/>
						))}
					</>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{!isSearching && indexProgress?.processed ? (
						<span className="pktw-text-xs pktw-text-[#999999]">
							Indexed: {indexProgress.processed}
						</span>
					) : null}
					{isSearching && (
						<span className="pktw-text-xs pktw-text-[#999999]">
							{displayedResults.length} result{displayedResults.length !== 1 ? 's' : ''}
						</span>
					)}
					<Button
						onClick={onSwitchToAI}
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


