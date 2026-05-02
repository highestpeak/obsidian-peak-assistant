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
	const md = `# \u{1F4AC} Hello\nuser msg\n# \u{1F916} Response\nassistant msg`;
	const sections = splitSections(md, 1);
	assertEqual(sections.length, 2, 'splitSections emoji: 2 sections');
	assertEqual(sections[0].title, '\u{1F4AC} Hello', 'splitSections emoji: first title');
	assertEqual(sections[1].title, '\u{1F916} Response', 'splitSections emoji: second title');
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
