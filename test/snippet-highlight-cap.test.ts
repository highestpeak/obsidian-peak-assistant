import { capSpans } from '../src/ui/view/quick-search/components/snippet/renderSnippetHighlights';
import { SEARCH_SNIPPET_HIGHLIGHT_CAP } from '../src/core/constant';
import type { HighlightSpan } from '../src/service/search/query/highlight-engine';

function assert(condition: boolean, msg: string): void {
	if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

function span(start: number, end: number, type: HighlightSpan['type'] = 'exact'): HighlightSpan {
	return { start, end, type };
}

// Sanity: cap constant is a positive integer
assert(Number.isInteger(SEARCH_SNIPPET_HIGHLIGHT_CAP) && SEARCH_SNIPPET_HIGHLIGHT_CAP > 0,
	`cap must be positive int, got ${SEARCH_SNIPPET_HIGHLIGHT_CAP}`);

// Case 1: fewer spans than cap → return unchanged
{
	const input = [span(0, 3), span(5, 8)];
	const out = capSpans(input);
	assert(out.length === 2, 'no truncation when under cap');
	assert(out === input || out[0] === input[0], 'preserves references');
}

// Case 2: exactly cap → return unchanged
{
	const input = Array.from({ length: SEARCH_SNIPPET_HIGHLIGHT_CAP }, (_, i) => span(i * 5, i * 5 + 2));
	const out = capSpans(input);
	assert(out.length === SEARCH_SNIPPET_HIGHLIGHT_CAP, 'exact cap = no truncation');
}

// Case 3: 8 spans, cap=4 → keep first 4 in span-order
{
	const input = [
		span(0, 3, 'exact'),
		span(10, 13, 'fuzzy'),
		span(20, 23, 'stem'),
		span(30, 33, 'exact'),
		span(40, 43, 'exact'),
		span(50, 53, 'stem'),
		span(60, 63, 'exact'),
		span(70, 73, 'fuzzy'),
	];
	const out = capSpans(input);
	assert(out.length === SEARCH_SNIPPET_HIGHLIGHT_CAP, `expected cap=${SEARCH_SNIPPET_HIGHLIGHT_CAP}, got ${out.length}`);
	for (let i = 0; i < SEARCH_SNIPPET_HIGHLIGHT_CAP; i++) {
		assert(out[i].start === input[i].start, `slot ${i}: expected start ${input[i].start}, got ${out[i].start}`);
		assert(out[i].type === input[i].type, `slot ${i}: type preserved`);
	}
}

// Case 4: type-agnostic truncation — first-N by order, not by exact-priority
// (spec W4 explicitly picks simple first-N to avoid "front 4 are all fuzzy"
// surprise; if behavior changes to exact-priority, revisit this test.)
{
	const input = [
		span(0, 2, 'fuzzy'),
		span(4, 6, 'fuzzy'),
		span(8, 10, 'fuzzy'),
		span(12, 14, 'fuzzy'),
		span(20, 22, 'exact'),
	];
	const out = capSpans(input);
	assert(out.length === SEARCH_SNIPPET_HIGHLIGHT_CAP, 'capped');
	assert(out.every((s) => s.type === 'fuzzy'), 'first-N wins even when all fuzzy');
}

// Case 5: empty input
{
	const out = capSpans([]);
	assert(out.length === 0, 'empty stays empty');
}

console.log('OK snippet-highlight-cap');
