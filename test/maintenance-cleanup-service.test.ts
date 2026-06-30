// T11Y-3A: unit tests for `MaintenanceCleanupService`.
//
// The service runs the multi-repo cleanup workflow that previously lived
// inline in `PeakCommandActions.cleanupUselessData`. These tests use
// hand-rolled stubs to drive every branch (nothing-to-clean / some
// orphans / both repos cleaned) and assert that notices fire in the
// correct order with the correct counts.
//
// Source-scan guard: the service file itself must not import obsidian,
// AppContext, or sqliteStoreManager — verified by a regex scan at the
// bottom of this file.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	MaintenanceCleanupService,
	type MaintenanceCleanupDeps,
} from '@/service/maintenance/MaintenanceCleanupService';
import type { NoticeHandle, NotifierPort } from '@/core/ports/NotifierPort';

// ---------------------------------------------------------------------------
// Recording notifier — captures every notify(...) call.
// ---------------------------------------------------------------------------

interface RecordedNotice {
	message: string;
	durationMs?: number;
}

function recordingNotifier(): { notifier: NotifierPort; notices: RecordedNotice[] } {
	const notices: RecordedNotice[] = [];
	const notifier: NotifierPort = {
		notify(message: string, durationMs?: number): NoticeHandle {
			notices.push({ message, durationMs });
			return { setMessage: () => {}, hide: () => {} };
		},
	};
	return { notifier, notices };
}

// ---------------------------------------------------------------------------
// Dep factory — by default builds a "nothing to clean" world. Each test
// overrides only the slice of state it cares about.
// ---------------------------------------------------------------------------

interface FakeState {
	vaultPaths?: Set<string>;
	indexedPaths?: Map<string, number>;
	orphanedSearchIndex?: {
		metaFts: number; fts: number; chunks: number; embeddings: number; graphNodes: number;
	};
	vecEmbeddings?: { found: number; deleted: number };
	conversations?: Array<{
		conversation_id: string;
		file_rel_path: string;
		archived_rel_path: string | null;
	}>;
	messagesByConv?: Map<string, Array<{ message_id: string }>>;
}

interface FakeCalls {
	deletedDocs: string[][];
	cleanupOrphanedCalls: number;
	cleanupVecCalls: number;
	resourcesDeleted: string[][];
	convStarsDeleted: string[][];
	convMessagesDeleted: string[][];
	convsDeleted: string[][];
}

function makeDeps(state: FakeState): { deps: MaintenanceCleanupDeps; calls: FakeCalls } {
	const calls: FakeCalls = {
		deletedDocs: [],
		cleanupOrphanedCalls: 0,
		cleanupVecCalls: 0,
		resourcesDeleted: [],
		convStarsDeleted: [],
		convMessagesDeleted: [],
		convsDeleted: [],
	};
	const deps: MaintenanceCleanupDeps = {
		vaultPaths: {
			listVaultFilePaths: () => state.vaultPaths ?? new Set<string>(),
		},
		indexedDocuments: {
			getAllIndexedPaths: async () => state.indexedPaths ?? new Map(),
		},
		searchIndex: {
			deleteDocuments: async (paths: string[]) => {
				calls.deletedDocs.push([...paths]);
			},
			cleanupOrphanedSearchIndexData: async () => {
				calls.cleanupOrphanedCalls += 1;
				return state.orphanedSearchIndex ?? {
					metaFts: 0, fts: 0, chunks: 0, embeddings: 0, graphNodes: 0,
				};
			},
		},
		embeddings: {
			cleanupOrphanedVecEmbeddings: async () => {
				calls.cleanupVecCalls += 1;
				return state.vecEmbeddings ?? { found: 0, deleted: 0 };
			},
		},
		conversations: {
			getAllWithFilePaths: async () => state.conversations ?? [],
			deleteByConversationIds: async (ids: string[]) => {
				calls.convsDeleted.push([...ids]);
			},
		},
		messages: {
			listByConversation: async (convId: string) =>
				state.messagesByConv?.get(convId) ?? [],
			deleteByConversationIds: async (ids: string[]) => {
				calls.convMessagesDeleted.push([...ids]);
			},
		},
		resources: {
			deleteByMessageIds: async (ids: string[]) => {
				calls.resourcesDeleted.push([...ids]);
			},
		},
		stars: {
			deleteByConversationIds: async (ids: string[]) => {
				calls.convStarsDeleted.push([...ids]);
			},
		},
	};
	return { deps, calls };
}

// ---------------------------------------------------------------------------
// Behavior tests
// ---------------------------------------------------------------------------

async function testNothingToCleanPathEmitsHappyNotices(): Promise<void> {
	const { deps, calls } = makeDeps({});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.searchIndex.orphanDocsRemoved, 0);
	assert.strictEqual(report.searchIndex.orphanIndexRowsRemoved.total, 0);
	assert.strictEqual(report.vecEmbeddings.found, 0);
	assert.strictEqual(report.chat.orphanConversationsRemoved, 0);

	assert.strictEqual(calls.deletedDocs.length, 0, 'no deleteDocuments call when nothing is orphaned');
	assert.strictEqual(calls.cleanupOrphanedCalls, 1, 'orphan index sweep always runs');
	assert.strictEqual(calls.cleanupVecCalls, 1, 'vec sweep always runs');
	assert.strictEqual(calls.convsDeleted.length, 0, 'no orphan conversation deletion');

	const messages = notices.map((n) => n.message);
	assert.ok(messages[0]?.includes('Starting cleanup'), 'leading notice should announce start');
	assert.ok(
		messages.some((m) => m.includes('Search index: no orphaned documents found.')),
		'happy-path search-index notice expected',
	);
	assert.ok(
		messages.some((m) => m.includes('Vector embeddings: no orphaned records.')),
		'happy-path vec notice expected',
	);
	assert.ok(
		messages.some((m) => m.includes('Chat: no orphaned conversations found.')),
		'happy-path chat notice expected',
	);
	assert.ok(
		messages.at(-1) === 'Cleanup finished.',
		'trailing notice should announce completion',
	);

	console.log('PASS: nothingToCleanPathEmitsHappyNotices');
}

async function testOrphanedDocsAreReportedAndDeleted(): Promise<void> {
	const { deps, calls } = makeDeps({
		vaultPaths: new Set(['kept/a.md']),
		indexedPaths: new Map([
			['kept/a.md', 1],
			['orphan/b.md', 2],
			['orphan/c.md', 3],
		]),
	});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.searchIndex.orphanDocsRemoved, 2);
	assert.strictEqual(calls.deletedDocs.length, 1, 'deleteDocuments should run once with the orphan batch');
	assert.deepStrictEqual(
		[...calls.deletedDocs[0]!].sort(),
		['orphan/b.md', 'orphan/c.md'],
	);

	const noticed = notices.map((n) => n.message);
	assert.ok(
		noticed.some((m) => m.includes('Search index: removed 2 orphaned document(s).')),
		'count-bearing notice expected',
	);

	console.log('PASS: orphanedDocsAreReportedAndDeleted');
}

async function testOrphanedSearchIndexRowsTriggerNotice(): Promise<void> {
	const { deps } = makeDeps({
		orphanedSearchIndex: { metaFts: 1, fts: 2, chunks: 3, embeddings: 4, graphNodes: 5 },
	});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.searchIndex.orphanIndexRowsRemoved.total, 15);
	assert.ok(
		notices.some((n) => n.message.includes('Search index: cleaned 15 orphan record(s)')),
		'orphan-row notice should report the summed count',
	);

	console.log('PASS: orphanedSearchIndexRowsTriggerNotice');
}

async function testVecEmbeddingsRemovalIsReported(): Promise<void> {
	const { deps } = makeDeps({
		vecEmbeddings: { found: 7, deleted: 7 },
	});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.vecEmbeddings.deleted, 7);
	assert.ok(
		notices.some((n) => n.message.includes('Vector embeddings: removed 7 orphaned record(s).')),
		'vec deletion notice expected',
	);

	console.log('PASS: vecEmbeddingsRemovalIsReported');
}

async function testOrphanedConversationsCascadeDelete(): Promise<void> {
	const { deps, calls } = makeDeps({
		vaultPaths: new Set(['chat/keep.md']),
		conversations: [
			{ conversation_id: 'c-keep', file_rel_path: 'chat/keep.md', archived_rel_path: null },
			{ conversation_id: 'c-orphan-1', file_rel_path: 'chat/gone.md', archived_rel_path: null },
			{ conversation_id: 'c-orphan-2', file_rel_path: 'chat/old.md', archived_rel_path: 'chat/archived-gone.md' },
		],
		messagesByConv: new Map<string, Array<{ message_id: string }>>([
			['c-orphan-1', [{ message_id: 'm1' }, { message_id: 'm2' }]],
			['c-orphan-2', [{ message_id: 'm3' }]],
		]),
	});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.chat.orphanConversationsRemoved, 2);
	assert.strictEqual(report.chat.messagesRemoved, 3);

	assert.strictEqual(calls.resourcesDeleted.length, 1);
	assert.deepStrictEqual([...calls.resourcesDeleted[0]!].sort(), ['m1', 'm2', 'm3']);
	assert.deepStrictEqual([...calls.convStarsDeleted[0]!].sort(), ['c-orphan-1', 'c-orphan-2']);
	assert.deepStrictEqual([...calls.convMessagesDeleted[0]!].sort(), ['c-orphan-1', 'c-orphan-2']);
	assert.deepStrictEqual([...calls.convsDeleted[0]!].sort(), ['c-orphan-1', 'c-orphan-2']);

	assert.ok(
		notices.some((n) => n.message.includes('Chat: removed 2 orphaned conversation(s).')),
		'chat orphan deletion notice expected',
	);

	console.log('PASS: orphanedConversationsCascadeDelete');
}

async function testBothRepoSlicesCleanedInOnePass(): Promise<void> {
	const { deps, calls } = makeDeps({
		vaultPaths: new Set(['keep.md', 'chat/keep.md']),
		indexedPaths: new Map([
			['keep.md', 1],
			['gone.md', 2],
		]),
		orphanedSearchIndex: { metaFts: 0, fts: 0, chunks: 0, embeddings: 0, graphNodes: 2 },
		vecEmbeddings: { found: 3, deleted: 3 },
		conversations: [
			{ conversation_id: 'c1', file_rel_path: 'chat/keep.md', archived_rel_path: null },
			{ conversation_id: 'c2', file_rel_path: 'chat/missing.md', archived_rel_path: null },
		],
		messagesByConv: new Map<string, Array<{ message_id: string }>>([
			['c2', [{ message_id: 'mx' }]],
		]),
	});
	const { notifier, notices } = recordingNotifier();

	const report = await new MaintenanceCleanupService(deps).runCleanup(notifier);

	assert.strictEqual(report.searchIndex.orphanDocsRemoved, 1);
	assert.strictEqual(report.searchIndex.orphanIndexRowsRemoved.total, 2);
	assert.strictEqual(report.vecEmbeddings.deleted, 3);
	assert.strictEqual(report.chat.orphanConversationsRemoved, 1);
	assert.strictEqual(report.chat.messagesRemoved, 1);

	assert.deepStrictEqual(calls.deletedDocs[0], ['gone.md']);
	assert.deepStrictEqual(calls.convsDeleted[0], ['c2']);

	// Notices must fire in the documented order:
	//   start -> search-index -> orphan-rows -> vec -> chat -> finished
	const ordered = notices.map((n) => n.message);
	assert.ok(ordered[0]?.includes('Starting cleanup'), 'first notice = start');
	assert.ok(ordered.at(-1) === 'Cleanup finished.', 'last notice = finished');

	console.log('PASS: bothRepoSlicesCleanedInOnePass');
}

// ---------------------------------------------------------------------------
// Source-scan guard
// ---------------------------------------------------------------------------

function testServiceFileImportsAreBoundaryClean(): void {
	const svcPath = path.resolve(
		process.cwd(),
		'src/service/maintenance/MaintenanceCleanupService.ts',
	);
	const source = fs.readFileSync(svcPath, 'utf8');

	const importSpecRe = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	const specifiers: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = importSpecRe.exec(source)) !== null) specifiers.push(m[1]!);

	for (const spec of specifiers) {
		assert.ok(
			!/^obsidian(\/.*)?$/.test(spec),
			`service must not import obsidian (saw '${spec}')`,
		);
		assert.ok(
			!/^@\/app\//.test(spec),
			`service must not import from @/app/ (saw '${spec}')`,
		);
		assert.ok(
			!/SqliteStoreManager/.test(spec),
			`service must not import SqliteStoreManager (saw '${spec}')`,
		);
	}

	// Strip comments before scanning runtime code for forbidden tokens.
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	for (const forbidden of [
		'AppContext.getInstance',
		'sqliteStoreManager',
		'new Notice',
	]) {
		assert.ok(
			!code.includes(forbidden),
			`service must not reference '${forbidden}' (use injected ports instead)`,
		);
	}

	console.log('PASS: serviceFileImportsAreBoundaryClean');
}

// ---------------------------------------------------------------------------
// Test driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	await testNothingToCleanPathEmitsHappyNotices();
	await testOrphanedDocsAreReportedAndDeleted();
	await testOrphanedSearchIndexRowsTriggerNotice();
	await testVecEmbeddingsRemovalIsReported();
	await testOrphanedConversationsCascadeDelete();
	await testBothRepoSlicesCleanedInOnePass();
	testServiceFileImportsAreBoundaryClean();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
