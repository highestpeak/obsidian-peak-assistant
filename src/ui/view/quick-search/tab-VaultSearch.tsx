import React, { useEffect, useRef } from 'react';
import { ChevronRight, Sparkles, SearchX } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { formatDuration } from '@/core/utils/format-utils';
import type { SearchQuery, SearchResultItem as SearchResultItemType } from '@/service/search/types';
import type { SearchClient } from '@/service/search/SearchClient';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { openFile } from '@/core/utils/obsidian-utils';
import { cn } from '@/ui/react/lib/utils';
import { humanReadableTime } from '@/core/utils/date-utils';

/**
 * Highlight text using multiple keywords with more visible styling.
 */
const highlightText = (text: string, keywords: string[]) => {
	if (!keywords.length) return text;

	// Create regex pattern for all keywords (case insensitive)
	const pattern = keywords
		.map(k => k.trim())
		.filter(k => k.length > 0)
		.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special regex chars
		.join('|');

	if (!pattern) return text;

	const regex = new RegExp(`(${pattern})`, 'gi');
	const parts = text.split(regex);

	return (
		<>
			{parts.map((part, i) => {
				const isMatch = keywords.some(k => part.toLowerCase() === k.toLowerCase().trim());
				return isMatch ? (
					<mark
						key={i}
						className="pktw-bg-[#fef3c7] pktw-text-[#92400e] pktw-px-1 pktw-py-0.5 pktw-rounded pktw-font-semibold"
					>
						{part}
					</mark>
				) : (
					<span key={i}>{part}</span>
				);
			})}
		</>
	);
};

/**
 * Render text with highlight spans from SearchSnippet.
 */
const renderHighlightedSnippet = (snippet: { text: string; highlights?: Array<{ start: number; end: number }> }) => {
	if (!snippet.highlights || snippet.highlights.length === 0) {
		return snippet.text;
	}

	// Sort highlights by start position
	const sortedHighlights = [...snippet.highlights].sort((a, b) => a.start - b.start);

	const parts: Array<{ text: string; highlight: boolean }> = [];
	let lastEnd = 0;

	for (const highlight of sortedHighlights) {
		// Add text before highlight
		if (highlight.start > lastEnd) {
			parts.push({ text: snippet.text.slice(lastEnd, highlight.start), highlight: false });
		}
		// Add highlighted text
		parts.push({ text: snippet.text.slice(highlight.start, highlight.end), highlight: true });
		lastEnd = highlight.end;
	}

	// Add remaining text
	if (lastEnd < snippet.text.length) {
		parts.push({ text: snippet.text.slice(lastEnd), highlight: false });
	}

	return (
		<>
			{parts.map((part, i) =>
				part.highlight ? (
					<mark
						key={i}
						className="pktw-bg-[#fef3c7] pktw-text-[#92400e] pktw-px-1 pktw-py-0.5 pktw-rounded pktw-font-semibold"
					>
						{part.text}
					</mark>
				) : (
					<span key={i}>{part.text}</span>
				)
			)}
		</>
	);
};

/**
 * Empty state when no search results found
 */
const NoResultsState: React.FC<{ searchInput: string }> = ({ searchInput }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-gray-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-2">
			<SearchX className="pktw-w-10 pktw-h-10 pktw-text-gray-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338]  pktw-text-lg">
			No results found
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4">
			Try different keywords or check your spelling. Or report the case to the developer. Or try ask AI ↘︎ to help you. 🥰
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
	onOpen?: () => void;
}> = ({ result, index, isSelected, isSearching, searchQuery, onSelect, itemRef, onOpen }) => {
	const handleClick = () => {
		onSelect(index);
		onOpen?.();
	};

	return (
		<div
			ref={itemRef}
			className={`pktw-relative pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-transition-colors pktw-mb-2 ${isSelected ? 'pktw-bg-[#eef2ff]' : 'hover:pktw-bg-[#fafafa]'
				}`}
			onClick={handleClick}
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
							{isSearching ? highlightText(result.title, searchQuery.split(/\s+/)) : result.title}
						</span>
						<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
						<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
							{isSearching ? highlightText(result.path, searchQuery.split(/\s+/)) : result.path}
						</span>
					</div>

					{/* Snippet */}
					{result.highlight?.text && (
						<span className="pktw-text-sm pktw-text-[#6c757d] pktw-line-clamp-2 pktw-mt-1">
							{isSearching && result.highlight.highlights
								? renderHighlightedSnippet(result.highlight)
								: result.highlight.text}
						</span>
					)}
				</div>

				{/* Last Modified Time */}
				<div className="pktw-flex-shrink-0 pktw-ml-4 pktw-text-xs pktw-text-[#999999] pktw-whitespace-nowrap">
					{humanReadableTime(result.lastModified)}
				</div>
			</div>
		</div>
	);
};

/**
 * Footer hints section for vault search tab
 */
const VaultSearchFooterHints: React.FC = () => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="↑↓" description="navigate" />
		<KeyboardShortcut keys="Enter" description="open" />
		<KeyboardShortcut keys="#" description="in-file" />
		<KeyboardShortcut keys=":" description="to line" />
		<KeyboardShortcut keys="@" description="folder" />
	</div>
);

interface VaultSearchTabProps {
	searchInput: string;
	searchQuery: SearchQuery;
	onSwitchToAI: () => void;
	searchClient: SearchClient | null;
	indexProgress: { processed: number; total?: number } | null;
	onClose?: () => void;
	onSearchStateChange?: (isSearching: boolean) => void;
}

/**
 * Quick search tab for regular vault search results.
 */
export const VaultSearchTab: React.FC<VaultSearchTabProps> = ({ searchInput, searchQuery, onSwitchToAI, searchClient, indexProgress, onClose, onSearchStateChange }) => {
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const [remoteResults, setRemoteResults] = React.useState<SearchResultItemType[] | null>(null);
	const [recentResults, setRecentResults] = React.useState<SearchResultItemType[] | null>(null);
	const [searchDuration, setSearchDuration] = React.useState<number | null>(null);
	const [isSearching, setIsSearching] = React.useState(false);
	const [lastSearchResults, setLastSearchResults] = React.useState<SearchResultItemType[]>([]);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const currentSearchId = React.useRef<string | null>(null);
	const { app } = useServiceContext();

	// Determine which results to show
	const hasSearchQuery = searchQuery.text.trim().length > 0;
	const displayedResults = hasSearchQuery
		? (isSearching ? (lastSearchResults.length > 0 ? lastSearchResults : (recentResults ?? [])) : (remoteResults ?? []))
		: (recentResults ?? []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (hasSearchQuery) return;
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
	}, [hasSearchQuery, searchClient]);

	// Debounced search: wait for user to stop typing before triggering search
	useEffect(() => {
		if (!hasSearchQuery) {
			currentSearchId.current = null;
			setRemoteResults(null);
			setSearchDuration(null);
			setIsSearching(false);
			return;
		}
		if (!searchClient) {
			currentSearchId.current = null;
			setRemoteResults([]);
			setSearchDuration(null);
			setIsSearching(false);
			return;
		}

		// Generate a unique search ID for this search
		const searchId = `${searchQuery.text}-${searchQuery.scopeMode}-${searchQuery.scopeValue}`;
		currentSearchId.current = searchId;

		// Set searching state
		setIsSearching(true);

		// Debounce: wait 500ms after user stops typing before triggering search
		let cancelled = false;
		const timeoutId = setTimeout(async () => {
			try {
				const res = await searchClient.search(searchQuery);
				if (!cancelled && currentSearchId.current === searchId) {
					setRemoteResults(res.items);
					setLastSearchResults(res.items); // Store results for next search
					setSearchDuration(res.duration ?? null);
					setIsSearching(false);
				}
			} catch (e) {
				console.error('Vault search failed:', e);
				if (!cancelled && currentSearchId.current === searchId) {
					setRemoteResults([]);
					setLastSearchResults([]); // Store empty results for next search
					setSearchDuration(null);
					setIsSearching(false);
				}
			}
		}, 500); // Wait 500ms after user stops typing

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	}, [hasSearchQuery, searchQuery.text, searchQuery.scopeMode, searchQuery.scopeValue, searchClient]);

	// Reset selected index when results change
	useEffect(() => {
		setSelectedIndex(0);
	}, [hasSearchQuery, searchQuery.text, searchQuery.scopeMode]);

	// Notify parent component of search state changes
	useEffect(() => {
		onSearchStateChange?.(isSearching);
	}, [hasSearchQuery, onSearchStateChange]);

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
						try {
							await openFile(app, selectedResult.path);
							// Close the search modal after opening the file
							onClose?.();
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
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0 pktw-overflow-hidden">
			{/* Results List */}
			<div ref={scrollContainerRef} className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto" style={{ flexBasis: 0, minHeight: 0 }}>
				<div
					className={cn(
						'pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-0.5 pktw-z-20',
						isSearching
							? 'line-progress-loader'
							: 'pktw-bg-transparent'
					)}
				/>
				{/* Empty State - No Results */}
				{hasSearchQuery && !isSearching && displayedResults.length === 0 ? (
					<NoResultsState searchInput={searchInput} />
				) : !isSearching && displayedResults.length === 0 ? (
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
				) : (
					<>
						{/* Show hint text for recently accessed */}
						{!hasSearchQuery && (
							<div className="pktw-px-4 pktw-pb-2">
								<span className="pktw-text-xs pktw-text-[#999999]">Recently accessed</span>
							</div>
						)}
						{displayedResults.map((result, index) => {
							const handleOpen = async () => {
								try {
									await openFile(app, result.path);
									onClose?.();
								} catch (err) {
									console.error('Open result failed:', err);
								}
							};

							return (
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
									onOpen={handleOpen}
								/>
							);
						})}
					</>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
				<VaultSearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{!isSearching && indexProgress?.processed ? (
						<span className="pktw-text-xs pktw-text-[#999999]">
							Indexed: {indexProgress.processed}
						</span>
					) : null}
					{hasSearchQuery && (
						<>
							{isSearching ? (
								<span className="pktw-text-xs pktw-text-[#999999]">Searching...</span>
							) : (
								<>
									<span className="pktw-text-xs pktw-text-[#999999]">
										{displayedResults.length} result{displayedResults.length !== 1 ? 's' : ''}
									</span>
									{searchDuration !== null && (
										<span className="pktw-text-xs pktw-text-[#999999]">
											• <strong className="pktw-text-[#2e3338]">{formatDuration(searchDuration)}</strong>
										</span>
									)}
								</>
							)}
						</>
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
