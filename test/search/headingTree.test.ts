/**
 * T2b tests: heading tree + section snippets + link positions.
 *
 * Uses the run-test.js runner: plain assertions, no framework. The file
 * reader is a trivial in-memory fake so we do not need Obsidian.
 */

import {
	extractHeadingTree,
	getLinkPositions,
	type HeadingFileReaderPort,
	type HeadingTreeNode,
} from '../../src/service/search/heading/headingTree';
import { getSectionSnippets } from '../../src/service/search/heading/sectionSnippets';

function assert(cond: boolean, msg: string): void {
	if (!cond) {
		console.error('FAIL:', msg);
		process.exit(1);
	}
}

function fakeReader(map: Record<string, string>): HeadingFileReaderPort {
	return {
		async readText(path: string) {
			return path in map ? map[path] : null;
		},
	};
}

function findNode(nodes: HeadingTreeNode[], title: string): HeadingTreeNode | null {
	for (const n of nodes) {
		if (n.title === title) return n;
		const inner = findNode(n.children, title);
		if (inner) return inner;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Doc A: nested headings + frontmatter + fenced code block containing a
// pseudo-heading, plus wiki + markdown links.
// ---------------------------------------------------------------------------

const DOC_A = [
	'---',                                                // 1  frontmatter open
	'title: Test',                                        // 2
	'tags: [a, b]',                                       // 3
	'---',                                                // 4  frontmatter close
	'',                                                   // 5
	'# 表格编辑协议改造',                                  // 6  H1
	'Intro line mentioning 方案 once here.',              // 7
	'',                                                   // 8
	'## hash值计算',                                       // 9  H2
	'方案 discussion 方案 again.',                        // 10
	'See [[TargetNote]] and [label](path/to/other.md).',  // 11
	'',                                                   // 12
	'## 后续展望',                                         // 13 H2
	'One occurrence of 方案.',                            // 14
	'',                                                   // 15
	'```',                                                // 16 fence open
	'## fake heading inside code',                        // 17 inside fence
	'方案 in code should still count as body text.',       // 18 inside fence
	'```',                                                // 19 fence close
	'',                                                   // 20
	'### 性能风险',                                        // 21 H3 nested under 后续展望
	'no relevant keyword here.',                          // 22
	'',                                                   // 23
	'# Second Top',                                        // 24 H1 sibling
	'nothing matches here.',                              // 25
].join('\n');

async function testEmptyQuery(): Promise<void> {
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		{ filePath: 'a.md', queryText: '' },
	);
	assert(tree.length === 2, `expected 2 root headings, got ${tree.length}`);
	const root1 = tree[0];
	assert(root1.title === '表格编辑协议改造', 'first root title');
	assert(root1.level === 1, 'root level 1');
	assert(root1.matchCount === 0, 'empty query: matchCount = 0');
	assert(root1.children.length === 2, `H1 has 2 H2 children, got ${root1.children.length}`);

	const h2b = root1.children[1];
	assert(h2b.title === '后续展望', '2nd H2 title');
	assert(h2b.children.length === 1, 'H2b has 1 H3 child');
	assert(h2b.children[0].title === '性能风险', 'H3 nested correctly');

	// Fake heading in fence must not appear anywhere.
	assert(findNode(tree, 'fake heading inside code') === null, 'fenced heading not surfaced');
}

async function testSectionRanges(): Promise<void> {
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		{ filePath: 'a.md', queryText: '' },
	);
	const h1 = tree[0]!;
	// H1 at line 6, next H1 at line 24 -> lineEnd = 23.
	assert(h1.lineStart === 6, `H1 lineStart 6, got ${h1.lineStart}`);
	assert(h1.lineEnd === 23, `H1 lineEnd 23, got ${h1.lineEnd}`);

	const h2a = h1.children[0]!; // hash值计算 at line 9, next same-or-shallower is H2 at 13 -> 12
	assert(h2a.lineStart === 9 && h2a.lineEnd === 12, `H2a range 9-12, got ${h2a.lineStart}-${h2a.lineEnd}`);

	const h2b = h1.children[1]!; // 后续展望 at 13, next H1 at 24 -> lineEnd = 23
	assert(h2b.lineStart === 13 && h2b.lineEnd === 23, `H2b range 13-23, got ${h2b.lineStart}-${h2b.lineEnd}`);

	const h3 = h2b.children[0]!; // 性能风险 at 21, no next same-or-shallower before doc end
	// Ends before the next H1 at 24 -> 23 (because H1 is shallower).
	assert(h3.lineStart === 21 && h3.lineEnd === 23, `H3 range 21-23, got ${h3.lineStart}-${h3.lineEnd}`);

	const secondTop = tree[1]!;
	// last heading -> ends at doc end (25 lines).
	assert(secondTop.lineStart === 24, 'second top lineStart 24');
	assert(secondTop.lineEnd === 25, `second top lineEnd 25, got ${secondTop.lineEnd}`);
}

async function testFilteredQuery(): Promise<void> {
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		{ filePath: 'a.md', queryText: '方案' },
	);
	// Direct body counts:
	//   H1 intro (line 7) has 1 direct hit
	//   hash值计算 body: line 10 has 2 hits
	//   后续展望 body: line 14 has 1, line 18 (inside fence, still counted per design) has 1
	//   性能风险 body: 0
	// Propagated:
	//   性能风险 = 0
	//   后续展望 = 1 (line 14) + 1 (line 18) + 0 (child) = 2
	//   hash值计算 = 2
	//   H1 = 1 (intro) + 2 + 2 = 5
	//   Second Top = 0

	const h1 = tree[0];
	const h2a = findNode([h1], 'hash值计算')!;
	const h2b = findNode([h1], '后续展望')!;
	const h3 = findNode([h1], '性能风险')!;
	const secondTop = tree[1];

	assert(h2a.matchCount === 2, `hash值计算 = 2, got ${h2a.matchCount}`);
	assert(h3.matchCount === 0, `性能风险 = 0, got ${h3.matchCount}`);
	assert(h2b.matchCount === 2, `后续展望 = 2 (self + descendant), got ${h2b.matchCount}`);
	assert(h1.matchCount === 5, `H1 = 5 (1 intro + 2 + 2), got ${h1.matchCount}`);
	assert(secondTop.matchCount === 0, 'second top = 0');
}

async function testFrontmatterSkipped(): Promise<void> {
	// Doc with frontmatter that contains a `#tags` line — must not be a heading.
	const doc = ['---', 'tags:', '  - "#value"', '---', '# Real Heading', 'body'].join('\n');
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({ 'f.md': doc }) },
		{ filePath: 'f.md', queryText: '' },
	);
	assert(tree.length === 1, `only 1 heading, got ${tree.length}`);
	assert(tree[0].title === 'Real Heading', 'real heading found');
	assert(tree[0].lineStart === 5, `real heading at line 5, got ${tree[0].lineStart}`);
}

async function testOutboundLinkCount(): Promise<void> {
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		{ filePath: 'a.md', queryText: '' },
	);
	const h2a = findNode(tree, 'hash值计算')!;
	// hash值计算 body includes 1 wiki link + 1 markdown link => 2.
	assert(h2a.outboundLinkCount === 2, `outboundLinkCount = 2, got ${h2a.outboundLinkCount}`);
	const h2b = findNode(tree, '后续展望')!;
	assert(h2b.outboundLinkCount === 0, `outboundLinkCount = 0 for 后续展望, got ${h2b.outboundLinkCount}`);
}

async function testSnippets(): Promise<void> {
	// hash值计算 body [10,12], query = 方案, line 10 has two occurrences.
	const snippets = await getSectionSnippets(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		'a.md',
		{ lineStart: 10, lineEnd: 12 },
		'方案',
	);
	assert(snippets.length === 1, `expected 1 snippet line, got ${snippets.length}`);
	assert(snippets[0].line === 10, `snippet line = 10, got ${snippets[0].line}`);
	assert(snippets[0].highlights.length === 2, `two highlights, got ${snippets[0].highlights.length}`);
	for (const hi of snippets[0].highlights) {
		const chunk = snippets[0].text.slice(hi.start, hi.end);
		assert(chunk === '方案', `highlight covers 方案, got ${chunk}`);
	}
}

async function testEmptyQuerySnippetPreview(): Promise<void> {
	// Section 6-12 (H1 intro region): line 6 is heading (skip), line 7 body text, line 8 empty (skip), etc.
	const snippets = await getSectionSnippets(
		{ fileReader: fakeReader({ 'a.md': DOC_A }) },
		'a.md',
		{ lineStart: 6, lineEnd: 12 },
		'',
	);
	assert(snippets.length > 0 && snippets.length <= 3, `preview 1-3 lines, got ${snippets.length}`);
	assert(snippets[0].line === 7, `first preview line = 7 (skip heading + empty), got ${snippets[0].line}`);
	assert(snippets[0].highlights.length === 0, 'empty query = no highlights');
}

async function testMissingFile(): Promise<void> {
	const tree = await extractHeadingTree(
		{ fileReader: fakeReader({}) },
		{ filePath: 'missing.md', queryText: '' },
	);
	assert(tree.length === 0, 'missing file yields empty tree');
	const snips = await getSectionSnippets(
		{ fileReader: fakeReader({}) },
		'missing.md',
		{ lineStart: 1, lineEnd: 10 },
		'x',
	);
	assert(snips.length === 0, 'missing file yields empty snippets');
	const links = await getLinkPositions({ fileReader: fakeReader({}) }, 'missing.md');
	assert(links.length === 0, 'missing file yields empty link positions');
}

async function testLinkPositions(): Promise<void> {
	const links = await getLinkPositions({ fileReader: fakeReader({ 'a.md': DOC_A }) }, 'a.md');
	// Two outgoing links, both on line 11 (wiki + markdown).
	assert(links.length === 2, `expected 2 outgoing links, got ${links.length}`);
	for (const l of links) {
		assert(l.kind === 'outgoing', 'kind=outgoing without backlink reader');
		assert(l.line === 11, `line 11, got ${l.line}`);
	}
	const targets = links.map((l) => l.target).sort();
	assert(targets[0] === 'TargetNote', `wiki target = TargetNote, got ${targets[0]}`);
	assert(targets[1] === 'path/to/other.md', `md target = path/to/other.md, got ${targets[1]}`);
}

async function testLinkPositionsWithBacklinks(): Promise<void> {
	const links = await getLinkPositions(
		{
			fileReader: fakeReader({ 'a.md': DOC_A }),
			backlinkReader: {
				async getBacklinkPositions(_target: string) {
					return [
						{ sourcePath: 'other.md', line: 42 },
					];
				},
			},
		},
		'a.md',
	);
	assert(links.length === 3, `2 outgoing + 1 backlink = 3, got ${links.length}`);
	const back = links.find((l) => l.kind === 'backlink');
	assert(back !== undefined && back.line === 42 && back.target === 'other.md', 'backlink surfaced');
}

async function testLinkPositionsInsideCodeFenceIgnored(): Promise<void> {
	const doc = ['# H', '```', '[[FenceLink]]', '```', '[[RealLink]]'].join('\n');
	const links = await getLinkPositions({ fileReader: fakeReader({ 'f.md': doc }) }, 'f.md');
	assert(links.length === 1, `only real link, got ${links.length}`);
	assert(links[0].target === 'RealLink', 'fenced link filtered out');
}

async function run(): Promise<void> {
	await testEmptyQuery();
	await testSectionRanges();
	await testFilteredQuery();
	await testFrontmatterSkipped();
	await testOutboundLinkCount();
	await testSnippets();
	await testEmptyQuerySnippetPreview();
	await testMissingFile();
	await testLinkPositions();
	await testLinkPositionsWithBacklinks();
	await testLinkPositionsInsideCodeFenceIgnored();
	console.log('All headingTree tests passed');
}

run().catch((err) => {
	console.error('Test crashed:', err);
	process.exit(1);
});
