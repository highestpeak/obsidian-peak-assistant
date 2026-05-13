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
import { VaultLintRepo } from '@/core/storage/sqlite/repositories/VaultLintRepo';
import type { LintFinding, LintScanResult } from '@/service/lint/types';

type BetterSqlite3Database = ReturnType<typeof BetterSqlite3>;

function makeKysely(db: BetterSqlite3Database): Kysely<DbSchema> {
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
				async *streamQuery(q: CompiledQuery): AsyncIterableIterator<any> {
					const connection = await driver.acquireConnection();
					const result: any = await connection.executeQuery(q);
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

function makeDb() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new VaultLintRepo(db);
	return { raw, db, repo };
}

function makeFinding(index: number): LintFinding {
	return {
		id: `finding-${index}`,
		signalId: 'G-UNTAGGED',
		severity: 'info',
		filePath: `folder/note-${index}.md`,
		title: `Untagged: note-${index}`,
		description: 'This note has no tags.',
		fixActions: ['suggest-tags'],
		metadata: { index },
		status: 'open',
	};
}

function makeScan(findings: LintFinding[], id = 'scan-large'): LintScanResult {
	return {
		id,
		scanType: 'full',
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
		totalNotes: findings.length,
		healthScore: 80,
		dimensionScores: { structural: 100, content: 100, temporal: 100, semantic: 100, tags: 80 },
		findings,
		signalCounts: { 'G-UNTAGGED': findings.length },
	};
}

async function testLargeScanWritesFindingsInSqliteSafeBatches(): Promise<void> {
	const { raw, db, repo } = makeDb();
	const findings = Array.from({ length: 3000 }, (_, i) => makeFinding(i));

	await repo.saveScanResult(makeScan(findings));

	const findingCount = raw.prepare('SELECT COUNT(*) AS count FROM vault_lint_finding').get() as { count: number };
	const scanCount = raw.prepare('SELECT COUNT(*) AS count FROM vault_lint_scan').get() as { count: number };

	assert.strictEqual(scanCount.count, 1, 'should persist the scan row');
	assert.strictEqual(findingCount.count, findings.length, 'should persist every finding');

	await db.destroy();
	raw.close();
	console.log('PASS: largeScanWritesFindingsInSqliteSafeBatches');
}

async function testRepeatedScansCanPersistSameLogicalFindings(): Promise<void> {
	const { raw, db, repo } = makeDb();
	const findings = Array.from({ length: 5 }, (_, i) => makeFinding(i));

	await repo.saveScanResult(makeScan(findings, 'scan-first'));
	await repo.saveScanResult(makeScan(findings, 'scan-second'));

	const findingCount = raw.prepare('SELECT COUNT(*) AS count FROM vault_lint_finding').get() as { count: number };
	const distinctScanCount = raw
		.prepare('SELECT COUNT(DISTINCT scan_id) AS count FROM vault_lint_finding')
		.get() as { count: number };

	assert.strictEqual(findingCount.count, findings.length * 2, 'should keep per-scan finding rows');
	assert.strictEqual(distinctScanCount.count, 2, 'should associate findings with both scans');

	await db.destroy();
	raw.close();
	console.log('PASS: repeatedScansCanPersistSameLogicalFindings');
}

async function testDuplicateFindingIdsWithinOneScanArePersisted(): Promise<void> {
	const { raw, db, repo } = makeDb();
	const findings = [
		makeFinding(1),
		{ ...makeFinding(2), id: 'duplicate-logical-id' },
		{ ...makeFinding(3), id: 'duplicate-logical-id' },
	];

	await repo.saveScanResult(makeScan(findings, 'scan-with-duplicates'));

	const findingCount = raw.prepare('SELECT COUNT(*) AS count FROM vault_lint_finding').get() as { count: number };
	const uniqueIdCount = raw.prepare('SELECT COUNT(DISTINCT id) AS count FROM vault_lint_finding').get() as { count: number };

	assert.strictEqual(findingCount.count, findings.length, 'should persist duplicate logical findings as separate rows');
	assert.strictEqual(uniqueIdCount.count, findings.length, 'persisted row ids should stay unique');

	await db.destroy();
	raw.close();
	console.log('PASS: duplicateFindingIdsWithinOneScanArePersisted');
}

async function main(): Promise<void> {
	await testLargeScanWritesFindingsInSqliteSafeBatches();
	await testRepeatedScansCanPersistSameLogicalFindings();
	await testDuplicateFindingIdsWithinOneScanArePersisted();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
