// T11Y-4b: pure unit tests for SmartConnectionService. The service owns
// resolving existing-link paths to indexed-doc ids, shared-theme
// intersection (top 5), similarity-based sort, and top-N (15) truncation.
// We stub SemanticLinkReadPort so this test runs without sqlite.

import assert from 'assert';
import { SmartConnectionService } from '@/service/copilot/SmartConnectionService';
import type {
	SemanticEmbeddingNeighbor,
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

async function testReportsNotIndexedWhenDocMissing(): Promise<void> {
	const svc = new SmartConnectionService(stubReads({
		getEmbeddingNeighbors: async () => null,
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, false);
	assert.deepStrictEqual(r.connections, []);
	console.log('PASS: reportsNotIndexedWhenDocMissing');
}

async function testExcludesExistingLinksAtSqlLevel(): Promise<void> {
	let observedExclude: Set<string> | null = null;
	const svc = new SmartConnectionService(stubReads({
		getIndexedDocumentIdsByPaths: async (paths) => {
			const out = new Map<string, string>();
			for (const p of paths) {
				if (p === 'Notes/A.md') out.set(p, 'self-id');
				if (p === 'Notes/Existing.md') out.set(p, 'existing-id');
			}
			return out;
		},
		getEmbeddingNeighbors: async (_path, opts) => {
			observedExclude = new Set(opts.excludeDocIds);
			return { neighbors: [] };
		},
	}));
	await svc.findSmartConnections('Notes/A.md', new Set(['Notes/Existing.md']));
	assert.ok(observedExclude, 'embedding neighbor exclusion set must be observed');
	assert.strictEqual(observedExclude!.has('existing-id'), true);
	console.log('PASS: excludesExistingLinksAtSqlLevel');
}

async function testComputesSharedThemesAndSorts(): Promise<void> {
	const neighbors: SemanticEmbeddingNeighbor[] = [
		{ docId: 'd-low', path: 'Notes/Low.md', label: 'Low', similarity: 0.4 },
		{ docId: 'd-high', path: 'Notes/High.md', label: 'High', similarity: 0.9 },
	];
	const svc = new SmartConnectionService(stubReads({
		getIndexedDocumentIdsByPaths: async (paths) => {
			const out = new Map<string, string>();
			for (const p of paths) {
				if (p === 'Notes/A.md') out.set(p, 'self-id');
			}
			return out;
		},
		getEmbeddingNeighbors: async () => ({ neighbors }),
		getTopicTagsByDocIds: async (ids) => {
			const out = new Map<string, ReadonlySet<string>>();
			for (const id of ids) {
				if (id === 'self-id') out.set(id, new Set(['ai', 'graph', 'product']));
				else if (id === 'd-high') out.set(id, new Set(['ai', 'graph']));
				else if (id === 'd-low') out.set(id, new Set(['unrelated']));
			}
			return out;
		},
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, true);
	assert.strictEqual(r.connections.length, 2);
	// Descending sort by similarity score.
	assert.strictEqual(r.connections[0].path, 'Notes/High.md');
	assert.deepStrictEqual(r.connections[0].sharedThemes.sort(), ['ai', 'graph']);
	assert.deepStrictEqual(r.connections[1].sharedThemes, []);
	console.log('PASS: computesSharedThemesAndSorts');
}

async function testSharedThemesCapAtFive(): Promise<void> {
	const neighbors: SemanticEmbeddingNeighbor[] = [
		{ docId: 'd1', path: 'Notes/N.md', label: 'N', similarity: 0.9 },
	];
	const allTags = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
	const svc = new SmartConnectionService(stubReads({
		getIndexedDocumentIdsByPaths: async () => new Map([['Notes/A.md', 'self-id']]),
		getEmbeddingNeighbors: async () => ({ neighbors }),
		getTopicTagsByDocIds: async () => new Map<string, ReadonlySet<string>>([
			['self-id', allTags],
			['d1', allTags],
		]),
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set());
	assert.strictEqual(r.connections[0].sharedThemes.length, 5);
	console.log('PASS: sharedThemesCapAtFive');
}

async function testTopNTruncationAtFifteen(): Promise<void> {
	const neighbors: SemanticEmbeddingNeighbor[] = [];
	for (let i = 0; i < 20; i++) {
		neighbors.push({
			docId: `d${i}`,
			path: `Notes/Doc${i}.md`,
			label: `Doc${i}`,
			similarity: 0.5 + i * 0.01,
		});
	}
	const svc = new SmartConnectionService(stubReads({
		getIndexedDocumentIdsByPaths: async () => new Map([['Notes/A.md', 'self-id']]),
		getEmbeddingNeighbors: async () => ({ neighbors }),
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set());
	assert.strictEqual(r.connections.length, 15);
	// Highest-scored neighbor leads after sort.
	assert.strictEqual(r.connections[0].path, 'Notes/Doc19.md');
	console.log('PASS: topNTruncationAtFifteen');
}

async function testFiltersSelfPathAndExistingLinks(): Promise<void> {
	const neighbors: SemanticEmbeddingNeighbor[] = [
		{ docId: 'self-id', path: 'Notes/A.md', label: 'Self', similarity: 0.99 },
		{ docId: 'existing-id', path: 'Notes/Existing.md', label: 'Existing', similarity: 0.95 },
		{ docId: 'keep-id', path: 'Notes/Keep.md', label: 'Keep', similarity: 0.8 },
	];
	const svc = new SmartConnectionService(stubReads({
		getIndexedDocumentIdsByPaths: async (paths) => {
			const out = new Map<string, string>();
			for (const p of paths) {
				if (p === 'Notes/A.md') out.set(p, 'self-id');
				if (p === 'Notes/Existing.md') out.set(p, 'existing-id');
			}
			return out;
		},
		getEmbeddingNeighbors: async () => ({ neighbors }),
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set(['Notes/Existing.md']));
	assert.strictEqual(r.connections.length, 1);
	assert.strictEqual(r.connections[0].path, 'Notes/Keep.md');
	console.log('PASS: filtersSelfPathAndExistingLinks');
}

async function testSwallowsReadErrorsAsNotIndexed(): Promise<void> {
	const svc = new SmartConnectionService(stubReads({
		getEmbeddingNeighbors: async () => { throw new Error('sqlite not ready'); },
	}));
	const r = await svc.findSmartConnections('Notes/A.md', new Set());
	assert.strictEqual(r.indexed, false);
	console.log('PASS: swallowsReadErrorsAsNotIndexed');
}

async function main(): Promise<void> {
	await testReportsNotIndexedWhenDocMissing();
	await testExcludesExistingLinksAtSqlLevel();
	await testComputesSharedThemesAndSorts();
	await testSharedThemesCapAtFive();
	await testTopNTruncationAtFifteen();
	await testFiltersSelfPathAndExistingLinks();
	await testSwallowsReadErrorsAsNotIndexed();
}

main().then(() => process.exit(0)).catch(err => {
	console.error(err);
	process.exit(1);
});
