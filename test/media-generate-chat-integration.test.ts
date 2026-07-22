/**
 * Task D1 §R1/R2/R3 — media_generate under the unified Chat harness.
 *
 * Where `media-generate-tool.test.ts` locks the tool's own contract,
 * this file drives the tool THROUGH `harnessStreamChatWithModel` so we
 * lock the exact same wiring the production Chat runtime uses:
 *
 *   1. permission ask fires on invocation (kind:'edit' → mode:'ask').
 *   2. allow → the tool actually runs; receipts persist through the
 *      injected sink; tool-result event carries the payload the model
 *      will see.
 *   3. deny → adapter never called; no success receipt appears.
 *   4. Resources projection: after a successful tool call the persisted
 *      receipt appears in the ChatArtifactReceiptRepo query the right-
 *      column ConversationIndex uses to build the Resources tab.
 *   5. retry: re-invoking with the SAME request after a failure
 *      produces a NEW receipt (fresh artifactId) — the failed record
 *      is not overwritten.
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
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModel } from 'ai';
import { harnessStreamChatWithModel } from '@/service/chat/harnessChatRunner';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import { migrateSqliteSchema, type Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { ChatMediaJobRepo } from '@/core/storage/sqlite/repositories/ChatMediaJobRepo';
import { ChatArtifactReceiptRepo } from '@/core/storage/sqlite/repositories/ChatArtifactReceiptRepo';
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
import type { LLMRequestMessage, LLMStreamEvent } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';

// ─── shared sqlite + service fixtures ───────────────────────────────────────

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
    /** When set, the FIRST call throws; subsequent calls succeed. Used for retry test. */
    failFirstCall?: boolean;
}

function makeFakeFalAdapter(opts: FakeAdapterOptions = {}): MediaGenerationPort & { calls: MediaGenerationRequest[] } {
    const calls: MediaGenerationRequest[] = [];
    let called = 0;
    return {
        providerId: 'fal',
        calls,
        isConfigured: () => opts.configured ?? true,
        supportedKinds: () => ['tts', 'image', 'video', 'music'],
        async generate(req) {
            called += 1;
            if (opts.failFirstCall && called === 1) {
                throw new Error('transient adapter failure');
            }
            calls.push(req);
            return {
                kind: req.kind,
                bytes: new Uint8Array([1, 2, 3, 4]),
                extension: 'png',
                mimeType: 'image/png',
                modelId: req.modelId ?? 'fal-ai/fast-sdxl',
                latencyMs: 15,
                providerRequestId: `req-${called}`,
                providerResponseUrl: `https://queue.fal.run/req-${called}`,
            };
        },
    };
}

function makeWriter(): MediaAttachmentWriter {
    return {
        async writeAttachment(input) {
            return { path: `${input.attachmentFolder}/${input.basename}.${input.extension}` };
        },
    };
}

interface Setup {
    raw: BetterSqlite3Database;
    receiptRepo: ChatArtifactReceiptRepo;
    svc: MediaGenerationService;
    adapter: ReturnType<typeof makeFakeFalAdapter>;
    directSaved: ChatArtifactReceipt[];
}

/**
 * Wires MediaGenerationService against a real sqlite ChatArtifactReceiptRepo
 * so we can query the same rows the right-column Resources tab reads.
 */
function setup(opts: { adapter?: FakeAdapterOptions } = {}): Setup {
    const raw = new BetterSqlite3(':memory:');
    migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
    const db = makeKysely(raw);
    const receiptRepo = new ChatArtifactReceiptRepo(db);
    const mediaRepo = new ChatMediaJobRepo(db);
    const jobService = new MediaJobService(mediaRepo);
    const adapter = makeFakeFalAdapter(opts.adapter);
    const writer = makeWriter();
    const directSaved: ChatArtifactReceipt[] = [];
    // Sink writes both to the real repo (Resources projection) and to a
    // capture array so tests can assert on the receipt shape directly.
    // Row shape mirrors ChatStore.saveArtifactReceipt so the projection
    // sees exactly what production sees.
    const sink = makeChatArtifactReceiptSink(async (r) => {
        await receiptRepo.upsert({
            artifact_id: r.artifactId,
            run_id: r.runId,
            message_id: r.messageId,
            conversation_id: r.conversationId,
            project_id: r.projectId ?? null,
            direction: r.direction,
            kind: r.kind,
            state: r.state,
            title: r.title,
            receipt_json: JSON.stringify(r),
            created_at_ts: r.createdAt,
        });
        directSaved.push(r);
    });
    const svc = new MediaGenerationService({
        adapters: { fal: adapter },
        writer,
        jobService,
        receiptSink: sink,
        loadConfig: async () => DEFAULT_MEDIA_GENERATION_CONFIG,
        attachmentFolder: 'ChatFolder/Attachments/media',
    });
    return { raw, receiptRepo, svc, adapter, directSaved };
}

// ─── harness driver ─────────────────────────────────────────────────────────

const PROFILE_STUB: Profile = {
    id: 'p1', name: 'p1', kind: 'openai', enabled: true, createdAt: 0,
    baseUrl: 'https://example.com', apiKey: null, primaryModel: 'm-primary',
    fastModel: 'm-fast', customHeaders: {}, embeddingEndpoint: null,
    embeddingApiKey: null, embeddingModel: null, icon: null, description: null,
};

const USER_MSG: LLMRequestMessage[] = [
    { role: 'system', content: [{ type: 'text', text: 'you are a helper' }] },
    { role: 'user', content: [{ type: 'text', text: 'draw me a red panda' }] },
];

const RAW_USAGE = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, textTokens: 5, reasoningTokens: undefined },
    totalTokens: 15,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

function toolThenTextModel(toolName: string, toolInput: unknown, finalText: string): MockLanguageModelV3 {
    const steps = [
        [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'tc1', toolName, input: JSON.stringify(toolInput) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: RAW_USAGE },
        ],
        [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: finalText },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: RAW_USAGE },
        ],
    ];
    let call = 0;
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-media',
        doStream: async () => {
            const idx = Math.min(call, steps.length - 1);
            call += 1;
            return { stream: convertArrayToReadableStream([...steps[idx]] as any) };
        },
    });
}

async function drain(gen: AsyncGenerator<LLMStreamEvent, unknown, void>) {
    const events: LLMStreamEvent[] = [];
    while (true) {
        const step = await gen.next();
        if (step.done) return { events, ret: step.value };
        events.push(step.value);
    }
}

// ─── tests ─────────────────────────────────────────────────────────────────

async function testAllowRunsToolAndPersistsReceipt(): Promise<void> {
    const { svc, receiptRepo, adapter, directSaved } = setup();
    const conversationId = 'conv-integ';
    const messageId = 'msg-integ';
    const runId = 'run-integ';

    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId,
        messageId,
        saveReceipt: (r) => svc.saveReceiptDirect(r),
    });
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel(
        'media_generate',
        { kind: 'image', prompt: 'red panda', route: 'fal' },
        'here you go',
    );
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: runId,
            budget: { maxSteps: 3, maxTokens: 9999, maxToolCalls: 3 },
            permission: guard,
            resolvePermissionAsk: async () => ({ decision: 'allow' }),
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    const permReq = events.find((e) => e.type === 'chat-permission-request') as any;
    assert.ok(permReq, 'permission ask fires for media_generate (kind:edit)');
    assert.strictEqual(permReq.toolName, 'media_generate');

    assert.strictEqual(adapter.calls.length, 1, 'adapter invoked once via harness path');
    const toolResult = events.find((e) => e.type === 'tool-result') as any;
    assert.ok(toolResult, 'tool-result event fired');
    assert.match(String(toolResult.output), /Generated 1 image/i);

    // Success receipt persisted via the SAME sink both direct (assert
    // capture) and repo (Resources projection).
    assert.strictEqual(directSaved.length, 1);
    assert.strictEqual(directSaved[0].runId, runId);
    assert.strictEqual(directSaved[0].conversationId, conversationId);
    assert.strictEqual(directSaved[0].messageId, messageId);

    const rowsByMessage = await receiptRepo.listByMessage(messageId);
    assert.strictEqual(rowsByMessage.length, 1, 'receipt visible via listByMessage');
    const rowsByConversation = await receiptRepo.listByConversation(conversationId);
    assert.strictEqual(rowsByConversation.length, 1, 'Resources projection sees the receipt');

    assert.strictEqual((ret as any).status, 'completed');
    console.log('PASS: allow → adapter runs, receipt persisted, Resources projection includes it');
}

async function testDenySkipsToolAndRecordsRefusal(): Promise<void> {
    const { svc, receiptRepo, adapter, directSaved } = setup();
    const tool = buildMediaGenerateTool({
        service: svc,
        conversationId: 'conv-deny',
        messageId: 'msg-deny',
        saveReceipt: (r) => svc.saveReceiptDirect(r),
    });
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel(
        'media_generate',
        { kind: 'image', prompt: 'x', route: 'fal' },
        'ok skipped',
    );
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: 'run-deny',
            budget: { maxSteps: 3, maxTokens: 9999, maxToolCalls: 3 },
            permission: guard,
            resolvePermissionAsk: async () => ({ decision: 'deny', reason: 'no thanks' }),
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    const permReq = events.find((e) => e.type === 'chat-permission-request');
    assert.ok(permReq, 'permission ask fires');
    assert.strictEqual(adapter.calls.length, 0, 'adapter never called on deny');

    // Zero success receipts landed via the sink (deny short-circuits
    // before produce()).
    assert.strictEqual(directSaved.length, 0, 'no success receipt');
    const rowsByMessage = await receiptRepo.listByMessage('msg-deny');
    assert.strictEqual(rowsByMessage.length, 0);

    assert.strictEqual((ret as any).status, 'completed', 'deny is a normal outcome');
    console.log('PASS: deny → adapter skipped, no success receipt, run completes');
}

async function testRetryProducesNewReceipt(): Promise<void> {
    const { svc, receiptRepo } = setup({ adapter: { failFirstCall: true } });
    const conversationId = 'conv-retry';
    const messageId = 'msg-retry';

    // First attempt fails at the adapter → failed receipt written via
    // saveReceipt sink (not the success sink).
    const failedSaved: ChatArtifactReceipt[] = [];
    const tool1 = buildMediaGenerateTool({
        service: svc,
        conversationId,
        messageId,
        saveReceipt: async (r) => { failedSaved.push(r); await svc.saveReceiptDirect(r); },
    });
    const first = await tool1.execute(
        { kind: 'image', prompt: 'retry me', route: 'fal' },
        { loopId: 'run-first', stepIndex: 0, tier: 'local-fast' as any, signal: new AbortController().signal },
    );
    assert.strictEqual(first.ok, true);
    if (!first.ok) throw new Error('unreachable');
    assert.match(String(first.data), /failed/i);
    assert.strictEqual(failedSaved.length, 1, 'failed receipt persisted');

    // Retry: brand new tool exec, same conversation/message. New run id
    // → new artifactId.
    const tool2 = buildMediaGenerateTool({
        service: svc,
        conversationId,
        messageId,
        saveReceipt: (r) => svc.saveReceiptDirect(r),
    });
    const second = await tool2.execute(
        { kind: 'image', prompt: 'retry me', route: 'fal' },
        { loopId: 'run-second', stepIndex: 0, tier: 'local-fast' as any, signal: new AbortController().signal },
    );
    assert.strictEqual(second.ok, true);
    if (!second.ok) throw new Error('unreachable');
    assert.match(String(second.data), /Generated 1 image/i);

    // The receipt store should contain BOTH the failed and the
    // successful record — retry does not overwrite the failure.
    const rows = await receiptRepo.listByMessage(messageId);
    assert.strictEqual(rows.length, 2, 'failed + retried success both present');
    const ids = rows.map((r) => r.artifact_id);
    assert.strictEqual(new Set(ids).size, 2, 'artifactIds are distinct');
    // States should differ: one row failed/needs-permission, one saved.
    const states = new Set(rows.map((r) => r.state));
    assert.ok(states.has('saved'), 'success row present');
    assert.ok(states.has('failed') || states.has('needs-permission'), 'failed row preserved');
    console.log('PASS: retry produces new receipt; failed record preserved for user visibility');
}

async function testBootRecoveryFailsAllUnfinished(): Promise<void> {
    // Standing in for the boot-time hook in main.ts: build a job, mark
    // it running, then call failAllUnfinished. A crashed session leaves
    // exactly this shape (job created + transition to running, but no
    // completion / failure record). D1 §R5.
    const { svc } = setup();
    const job = await svc.getJobService().createJob({
        runId: 'run-orphan',
        request: {
            kind: 'image',
            prompt: 'orphan',
            route: 'fal',
            presetId: 'default',
        },
        preflight: { state: 'ready', executionRoute: 'fal', problems: [] },
        initialState: 'queued',
    });
    await svc.getJobService().transition(job.jobId, 'running');
    const unfinished = await svc.getJobService().listUnfinished();
    assert.strictEqual(unfinished.length, 1);
    const cleared = await svc.getJobService().failAllUnfinished('boot recovery');
    assert.strictEqual(cleared, 1);
    const after = await svc.getJobService().listUnfinished();
    assert.strictEqual(after.length, 0, 'no zombie jobs after boot recovery');
    console.log('PASS: boot recovery clears zombie running jobs');
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ['allow runs tool and persists receipt (Resources projection)', testAllowRunsToolAndPersistsReceipt],
        ['deny skips tool and records refusal', testDenySkipsToolAndRecordsRefusal],
        ['retry produces new receipt without overwriting failure', testRetryProducesNewReceipt],
        ['boot recovery fails all unfinished jobs', testBootRecoveryFailsAllUnfinished],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\nmedia-generate-chat-integration: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
