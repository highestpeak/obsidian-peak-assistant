/**
 * Tests for HubConstituentRepo against an in-memory SQLite database.
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
import { HubConstituentRepo } from '@/core/storage/sqlite/repositories/HubConstituentRepo';

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

function makeDb() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new HubConstituentRepo(db);
	return { raw, db, repo };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testInsertAndLookup(): Promise<void> {
	const { repo } = makeDb();

	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'core' },
		{ docId: 'doc-b', role: 'peripheral' },
	]);

	const members = await repo.getMembersForHub('hub-1');
	assert.strictEqual(members.length, 2, 'Should have 2 members');
	assert.ok(members.some((m) => m.memberDocId === 'doc-a' && m.role === 'core'), 'doc-a should be core');
	assert.ok(members.some((m) => m.memberDocId === 'doc-b' && m.role === 'peripheral'), 'doc-b should be peripheral');

	console.log('PASS: insertAndLookup');
}

async function testGetHubsForMemberDocReturnsMultipleHubs(): Promise<void> {
	const { repo } = makeDb();

	// doc-shared belongs to both hub-1 and hub-2
	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-shared', role: 'core' },
		{ docId: 'doc-only-1', role: 'core' },
	]);
	await repo.replaceHubMembers('hub-2', [
		{ docId: 'doc-shared', role: 'peripheral' },
		{ docId: 'doc-only-2', role: 'core' },
	]);

	const hubs = await repo.getHubsForMemberDoc('doc-shared');
	assert.strictEqual(hubs.length, 2, 'doc-shared should belong to 2 hubs');
	assert.ok(hubs.includes('hub-1'), 'Should include hub-1');
	assert.ok(hubs.includes('hub-2'), 'Should include hub-2');

	// doc-only-1 belongs to hub-1 only
	const hubs2 = await repo.getHubsForMemberDoc('doc-only-1');
	assert.strictEqual(hubs2.length, 1);
	assert.strictEqual(hubs2[0], 'hub-1');

	console.log('PASS: getHubsForMemberDocReturnsMultipleHubs');
}

async function testReplaceIsIdempotent(): Promise<void> {
	const { repo } = makeDb();

	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'core' },
		{ docId: 'doc-b', role: 'core' },
	]);
	// Replace with different members
	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'peripheral' },
		{ docId: 'doc-c', role: 'core' },
	]);

	const members = await repo.getMembersForHub('hub-1');
	assert.strictEqual(members.length, 2, 'Should have 2 members after replace');
	assert.ok(members.some((m) => m.memberDocId === 'doc-a' && m.role === 'peripheral'), 'doc-a role should be updated');
	assert.ok(members.some((m) => m.memberDocId === 'doc-c'), 'doc-c should exist');
	assert.ok(!members.some((m) => m.memberDocId === 'doc-b'), 'doc-b should be removed');

	console.log('PASS: replaceIsIdempotent');
}

async function testDeleteByHub(): Promise<void> {
	const { repo } = makeDb();

	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'core' },
	]);
	await repo.replaceHubMembers('hub-2', [
		{ docId: 'doc-a', role: 'core' },
	]);

	await repo.deleteByHub('hub-1');

	const members1 = await repo.getMembersForHub('hub-1');
	assert.strictEqual(members1.length, 0, 'hub-1 should have no members after delete');

	// hub-2 should be unaffected
	const members2 = await repo.getMembersForHub('hub-2');
	assert.strictEqual(members2.length, 1, 'hub-2 should still have 1 member');

	console.log('PASS: deleteByHub');
}

async function testDeleteByMember(): Promise<void> {
	const { repo } = makeDb();

	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'core' },
		{ docId: 'doc-b', role: 'core' },
	]);

	await repo.deleteByMember('doc-a');

	const members = await repo.getMembersForHub('hub-1');
	assert.strictEqual(members.length, 1, 'Should have 1 member after deleting doc-a');
	assert.strictEqual(members[0]!.memberDocId, 'doc-b');

	// getHubsForMemberDoc should return empty for deleted member
	const hubs = await repo.getHubsForMemberDoc('doc-a');
	assert.strictEqual(hubs.length, 0, 'doc-a should no longer be in any hub');

	console.log('PASS: deleteByMember');
}

async function testCountMembersForHub(): Promise<void> {
	const { repo } = makeDb();

	await repo.replaceHubMembers('hub-1', [
		{ docId: 'doc-a', role: 'core' },
		{ docId: 'doc-b', role: 'core' },
		{ docId: 'doc-c', role: 'peripheral' },
	]);

	const count = await repo.countMembersForHub('hub-1');
	assert.strictEqual(count, 3, 'Should count 3 members');

	const countEmpty = await repo.countMembersForHub('hub-nonexistent');
	assert.strictEqual(countEmpty, 0, 'Non-existent hub should have 0 members');

	console.log('PASS: countMembersForHub');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

(async () => {
	await testInsertAndLookup();
	await testGetHubsForMemberDocReturnsMultipleHubs();
	await testReplaceIsIdempotent();
	await testDeleteByHub();
	await testDeleteByMember();
	await testCountMembersForHub();
	console.log('\nAll hub-constituent-repo tests passed!');
})();
