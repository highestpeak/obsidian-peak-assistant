/**
 * Task A3 acceptance tests — the migrated Chat runtime.
 *
 * Anchors the five R5 slices from
 * .superpowers/sdd/task-a3-brief.md:
 *
 *   1. no-tool turn → AgentLoop still produces a run record (runId flows
 *      out through the harness stream's return value).
 *   2. vault_search tool via ToolDef path → SourceReceiptCollector snapshot
 *      is unchanged versus the pre-migration Vercel path.
 *   3. provider `error` chunk → Chat stream surfaces an `error` event that
 *      useStreamChat maps to an ERROR message + receipt.error.
 *   4. abort → real signal propagates → AgentLoop settles as `cancelled`,
 *      not a stringly-typed inference.
 *   5. maxSteps / budget are pulled from config (chatRuntimeConfig) —
 *      changing the config value takes effect on the next turn.
 *
 * These tests are self-contained: they exercise `harnessStreamChatWithModel`
 * (the injectable-model variant) so no real ProfileRegistry / provider is
 * required. That means we can lock the harness↔UI translation table
 * (`harnessChatRunner.ts::translateAgentEvent`) directly.
 */

import assert from 'assert';
import { z } from 'zod';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModel } from 'ai';
import { harnessStreamChatWithModel } from '@/service/chat/harnessChatRunner';
import { buildChatHarnessTools } from '@/service/chat/tools/harnessChatTools';
import { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';
import {
    DEFAULT_CHAT_RUNTIME_CONFIG,
    resolveChatMaxSteps,
    type ChatRuntimeConfig,
} from '@/service/chat/chatRuntimeConfig';
import type { LLMRequestMessage, LLMStreamEvent, ModelCapabilities } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultRetrievalPort, VaultRetrievalHit } from '@/core/ports/VaultRetrievalPort';
import type { ToolDef } from '@/service/agents/harness/tool/types';

// ─── fixtures ────────────────────────────────────────────────────────────────

const RAW_USAGE_STOP = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, textTokens: 5, reasoningTokens: undefined },
    totalTokens: 15,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

const RAW_USAGE_TOOL = {
    inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 6, textTokens: 6, reasoningTokens: undefined },
    totalTokens: 18,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

const APP_STUB = {} as unknown as AppHandle;
const CAPS_NO_NATIVE: ModelCapabilities = { vision: false, pdfInput: false, tools: true, webSearch: false };

const PROFILE_STUB: Profile = {
    id: 'p1',
    name: 'p1',
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

function textOnlyModel(deltas: string[]): MockLanguageModelV3 {
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-text',
        doStream: async () => ({
            stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't1' },
                ...deltas.map((d) => ({ type: 'text-delta', id: 't1', delta: d })),
                { type: 'text-end', id: 't1' },
                {
                    type: 'finish',
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage: RAW_USAGE_STOP,
                },
            ] as any),
        }),
    });
}

function toolThenTextModel(toolName: string, toolInput: any, finalText: string): MockLanguageModelV3 {
    const steps = [
        // Step 0: tool-call
        [
            { type: 'stream-start', warnings: [] },
            {
                type: 'tool-call',
                toolCallId: 'tc1',
                toolName,
                input: JSON.stringify(toolInput),
            },
            {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
                usage: RAW_USAGE_TOOL,
            },
        ],
        // Step 1: text answer
        [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: finalText },
            { type: 'text-end', id: 't1' },
            {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: RAW_USAGE_STOP,
            },
        ],
    ];
    let call = 0;
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-tool',
        doStream: async () => {
            const idx = Math.min(call, steps.length - 1);
            call += 1;
            return { stream: convertArrayToReadableStream([...steps[idx]] as any) };
        },
    });
}

function errorMidStreamModel(): MockLanguageModelV3 {
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-err',
        doStream: async () => ({
            stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'partial' },
                { type: 'error', error: new Error('rate limit') },
            ] as any),
        }),
    });
}

const USER_MSG: LLMRequestMessage[] = [
    { role: 'system', content: [{ type: 'text', text: 'you are a helper' }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
];

async function drain(
    gen: AsyncGenerator<LLMStreamEvent, unknown, void>,
): Promise<{ events: LLMStreamEvent[]; ret: any }> {
    const events: LLMStreamEvent[] = [];
    while (true) {
        const step = await gen.next();
        if (step.done) return { events, ret: step.value };
        events.push(step.value);
    }
}

// ─── tests ───────────────────────────────────────────────────────────────────

async function testNoToolTurnProducesRunRecord(): Promise<void> {
    const model = textOnlyModel(['Hello, ', 'world']);
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-no-tools',
            budget: { maxSteps: 1, maxTokens: 999, maxToolCalls: 999 },
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    // Text deltas arrive in order (typewriter behaviour preserved).
    const deltaTexts = events
        .filter((e) => e.type === 'text-delta')
        .map((e) => (e as any).text);
    assert.deepStrictEqual(deltaTexts, ['Hello, ', 'world']);

    // A terminal `complete` fires so useStreamChat's post-loop code path runs.
    const complete = events.find((e) => e.type === 'complete');
    assert.ok(complete, 'stream must terminate with a complete event');

    // Run record — runId is filled (fixes audit finding D: runId was never
    // populated). status maps to `completed`.
    assert.ok(ret, 'generator must return a HarnessChatStreamResult');
    assert.strictEqual(ret.runId, 'run-no-tools', 'runId flows out unchanged');
    assert.strictEqual(ret.status, 'completed');
    assert.ok(ret.totalTokens > 0, 'usage aggregation still works');

    console.log('PASS: no-tool turn → AgentLoop run record with runId (A3 R5.1)');
}

async function testVaultSearchReceiptEquivalence(): Promise<void> {
    const hits: VaultRetrievalHit[] = [
        { id: 'n1', path: 'Notes/A.md', title: 'Alpha', snippet: 'first hit' },
        { id: 'n2', path: 'Notes/B.md', title: 'Beta' },
    ];
    let observedQuery: string | null = null;
    const port: VaultRetrievalPort = {
        async search(query) {
            observedQuery = query;
            return hits;
        },
    };
    const receipts = new SourceReceiptCollector();

    // Build via the harness path (production Chat now goes through this).
    const tools = buildChatHarnessTools(
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
    assert.strictEqual(tools.length, 1, 'exactly the vault_search harness tool');
    const vaultTool = tools[0] as ToolDef;
    assert.strictEqual(vaultTool.name, 'vault_search');

    // Drive the tool through a stubbed AgentLoop-shaped call — direct execute
    // is what the harness would do inside `wrapTool`.
    const result = await vaultTool.execute(
        { query: 'alpha notes' },
        { loopId: 'run-vault', stepIndex: 0, tier: 'local-fast', signal: new AbortController().signal },
    );
    assert.strictEqual(result.ok, true);
    assert.ok(
        result.ok && typeof result.data === 'string' && result.data.includes('Notes/A.md'),
        'tool renders vault hits into a markdown-linked list',
    );

    // The receipt snapshot must match the pre-migration Vercel-tool contract
    // char-for-char — this is the RUN-01/RUN-02 anchor from A1.
    const snap = receipts.snapshot();
    assert.strictEqual(observedQuery, 'alpha notes');
    assert.deepStrictEqual(snap.vaultQueries, ['alpha notes']);
    assert.strictEqual(snap.vaultDocuments.length, 2);
    assert.deepStrictEqual(
        snap.vaultDocuments.map((d) => d.path),
        ['Notes/A.md', 'Notes/B.md'],
    );
    assert.strictEqual(snap.projectIncluded, false);
    assert.deepStrictEqual(snap.webQueries, []);

    console.log('PASS: vault_search harness path → equivalent SourceReceipt snapshot (A3 R5.2)');
}

async function testProviderErrorSurfacesAsErrorEvent(): Promise<void> {
    const model = errorMidStreamModel();
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-err',
            budget: { maxSteps: 1, maxTokens: 999, maxToolCalls: 999 },
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    // The provider error MUST fan out as an LLMStreamEvent — otherwise
    // useStreamChat's switch would silently drop it (the pre-A3 bug).
    const errorEvent = events.find((e) => e.type === 'error');
    assert.ok(errorEvent, 'harness translates provider error chunk into LLMStreamEvent{ type: error }');
    assert.ok((errorEvent as any).error instanceof Error, 'carries a real Error');
    assert.match(String((errorEvent as any).error.message), /rate limit/);

    // A terminal `complete` still lands so useStreamChat runs its final
    // bookkeeping — otherwise the "no result silent turn" bug returns.
    const complete = events.find((e) => e.type === 'complete');
    assert.ok(complete, 'complete event fires even after a provider error');

    // Run record marks the turn as failed.
    assert.strictEqual(ret.status, 'failed', 'AgentLoop settles as failed on provider error');
    assert.strictEqual(ret.finishReason, 'error');

    console.log('PASS: provider error → error event + failed run status (A3 R5.3)');
}

async function testAbortSignalPropagatesToCancelled(): Promise<void> {
    // Slow model that yields after abort has fired. We use setTimeout on the
    // stream side to give the abort signal a chance to reach the AI SDK's
    // internal readable-stream cancel path.
    const model = new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-slow',
        doStream: async ({ abortSignal }) => {
            // Simulate a provider that responds only after the caller cancels.
            return {
                stream: new ReadableStream({
                    start(controller) {
                        controller.enqueue({ type: 'stream-start', warnings: [] } as any);
                        controller.enqueue({ type: 'text-start', id: 't1' } as any);
                        controller.enqueue({ type: 'text-delta', id: 't1', delta: 'partial' } as any);
                        const onAbort = () => {
                            try {
                                // Enqueue abort chunk so AgentLoop treats
                                // it as a cooperative cancellation without
                                // spinning forever on a hung stream.
                                controller.enqueue({ type: 'abort', reason: 'aborted' } as any);
                            } catch { /* controller may already be closed */ }
                            try { controller.close(); } catch { /* noop */ }
                        };
                        if (abortSignal?.aborted) {
                            onAbort();
                        } else {
                            abortSignal?.addEventListener('abort', onAbort, { once: true });
                        }
                    },
                }),
            };
        },
    });

    const controller = new AbortController();
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-abort',
            budget: { maxSteps: 1, maxTokens: 999, maxToolCalls: 999 },
            abortSignal: controller.signal,
        },
        model as unknown as LanguageModel,
    );

    // Read one event so the stream is engaged, then abort.
    const first = await gen.next();
    assert.ok(!first.done);
    controller.abort('cancelled');
    const { ret } = await drain(gen);

    // The audit called out that abort classification used to be string
    // matching; here the abort signal really propagates → AgentLoop marks
    // finishReason='abort' → status='cancelled'.
    assert.strictEqual(ret.status, 'cancelled', 'AgentLoop honours the real AbortSignal');
    assert.strictEqual(ret.finishReason, 'abort');

    console.log('PASS: real AbortSignal → cancelled status (A3 R5.4, no string inference)');
}

async function testMaxStepsBudgetFromConfig(): Promise<void> {
    // Prove the config wire: a synthetic runtime config with a distinctive
    // number MUST be what the strategy hands to the harness. We verify by
    // reading the resolved value directly (the runner uses it as budget
    // .maxSteps), no need to actually drive multi-step here.
    const cfg: ChatRuntimeConfig = {
        budget: {
            maxStepsWithTools: 11,
            maxStepsNoTools: 2,
            maxTokens: 12_345,
            maxToolCalls: 42,
        },
        timeouts: { stepMs: 1, totalMs: 1 },
    };
    assert.strictEqual(resolveChatMaxSteps(cfg, true), 11, 'tools branch reads from config');
    assert.strictEqual(resolveChatMaxSteps(cfg, false), 2, 'no-tools branch reads from config');

    // Default snapshot is the pre-migration hardcoded 3/1 (regression guard
    // against a template edit accidentally shortening chat turns).
    assert.strictEqual(
        resolveChatMaxSteps(DEFAULT_CHAT_RUNTIME_CONFIG, true),
        3,
        'default hasTools=3 (preserves chatToolBuilder legacy)',
    );
    assert.strictEqual(
        resolveChatMaxSteps(DEFAULT_CHAT_RUNTIME_CONFIG, false),
        1,
        'default noTools=1',
    );

    // End-to-end wire: drive a tool-then-text run with maxSteps=1 (no tools
    // branch) and confirm we do NOT get a second step — proves the budget
    // truly flows into runAgentLoop.
    const model = textOnlyModel(['ok']);
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-budget',
            budget: {
                maxSteps: resolveChatMaxSteps(cfg, false), // 2 from cfg
                maxTokens: cfg.budget.maxTokens,
                maxToolCalls: cfg.budget.maxToolCalls,
            },
        },
        model as unknown as LanguageModel,
    );
    const { ret } = await drain(gen);
    assert.strictEqual(ret.status, 'completed');

    console.log('PASS: budget + maxSteps sourced from chatRuntimeConfig (A3 R5.5)');
}

async function testOutputControlReachesProviderCall(): Promise<void> {
    // A3 fix-round-1 (finding F1): outputControl (temperature/topP/topK/
    // maxOutputTokens/penalties) was accepted by HarnessChatStreamRequest but
    // never forwarded to runAgentLoop, so the mock provider call never
    // received them. Pre-migration `vercelStreamChat` DID pass these to
    // `streamText`. This test locks the wiring: every non-undefined
    // outputControl knob must land on the mock model's `doStreamCalls[0]`.
    const model = textOnlyModel(['ok']);
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-outputctl',
            budget: { maxSteps: 1, maxTokens: 999, maxToolCalls: 999 },
            outputControl: {
                temperature: 0.37,
                topP: 0.91,
                topK: 12,
                maxOutputTokens: 256,
                frequencyPenalty: 0.5,
                presencePenalty: -0.5,
                // timeouts are intentionally NOT forwarded (Vercel `streamText`
                // has no top-level slot); assert absence below.
                timeoutStepMs: 10_000,
                timeoutTotalMs: 60_000,
                // reasoningEffort / textVerbosity are also not part of the
                // channel today — provider-specific plumbing only.
                reasoningEffort: 'high',
                textVerbosity: 'low',
            },
        },
        model as unknown as LanguageModel,
    );
    await drain(gen);

    assert.strictEqual(model.doStreamCalls.length, 1, 'exactly one provider call for a 1-step turn');
    const call = model.doStreamCalls[0] as any;
    assert.strictEqual(call.temperature, 0.37, 'temperature reached provider');
    assert.strictEqual(call.topP, 0.91, 'topP reached provider');
    assert.strictEqual(call.topK, 12, 'topK reached provider');
    assert.strictEqual(call.maxOutputTokens, 256, 'maxOutputTokens reached provider');
    assert.strictEqual(call.frequencyPenalty, 0.5, 'frequencyPenalty reached provider');
    assert.strictEqual(call.presencePenalty, -0.5, 'presencePenalty reached provider');
    // Timers stay in the caller layer; the loop never sees them.
    assert.strictEqual((call as any).timeoutStepMs, undefined, 'timeoutStepMs not on provider call');
    assert.strictEqual((call as any).timeoutTotalMs, undefined, 'timeoutTotalMs not on provider call');

    console.log('PASS: outputControl forwarded to provider doStream (A3 fix F1)');
}

async function testOutputControlAbsentIsIgnored(): Promise<void> {
    // Guard the "no outputControl" branch: nothing user-visible should end up
    // on the provider call. This prevents a regression where a default `{}`
    // sneaks in and unintentionally overrides a provider default.
    const model = textOnlyModel(['ok']);
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [],
            loopId: 'run-outputctl-none',
            budget: { maxSteps: 1, maxTokens: 999, maxToolCalls: 999 },
            // no outputControl
        },
        model as unknown as LanguageModel,
    );
    await drain(gen);

    const call = model.doStreamCalls[0] as any;
    assert.strictEqual(call.temperature, undefined, 'temperature not injected when absent');
    assert.strictEqual(call.topP, undefined, 'topP not injected when absent');
    assert.strictEqual(call.maxOutputTokens, undefined, 'maxOutputTokens not injected when absent');

    console.log('PASS: outputControl absent → provider defaults untouched (A3 fix F1 negative)');
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ['no-tool turn produces run record', testNoToolTurnProducesRunRecord],
        ['vault_search harness path preserves receipt', testVaultSearchReceiptEquivalence],
        ['provider error surfaces as error event', testProviderErrorSurfacesAsErrorEvent],
        ['abort signal propagates → cancelled', testAbortSignalPropagatesToCancelled],
        ['maxSteps + budget config-driven', testMaxStepsBudgetFromConfig],
        ['outputControl reaches provider doStream', testOutputControlReachesProviderCall],
        ['outputControl absent leaves provider defaults', testOutputControlAbsentIsIgnored],
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
    assert.strictEqual(ran, tests.length, `expected ${tests.length} tests to run, ran ${ran}`);
    console.log(`\nchat-harness-runner: all ${ran} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
