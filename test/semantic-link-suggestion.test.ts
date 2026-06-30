// T11Y-4b: pure unit tests for SemanticLinkSuggestionService. The service
// owns merging in/out 1-hop edges (with 0.5 fallback weight for incoming
// neighbors), filtering existing-link paths, title/snippet rendering,
// descending sort, and top-N truncation. We exercise each branch with a
// stub SemanticLinkReadPort so this test runs without sqlite.

import assert from 'assert';
import { SemanticLinkSuggestionService } from '@/service/copilot/SemanticLinkSuggestionService';
import type {
	SemanticGraphNeighbor,
	SemanticGraphNodeMeta,
	SemanticLinkReadPort,
} from '@/core/ports/SemanticLinkReadPort';

function stubReads(overrides: Partial<SemanticLinkReadPort> = {}): SemanticLinkReadPort {
	return {
		getOneHopSemanticNeighbors: async () => ({ neighbors: [] }),
		getGraphNodeMetaByIds: async () => new Map(),
		getEmbeddingNeighbors: async () => ({ neighbors: [] }),
		getIndexedDocumentIdsByPaths: async () => new Map(),
		getTopicTagsByDocIds: async () => new Map(),
		...overrides,
	};
}

async function testReportsNotIndexedWhenNoDocNode(): Promise<void> {
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => null,
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, false);
	assert.deepStrictEqual(r.suggestions, []);
	assert.strictEqual(r.totalNeighbors, 0);
	console.log('PASS: reportsNotIndexedWhenNoDocNode');
}

async function testReportsIndexedEmptyWhenNoNeighbors(): Promise<void> {
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => ({ neighbors: [] }),
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, true);
	assert.strictEqual(r.totalNeighbors, 0);
	console.log('PASS: reportsIndexedEmptyWhenNoNeighbors');
}

async function testMergesOutgoingAndIncomingWithFallbackWeight(): Promise<void> {
	const neighbors: SemanticGraphNeighbor[] = [
		{ nodeId: 'n1', weight: 0.9, direction: 'outgoing' },
		{ nodeId: 'n2', weight: 0.5, direction: 'incoming' },
	];
	const meta = new Map<string, SemanticGraphNodeMeta>([
		['n1', { nodeId: 'n1', path: 'Other/Out.md', label: 'Out' }],
		['n2', { nodeId: 'n2', path: 'Other/In.md', label: 'In' }],
	]);
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => ({ neighbors }),
		getGraphNodeMetaByIds: async () => meta,
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, true);
	assert.strictEqual(r.suggestions.length, 2);
	// Sorted descending by score.
	assert.strictEqual(r.suggestions[0].path, 'Other/Out.md');
	assert.strictEqual(r.suggestions[0].direction, 'outgoing');
	assert.strictEqual(r.suggestions[1].direction, 'incoming');
	// Incoming-only neighbors carry the 0.5 fallback weight.
	assert.strictEqual(r.suggestions[1].score, 0.5);
	// Snippet format: percent rounded to 0 decimals.
	assert.strictEqual(r.suggestions[0].snippet, 'Similarity: 90%');
	console.log('PASS: mergesOutgoingAndIncomingWithFallbackWeight');
}

async function testFiltersExistingLinksAndSelf(): Promise<void> {
	const neighbors: SemanticGraphNeighbor[] = [
		{ nodeId: 'n-self', weight: 0.95, direction: 'outgoing' },
		{ nodeId: 'n-existing', weight: 0.8, direction: 'outgoing' },
		{ nodeId: 'n-keep', weight: 0.7, direction: 'outgoing' },
	];
	const meta = new Map<string, SemanticGraphNodeMeta>([
		['n-self', { nodeId: 'n-self', path: 'Notes/A.md', label: 'A' }],
		['n-existing', { nodeId: 'n-existing', path: 'Notes/Linked.md', label: 'Linked' }],
		['n-keep', { nodeId: 'n-keep', path: 'Notes/Keep.md', label: 'Keep' }],
	]);
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => ({ neighbors }),
		getGraphNodeMetaByIds: async () => meta,
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set(['Notes/Linked.md']));
	assert.strictEqual(r.suggestions.length, 1);
	assert.strictEqual(r.suggestions[0].path, 'Notes/Keep.md');
	// totalNeighbors counts the raw fetch, not the filtered list.
	assert.strictEqual(r.totalNeighbors, 3);
	console.log('PASS: filtersExistingLinksAndSelf');
}

async function testTitleFallbackToBasenameWhenLabelMissing(): Promise<void> {
	const neighbors: SemanticGraphNeighbor[] = [
		{ nodeId: 'n1', weight: 0.5, direction: 'outgoing' },
	];
	const meta = new Map<string, SemanticGraphNodeMeta>([
		['n1', { nodeId: 'n1', path: 'Notes/Sub/Foo.md', label: '' }],
	]);
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => ({ neighbors }),
		getGraphNodeMetaByIds: async () => meta,
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.suggestions[0].title, 'Foo');
	console.log('PASS: titleFallbackToBasenameWhenLabelMissing');
}

async function testTopNTruncationAtTwenty(): Promise<void> {
	const neighbors: SemanticGraphNeighbor[] = [];
	const meta = new Map<string, SemanticGraphNodeMeta>();
	for (let i = 0; i < 25; i++) {
		const id = `n${i}`;
		const path = `Notes/Doc${i}.md`;
		neighbors.push({ nodeId: id, weight: 0.5 + i * 0.01, direction: 'outgoing' });
		meta.set(id, { nodeId: id, path, label: `Doc${i}` });
	}
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => ({ neighbors }),
		getGraphNodeMetaByIds: async () => meta,
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.suggestions.length, 20);
	assert.strictEqual(r.totalNeighbors, 25);
	// Highest-scored neighbor leads the list.
	assert.strictEqual(r.suggestions[0].title, 'Doc24');
	console.log('PASS: topNTruncationAtTwenty');
}

async function testSwallowsReadErrorsAsNotIndexed(): Promise<void> {
	const svc = new SemanticLinkSuggestionService(stubReads({
		getOneHopSemanticNeighbors: async () => { throw new Error('sqlite not ready'); },
	}));
	const r = await svc.findSemanticLinkNeighbors('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, false);
	console.log('PASS: swallowsReadErrorsAsNotIndexed');
}

async function main(): Promise<void> {
	await testReportsNotIndexedWhenNoDocNode();
	await testReportsIndexedEmptyWhenNoNeighbors();
	await testMergesOutgoingAndIncomingWithFallbackWeight();
	await testFiltersExistingLinksAndSelf();
	await testTitleFallbackToBasenameWhenLabelMissing();
	await testTopNTruncationAtTwenty();
	await testSwallowsReadErrorsAsNotIndexed();
}

main().then(() => process.exit(0)).catch(err => {
	console.error(err);
	process.exit(1);
});
