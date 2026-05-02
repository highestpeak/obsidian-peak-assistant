/**
 * MarkdownDocEngine — shared pure-function primitives for markdown document operations.
 *
 * Provides: line normalization, frontmatter, section splitting/extraction/update,
 * content extraction (code blocks, JSON, wikilinks, lists, callouts),
 * heading manipulation, and code block safety.
 *
 * Domain-specific parsing (emoji messages, topic grouping, tool calls, mermaid preview
 * reconstruction, etc.) stays in each doc module.
 */

// ── Frontmatter (re-exports from markdown-utils, powered by gray-matter) ────
export {
	parseFrontmatter,
	buildFrontmatter,
	mergeYamlFrontmatter as updateFrontmatter,
} from '@/core/utils/markdown-utils';

// ── Normalize ───────────────────────────────────────────────────────────────

/** Normalize CRLF → LF. Every doc parser should call this first. */
export function normalizeLine(raw: string): string {
	return raw.replace(/\r\n/g, '\n');
}

// ── Section operations ──────────────────────────────────────────────────────

export interface MarkdownSection {
	/** Heading text (without the `#` prefix). */
	title: string;
	/** Heading level (1–6). */
	level: number;
	/** Body text between this heading and the next heading at the same or higher level. */
	body: string;
}

/**
 * Split markdown into sections by headings at `level` (default 1).
 * Returns one entry per heading found. Body is the text between this heading
 * and the next heading at the same level (or end of string).
 * Text before the first heading is NOT included.
 *
 * For H1 splitting: `# Title` → `{title: "Title", level: 1, body: "..."}`.
 * Nested headings of deeper level are included in the body.
 */
export function splitSections(markdown: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 1): MarkdownSection[] {
	const prefix = '#'.repeat(level);
	// Match exactly `level` hashes followed by a space, at start of line.
	// Negative lookahead ensures we don't match deeper headings (e.g., ## when level=1).
	const regex = new RegExp(`^${prefix}(?!#)\\s+(.+)$`, 'gm');
	const sections: MarkdownSection[] = [];
	const matches: Array<{ title: string; index: number; matchLength: number }> = [];

	let m: RegExpExecArray | null;
	while ((m = regex.exec(markdown)) !== null) {
		matches.push({ title: m[1].trim(), index: m.index, matchLength: m[0].length });
	}

	for (let i = 0; i < matches.length; i++) {
		const cur = matches[i];
		const bodyStart = cur.index + cur.matchLength;
		const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		// Strip leading newline after heading
		let body = markdown.slice(bodyStart, bodyEnd);
		if (body.startsWith('\n')) body = body.slice(1);
		// Trim trailing whitespace/newlines before next section
		body = body.replace(/\n+$/, '');
		sections.push({ title: cur.title, level, body });
	}
	return sections;
}

/**
 * Extract the text content of a named section (# SectionName, ## SectionName, or ### SectionName).
 * Returns empty string if section not found.
 */
export function extractSection(markdown: string, sectionTitle: string): string {
	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^#{1,3}\\s+${escapeRegExp(sectionTitle)}\\s*$`, 'm');
	const m = pattern.exec(markdown);
	if (!m) return '';
	const start = m.index + m[0].length;
	const after = markdown.slice(start);
	const nextSectionStart = after.search(/\n#\s+\S/);
	const end = nextSectionStart >= 0 ? nextSectionStart : after.length;
	return after.slice(0, end).trim();
}

/**
 * Replace the content of a named H1 section, preserving everything else.
 * Returns original markdown unchanged if section or next section not found.
 */
export function updateSection(
	markdown: string,
	sectionTitle: string,
	newContent: string,
	nextSectionTitle: string,
): string {
	const head = `# ${sectionTitle}\n\n`;
	const next = `\n# ${nextSectionTitle}`;
	const i = markdown.indexOf(head);
	if (i < 0) return markdown;
	const start = i + head.length;
	const j = markdown.indexOf(next, start);
	if (j < 0) return markdown;
	const trimmed = newContent.trim();
	return markdown.slice(0, start) + trimmed + markdown.slice(j);
}

// ── Content extraction ──────────────────────────────────────────────────────

/** Fenced code block with optional language tag. */
export interface CodeBlock {
	lang: string;
	content: string;
}

/**
 * Extract all fenced code blocks. Optionally filter by language.
 * Returns `{lang, content}` for each block found.
 */
export function extractCodeBlocks(markdown: string, lang?: string): CodeBlock[] {
	const regex = /```(\w*)\n([\s\S]*?)```/g;
	const blocks: CodeBlock[] = [];
	let m: RegExpExecArray | null;
	while ((m = regex.exec(markdown)) !== null) {
		const blockLang = m[1] || '';
		if (lang !== undefined && blockLang !== lang) continue;
		blocks.push({ lang: blockLang, content: m[2] });
	}
	return blocks;
}

/**
 * Extract and JSON.parse the first ```json code block.
 * Returns null if not found or parse fails.
 */
export function extractJsonBlock(markdown: string): unknown | null {
	const blocks = extractCodeBlocks(markdown, 'json');
	if (blocks.length === 0) return null;
	try {
		return JSON.parse(blocks[0].content);
	} catch {
		return null;
	}
}

/**
 * Extract all `[[path]]` and `[[path|alias]]` wikilinks.
 * Returns the path portion (before `|`) for each.
 */
export function extractWikilinks(markdown: string): string[] {
	const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
	const results: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(markdown)) !== null) {
		results.push(m[1].trim());
	}
	return results;
}

/**
 * Extract all top-level list items (`- item`).
 * Does not include indented sub-items.
 */
export function extractListItems(markdown: string): string[] {
	return markdown
		.split('\n')
		.filter((l) => /^- /.test(l))
		.map((l) => l.slice(2).trim());
}

// ── Callout operations ──────────────────────────────────────────────────────

/**
 * Extract an Obsidian callout block body.
 * Matches `> [!type]- title` (collapsed) or `> [!type] title` (open).
 * Returns content lines with `> ` prefix stripped, or empty string if not found.
 */
export function extractCalloutBlock(body: string, type: string, title: string): string {
	const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^> \\[!${type}\\]-?\\s+${escapedTitle}\\s*$`, 'm');
	const m = pattern.exec(body);
	if (!m) return '';
	const start = m.index + m[0].length;
	const rest = body.slice(start);
	const lines: string[] = [];
	const splitLines = rest.split('\n');
	for (let i = 1; i < splitLines.length; i++) {
		const line = splitLines[i];
		if (line === '>') {
			lines.push('');
		} else if (line.startsWith('> ')) {
			lines.push(line.slice(2));
		} else {
			break;
		}
	}
	return lines.join('\n').trim();
}

/**
 * Parse list items from callout content (lines starting with `- `).
 */
export function parseCalloutListItems(content: string): string[] {
	return content
		.split('\n')
		.filter((l) => l.trimStart().startsWith('- '))
		.map((l) => l.trimStart().slice(2).trim())
		.filter(Boolean);
}

// ── Heading manipulation ────────────────────────────────────────────────────

/**
 * Rebase markdown headings so the minimum heading level becomes `baseLevel` (1–6).
 * If no headings found, returns markdown unchanged.
 */
export function rebaseHeadings(markdown: string, baseLevel: number): string {
	const lines = markdown.split('\n');
	let minLevel = 7;
	for (const line of lines) {
		const m = line.match(/^(#{1,6})\s+/);
		if (m && m[1].length < minLevel) minLevel = m[1].length;
	}
	if (minLevel > 6) return markdown;
	const shift = baseLevel - minLevel;
	if (shift === 0) return markdown;
	return lines
		.map((line) => {
			const m = line.match(/^(#{1,6})(\s+.*)$/);
			if (!m) return line;
			const newLevel = Math.min(6, Math.max(1, m[1].length + shift));
			return '#'.repeat(newLevel) + m[2];
		})
		.join('\n');
}

// ── Code block safety ───────────────────────────────────────────────────────

/**
 * Ensure all fenced code blocks are properly closed.
 * If an odd number of ``` markers exists, appends a closing ```.
 */
export function fixUnclosedCodeBlocks(content: string): string {
	if (!content) return content;
	const matches = content.match(/```/g);
	if (!matches || matches.length % 2 === 0) return content;
	const trimmed = content.trimEnd();
	const needsNewline = !trimmed.endsWith('\n');
	return trimmed + (needsNewline ? '\n```' : '```');
}
