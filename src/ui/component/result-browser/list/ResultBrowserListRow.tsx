/**
 * Controlled List row for the shared Result Browser. Pure presentation:
 * receives a `SearchResultItem`, selection + density state, and a
 * `highlightQuery` (display-only — never a search trigger), and emits
 * `onSelect` / `onOpen` / `onHoverStart` / `onHoverEnd`. It carries no store,
 * no service context, no telemetry, and no open policy — the host adapter owns
 * those (see `QuickSearchResultBrowserAdapter`).
 *
 * Extracted from `src/ui/view/quick-search/components/VaultSearchResult.tsx`.
 */
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getFileIcon, pathToFileIconType } from '@/ui/view/shared/file-utils';
import { humanReadableTime } from '@/core/utils/date-utils';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { HighlightResult, HighlightSpan } from '@/service/search/query/highlight-engine';
import { segmentToWhitespace } from '@/core/utils/segmenter';
import { renderHighlightSpans, renderLegacyHighlights } from './renderSnippetHighlights';
import type { ResultBrowserDensity } from '../model/types';

const CJK_RE = /[　-鿿가-힯豈-﫿]/;

/**
 * Derive display title from the file path: basename minus its extension. The
 * indexed `title` field is FTS-normalized (spaces inserted between CJK chars,
 * hyphens stripped) so the raw filename is what the user actually recognises.
 */
function deriveDisplayTitle(path: string, fallback: string): string {
	const base = path.split('/').pop();
	if (!base) return fallback;
	const dotIdx = base.lastIndexOf('.');
	return dotIdx > 0 ? base.slice(0, dotIdx) : base;
}

/**
 * Case-insensitive substring highlight of `text` against space-separated query
 * words + quoted phrases. Re-highlights the raw display title since the
 * server-side `titleHighlight` is computed against the FTS-normalized string.
 */
function highlightRawTitle(text: string, query: string): HighlightResult {
	const spans: HighlightSpan[] = [];
	if (!query.trim() || !text) return { text, spans };

	const lower = text.toLowerCase();
	const primary: string[] = [];
	const phraseRe = /"([^"]+)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = phraseRe.exec(query)) !== null) {
		const tok = (m[1] ?? m[2] ?? '').trim();
		if (tok) primary.push(tok.toLowerCase());
	}

	const fallback = new Set<string>();
	for (const tok of primary) {
		if (!CJK_RE.test(tok)) continue;
		const segmented = segmentToWhitespace(tok);
		if (!segmented) continue;
		for (const part of segmented.split(/\s+/)) {
			const p = part.trim().toLowerCase();
			if (p && p !== tok) fallback.add(p);
		}
	}

	const pushMatches = (tok: string, type: HighlightSpan['type']) => {
		let pos = 0;
		while (pos < lower.length) {
			const idx = lower.indexOf(tok, pos);
			if (idx === -1) break;
			spans.push({ start: idx, end: idx + tok.length, type });
			pos = idx + tok.length;
		}
	};
	for (const tok of primary) pushMatches(tok, 'exact');
	for (const tok of fallback) pushMatches(tok, 'exact');

	spans.sort((a, b) => a.start - b.start);
	const merged: HighlightSpan[] = [];
	for (const s of spans) {
		const last = merged[merged.length - 1];
		if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
		else merged.push({ ...s });
	}
	return { text, spans: merged };
}

export interface ResultBrowserListRowProps {
	result: SearchResultItem;
	index: number;
	isSelected: boolean;
	density: ResultBrowserDensity;
	/** Display query used to re-highlight the raw title. Never triggers search. */
	highlightQuery: string;
	itemRef: (el: HTMLDivElement | null) => void;
	onSelect: (index: number) => void;
	/**
	 * Open the row's file. `newTab` reflects the user's modifier intent for a
	 * body click; `viaNewTabButton` is set when the dedicated top-right button
	 * was used (the host always opens a new tab for that gesture). The host
	 * adapter resolves the final open policy.
	 */
	onOpen: (result: SearchResultItem, opts: { newTab: boolean; viaNewTabButton?: boolean }) => void;
	onHoverStart?: (result: SearchResultItem) => void;
	onHoverEnd?: (result: SearchResultItem) => void;
	/** Host-owned explanation that replaces the normal search snippet. */
	snippetText?: string | null;
	/**
	 * Search hosts open on a body click. Selection-first hosts such as Composer
	 * use a body click to update their inspector and reserve open for double
	 * click, Enter, or the dedicated new-tab affordance.
	 */
	openOnSelect?: boolean;
	/** Host-specific visual grammar without changing Quick Search defaults. */
	variant?: 'search' | 'related-material';
}

export const ResultBrowserListRow: React.FC<ResultBrowserListRowProps> = ({
	result, index, isSelected, density, highlightQuery, itemRef, onSelect, onOpen,
	onHoverStart, onHoverEnd, snippetText, openOnSelect = true, variant = 'search',
}) => {
	const isCompact = density === 'compact';

	const handleClick = (e: React.MouseEvent) => {
		onSelect(index);
		if (openOnSelect) onOpen(result, { newTab: e.metaKey || e.ctrlKey });
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		if (openOnSelect) return;
		onOpen(result, { newTab: e.metaKey || e.ctrlKey });
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === ' ') {
			e.preventDefault();
			onSelect(index);
			return;
		}
		if (e.key !== 'Enter') return;
		e.preventDefault();
		onSelect(index);
		onOpen(result, { newTab: e.metaKey || e.ctrlKey });
	};

	const iconType = pathToFileIconType(result.path);
	const scorePercent = result.displayScorePercent != null
		? result.displayScorePercent
		: result.finalScore != null && result.finalScore > 0
			? Math.min(100, Math.round(result.finalScore * 100))
			: result.score != null && result.score > 0
				? Math.min(100, Math.round(result.score * 100))
				: null;
	const modifiedText = humanReadableTime(result.lastModified);
	const shortPath = result.path.split('/').slice(-2).join('/');
	const displayTitle = deriveDisplayTitle(result.path, result.title);
	const titleHighlight = highlightRawTitle(displayTitle, highlightQuery);

	return (
		<div
			ref={itemRef}
			className={`pktw-group pktw-relative pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-transition-colors pktw-mb-2 ${isSelected ? 'pktw-bg-pk-indigo-bg' : 'hover:pktw-bg-pk-surface-raised'
				}`}
			data-result-browser-variant={variant}
			data-selected={isSelected ? 'true' : 'false'}
			tabIndex={0}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
			onMouseEnter={() => onHoverStart?.(result)}
			onMouseLeave={() => onHoverEnd?.(result)}
		>
			{/* Leading accent bar */}
			<div
				className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-1 pktw-rounded-r-full pktw-bg-pk-accent"
				style={{ opacity: isSelected ? 1 : 0 }}
			/>

			{/* Open in new tab button — floats top-right on row hover */}
			<Button
				variant="ghost"
				size="icon"
				title="Open in new tab"
				className="pktw-absolute pktw-top-1.5 pktw-right-2 pktw-h-6 pktw-w-6 pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
				onClick={(e) => {
					e.stopPropagation();
					onOpen(result, { newTab: true, viaNewTabButton: true });
				}}
			>
				<ExternalLink className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-text-tertiary" />
			</Button>

			<div className="pktw-flex pktw-items-start pktw-gap-3">
				{/* File Icon */}
				<div className="pktw-flex-shrink-0 pktw-mt-1">{getFileIcon(iconType)}</div>

				{/* Content — three lines: title / snippet / metadata */}
				<div className="pktw-flex-1 pktw-min-w-0 pktw-pr-8">
					<div className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-min-w-0">
						<span
							className="pk-result-browser-row-title pktw-flex-1 pktw-min-w-0 pktw-font-extrabold pktw-text-pk-text-primary pktw-truncate pktw-text-[1.2rem] pktw-leading-[1.2]"
							title={displayTitle}
						>
							{renderHighlightSpans(titleHighlight)}
						</span>
						{scorePercent != null ? (
							<span
								className="pk-result-browser-row-score pktw-flex-shrink-0 pktw-text-pk-xs pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-whitespace-nowrap"
								title="Relative to the top match in this result set"
							>
								{scorePercent}%
							</span>
						) : modifiedText ? (
							<span className="pktw-flex-shrink-0 pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-whitespace-nowrap">
								{modifiedText}
							</span>
						) : null}
					</div>

					{!isCompact && snippetText && (
						<div className="pk-result-browser-row-snippet pktw-text-sm pktw-text-pk-text-secondary pktw-line-clamp-2 pktw-mt-1">
							{snippetText}
						</div>
					)}

					{!isCompact && !snippetText && result.highlight?.text && (
						<div className="pk-result-browser-row-snippet pktw-text-sm pktw-text-pk-text-secondary pktw-line-clamp-2 pktw-mt-1">
							{(result.highlight as unknown as HighlightResult).spans
								? renderHighlightSpans(result.highlight as unknown as HighlightResult, { cap: true })
								: result.highlight.highlights?.length
									? renderLegacyHighlights(result.highlight)
									: result.highlight.text}
						</div>
					)}

					{!isCompact && (
						<div className="pk-result-browser-row-meta pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-min-w-0 pktw-opacity-60 group-hover:pktw-opacity-100 pktw-transition-opacity">
							<span className="pktw-truncate" title={result.path}>{shortPath}</span>
							{scorePercent != null && modifiedText && (
								<>
									<span className="pktw-flex-shrink-0 pktw-opacity-50">·</span>
									<span className="pktw-flex-shrink-0 pktw-whitespace-nowrap">{modifiedText}</span>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
