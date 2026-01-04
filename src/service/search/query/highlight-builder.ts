import type { SearchSnippet } from '../types';

/**
 * Normalized content with position mapping
 */
interface NormalizedContent {
	text: string;
	positionMap: number[]; // Maps normalized index -> original index
}

/**
 * Normalize content by removing spaces and creating position mapping.
 * Handles tokenized content where words are separated by spaces.
 */
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

/**
 * Normalize query by removing all spaces
 */
function normalizeQuery(query: string): string {
	return query.replace(/\s+/g, '');
}

/**
 * Find match position in normalized text (case insensitive)
 */
function findFullQueryMatch(normalizedText: string, normalizedQuery: string): number {
	const lowerNormalized = normalizedText.toLowerCase();
	const lowerQuery = normalizedQuery.toLowerCase();
	return lowerNormalized.indexOf(lowerQuery);
}

/**
 * Find all keyword matches in normalized text
 */
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

	// Sort matches by position
	return matches.sort((a, b) => a.start - b.start);
}

/**
 * Map normalized position range back to original content positions
 */
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

/**
 * Find the best snippet window that contains the most keyword matches.
 * Prioritizes windows with more unique keywords matched.
 * 
 * Window Calculation Strategy:
 * ============================
 * 
 * 1. Window Size:
 *    - Each window extends `windowBefore` (default 80) characters before the match start
 *    - And `windowAfter` (default 140) characters after the match end
 *    - Total window size: approximately 220 characters (80 + match_length + 140)
 * 
 * 2. Window Creation:
 *    For each match position in the content:
 *    - windowStart = max(0, match.start - windowBefore)
 *    - windowEnd = min(content.length, match.end + windowAfter)
 *    - This creates a fixed-size window centered around each match
 * 
 * 3. Scoring:
 *    For each window, count how many unique keywords are matched:
 *    - Iterate through all matches
 *    - Check if each match is completely within the window boundaries
 *    - Use a Set to count unique keywords (each keyword counted only once)
 *    - Full query matches count as matching all keywords
 * 
 * 4. Selection Priority:
 *    a) Primary: Select window with the most unique keywords matched
 *    b) Secondary: If multiple windows have the same keyword count, prefer the shorter window (more focused)
 * 
 * Example:
 * =======
 * Content: "...topic...command...rebase...topic command rebase..."
 * Keywords: ["topic", "command", "rebase"]
 * 
 * Window 1 (centered at position 100 "topic"):
 *   Range: [20, 240]
 *   Contains: "topic" at 100, "topic command rebase" at 150
 *   Unique keywords: 3 (topic, command, rebase)
 * 
 * Window 2 (centered at position 200 "command"):
 *   Range: [120, 340]
 *   Contains: "topic command rebase" at 150, "command" at 200, "rebase" at 300
 *   Unique keywords: 3 (topic, command, rebase)
 * 
 * Result: Both windows match 3 keywords. If Window 1 is shorter, it will be selected.
 */
function findBestSnippetWindow(
	content: string,
	originalMatches: Array<{ start: number; end: number; keyword?: string }>,
	keywords: string[],
	windowBefore: number = 80,
	windowAfter: number = 140
): { start: number; end: number; matchCount: number } {
	if (originalMatches.length === 0) {
		return { start: 0, end: Math.min(200, content.length), matchCount: 0 };
	}

	let bestWindow: { start: number; end: number; matchCount: number } | null = null;

	// Try each match position as the anchor point for a window
	for (const match of originalMatches) {
		// Calculate window boundaries:
		// - Start: match.start - windowBefore (but not before content start)
		// - End: match.end + windowAfter (but not after content end)
		const windowStart = Math.max(0, match.start - windowBefore);
		const windowEnd = Math.min(content.length, match.end + windowAfter);

		// Count how many unique keywords are matched within this window
		const matchedKeywords = new Set<string>();
		for (const m of originalMatches) {
			// Check if this match is completely within the window
			if (m.start >= windowStart && m.end <= windowEnd) {
				if (m.keyword) {
					matchedKeywords.add(m.keyword.toLowerCase());
				} else {
					// If no keyword info (e.g., full query match), count as a match
					matchedKeywords.add('unknown');
				}
			}
		}

		const matchCount = matchedKeywords.size;

		// Select window with most unique keywords matched
		if (!bestWindow || matchCount > bestWindow.matchCount) {
			bestWindow = { start: windowStart, end: windowEnd, matchCount };
		} else if (matchCount === bestWindow.matchCount) {
			// If same keyword count, prefer shorter window (more focused)
			const currentLength = windowEnd - windowStart;
			const bestLength = bestWindow.end - bestWindow.start;
			if (currentLength < bestLength) {
				bestWindow = { start: windowStart, end: windowEnd, matchCount };
			}
		}
	}

	return bestWindow || { start: 0, end: Math.min(200, content.length), matchCount: 0 };
}

/**
 * Create snippet window around matches and adjust highlight positions.
 * 
 * Process:
 * 1. Find the best window using findBestSnippetWindow (most keywords matched)
 * 2. Extract the text snippet within the window boundaries
 * 3. Filter matches that are completely within the window
 * 4. Adjust highlight positions relative to the snippet start (not absolute content positions)
 * 
 * Highlight Position Adjustment:
 * - Original positions are absolute indices in the full content
 * - After extracting snippet, positions need to be relative to snippet start
 * - Example: If snippet starts at position 100, and match is at 150, highlight position becomes 50
 */
function createSnippetWindow(
	content: string,
	originalMatches: Array<{ start: number; end: number; keyword?: string }>,
	keywords: string[],
	windowBefore: number = 80,
	windowAfter: number = 140
): SearchSnippet {
	if (originalMatches.length === 0) {
		return { text: content.slice(0, 200), highlights: [] };
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
		return { text: content.slice(0, 200), highlights: [] };
	}

	// Normalize content and query
	// This handles tokenized content where words are separated by spaces
	const normalized = normalizeContent(content);
	const normalizedQuery = normalizeQuery(q);

	if (normalized.text.length === 0) {
		return { text: content.slice(0, 200), highlights: [] };
	}

	// Split query into keywords for multi-keyword matching
	const keywords = q.split(/\s+/).filter(k => k.length > 0);
	if (keywords.length === 0) {
		return { text: content.slice(0, 220), highlights: [] };
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
		return { text: content.slice(0, 220), highlights: [] };
	}

	// Create snippet window around the best match (most keywords matched)
	return createSnippetWindow(content, allMatches, keywords);
}

