import { SLICE_CAPS } from '@/core/constant';
import type { SearchSnippet } from '../types';

interface NormalizedContent {
	text: string;
	/** Maps normalized index -> original index */
	positionMap: number[];
}

/** Remove spaces from content, building a position map back to original indices. */
function normalizeContent(content: string): NormalizedContent {
	const normalizedContent: string[] = [];
	const positionMap: number[] = [];

	for (let i = 0; i < content.length; i++) {
		const char = content[i];
		if (char !== ' ') {
			normalizedContent.push(char);
			positionMap.push(i);
		}
	}

	return {
		text: normalizedContent.join(''),
		positionMap,
	};
}

function normalizeQuery(query: string): string {
	return query.replace(/\s+/g, '');
}

function findFullQueryMatch(normalizedText: string, normalizedQuery: string): number {
	return normalizedText.toLowerCase().indexOf(normalizedQuery.toLowerCase());
}

function findAllKeywordMatches(normalizedText: string, keywords: string[]): Array<{ start: number; end: number; keyword: string }> {
	const lowerNormalized = normalizedText.toLowerCase();
	const matches: Array<{ start: number; end: number; keyword: string }> = [];

	for (const keyword of keywords) {
		const normalizedKeyword = normalizeQuery(keyword);
		const lowerKeyword = normalizedKeyword.toLowerCase();
		let searchStart = 0;

		// Find all occurrences of this keyword
		while (true) {
			const idx = lowerNormalized.indexOf(lowerKeyword, searchStart);
			if (idx < 0) break;

			matches.push({
				start: idx,
				end: idx + normalizedKeyword.length,
				keyword: normalizedKeyword,
			});

			searchStart = idx + 1; // Continue searching from next position
		}
	}

	return matches.sort((a, b) => a.start - b.start);
}

function mapNormalizedToOriginal(
	normalizedStart: number,
	normalizedEnd: number,
	positionMap: number[]
): { start: number; end: number } {
	const originalStart = positionMap[normalizedStart] ?? normalizedStart;
	const originalEnd = positionMap[normalizedEnd - 1] !== undefined
		? positionMap[normalizedEnd - 1] + 1
		: normalizedEnd;

	return { start: originalStart, end: originalEnd };
}

/** Pick window anchored at each match, score by unique keywords covered; tie-break by shorter window. */
function findBestSnippetWindow(
	content: string,
	originalMatches: Array<{ start: number; end: number; keyword?: string }>,
	keywords: string[],
	windowBefore: number = 80,
	windowAfter: number = 140
): { start: number; end: number; matchCount: number } {
	if (originalMatches.length === 0) return { start: 0, end: Math.min(200, content.length), matchCount: 0 };

	let best: { start: number; end: number; matchCount: number } | null = null;

	for (const match of originalMatches) {
		const wStart = Math.max(0, match.start - windowBefore);
		const wEnd = Math.min(content.length, match.end + windowAfter);
		const matched = new Set<string>();
		for (const m of originalMatches) {
			if (m.start >= wStart && m.end <= wEnd) matched.add((m.keyword ?? 'unknown').toLowerCase());
		}
		const count = matched.size;
		if (!best || count > best.matchCount || (count === best.matchCount && (wEnd - wStart) < (best.end - best.start))) {
			best = { start: wStart, end: wEnd, matchCount: count };
		}
	}

	return best || { start: 0, end: Math.min(200, content.length), matchCount: 0 };
}

/** Extract snippet window around best-scoring matches, adjusting highlight positions to be relative. */
function createSnippetWindow(
	content: string,
	originalMatches: Array<{ start: number; end: number; keyword?: string }>,
	keywords: string[],
	windowBefore: number = 80,
	windowAfter: number = 140
): SearchSnippet {
	if (originalMatches.length === 0) return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };

	const w = findBestSnippetWindow(content, originalMatches, keywords, windowBefore, windowAfter);
	return {
		text: content.slice(w.start, w.end),
		highlights: originalMatches
			.filter(m => m.start >= w.start && m.end <= w.end)
			.map(m => ({ start: m.start - w.start, end: m.end - w.start })),
	};
}

/**
 * Build a snippet window around query matches with highlights.
 * Normalizes spaces (handles tokenized content), finds full-phrase + keyword matches,
 * picks the window with most unique keywords, returns snippet with relative highlights.
 */
export function buildHighlightSnippet(content: string, query: string): SearchSnippet | null {
	const q = query.trim();
	if (!content) return null;
	if (!q) return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };

	const normalized = normalizeContent(content);
	const normalizedQuery = normalizeQuery(q);
	if (normalized.text.length === 0) return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };

	const keywords = q.split(/\s+/).filter(k => k.length > 0);
	if (keywords.length === 0) return { text: content.slice(0, SLICE_CAPS.highlight.fallbackLong), highlights: [] };

	const allMatches: Array<{ start: number; end: number; keyword?: string }> = [];

	// Full-phrase match
	const fullIdx = findFullQueryMatch(normalized.text, normalizedQuery);
	if (fullIdx >= 0) {
		allMatches.push({ ...mapNormalizedToOriginal(fullIdx, fullIdx + normalizedQuery.length, normalized.positionMap), keyword: normalizedQuery });
	}

	// Individual keyword matches (deduplicated against full match)
	for (const m of findAllKeywordMatches(normalized.text, keywords)) {
		const pos = mapNormalizedToOriginal(m.start, m.end, normalized.positionMap);
		if (!allMatches.some(e => pos.start >= e.start && pos.end <= e.end)) {
			allMatches.push({ ...pos, keyword: m.keyword });
		}
	}

	allMatches.sort((a, b) => a.start - b.start);
	if (allMatches.length === 0) return { text: content.slice(0, SLICE_CAPS.highlight.fallbackLong), highlights: [] };

	return createSnippetWindow(content, allMatches, keywords);
}

