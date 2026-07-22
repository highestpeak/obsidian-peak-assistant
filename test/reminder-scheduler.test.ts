/**
 * Chat Studio zero-gap Track D (2026-07-21) — ReminderSchedulerService.
 *
 * Uses a fake clock + fake ReminderReceiptSource so we can prove:
 *   1. A pending reminder fires exactly once when its dueIso passes.
 *   2. After firing, the receipt flips to `state: 'saved'` and the same
 *      reminder is NOT fired again on the next tick (idempotence).
 *   3. Future-dated reminders do NOT fire early.
 *   4. Malformed reminders (bad preview + missing vaultPath) are skipped
 *      rather than firing spurious notices.
 *   5. Errors in the receipt source are surfaced via onError instead of
 *      taking down the poll loop.
 *
 * PASS: markers per scenario.
 */

import assert from 'assert';
import {
	ReminderSchedulerService,
	type ReminderReceiptSource,
} from '@/service/chat/reminders/ReminderSchedulerService';
import type { NotifierPort } from '@/core/ports/NotifierPort';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

class NoopWriter implements ArtifactVaultWriterPort {
	files = new Map<string, string>();
	frontmatterCalls: Array<{ vaultPath: string; field: string; value: string }> = [];
	shouldThrowOnFrontmatter = false;
	async writeTextFile(folder: string, basename: string, ext: string, content: string): Promise<string> {
		const path = `${folder}/${basename}.${ext}`;
		this.files.set(path, content);
		return path;
	}
	async readTextFile(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}
	async modifyFrontmatterField(vaultPath: string, field: string, value: string): Promise<void> {
		this.frontmatterCalls.push({ vaultPath, field, value });
		if (this.shouldThrowOnFrontmatter) throw new Error('vault write failed');
	}
}

function makeSource(receipts: ChatArtifactReceipt[]): {
	source: ReminderReceiptSource;
	writes: ChatArtifactReceipt[];
} {
	const writes: ChatArtifactReceipt[] = [];
	return {
		source: {
			async listReminderReceipts() {
				return receipts;
			},
			async saveReceipt(receipt: ChatArtifactReceipt) {
				writes.push(receipt);
				// Reflect the write into the in-memory list so a second tick
				// sees the updated state.
				const idx = receipts.findIndex((r) => r.artifactId === receipt.artifactId);
				if (idx >= 0) receipts[idx] = receipt;
				else receipts.push(receipt);
			},
		},
		writes,
	};
}

function makeReminder(overrides: Partial<ChatArtifactReceipt>, dueIso: string): ChatArtifactReceipt {
	return {
		artifactId: 'art-r-1',
		runId: 'run-1',
		messageId: 'msg-1',
		conversationId: 'conv-1',
		direction: 'generated',
		kind: 'reminder',
		title: 'Ship it',
		state: 'ready',
		availableActions: ['open', 'copy'],
		preview: { kind: 'text', text: `Ship it — ${dueIso}` },
		createdAt: 0,
		...overrides,
	};
}

let noticeCount = 0;
const notifier: NotifierPort = {
	notify(_message: string, _duration?: number) {
		noticeCount += 1;
		return {
			setMessage() {},
			hide() {},
		};
	},
};

async function testFireOnceWhenDue(): Promise<void> {
	noticeCount = 0;
	let now = 1_700_000_000_000;
	const dueIso = new Date(now + 60_000).toISOString();
	const receipt = makeReminder({ vaultPath: 'ChatFolder/Artifacts/Reminders/ship-it.md' }, dueIso);
	const { source, writes } = makeSource([receipt]);
	const fired: ChatArtifactReceipt[] = [];
	const writer = new NoopWriter();
	const svc = new ReminderSchedulerService({
		source,
		writer,
		notifier,
		now: () => now,
		intervalMs: 30_000,
		onFire: (r) => fired.push(r),
	});

	// Not yet due — first tick fires nothing.
	await svc.tick();
	assert.strictEqual(noticeCount, 0, 'must not fire before due');
	assert.strictEqual(fired.length, 0);

	// Advance clock past due — next tick fires.
	now += 61_000;
	await svc.tick();
	assert.strictEqual(noticeCount, 1, 'exactly one notice fired');
	assert.strictEqual(fired.length, 1);
	assert.strictEqual(fired[0].state, 'saved', 'receipt flipped to saved');
	assert.strictEqual(writes.length, 1);
	// Frontmatter status flip is best-effort but MUST be attempted on fire.
	assert.strictEqual(writer.frontmatterCalls.length, 1, 'writer.modifyFrontmatterField called once');
	assert.deepStrictEqual(writer.frontmatterCalls[0], {
		vaultPath: 'ChatFolder/Artifacts/Reminders/ship-it.md',
		field: 'status',
		value: 'done',
	});

	// Third tick — receipt is now `saved`, must not re-fire.
	await svc.tick();
	assert.strictEqual(noticeCount, 1, 'no re-fire on saved receipt');
	console.log('PASS: reminder fires exactly once when due and idempotent afterward');
}

async function testFutureReminderDoesNotFire(): Promise<void> {
	noticeCount = 0;
	const now = 1_700_000_000_000;
	const futureIso = new Date(now + 60 * 60 * 1000).toISOString();
	const { source } = makeSource([makeReminder({ artifactId: 'art-r-future' }, futureIso)]);
	const svc = new ReminderSchedulerService({
		source,
		writer: new NoopWriter(),
		notifier,
		now: () => now,
	});
	await svc.tick();
	assert.strictEqual(noticeCount, 0, 'future reminder must not fire');
	console.log('PASS: future reminder skipped by tick');
}

async function testMalformedReminderSkipped(): Promise<void> {
	noticeCount = 0;
	const now = 1_700_000_000_000;
	const bad = makeReminder(
		{
			artifactId: 'art-r-bad',
			preview: { kind: 'text', text: 'no dash separator' },
			vaultPath: undefined,
		},
		'noise',
	);
	const { source } = makeSource([bad]);
	const svc = new ReminderSchedulerService({
		source,
		writer: new NoopWriter(),
		notifier,
		now: () => now,
	});
	await svc.tick();
	assert.strictEqual(noticeCount, 0, 'malformed reminder must not fire');
	console.log('PASS: malformed reminder skipped without notice');
}

async function testErrorRoutesToOnError(): Promise<void> {
	noticeCount = 0;
	const errors: unknown[] = [];
	const source: ReminderReceiptSource = {
		async listReminderReceipts() {
			throw new Error('sqlite down');
		},
		async saveReceipt() {},
	};
	const svc = new ReminderSchedulerService({
		source,
		writer: new NoopWriter(),
		notifier,
		onError: (e) => errors.push(e),
	});
	await svc.tick();
	assert.strictEqual(noticeCount, 0);
	assert.strictEqual(errors.length, 1);
	console.log('PASS: source errors routed to onError, loop stays alive');
}

async function testFrontmatterWriteFailureStillFlipsReceipt(): Promise<void> {
	noticeCount = 0;
	let now = 1_700_000_000_000;
	const dueIso = new Date(now - 60_000).toISOString();
	const receipt = makeReminder({
		artifactId: 'art-r-write-fail',
		vaultPath: 'ChatFolder/Artifacts/Reminders/broken.md',
	}, dueIso);
	const { source, writes } = makeSource([receipt]);
	const writer = new NoopWriter();
	writer.shouldThrowOnFrontmatter = true;
	const errors: unknown[] = [];
	const svc = new ReminderSchedulerService({
		source,
		writer,
		notifier,
		now: () => now,
		intervalMs: 30_000,
		onError: (e) => errors.push(e),
	});
	await svc.tick();
	// Receipt still moves to `saved` even though the writer threw.
	assert.strictEqual(noticeCount, 1, 'notice still fired');
	assert.strictEqual(writes.length, 1, 'receipt still persisted');
	assert.strictEqual(writes[0].state, 'saved', 'receipt flipped to saved despite writer failure');
	assert.ok(errors.length >= 1, 'writer error routed to onError');
	console.log('PASS: writer failure surfaced via onError but receipt still flips saved');
	void now;
}

async function testDoneReminderIgnored(): Promise<void> {
	noticeCount = 0;
	const now = 1_700_000_000_000;
	const dueIso = new Date(now - 60_000).toISOString();
	const done = makeReminder(
		{ artifactId: 'art-r-done', state: 'saved' },
		dueIso,
	);
	const { source } = makeSource([done]);
	const svc = new ReminderSchedulerService({
		source,
		writer: new NoopWriter(),
		notifier,
		now: () => now,
	});
	await svc.tick();
	assert.strictEqual(noticeCount, 0, 'saved reminder must not re-fire');
	console.log('PASS: already-done reminder ignored');
}

(async () => {
	await testFireOnceWhenDue();
	await testFutureReminderDoesNotFire();
	await testMalformedReminderSkipped();
	await testErrorRoutesToOnError();
	await testFrontmatterWriteFailureStillFlipsReceipt();
	await testDoneReminderIgnored();
	console.log('PASS: reminder-scheduler all scenarios');
})().catch((err) => {
	console.error('FAIL: reminder-scheduler', err);
	process.exit(1);
});
