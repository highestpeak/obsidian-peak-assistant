/**
 * Tests for QueryPatternRepo against an in-memory SQLite database.
 *
 * Uses better-sqlite3 directly (no BetterSqliteStore wrapper) so we can keep
 * everything synchronous and dependency-free in the test environment.
 */
import assert from 'assert';
import BetterSqlite3 from 'better-sqlite3';
import {
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type CompiledQuery,
} from 'kysely';
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { QueryPatternRepo } from '@/core/storage/sqlite/repositories/QueryPatternRepo';

// ---------------------------------------------------------------------------
// Minimal Kysely dialect wired directly to a better-sqlite3 instance
// ---------------------------------------------------------------------------

function makeKysely(db: BetterSqlite3.Database): Kysely<DbSchema> {
	const driver = {
		async init() {},
		async acquireConnection() {
			return {
				async executeQuery(q: CompiledQuery) {
					const stmt = db.prepare(q.sql);
					if (q.parameters && q.parameters.length > 0) {
						if (stmt.reader) {
							return { rows: stmt.all(...(q.parameters as any[])) };
						}
						const r = stmt.run(...(q.parameters as any[]));
						return {
							rows: [],
							numAffectedRows: BigInt(r.changes),
							insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
						};
					}
					if (stmt.reader) {
						return { rows: stmt.all() };
					}
					const r = stmt.run();
					return {
						rows: [],
						numAffectedRows: BigInt(r.changes),
						insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
					};
				},
				async *streamQuery(q: CompiledQuery) {
					const result = await driver.acquireConnection().then((c) => c.executeQuery(q));
					yield result;
				},
			};
		},
		async beginTransaction() { db.exec('BEGIN'); },
		async commitTransaction() { db.exec('COMMIT'); },
		async rollbackTransaction() { db.exec('ROLLBACK'); },
		async releaseConnection() {},
		async destroy() {},
	};

	return new Kysely<DbSchema>({
		dialect: {
			createDriver: () => driver as any,
			createQueryCompiler: () => new SqliteQueryCompiler(),
			createAdapter: () => new SqliteAdapter(),
			createIntrospector: (k) => new SqliteIntrospector(k),
		},
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePattern(overrides: Partial<DbSchema['query_pattern']> = {}): DbSchema['query_pattern'] {
	return {
		id: 'pat-1',
		template: 'What is {topic}?',
		variables: JSON.stringify(['topic']),
		conditions: JSON.stringify({ type: 'all' }),
		source: 'default',
		confidence: 1.0,
		usage_count: 0,
		discovered_at: Date.now(),
		last_used_at: null,
		deprecated: 0,
		...overrides,
	};
}

function makeDb() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new QueryPatternRepo(db);
	return { raw, db, repo };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testInsertAndListActive(): Promise<void> {
	const { repo } = makeDb();

	await repo.insert(makePattern({ id: 'p1', usage_count: 5, deprecated: 0 }));
	await repo.insert(makePattern({ id: 'p2', usage_count: 10, deprecated: 0 }));
	await repo.insert(makePattern({ id: 'p3', usage_count: 1, deprecated: 1 }));

	const active = await repo.listActive();
	assert.strictEqual(active.length, 2, 'should only list non-deprecated');

	// Ordered by usage_count desc
	assert.strictEqual(active[0]!.id, 'p2');
	assert.strictEqual(active[1]!.id, 'p1');
}

async function testInsertOnConflictDoNothing(): Promise<void> {
	const { repo } = makeDb();
	const pat = makePattern({ id: 'dup', usage_count: 0 });

	await repo.insert(pat);
	await repo.insert({ ...pat, usage_count: 99 }); // same id, should be ignored

	const all = await repo.listAll();
	assert.strictEqual(all.length, 1);
	assert.strictEqual(all[0]!.usage_count, 0, 'conflict should do nothing');
}

async function testListAll(): Promise<void> {
	const { repo } = makeDb();

	await repo.insert(makePattern({ id: 'a', deprecated: 0 }));
	await repo.insert(makePattern({ id: 'b', deprecated: 1 }));

	const all = await repo.listAll();
	assert.strictEqual(all.length, 2, 'listAll should include deprecated');
}

async function testIncrementUsage(): Promise<void> {
	const { repo } = makeDb();
	await repo.insert(makePattern({ id: 'x', usage_count: 3, last_used_at: null }));

	const before = Date.now();
	await repo.incrementUsage('x');
	const after = Date.now();

	const rows = await repo.listAll();
	const row = rows.find((r) => r.id === 'x')!;
	assert.strictEqual(row.usage_count, 4, 'usage_count should increment');
	assert.ok(row.last_used_at !== null, 'last_used_at should be set');
	assert.ok(row.last_used_at! >= before && row.last_used_at! <= after, 'last_used_at should be recent');
}

async function testDeprecate(): Promise<void> {
	const { repo } = makeDb();
	await repo.insert(makePattern({ id: 'd1', deprecated: 0 }));

	await repo.deprecate('d1');

	const active = await repo.listActive();
	assert.strictEqual(active.length, 0, 'deprecated row should not appear in listActive');

	const all = await repo.listAll();
	assert.strictEqual(all[0]!.deprecated, 1);
}

async function testDeprecateStale(): Promise<void> {
	const { repo } = makeDb();

	const old = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago
	const recent = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago

	// Should be staled: discovered, usage=0, old
	await repo.insert(makePattern({ id: 'stale', source: 'discovered', usage_count: 0, discovered_at: old }));
	// Should NOT be staled: has usage
	await repo.insert(makePattern({ id: 'used', source: 'discovered', usage_count: 5, discovered_at: old }));
	// Should NOT be staled: recent
	await repo.insert(makePattern({ id: 'new', source: 'discovered', usage_count: 0, discovered_at: recent }));
	// Should NOT be staled: default source
	await repo.insert(makePattern({ id: 'def', source: 'default', usage_count: 0, discovered_at: old }));

	await repo.deprecateStale(30);

	const active = await repo.listActive();
	const activeIds = active.map((r) => r.id).sort();
	assert.deepStrictEqual(activeIds, ['def', 'new', 'used'], 'only stale discovered pattern should be deprecated');
}

async function testCountAndIsEmpty(): Promise<void> {
	const { repo } = makeDb();

	assert.strictEqual(await repo.isEmpty(), true, 'table should start empty');
	assert.strictEqual(await repo.count(), 0);

	await repo.insert(makePattern({ id: 'c1' }));
	await repo.insert(makePattern({ id: 'c2', deprecated: 1 }));

	assert.strictEqual(await repo.count(), 2, 'count includes deprecated');
	assert.strictEqual(await repo.isEmpty(), false);
}

async function testRowShape(): Promise<void> {
	const { repo } = makeDb();

	const pat = makePattern({
		id: 'shape-test',
		template: 'Tell me about {entity}',
		variables: JSON.stringify(['entity']),
		conditions: JSON.stringify({ type: 'tag', value: 'project' }),
		source: 'discovered',
		confidence: 0.85,
		usage_count: 7,
		discovered_at: 1_700_000_000_000,
		last_used_at: 1_700_000_001_000,
		deprecated: 0,
	});

	await repo.insert(pat);
	const rows = await repo.listAll();
	const row = rows[0]!;

	assert.strictEqual(row.id, 'shape-test');
	assert.strictEqual(row.template, 'Tell me about {entity}');
	assert.strictEqual(row.variables, JSON.stringify(['entity']));
	assert.strictEqual(row.conditions, JSON.stringify({ type: 'tag', value: 'project' }));
	assert.strictEqual(row.source, 'discovered');
	assert.strictEqual(row.confidence, 0.85);
	assert.strictEqual(row.usage_count, 7);
	assert.strictEqual(row.discovered_at, 1_700_000_000_000);
	assert.strictEqual(row.last_used_at, 1_700_000_001_000);
	assert.strictEqual(row.deprecated, 0);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => Promise<void> }> = [
		{ name: 'insert and listActive (excludes deprecated)', fn: testInsertAndListActive },
		{ name: 'insert ON CONFLICT DO NOTHING', fn: testInsertOnConflictDoNothing },
		{ name: 'listAll includes deprecated', fn: testListAll },
		{ name: 'incrementUsage updates count and timestamp', fn: testIncrementUsage },
		{ name: 'deprecate single record', fn: testDeprecate },
		{ name: 'deprecateStale — only stale discovered rows', fn: testDeprecateStale },
		{ name: 'count and isEmpty', fn: testCountAndIsEmpty },
		{ name: 'row shape persisted correctly', fn: testRowShape },
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			await test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed++;
		} catch (err) {
			failed++;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(err);
		}
	}

	console.log(`\nQueryPatternRepo tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

void run();
