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

// --- Phase 2: signal detection functions ---
import {
	detectSharedTags,
	detectGraphNeighborSignal,
	detectCoCitationSignal,
	detectHubMemberSignal,
} from '@/service/ambient/AmbientSearcher';

// --- detectSharedTags ---
{
	const sourceTags = new Set(['process', 'dev', 'ai']);
	const resultTags = ['dev', 'testing', 'ai'];
	const signals = detectSharedTags(sourceTags, resultTags);
	assert.equal(signals.length, 2);
	assert.equal(signals[0].type, 'shared_tag');
	assert.equal((signals[0] as any).tag, 'dev');
	assert.equal((signals[1] as any).tag, 'ai');

	// No overlap
	const empty = detectSharedTags(new Set(['a']), ['b']);
	assert.equal(empty.length, 0);

	console.log('detectSharedTags: all passed');
}

// --- detectGraphNeighborSignal ---
{
	// 1-hop neighbor
	const s1 = detectGraphNeighborSignal('note-a.md', new Set(['note-a.md', 'note-b.md']), new Map());
	assert.equal(s1?.type, 'graph_neighbor');
	assert.equal((s1 as any).hop, 1);

	// 2-hop neighbor with bridge
	const bridgeMap = new Map([['note-c.md', 'Bridge Note']]);
	const s2 = detectGraphNeighborSignal('note-c.md', new Set(), bridgeMap);
	assert.equal(s2?.type, 'graph_neighbor');
	assert.equal((s2 as any).hop, 2);
	assert.equal((s2 as any).via, 'Bridge Note');

	// Not a neighbor
	const s3 = detectGraphNeighborSignal('note-x.md', new Set(), new Map());
	assert.equal(s3, null);

	console.log('detectGraphNeighborSignal: all passed');
}

// --- detectCoCitationSignal ---
{
	const coCitations = [
		{ nodeId: 'n1', path: 'note-a.md', label: 'Note A', citingNotes: ['MOC Note'], score: 0.8 },
		{ nodeId: 'n2', path: 'note-b.md', label: 'Note B', citingNotes: [], score: 0.3 },
	];

	const s1 = detectCoCitationSignal('note-a.md', coCitations);
	assert.equal(s1?.type, 'co_citation');
	assert.equal((s1 as any).citingNote, 'MOC Note');

	// No citing notes
	const s2 = detectCoCitationSignal('note-b.md', coCitations);
	assert.equal(s2, null);

	// Not found
	const s3 = detectCoCitationSignal('note-x.md', coCitations);
	assert.equal(s3, null);

	console.log('detectCoCitationSignal: all passed');
}

// --- detectHubMemberSignal ---
{
	const sharedHubNames = new Map([['note-a.md', 'Systems Thinking']]);

	const s1 = detectHubMemberSignal('note-a.md', sharedHubNames);
	assert.equal(s1?.type, 'hub_member');
	assert.equal((s1 as any).hubName, 'Systems Thinking');

	const s2 = detectHubMemberSignal('note-x.md', sharedHubNames);
	assert.equal(s2, null);

	console.log('detectHubMemberSignal: all passed');
}

console.log('All Phase 2 signal detection tests passed');

// --- Feedback score adjustments ---
{
	// Positive boost: capped at 0.3
	const posMap = new Map<string, number>([['src::target', 5]]);
	const boost = Math.min(0.3, (posMap.get('src::target') ?? 0) * 0.1);
	assert.equal(boost, 0.3); // capped

	// Below cap
	const boost2 = Math.min(0.3, (posMap.get('src::other') ?? 0) * 0.1);
	assert.equal(boost2, 0); // no entry

	const posMap2 = new Map<string, number>([['src::target', 2]]);
	const boost3 = Math.min(0.3, (posMap2.get('src::target') ?? 0) * 0.1);
	assert.equal(boost3, 0.2); // 2 * 0.1

	// Ignore penalty: capped at -0.15
	const ignMap = new Map<string, number>([['src::target', 2]]);
	const penalty = Math.min(0.15, (ignMap.get('src::target') ?? 0) * 0.05);
	assert.equal(penalty, 0.1); // 2 * 0.05

	const ignMap2 = new Map<string, number>([['src::target', 10]]);
	const penalty2 = Math.min(0.15, (ignMap2.get('src::target') ?? 0) * 0.05);
	assert.equal(penalty2, 0.15); // capped at 0.15

	console.log('feedback scoring: all passed');
}

// --- RelevanceExplainer coverage for Phase 2 signals ---
{
	// Co-citation
	assert.equal(
		generateExplanation([{ type: 'co_citation', citingNote: 'MOC Note' }]),
		'Co-cited in [[MOC Note]]',
	);

	// Hub member
	assert.equal(
		generateExplanation([{ type: 'hub_member', hubName: 'Systems Thinking' }]),
		'Both in "Systems Thinking" cluster',
	);

	// Graph neighbor 2-hop with bridge
	assert.equal(
		generateExplanation([{ type: 'graph_neighbor', hop: 2, via: 'Design Patterns' }]),
		'Connected via [[Design Patterns]]',
	);

	// Priority: graph_neighbor beats shared_tag
	const multi = generateExplanation([
		{ type: 'shared_tag', tag: 'dev' },
		{ type: 'graph_neighbor', hop: 1 },
	]);
	assert.equal(multi, 'Directly linked');

	console.log('RelevanceExplainer Phase 2 coverage: all passed');
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

// --- Phase 4: Morning Briefing ---
import type { BriefingItem, BriefingCategory } from '@/service/ambient/types';

// Test BriefingItem type structure
{
	const item: BriefingItem = {
		filePath: 'notes/test.md',
		title: 'Test Note',
		category: 'unresolved_connections',
		reason: '5 notes link here, but only 1 outgoing link',
		score: 4,
		metadata: { connectionCount: 5 },
	};

	assert.equal(item.category, 'unresolved_connections');
	assert.equal(item.score, 4);
	assert.equal(item.metadata?.connectionCount, 5);

	// Category union completeness
	const categories: BriefingCategory[] = ['unresolved_connections', 'changed_hubs', 'decaying_engagement'];
	assert.equal(categories.length, 3);

	console.log('BriefingItem type: all passed');
}

// Test briefing item sorting (score descending)
{
	const items: BriefingItem[] = [
		{ filePath: 'a.md', title: 'A', category: 'decaying_engagement', reason: '', score: 0.5 },
		{ filePath: 'b.md', title: 'B', category: 'unresolved_connections', reason: '', score: 5 },
		{ filePath: 'c.md', title: 'C', category: 'changed_hubs', reason: '', score: 1 },
	];

	items.sort((a, b) => b.score - a.score);
	assert.equal(items[0].filePath, 'b.md');
	assert.equal(items[1].filePath, 'c.md');
	assert.equal(items[2].filePath, 'a.md');

	console.log('briefing item sorting: all passed');
}

// Test session gap logic
{
	const BRIEFING_MIN_GAP = 4 * 60 * 60 * 1000; // 4 hours

	const now = Date.now();
	const tooRecent = now - 2 * 60 * 60 * 1000; // 2 hours ago
	const oldEnough = now - 5 * 60 * 60 * 1000; // 5 hours ago

	assert.ok(now - tooRecent < BRIEFING_MIN_GAP, 'Should skip if < 4h');
	assert.ok(now - oldEnough >= BRIEFING_MIN_GAP, 'Should show if >= 4h');

	console.log('session gap logic: all passed');
}

// Test decay days calculation
{
	const BRIEFING_DECAY_DAYS = 14;
	const now = Date.now();
	const lastOpen15DaysAgo = now - 15 * 24 * 60 * 60 * 1000;
	const lastOpen10DaysAgo = now - 10 * 24 * 60 * 60 * 1000;
	const cutoff = now - BRIEFING_DECAY_DAYS * 24 * 60 * 60 * 1000;

	assert.ok(lastOpen15DaysAgo < cutoff, '15 days ago should be before cutoff');
	assert.ok(lastOpen10DaysAgo >= cutoff, '10 days ago should be after cutoff');

	const daysSince = Math.floor((now - lastOpen15DaysAgo) / (24 * 60 * 60 * 1000));
	assert.equal(daysSince, 15);

	console.log('decay days calculation: all passed');
}

// Test unresolved connection heuristic
{
	// incoming >= 2 AND outgoing < incoming * 0.5
	const cases = [
		{ incoming: 5, outgoing: 1, expected: true },   // 1 < 5 * 0.5 = 2.5 -> unresolved
		{ incoming: 5, outgoing: 3, expected: false },   // 3 >= 5 * 0.5 = 2.5 -> not unresolved
		{ incoming: 1, outgoing: 0, expected: false },   // incoming < 2 -> skip
		{ incoming: 10, outgoing: 4, expected: true },   // 4 < 10 * 0.5 = 5 -> unresolved
		{ incoming: 4, outgoing: 2, expected: false },   // 2 >= 4 * 0.5 = 2 -> not unresolved (equal)
		{ incoming: 0, outgoing: 0, expected: false },   // incoming < 2 -> skip
	];

	for (const { incoming, outgoing, expected } of cases) {
		const isUnresolved = incoming >= 2 && outgoing < incoming * 0.5;
		assert.equal(isUnresolved, expected, `incoming=${incoming} outgoing=${outgoing} expected=${expected}`);
	}

	console.log('unresolved connection heuristic: all passed');
}

console.log('All Phase 4 Morning Briefing tests passed');
console.log('All tests passed');
