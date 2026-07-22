// MediaJobService — state machine enforcement + boot-time recovery.
// Uses an in-memory sqlite (better-sqlite3 :memory:) and the real
// ChatMediaJobRepo so we exercise the persisted upsert path.

import assert from 'assert';
import BetterSqlite3 from 'better-sqlite3';
import {
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	type CompiledQuery,
} from 'kysely';
import { migrateSqliteSchema, type Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { ChatMediaJobRepo } from '@/core/storage/sqlite/repositories/ChatMediaJobRepo';
import { MediaJobService } from '@/service/media/MediaJobService';
import type { MediaGenerationRequest, MediaPreflight } from '@/core/types/media-generation';

type BetterSqlite3Database = ReturnType<typeof BetterSqlite3>;

function makeKysely(db: BetterSqlite3Database): Kysely<DbSchema> {
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

function makeSvc() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new ChatMediaJobRepo(db);
	let clock = 1000;
	const svc = new MediaJobService(repo, () => {
		clock += 1;
		return clock;
	});
	return { raw, db, repo, svc };
}

function makeRequest(): MediaGenerationRequest {
	return {
		kind: 'image',
		prompt: 'test prompt',
		route: 'fal',
		presetId: 'default',
	};
}

function makePreflight(): MediaPreflight {
	return {
		state: 'ready',
		executionRoute: 'fal',
		provider: 'fal',
		modelId: 'fal-ai/fast-sdxl',
		estimate: { amountUsd: 0.01, billingUnit: 'image', confidence: 'estimated' },
		problems: [],
	};
}

async function testCreateAndTransitionHappyPath() {
	const { svc } = makeSvc();
	const job = await svc.createJob({ runId: 'run-1', request: makeRequest(), preflight: makePreflight() });
	assert.strictEqual(job.state, 'queued');
	assert.strictEqual(job.receiptIds.length, 0);
	const running = await svc.transition(job.jobId, 'running');
	assert.strictEqual(running.state, 'running');
	const done = await svc.transition(job.jobId, 'completed', { appendReceiptId: 'art-1' });
	assert.strictEqual(done.state, 'completed');
	assert.deepStrictEqual(done.receiptIds, ['art-1']);
	console.log('  ✓ queued → running → completed persists receipt id');
}

async function testIllegalTransitionThrows() {
	const { svc } = makeSvc();
	const job = await svc.createJob({ runId: 'run-2', request: makeRequest(), preflight: makePreflight() });
	await svc.transition(job.jobId, 'running');
	await svc.transition(job.jobId, 'completed');
	// completed → cancelled is illegal
	await assert.rejects(
		() => svc.transition(job.jobId, 'cancelled'),
		/illegal transition/,
		'completed → cancelled must throw',
	);
	console.log('  ✓ illegal transition throws (protects against zombie states)');
}

async function testCancelFromQueued() {
	const { svc } = makeSvc();
	const job = await svc.createJob({ runId: 'run-3', request: makeRequest(), preflight: makePreflight() });
	const cancelled = await svc.transition(job.jobId, 'cancelled');
	assert.strictEqual(cancelled.state, 'cancelled');
	console.log('  ✓ cancel from queued is legal');
}

async function testFailFromRunningPersistsError() {
	const { svc } = makeSvc();
	const job = await svc.createJob({ runId: 'run-4', request: makeRequest(), preflight: makePreflight() });
	await svc.transition(job.jobId, 'running');
	const failed = await svc.transition(job.jobId, 'failed', { error: 'boom' });
	assert.strictEqual(failed.state, 'failed');
	assert.strictEqual(failed.error, 'boom');
	console.log('  ✓ fail carries error message');
}

async function testConfirmationGateFlow() {
	const { svc } = makeSvc();
	const job = await svc.createJob({
		runId: 'run-5',
		request: { ...makeRequest(), kind: 'video' },
		preflight: { ...makePreflight(), state: 'needs-confirmation' },
		initialState: 'awaiting-confirmation',
	});
	assert.strictEqual(job.state, 'awaiting-confirmation');
	const running = await svc.transition(job.jobId, 'running');
	assert.strictEqual(running.state, 'running');
	console.log('  ✓ awaiting-confirmation → running is legal');
}

async function testListUnfinishedRestartRecovery() {
	// Simulate: create three jobs, mark one completed, restart process
	// (re-open repo against same in-memory db), verify only the two
	// non-terminal jobs come back as "unfinished".
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db1 = makeKysely(raw);
	const svc1 = new MediaJobService(new ChatMediaJobRepo(db1), () => 100);
	const jobA = await svc1.createJob({ runId: 'r', request: makeRequest(), preflight: makePreflight() });
	const jobB = await svc1.createJob({ runId: 'r', request: makeRequest(), preflight: makePreflight() });
	const jobC = await svc1.createJob({ runId: 'r', request: makeRequest(), preflight: makePreflight() });
	await svc1.transition(jobC.jobId, 'running');
	await svc1.transition(jobC.jobId, 'completed');
	// "Restart" — new Kysely + new repo, same underlying db file.
	const db2 = makeKysely(raw);
	const svc2 = new MediaJobService(new ChatMediaJobRepo(db2), () => 200);
	const unfinished = await svc2.listUnfinished();
	const ids = unfinished.map((j) => j.jobId).sort();
	assert.deepStrictEqual(ids, [jobA.jobId, jobB.jobId].sort(), 'only non-terminal jobs survive');
	// Boot-time recovery: mark them failed so no zombie running/queued remains.
	const failedCount = await svc2.failAllUnfinished('resume-not-supported');
	assert.strictEqual(failedCount, 2);
	const stillOpen = await svc2.listUnfinished();
	assert.strictEqual(stillOpen.length, 0, 'no zombie jobs after recovery');
	console.log('  ✓ listUnfinished + failAllUnfinished cleans zombie running jobs after restart');
}

async function testReceiptIdsAndProviderRequestIdPersist() {
	const { svc } = makeSvc();
	const job = await svc.createJob({ runId: 'r', request: makeRequest(), preflight: makePreflight() });
	await svc.transition(job.jobId, 'running', { providerRequestId: 'req-abc', providerResponseUrl: 'https://x/y' });
	const done = await svc.transition(job.jobId, 'completed', { appendReceiptId: 'art-1' });
	assert.strictEqual(done.providerRequestId, 'req-abc');
	assert.strictEqual(done.providerResponseUrl, 'https://x/y');
	assert.deepStrictEqual(done.receiptIds, ['art-1']);
	console.log('  ✓ providerRequestId + responseUrl survive across transitions');
}

async function main() {
	await testCreateAndTransitionHappyPath();
	await testIllegalTransitionThrows();
	await testCancelFromQueued();
	await testFailFromRunningPersistsError();
	await testConfirmationGateFlow();
	await testListUnfinishedRestartRecovery();
	await testReceiptIdsAndProviderRequestIdPersist();
	console.log('media-job-service: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
