import { strict as assert } from 'node:assert';
import {
	extractParagraphAtLine,
	extractOutlinks,
	extractHeadings,
	getCursorSection,
} from '@/service/ambient/ContextExtractor';
import { generateExplanation } from '@/service/ambient/RelevanceExplainer';
import { cosineDistance } from '@/service/ambient/SerendipitySearcher';
import { getPatternBoost } from '@/service/ambient/PatternLearner';
import type { AmbientSignal } from '@/service/ambient/types';

// --- extractParagraphAtLine ---
{
	const lines = [
		'# Heading',
		'',
		'First line of paragraph.',
		'Second line of paragraph.',
		'Third line of paragraph.',
		'',
		'## Another heading',
		'',
		'Single line paragraph.',
		'',
		'Last paragraph start.',
		'Last paragraph end.',
	];

	// Cursor in the middle of a paragraph
	assert.equal(
		extractParagraphAtLine(lines, 3),
		'First line of paragraph.\nSecond line of paragraph.\nThird line of paragraph.'
	);

	// Cursor on heading returns just the heading
	assert.equal(extractParagraphAtLine(lines, 0), '# Heading');
	assert.equal(extractParagraphAtLine(lines, 6), '## Another heading');

	// Cursor on empty line returns ''
	assert.equal(extractParagraphAtLine(lines, 1), '');
	assert.equal(extractParagraphAtLine(lines, 5), '');

	// Single line paragraph
	assert.equal(extractParagraphAtLine(lines, 8), 'Single line paragraph.');

	// Out of bounds
	assert.equal(extractParagraphAtLine(lines, -1), '');
	assert.equal(extractParagraphAtLine(lines, 100), '');

	// Multi-line paragraph at end of file (no trailing empty line)
	assert.equal(
		extractParagraphAtLine(lines, 10),
		'Last paragraph start.\nLast paragraph end.'
	);

	console.log('extractParagraphAtLine: all passed');
}

// --- extractOutlinks ---
{
	// Basic links
	assert.deepEqual(extractOutlinks('See [[Note A]] and [[Note B]]'), ['Note A', 'Note B']);

	// Aliases stripped
	assert.deepEqual(extractOutlinks('[[Target|display text]]'), ['Target']);

	// Heading fragments stripped
	assert.deepEqual(extractOutlinks('[[Page#Section]]'), ['Page']);

	// Both alias and heading fragment
	assert.deepEqual(extractOutlinks('[[Page#Section|alias]]'), ['Page']);

	// No links
	assert.deepEqual(extractOutlinks('No links here'), []);

	// Duplicates removed
	assert.deepEqual(extractOutlinks('[[A]] and [[A]] again'), ['A']);

	// Empty target after stripping (e.g. [[#heading]])
	assert.deepEqual(extractOutlinks('[[#heading]]'), []);

	console.log('extractOutlinks: all passed');
}

// --- extractHeadings ---
{
	const lines = [
		'# Title',
		'Some text',
		'## Section',
		'More text',
		'### Subsection',
		'#### Too deep',
		'##### Way too deep',
		'Normal line',
		'## Another Section',
	];

	// Only H1-H3 extracted
	assert.deepEqual(extractHeadings(lines), ['Title', 'Section', 'Subsection', 'Another Section']);

	// Empty
	assert.deepEqual(extractHeadings([]), []);
	assert.deepEqual(extractHeadings(['no headings here']), []);

	console.log('extractHeadings: all passed');
}

// --- getCursorSection ---
{
	const lines = [
		'# Top',
		'intro text',
		'## Section A',
		'content a',
		'### Subsection A1',
		'content a1',
		'## Section B',
		'content b',
	];

	// Cursor at top level (after # Top, before ## Section A)
	assert.equal(getCursorSection(lines, 1), 'Top');

	// Cursor in Section A
	assert.equal(getCursorSection(lines, 3), 'Top > Section A');

	// Cursor in Subsection A1
	assert.equal(getCursorSection(lines, 5), 'Top > Section A > Subsection A1');

	// Cursor in Section B (subsection A1 popped)
	assert.equal(getCursorSection(lines, 7), 'Top > Section B');

	// Cursor at very first line (heading itself)
	assert.equal(getCursorSection(lines, 0), 'Top');

	// Empty document
	assert.equal(getCursorSection([], 0), '');

	console.log('getCursorSection: all passed');
}

// --- generateExplanation ---
{
	// shared_tag
	assert.equal(
		generateExplanation([{ type: 'shared_tag', tag: 'programming' }]),
		'Both tagged with #programming'
	);

	// graph_neighbor hop=1
	assert.equal(
		generateExplanation([{ type: 'graph_neighbor', hop: 1 }]),
		'Directly linked'
	);

	// graph_neighbor hop=2 with via
	assert.equal(
		generateExplanation([{ type: 'graph_neighbor', hop: 2, via: 'Bridge Note' }]),
		'Connected via [[Bridge Note]]'
	);

	// co_citation
	assert.equal(
		generateExplanation([{ type: 'co_citation', citingNote: 'Summary' }]),
		'Co-cited in [[Summary]]'
	);

	// hub_member
	assert.equal(
		generateExplanation([{ type: 'hub_member', hubName: 'Machine Learning' }]),
		'Both in "Machine Learning" cluster'
	);

	// text_overlap
	assert.equal(
		generateExplanation([{ type: 'text_overlap', terms: ['neural', 'network'] }]),
		'Similar discussion of "neural", "network"'
	);

	// recency
	assert.equal(
		generateExplanation([{ type: 'recency', editedDaysAgo: 3 }]),
		'Edited 3 days ago in a related session'
	);

	// Empty signals
	assert.equal(generateExplanation([]), 'Related content');

	// Priority ordering: graph_neighbor wins over shared_tag
	assert.equal(
		generateExplanation([
			{ type: 'shared_tag', tag: 'test' },
			{ type: 'graph_neighbor', hop: 1 },
		]),
		'Directly linked'
	);

	// Priority ordering: co_citation wins over hub_member
	assert.equal(
		generateExplanation([
			{ type: 'hub_member', hubName: 'Cluster' },
			{ type: 'co_citation', citingNote: 'Index' },
		]),
		'Co-cited in [[Index]]'
	);

	// Priority ordering: text_overlap is lowest
	assert.equal(
		generateExplanation([
			{ type: 'text_overlap', terms: ['foo'] },
			{ type: 'recency', editedDaysAgo: 1 },
		]),
		'Edited 1 days ago in a related session'
	);

	console.log('generateExplanation: all passed');
}

// --- cosineDistance ---
{
	// Identical vectors: distance = 0
	const d1 = cosineDistance([1, 0, 0], [1, 0, 0]);
	assert.ok(Math.abs(d1) < 1e-6, `Expected ~0, got ${d1}`);

	// Orthogonal vectors: distance = 1
	const d2 = cosineDistance([1, 0, 0], [0, 1, 0]);
	assert.ok(Math.abs(d2 - 1) < 1e-6, `Expected ~1, got ${d2}`);

	// Opposite vectors: distance = 2
	const d3 = cosineDistance([1, 0, 0], [-1, 0, 0]);
	assert.ok(Math.abs(d3 - 2) < 1e-6, `Expected ~2, got ${d3}`);

	// Empty vectors: distance = 1 (fallback)
	const d4 = cosineDistance([], []);
	assert.equal(d4, 1);

	// Mismatched lengths: distance = 1 (fallback)
	const d5 = cosineDistance([1, 2], [1, 2, 3]);
	assert.equal(d5, 1);

	console.log('cosineDistance: all passed');
}

// --- getPatternBoost ---
{
	const patterns = [
		{ sourceFilePath: 'notes/a.md', pushedFilePath: 'notes/b.md', strength: 4 },
		{ sourceFilePath: 'notes/a.md', pushedFilePath: 'notes/c.md', strength: 10 },
	];

	// Matching pattern: strength 4 -> boost = min(0.4, 4 * 0.05) = 0.2
	const boost1 = getPatternBoost('notes/a.md', 'notes/b.md', patterns);
	assert.equal(boost1, 0.2);

	// Matching pattern: strength 10 -> boost = min(0.4, 10 * 0.05) = 0.4 (capped)
	const boost2 = getPatternBoost('notes/a.md', 'notes/c.md', patterns);
	assert.equal(boost2, 0.4);

	// No matching pattern: boost = 0
	const boost3 = getPatternBoost('notes/x.md', 'notes/b.md', patterns);
	assert.equal(boost3, 0);

	// Empty patterns: boost = 0
	const boost4 = getPatternBoost('notes/a.md', 'notes/b.md', []);
	assert.equal(boost4, 0);

	console.log('getPatternBoost: all passed');
}

// --- Serendipity + Pattern Learning integration ---
{
	// Verify that cosineDistance sorts candidates correctly
	const candidates = [
		{ path: 'close.md', distance: cosineDistance([1, 0, 0], [0.9, 0.1, 0]) },
		{ path: 'far.md', distance: cosineDistance([1, 0, 0], [0, 0, 1]) },
		{ path: 'medium.md', distance: cosineDistance([1, 0, 0], [0.5, 0.5, 0]) },
	];

	// Sort by distance DESC (most serendipitous first)
	candidates.sort((a, b) => b.distance - a.distance);
	assert.equal(candidates[0].path, 'far.md', 'Most distant should be first');
	assert.equal(candidates[2].path, 'close.md', 'Closest should be last');

	// Verify pattern boost doesn't exceed cap
	const patternsHigh = [
		{ sourceFilePath: 'a.md', pushedFilePath: 'b.md', strength: 100 },
	];
	const boost = getPatternBoost('a.md', 'b.md', patternsHigh);
	assert.equal(boost, 0.4, 'Pattern boost should be capped at 0.4');

	console.log('serendipity + pattern integration: all passed');
}

// --- RelevanceExplainer: serendipity signal coverage ---
{
	const serendipityExplanation = generateExplanation([
		{ type: 'graph_neighbor', hop: 2, via: 'Distributed Systems' },
	]);
	assert.equal(serendipityExplanation, 'Connected via [[Distributed Systems]]');

	console.log('RelevanceExplainer serendipity coverage: all passed');
}

console.log('All tests passed');
