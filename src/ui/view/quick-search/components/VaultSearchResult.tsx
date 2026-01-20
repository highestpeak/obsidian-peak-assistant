import React from 'react';
import { ChevronRight } from 'lucide-react';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { humanReadableTime } from '@/core/utils/date-utils';
import type { SearchResultItem } from '@/service/search/types';
import { createOpenSourceCallback } from '../callbacks/open-source-file';

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

	const textLength = snippet.text.length;

	// Filter and validate highlights
	const validHighlights = snippet.highlights
		.filter(h => h.start >= 0 && h.end > h.start && h.start < textLength && h.end <= textLength)
		.sort((a, b) => a.start - b.start);

	if (validHighlights.length === 0) {
		return snippet.text;
	}

	// Merge overlapping highlights
	const mergedHighlights: Array<{ start: number; end: number }> = [];
	for (const highlight of validHighlights) {
		const last = mergedHighlights[mergedHighlights.length - 1];
		if (last && highlight.start <= last.end) {
			// Merge overlapping highlights
			last.end = Math.max(last.end, highlight.end);
		} else {
			mergedHighlights.push({ ...highlight });
		}
	}

	const parts: Array<{ text: string; highlight: boolean }> = [];
	let lastEnd = 0;

	for (const highlight of mergedHighlights) {
		// Add text before highlight
		if (highlight.start > lastEnd) {
			parts.push({ text: snippet.text.slice(lastEnd, highlight.start), highlight: false });
		}
		// Add highlighted text
		const highlightText = snippet.text.slice(highlight.start, highlight.end);
		if (highlightText) {
			parts.push({ text: highlightText, highlight: true });
		}
		lastEnd = highlight.end;
	}

	// Add remaining text
	if (lastEnd < textLength) {
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
 * Individual search result item component
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
}> = ({ currentQuery, result, index, isSelected, onSelect, itemRef, onClose, newTab = true }) => {
	const handleClick = () => {
		onSelect(index);
		createOpenSourceCallback(onClose, newTab)(result);
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
							{highlightText(result.title, currentQuery.split(/\s+/))}
						</span>
						<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
						<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
							{highlightText(result.path, currentQuery.split(/\s+/))}
						</span>
					</div>

					{/* Snippet */}
					{result.highlight?.text && (
						<span className="pktw-text-sm pktw-text-[#6c757d] pktw-line-clamp-2 pktw-mt-1">
							{result.highlight.highlights
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