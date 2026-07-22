// MediaGenerationService end-to-end (in-memory adapters + sqlite). Verifies
// the full pipeline task-c1 §R5 promises: preflight → job → adapter →
// writer → ChatArtifactReceipt with route/model/jobId/cost extras.

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
import {
	MediaGenerationService,
	MediaPreflightError,
	makeChatArtifactReceiptSink,
} from '@/service/media/MediaGenerationService';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import type { MediaGenerationPort, MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { MediaReceiptExtras } from '@/core/types/media-generation';
import type { MediaUsageEmitter, MediaUsageEventInput } from '@/service/media/MediaUsageEmitter';

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

interface FakeAdapterOptions {
	configured?: boolean;
	supportedKinds?: readonly ('image' | 'video' | 'music' | 'tts')[];
	extension?: string;
	mimeType?: string;
	/** When set, generate() throws with this message (usage-failure tests). */
	generateError?: string;
}

function makeFakeAdapter(opts: FakeAdapterOptions = {}): MediaGenerationPort & { calls: MediaGenerationRequest[] } {
	const calls: MediaGenerationRequest[] = [];
	return {
		providerId: 'fal',
		calls,
		isConfigured: () => opts.configured ?? true,
		supportedKinds: () => opts.supportedKinds ?? ['tts', 'image', 'video', 'music'],
		async generate(req) {
			calls.push(req);
			if (opts.generateError) throw new Error(opts.generateError);
			return {
				kind: req.kind,
				bytes: new Uint8Array([1, 2, 3, 4, 5]),
				extension: opts.extension ?? 'png',
				mimeType: opts.mimeType ?? 'image/png',
				modelId: req.modelId ?? 'test/model',
				latencyMs: 42,
				providerRequestId: 'req-xyz',
				providerResponseUrl: 'https://queue.fal.run/requests/req-xyz/response',
			};
		},
	};
}

function makeWriter(): MediaAttachmentWriter & { written: Array<{ path: string; basename: string; extension: string; bytes: number }> } {
	const written: Array<{ path: string; basename: string; extension: string; bytes: number }> = [];
	return {
		written,
		async writeAttachment(input) {
			const path = `${input.attachmentFolder}/${input.basename}.${input.extension}`;
			written.push({ path, basename: input.basename, extension: input.extension, bytes: input.bytes.length });
			return { path };
		},
	};
}

interface Setup {
	raw: BetterSqlite3Database;
	receipts: ChatArtifactReceipt[];
	adapter: ReturnType<typeof makeFakeAdapter>;
	writer: ReturnType<typeof makeWriter>;
	svc: MediaGenerationService;
	jobService: MediaJobService;
	repo: ChatMediaJobRepo;
}

function setup(opts: { adapter?: FakeAdapterOptions; usageEmitter?: MediaUsageEmitter } = {}): Setup {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new ChatMediaJobRepo(db);
	const jobService = new MediaJobService(repo);
	const adapter = makeFakeAdapter(opts.adapter ?? {});
	const writer = makeWriter();
	const receipts: ChatArtifactReceipt[] = [];
	const sink = makeChatArtifactReceiptSink(async (r) => { receipts.push(r); });
	const svc = new MediaGenerationService({
		adapters: { fal: adapter },
		writer,
		jobService,
		receiptSink: sink,
		loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
		attachmentFolder: 'ChatFolder/Attachments/media',
		usageEmitter: opts.usageEmitter,
	});
	return { raw, receipts, adapter, writer, svc, jobService, repo };
}

async function testImageHappyPathWritesReceiptWithExtras() {
	const { svc, receipts, writer, repo } = setup();
	const outcome = await svc.produce({
		runId: 'run-1',
		conversationId: 'conv-1',
		messageId: 'msg-1',
		request: {
			kind: 'image',
			prompt: 'a mountain at sunset',
			route: 'fal',
			presetId: 'default',
			sourceHint: 'sunset',
		},
	});
	assert.strictEqual(receipts.length, 1);
	const receipt = receipts[0] as ChatArtifactReceipt & { media?: MediaReceiptExtras };
	assert.strictEqual(receipt.state, 'saved');
	assert.strictEqual(receipt.direction, 'generated');
	assert.strictEqual(receipt.kind, 'image');
	assert.strictEqual(receipt.runId, 'run-1');
	assert.strictEqual(receipt.conversationId, 'conv-1');
	assert.strictEqual(receipt.messageId, 'msg-1');
	assert.ok(receipt.media, 'receipt must carry media extras');
	assert.strictEqual(receipt.media!.executionRoute, 'fal');
	assert.strictEqual(receipt.media!.provider, 'fal');
	assert.strictEqual(receipt.media!.mediaKind, 'image');
	assert.strictEqual(receipt.media!.presetId, 'default');
	assert.strictEqual(receipt.media!.jobId, outcome.job.jobId);
	assert.strictEqual(receipt.media!.cost?.confidence, 'estimated');
	assert.strictEqual(writer.written.length, 1);
	assert.strictEqual(writer.written[0].extension, 'png');
	// Job should be completed and have the receipt id appended.
	const job = await repo.getById(outcome.job.jobId);
	assert.strictEqual(job?.state, 'completed');
	assert.deepStrictEqual(job?.receiptIds, [receipt.artifactId]);
	// F1 regression: providerResponseUrl must survive from adapter → completed job row.
	assert.strictEqual(job?.providerRequestId, 'req-xyz', 'providerRequestId persisted');
	assert.strictEqual(
		job?.providerResponseUrl,
		'https://queue.fal.run/requests/req-xyz/response',
		'providerResponseUrl persisted to completed job (was null before F1 fix)',
	);
	console.log('  ✓ image happy path → receipt with media extras + completed job + providerResponseUrl persisted');
}

async function testMissingFalKeyRaisesPreflightError() {
	const { svc } = setup({ adapter: { configured: false } });
	await assert.rejects(
		() => svc.produce({
			runId: 'r',
			request: {
				kind: 'image',
				prompt: 'x',
				route: 'fal',
				presetId: 'default',
			},
		}),
		(err) => err instanceof MediaPreflightError && err.preflight.state === 'needs-configuration',
		'preflight failure must surface as MediaPreflightError',
	);
	console.log('  ✓ preflight failure surfaces as MediaPreflightError');
}

async function testVideoWithoutConfirmationBlocks() {
	const { svc } = setup();
	await assert.rejects(
		() => svc.produce({
			runId: 'r',
			request: {
				kind: 'video',
				prompt: 'x',
				route: 'fal',
				presetId: 'default',
			},
		}),
		(err) => err instanceof MediaPreflightError && err.preflight.state === 'needs-confirmation',
	);
	console.log('  ✓ video without explicit confirmation is blocked');
}

async function testVideoWithBypassConfirmationProceeds() {
	const { svc, receipts, writer } = setup({
		adapter: { extension: 'mp4', mimeType: 'video/mp4' },
	});
	await svc.produce({
		runId: 'r',
		request: {
			kind: 'video',
			prompt: 'a train arriving',
			route: 'fal',
			presetId: 'default',
			sourceHint: 'train',
		},
	}, { bypassConfirmation: true });
	assert.strictEqual(receipts.length, 1);
	assert.strictEqual(writer.written[0].extension, 'mp4');
	assert.strictEqual((receipts[0] as any).media.mediaKind, 'video');
	console.log('  ✓ video with bypassConfirmation proceeds and writes video receipt');
}

async function testAdapterFailureMarksJobFailedAndBubbles() {
	const raw = new BetterSqlite3(':memory:');
	migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
	const db = makeKysely(raw);
	const repo = new ChatMediaJobRepo(db);
	const jobService = new MediaJobService(repo);
	const badAdapter: MediaGenerationPort = {
		providerId: 'fal',
		isConfigured: () => true,
		supportedKinds: () => ['image'],
		async generate() { throw new Error('provider exploded'); },
	};
	const writer = makeWriter();
	const receipts: ChatArtifactReceipt[] = [];
	const svc = new MediaGenerationService({
		adapters: { fal: badAdapter },
		writer,
		jobService,
		receiptSink: makeChatArtifactReceiptSink(async (r) => { receipts.push(r); }),
		loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
		attachmentFolder: 'x',
	});
	await assert.rejects(
		() => svc.produce({
			runId: 'r',
			request: { kind: 'image', prompt: 'x', route: 'fal', presetId: 'default' },
		}),
		/provider exploded/,
	);
	// No zombie: job should be marked failed.
	const jobs = await repo.listByState('failed');
	assert.strictEqual(jobs.length, 1, 'exactly one failed job');
	assert.strictEqual(jobs[0].error, 'provider exploded');
	assert.strictEqual(receipts.length, 0, 'no receipt persisted on adapter failure');
	console.log('  ✓ adapter failure → job.failed + no receipt written');
}

async function testTtsGoesThroughAudioKindNotMusic() {
	// Regression: TTS must NEVER be treated as music. The mediaKind extra
	// carries the distinction even though the ChatArtifactKind coalesces
	// to 'audio' for both.
	const { svc, receipts } = setup({
		adapter: { extension: 'mp3', mimeType: 'audio/mpeg' },
	});
	await svc.produce({
		runId: 'r',
		request: {
			kind: 'tts',
			prompt: 'hello world',
			route: 'fal',
			presetId: 'default',
			sourceHint: 'greeting',
		},
	});
	assert.strictEqual(receipts.length, 1);
	assert.strictEqual(receipts[0].kind, 'audio', 'ChatArtifactKind is audio for TTS');
	assert.strictEqual((receipts[0] as any).media.mediaKind, 'tts', 'mediaKind extras must say tts');
	console.log('  ✓ TTS routed as audio kind + mediaKind=tts (not music)');
}

// I-1: quantity in domain request threads through to adapter adapterRequest.quantity
async function testQuantityThreadsThroughToAdapter() {
	const { svc, adapter } = setup();
	await svc.produce({
		runId: 'run-q',
		request: {
			kind: 'image',
			prompt: 'mountain',
			route: 'fal',
			presetId: 'default',
			quantity: 3,
		},
	});
	assert.strictEqual(adapter.calls.length, 1);
	assert.strictEqual(adapter.calls[0].quantity, 3, 'quantity=3 must be forwarded to adapter');
	console.log('  ✓ quantity=3 in domain request threads through to adapter (I-1)');
}

async function testUsageEmitterRecordsSuccess() {
	// V1 §R2 — a successful sync run records ONE usage event carrying the
	// estimated-cost semantics (never presented as a settled bill).
	const events: MediaUsageEventInput[] = [];
	const { svc } = setup({ usageEmitter: { record: (e) => { events.push(e); } } });
	const outcome = await svc.produce({
		runId: 'run-u1',
		conversationId: 'conv-u1',
		request: { kind: 'image', prompt: 'usage test', route: 'fal', presetId: 'default' },
	});
	assert.strictEqual(events.length, 1);
	const ev = events[0];
	assert.strictEqual(ev.outcome, 'success');
	assert.strictEqual(ev.kind, 'image');
	assert.strictEqual(ev.route, 'fal');
	assert.strictEqual(ev.provider, 'fal');
	assert.strictEqual(ev.jobId, outcome.job.jobId);
	assert.strictEqual(ev.sessionId, 'conv-u1', 'sessionId prefers conversationId');
	assert.strictEqual(ev.runId, 'run-u1');
	assert.strictEqual(ev.costConfidence, 'estimated', 'cost must stay flagged as estimate');
	assert.ok(typeof ev.estimatedCostUsd === 'number');
	assert.strictEqual(ev.request.presetId, 'default');
	console.log('  ✓ success run records one usage event with estimated-cost semantics');
}

async function testUsageEmitterRecordsFailureWithReason() {
	const events: MediaUsageEventInput[] = [];
	const { svc } = setup({
		adapter: { generateError: 'provider exploded' },
		usageEmitter: { record: (e) => { events.push(e); } },
	});
	await assert.rejects(
		() => svc.produce({
			runId: 'run-u2',
			request: { kind: 'image', prompt: 'boom', route: 'fal', presetId: 'default' },
		}),
		/provider exploded/,
	);
	assert.strictEqual(events.length, 1);
	assert.strictEqual(events[0].outcome, 'failure');
	assert.strictEqual(events[0].errorMessage, 'provider exploded');
	assert.strictEqual(events[0].sessionId, 'run-u2', 'sessionId falls back to runId without a conversation');
	console.log('  ✓ failed run records a failure usage event with the error reason');
}

async function testMultipleOutputsFanOutToOneReceiptPerImage() {
	// Zero-gap §4 A3 — batch fan-out. When the adapter returns
	// `result.outputs` with 2 entries, the service writes one vault file +
	// one receipt PER output so each image can be reviewed / opened / used
	// as a later edit reference on its own. Job.receiptIds MUST hold both.
	const { svc, receipts, writer, repo } = setup();
	// Wrap the shipped fake adapter with an override that emits 2 outputs.
	const svcAny = svc as any;
	svcAny.deps.adapters.fal = {
		providerId: 'fal',
		isConfigured: () => true,
		supportedKinds: () => ['image'],
		async generate(req: any) {
			return {
				kind: 'image',
				bytes: new Uint8Array([1, 1, 1]),
				extension: 'png',
				mimeType: 'image/png',
				outputs: [
					{ bytes: new Uint8Array([1, 1, 1]), extension: 'png', mimeType: 'image/png' },
					{ bytes: new Uint8Array([2, 2, 2, 2]), extension: 'png', mimeType: 'image/png' },
				],
				modelId: req.modelId,
			};
		},
	};
	const outcome = await svc.produce({
		runId: 'run-fan',
		conversationId: 'conv-fan',
		messageId: 'msg-fan',
		request: {
			kind: 'image',
			prompt: 'two variants',
			route: 'fal',
			presetId: 'default',
			quantity: 2,
		},
	});
	assert.strictEqual(receipts.length, 2, '2 receipts persisted');
	assert.strictEqual(writer.written.length, 2, '2 vault files written');
	assert.strictEqual(outcome.writtenPaths.length, 2);
	assert.strictEqual(outcome.receipts.length, 2);
	const receiptIds = new Set(outcome.receipts.map((r) => r.artifactId));
	assert.strictEqual(receiptIds.size, 2, 'distinct receipt ids');
	// The completed job row should carry BOTH receiptIds so a resume
	// (or a later "list receipts for this job") sees every output.
	const finalJob = await repo.getById(outcome.job.jobId);
	assert.strictEqual(finalJob?.receiptIds.length, 2, `job.receiptIds must include every fan-out receipt (got: ${JSON.stringify(finalJob?.receiptIds)})`);
	for (const rid of outcome.receipts.map((r) => r.artifactId)) {
		assert.ok(finalJob!.receiptIds.includes(rid), `job.receiptIds contains ${rid}`);
	}
	console.log('  ✓ multi-output fan-out → 2 files, 2 receipts, both attached to job');
}

async function testUsageEmitterThrowingNeverBreaksRun() {
	// Contract: a broken telemetry sink must not fail media generation.
	const { svc, receipts } = setup({
		usageEmitter: { record: () => { throw new Error('sink down'); } },
	});
	await svc.produce({
		runId: 'run-u3',
		request: { kind: 'image', prompt: 'resilience', route: 'fal', presetId: 'default' },
	});
	assert.strictEqual(receipts.length, 1);
	assert.strictEqual(receipts[0].state, 'saved');
	console.log('  ✓ throwing usage emitter is swallowed — run still succeeds');
}

async function main() {
	await testImageHappyPathWritesReceiptWithExtras();
	await testMissingFalKeyRaisesPreflightError();
	await testVideoWithoutConfirmationBlocks();
	await testVideoWithBypassConfirmationProceeds();
	await testAdapterFailureMarksJobFailedAndBubbles();
	await testTtsGoesThroughAudioKindNotMusic();
	await testQuantityThreadsThroughToAdapter();
	await testUsageEmitterRecordsSuccess();
	await testUsageEmitterRecordsFailureWithReason();
	await testMultipleOutputsFanOutToOneReceiptPerImage();
	await testUsageEmitterThrowingNeverBreaksRun();
	console.log('media-generation-service: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
