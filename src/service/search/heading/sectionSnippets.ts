/**
 * Track T2b · Section Snippets Service.
 *
 * For a given file + [lineStart, lineEnd] section + query string, return
 * up to {@link MAX_SNIPPETS_PER_SECTION} matched lines with per-line
 * highlight offsets.
 *
 * Empty-query behavior: return the first three non-heading, non-empty
 * lines of the section as a preview (spec §Recommended Heading Mode
 * empty-state calls for a useful preview even before typing).
 */

import type { HeadingFileReaderPort } from './headingTree';

export interface SectionSnippet {
	/** 1-based line number inside the file. */
	line: number;
	/** Full line text as read from source. */
	text: string;
	/** Query-term highlight ranges in `text` (char offsets, half-open). */
	highlights: Array<{ start: number; end: number }>;
}

export interface SectionSnippetsDeps {
	fileReader: HeadingFileReaderPort;
}

const MAX_SNIPPETS_PER_SECTION = 20;
const EMPTY_QUERY_PREVIEW_LINES = 3;
const HEADING_PREFIX_RE = /^#{1,6}\s+/;

function splitLines(text: string): string[] {
	return text.split(/\r\n|\r|\n/);
}

function findHighlights(line: string, query: string): Array<{ start: number; end: number }> {
	if (!query) return [];
	const lowerLine = line.toLowerCase();
	const needle = query.toLowerCase();
	const out: Array<{ start: number; end: number }> = [];
	let idx = 0;
	while (idx <= lowerLine.length - needle.length) {
		const found = lowerLine.indexOf(needle, idx);
		if (found === -1) break;
		out.push({ start: found, end: found + needle.length });
		idx = found + needle.length;
	}
	return out;
}

export async function getSectionSnippets(
	deps: SectionSnippetsDeps,
	filePath: string,
	section: { lineStart: number; lineEnd: number },
	queryText: string,
): Promise<SectionSnippet[]> {
	const text = await deps.fileReader.readText(filePath);
	if (text === null) return [];
	const lines = splitLines(text);

	// Clamp to file bounds. lineStart / lineEnd are 1-based inclusive.
	const start1 = Math.max(1, section.lineStart);
	const end1 = Math.min(lines.length, section.lineEnd);
	if (start1 > end1) return [];

	// Empty query: preview mode — first N non-heading, non-empty lines.
	if (queryText.length === 0) {
		const preview: SectionSnippet[] = [];
		for (let i = start1; i <= end1 && preview.length < EMPTY_QUERY_PREVIEW_LINES; i++) {
			const raw = lines[i - 1];
			if (raw === undefined) break;
			const trimmed = raw.trim();
			if (trimmed.length === 0) continue;
			if (HEADING_PREFIX_RE.test(raw)) continue;
			preview.push({ line: i, text: raw, highlights: [] });
		}
		return preview;
	}

	const snippets: SectionSnippet[] = [];
	for (let i = start1; i <= end1; i++) {
		const raw = lines[i - 1];
		if (raw === undefined) break;
		const highlights = findHighlights(raw, queryText);
		if (highlights.length === 0) continue;
		snippets.push({ line: i, text: raw, highlights });
		if (snippets.length >= MAX_SNIPPETS_PER_SECTION) break;
	}
	return snippets;
}
