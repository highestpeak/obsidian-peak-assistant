/**
 * Chat Studio zero-gap Track D (2026-07-21) — TurnExecutionReceipt ↔
 * ChatArtifactReceipt association (MSG-05 / RUN-06).
 *
 * Exercises `ChatArtifactReceiptRepo` end-to-end against an in-memory
 * SQLite instance to prove:
 *   1. A turn that produces multiple ChatArtifactReceipts can recover
 *      them by messageId (the primary write path used by useChatSubmit
 *      when it builds TurnExecutionReceipt.artifactIds).
 *   2. Conversation-scoped + project-scoped queries return the same
 *      receipts (both are supported query paths for the Resources tab and
 *      project-level dashboards).
 *   3. Kind-scoped scan (used by the ReminderSchedulerService) returns
 *      only rows with the matching kind.
 *   4. A fresh save round-trips the JSON payload — new kinds (dataview /
 *      extract / reminder) survive the sqlite JSON re-parse.
 *
 * PASS: markers per scenario.
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
import { migrateSqliteSchema, type Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { ChatArtifactReceiptRepo } from '@/core/storage/sqlite/repositories/ChatArtifactReceiptRepo';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

type BetterSqlite3Database = ReturnType<typeof BetterSqlite3>;

function makeKysely(db: BetterSqlite3Database): Kysely<DbSchema> {
	const driver = {
		async init() {},
		async acquireConnection() {
			return {
				async executeQuery(q: CompiledQuery) {
					const stmt = db.prepare(q.sql);
					const params = q.parameters as unknown[];
					if (params && params.length > 0) {
						if (stmt.reader) return { rows: stmt.all(...(params as any[])) };
						const r = stmt.run(...(params as any[]));
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
					yield { rows: db.prepare(q.sql).all(...(q.parameters as any[])) };
				},
			};
		},
		async releaseConnection() {},
		async beginTransaction() { db.exec('BEGIN'); },
		async commitTransaction() { db.exec('COMMIT'); },
		async rollbackTransaction() { db.exec('ROLLBACK'); },
		async destroy() {},
	};
	return new Kysely<DbSchema>({
		dialect: {
			createAdapter: () => new SqliteAdapter(),
			createDriver: () => driver as any,
			createIntrospector: (kysely) => new SqliteIntrospector(kysely),
			createQueryCompiler: () => new SqliteQueryCompiler(),
		},
	});
}

function makeReceipt(overrides: Partial<ChatArtifactReceipt>): ChatArtifactReceipt {
	return {
		artifactId: `art-${Math.random().toString(36).slice(2, 10)}`,
		runId: 'run-1',
		messageId: 'msg-A',
		conversationId: 'conv-1',
		projectId: 'proj-1',
		direction: 'generated',
		kind: 'extract',
		title: 'x',
		state: 'ready',
		availableActions: ['open'],
		createdAt: Date.now(),
		...overrides,
	};
}

async function saveReceipt(
	repo: ChatArtifactReceiptRepo,
	receipt: ChatArtifactReceipt,
): Promise<void> {
	await repo.upsert({
		artifact_id: receipt.artifactId,
		run_id: receipt.runId,
		message_id: receipt.messageId,
		conversation_id: receipt.conversationId,
		project_id: receipt.projectId ?? null,
		direction: receipt.direction,
		kind: receipt.kind,
		state: receipt.state,
		title: receipt.title,
		receipt_json: JSON.stringify(receipt),
		created_at_ts: receipt.createdAt,
	});
}

async function main(): Promise<void> {
	const sqlite = new BetterSqlite3(':memory:');
	sqlite.exec('PRAGMA journal_mode = MEMORY');
	const kysely = makeKysely(sqlite);
	migrateSqliteSchema(sqlite);
	const repo = new ChatArtifactReceiptRepo(kysely);

	// Scenario 1: multi-receipt turn recovers by messageId.
	const messageId = 'msg-turn-1';
	const runId = 'run-turn-1';
	const conversationId = 'conv-turn-1';
	const projectId = 'proj-turn-1';
	const dataviewReceipt = makeReceipt({
		artifactId: 'art-dv-1',
		kind: 'dataview',
		messageId,
		runId,
		conversationId,
		projectId,
	});
	const extractReceipt = makeReceipt({
		artifactId: 'art-ext-1',
		kind: 'extract',
		messageId,
		runId,
		conversationId,
		projectId,
	});
	const reminderReceipt = makeReceipt({
		artifactId: 'art-rem-1',
		kind: 'reminder',
		messageId,
		runId,
		conversationId,
		projectId,
	});
	await saveReceipt(repo, dataviewReceipt);
	await saveReceipt(repo, extractReceipt);
	await saveReceipt(repo, reminderReceipt);

	const byMessage = await repo.listByMessage(messageId);
	const artifactIds = new Set(byMessage.map((r) => r.artifact_id));
	assert.strictEqual(byMessage.length, 3, 'expected 3 receipts by message');
	assert.ok(artifactIds.has('art-dv-1'));
	assert.ok(artifactIds.has('art-ext-1'));
	assert.ok(artifactIds.has('art-rem-1'));
	console.log('PASS: turn artifactIds recoverable by messageId');

	// Scenario 2: another turn in the same conversation is isolated.
	const otherReceipt = makeReceipt({
		artifactId: 'art-other-1',
		kind: 'dataview',
		messageId: 'msg-turn-2',
		runId: 'run-turn-2',
		conversationId,
		projectId,
	});
	await saveReceipt(repo, otherReceipt);
	const secondTurn = await repo.listByMessage('msg-turn-2');
	assert.strictEqual(secondTurn.length, 1);
	assert.strictEqual(secondTurn[0].artifact_id, 'art-other-1');
	console.log('PASS: per-message queries isolate turns');

	// Scenario 3: conversation-scoped includes all 4; project-scoped agrees.
	const byConv = await repo.listByConversation(conversationId);
	assert.strictEqual(byConv.length, 4);
	const byProject = await repo.listByProject(projectId);
	assert.strictEqual(byProject.length, 4);
	console.log('PASS: conversation + project scoped queries return all turn receipts');

	// Scenario 4: kind-scoped scan filters the set.
	const reminderRows = await repo.listByKind('reminder');
	assert.strictEqual(reminderRows.length, 1);
	assert.strictEqual(reminderRows[0].artifact_id, 'art-rem-1');
	const dataviewRows = await repo.listByKind('dataview');
	assert.strictEqual(dataviewRows.length, 2);
	console.log('PASS: kind-scoped scan filters correctly');

	// Scenario 5: JSON round-trip preserves the new kinds.
	const raw = await repo.getById('art-rem-1');
	assert.ok(raw);
	const parsed = JSON.parse(raw!.receipt_json) as ChatArtifactReceipt;
	assert.strictEqual(parsed.kind, 'reminder');
	assert.strictEqual(parsed.artifactId, 'art-rem-1');
	console.log('PASS: reminder kind round-trips through sqlite JSON');

	sqlite.close();
	console.log('PASS: artifact-turn-association all scenarios');
}

void main().catch((err) => {
	console.error('FAIL: artifact-turn-association', err);
	process.exit(1);
});
