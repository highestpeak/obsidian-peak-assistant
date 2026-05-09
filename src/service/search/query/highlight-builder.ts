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
	if (originalMatches.length === 0) {
		return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };
	}

	// Find the best window that contains the most keyword matches
	const bestWindow = findBestSnippetWindow(content, originalMatches, keywords, windowBefore, windowAfter);
	const snippetText = content.slice(bestWindow.start, bestWindow.end);

	// Filter matches that are within the window and adjust positions
	// Only include matches that are completely within the window boundaries
	const highlights = originalMatches
		.filter(match => match.start >= bestWindow.start && match.end <= bestWindow.end)
		.map(match => ({
			// Convert absolute positions to relative positions within the snippet
			start: match.start - bestWindow.start,
			end: match.end - bestWindow.start,
		}));

	return {
		text: snippetText,
		highlights
	};
}

/**
 * Build a snippet window around query matches with highlights for all matched keywords.
 * 
 * Overview:
 * ========
 * This function finds the best snippet to display from search results, prioritizing
 * snippets that contain the most matched keywords. It handles tokenized content
 * (where words may have spaces inserted) by normalizing before matching.
 * 
 * Process Flow:
 * =============
 * 
 * 1. Normalization:
 *    - Remove spaces from content to handle tokenization (e.g., "plu gin" -> "plugin")
 *    - Create position mapping to map normalized indices back to original positions
 *    - Normalize query by removing spaces
 * 
 * 2. Match Finding:
 *    a) Try to find full query match first (e.g., "topic command rebase" as a phrase)
 *    b) Find all individual keyword matches (e.g., all occurrences of "topic", "command", "rebase")
 *    c) Remove duplicates (if full query match overlaps with keyword matches)
 * 
 * 3. Window Selection:
 *    - For each match position, create a window (80 chars before + 140 chars after)
 *    - Count unique keywords matched within each window
 *    - Select window with most keywords matched
 *    - If tie, prefer shorter window (more focused)
 * 
 * 4. Highlight Generation:
 *    - Extract snippet text from selected window
 *    - Filter matches that are within the window
 *    - Adjust highlight positions to be relative to snippet start
 * 
 * Example:
 * =======
 * Query: "topic command rebase"
 * Content: "...some topic-related content...command execution...rebase operation...complete guide for topic command rebase..."
 * 
 * Matches found:
 *   - Position 50: "topic"
 *   - Position 100: "command"
 *   - Position 150: "rebase"
 *   - Position 200: "topic command rebase" (full query match)
 * 
 * Window selection:
 *   - Window centered at position 200 contains all 3 keywords → Selected
 *   - Snippet: "...rebase operation...complete guide for topic command rebase..."
 *   - Highlights: All 4 matches within the snippet
 * 
 * @param content - The full content text (may be tokenized with spaces)
 * @param query - The search query (may contain multiple keywords separated by spaces)
 * @returns Search snippet with text and highlight positions, or null if no matches
 */
export function buildHighlightSnippet(content: string, query: string): SearchSnippet | null {
	const q = query.trim();
	if (!content) return null;
	if (!q) {
		return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };
	}

	// Normalize content and query
	// This handles tokenized content where words are separated by spaces
	const normalized = normalizeContent(content);
	const normalizedQuery = normalizeQuery(q);

	if (normalized.text.length === 0) {
		return { text: content.slice(0, SLICE_CAPS.highlight.fallbackShort), highlights: [] };
	}

	// Split query into keywords for multi-keyword matching
	const keywords = q.split(/\s+/).filter(k => k.length > 0);
	if (keywords.length === 0) {
		return { text: content.slice(0, SLICE_CAPS.highlight.fallbackLong), highlights: [] };
	}

	// Try to find full query match first (e.g., "topic command rebase" as a phrase)
	const fullMatchIdx = findFullQueryMatch(normalized.text, normalizedQuery);

	// Track all matches with keyword information for scoring
	let allMatches: Array<{ start: number; end: number; keyword?: string }> = [];

	if (fullMatchIdx >= 0) {
		// Found full query match - include it as a highlight
		// Full query match counts as matching all keywords
		const fullMatchPos = mapNormalizedToOriginal(
			fullMatchIdx,
			fullMatchIdx + normalizedQuery.length,
			normalized.positionMap
		);
		allMatches.push({
			...fullMatchPos,
			keyword: normalizedQuery, // Mark as full query match
		});
	}

	// Also find all individual keyword matches
	const keywordMatches = findAllKeywordMatches(normalized.text, keywords);
	for (const match of keywordMatches) {
		const originalPos = mapNormalizedToOriginal(
			match.start,
			match.end,
			normalized.positionMap
		);

		// Avoid duplicates (if full query match overlaps with keyword matches)
		const isDuplicate = allMatches.some(existing =>
			originalPos.start >= existing.start && originalPos.end <= existing.end
		);

		if (!isDuplicate) {
			allMatches.push({
				...originalPos,
				keyword: match.keyword, // Store keyword for scoring
			});
		}
	}

	// Sort matches by position for consistent processing
	allMatches.sort((a, b) => a.start - b.start);

	if (allMatches.length === 0) {
		return { text: content.slice(0, SLICE_CAPS.highlight.fallbackLong), highlights: [] };
	}

	// Create snippet window around the best match (most keywords matched)
	return createSnippetWindow(content, allMatches, keywords);
}

