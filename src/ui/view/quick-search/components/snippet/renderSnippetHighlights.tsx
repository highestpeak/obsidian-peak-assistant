import React from 'react';
import type { SearchSnippet } from '@/core/search/searchTypes';
import type { HighlightResult, HighlightSpan } from '@/service/search/query/highlight-engine';
import { SEARCH_SNIPPET_HIGHLIGHT_CAP } from '@/core/constant';

/**
 * Cap the number of `<mark>` wraps we render in one snippet. Density-noise
 * mitigation — a paragraph with the query word in every sentence would
 * otherwise turn into a solid orange block, which is worse for legibility
 * than mixed text. Spans past the cap keep their text (nothing is hidden)
 * but no longer get the highlight wrapping. Truncation is by first-N in
 * span-order (all types equal) so the earliest-visible matches survive;
 * see spec `2026-07-09-quick-search-ui-polish · W4`.
 */
export function capSpans(spans: HighlightSpan[]): HighlightSpan[] {
	if (spans.length <= SEARCH_SNIPPET_HIGHLIGHT_CAP) return spans;
	return spans.slice(0, SEARCH_SNIPPET_HIGHLIGHT_CAP);
}

/**
 * Render text with typed highlight spans from HighlightResult. Supports
 * `exact`, `stem`, and `fuzzy` span types with distinct visual styling.
 * Extracted from `VaultSearchResult.tsx` so both the List row and the
 * inspector's snippet block use the same rendering.
 *
 * `opts.cap` (default `false`) caps the number of highlighted spans (see
 * `capSpans`). Snippet callers should pass `true` to avoid dense-block
 * highlights; title callers pass `false` so every matched token still
 * lights up — the title only has a handful of tokens anyway.
 */
export function renderHighlightSpans(result: HighlightResult, opts?: { cap?: boolean }): React.ReactNode {
	if (!result.spans.length) return <span>{result.text}</span>;

	const spans = opts?.cap ? capSpans(result.spans) : result.spans;
	const parts: React.ReactNode[] = [];
	let lastEnd = 0;

	for (const span of spans) {
		if (span.start > lastEnd) {
			parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd, span.start)}</span>);
		}
		const className = span.type === 'fuzzy'
			? 'pktw-bg-blue-50 pktw-text-blue-800 pktw-underline pktw-decoration-dashed'
			: span.type === 'stem'
				? 'pktw-bg-amber-50 pktw-text-amber-800'
				: 'pktw-bg-pk-warning-bg pktw-text-pk-warning-text';
		parts.push(
			<mark key={`h-${span.start}`} className={className}>
				{result.text.slice(span.start, span.end)}
			</mark>,
		);
		lastEnd = span.end;
	}

	if (lastEnd < result.text.length) {
		parts.push(<span key={`t-${lastEnd}`}>{result.text.slice(lastEnd)}</span>);
	}

	return <>{parts}</>;
}

/**
 * Render text with legacy SearchSnippet highlights (start/end spans
 * without type). Fallback for in-file search results that use the older
 * highlight format.
 */
export function renderLegacyHighlights(snippet: SearchSnippet): React.ReactNode {
	const { text, highlights } = snippet;
	if (!highlights?.length) return <span>{text}</span>;

	const parts: React.ReactNode[] = [];
	let lastEnd = 0;

	const sorted = [...highlights].sort((a, b) => a.start - b.start);
	for (const span of sorted) {
		if (span.start > lastEnd) {
			parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd, span.start)}</span>);
		}
		parts.push(
			<mark key={`h-${span.start}`} className="pktw-bg-pk-warning-bg pktw-text-pk-warning-text">
				{text.slice(span.start, span.end)}
			</mark>,
		);
		lastEnd = span.end;
	}

	if (lastEnd < text.length) {
		parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd)}</span>);
	}

	return <>{parts}</>;
}

/**
 * Dispatch: given a result's `highlight` field, pick the right renderer and
 * return the highlighted React node. Callers don't need to know which
 * highlight format the pipeline produced.
 */
export function renderSnippetContent(
	highlight: SearchSnippet | HighlightResult | null | undefined,
): React.ReactNode {
	if (!highlight) return null;
	// HighlightResult has `spans` (typed); legacy SearchSnippet has `highlights`.
	if ('spans' in highlight && Array.isArray((highlight as HighlightResult).spans)) {
		return renderHighlightSpans(highlight as HighlightResult, { cap: true });
	}
	if ((highlight as SearchSnippet).highlights?.length) {
		return renderLegacyHighlights(highlight as SearchSnippet);
	}
	return highlight.text;
}
