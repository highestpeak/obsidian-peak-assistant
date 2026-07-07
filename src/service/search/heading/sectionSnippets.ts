/**
 * Track T2b · Section Snippets Service (stub).
 *
 * Types locked for T5 (Heading Mode UI); implementation follows.
 */

import type { HeadingFileReaderPort } from './headingTree';

export interface SectionSnippet {
	/** 1-based line number inside the file. */
	line: number;
	/** Full line text as read from the source (no truncation). */
	text: string;
	/** Query-term highlight ranges in `text` (char offsets, half-open). */
	highlights: Array<{ start: number; end: number }>;
}

export interface SectionSnippetsDeps {
	fileReader: HeadingFileReaderPort;
}

export async function getSectionSnippets(
	_deps: SectionSnippetsDeps,
	_filePath: string,
	_section: { lineStart: number; lineEnd: number },
	_queryText: string,
): Promise<SectionSnippet[]> {
	throw new Error('T2b stub');
}
