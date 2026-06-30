// T11Y-3B: unit tests for `GraphCleanupService`.
//
// The service was previously a free function under `src/app/context/`
// that reached for `sqliteStoreManager` directly, so it was effectively
// untestable. After the refactor it accepts narrow ports for the
// kysely db, the mobius node repo, and the indexed-document repo —
// allowing these tests to drive every branch (no-op / orphan edges /
// orphan nodes / chunked deletes) with hand-rolled fakes.

import assert from 'assert';
import {
	GRAPH_CLEANUP_DELETE_CHUNK_SIZE,
	GraphCleanupService,
	type GraphCleanupIndexedDocumentReader,
	type GraphCleanupMobiusNodeReader,
} from '@/service/search/index/maintenance/GraphCleanupService';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface RecordedDeleteEdge {
	op: 'delete-edge';
	ids?: string[];
	orRefs?: string[];
}
interface RecordedDeleteNode {
	op: 'delete-node';
	ids: string[];
}
interface RecordedSelectOrphan {
	op: 'select-orphan-edges';
}

type RecordedOp = RecordedDeleteEdge | RecordedDeleteNode | RecordedSelectOrphan;

interface FakeDbConfig {
	orphanEdgeIds: string[];
}

function makeFakeDb(config: FakeDbConfig): { db: any; ops: RecordedOp[]; transactionCount: number } {
	const ops: RecordedOp[] = [];
	let transactionCount = 0;

	// Recorder for delete builder chain.
	function makeDeleteBuilder(table: 'mobius_edge' | 'mobius_node') {
		const builder = {
			where(arg1: any, op?: any, ids?: any) {
				// Two call shapes:
				//   .where('id', 'in', [...])
				//   .where((eb) => eb.or([...]))
				if (typeof arg1 === 'function') {
					// eb-callback path used for the (from_node_id, to_node_id) OR filter.
					// Run the callback against an `eb` stub that records the ids it sees.
					const collected: string[] = [];
					const eb = (column: string, _op: string, vals: any[]) => {
						for (const v of vals) collected.push(`${column}:${v}`);
						return { _column: column, _vals: vals };
					};
					eb.or = (_clauses: any[]) => ({ _or: true });
					arg1(eb);
					ops.push({ op: 'delete-edge', orRefs: collected });
					return builder;
				}
				if (table === 'mobius_edge') {
					ops.push({ op: 'delete-edge', ids });
				} else {
					ops.push({ op: 'delete-node', ids });
				}
				return builder;
			},
			async execute() {
				return [];
			},
		};
		return builder;
	}

	function makeSelectOrphanBuilder() {
		return {
			select() {
				return this;
			},
			where() {
				return this;
			},
			async execute() {
				ops.push({ op: 'select-orphan-edges' });
				return config.orphanEdgeIds.map((id) => ({ id }));
			},
		};
	}

	const trx = {
		selectFrom(table: string) {
			if (table !== 'mobius_edge') throw new Error(`unexpected selectFrom: ${table}`);
			return makeSelectOrphanBuilder();
		},
		deleteFrom(table: 'mobius_edge' | 'mobius_node') {
			return makeDeleteBuilder(table);
		},
	};

	const db = {
		transaction() {
			return {
				async execute(cb: (trx: any) => Promise<void>) {
					transactionCount += 1;
					await cb(trx);
				},
			};
		},
	};

	return {
		db,
		ops,
		get transactionCount() {
			return transactionCount;
		},
	};
}

function makeIndexedDocRepo(
	indexedPaths: string[],
	idsByPath: Record<string, string>,
): GraphCleanupIndexedDocumentReader {
	return {
		async getAllIndexedPaths() {
			const m = new Map<string, number>();
			for (const p of indexedPaths) m.set(p, 0);
			return m;
		},
		async getIdsByPaths(paths) {
			const rows: { id: string; path: string }[] = [];
			for (const p of paths) {
				const id = idsByPath[p];
				if (id) rows.push({ id, path: p });
			}
			return rows;
		},
	};
}

function makeNodeRepo(byType: Record<string, string[]>): GraphCleanupMobiusNodeReader {
	return {
		async getByType(type) {
			return (byType[type] ?? []).map((id) => ({ id }));
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testNoOpWhenNoOrphans() {
	const fakeDb = makeFakeDb({ orphanEdgeIds: [] });
	const indexedDocRepo = makeIndexedDocRepo(['a.md'], { 'a.md': 'doc-1' });
	const nodeRepo = makeNodeRepo({ Document: ['doc-1'], HubDoc: [] });

	const svc = new GraphCleanupService(fakeDb.db as any, nodeRepo, indexedDocRepo, [
		'Document',
		'HubDoc',
	]);
	const result = await svc.run();

	assert.deepStrictEqual(result, {
		orphanEdgesDeleted: 0,
		nodesWithoutIndexedDocumentDeleted: 0,
	});
	// Single transaction, single select for orphan edges, no delete ops.
	assert.strictEqual(fakeDb.transactionCount, 1, 'expected exactly one transaction');
	const deleteOps = fakeDb.ops.filter((o) => o.op !== 'select-orphan-edges');
	assert.strictEqual(deleteOps.length, 0, `expected no delete ops, got ${JSON.stringify(deleteOps)}`);
}

async function testOrphanEdgesDeleted() {
	const orphanIds = ['e1', 'e2', 'e3'];
	const fakeDb = makeFakeDb({ orphanEdgeIds: orphanIds });
	const indexedDocRepo = makeIndexedDocRepo(['a.md'], { 'a.md': 'doc-1' });
	const nodeRepo = makeNodeRepo({ Document: ['doc-1'], HubDoc: [] });

	const svc = new GraphCleanupService(fakeDb.db as any, nodeRepo, indexedDocRepo, [
		'Document',
		'HubDoc',
	]);
	const result = await svc.run();

	assert.strictEqual(result.orphanEdgesDeleted, 3);
	assert.strictEqual(result.nodesWithoutIndexedDocumentDeleted, 0);

	// One delete-edge call carrying all 3 ids (smaller than chunk size).
	const edgeDeletes = fakeDb.ops.filter(
		(o): o is RecordedDeleteEdge => o.op === 'delete-edge' && !!o.ids,
	);
	assert.strictEqual(edgeDeletes.length, 1, 'expected exactly one chunked delete');
	assert.deepStrictEqual(edgeDeletes[0].ids, orphanIds);
}

async function testOrphanNodesDeleted() {
	const fakeDb = makeFakeDb({ orphanEdgeIds: [] });
	// Indexed doc only has 'doc-1' — 'doc-stale' will be orphan
	const indexedDocRepo = makeIndexedDocRepo(['a.md'], { 'a.md': 'doc-1' });
	const nodeRepo = makeNodeRepo({
		Document: ['doc-1', 'doc-stale'],
		HubDoc: ['hub-stale'],
	});

	const svc = new GraphCleanupService(fakeDb.db as any, nodeRepo, indexedDocRepo, [
		'Document',
		'HubDoc',
	]);
	const result = await svc.run();

	assert.strictEqual(result.orphanEdgesDeleted, 0);
	assert.strictEqual(
		result.nodesWithoutIndexedDocumentDeleted,
		2,
		`expected 2 orphan nodes, got ${result.nodesWithoutIndexedDocumentDeleted}`,
	);

	// We expect:
	// - one delete-edge with eb-callback referencing both orphan ids on
	//   from_node_id AND to_node_id (4 total refs)
	// - one delete-node with the 2 ids
	const edgeOrDeletes = fakeDb.ops.filter(
		(o): o is RecordedDeleteEdge => o.op === 'delete-edge' && !!o.orRefs,
	);
	assert.strictEqual(edgeOrDeletes.length, 1, 'expected exactly one incident-edge delete');
	const refs = edgeOrDeletes[0].orRefs!;
	assert.ok(refs.includes('from_node_id:doc-stale'));
	assert.ok(refs.includes('from_node_id:hub-stale'));
	assert.ok(refs.includes('to_node_id:doc-stale'));
	assert.ok(refs.includes('to_node_id:hub-stale'));

	const nodeDeletes = fakeDb.ops.filter((o): o is RecordedDeleteNode => o.op === 'delete-node');
	assert.strictEqual(nodeDeletes.length, 1);
	assert.deepStrictEqual(new Set(nodeDeletes[0].ids), new Set(['doc-stale', 'hub-stale']));
}

async function testChunkedOrphanEdgeDelete() {
	// Use a tiny custom chunk size so we don't need 1000+ ids.
	const chunkSize = 3;
	const orphanIds = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
	const fakeDb = makeFakeDb({ orphanEdgeIds: orphanIds });
	const indexedDocRepo = makeIndexedDocRepo([], {});
	const nodeRepo = makeNodeRepo({ Document: [], HubDoc: [] });

	const svc = new GraphCleanupService(
		fakeDb.db as any,
		nodeRepo,
		indexedDocRepo,
		['Document', 'HubDoc'],
		chunkSize,
	);
	const result = await svc.run();

	assert.strictEqual(result.orphanEdgesDeleted, 7);
	const edgeDeletes = fakeDb.ops.filter(
		(o): o is RecordedDeleteEdge => o.op === 'delete-edge' && !!o.ids,
	);
	// 7 ids / chunk 3 = 3 chunks (3, 3, 1)
	assert.strictEqual(edgeDeletes.length, 3, `expected 3 chunks, got ${edgeDeletes.length}`);
	assert.deepStrictEqual(edgeDeletes[0].ids, ['e1', 'e2', 'e3']);
	assert.deepStrictEqual(edgeDeletes[1].ids, ['e4', 'e5', 'e6']);
	assert.deepStrictEqual(edgeDeletes[2].ids, ['e7']);
}

function testChunkSizeConstantIs500() {
	// Lock in the historical chunk size — bumping it accidentally is a
	// real risk because vaults that hit this code typically have many
	// edges, and a too-large IN-list will fail at the SQLite parameter
	// limit. Keep parity with the pre-refactor implementation.
	assert.strictEqual(GRAPH_CLEANUP_DELETE_CHUNK_SIZE, 500);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
	const tests: Array<[string, () => Promise<void> | void]> = [
		['no orphans → no-op', testNoOpWhenNoOrphans],
		['orphan edges deleted', testOrphanEdgesDeleted],
		['orphan nodes deleted', testOrphanNodesDeleted],
		['chunked orphan edge delete', testChunkedOrphanEdgeDelete],
		['chunk size constant is 500', testChunkSizeConstantIs500],
	];

	let passed = 0;
	const failures: Array<[string, unknown]> = [];
	for (const [name, fn] of tests) {
		try {
			await fn();
			console.log(`  ✓ ${name}`);
			passed += 1;
		} catch (err) {
			console.error(`  ✗ ${name}`);
			console.error(err);
			failures.push([name, err]);
		}
	}

	console.log(`\n${passed}/${tests.length} passed`);
	if (failures.length > 0) {
		process.exitCode = 1;
	}
}

run().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
