/**
 * Task D1 §R1/R2/R3 — media_generate tool contract.
 *
 * Covers:
 *   1. availability resolver reports `available` when the sync probe
 *      says at least one route can execute image today.
 *   2. availability reports `unconfigured` with reason when neither
 *      route is ready.
 *   3. tool.execute happy path: image → success payload references
 *      vault paths + receipt ids + concrete route/model; receipt is
 *      persisted with conversationId/messageId/runId anchors.
 *   4. tool.execute failure path: preflight error → structured failure
 *      payload + failed receipt persisted with retry action.
 *   5. video / music kinds: return "not-yet-available" payload + a
 *      failed-style receipt, never pretend to complete.
 *   6. batch: quantity>1 threads through preset to adapter.
 *   7. permission ask hooks: harness `kind:'edit'` invariant preserved.
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
} from '@/service/media/MediaGenerationService';
import { DEFAULT_MEDIA_GENERATION_CONFIG } from '@/service/media/mediaGenerationConfig';
import { buildMediaGenerateTool } from '@/service/chat/tools/mediaGenerateTool';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import type {
    MediaGenerationPort,
    MediaGenerationRequest,
} from '@/core/ports/MediaGenerationPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { MediaReceiptExtras } from '@/core/types/media-generation';
import type { ToolExecCtx } from '@/service/agents/harness/tool/types';
import {
    resolveToolAvailability,
} from '@/service/chat/tools/toolAvailability';
import type { MediaGenerationProbe } from '@/service/chat/tools/mediaGenerationProbe';
import { mediaGenerationServiceAsProbe } from '@/service/chat/tools/mediaGenerationProbe';

// ─── in-memory sqlite + fake adapters ───────────────────────────────────────

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
    fail?: boolean;
}

function makeFakeFalAdapter(opts: FakeAdapterOptions = {}): MediaGenerationPort & { calls: MediaGenerationRequest[] } {
    const calls: MediaGenerationRequest[] = [];
    return {
        providerId: 'fal',
        calls,
        isConfigured: () => opts.configured ?? true,
        supportedKinds: () => opts.supportedKinds ?? ['tts', 'image', 'video', 'music'],
        async generate(req) {
            calls.push(req);
            if (opts.fail) throw new Error('adapter blew up');
            return {
                kind: req.kind,
                bytes: new Uint8Array([1, 2, 3]),
                extension: 'png',
                mimeType: 'image/png',
                modelId: req.modelId ?? 'fal-ai/fast-sdxl',
                latencyMs: 20,
                providerRequestId: 'req-x',
                providerResponseUrl: 'https://queue.fal.run/x',
            };
        },
    };
}

function makeWriter(): MediaAttachmentWriter & { written: string[] } {
    const written: string[] = [];
    return {
        written,
        async writeAttachment(input) {
            const path = `${input.attachmentFolder}/${input.basename}.${input.extension}`;
            written.push(path);
            return { path };
        },
    };
}

interface Setup {
    svc: MediaGenerationService;
    receipts: ChatArtifactReceipt[];
    adapter: ReturnType<typeof makeFakeFalAdapter>;
    writer: ReturnType<typeof makeWriter>;
    raw: BetterSqlite3Database;
}

function setup(opts: { adapter?: FakeAdapterOptions } = {}): Setup {
    const raw = new BetterSqlite3(':memory:');
    migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
    const db = makeKysely(raw);
    const jobService = new MediaJobService(new ChatMediaJobRepo(db));
    const adapter = makeFakeFalAdapter(opts.adapter);
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
    });
    return { svc, receipts, adapter, writer, raw };
}

function toolCtx(loopId = 'run-tool-1'): ToolExecCtx {
    return {
        loopId,
        stepIndex: 0,
        tier: 'fast' as any,
        signal: new AbortController().signal,
    };
}

// ─── availability slices (R1) ───────────────────────────────────────────────

function testAvailabilityAvailableWhenProbeReadyForImage(): void {
    const svc = setup().svc;
    const probe = mediaGenerationServiceAsProbe(() => svc);
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        mediaGenerationProbe: probe,
    });
    const media = records.find((r) => r.toolId === 'media_generate');
    assert.ok(media, 'media_generate record must be present');
    assert.strictEqual(media!.state, 'available');
    console.log('PASS: media_generate available when probe reports image ready');
}

function testAvailabilityUnconfiguredWhenNoRoutes(): void {
    const svc = setup({ adapter: { configured: false } }).svc;
    const probe = mediaGenerationServiceAsProbe(() => svc);
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        mediaGenerationProbe: probe,
    });
    const media = records.find((r) => r.toolId === 'media_generate')!;
    assert.strictEqual(media.state, 'unconfigured');
    assert.strictEqual(media.configureAction, 'media');
    assert.match(media.reason ?? '', /fal|native/i);
    console.log('PASS: media_generate unconfigured with reason when no routes ready');
}

function testAvailabilityUnconfiguredWhenProbeAbsent(): void {
    const nullProbe: MediaGenerationProbe = { snapshot: () => null };
    const records = resolveToolAvailability({
        enableVaultSearch: false,
        enableWebSearch: false,
        mediaGenerationProbe: nullProbe,
    });
    const media = records.find((r) => r.toolId === 'media_generate')!;
    assert.strictEqual(media.state, 'unconfigured');
    assert.strictEqual(media.configureAction, 'media');
    console.log('PASS: media_generate unconfigured when probe reports null');
}

// ─── execute slices (R2/R3) ─────────────────────────────────────────────────

async function testExecuteImageSuccessAnchorsReceipt(): Promise<void> {
    const { svc, receipts } = setup();
    const saved: ChatArtifactReceipt[] = [];
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-image-1',
        messageId: 'msg-image-1',
        saveReceipt: async (r) => { saved.push(r); },
    });
    const result = await tool.execute(
        {
            kind: 'image',
            prompt: 'a red panda',
            route: 'fal',
        },
        toolCtx('run-image-1'),
    );
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    const payload = String(result.data);
    assert.match(payload, /Generated 1 image/i, 'payload announces the generated count');
    assert.match(payload, /fal/i, 'payload names the route');
    assert.match(payload, /ChatFolder\/Attachments\/media/, 'payload references vault path');

    // The success path persists exactly one receipt via the service sink;
    // saveReceipt (used for failures / not-available paths) stays empty.
    assert.strictEqual(receipts.length, 1);
    assert.strictEqual(saved.length, 0);
    const receipt = receipts[0] as ChatArtifactReceipt & { media?: MediaReceiptExtras };
    assert.strictEqual(receipt.runId, 'run-image-1', 'receipt.runId anchored');
    assert.strictEqual(receipt.conversationId, 'conv-image-1', 'receipt.conversationId anchored');
    assert.strictEqual(receipt.messageId, 'msg-image-1', 'receipt.messageId anchored');
    assert.strictEqual(receipt.state, 'saved');
    assert.strictEqual(receipt.kind, 'image');
    assert.ok(receipt.media, 'receipt carries media extras');
    assert.strictEqual(receipt.media!.jobId.length > 0, true);
    console.log('PASS: execute image success → payload + receipt with anchors + media extras');
}

async function testExecuteImageFailurePersistsFailedReceipt(): Promise<void> {
    const { svc, receipts } = setup({ adapter: { configured: false } });
    const saved: ChatArtifactReceipt[] = [];
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-fail',
        messageId: 'msg-fail',
        saveReceipt: async (r) => { saved.push(r); },
    });
    const result = await tool.execute(
        {
            kind: 'image',
            prompt: 'x',
            route: 'fal',
        },
        toolCtx('run-fail'),
    );
    assert.strictEqual(result.ok, true, 'tool never throws for business failures (H-04)');
    if (!result.ok) throw new Error('unreachable');
    const payload = String(result.data);
    assert.match(payload, /failed/i, 'payload marks failure');
    assert.match(payload, /fal-missing-key|fal/i, 'payload includes per-route problem hint');

    // Success sink stays empty; failed receipt lands via saveReceipt.
    assert.strictEqual(receipts.length, 0);
    assert.strictEqual(saved.length, 1);
    const receipt = saved[0];
    assert.strictEqual(receipt.runId, 'run-fail');
    assert.strictEqual(receipt.conversationId, 'conv-fail');
    assert.strictEqual(receipt.messageId, 'msg-fail');
    // R4 (D2): preflight refusals map to `needs-configuration`
    // (not `needs-permission` — that's reserved for PermissionGuard denials).
    assert.ok(
        receipt.state === 'failed' || receipt.state === 'needs-configuration',
        `failed receipt state should be failed/needs-configuration, got ${receipt.state}`,
    );
    // E1 §R2: when preflight refuses with a per-route configureAction
    // (fal-missing-key → 'media'), the failed receipt exposes a
    // `configure` button in addition to `retry`. If the failure has no
    // configureAction, we fall back to `['retry']`.
    const hasConfigureAction = (receipt as ChatArtifactReceipt & { media?: { configureAction?: string } }).media?.configureAction != null;
    const expectedActions = hasConfigureAction ? ['configure', 'retry'] : ['retry'];
    assert.deepStrictEqual(
        receipt.availableActions,
        expectedActions,
        'failed receipt exposes retry (+ configure when preflight carries a configureAction)',
    );
    assert.ok(receipt.error, 'failed receipt carries error info');
    console.log('PASS: execute image failure → structured payload + failed receipt with retry');
}

async function testExecuteVideoQueuesAsyncJob(): Promise<void> {
    // D2 §R1/§R2: video is now a durable async job. Tool submits, gets
    // awaiting-confirmation state (no adapter call, no cost), persists a
    // real receipt via the service sink, and returns a structured payload
    // the model relays. No fabricated completion.
    const { svc, adapter, receipts } = setup();
    const saved: ChatArtifactReceipt[] = [];
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-video',
        messageId: 'msg-video',
        saveReceipt: async (r) => { saved.push(r); },
    });
    const result = await tool.execute(
        {
            kind: 'video',
            prompt: 'a wave breaking',
            durationSeconds: 8,
        },
        toolCtx('run-video'),
    );
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    const payload = String(result.data);
    assert.match(payload, /awaiting user confirmation/i, 'payload announces confirmation gate');
    assert.match(payload, /video/i, 'payload names the kind');
    // No cost incurred: adapter never called; the pending receipt goes
    // through the SERVICE sink (async job path), NOT the tool's failure
    // saveReceipt callback.
    assert.strictEqual(adapter.calls.length, 0, 'no adapter call — cost gate blocked provider request');
    assert.strictEqual(receipts.length, 1, 'awaiting-confirmation receipt persisted via service sink');
    assert.strictEqual(saved.length, 0, 'failure saveReceipt not invoked on success start');
    const receipt = receipts[0] as ChatArtifactReceipt & { media?: { jobId?: string; mediaKind?: string } };
    assert.strictEqual(receipt.kind, 'video');
    assert.strictEqual(receipt.state, 'awaiting-confirmation');
    assert.strictEqual(receipt.messageId, 'msg-video');
    assert.ok(receipt.availableActions.includes('confirm'), 'confirm action exposed');
    assert.ok(receipt.availableActions.includes('cancel'), 'cancel action exposed');
    assert.ok(receipt.media?.jobId, 'receipt carries jobId for confirm/cancel wiring');
    assert.strictEqual(receipt.media?.mediaKind, 'video', 'mediaKind preserved for music≠tts distinction');
    console.log('PASS: execute video → awaiting-confirmation job, real receipt, no cost incurred');
}

async function testExecuteMusicQueuesAsyncJob(): Promise<void> {
    // D2 §R5: music must be a first-class async job with mediaKind='music'
    // (NOT reused as TTS). Adapter never called before confirmation.
    const { svc, adapter, receipts } = setup();
    const saved: ChatArtifactReceipt[] = [];
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-music',
        messageId: 'msg-music',
        saveReceipt: async (r) => { saved.push(r); },
    });
    const result = await tool.execute(
        {
            kind: 'music',
            prompt: 'calm piano',
            durationSeconds: 20,
        },
        toolCtx('run-music'),
    );
    assert.strictEqual(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.strictEqual(adapter.calls.length, 0, 'confirmation gate blocks adapter');
    assert.strictEqual(receipts.length, 1);
    assert.strictEqual(saved.length, 0);
    const receipt = receipts[0] as ChatArtifactReceipt & { media?: { mediaKind?: string } };
    assert.strictEqual(receipt.kind, 'audio', 'ChatArtifactKind maps music → audio (D2 §R5)');
    assert.strictEqual(receipt.state, 'awaiting-confirmation');
    assert.strictEqual(receipt.messageId, 'msg-music');
    assert.strictEqual(
        receipt.media?.mediaKind,
        'music',
        'mediaKind stays "music" — MUST NOT collapse to tts (D2 §R5 hard rule)',
    );
    console.log('PASS: execute music → awaiting-confirmation job, mediaKind=music preserved');
}

async function testExecuteBatchThreadsQuantity(): Promise<void> {
    const { svc, adapter } = setup();
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-b',
        messageId: 'msg-b',
        saveReceipt: async () => { /* not used on success */ },
    });
    await tool.execute(
        {
            kind: 'image',
            prompt: 'a batch',
            route: 'fal',
            quantity: 3,
        },
        toolCtx('run-batch'),
    );
    assert.strictEqual(adapter.calls.length, 1);
    assert.strictEqual(adapter.calls[0].quantity, 3, 'quantity threaded through to adapter');
    console.log('PASS: execute batch → quantity threads through to adapter');
}

function testToolMetadataMarksEdit(): void {
    const { svc } = setup();
    const tool = buildMediaGenerateTool({
        service: svc,
        saveReceipt: async () => { /* noop */ },
    });
    assert.strictEqual(tool.name, 'media_generate');
    assert.strictEqual(tool.kind, 'edit', 'must be kind:edit so PermissionGuard.ask fires');
    assert.strictEqual(tool.source, 'local');
    console.log('PASS: media_generate tool metadata triggers permission ask path');
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => void | Promise<void>]> = [
        ['availability available when probe ready', testAvailabilityAvailableWhenProbeReadyForImage],
        ['availability unconfigured when no routes', testAvailabilityUnconfiguredWhenNoRoutes],
        ['availability unconfigured when probe absent', testAvailabilityUnconfiguredWhenProbeAbsent],
        ['execute image success anchors receipt', testExecuteImageSuccessAnchorsReceipt],
        ['execute image failure persists failed receipt', testExecuteImageFailurePersistsFailedReceipt],
        ['execute video queues async job (D2 R2)', testExecuteVideoQueuesAsyncJob],
        ['execute music queues async job (mediaKind=music, D2 R5)', testExecuteMusicQueuesAsyncJob],
        ['execute batch threads quantity', testExecuteBatchThreadsQuantity],
        ['tool metadata marks edit (permission ask)', testToolMetadataMarksEdit],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\nmedia-generate-tool: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
