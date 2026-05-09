import React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import { humanReadableTime } from '@/core/utils/date-utils';
import type { SearchResultItem } from '@/service/search/types';
import type { HighlightResult } from '@/service/search/query/highlight-engine';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

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
 * Render text with typed highlight spans from HighlightResult.
 * Supports 'exact', 'stem', and 'fuzzy' span types with distinct visual styling.
 */
function renderHighlightSpans(result: HighlightResult): React.ReactNode {
	if (!result.spans.length) return <span>{result.text}</span>;

	const parts: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const span of result.spans) {
		if (span.start > lastEnd) {
			parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd, span.start)}</span>);
		}
		const className = span.type === 'fuzzy'
			? 'pktw-bg-blue-50 pktw-text-blue-800 pktw-underline pktw-decoration-dashed'
			: span.type === 'stem'
				? 'pktw-bg-amber-50 pktw-text-amber-800'
				: 'pktw-bg-[#fef3c7] pktw-text-[#92400e]';
		parts.push(
			<mark key={`h-${span.start}`} className={className}>
				{result.text.slice(span.start, span.end)}
			</mark>
		);
		lastEnd = span.end;
	}

	if (lastEnd < result.text.length) {
		parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd)}</span>);
	}

	return <>{parts}</>;
}

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
}> = ({ currentQuery, result, index, isSelected, onSelect, itemRef, onClose, newTab }) => {
	const handleClick = (e: React.MouseEvent) => {
		onSelect(index);
		recordSearchClick(currentQuery, result.path, index);
		const openInNewTab = newTab ?? (e.metaKey || e.ctrlKey);
		createOpenSourceCallback(onClose, openInNewTab)(result);
	};

	return (
		<div
			ref={itemRef}
			className={`pktw-group pktw-relative pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-transition-colors pktw-mb-2 ${isSelected ? 'pktw-bg-[#eef2ff]' : 'hover:pktw-bg-[#fafafa]'
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
							{result.titleHighlight
								? renderHighlightSpans(result.titleHighlight as HighlightResult)
								: result.title}
						</span>
						<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
						<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate" title={result.path}>
							{result.path.split('/').slice(-2).join('/')}
						</span>
					</div>

					{/* Snippet */}
					{result.highlight?.text && (
						<span className="pktw-text-sm pktw-text-[#6c757d] pktw-line-clamp-2 pktw-mt-1">
							{(result.highlight as unknown as HighlightResult).spans
								? renderHighlightSpans(result.highlight as unknown as HighlightResult)
								: result.highlight.text}
						</span>
					)}
				</div>

				{/* Relevance score badge — shown when score exists */}
				{result.score != null && result.score > 0 && (
					<span className="pktw-flex-shrink-0 pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-[#f5f3ff] pktw-text-pk-accent">
						{Math.round(result.score * 100)}%
					</span>
				)}

				{/* Open in new tab button — visible on row hover only */}
				<Button
					variant="ghost"
					size="icon"
					title="Open in new tab"
					className="pktw-flex-shrink-0 pktw-h-6 pktw-w-6 pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
					onClick={(e) => {
						e.stopPropagation();
						recordSearchClick(currentQuery, result.path, index);
						createOpenSourceCallback(onClose, true)(result);
					}}
				>
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#999999]" />
				</Button>

				{/* Last Modified Time */}
				<div className="pktw-flex-shrink-0 pktw-ml-4 pktw-text-xs pktw-text-[#999999] pktw-whitespace-nowrap">
					{humanReadableTime(result.lastModified)}
				</div>
			</div>
		</div>
	);
};