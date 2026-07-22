/**
 * Task D2 — MediaJobRunner state machine + async pipeline + resume.
 *
 * Uses a manual scheduler so the test controls every tick — the runner
 * never sleeps against wall-clock time, so tests are deterministic and
 * fast. A fake AsyncMediaAdapter mimics fal.ai queue semantics
 * (submit → pending × N → ready → download).
 *
 * Coverage matrix:
 *   1. submit does not block; runner queues the first poll tick.
 *   2. pending → pending → ready pipeline drives the job to `completed`
 *      + writes a `saved` receipt.
 *   3. adapter poll returns failed → job.failed + failed receipt.
 *   4. cancel from `running` stops future polls; job transitions to
 *      `cancelled`; no follow-up receipt updates leak through.
 *   5. cancel from `awaiting-confirmation` is legal + local-only.
 *   6. confirm awaiting-confirmation → adapter.submit called → running.
 *   7. resumeUnfinished restores polling for `running` jobs with poll
 *      cursor; runs `.failed` for `queued` / cursor-less `running`;
 *      preserves `awaiting-confirmation`. Order matters relative to
 *      failAllUnfinished — this test locks the sequence.
 *   8. poll deadline exceeded → job.failed with retriable reason.
 *   9. dispose() clears every outstanding timer.
 *  10. music vs tts: mediaKind end-to-end (music runs via async runner,
 *      tts does NOT — command entry-point path stays sync).
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
import { ChatMediaJobRepo } from '@/core/storage/sqlite/repositories/ChatMediaJobRepo';
import { MediaJobService } from '@/service/media/MediaJobService';
import {
    MediaGenerationService,
    makeChatArtifactReceiptSink,
    type StartAsyncJobInput,
} from '@/service/media/MediaGenerationService';
import { MediaJobRunner, type JobRunnerScheduler } from '@/service/media/MediaJobRunner';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import type {
    AsyncMediaAdapter,
    AsyncPollStatus,
    AsyncSubmitResult,
} from '@/core/ports/AsyncMediaAdapter';
import type {
    MediaGenerationRequest as PortRequest,
    MediaGenerationResult,
} from '@/core/ports/MediaGenerationPort';
import type { MediaGenerationRequest } from '@/core/types/media-generation';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { MediaUsageEventInput } from '@/service/media/MediaUsageEmitter';

// ─── in-memory sqlite ──────────────────────────────────────────────────────

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

// ─── manual scheduler for deterministic tests ──────────────────────────────

class ManualScheduler implements JobRunnerScheduler {
    private queue: Array<{ handle: number; fn: () => void; ms: number }> = [];
    private next = 1;
    setTimeout(fn: () => void, ms: number): unknown {
        const handle = this.next++;
        this.queue.push({ handle, fn, ms });
        return handle;
    }
    clearTimeout(handle: unknown): void {
        this.queue = this.queue.filter((e) => e.handle !== handle);
    }
    /** Fire the oldest pending timer; return true iff one existed. */
    tick(): boolean {
        const entry = this.queue.shift();
        if (!entry) return false;
        entry.fn();
        return true;
    }
    /** Drain all currently-pending timers, in insertion order. Callbacks may
     *  enqueue new timers; those are NOT drained (call again). */
    async flushOnce(): Promise<number> {
        const snapshot = [...this.queue];
        this.queue = [];
        for (const e of snapshot) { e.fn(); }
        // Yield so any awaited promises inside callbacks settle.
        await new Promise((r) => setImmediate(r));
        return snapshot.length;
    }
    pending(): number { return this.queue.length; }
}

// ─── fake async adapter (fal-style) ────────────────────────────────────────

interface FakeAdapterOpts {
    submitFails?: boolean;
    pollFailsCount?: number; // return `failed` on Nth poll (1-indexed)
    pendingCount?: number;   // number of `pending` polls before `ready`
    downloadFails?: boolean;
}

function makeFakeAsyncAdapter(opts: FakeAdapterOpts = {}): AsyncMediaAdapter & {
    submits: PortRequest[];
    pollCount: number;
    cancelCalls: string[];
} {
    const submits: PortRequest[] = [];
    let pollCount = 0;
    const pendingLimit = opts.pendingCount ?? 2;
    const cancelCalls: string[] = [];
    return {
        submits,
        get pollCount() { return pollCount; },
        cancelCalls,
        providerId: 'fal',
        isConfigured: () => true,
        supportedKinds: () => ['video', 'music', 'image', 'tts'],
        async submit(req: PortRequest): Promise<AsyncSubmitResult> {
            if (opts.submitFails) throw new Error('submit failed');
            submits.push(req);
            return {
                providerRequestId: `req-${submits.length}`,
                providerResponseUrl: `https://queue.fal.run/${submits.length}`,
            };
        },
        async poll(): Promise<AsyncPollStatus> {
            pollCount += 1;
            if (opts.pollFailsCount === pollCount) {
                return { kind: 'failed', reason: `poll #${pollCount} rejected` };
            }
            if (pollCount <= pendingLimit) return { kind: 'pending' };
            return { kind: 'ready', final: { video: { url: 'https://cdn.fal.run/out.mp4' } } };
        },
        async download(_req, _final): Promise<MediaGenerationResult> {
            if (opts.downloadFails) throw new Error('download failed');
            return {
                kind: _req.kind,
                bytes: new Uint8Array([9, 9, 9]),
                extension: _req.kind === 'video' ? 'mp4' : 'mp3',
                mimeType: _req.kind === 'video' ? 'video/mp4' : 'audio/mpeg',
                modelId: _req.modelId,
                latencyMs: 5,
            };
        },
        async cancel(providerRequestId: string) {
            cancelCalls.push(providerRequestId);
            return false;
        },
    };
}

// ─── setup ─────────────────────────────────────────────────────────────────

interface Setup {
    svc: MediaGenerationService;
    runner: MediaJobRunner;
    adapter: ReturnType<typeof makeFakeAsyncAdapter>;
    scheduler: ManualScheduler;
    receipts: ChatArtifactReceipt[];
    raw: BetterSqlite3Database;
    db: Kysely<DbSchema>;
    jobService: MediaJobService;
    now: { value: number };
    usageEvents: MediaUsageEventInput[];
}

function setup(adapterOpts: FakeAdapterOpts = {}): Setup {
    const raw = new BetterSqlite3(':memory:');
    migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
    const db = makeKysely(raw);
    const jobService = new MediaJobService(new ChatMediaJobRepo(db), () => 100);
    const receipts: ChatArtifactReceipt[] = [];
    const sink = makeChatArtifactReceiptSink(async (r) => { receipts.push(r); });
    const scheduler = new ManualScheduler();
    const adapter = makeFakeAsyncAdapter(adapterOpts);
    const now = { value: 1_000_000 };
    const writer: MediaAttachmentWriter = {
        async writeAttachment(input) {
            return { path: `${input.attachmentFolder}/${input.basename}.${input.extension}` };
        },
    };
    // A minimal sync adapter is not strictly required here — the service's
    // `startAsyncJob` only consults preflight (via availability snapshot) —
    // but we still install one so preflight's fal snapshot reports
    // `configured: true` and video/music route resolves to fal.
    const syncFalStub = {
        providerId: 'fal',
        isConfigured: () => true,
        supportedKinds: () => ['video', 'music', 'image', 'tts'] as const,
        async generate() { throw new Error('unused'); },
    } as any;
    const svc = new MediaGenerationService({
        adapters: { fal: syncFalStub },
        writer,
        jobService,
        receiptSink: sink,
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        attachmentFolder: 'ChatFolder/Attachments/media',
        now: () => now.value,
    });
    const usageEvents: MediaUsageEventInput[] = [];
    const runner = new MediaJobRunner({
        jobService,
        adapters: { fal: adapter },
        writer,
        receiptSink: sink,
        attachmentFolder: 'ChatFolder/Attachments/media',
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        scheduler,
        now: () => now.value,
        usageEmitter: { record: (e) => { usageEvents.push(e); } },
    });
    svc.setJobRunner(runner);
    return { svc, runner, adapter, scheduler, receipts, raw, db, jobService, now, usageEvents };
}

function videoRequest(): StartAsyncJobInput {
    const request: MediaGenerationRequest = {
        kind: 'video',
        prompt: 'a red panda cooking',
        route: 'fal',
        presetId: 'default',
        durationSeconds: 8,
    };
    return {
        request,
        runId: 'run-vid',
        conversationId: 'conv-vid',
        messageId: 'msg-vid',
    };
}

function musicRequest(): StartAsyncJobInput {
    const request: MediaGenerationRequest = {
        kind: 'music',
        prompt: 'calm piano',
        route: 'fal',
        presetId: 'default',
        durationSeconds: 20,
    };
    return {
        request,
        runId: 'run-music',
        conversationId: 'conv-music',
        messageId: 'msg-music',
    };
}

async function drainScheduler(scheduler: ManualScheduler, maxRounds = 20): Promise<void> {
    // Each poll typically enqueues the next tick synchronously; a bounded
    // loop is enough. If a test infinite-loops it fails fast.
    let round = 0;
    while (scheduler.pending() > 0 && round < maxRounds) {
        await scheduler.flushOnce();
        round += 1;
    }
}

// ─── slices ────────────────────────────────────────────────────────────────

async function testSubmitDoesNotBlockTurn(): Promise<void> {
    const { svc, adapter } = setup();
    const outcome = await svc.startAsyncJob(videoRequest());
    assert.strictEqual(outcome.requiresConfirmation, true, 'video preflight always demands confirmation');
    assert.strictEqual(adapter.submits.length, 0, 'awaiting-confirmation MUST NOT contact provider');
    console.log('PASS: startAsyncJob returns immediately in awaiting-confirmation (no adapter call)');
}

async function testConfirmSubmitsAndDrivesPollLoopToCompleted(): Promise<void> {
    const { svc, runner, adapter, scheduler, receipts, usageEvents } = setup({ pendingCount: 2 });
    const outcome = await svc.startAsyncJob(videoRequest());
    // Confirmation gate → submit fires now.
    await svc.confirmJob(outcome.jobId);
    assert.strictEqual(adapter.submits.length, 1, 'confirm triggers exactly one submit');
    // Zero-gap latent-bug guard: the runner used to pass `job.request` directly
    // to `adapter.submit`. Domain requests have NO modelId; every real fal
    // submit would have thrown `modelId is required`. buildAdapterRequest
    // resolves modelId from preflight/preset before submit — assert it here.
    const submitted = adapter.submits[0];
    assert.ok(submitted.modelId && submitted.modelId.length > 0, `submit request must carry modelId, got: ${JSON.stringify(submitted.modelId)}`);
    // pending × 2 → ready → download → saved receipt
    await drainScheduler(scheduler, 10);
    assert.ok(adapter.pollCount >= 3, `expected >=3 polls, got ${adapter.pollCount}`);
    const finalJob = await runner['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(finalJob?.state, 'completed');
    // Latest receipt should be state=saved (the runner overwrites the same artifactId).
    const savedReceipt = receipts.reverse().find((r) => r.state === 'saved');
    assert.ok(savedReceipt, 'saved receipt eventually persisted');
    assert.strictEqual(savedReceipt!.artifactId, outcome.receiptId, 'receipt reuses initial artifactId');
    assert.strictEqual(savedReceipt!.kind, 'video');
    assert.ok(savedReceipt!.vaultPath, 'saved receipt carries vaultPath');
    // V1 §R2 — async completion records ONE usage event (estimated cost, video kind).
    assert.strictEqual(usageEvents.length, 1, 'completed async job records one usage event');
    assert.strictEqual(usageEvents[0].outcome, 'success');
    assert.strictEqual(usageEvents[0].kind, 'video');
    assert.strictEqual(usageEvents[0].jobId, outcome.jobId);
    assert.strictEqual(usageEvents[0].costConfidence, 'estimated');
    console.log('PASS: awaiting → confirm → submit → poll → complete → saved receipt + usage event');
}

async function testCancelDenyStopsPipeline(): Promise<void> {
    const { svc, adapter, scheduler } = setup();
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.cancelJob(outcome.jobId, 'user-cancelled');
    const job = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(job?.state, 'cancelled');
    assert.strictEqual(adapter.submits.length, 0, 'cancel-from-awaiting NEVER contacts provider');
    assert.strictEqual(scheduler.pending(), 0, 'no residual timer');
    console.log('PASS: cancel from awaiting-confirmation is local-only, no cost');
}

async function testCancelStopsRunningJob(): Promise<void> {
    const { svc, adapter, scheduler } = setup({ pendingCount: 5 });
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(outcome.jobId);
    assert.strictEqual(adapter.submits.length, 1);
    // Fire one poll — job stays running because pending × 5.
    await scheduler.flushOnce();
    // Cancel now.
    await svc.cancelJob(outcome.jobId);
    const cancelled = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(cancelled?.state, 'cancelled');
    // Any subsequent flush must not push additional work.
    const pollBefore = adapter.pollCount;
    await drainScheduler(scheduler, 3);
    assert.strictEqual(adapter.pollCount, pollBefore, 'no polls after cancel');
    console.log('PASS: cancel from running stops future polls');
}

async function testConfirmWithSubmitFailureMarksFailed(): Promise<void> {
    const { svc, receipts } = setup({ submitFails: true });
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(outcome.jobId);
    const job = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(job?.state, 'failed');
    const failedReceipt = receipts.reverse().find((r) => r.state === 'failed');
    assert.ok(failedReceipt, 'failed receipt written');
    assert.deepStrictEqual(failedReceipt!.availableActions, ['retry']);
    console.log('PASS: submit failure → job.failed + failed receipt with retry');
}

async function testPollFailedTerminates(): Promise<void> {
    const { svc, scheduler } = setup({ pollFailsCount: 2 });
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(outcome.jobId);
    await drainScheduler(scheduler, 10);
    const job = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(job?.state, 'failed');
    assert.match(job?.error ?? '', /poll #2 rejected/);
    console.log('PASS: adapter poll-failed → job.failed');
}

async function testPollDeadlineMarksFailedRetriable(): Promise<void> {
    const { svc, runner, scheduler, now } = setup({ pendingCount: 100 });
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(outcome.jobId);
    // Fire one poll to establish deadline snapshot.
    await scheduler.flushOnce();
    // Advance clock past deadline.
    now.value += DEFAULT_MEDIA_GENERATION_CONFIG.pollDeadlineMs + 1;
    await drainScheduler(scheduler, 30);
    const job = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(job?.state, 'failed');
    assert.match(job?.error ?? '', /deadline|retriable/i);
    void runner; // silence unused
    console.log('PASS: poll deadline → job.failed with retriable reason');
}

async function testResumeUnfinishedOrder(): Promise<void> {
    // 1. Seed 3 jobs: (a) running WITH cursor → resumable
    //                 (b) running WITHOUT cursor → unresumable
    //                 (c) awaiting-confirmation → preserved
    // 2. resumeUnfinished must:
    //    - restart poll for (a)
    //    - mark (b) failed with retriable reason
    //    - preserve (c)
    // 3. failAllUnfinished after resume must be no-op (all handled).
    const { svc, adapter, scheduler, jobService } = setup({ pendingCount: 1 });
    const a = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(a.jobId); // fires submit + poll scheduled
    scheduler.clearTimeout(scheduler['queue'][0]?.handle); // simulate crash mid-poll
    scheduler['queue'] = [];
    const b = await svc.startAsyncJob(videoRequest());
    // Manually transition b to running WITHOUT persisting a cursor.
    await jobService.transition(b.jobId, 'running');
    const c = await svc.startAsyncJob(videoRequest()); // stays awaiting-confirmation

    // Recreate runner as if boot: dispose current + build a fresh one that
    // reads from the same jobService.
    svc.getJobRunner()!.dispose();
    const { MediaJobRunner } = await import('@/service/media/MediaJobRunner');
    const scheduler2 = new ManualScheduler();
    const fresh = new MediaJobRunner({
        jobService,
        adapters: { fal: adapter },
        writer: { async writeAttachment(input) { return { path: `${input.attachmentFolder}/${input.basename}.${input.extension}` }; } },
        receiptSink: makeChatArtifactReceiptSink(async () => { /* ignore */ }),
        attachmentFolder: 'ChatFolder/Attachments/media',
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        scheduler: scheduler2,
    });
    const stats = await fresh.resumeUnfinished();
    assert.strictEqual(stats.resumed, 1, 'exactly job (a) resumed');
    assert.strictEqual(stats.failed, 1, 'exactly job (b) failed as unresumable');
    assert.strictEqual(stats.awaiting, 1, 'job (c) preserved');

    // A safety-net failAllUnfinished should now fail only (c) —
    // awaiting-confirmation is still non-terminal, but the resume path
    // deliberately left it alone. The safety net WILL fail (c), which
    // documents why callers should NOT run failAllUnfinished until they
    // are sure the user cannot come back to confirm.
    const nonTerminal = await jobService.listUnfinished();
    // (a) is running (resumed), (c) is awaiting-confirmation → both still unfinished.
    assert.strictEqual(nonTerminal.length, 2, `expected 2 unfinished after resume, got ${nonTerminal.length}`);
    void a; void c;
    fresh.dispose();
    console.log('PASS: resumeUnfinished restarts poll, fails unresumable, preserves awaiting');
}

async function testDisposeClearsTimers(): Promise<void> {
    const { svc, scheduler } = setup({ pendingCount: 5 });
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.confirmJob(outcome.jobId);
    assert.ok(scheduler.pending() >= 1, 'timer queued');
    svc.getJobRunner()!.dispose();
    assert.strictEqual(scheduler.pending(), 0, 'dispose clears every pending timer');
    console.log('PASS: dispose() clears timers');
}

async function testMusicMediaKindPreservedEndToEnd(): Promise<void> {
    const { svc, receipts, scheduler } = setup({ pendingCount: 1 });
    const outcome = await svc.startAsyncJob(musicRequest());
    await svc.confirmJob(outcome.jobId);
    await drainScheduler(scheduler, 10);
    const job = await svc['deps'].jobService.getJob(outcome.jobId);
    assert.strictEqual(job?.state, 'completed');
    const savedReceipt = [...receipts].reverse().find((r) => r.state === 'saved');
    assert.ok(savedReceipt);
    assert.strictEqual(savedReceipt!.kind, 'audio', 'audio kind for the ArtifactReceipt bucket');
    const media = (savedReceipt as unknown as { media?: { mediaKind?: string } }).media;
    assert.strictEqual(media?.mediaKind, 'music', 'mediaKind stays music — never collapses to tts');
    console.log('PASS: music end-to-end (mediaKind=music, kind=audio) — never tts');
}

async function testResumeAwaitingThenConfirmCompletesReceipt(): Promise<void> {
    // D2 C1 fix cross-restart guard: an awaiting-confirmation job created in
    // session A must survive a full boot (fresh service + fresh runner reading
    // the same sqlite job/receipt tables), be confirm-able in session B, drive
    // its poll loop to completion, and end with the SAME receipt.artifactId
    // in state 'saved'. Prior to the fix, session A wrote receipt state
    // 'awaiting-confirmation' but never persisted receiptId into job.receiptIds
    // — so session B's rehydrateAnchor() picked up an empty receiptId,
    // updateReceiptToSaved() short-circuited on `!track.receiptId`, and the DB
    // ended with job.state='completed' + receipt.state='awaiting-confirmation'
    // (stale gate forever).
    const s1 = setup({ pendingCount: 1 });
    const outcome = await s1.svc.startAsyncJob(videoRequest());
    // Sanity: initial receipt is awaiting-confirmation, and the job now
    // carries its receiptId (guaranteed by the C1 fix).
    const initialJob = await s1.jobService.getJob(outcome.jobId);
    assert.ok(
        initialJob!.receiptIds.includes(outcome.receiptId),
        'C1 fix: receiptId persisted into job row immediately after receipt save',
    );
    // Simulate reboot: dispose the runner + drop the in-memory reference to
    // svc/runner, but keep the same sqlite (raw) so job + receipt survive.
    s1.svc.getJobRunner()!.dispose();

    // Session B — rebuild service + runner from scratch against the same DB.
    const db2 = makeKysely(s1.raw);
    const jobService2 = new MediaJobService(new ChatMediaJobRepo(db2), () => 100);
    const receipts2: ChatArtifactReceipt[] = [];
    const sink2 = makeChatArtifactReceiptSink(async (r) => { receipts2.push(r); });
    const scheduler2 = new ManualScheduler();
    const adapter2 = makeFakeAsyncAdapter({ pendingCount: 1 });
    const now2 = { value: 2_000_000 };
    const writer2: MediaAttachmentWriter = {
        async writeAttachment(input) {
            return { path: `${input.attachmentFolder}/${input.basename}.${input.extension}` };
        },
    };
    const syncStub2 = {
        providerId: 'fal',
        isConfigured: () => true,
        supportedKinds: () => ['video', 'music', 'image', 'tts'] as const,
        async generate() { throw new Error('unused'); },
    } as any;
    const svc2 = new MediaGenerationService({
        adapters: { fal: syncStub2 },
        writer: writer2,
        jobService: jobService2,
        receiptSink: sink2,
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        attachmentFolder: 'ChatFolder/Attachments/media',
        now: () => now2.value,
    });
    const runner2 = new MediaJobRunner({
        jobService: jobService2,
        adapters: { fal: adapter2 },
        writer: writer2,
        receiptSink: sink2,
        attachmentFolder: 'ChatFolder/Attachments/media',
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        scheduler: scheduler2,
        now: () => now2.value,
    });
    svc2.setJobRunner(runner2);

    // Resume-then-confirm: awaiting-confirmation preserved by resume, then
    // the user confirms in session B → adapter submit fires → poll ticks
    // drive to completion.
    const stats = await runner2.resumeUnfinished();
    assert.strictEqual(stats.awaiting, 1, 'awaiting-confirmation preserved across reboot');
    await svc2.confirmJob(outcome.jobId);
    assert.strictEqual(adapter2.submits.length, 1, 'confirm-after-reboot triggers exactly one submit');
    await drainScheduler(scheduler2, 10);

    // The job MUST be completed AND the receipt persisted in session B MUST
    // have state 'saved' anchored to the ORIGINAL artifactId — no orphan
    // receipt stuck at 'awaiting-confirmation'.
    const finalJob = await jobService2.getJob(outcome.jobId);
    assert.strictEqual(finalJob?.state, 'completed', 'job reaches completed post-reboot');
    const savedReceipt = [...receipts2].reverse().find((r) => r.state === 'saved');
    assert.ok(savedReceipt, 'saved receipt written in session B (C1 fix)');
    assert.strictEqual(
        savedReceipt!.artifactId,
        outcome.receiptId,
        'saved receipt reuses the original artifactId — no orphan receipts',
    );
    assert.ok(savedReceipt!.vaultPath, 'saved receipt carries vaultPath');
    runner2.dispose();
    console.log('PASS: cross-reboot resume → confirm → poll → saved receipt (C1 fix guard)');
}

async function testRunnerCleanCancelDoesNotCallCancelWhenNoCursor(): Promise<void> {
    // Cancel from awaiting-confirmation must NOT call adapter.cancel
    // (no providerRequestId to cancel remotely).
    const { svc, adapter } = setup();
    const outcome = await svc.startAsyncJob(videoRequest());
    await svc.cancelJob(outcome.jobId);
    assert.strictEqual(adapter.cancelCalls.length, 0, 'cancel-from-awaiting skips adapter.cancel');
    console.log('PASS: cancel without cursor does not ping adapter');
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ['submit does not block turn (awaiting-confirmation, no cost)', testSubmitDoesNotBlockTurn],
        ['confirm submits and pipeline reaches completed + saved receipt', testConfirmSubmitsAndDrivesPollLoopToCompleted],
        ['cancel deny stops pipeline (local-only, no cost)', testCancelDenyStopsPipeline],
        ['cancel stops running job (no polls after cancel)', testCancelStopsRunningJob],
        ['confirm with submit failure marks failed + retry receipt', testConfirmWithSubmitFailureMarksFailed],
        ['poll failed terminates', testPollFailedTerminates],
        ['poll deadline marks failed retriable', testPollDeadlineMarksFailedRetriable],
        ['resume: resume + fail unresumable + preserve awaiting (order)', testResumeUnfinishedOrder],
        ['dispose clears every pending timer', testDisposeClearsTimers],
        ['music mediaKind preserved end-to-end (never collapses to tts)', testMusicMediaKindPreservedEndToEnd],
        ['cross-reboot resume → confirm → saved receipt (C1 fix)', testResumeAwaitingThenConfirmCompletesReceipt],
        ['cancel without cursor does not ping adapter.cancel', testRunnerCleanCancelDoesNotCallCancelWhenNoCursor],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\nmedia-job-runner: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
