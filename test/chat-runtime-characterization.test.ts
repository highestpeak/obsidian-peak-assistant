/**
 * Chat runtime characterization tests (Task A1, plan
 * docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md).
 *
 * Purpose: lock down the current Vercel-SDK-based Chat tool loop before we
 * migrate it to the Harness AgentLoop unified runtime. Every test here is a
 * safety net — it MUST pass on `master` today, and it MUST still pass after
 * the migration. If a behavior is tagged CURRENT-BEHAVIOR the caller intends
 * to change it in a later task; the test locks the pre-migration state so
 * behavioral drift shows up as a test flip, not silent divergence.
 *
 * The audit that motivates these anchors:
 *   .superpowers/sdd/audit-a-chat-runtime.md
 *
 * Scope (one anchor per lettered behavior in the brief):
 *   1. streaming — vercel-adapter yields text-delta chunks in order and closes
 *      with `complete`.
 *   2. cancel  — ChatConversationRun classifies AbortError as `cancelled`,
 *      other exceptions as `failed`.
 *   3. vault_search — buildChatTools attaches the tool when the port is wired
 *      and pipes queries/hits into the SourceReceiptCollector snapshot.
 *   4. web fallback injection — B1 §5.2 R2 rule: attached whenever an active
 *      Web Search profile is configured. Catalog `webSearch: true` no longer
 *      suppresses the fallback (no native adapter exists in the repo today).
 *   5. persistence round-trip — meta_json (toolCalls / turn relationships),
 *      status, topic, and the conversation-level extras survive the SQLite
 *      write/read boundary via ChatMessageRepo + rowToConversationMeta.
 *   6. maxSteps — CURRENT-BEHAVIOR: buildChatTools returns 3 with any tools,
 *      1 with none. Later tasks will move both numbers into config.
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
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';

import { streamChat as adapterStreamChat } from '@/core/providers/vercel/vercel-adapter';
import { runChatConversation } from '@/service/chat/ChatConversationRun';
import { buildChatTools } from '@/service/chat/tools/chatToolBuilder';
import { resolveChatExecutionStrategy } from '@/service/chat/execution-strategy';
import {
    DEFAULT_CHAT_RUNTIME_CONFIG,
    resolveChatMaxSteps,
} from '@/service/chat/chatRuntimeConfig';
import { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { Profile } from '@/core/profiles/types';
import type { ModelCapabilities, LLMRequestMessage } from '@/core/providers/types';
import type { VaultRetrievalPort, VaultRetrievalHit } from '@/core/ports/VaultRetrievalPort';
import type { AppHandle } from '@/core/ports/AppHandle';

import { ChatMessageRepo, buildMessageMetaJson } from '@/core/storage/sqlite/repositories/ChatMessageRepo';
import { migrateSqliteSchema, type Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { MessageStatus } from '@/core/types/chat';
import type { ChatMessage } from '@/core/types/chat';

// ─── infra ──────────────────────────────────────────────────────────────────

function makeKysely(db: BetterSqlite3.Database): Kysely<DbSchema> {
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

function makeChatMessageRepo(): { raw: BetterSqlite3.Database; db: Kysely<DbSchema>; repo: ChatMessageRepo } {
    const raw = new BetterSqlite3(':memory:');
    migrateSqliteSchema({ exec: (sql: string) => raw.exec(sql) });
    const db = makeKysely(raw);
    return { raw, db, repo: new ChatMessageRepo(db) };
}

const APP_STUB = {} as unknown as AppHandle;
const CAPS_NO_NATIVE: ModelCapabilities = { vision: false, pdfInput: false, tools: true, webSearch: false };
const CAPS_NATIVE_WEB: ModelCapabilities = { vision: false, pdfInput: false, tools: true, webSearch: true };

function makeProfile(id: string): Profile {
    return {
        id,
        name: id,
        kind: 'openai',
        enabled: true,
        createdAt: 0,
        baseUrl: 'https://example.com',
        apiKey: null,
        primaryModel: 'm-primary',
        fastModel: 'm-fast',
        customHeaders: {},
        embeddingEndpoint: null,
        embeddingApiKey: null,
        embeddingModel: null,
        icon: null,
        description: null,
    };
}

// ─── tests ──────────────────────────────────────────────────────────────────

/**
 * Behavior 1: no-tool streaming turn.
 * vercel-adapter is our streaming seam — it wraps `streamText` from the AI SDK
 * and translates chunks into LLMStreamEvent. We drive it with a MockLanguageModelV3
 * that emits three text-delta chunks and a finish. The adapter must yield those
 * deltas in order and end with a `complete` event; anything else is drift.
 */
async function testStreamingTextDeltaTurn(): Promise<void> {
    const model = new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-stream',
        doStream: async () => ({
            stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'Hello, ' },
                { type: 'text-delta', id: 't1', delta: 'world' },
                { type: 'text-delta', id: 't1', delta: '!' },
                { type: 'text-end', id: 't1' },
                {
                    type: 'finish',
                    // MockLanguageModelV3 raw finishReason shape for installed ai@6.0.175; revisit on SDK upgrade
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage: {
                        inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined },
                        outputTokens: { total: 3, textTokens: 3, reasoningTokens: undefined },
                        totalTokens: 7,
                        reasoningTokens: undefined,
                        cachedInputTokens: undefined,
                    },
                },
            ] as any),
        }),
    });

    const messages: LLMRequestMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ];

    const deltas: string[] = [];
    let finalCompleteEvent: any = null;
    const allEvents: any[] = [];
    for await (const event of adapterStreamChat(model, messages)) {
        allEvents.push(event);
        if (event.type === 'text-delta') deltas.push(event.text);
        if (event.type === 'complete') finalCompleteEvent = event;
    }

    assert.deepStrictEqual(deltas, ['Hello, ', 'world', '!'], 'text deltas must arrive in order');
    assert.ok(finalCompleteEvent, `stream must end with a complete event; got: ${JSON.stringify(allEvents.map(e => e.type))}`);
    // finish-step event (which happens between text-end and finish) carries the
    // per-step finish reason. The `complete` event fires once the whole stream
    // ends. We assert the presence of a finish-step / complete pair here; the
    // top-level `complete.finishReason` may be undefined on some SDK versions
    // because streamText reports rawFinishReason but wraps totalUsage separately.
    const finishStepEvent = allEvents.find((e) => e.type === 'on-step-finish');
    assert.ok(finishStepEvent, 'stream should surface an on-step-finish translation of finish-step');
    assert.strictEqual(finishStepEvent.finishReason, 'stop', 'per-step finishReason propagates');
    // finalCompleteEvent.finishReason is intentionally not asserted:
    // in AI SDK v6 the top-level `finish` chunk's finishReason may be undefined
    // for single-step turns (the SDK carries the reason on finish-step and
    // reserves the top-level `finish` for total-usage aggregation). Locking
    // per-step finishReason preserves the observable meaning without pinning
    // an SDK-internal quirk that could change on minor bumps.
    assert.strictEqual(deltas.join(''), 'Hello, world!', 'concatenated text is complete');
    console.log('PASS: streaming text-delta turn (behavior 1)');
}

/**
 * Behavior 2: cancel path — ChatConversationRun classifies AbortError → cancelled.
 *
 * The audit (§4) documents that ChatConversationRun.ts:97-104 uses a STRUCTURAL
 * check on the error name (`AbortError`) — deliberately not on any message
 * containing "cancelled" (because server-side failures reuse that word). This
 * asserts both branches so a future refactor cannot conflate them.
 */
async function testCancelClassifiesAsCancelled(): Promise<void> {
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';

    let caught: unknown = null;
    let cancelledRun: any = null;
    try {
        await runChatConversation({
            send: async () => {
                throw abortErr;
            },
            onEvent: (event) => {
                if (event.type === 'status' && event.status === 'cancelled') cancelledRun = event;
            },
        });
    } catch (err) {
        caught = err;
    }
    assert.strictEqual(caught, abortErr, 'runChatConversation re-throws the original error');
    assert.ok(cancelledRun, 'AbortError must produce a cancelled status event');
    console.log('PASS: AbortError → cancelled (behavior 2a)');

    // Genuine failure keeps the failed status — never conflates with cancel.
    const providerErr = new Error('server 500 cancelled by upstream');
    let failedRun: any = null;
    try {
        await runChatConversation({
            send: async () => {
                throw providerErr;
            },
            onEvent: (event) => {
                if (event.type === 'status' && event.status === 'failed') failedRun = event;
            },
        });
    } catch { /* swallow, we're checking the recorded status */ }
    assert.ok(failedRun, 'unnamed error containing the word "cancelled" must still finish as failed');
    console.log('PASS: unnamed error → failed (behavior 2b)');
}

/**
 * Behavior 3: vault_search tool is built when Vault scope is enabled AND a
 * VaultRetrievalPort is wired, and the SourceReceiptCollector captures the
 * ACTUAL query + hits that the tool executor consumed. This is chat-studio
 * RUN-01/RUN-02: the actualSources field must never lie.
 */
async function testVaultSearchToolAndReceipt(): Promise<void> {
    const hits: VaultRetrievalHit[] = [
        { id: 'n1', path: 'Notes/A.md', title: 'Alpha', snippet: 'first hit' },
        { id: 'n2', path: 'Notes/B.md', title: 'Beta' },
    ];
    let observedQuery: string | null = null;
    const port: VaultRetrievalPort = {
        async search(query, _opts) {
            observedQuery = query;
            return hits;
        },
    };
    const receipts = new SourceReceiptCollector();
    const built = buildChatTools(
        {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: true,
            vaultRetrieval: port,
            vaultScopeFolder: 'Notes/',
            receipts,
        },
        CAPS_NO_NATIVE,
    );

    assert.ok('vault_search' in built.tools, 'vault_search tool must be attached');
    const vaultTool = built.tools['vault_search'] as any;
    assert.strictEqual(typeof vaultTool.execute, 'function', 'vault_search must be executable');

    const output = await vaultTool.execute({ query: 'alpha notes' }, {});
    assert.strictEqual(observedQuery, 'alpha notes', 'query is forwarded verbatim to the retrieval port');
    assert.ok(typeof output === 'string' && output.includes('Notes/A.md') && output.includes('Alpha'), 'output cites first hit');

    const snap = receipts.snapshot();
    assert.deepStrictEqual(snap.vaultQueries, ['alpha notes'], 'receipt records the actual vault query');
    assert.strictEqual(snap.vaultDocuments.length, 2, 'receipt records every hit');
    assert.deepStrictEqual(
        snap.vaultDocuments.map((d) => d.path),
        ['Notes/A.md', 'Notes/B.md'],
    );

    // Turn-level actual vs requested consistency — the collector snapshot IS the
    // actualSources field on the TurnExecutionReceipt. Anything requested-vs-actual
    // divergence must show up here first.
    assert.strictEqual(snap.projectIncluded, false, 'no project → actualSources.projectIncluded stays false');
    assert.deepStrictEqual(snap.webQueries, [], 'no web tool run → actualSources.webQueries stays empty');

    console.log('PASS: vault_search tool + receipt (behavior 3)');
}

function testVaultSearchAbsentWhenPortMissing(): void {
    const built = buildChatTools(
        {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: true,
            vaultRetrieval: null,
            receipts: new SourceReceiptCollector(),
        },
        CAPS_NO_NATIVE,
    );
    assert.ok(!('vault_search' in built.tools), 'no port wired → no tool attached (must not pretend)');
    console.log('PASS: vault_search absent when port missing (behavior 3, negative)');
}

/**
 * Behavior 4: web fallback injection (B1 §5.2 R2 rule, replaces the pre-B1
 * CURRENT-BEHAVIOR anchor).
 *
 * The new rule: the fallback `web_search` tool is attached when
 *   - the `enableWebSearch` UI toggle is on, AND
 *   - ProfileRegistry.getActiveWebSearchProfile() returns a profile.
 *
 * Catalog metadata (`webSearch: true` on model capabilities) NO LONGER
 * suppresses the fallback. No provider adapter in this repo actually
 * implements a native web-search endpoint, so honouring the catalog flag
 * would remove the only real route. Native availability is now decided by
 * `WebSearchProvider` (default: always unavailable) — see
 * `src/service/chat/tools/webSearchProvider.ts`. When a real adapter ships,
 * an additional test slice must flip native-availability from false to true.
 */
function testWebSearchInjectionRules(): void {
    // Ensure a clean registry for each branch; do not leak into other tests.
    ProfileRegistry.resetInstance();

    // Case A: no native webSearch capability + active Web Search profile → tool attached.
    {
        const registry = ProfileRegistry.getInstance();
        registry.load(
            {
                profiles: [makeProfile('p-web')],
                activeAgentConfig: null,
                activeAgentFastConfig: null,
                activeChatConfig: null,
                activeCopilotConfig: null,
                activeEmbeddingConfig: null,
                activeWebSearchConfig: { profileId: 'p-web', modelId: 'm-primary' },
                sdkSettings: { cliPathOverride: null, subprocessPoolSize: 1, warmupOnLoad: false },
            },
            () => { /* no persistence in tests */ },
        );
        const built = buildChatTools(
            {
                app: APP_STUB,
                pluginId: 'peak-test',
                enableWebSearch: true,
                receipts: new SourceReceiptCollector(),
            },
            CAPS_NO_NATIVE,
        );
        assert.ok('web_search' in built.tools, 'web_search attaches when active profile exists');
    }

    // Case B (rule change): catalog `webSearch: true` MUST NOT suppress
    // fallback anymore. No native adapter exists, so the fallback is the
    // only real route; suppressing it would strand the user.
    {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
            {
                profiles: [makeProfile('p-web')],
                activeAgentConfig: null,
                activeAgentFastConfig: null,
                activeChatConfig: null,
                activeCopilotConfig: null,
                activeEmbeddingConfig: null,
                activeWebSearchConfig: { profileId: 'p-web', modelId: 'm-primary' },
                sdkSettings: { cliPathOverride: null, subprocessPoolSize: 1, warmupOnLoad: false },
            },
            () => { /* no persistence in tests */ },
        );
        const built = buildChatTools(
            {
                app: APP_STUB,
                pluginId: 'peak-test',
                enableWebSearch: true,
                receipts: new SourceReceiptCollector(),
            },
            CAPS_NATIVE_WEB,
        );
        assert.ok(
            'web_search' in built.tools,
            'B1 rule: native webSearch capability MUST NOT suppress fallback (no real adapter yet)',
        );
    }

    // Case C: no active Web Search profile → tool never attached.
    {
        ProfileRegistry.resetInstance();
        const registry = ProfileRegistry.getInstance();
        registry.load(
            {
                profiles: [],
                activeAgentConfig: null,
                activeAgentFastConfig: null,
                activeChatConfig: null,
                activeCopilotConfig: null,
                activeEmbeddingConfig: null,
                activeWebSearchConfig: null,
                sdkSettings: { cliPathOverride: null, subprocessPoolSize: 1, warmupOnLoad: false },
            },
            () => { /* no persistence in tests */ },
        );
        const built = buildChatTools(
            {
                app: APP_STUB,
                pluginId: 'peak-test',
                enableWebSearch: true,
                receipts: new SourceReceiptCollector(),
            },
            CAPS_NO_NATIVE,
        );
        assert.ok(!('web_search' in built.tools), 'missing active Web Search profile → tool NOT attached');
    }

    ProfileRegistry.resetInstance();
    console.log('PASS: web fallback injection rules (behavior 4, B1 rule)');
}

/**
 * Behavior 5: message-level persistence round-trip through SQLite.
 *
 * The write path is `ChatMessageRepo.upsertMessages` (audit §6). The read
 * path re-parses `status` + `meta_json` (see ChatStore.applyPersistedMessageExtras);
 * that private method is a small JSON walk, so we replay it here to lock the
 * durable JSON contract. If the shape changes the test flips — the migration
 * must then either preserve the shape or provide a migration.
 */
async function testMessagePersistenceRoundTrip(): Promise<void> {
    const { raw, repo } = makeChatMessageRepo();
    const conversationId = 'conv-a';

    // Seed the FK-required conversation row so the schema stays honest.
    raw.prepare(
        `INSERT INTO chat_conversation (
            conversation_id, project_id, title, file_rel_path,
            created_at_ts, updated_at_ts, active_model, active_provider,
            token_usage_total, title_manually_edited, title_auto_updated,
            context_last_updated_ts, context_last_message_index, archived_rel_path, meta_json
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 0, 0, NULL, NULL, NULL, NULL)`,
    ).run(conversationId, 'T', 'Conv-a.md', 1000, 2000, 'claude-x', 'anthropic');

    const errMsg: ChatMessage = {
        id: 'm-err',
        role: 'assistant',
        content: 'oops',
        createdAtTimestamp: 1500,
        createdAtZone: 'UTC',
        starred: false,
        model: 'claude-x',
        provider: 'anthropic',
        status: MessageStatus.ERROR,
        isErrorMessage: true,
        topic: 'Failures',
        replyToMessageId: 'm-user-0',
        branchFromMessageId: 'm-fork-0',
        revisionOfMessageId: undefined,
        toolCalls: [
            { toolName: 'vault_search', input: { query: 'foo' }, output: 'no hits' },
            { toolName: 'web_search', input: { query: 'bar' }, output: 'answer' },
        ],
    };
    const doneMsg: ChatMessage = {
        id: 'm-done',
        role: 'assistant',
        content: 'answer body',
        createdAtTimestamp: 1600,
        createdAtZone: 'UTC',
        starred: false,
        model: 'claude-x',
        provider: 'anthropic',
        status: MessageStatus.COMPLETED,
        topic: 'General',
    };

    await repo.upsertMessages(conversationId, [errMsg, doneMsg]);

    const rows = await repo.listByConversation(conversationId);
    const rowById = new Map(rows.map((r) => [r.message_id, r]));
    const errRow = rowById.get('m-err');
    const doneRow = rowById.get('m-done');
    assert.ok(errRow && doneRow, 'both messages persisted');

    // status column: only ERROR/CANCELLED/TIMEOUT are written, COMPLETED stays null.
    assert.strictEqual(errRow!.status, 'error', 'ERROR status persists');
    assert.strictEqual(errRow!.is_error, 1, 'is_error mirrors isErrorMessage');
    assert.strictEqual(doneRow!.status, null, 'COMPLETED status is stored as null');

    // topic column round-trips.
    assert.strictEqual(errRow!.topic, 'Failures');
    assert.strictEqual(doneRow!.topic, 'General');

    // meta_json shape: turn relationships + toolCalls survive verbatim.
    assert.ok(errRow!.meta_json, 'meta_json is non-null when relationships/toolCalls exist');
    const parsed = JSON.parse(errRow!.meta_json!) as Record<string, unknown>;
    assert.strictEqual(parsed.replyToMessageId, 'm-user-0');
    assert.strictEqual(parsed.branchFromMessageId, 'm-fork-0');
    assert.ok(!('revisionOfMessageId' in parsed), 'undefined relationships are elided');
    assert.ok(Array.isArray(parsed.toolCalls), 'toolCalls survive as an array');
    assert.strictEqual((parsed.toolCalls as any[]).length, 2);
    assert.strictEqual((parsed.toolCalls as any[])[0].toolName, 'vault_search');
    assert.deepStrictEqual((parsed.toolCalls as any[])[1].input, { query: 'bar' });

    // Symmetry: buildMessageMetaJson returns exactly the JSON that was persisted.
    assert.strictEqual(errRow!.meta_json, buildMessageMetaJson(errMsg));
    assert.strictEqual(doneRow!.meta_json, null, 'no relationships/toolCalls → null (no wasted JSON)');
    console.log('PASS: message persistence round-trip (behavior 5, messages)');
}

/**
 * Behavior 5 continued: conversation-level meta round-trip through
 * `rowToConversationMeta` — pinned, assistantId, modelSelection, focusFolder,
 * conversationType. This mirrors ChatStore.readConversationMeta after a save.
 */
function testConversationMetaRoundTrip(): void {
    const baseRow = {
        conversation_id: 'c-1',
        project_id: 'p-1',
        title: 'T',
        file_rel_path: 'Conv.md',
        created_at_ts: 1,
        updated_at_ts: 2,
        active_model: 'claude-x',
        active_provider: 'anthropic',
        token_usage_total: null,
        title_manually_edited: 0,
        title_auto_updated: 1,
        context_last_updated_ts: null,
        context_last_message_index: null,
        archived_rel_path: null,
        meta_json: null,
    };
    const extras = {
        customSystemPrompt: 'concise',
        conversationType: { kind: 'plan' as const },
        focusFolder: 'Research/',
        assistantId: 'asst-1',
        modelSelection: { mode: 'fixed' as const, profileId: 'p-1', modelId: 'claude-x' },
        pinned: true,
        pinnedAt: 999,
    };

    const meta = ChatStorageService.rowToConversationMeta(baseRow as any, extras as any);
    assert.strictEqual(meta.customSystemPrompt, 'concise');
    assert.deepStrictEqual(meta.conversationType, { kind: 'plan' });
    assert.strictEqual(meta.focusFolder, 'Research/');
    assert.strictEqual(meta.assistantId, 'asst-1');
    assert.deepStrictEqual(meta.modelSelection, { mode: 'fixed', profileId: 'p-1', modelId: 'claude-x' });
    assert.strictEqual(meta.pinned, true);
    assert.strictEqual(meta.pinnedAt, 999);

    // Missing extras must NOT invent values (legacy rows).
    const legacy = ChatStorageService.rowToConversationMeta(baseRow as any, {} as any);
    assert.strictEqual(legacy.pinned, undefined);
    assert.strictEqual(legacy.assistantId, undefined);
    assert.strictEqual(legacy.modelSelection, undefined);

    console.log('PASS: conversation meta round-trip (behavior 5, conversation)');
}

/**
 * Behavior 6 (updated for A3 R4): maxSteps is now config-driven via
 * `templates/config/chat-runtime.json` + `chatRuntimeConfig.ts`. The default
 * values MUST preserve pre-migration behaviour so this test remains a
 * regression guard for the domain fallback (hasTools=3 / noTools=1).
 *
 * The old Vercel-shape `buildChatTools` still exists (used by other
 * characterization anchors and by any legacy consumer). Production Chat
 * now reads maxSteps from `resolveChatExecutionStrategy` which pulls the
 * numbers from the runtime config, so we lock the wire end-to-end.
 */
function testMaxStepsConfigDriven(): void {
    // Domain-default snapshot — matches templates/config/chat-runtime.json.
    assert.strictEqual(
        DEFAULT_CHAT_RUNTIME_CONFIG.budget.maxStepsWithTools,
        3,
        'A3 default: hasTools → maxSteps=3 (was hardcoded, now in chat-runtime.json)',
    );
    assert.strictEqual(
        DEFAULT_CHAT_RUNTIME_CONFIG.budget.maxStepsNoTools,
        1,
        'A3 default: no tools → maxSteps=1',
    );
    assert.strictEqual(resolveChatMaxSteps(DEFAULT_CHAT_RUNTIME_CONFIG, true), 3);
    assert.strictEqual(resolveChatMaxSteps(DEFAULT_CHAT_RUNTIME_CONFIG, false), 1);

    // Strategy honours the config it receives — this is the config→loop
    // wiring the audit calls out (§2 findings C, F).
    const port: VaultRetrievalPort = { async search() { return []; } };
    const strategyWithTool = resolveChatExecutionStrategy({
        planIntent: false,
        toolDeps: {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: true,
            vaultRetrieval: port,
            receipts: new SourceReceiptCollector(),
        },
        modelCapabilities: CAPS_NO_NATIVE,
        runtimeConfig: DEFAULT_CHAT_RUNTIME_CONFIG,
    });
    assert.strictEqual(strategyWithTool.tools.length, 1, 'vault tool attached');
    assert.strictEqual(strategyWithTool.maxSteps, 3, 'strategy pulls maxStepsWithTools from config');

    const strategyNoTool = resolveChatExecutionStrategy({
        planIntent: false,
        toolDeps: {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: false,
            vaultRetrieval: null,
            receipts: new SourceReceiptCollector(),
        },
        modelCapabilities: CAPS_NO_NATIVE,
        runtimeConfig: DEFAULT_CHAT_RUNTIME_CONFIG,
    });
    assert.strictEqual(strategyNoTool.tools.length, 0);
    assert.strictEqual(strategyNoTool.maxSteps, 1, 'strategy pulls maxStepsNoTools from config');

    // Overriding the config takes effect (proves the wire): custom budgets
    // flow through instead of being ignored.
    const CUSTOM = {
        budget: { maxStepsWithTools: 7, maxStepsNoTools: 4, maxTokens: 99, maxToolCalls: 99 },
        timeouts: { stepMs: 1, totalMs: 1 },
    };
    const custom = resolveChatExecutionStrategy({
        planIntent: false,
        toolDeps: {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: true,
            vaultRetrieval: port,
            receipts: new SourceReceiptCollector(),
        },
        modelCapabilities: CAPS_NO_NATIVE,
        runtimeConfig: CUSTOM,
    });
    assert.strictEqual(custom.maxSteps, 7, 'config override wins');

    console.log('PASS: maxSteps sourced from chat-runtime.json (behavior 6, config-driven)');
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => void | Promise<void>]> = [
        ['streaming text-delta turn', testStreamingTextDeltaTurn],
        ['cancel classified as cancelled', testCancelClassifiesAsCancelled],
        ['vault_search tool + receipt', testVaultSearchToolAndReceipt],
        ['vault_search absent when port missing', testVaultSearchAbsentWhenPortMissing],
        ['web search injection rules', testWebSearchInjectionRules],
        ['message persistence round-trip', testMessagePersistenceRoundTrip],
        ['conversation meta round-trip', testConversationMetaRoundTrip],
        ['maxSteps config-driven default 3/1', testMaxStepsConfigDriven],
    ];
    let ran = 0;
    for (const [name, fn] of tests) {
        try {
            await fn();
            ran++;
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    // Guard against a future refactor accidentally shortening the test loop
    // (e.g. an unawaited early-return): if a case is skipped, fail loudly.
    assert.strictEqual(ran, tests.length, `expected ${tests.length} tests to run, ran ${ran}`);
    console.log(`\nchat-runtime-characterization: all ${ran} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
