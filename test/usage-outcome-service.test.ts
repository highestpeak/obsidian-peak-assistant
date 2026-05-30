/**
 * Tests for UsageOutcomeService:
 *  - recordEvent validates event_type against the closed enum (throws on unknown)
 *  - each convenience wrapper writes the right event_type and target
 *  - metadata is JSON-serialized; occurred_at defaults to Date.now()
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
import { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';

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

function makeService() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new UsageOutcomeRepo(db);
	const svc = UsageOutcomeService.fromRepo(repo);
	return { raw, db, repo, svc };
}

async function testRejectsUnknownEventType(): Promise<void> {
	const { svc } = makeService();
	let threw = false;
	try {
		await svc.recordEvent({
			message_id: 'm1',
			session_id: 's1',
			event_type: 'not_a_real_type' as any,
		});
	} catch (e) {
		threw = true;
		assert.ok(String(e).includes('Unknown event_type'), 'error message mentions Unknown event_type');
	}
	assert.ok(threw, 'recordEvent should throw on unknown event_type');
	console.log('PASS: rejectsUnknownEventType');
}

async function testRecordEventDefaults(): Promise<void> {
	const { svc, repo } = makeService();
	const before = Date.now();
	await svc.recordEvent({
		message_id: 'm1',
		session_id: 's1',
		event_type: 'vault_save',
		target: 'note.md',
		metadata: { rank: 3 },
	});
	const after = Date.now();

	const rows = await repo.findByMessage('m1');
	assert.strictEqual(rows.length, 1);
	const row = rows[0]!;
	assert.strictEqual(row.event_type, 'vault_save');
	assert.strictEqual(row.target, 'note.md');
	assert.strictEqual(row.metadata_json, '{"rank":3}', 'metadata should be JSON-stringified');
	assert.ok(row.occurred_at >= before && row.occurred_at <= after, 'occurred_at should default to Date.now()');

	console.log('PASS: recordEventDefaults');
}

async function testNullsForMissingFields(): Promise<void> {
	const { svc, repo } = makeService();
	await svc.recordEvent({
		message_id: 'm1',
		session_id: 's1',
		event_type: 'continuation',
		occurred_at: 12345,
	});
	const row = (await repo.findByMessage('m1'))[0]!;
	assert.strictEqual(row.target, null, 'target should be null when omitted');
	assert.strictEqual(row.metadata_json, null, 'metadata_json should be null when metadata omitted');
	assert.strictEqual(row.occurred_at, 12345, 'explicit occurred_at should be honored');
	console.log('PASS: nullsForMissingFields');
}

async function testConvenienceWrappers(): Promise<void> {
	const { svc, repo } = makeService();

	await svc.recordVaultSave('m1', 's', '/n.md', { lines: 10 });
	await svc.recordCopilotAccept('m2', 's', '/c.md');
	await svc.recordSearchClick('m3', 's', '/r.md');
	await svc.recordAgentFileEmit('m4', 's', '/o.md');
	await svc.recordContinuation('m5', 's', 'm6');

	const expect: Array<[string, string, string | null]> = [
		['m1', 'vault_save', '/n.md'],
		['m2', 'copilot_accept', '/c.md'],
		['m3', 'search_click', '/r.md'],
		['m4', 'agent_file_emit', '/o.md'],
		['m5', 'continuation', null],
	];
	for (const [mid, eventType, target] of expect) {
		const row = (await repo.findByMessage(mid))[0]!;
		assert.ok(row, `expected row for ${mid}`);
		assert.strictEqual(row.event_type, eventType, `${mid} event_type`);
		assert.strictEqual(row.target, target, `${mid} target`);
	}

	// vault_save metadata round-trip
	const vs = (await repo.findByMessage('m1'))[0]!;
	assert.strictEqual(vs.metadata_json, '{"lines":10}');

	// continuation embeds next_message_id in metadata
	const cont = (await repo.findByMessage('m5'))[0]!;
	assert.ok(cont.metadata_json, 'continuation metadata_json present');
	assert.deepStrictEqual(JSON.parse(cont.metadata_json!), { next_message_id: 'm6' });

	console.log('PASS: convenienceWrappers');
}

async function testQueryPassthroughs(): Promise<void> {
	const { svc } = makeService();
	await svc.recordVaultSave('m1', 'sA', '/a.md');
	await svc.recordSearchClick('m2', 'sA', '/b.md');
	await svc.recordVaultSave('m3', 'sB', '/c.md');

	const sA = await svc.outcomesForSession('sA');
	assert.strictEqual(sA.length, 2);

	const m1Outcomes = await svc.outcomesForMessage('m1');
	assert.strictEqual(m1Outcomes.length, 1);

	const counts = await svc.countByType({ from: 0, to: Date.now() + 1000 });
	const byType = Object.fromEntries(counts.map((c) => [c.event_type, c.count]));
	assert.strictEqual(byType['vault_save'], 2);
	assert.strictEqual(byType['search_click'], 1);

	const useful = await svc.countUsefulMessages({ from: 0, to: Date.now() + 1000 });
	assert.strictEqual(useful, 3);

	console.log('PASS: queryPassthroughs');
}

(async () => {
	await testRejectsUnknownEventType();
	await testRecordEventDefaults();
	await testNullsForMissingFields();
	await testConvenienceWrappers();
	await testQueryPassthroughs();
	console.log('\nAll usage-outcome-service tests passed!');
})();
