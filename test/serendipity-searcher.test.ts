// T11Y-2a: pure-port unit test for SerendipitySearcher.
//
// Stub `SemanticGraphTraversalReadPort` with deterministic in-memory
// data and assert: ordering (highest cosine distance first), bridge
// label propagation, 1-hop neighbor exclusion, existing-outlink
// dedup, document-type filter, top-K cap, AmbientPushItem shape.

import { strict as assert } from 'node:assert';
import type {
	SemanticGraphTraversalNode,
	SemanticGraphTraversalReadPort,
} from '@/core/ports/SemanticGraphTraversalReadPort';
import { SerendipitySearcher } from '@/service/ambient/serendipity/SerendipitySearcher';
import type { AmbientContext } from '@/core/types/ambient';

function makeContext(filePath: string): AmbientContext {
	return {
		currentParagraph: '',
		cursorSection: '',
		documentTitle: filePath,
		documentTags: [],
		documentHeadings: [],
		existingOutlinks: [],
		recentEditDelta: '',
		editSessionDuration: 0,
		filePath,
		lastModified: 0,
	};
}

interface StubFixture {
	source: string;
	embeddings: Map<string, number[]>;
	neighbors: Map<string, string[]>;
	docTypeIds: Set<string>;
	labels: Map<string, string>;
}

function makeStub(f: StubFixture): SemanticGraphTraversalReadPort {
	return {
		async getNodeIdByPath(path: string) {
			return path === f.source ? f.source : null;
		},
		async getEmbedding(nodeId: string) {
			return f.embeddings.get(nodeId) ?? null;
		},
		async getNeighborIdsMap(nodeIds) {
			const map = new Map<string, string[]>();
			for (const id of nodeIds) {
				const n = f.neighbors.get(id);
				if (n) map.set(id, n);
			}
			return map;
		},
		async filterToDocumentLikeIds(candidateIds) {
			return candidateIds.filter((id) => f.docTypeIds.has(id));
		},
		async getNodesByIds(ids) {
			const out = new Map<string, SemanticGraphTraversalNode>();
			for (const id of ids) {
				out.set(id, { nodeId: id, label: f.labels.get(id) ?? id });
			}
			return out;
		},
	};
}

async function run(): Promise<void> {
// ---------------------------------------------------------------------------
// Test 1: basic 2-hop traversal with embedding-distance ordering
// ---------------------------------------------------------------------------
{
	// source -> bridgeA -> farNote (dist=1, opposite)
	// source -> bridgeB -> closeNote (dist≈0)
	// source -> bridgeC -> medNote (dist=0.5)
	const fixture: StubFixture = {
		source: 'src.md',
		embeddings: new Map([
			['src.md', [1, 0, 0]],
			['farNote.md', [-1, 0, 0]],
			['closeNote.md', [1, 0, 0]],
			['medNote.md', [0, 1, 0]],
		]),
		neighbors: new Map([
			['src.md', ['bridgeA.md', 'bridgeB.md', 'bridgeC.md']],
			['bridgeA.md', ['farNote.md']],
			['bridgeB.md', ['closeNote.md']],
			['bridgeC.md', ['medNote.md']],
		]),
		docTypeIds: new Set(['farNote.md', 'closeNote.md', 'medNote.md']),
		labels: new Map([
			['bridgeA.md', 'Bridge A'],
			['bridgeB.md', 'Bridge B'],
			['bridgeC.md', 'Bridge C'],
		]),
	};

	const searcher = new SerendipitySearcher(makeStub(fixture), () => 12345);
	const items = await searcher.search(makeContext('src.md'), new Set(), 10);

	assert.equal(items.length, 3, 'three document-like 2-hop candidates');
	assert.equal(items[0].filePath, 'farNote.md', 'highest distance first');
	assert.equal(items[1].filePath, 'medNote.md', 'medium distance second');
	assert.equal(items[2].filePath, 'closeNote.md', 'closest last');

	const top = items[0];
	assert.equal(top.timestamp, 12345);
	assert.equal(top.explanationType, 'template');
	assert.equal(top.title, 'farNote');
	assert.ok(top.excerpt.includes('Bridge A'), `bridge label propagated, got ${top.excerpt}`);
	assert.equal(top.signals.length, 1);
	assert.equal(top.signals[0].type, 'graph_neighbor');
	if (top.signals[0].type === 'graph_neighbor') {
		assert.equal(top.signals[0].hop, 2);
		assert.equal(top.signals[0].via, 'Bridge A');
	}
	console.log('PASS: traversal + ordering');
}

// ---------------------------------------------------------------------------
// Test 2: 1-hop neighbors of source are dropped from 2-hop candidates;
//         existing outlinks (by basename) are filtered.
// ---------------------------------------------------------------------------
{
	const fixture: StubFixture = {
		source: 'src.md',
		embeddings: new Map([
			['src.md', [1, 0, 0]],
			['neighbor.md', [-1, 0, 0]],
			['linked.md', [-1, 0, 0]],
			['fresh.md', [0, 1, 0]],
		]),
		neighbors: new Map([
			['src.md', ['neighbor.md', 'bridge.md']],
			// neighbor reaches back to itself + linked
			['neighbor.md', ['neighbor.md', 'linked.md']],
			['bridge.md', ['fresh.md', 'neighbor.md']],
		]),
		docTypeIds: new Set(['linked.md', 'fresh.md', 'neighbor.md']),
		labels: new Map([
			['neighbor.md', 'Neighbor'],
			['bridge.md', 'Bridge'],
		]),
	};

	const searcher = new SerendipitySearcher(makeStub(fixture));
	const items = await searcher.search(
		makeContext('src.md'),
		new Set(['linked']), // basename of 'linked.md'
		10,
	);

	// neighbor.md is a 1-hop neighbor → excluded; linked.md filtered by outlinks.
	assert.equal(items.length, 1, 'only fresh.md remains');
	assert.equal(items[0].filePath, 'fresh.md');
	console.log('PASS: 1-hop + outlink dedup');
}

// ---------------------------------------------------------------------------
// Test 3: top-K cap
// ---------------------------------------------------------------------------
{
	const fixture: StubFixture = {
		source: 'src.md',
		embeddings: new Map([
			['src.md', [1, 0, 0]],
			['a.md', [-1, 0, 0]],
			['b.md', [0, 1, 0]],
			['c.md', [1, 0, 0]],
		]),
		neighbors: new Map([
			['src.md', ['bridge.md']],
			['bridge.md', ['a.md', 'b.md', 'c.md']],
		]),
		docTypeIds: new Set(['a.md', 'b.md', 'c.md']),
		labels: new Map([['bridge.md', 'Bridge']]),
	};

	const searcher = new SerendipitySearcher(makeStub(fixture));
	const items = await searcher.search(makeContext('src.md'), new Set(), 2);
	assert.equal(items.length, 2, 'capped at maxResults');
	assert.equal(items[0].filePath, 'a.md');
	assert.equal(items[1].filePath, 'b.md');
	console.log('PASS: top-K cap');
}

// ---------------------------------------------------------------------------
// Test 4: missing source node / missing embedding short-circuit to []
// ---------------------------------------------------------------------------
{
	const fixture: StubFixture = {
		source: 'other.md',
		embeddings: new Map(),
		neighbors: new Map(),
		docTypeIds: new Set(),
		labels: new Map(),
	};
	const searcher = new SerendipitySearcher(makeStub(fixture));
	const items = await searcher.search(makeContext('src.md'), new Set(), 5);
	assert.equal(items.length, 0);
	console.log('PASS: missing source short-circuit');
}

// ---------------------------------------------------------------------------
// Test 5: document-type filter drops non-document hits
// ---------------------------------------------------------------------------
{
	const fixture: StubFixture = {
		source: 'src.md',
		embeddings: new Map([
			['src.md', [1, 0, 0]],
			['tag-node', [-1, 0, 0]],
			['doc.md', [-1, 0, 0]],
		]),
		neighbors: new Map([
			['src.md', ['bridge.md']],
			['bridge.md', ['tag-node', 'doc.md']],
		]),
		docTypeIds: new Set(['doc.md']),
		labels: new Map([['bridge.md', 'Bridge']]),
	};
	const searcher = new SerendipitySearcher(makeStub(fixture));
	const items = await searcher.search(makeContext('src.md'), new Set(), 10);
	assert.equal(items.length, 1, 'only doc.md survives type filter');
	assert.equal(items[0].filePath, 'doc.md');
	console.log('PASS: document-type filter');
}

console.log('serendipity-searcher.test: all passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
