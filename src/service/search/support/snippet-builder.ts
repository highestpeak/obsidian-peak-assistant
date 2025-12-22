import type { SearchSnippet } from '../types';

/**
 * Build a small snippet window around the first occurrence of the query.
 *
 * Notes:
 * - Best-effort: for MVP we do not attempt tokenization or multiple highlights.
 * - Offsets are JS string indices (UTF-16).
 */
export function buildSnippet(content: string, query: string): SearchSnippet | null {
	const q = query.trim();
	if (!content) return null;
	if (!q) {
		return { text: content.slice(0, 200), highlights: [] };
	}

	const lower = content.toLowerCase();
	const lowerQ = q.toLowerCase();
	const idx = lower.indexOf(lowerQ);

	// Fallback: return beginning of content.
	if (idx < 0) {
		return { text: content.slice(0, 220), highlights: [] };
	}

	const windowBefore = 80;
	const windowAfter = 140;
	const start = Math.max(0, idx - windowBefore);
	const end = Math.min(content.length, idx + lowerQ.length + windowAfter);
	const snippetText = content.slice(start, end);

	const highlightStart = idx - start;
	const highlightEnd = highlightStart + lowerQ.length;
	return { text: snippetText, highlights: [{ start: highlightStart, end: highlightEnd }] };
}

