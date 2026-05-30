/**
 * Tests for UsageLogRepo's PR-Dash-3 query additions
 * (`groupByFeatureCost`, `messageIdsByFeature`, `getById`).
 *
 * Mirrors the wiring pattern in `usage-outcome-repo.test.ts` — Kysely
 * over an in-memory better-sqlite3, synchronous.
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
import { UsageLogRepo } from '@/core/storage/sqlite/repositories/UsageLogRepo';

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
	const repo = new UsageLogRepo(db);
	return { raw, db, repo };
}

function baseRow(over: Partial<Parameters<UsageLogRepo['insert']>[0]>) {
	return {
		session_id: 's1',
		feature: 'chat',
		action: 'message',
		provider: 'anthropic',
		model: 'claude-3-5-sonnet',
		input_tokens: 100,
		output_tokens: 100,
		cached_tokens: 0,
		reasoning_tokens: 0,
		cost_usd: 0.01,
		duration_ms: 500,
		is_streaming: 0,
		metadata_json: null,
		created_at: 1000,
		...over,
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

async function testGroupByFeatureCost(): Promise<void> {
	const { repo } = makeRepo();
	await repo.insert(baseRow({ feature: 'chat',    cost_usd: 0.10, created_at: 100 }));
	await repo.insert(baseRow({ feature: 'chat',    cost_usd: 0.30, created_at: 200 }));
	await repo.insert(baseRow({ feature: 'search_analysis', cost_usd: 0.05, created_at: 300 }));
	await repo.insert(baseRow({ feature: 'copilot', cost_usd: 0.20, created_at: 400 }));
	// Out of range
	await repo.insert(baseRow({ feature: 'chat', cost_usd: 9.99, created_at: 5000 }));

	const rows = await repo.groupByFeatureCost(0, 1000);
	const byFeature = Object.fromEntries(rows.map((r) => [r.feature, r]));

	assert.strictEqual(rows.length, 3, 'three distinct features in range');
	// Floating point safety
	assert.ok(Math.abs(byFeature['chat']!.totalCost - 0.40) < 1e-9, 'chat cost summed');
	assert.strictEqual(byFeature['chat']!.callCount, 2);
	assert.strictEqual(byFeature['copilot']!.callCount, 1);
	assert.ok(Math.abs(byFeature['copilot']!.totalCost - 0.20) < 1e-9);
	assert.strictEqual(byFeature['search_analysis']!.callCount, 1);

	// Ordering: chat (0.40) > copilot (0.20) > search (0.05)
	assert.strictEqual(rows[0]!.feature, 'chat');
	assert.strictEqual(rows[1]!.feature, 'copilot');
	assert.strictEqual(rows[2]!.feature, 'search_analysis');

	console.log('PASS: groupByFeatureCost');
}

async function testGroupByFeatureCostEmpty(): Promise<void> {
	const { repo } = makeRepo();
	const rows = await repo.groupByFeatureCost(0, 1000);
	assert.deepStrictEqual(rows, []);
	console.log('PASS: groupByFeatureCost (empty)');
}

async function testMessageIdsByFeature(): Promise<void> {
	const { repo } = makeRepo();
	await repo.insert(baseRow({
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm1', other: 'x' }),
		created_at: 100,
	}));
	await repo.insert(baseRow({
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm2' }),
		created_at: 200,
	}));
	await repo.insert(baseRow({
		feature: 'copilot',
		metadata_json: JSON.stringify({ message_id: 'm3' }),
		created_at: 300,
	}));
	// Row with no metadata — excluded
	await repo.insert(baseRow({ feature: 'chat', metadata_json: null, created_at: 400 }));
	// Row with metadata but no message_id — excluded
	await repo.insert(baseRow({
		feature: 'chat',
		metadata_json: JSON.stringify({ session_title: 'foo' }),
		created_at: 500,
	}));

	const rows = await repo.messageIdsByFeature(0, 1000);
	assert.strictEqual(rows.length, 3, 'three rows with message_id');

	const chatMsgIds = rows.filter((r) => r.feature === 'chat').map((r) => r.messageId).sort();
	assert.deepStrictEqual(chatMsgIds, ['m1', 'm2']);

	const copilotMsgIds = rows.filter((r) => r.feature === 'copilot').map((r) => r.messageId);
	assert.deepStrictEqual(copilotMsgIds, ['m3']);

	console.log('PASS: messageIdsByFeature');
}

async function testGetById(): Promise<void> {
	const { raw, repo } = makeRepo();
	await repo.insert(baseRow({ feature: 'chat', created_at: 100 }));
	await repo.insert(baseRow({ feature: 'copilot', created_at: 200 }));

	const ids = raw.prepare('SELECT id FROM usage_log ORDER BY created_at ASC').all() as Array<{ id: number }>;

	const first = await repo.getById(ids[0]!.id);
	assert.ok(first, 'row found');
	assert.strictEqual(first!.feature, 'chat');

	const second = await repo.getById(ids[1]!.id);
	assert.strictEqual(second!.feature, 'copilot');

	const missing = await repo.getById(99999);
	assert.strictEqual(missing, undefined);

	console.log('PASS: getById');
}

async function testFindByMessageId(): Promise<void> {
	const { repo } = makeRepo();
	// Two rows with same message_id but different created_at — should return latest
	await repo.insert(baseRow({
		session_id: 's1',
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm1' }),
		created_at: 100,
		cost_usd: 0.01,
	}));
	await repo.insert(baseRow({
		session_id: 's1',
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm1' }),
		created_at: 200,
		cost_usd: 0.02,
	}));
	// Same message_id but different session — should be excluded when session scope passed
	await repo.insert(baseRow({
		session_id: 's2',
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm1' }),
		created_at: 300,
		cost_usd: 0.03,
	}));
	// Different message_id — must never match
	await repo.insert(baseRow({
		session_id: 's1',
		feature: 'chat',
		metadata_json: JSON.stringify({ message_id: 'm2' }),
		created_at: 400,
	}));

	// Without session scope — latest across all sessions
	const latest = await repo.findByMessageId('m1');
	assert.ok(latest, 'finds latest row by message_id');
	assert.strictEqual(latest!.session_id, 's2');
	assert.ok(Math.abs(latest!.cost_usd - 0.03) < 1e-9);

	// With session scope — most recent within that session
	const scoped = await repo.findByMessageId('m1', 's1');
	assert.ok(scoped, 'finds row within scoped session');
	assert.strictEqual(scoped!.session_id, 's1');
	assert.strictEqual(scoped!.created_at, 200);
	assert.ok(Math.abs(scoped!.cost_usd - 0.02) < 1e-9);

	// Unknown message_id returns undefined
	const missing = await repo.findByMessageId('nope');
	assert.strictEqual(missing, undefined);

	// Mismatched session returns undefined
	const mismatch = await repo.findByMessageId('m1', 's-nonexistent');
	assert.strictEqual(mismatch, undefined);

	console.log('PASS: findByMessageId');
}

// ── Run ─────────────────────────────────────────────────────────────────────

(async () => {
	await testGroupByFeatureCost();
	await testGroupByFeatureCostEmpty();
	await testMessageIdsByFeature();
	await testGetById();
	await testFindByMessageId();
	console.log('\nAll usage-log-repo tests passed!');
})();
