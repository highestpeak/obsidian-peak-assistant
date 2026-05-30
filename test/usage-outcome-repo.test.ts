/**
 * Tests for UsageOutcomeRepo against an in-memory SQLite database.
 *
 * Mirrors the pattern in hub-constituent-repo.test.ts: a minimal Kysely dialect
 * wired directly to a better-sqlite3 instance, keeping everything synchronous.
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
import { UsageOutcomeRepo } from '@/core/storage/sqlite/repositories/UsageOutcomeRepo';

// ── Kysely-over-better-sqlite3 helper ───────────────────────────────────────
function makeKysely(db: BetterSqlite3.Database): Kysely<DbSchema> {
	const driver = {
		async init() {},
		async acquireConnection() {
			return {
				async executeQuery(q: CompiledQuery) {
					const stmt = db.prepare(q.sql);
					if (q.parameters && q.parameters.length > 0) {
						if (stmt.reader) return { rows: stmt.all(...(q.parameters as any[])) };
						const r = stmt.run(...(q.parameters as any[]));
						return {
							rows: [],
							numAffectedRows: BigInt(r.changes),
							insertId: r.lastInsertRowid ? BigInt(r.lastInsertRowid) : undefined,
						};
					}
					if (stmt.reader) return { rows: stmt.all() };
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

function makeRepo() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new UsageOutcomeRepo(db);
	return { raw, db, repo };
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function testInsertAndFindByMessage(): Promise<void> {
	const { repo } = makeRepo();
	await repo.insert({
		message_id: 'm1', session_id: 's1', event_type: 'vault_save',
		occurred_at: 1000, target: 'note.md', metadata_json: null,
	});
	await repo.insert({
		message_id: 'm1', session_id: 's1', event_type: 'continuation',
		occurred_at: 2000, target: null, metadata_json: '{"next_message_id":"m2"}',
	});
	await repo.insert({
		message_id: 'm2', session_id: 's1', event_type: 'search_click',
		occurred_at: 3000, target: 'other.md', metadata_json: null,
	});

	const m1 = await repo.findByMessage('m1');
	assert.strictEqual(m1.length, 2, 'm1 should have 2 outcomes');
	assert.strictEqual(m1[0]!.event_type, 'vault_save', 'first should be vault_save (asc)');
	assert.strictEqual(m1[1]!.event_type, 'continuation');

	const m2 = await repo.findByMessage('m2');
	assert.strictEqual(m2.length, 1);
	assert.strictEqual(m2[0]!.target, 'other.md');

	console.log('PASS: insertAndFindByMessage');
}

async function testFindBySession(): Promise<void> {
	const { repo } = makeRepo();
	await repo.insert({
		message_id: 'm1', session_id: 'sA', event_type: 'vault_save',
		occurred_at: 1000, target: null, metadata_json: null,
	});
	await repo.insert({
		message_id: 'm2', session_id: 'sA', event_type: 'search_click',
		occurred_at: 2000, target: null, metadata_json: null,
	});
	await repo.insert({
		message_id: 'm3', session_id: 'sB', event_type: 'vault_save',
		occurred_at: 1500, target: null, metadata_json: null,
	});

	const sA = await repo.findBySession('sA');
	assert.strictEqual(sA.length, 2);
	assert.strictEqual(sA[0]!.occurred_at, 1000, 'should be asc by occurred_at');

	const sASince = await repo.findBySession('sA', 1500);
	assert.strictEqual(sASince.length, 1);
	assert.strictEqual(sASince[0]!.message_id, 'm2');

	console.log('PASS: findBySession');
}

async function testCountByType(): Promise<void> {
	const { repo } = makeRepo();
	await repo.insert({ message_id: 'm1', session_id: 's', event_type: 'vault_save',     occurred_at: 100, target: null, metadata_json: null });
	await repo.insert({ message_id: 'm2', session_id: 's', event_type: 'vault_save',     occurred_at: 200, target: null, metadata_json: null });
	await repo.insert({ message_id: 'm3', session_id: 's', event_type: 'search_click',   occurred_at: 300, target: null, metadata_json: null });
	await repo.insert({ message_id: 'm4', session_id: 's', event_type: 'copilot_accept', occurred_at: 5000, target: null, metadata_json: null }); // outside range

	const counts = await repo.countByType({ from: 0, to: 1000 });
	const byType = Object.fromEntries(counts.map((c) => [c.event_type, c.count]));
	assert.strictEqual(byType['vault_save'], 2);
	assert.strictEqual(byType['search_click'], 1);
	assert.strictEqual(byType['copilot_accept'], undefined, 'out-of-range should be excluded');

	console.log('PASS: countByType');
}

async function testCountUsefulMessages(): Promise<void> {
	const { repo } = makeRepo();
	// m1 has 2 outcomes — counts once
	await repo.insert({ message_id: 'm1', session_id: 's', event_type: 'vault_save',   occurred_at: 100, target: null, metadata_json: null });
	await repo.insert({ message_id: 'm1', session_id: 's', event_type: 'continuation', occurred_at: 200, target: null, metadata_json: null });
	// m2 has 1 outcome
	await repo.insert({ message_id: 'm2', session_id: 's', event_type: 'search_click', occurred_at: 300, target: null, metadata_json: null });
	// m3 is outside range
	await repo.insert({ message_id: 'm3', session_id: 's', event_type: 'vault_save',   occurred_at: 5000, target: null, metadata_json: null });

	const n = await repo.countUsefulMessages({ from: 0, to: 1000 });
	assert.strictEqual(n, 2, 'distinct message_ids in range');

	const nEmpty = await repo.countUsefulMessages({ from: 6000, to: 7000 });
	assert.strictEqual(nEmpty, 0);

	console.log('PASS: countUsefulMessages');
}

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
	await testInsertAndFindByMessage();
	await testFindBySession();
	await testCountByType();
	await testCountUsefulMessages();
	console.log('\nAll usage-outcome-repo tests passed!');
})();
