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
	b.heading(1, '\u{1F4AC} Question');
	b.text('What is this?');
	b.blankLine();
	b.heading(1, '\u{1F916} Answer');
	b.text('This is the answer.');
	b.blankLine();
	const md = b.build();
	assert(md.includes('# Attachments\n- [[note1.md]]'), 'chat: attachments');
	assert(md.includes('# \u{1F4AC} Question\nWhat is this?'), 'chat: user message');
	assert(md.includes('# \u{1F916} Answer\nThis is the answer.'), 'chat: assistant message');
}

// ── Results ──
console.log(`\nBuilder tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
