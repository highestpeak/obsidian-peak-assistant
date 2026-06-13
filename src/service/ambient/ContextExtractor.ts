// T8: pure context-extraction helpers. The previous
// `extractContext(app, fileOpenedAt, filePath?)` overload reached the
// Obsidian `App` and `MarkdownView` directly; that path moved to
// `src/app/ambient/ObsidianAmbientEditorContextAdapter.ts` where it
// belongs (it owns the Obsidian dependency). The helpers below stay
// service-layer because they are byte-pure text utilities and are
// imported by `test/ambient-push.test.ts`.

/**
 * Extract the paragraph block containing the given line.
 * A paragraph is delimited by empty lines or heading lines (starting with `#`).
 * If lineIndex is on an empty line, return ''.
 * If on a heading, return just that heading line.
 */
export function extractParagraphAtLine(lines: string[], lineIndex: number): string {
	if (lineIndex < 0 || lineIndex >= lines.length) return '';

	const line = lines[lineIndex];
	if (line.trim() === '') return '';
	if (/^#{1,6}\s+/.test(line)) return line;

	// Walk backward to find paragraph start
	let start = lineIndex;
	while (start > 0) {
		const prev = lines[start - 1];
		if (prev.trim() === '' || /^#{1,6}\s+/.test(prev)) break;
		start--;
	}

	// Walk forward to find paragraph end
	let end = lineIndex;
	while (end < lines.length - 1) {
		const next = lines[end + 1];
		if (next.trim() === '' || /^#{1,6}\s+/.test(next)) break;
		end++;
	}

	return lines.slice(start, end + 1).join('\n');
}

/**
 * Extract [[wikilink]] targets from text.
 * Strips aliases ([[target|alias]] → target) and heading fragments ([[target#heading]] → target).
 */
export function extractOutlinks(text: string): string[] {
	const regex = /\[\[([^\]]+)\]\]/g;
	const results: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		let target = match[1];
		// Strip heading fragment
		const hashIndex = target.indexOf('#');
		if (hashIndex !== -1) target = target.slice(0, hashIndex);
		// Strip alias
		const pipeIndex = target.indexOf('|');
		if (pipeIndex !== -1) target = target.slice(0, pipeIndex);
		// Only add non-empty targets
		const trimmed = target.trim();
		if (trimmed && !results.includes(trimmed)) {
			results.push(trimmed);
		}
	}

	return results;
}

/**
 * Extract H1-H3 heading text from lines.
 */
export function extractHeadings(lines: string[]): string[] {
	const headings: string[] = [];
	const headingRegex = /^(#{1,3})\s+(.+)$/;

	for (const line of lines) {
		const match = headingRegex.exec(line);
		if (match) {
			headings.push(match[2].trim());
		}
	}

	return headings;
}

/**
 * Build heading hierarchy path to a given line.
 * E.g. "Top > Section A > Subsection"
 */
export function getCursorSection(lines: string[], lineIndex: number): string {
	const headingRegex = /^(#{1,6})\s+(.+)$/;
	const stack: { level: number; text: string }[] = [];

	const end = Math.min(lineIndex, lines.length - 1);
	for (let i = 0; i <= end; i++) {
		const match = headingRegex.exec(lines[i]);
		if (match) {
			const level = match[1].length;
			const text = match[2].trim();
			// Pop headings at same or deeper level
			while (stack.length > 0 && stack[stack.length - 1].level >= level) {
				stack.pop();
			}
			stack.push({ level, text });
		}
	}

	return stack.map((h) => h.text).join(' > ');
}
