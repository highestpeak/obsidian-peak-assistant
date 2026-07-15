/**
 * File Atlas — Phase 0 parser tests.
 *
 * Spec: docs/superpowers/specs/2026-07-08-file-atlas-design.md
 *   (Layer Model → Raw Block Layer; Block Anchoring).
 *
 * Covers: ordered extraction, nested headings, every block kind, Chinese
 * content, contentHash stability, and boundaries (empty file / frontmatter
 * only / consecutive same-kind blocks). Three-way link split (vault /
 * external / embed) is asserted explicitly because it is a spec hard rule.
 *
 * Run: npm run test -- test/file-atlas-parser.test.ts
 */

import assert from 'assert';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import { RawBlockKind, type DocumentBlock } from '@/core/document/atlas/types';

/** Flatten the tree into document order for order assertions. */
function flatten(blocks: DocumentBlock[]): DocumentBlock[] {
	const out: DocumentBlock[] = [];
	const walk = (list: DocumentBlock[]): void => {
		for (const b of list) {
			out.push(b);
			if (b.children) walk(b.children);
		}
	};
	walk(blocks);
	return out;
}

function kindsOf(blocks: DocumentBlock[]): RawBlockKind[] {
	return flatten(blocks).map((b) => b.kind);
}

function findKind(blocks: DocumentBlock[], kind: RawBlockKind): DocumentBlock[] {
	return flatten(blocks).filter((b) => b.kind === kind);
}

let passed = 0;
function ok(label: string, fn: () => void): void {
	fn();
	passed += 1;
	console.log(`PASS: ${label}`);
}

console.log('=== File Atlas parser ===');

// --------------------------------------------------------------------------
// 1. Ordered extraction
// --------------------------------------------------------------------------
ok('preserves document order', () => {
	const md = [
		'# Title',
		'',
		'First paragraph.',
		'',
		'- a',
		'- b',
		'',
		'Second paragraph.',
	].join('\n');
	const doc = parseDocumentBlocks(md, 'test.md');
	const kinds = kindsOf(doc.blocks);
	const paraIdx = kinds.indexOf(RawBlockKind.Paragraph);
	const listIdx = kinds.indexOf(RawBlockKind.List);
	assert.ok(kinds[0] === RawBlockKind.Heading, 'heading first');
	assert.ok(paraIdx < listIdx, 'first paragraph before list');
});

// --------------------------------------------------------------------------
// 2. Nested headings
// --------------------------------------------------------------------------
ok('nests headings by depth', () => {
	const md = ['# H1', 'top', '## H2a', 'body', '### H3', 'deep', '## H2b', 'more'].join('\n');
	const doc = parseDocumentBlocks(md, 'test.md');
	assert.strictEqual(doc.blocks.length, 1, 'single top-level H1');
	const h1 = doc.blocks[0];
	assert.strictEqual(h1.level, 1);
	const h2s = (h1.children ?? []).filter((c) => c.kind === RawBlockKind.Heading);
	assert.strictEqual(h2s.length, 2, 'two H2 children of H1');
	const h2a = h2s[0];
	const h3 = (h2a.children ?? []).find((c) => c.kind === RawBlockKind.Heading);
	assert.ok(h3 && h3.level === 3, 'H3 nested under H2a');
});

ok('nearestHeading + ordinalInHeading populated', () => {
	const md = ['## Section', 'para one', '', 'para two'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const paras = findKind(doc.blocks, RawBlockKind.Paragraph);
	assert.strictEqual(paras[0].anchor.nearestHeading, 'Section');
	assert.strictEqual(paras[0].anchor.ordinalInHeading, 0);
	assert.ok(paras[1].anchor.ordinalInHeading > paras[0].anchor.ordinalInHeading, 'ordinal increases');
});

// --------------------------------------------------------------------------
// 3. Each block kind
// --------------------------------------------------------------------------
ok('frontmatter → property + tag blocks', () => {
	const md = ['---', 'status: active', 'tags: [alpha, beta]', '---', 'body'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const props = findKind(doc.blocks, RawBlockKind.Property);
	const tags = findKind(doc.blocks, RawBlockKind.Tag);
	assert.ok(props.length >= 1, 'has a property block');
	assert.ok(props.some((p) => p.title.includes('status')), 'status property present');
	assert.strictEqual(tags.length, 2, 'two frontmatter tags');
});

ok('tasks surface as individual Task blocks', () => {
	const md = ['- [ ] todo one', '- [x] done two', '- plain item'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const tasks = findKind(doc.blocks, RawBlockKind.Task);
	assert.strictEqual(tasks.length, 2, 'two checkbox tasks');
	assert.strictEqual(tasks[0].detail?.checked, false);
	assert.strictEqual(tasks[1].detail?.checked, true);
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.List).length, 1, 'one list container');
});

ok('callout vs quote distinction', () => {
	const md = ['> [!warning] Heads up', '> body line', '', '> plain quote'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const callouts = findKind(doc.blocks, RawBlockKind.Callout);
	const quotes = findKind(doc.blocks, RawBlockKind.Quote);
	assert.strictEqual(callouts.length, 1, 'one callout');
	assert.strictEqual(callouts[0].detail?.calloutType, 'warning');
	assert.strictEqual(quotes.length, 1, 'one plain quote');
});

ok('table with row/column counts', () => {
	const md = ['| A | B |', '| - | - |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const tables = findKind(doc.blocks, RawBlockKind.Table);
	assert.strictEqual(tables.length, 1);
	assert.strictEqual(tables[0].detail?.columns, 2, 'two columns');
	assert.strictEqual(tables[0].detail?.rows, 2, 'two body rows (header excluded)');
});

ok('code vs mermaid fenced blocks', () => {
	const md = ['```ts', 'const x = 1;', '```', '', '```mermaid', 'graph LR', 'A-->B', '```'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Code).length, 1, 'one code block');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Mermaid).length, 1, 'one mermaid block');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Code)[0].detail?.language, 'ts');
});

ok('display math block', () => {
	const md = ['before', '', '$$', 'a = b + c', '$$', '', 'after'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Math).length, 1, 'one math block');
});

ok('footnote definition', () => {
	const md = ['text[^a]', '', '[^a]: the note'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const notes = findKind(doc.blocks, RawBlockKind.Footnote);
	assert.strictEqual(notes.length, 1, 'one footnote def');
	assert.strictEqual(notes[0].detail?.target, 'a');
});

// --------------------------------------------------------------------------
// 3b. Three-way link split (spec hard rule)
// --------------------------------------------------------------------------
ok('vault / external / embed are distinct kinds', () => {
	const md = [
		'See [[Internal Note#Heading]] and [[Other|alias]].',
		'',
		'Visit https://example.com/page and [docs](https://docs.anthropic.com).',
		'',
		'![[diagram.png]] and ![[report.pdf]] and ![[sibling-note]]',
	].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const vault = findKind(doc.blocks, RawBlockKind.VaultLink);
	const external = findKind(doc.blocks, RawBlockKind.ExternalLink);
	const image = findKind(doc.blocks, RawBlockKind.Image);
	const attach = findKind(doc.blocks, RawBlockKind.Attachment);
	const embed = findKind(doc.blocks, RawBlockKind.Embed);

	assert.strictEqual(vault.length, 2, 'two vault links');
	assert.ok(vault.some((v) => v.detail?.linkFragment === '#Heading'), 'heading fragment captured');
	assert.strictEqual(external.length, 2, 'one bare + one markdown external link');
	assert.ok(external.some((e) => e.detail?.nakedUrl === true), 'bare url flagged');
	assert.ok(external.some((e) => e.detail?.domain === 'docs.anthropic.com'), 'domain extracted');
	assert.strictEqual(image.length, 1, 'png embed → image');
	assert.strictEqual(attach.length, 1, 'pdf embed → attachment');
	assert.strictEqual(embed.length, 1, 'note embed → generic embed');
});

// --------------------------------------------------------------------------
// 4. Chinese content
// --------------------------------------------------------------------------
ok('handles Chinese headings and body', () => {
	const md = ['# 方法论', '这是正文段落。', '## 每周循环', '- [ ] 打开仪表盘'].join('\n');
	const doc = parseDocumentBlocks(md, '中文.md');
	assert.strictEqual(doc.blocks[0].title, '方法论');
	const h2 = (doc.blocks[0].children ?? []).find((c) => c.kind === RawBlockKind.Heading);
	assert.strictEqual(h2?.title, '每周循环');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Task).length, 1, 'chinese task detected');
	assert.ok(doc.stats.words > 0, 'chinese words counted');
});

// --------------------------------------------------------------------------
// 5. contentHash stability
// --------------------------------------------------------------------------
ok('contentHash stable across parses; differs on edit', () => {
	const md = ['# H', 'stable paragraph text'].join('\n');
	const a = parseDocumentBlocks(md, 'f.md');
	const b = parseDocumentBlocks(md, 'f.md');
	const pa = findKind(a.blocks, RawBlockKind.Paragraph)[0];
	const pb = findKind(b.blocks, RawBlockKind.Paragraph)[0];
	assert.strictEqual(pa.anchor.contentHash, pb.anchor.contentHash, 'same content → same hash');

	const edited = ['# H', 'stable paragraph text changed'].join('\n');
	const c = parseDocumentBlocks(edited, 'f.md');
	const pc = findKind(c.blocks, RawBlockKind.Paragraph)[0];
	assert.notStrictEqual(pa.anchor.contentHash, pc.anchor.contentHash, 'edit → different hash');
});

ok('blockId is unique per block', () => {
	const md = ['same line', '', 'same line', '', 'same line'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const ids = flatten(doc.blocks).map((b) => b.id);
	assert.strictEqual(new Set(ids).size, ids.length, 'all block ids unique');
});

ok('line ranges are 1-based and accurate', () => {
	const md = ['# H1', 'para on line 2'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	assert.strictEqual(doc.blocks[0].anchor.lineStart, 1, 'heading at line 1');
	const para = findKind(doc.blocks, RawBlockKind.Paragraph)[0];
	assert.strictEqual(para.anchor.lineStart, 2, 'paragraph at line 2');
});

// --------------------------------------------------------------------------
// 6. Boundaries
// --------------------------------------------------------------------------
ok('empty file → no blocks, zero stats', () => {
	const doc = parseDocumentBlocks('', 'empty.md');
	assert.strictEqual(doc.blocks.length, 0);
	assert.strictEqual(doc.stats.blocks, 0);
	assert.strictEqual(doc.stats.words, 0);
});

ok('frontmatter-only file', () => {
	const md = ['---', 'title: Only Meta', 'status: draft', '---'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const props = findKind(doc.blocks, RawBlockKind.Property);
	assert.ok(props.length >= 2, 'both frontmatter keys become properties');
	assert.strictEqual(findKind(doc.blocks, RawBlockKind.Heading).length, 0, 'no headings');
});

ok('consecutive same-kind blocks all captured', () => {
	const md = ['para one', '', 'para two', '', 'para three'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	const paras = findKind(doc.blocks, RawBlockKind.Paragraph);
	assert.strictEqual(paras.length, 3, 'three consecutive paragraphs');
	const lines = paras.map((p) => p.anchor.lineStart);
	assert.deepStrictEqual([...lines].sort((a, z) => a - z), lines, 'line order ascending');
});

ok('stats count resources vs blocks correctly', () => {
	const md = ['# H', 'text with [[Note]] link', 'https://x.com'].join('\n');
	const doc = parseDocumentBlocks(md, 'f.md');
	assert.ok(doc.stats.resources >= 2, 'vault link + external link counted as resources');
	assert.ok(doc.stats.blocks >= doc.stats.resources, 'total blocks >= resources');
});

console.log(`\n=== All ${passed} File Atlas parser tests passed ===`);
