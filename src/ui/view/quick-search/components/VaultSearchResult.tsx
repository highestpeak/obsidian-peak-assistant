import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { getFileIcon, pathToFileIconType } from '@/ui/view/shared/file-utils';
import { humanReadableTime } from '@/core/utils/date-utils';
import type { SearchResultItem, SearchSnippet } from '@/core/search/searchTypes';
import type { HighlightResult, HighlightSpan } from '@/service/search/query/highlight-engine';
import { segmentToWhitespace } from '@/core/utils/segmenter';

const CJK_RE = /[　-鿿가-힯豈-﫿]/;
import { renderHighlightSpans, renderLegacyHighlights } from './snippet/renderSnippetHighlights';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { useVaultSearchStore } from '../store';

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
 * Derive display title from the file path: basename minus its extension. The
 * indexed `title` field is FTS-normalized (spaces inserted between CJK chars,
 * hyphens stripped) so it looks like `docs 表格 代码 …` in search results —
 * the raw filename is what the user actually recognises.
 */
function deriveDisplayTitle(path: string, fallback: string): string {
	const base = path.split('/').pop();
	if (!base) return fallback;
	const dotIdx = base.lastIndexOf('.');
	return dotIdx > 0 ? base.slice(0, dotIdx) : base;
}

/**
 * Case-insensitive substring highlight of `text` against space-separated query
 * words + quoted phrases. Used to re-highlight the raw display title since the
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

	// CJK sub-tokens fallback: "英语练习" is one token to the parser but the
	// user recognises "英语" and "练习" separately in a title/path.
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

// Highlight-span renderers moved to `snippet/renderSnippetHighlights.tsx`
// so the inspector snippet block can reuse the same rendering.

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
	const { vaultNavigation } = useServiceContext();
	// Compact mode: single-line row with just title + score pill. No snippet,
	// no path breadcrumb, no metadata row. Shared with Tree via
	// `resultDensity` in the store.
	const density = useVaultSearchStore((s) => s.resultDensity);
	const isCompact = density === 'compact';
	const handleClick = (e: React.MouseEvent) => {
		onSelect(index);
		recordSearchClick(currentQuery, result.path, index);
		behaviorRecorder.push('openedFile', { path: result.path });
		const openInNewTab = newTab ?? (e.metaKey || e.ctrlKey);
		createOpenSourceCallback(onClose, openInNewTab, vaultNavigation)(result);
	};

	// Track hover so the AI-Suggest recorder learns which rows attracted the
	// user's attention. 800ms threshold to filter out incidental hovers.
	const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleMouseEnter = React.useCallback(() => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(() => {
			behaviorRecorder.push('focusedFile', { path: result.path, durationMs: 800 });
		}, 800);
	}, [result.path]);
	const handleMouseLeave = React.useCallback(() => {
		if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
	}, []);
	React.useEffect(() => () => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
	}, []);

	// Derive icon from path so all docs use the same FileText icon regardless of
	// whether the retriever populated `result.type` — meta-retriever hits and
	// vector-retriever hits shouldn't visually differ from FTS hits.
	const iconType = pathToFileIconType(result.path);
	// Prefer the pipeline-computed relative-normalized display score. Fall
	// back to raw only for legacy code paths (in-file / preview results) that
	// don't run through queryService — they'll still show 0–100 without
	// exceeding 100% because the raw scores in those paths are already
	// bounded to [0,1].
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
	const titleHighlight = highlightRawTitle(displayTitle, currentQuery);

	return (
		<div
			ref={itemRef}
			className={`pktw-group pktw-relative pktw-px-4 pktw-py-2 pktw-cursor-pointer pktw-transition-colors pktw-mb-2 ${isSelected ? 'pktw-bg-pk-indigo-bg' : 'hover:pktw-bg-pk-surface-raised'
				}`}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			{/* Leading accent bar */}
			<div
				className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-1 pktw-rounded-r-full"
				style={{ backgroundColor: 'var(--pk-accent)', opacity: isSelected ? 1 : 0 }}
			/>

			{/* Open in new tab button — floats top-right on row hover */}
			<Button
				variant="ghost"
				size="icon"
				title="Open in new tab"
				className="pktw-absolute pktw-top-1.5 pktw-right-2 pktw-h-6 pktw-w-6 pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
				onClick={(e) => {
					e.stopPropagation();
					recordSearchClick(currentQuery, result.path, index);
					createOpenSourceCallback(onClose, true, vaultNavigation)(result);
				}}
			>
				<ExternalLink className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-text-tertiary" />
			</Button>

			<div className="pktw-flex pktw-items-start pktw-gap-3">
				{/* File Icon */}
				<div className="pktw-flex-shrink-0 pktw-mt-1">{getFileIcon(iconType)}</div>

				{/* Content — three lines: title / snippet / metadata */}
				<div className="pktw-flex-1 pktw-min-w-0 pktw-pr-8">
					{/* Line 1: title + trailing badge.
					    - Search with score → score pill on right.
					    - No query (recents) → modified time on right instead.
					    Trailing element is flex-shrink-0 so it never squeezes the title. */}
					<div className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-min-w-0">
						<span
							className="pktw-flex-1 pktw-min-w-0 pktw-font-semibold pktw-text-pk-text-primary pktw-truncate"
							style={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: '1.2' }}
							title={displayTitle}
						>
							{renderHighlightSpans(titleHighlight)}
						</span>
						{scorePercent != null ? (
							<span
								className="pktw-flex-shrink-0 pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-whitespace-nowrap"
								title="Relative to the top match in this result set"
							>
								{scorePercent}%
							</span>
						) : modifiedText ? (
							<span className="pktw-flex-shrink-0 pktw-text-[10px] pktw-text-pk-text-tertiary pktw-whitespace-nowrap">
								{modifiedText}
							</span>
						) : null}
					</div>

					{/* Lines 2 + 3 are hidden in compact mode — the row collapses to
					    a single line (title + trailing badge) matching Tree's compact
					    treatment. */}
					{!isCompact && result.highlight?.text && (
						<div className="pktw-text-sm pktw-text-pk-text-secondary pktw-line-clamp-2 pktw-mt-1">
							{(result.highlight as unknown as HighlightResult).spans
								? renderHighlightSpans(result.highlight as unknown as HighlightResult, { cap: true })
								: result.highlight.highlights?.length
									? renderLegacyHighlights(result.highlight)
									: result.highlight.text}
						</div>
					)}

					{!isCompact && (
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-text-[10px] pktw-text-pk-text-tertiary pktw-min-w-0 pktw-opacity-60 group-hover:pktw-opacity-100 pktw-transition-opacity">
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