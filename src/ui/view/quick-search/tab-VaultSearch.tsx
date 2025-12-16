import React, { useEffect, useRef } from 'react';
import { ChevronRight, Sparkles, SearchX } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { formatRelativeTime } from '@/ui/view/shared/date-utils';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { SearchResultType } from '@/core/Enums';
import { KeyboardShortcut } from './components/KeyboardShortcut';

interface SearchResult {
	id: string;
	type: SearchResultType;
	title: string;
	path: string;
	snippet?: string | null;
	highlightText?: string;
	lastModified: number; // timestamp in milliseconds
}

// Mock recently accessed files
const mockRecentlyAccessed: SearchResult[] = [
	{
		id: 'ra-1',
		type: 'markdown',
		title: 'Daily Notes - 2024-12-15',
		path: 'Daily',
		snippet: 'Today\'s meeting notes and tasks',
		lastModified: Date.now() - 30 * 60 * 1000, // 30 minutes ago
	},
	{
		id: 'ra-2',
		type: 'markdown',
		title: 'Project Planning',
		path: 'Projects/Active',
		snippet: 'Q1 2025 roadmap and milestones',
		lastModified: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
	},
	{
		id: 'ra-3',
		type: 'pdf',
		title: 'Research Notes - AI Trends',
		path: 'Research',
		snippet: 'Key findings from recent AI research papers',
		lastModified: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
	},
	{
		id: 'ra-4',
		type: 'markdown',
		title: 'Meeting Notes - Team Sync',
		path: 'Work/Meetings',
		snippet: 'Weekly team synchronization discussion',
		lastModified: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
	},
	{
		id: 'ra-5',
		type: 'folder',
		title: 'Personal',
		path: 'Notes',
		snippet: '8 notes inside',
		lastModified: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
	},
];

// Mock search results (all available files)
const mockVaultResults: SearchResult[] = [
	{
		id: '1',
		type: 'markdown',
		title: 'Machine Learning Fundamentals',
		path: 'Notes/AI/Concepts',
		snippet: 'Deep learning is a subset of machine learning that uses neural networks...',
		highlightText: 'machine learning',
		lastModified: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
	},
	{
		id: '2',
		type: 'markdown',
		title: 'Project Meeting Notes - 2024-12-10',
		path: 'Work/Meetings',
		snippet: 'Discussed the new machine learning pipeline implementation and deployment strategy',
		highlightText: 'machine learning',
		lastModified: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
	},
	{
		id: '3',
		type: 'pdf',
		title: 'Research Paper - Neural Networks',
		path: 'References/Papers',
		snippet: 'This paper explores advanced machine learning techniques for natural language...',
		highlightText: 'machine learning',
		lastModified: Date.now() - 3 * 7 * 24 * 60 * 60 * 1000, // 3 weeks ago
	},
	{
		id: '4',
		type: 'markdown',
		title: 'Learning Resources',
		path: 'Resources',
		snippet: 'A curated list of machine learning courses, tutorials, and best practices',
		highlightText: 'machine learning',
		lastModified: Date.now() - 2 * 30 * 24 * 60 * 60 * 1000, // 2 months ago
	},
	{
		id: '5',
		type: 'image',
		title: 'ML Architecture Diagram.png',
		path: 'Assets/Diagrams',
		snippet: null,
		lastModified: Date.now() - 6 * 30 * 24 * 60 * 60 * 1000, // 6 months ago
	},
	{
		id: '6',
		type: 'folder',
		title: 'Machine Learning Projects',
		path: 'Projects',
		snippet: '12 notes inside',
		lastModified: Date.now() - 400 * 24 * 60 * 60 * 1000, // more than one year ago
	},
];

/**
 * Filter search results based on query.
 */
const filterResults = (results: SearchResult[], query: string): SearchResult[] => {
	if (!query.trim()) return results;
	const lowerQuery = query.toLowerCase();
	return results.filter(
		(result) =>
			result.title.toLowerCase().includes(lowerQuery) ||
			result.path.toLowerCase().includes(lowerQuery) ||
			result.snippet?.toLowerCase().includes(lowerQuery),
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
const NoResultsState: React.FC<{ searchQuery: string }> = ({ searchQuery }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<SearchX className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			No results found
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-max-w-md">
			We couldn&apos;t find anything matching &quot;{searchQuery}&quot;. Try different keywords or check your spelling.
		</span>
	</div>
);

/**
 * Individual search result item component
 */
const SearchResultItem: React.FC<{
	result: SearchResult;
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
				{result.snippet && (
					<span className="pktw-text-sm pktw-text-[#6c757d] pktw-line-clamp-2 pktw-mt-1">
						{isSearching ? highlightMatch(result.snippet, searchQuery) : result.snippet}
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
	searchQuery: string;
	onSwitchToAI: () => void;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({ searchQuery, onSwitchToAI }) => {
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

	// Determine which results to show
	const isSearching = searchQuery.trim().length > 0;
	const displayedResults = isSearching
		? filterResults(mockVaultResults, searchQuery)
		: mockRecentlyAccessed;

	// Reset selected index when results change
	useEffect(() => {
		setSelectedIndex(0);
	}, [isSearching, searchQuery]);

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
				case 'Enter':
					e.preventDefault();
					// Open selected result
					const selectedResult = displayedResults[selectedIndex];
					if (selectedResult) {
						// TODO: Implement actual file opening logic
						console.log('Open result:', selectedResult);
					}
					break;
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
					<NoResultsState searchQuery={searchQuery} />
				) : (
					<>
						{/* Show hint text for recently accessed */}
						{!isSearching && (
							<div className="pktw-px-4 pktw-pt-3 pktw-pb-2">
								<span className="pktw-text-xs pktw-text-[#999999]">Recently accessed</span>
							</div>
						)}
						{displayedResults.map((result, index) => (
							<SearchResultItem
								key={result.id}
								result={result}
								index={index}
								isSelected={index === selectedIndex}
								isSearching={isSearching}
								searchQuery={searchQuery}
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


