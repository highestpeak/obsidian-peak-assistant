# Vault Doc Unified Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated markdown parsing/serialization logic across 6 vault doc files by building a shared Engine + Builder framework, then migrating all doc files to use it — including the most complex one (ChatConversationDoc).

**Architecture:** Two-layer approach: (1) `MarkdownDocEngine` — pure-function primitives for splitting sections, extracting content, manipulating headings; (2) `MarkdownDocBuilder` — fluent API replacing the `lines[].push → join('\n')` pattern. Domain-specific logic (emoji-based message headers, topic grouping, tool call parsing) stays in each doc file but operates on structured data returned by Engine primitives.

**Tech Stack:** TypeScript, gray-matter (existing dep for frontmatter)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/storage/vault/framework/MarkdownDocEngine.ts` | **Modify** | Add `normalizeLine`, `splitSections`, `extractCodeBlocks`, `extractJsonBlock`, `extractWikilinks`, `extractListItems`, `extractCalloutBlock`, `rebaseHeadings`, `fixUnclosedCodeBlocks`; re-export `buildFrontmatter` |
| `src/core/storage/vault/framework/MarkdownDocBuilder.ts` | **Create** | Fluent builder class for constructing markdown documents |
| `src/core/storage/vault/framework/MarkdownDocSchema.ts` | **Delete** | Unused at runtime — `MarkdownDocSchemaDef` type only used in HubDocLlmMarkdown, will inline |
| `test/vault-framework/MarkdownDocEngine.test.ts` | **Create** | Unit tests for all Engine primitives |
| `test/vault-framework/MarkdownDocBuilder.test.ts` | **Create** | Unit tests for Builder output |
| `src/core/storage/vault/chat-docs/ChatProjectSummaryDoc.ts` | **Modify** | Rewrite parse/render using Engine + Builder |
| `src/core/storage/vault/search-docs/AiGraphDoc.ts` | **Modify** | Rewrite build/parse using Engine + Builder |
| `src/core/storage/vault/chat-docs/ChatConversationDoc.ts` | **Modify** | Rewrite render + parse using Engine + Builder |
| `src/core/storage/vault/search-docs/analysis-markdown-builder.ts` | **Modify** | Replace `lines[]` with Builder, use Engine's `rebaseHeadings` + `buildFrontmatter` |
| `src/core/storage/vault/search-docs/analysis-markdown-parser.ts` | **Modify** | Replace hand-rolled frontmatter with Engine's, replace local callout/mermaid helpers with Engine's |
| `src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts` | **Modify** | Minor — remove `MarkdownDocSchema` import, already uses Engine |
| `src/core/storage/vault/ChatStore.ts` | **Modify** | Replace duplicated `createMessageKey` with import from `ChatConversationDoc` |

---

### Task 1: Enhance MarkdownDocEngine with Shared Primitives

**Files:**
- Modify: `src/core/storage/vault/framework/MarkdownDocEngine.ts`

- [ ] **Step 1: Write the enhanced Engine**

Replace the entire file with:

```typescript
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
 * Extract and JSON.parse the first ```json``` code block.
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
 * Ensure all fenced code blocks (```) are properly closed.
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from `MarkdownDocEngine.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/vault/framework/MarkdownDocEngine.ts
git commit -m "refactor(vault-doc): enhance MarkdownDocEngine with shared primitives

Add normalizeLine, splitSections, extractCodeBlocks, extractJsonBlock,
extractWikilinks, extractListItems, extractCalloutBlock, parseCalloutListItems,
rebaseHeadings, fixUnclosedCodeBlocks. Re-export buildFrontmatter."
```

---

### Task 2: Create MarkdownDocBuilder

**Files:**
- Create: `src/core/storage/vault/framework/MarkdownDocBuilder.ts`

- [ ] **Step 1: Write the Builder**

```typescript
/**
 * MarkdownDocBuilder — fluent API for constructing markdown documents.
 *
 * Replaces the `lines: string[] = []; lines.push(...); lines.join('\n')` pattern
 * used across all vault doc builders.
 *
 * Usage:
 *   const md = new MarkdownDocBuilder()
 *     .frontmatter({ type: 'ai-graph', query: 'test' })
 *     .heading(1, 'Summary')
 *     .text('This is the summary.')
 *     .blankLine()
 *     .heading(1, 'Sources')
 *     .wikilinks(['file1.md', 'file2.md'])
 *     .build();
 */

import { buildFrontmatter } from '@/core/utils/markdown-utils';

export class MarkdownDocBuilder {
	private parts: string[] = [];

	/** Add YAML frontmatter block. Must be called first (before any other content). */
	frontmatter(fields: Record<string, unknown>): this {
		const fm = buildFrontmatter(fields).trim();
		this.parts.push(fm);
		return this;
	}

	/** Add raw YAML frontmatter lines (for cases where field order matters or values need custom escaping). */
	frontmatterRaw(fields: Array<[key: string, value: string | number | boolean | undefined | null]>): this {
		const lines = ['---'];
		for (const [key, value] of fields) {
			if (value === undefined || value === null) continue;
			lines.push(`${key}: ${value}`);
		}
		lines.push('---');
		this.parts.push(lines.join('\n'));
		return this;
	}

	/** Add a heading at the given level (1–6). */
	heading(level: number, text: string): this {
		this.parts.push('#'.repeat(level) + ' ' + text);
		return this;
	}

	/** Add raw text content. */
	text(content: string): this {
		this.parts.push(content);
		return this;
	}

	/** Add an empty line (section separator). */
	blankLine(): this {
		this.parts.push('');
		return this;
	}

	/** Add a fenced code block with optional language. */
	codeBlock(lang: string, code: string): this {
		this.parts.push('```' + lang);
		this.parts.push(code);
		this.parts.push('```');
		return this;
	}

	/** Add a JSON code block. */
	json(data: unknown, indent = 2): this {
		return this.codeBlock('json', JSON.stringify(data, null, indent));
	}

	/** Add a mermaid diagram block. */
	mermaid(code: string): this {
		return this.codeBlock('mermaid', code);
	}

	/** Add a bullet list (`- item`). */
	list(items: string[]): this {
		for (const item of items) this.parts.push(`- ${item}`);
		return this;
	}

	/** Add a numbered list (`1. item`). */
	numberedList(items: string[]): this {
		items.forEach((item, i) => this.parts.push(`${i + 1}. ${item}`));
		return this;
	}

	/** Add wikilinks as a bullet list (`- [[path]]`). */
	wikilinks(paths: string[]): this {
		for (const p of paths) this.parts.push(`- [[${p}]]`);
		return this;
	}

	/** Add an Obsidian callout block. */
	callout(type: string, title: string, content: string, collapsed = false): this {
		const marker = collapsed ? '-' : '';
		this.parts.push(`> [!${type}]${marker} ${title}`);
		for (const line of content.split('\n')) {
			this.parts.push(line ? `> ${line}` : '>');
		}
		return this;
	}

	/**
	 * Add a section: heading + body + trailing blank line.
	 * Body can be a string or a callback that receives a sub-builder.
	 */
	section(level: 1 | 2 | 3 | 4 | 5 | 6, title: string, body: string | ((b: MarkdownDocBuilder) => void)): this {
		this.heading(level, title);
		if (typeof body === 'string') {
			if (body.trim()) this.text(body);
		} else {
			const sub = new MarkdownDocBuilder();
			body(sub);
			const built = sub.buildInner();
			if (built.trim()) this.text(built);
		}
		this.blankLine();
		return this;
	}

	/** Add raw content (escape hatch — content is inserted as-is). */
	raw(text: string): this {
		this.parts.push(text);
		return this;
	}

	/** Build the final markdown string (trimmed, with trailing newline). */
	build(): string {
		return this.parts.join('\n').trim() + '\n';
	}

	/** Build inner content (no trailing newline, for nesting). */
	private buildInner(): string {
		return this.parts.join('\n');
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/vault/framework/MarkdownDocBuilder.ts
git commit -m "feat(vault-doc): add MarkdownDocBuilder fluent API

Replaces lines[].push → join('\n') pattern across all vault doc builders.
Supports frontmatter, headings, code blocks, lists, wikilinks, callouts, sections."
```

---

### Task 3: Write Unit Tests for Engine + Builder

**Files:**
- Create: `test/vault-framework/MarkdownDocEngine.test.ts`
- Create: `test/vault-framework/MarkdownDocBuilder.test.ts`

- [ ] **Step 1: Write Engine tests**

```typescript
/**
 * Tests for MarkdownDocEngine shared primitives.
 * Run: npm run test -- test/vault-framework/MarkdownDocEngine.test.ts
 */

import {
	normalizeLine,
	splitSections,
	extractSection,
	extractCodeBlocks,
	extractJsonBlock,
	extractWikilinks,
	extractListItems,
	extractCalloutBlock,
	parseCalloutListItems,
	rebaseHeadings,
	fixUnclosedCodeBlocks,
} from '@/core/storage/vault/framework/MarkdownDocEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
	if (condition) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
	}
}

function assertEqual(actual: unknown, expected: unknown, name: string) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	assert(a === e, name, `expected ${e}, got ${a}`);
}

// ── normalizeLine ──
assertEqual(normalizeLine('a\r\nb\r\n'), 'a\nb\n', 'normalizeLine: CRLF → LF');
assertEqual(normalizeLine('no crlf'), 'no crlf', 'normalizeLine: no-op on LF');

// ── splitSections ──
{
	const md = `# Attachments\n- [[file1.md]]\n\n# Short Summary\nHello\n\n# Full Summary\nWorld`;
	const sections = splitSections(md, 1);
	assertEqual(sections.length, 3, 'splitSections: 3 H1 sections');
	assertEqual(sections[0].title, 'Attachments', 'splitSections: first title');
	assert(sections[0].body.includes('[[file1.md]]'), 'splitSections: first body has wikilink');
	assertEqual(sections[1].title, 'Short Summary', 'splitSections: second title');
	assertEqual(sections[1].body.trim(), 'Hello', 'splitSections: second body');
	assertEqual(sections[2].title, 'Full Summary', 'splitSections: third title');
	assertEqual(sections[2].body.trim(), 'World', 'splitSections: third body');
}

// splitSections does not match deeper headings
{
	const md = `# H1\n## H2 inside\ncontent\n# Another H1\nmore`;
	const sections = splitSections(md, 1);
	assertEqual(sections.length, 2, 'splitSections: ignores ## when splitting by H1');
	assert(sections[0].body.includes('## H2 inside'), 'splitSections: body includes deeper heading');
}

// splitSections at H2
{
	const md = `## First\nbody1\n## Second\nbody2`;
	const sections = splitSections(md, 2);
	assertEqual(sections.length, 2, 'splitSections H2: 2 sections');
	assertEqual(sections[0].title, 'First', 'splitSections H2: first title');
	assertEqual(sections[1].title, 'Second', 'splitSections H2: second title');
}

// splitSections with emoji titles (ChatConversationDoc pattern)
{
	const md = `# 💬 Hello\nuser msg\n# 🤖 Response\nassistant msg`;
	const sections = splitSections(md, 1);
	assertEqual(sections.length, 2, 'splitSections emoji: 2 sections');
	assertEqual(sections[0].title, '💬 Hello', 'splitSections emoji: first title');
	assertEqual(sections[1].title, '🤖 Response', 'splitSections emoji: second title');
}

// ── extractSection ──
{
	const md = `# Summary\nThis is the summary.\n\n# Sources\n- item`;
	assertEqual(extractSection(md, 'Summary'), 'This is the summary.', 'extractSection: basic');
	assertEqual(extractSection(md, 'Missing'), '', 'extractSection: not found');
}

// ── extractCodeBlocks ──
{
	const md = '```json\n{"a":1}\n```\n\n```mermaid\nflowchart TD\n```';
	const all = extractCodeBlocks(md);
	assertEqual(all.length, 2, 'extractCodeBlocks: all blocks');
	const jsonOnly = extractCodeBlocks(md, 'json');
	assertEqual(jsonOnly.length, 1, 'extractCodeBlocks: filter by json');
	assertEqual(jsonOnly[0].content, '{"a":1}\n', 'extractCodeBlocks: json content');
	const mermaidOnly = extractCodeBlocks(md, 'mermaid');
	assertEqual(mermaidOnly.length, 1, 'extractCodeBlocks: filter by mermaid');
}

// ── extractJsonBlock ──
{
	const md = 'text\n```json\n{"key":"value"}\n```\nmore text';
	const parsed = extractJsonBlock(md) as Record<string, string>;
	assertEqual(parsed?.key, 'value', 'extractJsonBlock: parses JSON');
	assertEqual(extractJsonBlock('no json here'), null, 'extractJsonBlock: null when missing');
}

// ── extractWikilinks ──
{
	const md = '- [[file1.md]]\n- [[path/file2|Alias]]\ntext [[inline]]';
	const links = extractWikilinks(md);
	assertEqual(links, ['file1.md', 'path/file2', 'inline'], 'extractWikilinks: extracts paths');
}

// ── extractListItems ──
{
	const md = '- item 1\n- item 2\n  - sub-item\nnot a list';
	const items = extractListItems(md);
	assertEqual(items, ['item 1', 'item 2'], 'extractListItems: top-level only');
}

// ── extractCalloutBlock ──
{
	const md = `> [!abstract]- Process Log\n> - step 1\n> - step 2\n\nnormal text`;
	const content = extractCalloutBlock(md, 'abstract', 'Process Log');
	assert(content.includes('step 1'), 'extractCalloutBlock: includes content');
	const items = parseCalloutListItems(content);
	assertEqual(items, ['step 1', 'step 2'], 'parseCalloutListItems: extracts items');
}

// ── rebaseHeadings ──
{
	const md = '# Title\n## Sub\n### Deep';
	const rebased = rebaseHeadings(md, 2);
	assert(rebased.startsWith('## Title'), 'rebaseHeadings: shifts to level 2');
	assert(rebased.includes('### Sub'), 'rebaseHeadings: shifts sub-heading');
	assert(rebased.includes('#### Deep'), 'rebaseHeadings: shifts deep heading');
	assertEqual(rebaseHeadings('no headings', 2), 'no headings', 'rebaseHeadings: no-op without headings');
}

// ── fixUnclosedCodeBlocks ──
{
	const unclosed = 'text\n```python\ncode here';
	const fixed = fixUnclosedCodeBlocks(unclosed);
	const count = (fixed.match(/```/g) || []).length;
	assert(count % 2 === 0, 'fixUnclosedCodeBlocks: closes unclosed block');
	const closed = 'text\n```python\ncode\n```';
	assertEqual(fixUnclosedCodeBlocks(closed), closed, 'fixUnclosedCodeBlocks: no-op on closed');
}

// ── Results ──
console.log(`\nEngine tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Write Builder tests**

```typescript
/**
 * Tests for MarkdownDocBuilder.
 * Run: npm run test -- test/vault-framework/MarkdownDocBuilder.test.ts
 */

import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
	if (condition) {
		passed++;
	} else {
		failed++;
		console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
	}
}

// ── Basic building ──
{
	const md = new MarkdownDocBuilder()
		.heading(1, 'Title')
		.text('Content')
		.blankLine()
		.heading(1, 'Next')
		.text('More')
		.build();
	assert(md.includes('# Title\nContent'), 'basic: heading + text');
	assert(md.includes('# Next\nMore'), 'basic: second section');
	assert(md.endsWith('\n'), 'basic: trailing newline');
}

// ── Frontmatter ──
{
	const md = new MarkdownDocBuilder()
		.frontmatterRaw([
			['type', 'test'],
			['version', 1],
			['optional', undefined],
		])
		.heading(1, 'Body')
		.build();
	assert(md.startsWith('---'), 'frontmatter: starts with ---');
	assert(md.includes('type: test'), 'frontmatter: has field');
	assert(md.includes('version: 1'), 'frontmatter: has number');
	assert(!md.includes('optional'), 'frontmatter: skips undefined');
}

// ── Code blocks ──
{
	const md = new MarkdownDocBuilder()
		.json({ a: 1 })
		.mermaid('flowchart TD\n  A --> B')
		.codeBlock('python', 'print("hello")')
		.build();
	assert(md.includes('```json'), 'code: json block');
	assert(md.includes('"a": 1'), 'code: json content');
	assert(md.includes('```mermaid'), 'code: mermaid block');
	assert(md.includes('```python'), 'code: python block');
}

// ── Lists ──
{
	const md = new MarkdownDocBuilder()
		.list(['item 1', 'item 2'])
		.numberedList(['first', 'second'])
		.wikilinks(['file1.md', 'file2.md'])
		.build();
	assert(md.includes('- item 1'), 'list: bullet');
	assert(md.includes('1. first'), 'list: numbered');
	assert(md.includes('- [[file1.md]]'), 'list: wikilinks');
}

// ── Callout ──
{
	const md = new MarkdownDocBuilder()
		.callout('tip', 'My Tip', 'line 1\nline 2', true)
		.build();
	assert(md.includes('> [!tip]- My Tip'), 'callout: collapsed header');
	assert(md.includes('> line 1'), 'callout: content line');
}

// ── Section convenience ──
{
	const md = new MarkdownDocBuilder()
		.section(1, 'Summary', 'This is a summary.')
		.section(2, 'Details', (b) => {
			b.list(['point 1', 'point 2']);
		})
		.build();
	assert(md.includes('# Summary\nThis is a summary.'), 'section: string body');
	assert(md.includes('## Details\n- point 1'), 'section: builder body');
}

// ── ChatConversationDoc render pattern ──
{
	const b = new MarkdownDocBuilder();
	b.heading(1, 'Attachments');
	b.wikilinks(['note1.md', 'note2.md']);
	b.blankLine();
	b.heading(1, 'Short Summary');
	b.text('Brief overview');
	b.blankLine();
	b.heading(1, 'Topic A');
	b.blankLine();
	b.text('Topic summary text');
	b.blankLine();
	b.heading(1, '💬 Question');
	b.text('What is this?');
	b.blankLine();
	b.heading(1, '🤖 Answer');
	b.text('This is the answer.');
	b.blankLine();
	const md = b.build();
	assert(md.includes('# Attachments\n- [[note1.md]]'), 'chat: attachments');
	assert(md.includes('# 💬 Question\nWhat is this?'), 'chat: user message');
	assert(md.includes('# 🤖 Answer\nThis is the answer.'), 'chat: assistant message');
}

// ── Results ──
console.log(`\nBuilder tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- test/vault-framework/MarkdownDocEngine.test.ts && npm run test -- test/vault-framework/MarkdownDocBuilder.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/vault-framework/
git commit -m "test(vault-doc): add unit tests for MarkdownDocEngine and MarkdownDocBuilder"
```

---

### Task 4: Migrate ChatProjectSummaryDoc

Simplest doc file — validates the framework API works for a real use case.

**Files:**
- Modify: `src/core/storage/vault/chat-docs/ChatProjectSummaryDoc.ts:1-78`

- [ ] **Step 1: Rewrite using Engine + Builder**

```typescript
/**
 * Document model for project summary markdown (plain text, no meta).
 */

import { normalizeLine, splitSections } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

export interface ChatProjectSummaryModel {
	shortSummary: string;
	fullSummary: string;
}

export class ChatProjectSummaryDoc {
	/**
	 * Build project summary markdown (plain text, no meta).
	 */
	static buildMarkdown(params: {
		shortSummary?: string;
		fullSummary?: string;
	}): string {
		const b = new MarkdownDocBuilder();
		const short = (params.shortSummary ?? '').trim();
		const full = (params.fullSummary ?? '').trim();
		if (short) b.section(2, 'Short Summary', short);
		if (full) b.section(2, 'Full Summary', full);
		return b.build();
	}

	/**
	 * Parse project summary markdown.
	 *
	 * Supported formats:
	 * - Sectioned headings: `## Short Summary`, `## Full Summary`
	 * - Legacy/plain text: first paragraph => shortSummary, remainder => fullSummary
	 */
	static parse(raw: string): ChatProjectSummaryModel {
		const text = normalizeLine(raw).trim();
		if (!text) return { shortSummary: '', fullSummary: '' };

		const sections = splitSections(text, 2);
		if (sections.length === 0) {
			// Legacy format: first paragraph is short, rest is full.
			const blocks = text.split(/\n{2,}/);
			return {
				shortSummary: (blocks[0] ?? '').trim(),
				fullSummary: blocks.slice(1).join('\n\n').trim(),
			};
		}

		const findSection = (title: string) =>
			sections.find((s) => s.title === title)?.body.trim() ?? '';

		return {
			shortSummary: findSection('Short Summary'),
			fullSummary: findSection('Full Summary'),
		};
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Run existing ChatConversationDoc tests (uses ChatProjectSummaryDoc via ChatStore)**

Run: `npm run test -- test/chat-docs/ChatConversationDoc.test.ts`
Expected: All tests pass (no regression).

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/vault/chat-docs/ChatProjectSummaryDoc.ts
git commit -m "refactor(vault-doc): migrate ChatProjectSummaryDoc to Engine + Builder"
```

---

### Task 5: Migrate AiGraphDoc

**Files:**
- Modify: `src/core/storage/vault/search-docs/AiGraphDoc.ts:1-71`

- [ ] **Step 1: Rewrite using Engine + Builder**

```typescript
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import { aiGraphDocSchema, type AiGraphDocData } from '@/core/schemas/ai-graph-schemas';
import { extractJsonBlock } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

interface AiGraphDocModel {
	query: string;
	created: string;
	summary: string;
	graphData: LensGraphData;
	lensHint?: string;
}

function escapeYamlStr(s: string): string {
	return `"${s.replace(/"/g, '\\"')}"`;
}

export function buildAiGraphMarkdown(model: AiGraphDocModel): string {
	return new MarkdownDocBuilder()
		.frontmatterRaw([
			['type', 'ai-graph'],
			['query', escapeYamlStr(model.query)],
			['created', model.created],
			['lens', model.lensHint ?? 'topology'],
			['sources', model.graphData.nodes.length],
		])
		.blankLine()
		.heading(2, `AI Graph: ${model.query}`)
		.blankLine()
		.section(3, 'Summary', model.summary)
		.heading(3, 'Graph Data')
		.json(
			{
				nodes: model.graphData.nodes.map((n) => ({
					id: n.path,
					label: n.label,
					path: n.path,
					role: n.role,
					group: n.group,
					level: n.level,
					parentId: n.parentId,
					summary: n.summary,
				})),
				edges: model.graphData.edges.map((e) => ({
					source: e.source,
					target: e.target,
					kind: e.kind,
					weight: e.weight,
					label: e.label,
				})),
				lensHint: model.lensHint ?? 'topology',
			},
			2
		)
		.blankLine()
		.heading(3, 'Sources')
		.list(model.graphData.nodes.map((n) => `[[${n.path}]] — ${n.summary ?? n.label}`))
		.blankLine()
		.build();
}

export function parseAiGraphMarkdown(content: string): AiGraphDocData | null {
	const parsed = extractJsonBlock(content);
	if (!parsed) return null;
	try {
		return aiGraphDocSchema.parse(parsed);
	} catch {
		return null;
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/vault/search-docs/AiGraphDoc.ts
git commit -m "refactor(vault-doc): migrate AiGraphDoc to Engine + Builder"
```

---

### Task 6: Migrate ChatConversationDoc

The most complex doc. Strategy:
- **Render**: Replace `sections: string[] → push → join` with `MarkdownDocBuilder`
- **Parse**: Replace `findLevel1Headings` line-scanning with `splitSections(md, 1)`, replace `REGEX_SHORT_SUMMARY_SECTION` / `REGEX_FULL_SUMMARY_SECTION` with section lookup, replace `REGEX_LEVEL2_HEADINGS` split with `splitSections(body, 2)`
- **Shared utils**: Use Engine's `normalizeLine`, `rebaseHeadings`, `fixUnclosedCodeBlocks`, `extractWikilinks`
- **Domain logic**: Emoji classification, topic state machine, tool call JSON parsing — stays in this file

**Files:**
- Modify: `src/core/storage/vault/chat-docs/ChatConversationDoc.ts`

- [ ] **Step 1: Rewrite the file**

Replace the entire file with:

```typescript
import type { ChatMessage, ChatResourceRef } from '@/service/chat/types';
import { hashMD5 } from '@/core/utils/hash-utils';
import {
	normalizeLine,
	splitSections,
	extractWikilinks,
	rebaseHeadings,
	fixUnclosedCodeBlocks,
} from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';

// ── Constants ───────────────────────────────────────────────────────────────

const SECTION_ATTACHMENTS = 'Attachments';
const SECTION_SHORT_SUMMARY = 'Short Summary';
const SECTION_FULL_SUMMARY = 'Full Summary';
const SECTION_NO_TOPIC = 'NoTopic';

/** Pre-compiled regex for code blocks with optional language specifier */
const REGEX_CODEBLOCK = /```(?:json|javascript|js)?\n?([\s\S]*?)```/g;

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Message in document format (plain text representation).
 */
export interface ChatMessageDoc {
	role: 'user' | 'assistant' | 'system';
	content: string;
	title?: string;
	reasoning?: { content: string };
	toolCalls?: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }>;
}

/**
 * Topic section in conversation document.
 */
export interface ChatConversationTopicDoc {
	title: string;
	summary?: string;
	messages: Array<ChatMessageDoc>;
}

export interface ChatConversationDocModel {
	attachments: string[];
	shortSummary: string;
	fullSummary: string;
	topics: ChatConversationTopicDoc[];
	messages: Array<ChatMessageDoc>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isMessageTitle(title: string): boolean {
	return title.startsWith('💬') || title.startsWith('🤖');
}

function parseMessageRole(title: string): 'user' | 'assistant' {
	return title.startsWith('💬') ? 'user' : 'assistant';
}

function parseMessageShortTitle(title: string): string | undefined {
	const m = title.match(/^(?:💬|🤖)\s+(.+)$/);
	return m ? m[1] : undefined;
}

// ── Main class ──────────────────────────────────────────────────────────────

export class ChatConversationDoc {

	// ── Message key (for deduplication) ──────────────────────────────────────

	/**
	 * Create a unique key for message identification.
	 * Uses role + MD5 hash of content + title to identify messages.
	 */
	static createMessageKey(msg: ChatMessageDoc): string;
	static createMessageKey(role: string, content: string, title?: string): string;
	static createMessageKey(msgOrRole: ChatMessageDoc | string, content?: string, title?: string): string {
		if (typeof msgOrRole === 'string') {
			return `${msgOrRole}|${hashMD5(content!)}|${title || ''}`;
		}
		return `${msgOrRole.role}|${hashMD5(msgOrRole.content)}|${msgOrRole.title || ''}`;
	}

	// ── Render ──────────────────────────────────────────────────────────────

	static buildMarkdown(params: {
		docModel: ChatConversationDocModel;
		attachments?: ChatResourceRef[];
	}): string {
		const { docModel, attachments: providedAttachments = [] } = params;

		// Merge attachments from docModel and params
		const allAttachments = new Map<string, ChatResourceRef>();
		for (const source of docModel.attachments) {
			allAttachments.set(source, { source } as ChatResourceRef);
		}
		for (const att of providedAttachments) {
			allAttachments.set(att.source, att);
		}

		return this.render(docModel, Array.from(allAttachments.values()));
	}

	private static render(
		docModel: ChatConversationDocModel,
		attachments: ChatResourceRef[],
	): string {
		const b = new MarkdownDocBuilder();

		// Attachments
		if (attachments.length > 0) {
			b.heading(1, SECTION_ATTACHMENTS);
			b.wikilinks(attachments.map((a) => a.source));
			b.blankLine();
		}

		// Summaries
		if (docModel.shortSummary) {
			b.heading(1, SECTION_SHORT_SUMMARY);
			b.text(docModel.shortSummary);
			b.blankLine();
		}
		if (docModel.fullSummary) {
			b.heading(1, SECTION_FULL_SUMMARY);
			b.text(docModel.fullSummary);
			b.blankLine();
		}

		// Topics
		for (const topic of docModel.topics) {
			b.heading(1, topic.title);
			b.blankLine();
			if (topic.summary) {
				b.text(topic.summary);
				b.blankLine();
			}
			for (const msg of topic.messages) {
				this.renderMessage(b, msg);
			}
		}

		// NoTopic messages
		if (docModel.messages.length > 0) {
			b.heading(1, SECTION_NO_TOPIC);
			b.blankLine();
			for (const msg of docModel.messages) {
				this.renderMessage(b, msg);
			}
		}

		return b.build();
	}

	private static renderMessage(b: MarkdownDocBuilder, msg: ChatMessageDoc): void {
		if (msg.role !== 'user' && msg.role !== 'assistant') return;

		const emoji = msg.role === 'user' ? '💬' : '🤖';
		const shortTitle = (msg.title ?? '').trim();
		const header = shortTitle ? `${emoji} ${shortTitle}` : emoji;

		let content = msg.content;
		if (this.needsNormalization(content, msg.role)) {
			content = rebaseHeadings(content, 2);
		}
		content = fixUnclosedCodeBlocks(content);

		b.heading(1, header);
		b.text(content);
		b.blankLine();
	}

	private static needsNormalization(content: string, role: string): boolean {
		if (role !== 'user' && role !== 'assistant') return false;
		const trimmed = content.trim();
		if (!trimmed) return false;
		for (const line of trimmed.split('\n')) {
			const tl = line.trim();
			if (!tl) continue;
			return tl.startsWith('# ') && !tl.startsWith('## ');
		}
		return false;
	}

	/**
	 * Normalize content to ensure it starts with level 2 heading or below.
	 * Public for ChatStore backward compat.
	 */
	static normalizeContentLevel(content: string, role: ChatMessageDoc['role']): string {
		if (role !== 'user' && role !== 'assistant') return content;
		if (!this.needsNormalization(content, role)) return content;
		return rebaseHeadings(content, 2);
	}

	// ── Parse ───────────────────────────────────────────────────────────────

	static parse(raw: string): ChatConversationDocModel {
		const md = normalizeLine(raw);
		const sections = splitSections(md, 1);

		const attachments: string[] = [];
		let shortSummary = '';
		let fullSummary = '';
		const topics: ChatConversationTopicDoc[] = [];
		const messages: ChatMessageDoc[] = [];
		let currentTopic: ChatConversationTopicDoc | null = null;

		for (const sec of sections) {
			if (sec.title === SECTION_ATTACHMENTS) {
				attachments.push(...extractWikilinks(sec.body));
			} else if (sec.title === SECTION_SHORT_SUMMARY) {
				shortSummary = sec.body.trim();
			} else if (sec.title === SECTION_FULL_SUMMARY) {
				fullSummary = sec.body.trim();
			} else if (isMessageTitle(sec.title)) {
				const msg = this.parseMessageSection(sec.title, sec.body);
				if (msg) {
					if (currentTopic) {
						currentTopic.messages.push(msg);
					} else {
						messages.push(msg);
					}
				}
			} else if (sec.title === SECTION_NO_TOPIC) {
				if (currentTopic) {
					topics.push(currentTopic);
					currentTopic = null;
				}
				// NoTopic body itself is empty; messages follow as separate H1 sections.
				// They are handled by subsequent iterations.
			} else {
				// Topic header
				if (currentTopic) topics.push(currentTopic);
				currentTopic = {
					title: sec.title,
					summary: sec.body.trim() || undefined,
					messages: [],
				};
			}
		}
		if (currentTopic) topics.push(currentTopic);

		return { attachments, shortSummary, fullSummary, topics, messages };
	}

	private static parseMessageSection(headerTitle: string, body: string): ChatMessageDoc | null {
		const trimmedBody = body.trim();
		if (!trimmedBody) return null;

		const role = parseMessageRole(headerTitle);
		const title = parseMessageShortTitle(headerTitle);
		const { mainContent, reasoning, toolCalls } = this.parseReasoningAndTools(trimmedBody);

		return { role, content: mainContent, title, reasoning, toolCalls };
	}

	private static parseReasoningAndTools(content: string): {
		mainContent: string;
		reasoning?: { content: string };
		toolCalls?: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }>;
	} {
		const h2Sections = splitSections(content, 2);
		if (h2Sections.length === 0) return { mainContent: content };

		let reasoning: { content: string } | undefined;
		let toolCalls: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> | undefined;
		const processedParts: string[] = [];

		// Text before first ## heading
		const firstH2Regex = /^## /m;
		const firstH2Match = firstH2Regex.exec(content);
		if (firstH2Match && firstH2Match.index > 0) {
			const preamble = content.slice(0, firstH2Match.index).trim();
			if (preamble) processedParts.push(preamble);
		}

		for (const sec of h2Sections) {
			const heading = sec.title.toLowerCase();
			if (heading.includes('reasoning') || heading.includes('thinking')) {
				const reasoningContent = sec.body.trim();
				if (reasoningContent) reasoning = { content: reasoningContent };
			} else if (heading.includes('tool') || heading.includes('function')) {
				toolCalls = this.parseToolCallsFromContent(sec.body);
			} else {
				processedParts.push(`## ${sec.title}\n${sec.body}`);
			}
		}

		const mainContent = processedParts.length > 0 ? processedParts.join('\n\n').trim() : content;
		return { mainContent, reasoning, toolCalls };
	}

	private static parseToolCallsFromContent(content: string): Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> {
		const toolCalls: Array<{ toolName: string; input?: any; output?: any; isActive?: boolean }> = [];
		let match;

		REGEX_CODEBLOCK.lastIndex = 0;
		while ((match = REGEX_CODEBLOCK.exec(content)) !== null) {
			const codeContent = match[1].trim();
			try {
				const parsed = JSON.parse(codeContent);
				if (Array.isArray(parsed)) {
					for (const call of parsed) {
						if (call.toolName || call.name) {
							toolCalls.push({
								toolName: call.toolName || call.name,
								input: call.input || call.arguments,
								output: call.output || call.result,
								isActive: call.isActive || false,
							});
						}
					}
				} else if (parsed.toolName || parsed.name) {
					toolCalls.push({
						toolName: parsed.toolName || parsed.name,
						input: parsed.input || parsed.arguments,
						output: parsed.output || parsed.result,
						isActive: parsed.isActive || false,
					});
				}
			} catch {
				const lines = codeContent.split('\n').filter((line: string) => line.trim());
				for (const line of lines) {
					try {
						const parsed = JSON.parse(line.trim());
						if (parsed.toolName || parsed.name) {
							toolCalls.push({
								toolName: parsed.toolName || parsed.name,
								input: parsed.input || parsed.arguments,
								output: parsed.output || parsed.result,
								isActive: parsed.isActive || false,
							});
						}
					} catch {
						// Skip invalid lines
					}
				}
			}
		}
		return toolCalls;
	}

	// ── Append (parse → merge → re-render) ──────────────────────────────────

	static appendMessagesToContent(
		currentContent: string,
		params: {
			topics?: ChatConversationTopicDoc[];
			messages?: ChatMessage[];
			attachments?: ChatResourceRef[];
		},
	): string {
		const { messages = [], topics: newTopics = [], attachments: newAttachments = [] } = params;

		if (messages.length === 0 && newTopics.length === 0 && newAttachments.length === 0) {
			return currentContent;
		}

		const docModel = this.parse(currentContent);
		const allAttachments = this.collectAttachments(docModel, messages, newAttachments);
		const newMessagesDoc = this.convertMessagesToDoc(messages);
		const { topics: allTopics, messages: allMessages } = this.mergeTopicsAndMessages(
			docModel,
			newTopics,
			newMessagesDoc,
		);

		return this.buildMarkdown({
			docModel: { ...docModel, topics: allTopics, messages: allMessages },
			attachments: Array.from(allAttachments.values()),
		});
	}

	private static collectAttachments(
		docModel: ChatConversationDocModel,
		messages: ChatMessage[],
		newAttachments: ChatResourceRef[],
	): Map<string, ChatResourceRef> {
		const all = new Map<string, ChatResourceRef>();
		for (const source of docModel.attachments) {
			all.set(source, { source } as ChatResourceRef);
		}
		for (const msg of messages) {
			if (msg.resources) {
				for (const res of msg.resources) {
					all.set(res.source, res as ChatResourceRef);
				}
			}
		}
		for (const att of newAttachments) {
			all.set(att.source, att);
		}
		return all;
	}

	private static convertMessagesToDoc(messages: ChatMessage[]): ChatMessageDoc[] {
		return messages
			.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
			.map((msg) => ({
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
				title: msg.title,
			}));
	}

	private static mergeTopicsAndMessages(
		docModel: ChatConversationDocModel,
		newTopics: ChatConversationTopicDoc[],
		newMessagesDoc: ChatMessageDoc[],
	): { topics: ChatConversationTopicDoc[]; messages: ChatMessageDoc[] } {
		const messagesInTopics = new Set<string>();
		for (const topic of newTopics) {
			for (const msg of topic.messages) {
				messagesInTopics.add(this.createMessageKey(msg));
			}
		}

		const filterOut = (msgs: ChatMessageDoc[]) =>
			msgs.filter((m) => !messagesInTopics.has(this.createMessageKey(m)));

		const allTopics = [...docModel.topics, ...newTopics];
		const allMessages = [...filterOut(docModel.messages), ...filterOut(newMessagesDoc)];

		return { topics: allTopics, messages: allMessages };
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Run the existing comprehensive tests**

Run: `npm run test -- test/chat-docs/ChatConversationDoc.test.ts`
Expected: All tests pass (roundtrip, unclosed code blocks, CJK, reasoning/tools, append, dedup).

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/vault/chat-docs/ChatConversationDoc.ts
git commit -m "refactor(vault-doc): migrate ChatConversationDoc to Engine + Builder

Replaced findLevel1Headings with splitSections(md, 1), regex section extraction
with section lookup, lines[].push with MarkdownDocBuilder, local rebaseHeadings
and fixUnclosedCodeBlocks with Engine imports. Made createMessageKey public static
with overloads for ChatStore to import."
```

---

### Task 7: Migrate analysis-markdown-builder

**Files:**
- Modify: `src/core/storage/vault/search-docs/analysis-markdown-builder.ts`

- [ ] **Step 1: Replace local helpers with Engine imports, add Builder**

At the top of the file, add imports and remove local duplicates:

```typescript
// Add these imports (replace existing direct implementations):
import { rebaseHeadings } from '@/core/storage/vault/framework/MarkdownDocEngine';
import { MarkdownDocBuilder } from '@/core/storage/vault/framework/MarkdownDocBuilder';
```

Remove:
- The local `rebaseHeadings` function (lines 43–67) — now imported from Engine.
- The local `escapeYamlScalar` function (lines 37–40) — use Builder's `frontmatterRaw` instead.

Rewrite `buildMarkdown()` (lines 128–397) to use `MarkdownDocBuilder`:
- Replace `const lines: string[] = [];` with `const b = new MarkdownDocBuilder();`
- Replace all `lines.push(...)` with equivalent Builder calls
- Replace `return lines.join('\n');` with `return b.build();`
- Use `b.frontmatterRaw([...])` for the YAML frontmatter block
- Use `b.section()`, `b.heading()`, `b.text()`, `b.blankLine()` for body sections
- Use `b.mermaid()` for mermaid blocks
- Use `b.callout()` for V2 callout blocks
- Use `b.json()` for inline JSON dumps
- Use `b.list()` for bullet lists

Key pattern replacements:

```typescript
// Before:
lines.push('---');
lines.push('type: ai-search-result');
lines.push(`version: 1`);
lines.push(`created: ${now}`);
// ... 15 more lines ...
lines.push('---');

// After:
b.frontmatterRaw([
    ['type', 'ai-search-result'],
    ['version', 1],
    ['created', now],
    ['title', docModel.title?.trim() ? escapeYaml(docModel.title.trim()) : undefined],
    ['query', escapeYaml(docModel.query)],
    ['webEnabled', docModel.webEnabled],
    ['runAnalysisMode', docModel.runAnalysisMode],
    ['duration', docModel.duration],
    ['estimatedTokens', docModel.usage?.totalTokens],
    ['tokens_input', docModel.usage?.inputTokens ?? undefined],
    ['tokens_output', docModel.usage?.outputTokens ?? undefined],
    ['tokens_total', docModel.usage ? (docModel.usage.inputTokens ?? 0) + (docModel.usage.outputTokens ?? 0) : undefined],
    ['analysisStartedAt', docModel.analysisStartedAtMs],
]);
```

```typescript
// Before:
lines.push(SECTION_SUMMARY);
lines.push('');
lines.push(docModel.summary || '');
lines.push('');

// After:
b.section(1, 'Summary', docModel.summary || '');
```

```typescript
// Before:
lines.push('```mermaid');
lines.push(m);
lines.push('```');

// After:
b.mermaid(m);
```

```typescript
// Before:
lines.push('> [!abstract]- Process Log');
for (const item of docModel.v2ProcessLog) {
    lines.push(`> - ${item}`);
}

// After:
b.callout('abstract', 'Process Log', docModel.v2ProcessLog.map(i => `- ${i}`).join('\n'), true);
```

Keep the section-constant strings (SECTION_SUMMARY, etc.) as local helpers for the section titles — the Builder just needs the title string without the `# ` prefix.

The local `buildMermaidBlock`, `aiSearchGraphToGraphPreview`, `escapeMermaidLabel` functions are domain-specific and should stay. The `pushFollowupHistory` closure should become a local function that takes a Builder:

```typescript
function pushFollowupHistory(b: MarkdownDocBuilder, sectionTitle: string, items: SectionAnalyzeResult[] | undefined) {
    if (!items?.length) return;
    b.heading(1, sectionTitle);
    b.blankLine();
    for (const { question, answer } of items) {
        b.heading(3, question.replace(/\n/g, ' ').trim());
        b.blankLine();
        b.text(answer);
        b.blankLine();
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Run existing analysis doc tests**

Run: `npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/vault/search-docs/analysis-markdown-builder.ts
git commit -m "refactor(vault-doc): migrate analysis-markdown-builder to Engine + Builder

Remove local rebaseHeadings and escapeYamlScalar (use Engine imports).
Replace lines[] pattern with MarkdownDocBuilder."
```

---

### Task 8: Migrate analysis-markdown-parser

**Files:**
- Modify: `src/core/storage/vault/search-docs/analysis-markdown-parser.ts`

- [ ] **Step 1: Replace local helpers with Engine imports**

At the top of the file, update imports:

```typescript
import {
    extractSection,
    normalizeLine,
    parseFrontmatter,
    extractCodeBlocks,
    extractCalloutBlock,
    parseCalloutListItems,
} from '@/core/storage/vault/framework/MarkdownDocEngine';
```

Remove:
- Local `REGEX_FRONTMATTER`, `REGEX_YAML_KEY`, `REGEX_CRLF` constants (lines 18–20)
- Local `parseFrontmatter` function (lines 41–101) — replace with Engine's gray-matter-based version
- Local `extractCalloutBlock` function (lines 167–193) — now imported from Engine
- Local `parseCalloutListItems` function (lines 196–203) — now imported from Engine
- Local `extractMermaidBlock` and `extractAllMermaidBlocks` functions (lines 138–161) — replace with `extractCodeBlocks(text, 'mermaid')`

Rewrite the frontmatter parsing section in `parse()`:

```typescript
// Before (hand-rolled regex):
const fmMatch = normalized.match(REGEX_FRONTMATTER);
const body = fmMatch ? fmMatch[2] : normalized;
const fm = parseFrontmatter(normalized); // local hand-rolled version

// After (gray-matter via Engine):
const fmResult = parseFrontmatter<Record<string, unknown>>(normalized);
const body = fmResult ? fmResult.body : normalized;
const fmData = fmResult?.data ?? {};

// Replace getStr/getNum/getBool with direct access:
const created = String(fmData.created ?? '');
const title = String(fmData.title ?? '');
const query = String(fmData.query ?? '');
const webEnabled = fmData.webEnabled === true || fmData.webEnabled === 'true';
const duration = typeof fmData.duration === 'number' ? fmData.duration : null;
const estimatedTokens = typeof fmData.estimatedTokens === 'number' ? fmData.estimatedTokens : null;
const analysisStartedAt = typeof fmData.analysisStartedAt === 'number' ? fmData.analysisStartedAt : null;
const runModeRaw = String(fmData.runAnalysisMode ?? fmData.analysisPreset ?? '').toLowerCase();
const runAnalysisMode: AnalysisMode | undefined =
    runModeRaw === 'vaultfull' ? 'vaultFull' : runModeRaw === 'aigraph' ? 'aiGraph' : undefined;
```

Replace mermaid extraction:

```typescript
// Before:
const blocks = extractAllMermaidBlocks(overviewHistorySection);

// After:
const blocks = extractCodeBlocks(overviewHistorySection, 'mermaid').map(b => b.content.trim());
```

```typescript
// Before:
const single = extractMermaidBlock(overviewSection);

// After:
const mermaidBlocks = extractCodeBlocks(overviewSection, 'mermaid');
const single = mermaidBlocks.length > 0 ? mermaidBlocks[0].content.trim() : '';
```

Replace CRLF normalization:

```typescript
// Before:
const normalized = raw.replace(REGEX_CRLF, '\n');

// After:
const normalized = normalizeLine(raw);
```

Replace V2 callout parsing:

```typescript
// Before (local extractCalloutBlock):
const v2ProcessLogContent = extractCalloutBlock(body, 'abstract', 'Process Log');

// After (same function name, now imported from Engine — no call-site changes needed):
const v2ProcessLogContent = extractCalloutBlock(body, 'abstract', 'Process Log');
```

The `parseMermaidToPreview` function and source/topic/dashboard/step parsing logic are domain-specific and stay unchanged.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 3: Run existing analysis doc tests**

Run: `npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/vault/search-docs/analysis-markdown-parser.ts
git commit -m "refactor(vault-doc): migrate analysis-markdown-parser to Engine

Replace hand-rolled frontmatter parser with gray-matter, replace local
extractCalloutBlock/mermaid helpers with Engine imports."
```

---

### Task 9: Migrate HubDocLlmMarkdown + Delete MarkdownDocSchema

**Files:**
- Modify: `src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts:10` — remove `MarkdownDocSchema` import
- Delete: `src/core/storage/vault/framework/MarkdownDocSchema.ts`

- [ ] **Step 1: Inline the schema type and remove import**

In `HubDocLlmMarkdown.ts`, the `HUB_DOC_SCHEMA` constant uses `MarkdownDocSchemaDef` type but nothing reads it at runtime. Inline the type:

```typescript
// Before:
import type { MarkdownDocSchemaDef } from '@/core/storage/vault/framework/MarkdownDocSchema';

// After (inline the type):
type SectionDef = { title: string; optional?: boolean };
```

And change the `HUB_DOC_SCHEMA` type:

```typescript
// Before:
export const HUB_DOC_SCHEMA: MarkdownDocSchemaDef = { sections: [...] };

// After:
export const HUB_DOC_SCHEMA: { sections: SectionDef[] } = { sections: [...] };
```

- [ ] **Step 2: Delete MarkdownDocSchema.ts**

```bash
rm src/core/storage/vault/framework/MarkdownDocSchema.ts
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts
git rm src/core/storage/vault/framework/MarkdownDocSchema.ts
git commit -m "refactor(vault-doc): inline MarkdownDocSchema type, delete unused file"
```

---

### Task 10: Consolidate createMessageKey in ChatStore

**Files:**
- Modify: `src/core/storage/vault/ChatStore.ts:814-820`

- [ ] **Step 1: Replace local createMessageKey with import**

```typescript
// Before (ChatStore.ts:814-820):
/**
 * Create message key for matching (same as ChatConversationDoc.createMessageKey).
 */
private static createMessageKey(role: string, content: string, title?: string): string {
    const contentHash = hashMD5(content);
    return `${role}|${contentHash}|${title || ''}`;
}

// After:
// Remove the method entirely. At the import section, add:
import { ChatConversationDoc } from '@/core/storage/vault/chat-docs/ChatConversationDoc';

// At each call site (search for `this.createMessageKey` or `ChatStorageService.createMessageKey`),
// replace with:
ChatConversationDoc.createMessageKey(role, content, title)
```

Find all call sites in ChatStore.ts that use `this.createMessageKey` or `ChatStorageService.createMessageKey` and replace them with `ChatConversationDoc.createMessageKey(...)`.

- [ ] **Step 2: Remove the hashMD5 import if no longer used in ChatStore**

Check if `hashMD5` is used elsewhere in `ChatStore.ts`. If the only usage was inside `createMessageKey`, remove the import.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Run ChatConversationDoc tests**

Run: `npm run test -- test/chat-docs/ChatConversationDoc.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/vault/ChatStore.ts
git commit -m "refactor(vault-doc): consolidate createMessageKey into ChatConversationDoc

Remove duplicated createMessageKey from ChatStore. Import from ChatConversationDoc
which now exposes it as a public static method with overloads."
```

---

### Task 11: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run framework tests**

Run: `npm run test -- test/vault-framework/MarkdownDocEngine.test.ts && npm run test -- test/vault-framework/MarkdownDocBuilder.test.ts`
Expected: All pass.

- [ ] **Step 4: Run chat doc tests**

Run: `npm run test -- test/chat-docs/ChatConversationDoc.test.ts`
Expected: All pass (roundtrip, unclosed code blocks, CJK, reasoning/tools, append, dedup).

- [ ] **Step 5: Run analysis doc tests**

Run: `npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts`
Expected: All pass.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: Clean build, no bundle errors.
