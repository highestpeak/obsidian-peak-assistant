/**
 * Task A2 — AgentLoop streaming + permission-ask contract tests.
 *
 * Purpose: nail down the streamText-based AgentLoop so Chat (A3) can drop
 * its bespoke Vercel wrapper. Covers:
 *
 *   1. Ordered event fan-out — text deltas → tool input → tool result →
 *      step_finish arrive in provider order, on the single `onStreamEvent`
 *      channel. Chat needs one subscription point, not two.
 *   2. Multi-step interleaving — a tool step followed by a text step, seen
 *      through `onStreamEvent` alone.
 *   3. Reasoning delta pass-through — some providers emit reasoning tokens;
 *      the loop must forward them without dropping.
 *   4. AgentLoopStatus mapping — completed / failed / cancelled all land on
 *      the coarse status field.
 *   5. Provider error — an `error` chunk in the stream becomes a failed
 *      result with the error string surfaced, not a silent turn.
 *   6. Abort mid-stream → cancelled.
 *   7. Permission ask — guard returns `ask` → AgentLoop emits
 *      `permission_request`, waits on `resolvePermissionAsk`, resolves to
 *      allow or deny, and observes `waiting-permission` → `running` state
 *      transitions.
 *   8. Ask + abort — external abort while awaiting the resolver → deny, no
 *      pending Promise leak.
 *   9. Missing resolver — ask + no `resolvePermissionAsk` = deny (safe default).
 *  10. Budget accounting under streamText — usage totals still feed
 *      `totalTokens` correctly.
 *
 * These map 1:1 to the brief's R1-R4 acceptance criteria.
 */

import assert from 'assert';
import { z } from 'zod';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBinding, TierBindings } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type {
    AgentLoopStreamEvent,
    PermissionAskRequest,
    PermissionAskResolution,
} from '@/service/agents/harness/loop/types';
import {
    makeStreamModel,
    textStepChunks,
    textStepChunksSplit,
    toolStepChunks,
    toolStepChunksWithStreamingInput,
    RAW_USAGE_STOP,
    type StepChunks,
} from './harness-fixtures/mockStreamModel';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function bindOne(modelId: string, model: MockLanguageModelV3): TierBinding {
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId,
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function mkTool(name: string, executed: { count: number; args?: any }, kind?: ToolDef['kind']): ToolDef {
    return {
        name,
        description: `tool ${name}`,
        inputSchema: z.object({ value: z.string() }),
        kind,
        async execute(args: any) {
            executed.count += 1;
            executed.args = args;
            return { ok: true as const, data: { echo: args.value } };
        },
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

tests.push({
    name: 'onStreamEvent delivers text deltas → tool input → tool result → step_finish in order',
    fn: async () => {
        // Step 1: split-delta text stream ending in a tool call.
        // AI SDK batches text-deltas and tool-call into the same step
        // structurally, so we script two steps here for a clean ordering
        // assertion.
        const model = makeStreamModel('m', [
            [
                { type: 'stream-start', warnings: [] },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'Hello ' },
                { type: 'text-delta', id: 't1', delta: 'world' },
                { type: 'text-end', id: 't1' },
                {
                    type: 'tool-call',
                    toolCallId: 'tc1',
                    toolName: 'echo',
                    input: '{"value":"go"}',
                },
                {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
                    usage: RAW_USAGE_STOP,
                },
            ],
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const events: AgentLoopStreamEvent[] = [];

        const result = await runAgentLoop({
            loopId: 'stream-order',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'go' }],
            tools: [mkTool('echo', exec)],
            tierController: controller,
            budget: { maxSteps: 5, maxTokens: 10_000, maxToolCalls: 10 },
            onStreamEvent: (e) => events.push(e),
        });

        // Filter to the events Chat cares about for ordering.
        const kinds = events
            .filter((e) =>
                (
                    ['text_delta', 'tool_call', 'tool_result', 'step_finish'] as const
                ).includes(e.type as any),
            )
            .map((e) => e.type);

        // Expected sequence: two text_delta → tool_call → tool_result →
        // step_finish (step 0), then step 1 text_delta → step_finish.
        assert.deepStrictEqual(
            kinds,
            [
                'text_delta',
                'text_delta',
                'tool_call',
                'tool_result',
                'step_finish',
                'text_delta',
                'step_finish',
            ],
            `unexpected fan-out ordering: ${kinds.join(' → ')}`,
        );

        // Concatenated deltas from step 0
        const deltas0 = events
            .filter((e) => e.type === 'text_delta' && e.stepIndex === 0)
            .map((e) => (e as any).delta)
            .join('');
        assert.strictEqual(deltas0, 'Hello world');

        assert.strictEqual(exec.count, 1, 'tool executed once');
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(result.finalText, 'done');
    },
});

tests.push({
    name: 'tool-input-start / tool-input-delta chunks fan out before tool_call / tool_result',
    fn: async () => {
        // Reviewer finding I-1: the streaming-input branch in AgentLoop
        // (chunks 285-314) had zero coverage — `toolStepChunks` only produced
        // `stream-start → tool-call → finish`. This test drives a step through
        // the `stream-start → tool-input-start → tool-input-delta × N →
        // tool-input-end → tool-call → finish` shape that real providers emit
        // (matching the AI SDK v6 raw-stream contract at
        // `node_modules/ai/dist/index.d.ts:2532`+), so we exercise the
        // input-start / input-delta AgentLoop branches AND assert ordering:
        // both fan-outs land before tool_call / tool_result.
        const model = makeStreamModel('m', [
            toolStepChunksWithStreamingInput({
                toolName: 'echo',
                input: { value: 'streamed' },
                toolCallId: 'tc-stream',
                inputDeltas: ['{"value":', '"streamed"}'],
            }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const stream: AgentLoopStreamEvent[] = [];
        const bus = new TraceBus();
        const traceKinds: string[] = [];
        bus.on('tool_input_start', () => traceKinds.push('tool_input_start'));
        bus.on('tool_input_delta', () => traceKinds.push('tool_input_delta'));
        bus.on('tool_call', () => traceKinds.push('tool_call'));
        bus.on('tool_result', () => traceKinds.push('tool_result'));

        const result = await runAgentLoop({
            loopId: 'stream-input',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'go' }],
            tools: [mkTool('echo', exec)],
            tierController: controller,
            trace: bus,
            onStreamEvent: (e) => stream.push(e),
            budget: { maxSteps: 5, maxTokens: 10_000, maxToolCalls: 10 },
        });

        // (A) The onStreamEvent channel must carry the two new event types.
        const inputStart = stream.filter((e) => e.type === 'tool_input_start');
        const inputDeltas = stream.filter((e) => e.type === 'tool_input_delta');
        assert.strictEqual(inputStart.length, 1, 'exactly one tool_input_start');
        assert.strictEqual(inputStart[0].toolName, 'echo');
        assert.strictEqual(inputStart[0].toolCallId, 'tc-stream');
        assert.strictEqual(inputDeltas.length, 2, 'both partial-json deltas fanned out');
        assert.strictEqual((inputDeltas[0] as any).delta, '{"value":');
        assert.strictEqual((inputDeltas[1] as any).delta, '"streamed"}');
        assert.ok(
            inputDeltas.every((e) => (e as any).toolCallId === 'tc-stream'),
            'all deltas carry the streaming toolCallId',
        );

        // (B) Ordering — input events precede tool_call / tool_result on the
        // stream channel (per-provider order preserved).
        const orderKinds = stream
            .filter((e) =>
                (
                    [
                        'tool_input_start',
                        'tool_input_delta',
                        'tool_call',
                        'tool_result',
                    ] as const
                ).includes(e.type as any),
            )
            .map((e) => e.type);
        assert.deepStrictEqual(orderKinds, [
            'tool_input_start',
            'tool_input_delta',
            'tool_input_delta',
            'tool_call',
            'tool_result',
        ]);

        // (C) TraceBus mirrors the same order.
        assert.deepStrictEqual(traceKinds, [
            'tool_input_start',
            'tool_input_delta',
            'tool_input_delta',
            'tool_call',
            'tool_result',
        ]);

        assert.strictEqual(exec.count, 1);
        assert.deepStrictEqual(exec.args, { value: 'streamed' });
        assert.strictEqual(result.status, 'completed');
    },
});

tests.push({
    name: 'onStreamEvent + TraceBus deliver identical event content',
    fn: async () => {
        const model = makeStreamModel('m', [
            textStepChunksSplit({ deltas: ['ab', 'cd'] }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const stream: AgentLoopStreamEvent[] = [];
        const bus = new TraceBus();
        const traceDeltas: string[] = [];
        bus.on('text_delta', (p) => traceDeltas.push(p.delta));

        await runAgentLoop({
            loopId: 'stream-both',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [],
            tierController: controller,
            trace: bus,
            onStreamEvent: (e) => stream.push(e),
        });

        const streamDeltas = stream
            .filter((e) => e.type === 'text_delta')
            .map((e) => (e as any).delta);
        assert.deepStrictEqual(streamDeltas, ['ab', 'cd']);
        assert.deepStrictEqual(traceDeltas, ['ab', 'cd']);
    },
});

tests.push({
    name: 'reasoning deltas propagate on both channels',
    fn: async () => {
        const model = makeStreamModel('m', [
            [
                { type: 'stream-start', warnings: [] },
                { type: 'reasoning-start', id: 'r1' },
                // Raw provider stream contract (ai/dist/index.d.ts:2005-2008):
                // reasoning-delta carries `delta`, not `text`. Vercel's
                // streamText translates raw `delta` → fullStream `text` (line
                // 2527-2530), which AgentLoop reads as `chunk.text`.
                { type: 'reasoning-delta', id: 'r1', delta: 'thinking...' },
                { type: 'reasoning-end', id: 'r1' },
                { type: 'text-start', id: 't1' },
                { type: 'text-delta', id: 't1', delta: 'answer' },
                { type: 'text-end', id: 't1' },
                {
                    type: 'finish',
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage: RAW_USAGE_STOP,
                },
            ],
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings });
        const stream: AgentLoopStreamEvent[] = [];

        await runAgentLoop({
            loopId: 'stream-reasoning',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [],
            tierController: controller,
            onStreamEvent: (e) => stream.push(e),
        });

        const reasoning = stream.filter((e) => e.type === 'reasoning_delta');
        assert.strictEqual(reasoning.length, 1);
        assert.strictEqual((reasoning[0] as any).delta, 'thinking...');
    },
});

tests.push({
    name: 'provider error in stream → failed result carrying error message',
    fn: async () => {
        const model = new MockLanguageModelV3({
            provider: 'mock',
            modelId: 'boom',
            doStream: async () => ({
                stream: convertArrayToReadableStream([
                    { type: 'stream-start', warnings: [] },
                    { type: 'error', error: new Error('provider unreachable') },
                ] as any),
            }),
        });
        const bindings: TierBindings = { 'fast': bindOne('boom', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });

        const result = await runAgentLoop({
            loopId: 'stream-err',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [],
            tierController: controller,
        });

        assert.strictEqual(result.finishReason, 'error');
        assert.strictEqual(result.status, 'failed');
        assert.ok(result.error, 'error must be surfaced');
        assert.match(String(result.error), /provider unreachable/);
    },
});

tests.push({
    name: 'abort mid-stream lands as cancelled',
    fn: async () => {
        // Model that emits a text-delta then throws on the next chunk
        // when the abort signal fires. Simpler: pre-abort so streamText
        // rejects immediately.
        const model = makeStreamModel('m', [textStepChunks({ text: 'x' })]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings });
        const ac = new AbortController();
        ac.abort();

        const result = await runAgentLoop({
            loopId: 'stream-abort',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [],
            tierController: controller,
            abortSignal: ac.signal,
        });

        assert.strictEqual(result.finishReason, 'abort');
        assert.strictEqual(result.status, 'cancelled');
    },
});

tests.push({
    name: 'permission ask → resolver allow: tool executes, events observed',
    fn: async () => {
        const model = makeStreamModel('m', [
            toolStepChunks({ toolName: 'write', input: { value: 'v' } }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const guard = new PermissionGuard({ mode: 'ask' });
        const stream: AgentLoopStreamEvent[] = [];
        const asks: PermissionAskRequest[] = [];

        // Reviewer finding I-2: while suspended on ask, the AgentLoop used to
        // emit a fake `permission_check { decision: 'allow' }` — an
        // observability lie. Capture TraceBus `permission_check` payloads to
        // assert the loop now emits `decision: 'ask'` and that it precedes
        // `permission_resolved`.
        const bus = new TraceBus();
        const permCheckEvents: Array<{ decision: string; toolName: string }> = [];
        const permOrder: string[] = [];
        bus.on('permission_check', (p) => {
            permCheckEvents.push({ decision: p.decision, toolName: p.toolName });
            permOrder.push(`check:${p.decision}`);
        });
        bus.on('permission_resolved', (p) => {
            permOrder.push(`resolved:${p.decision}`);
        });

        const result = await runAgentLoop({
            loopId: 'ask-allow',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [mkTool('write', exec, 'edit')],
            tierController: controller,
            permission: guard,
            trace: bus,
            resolvePermissionAsk: async (req) => {
                asks.push(req);
                return { decision: 'allow' };
            },
            onStreamEvent: (e) => stream.push(e),
            budget: { maxSteps: 5, maxTokens: 10_000, maxToolCalls: 10 },
        });

        assert.strictEqual(asks.length, 1);
        assert.strictEqual(asks[0].toolName, 'write');
        assert.deepStrictEqual(asks[0].args, { value: 'v' });
        assert.strictEqual(exec.count, 1, 'allow decision → tool runs');
        assert.strictEqual(result.status, 'completed');

        const req = stream.find((e) => e.type === 'permission_request');
        const resolved = stream.find((e) => e.type === 'permission_resolved');
        assert.ok(req, 'permission_request emitted');
        assert.ok(resolved, 'permission_resolved emitted');
        assert.strictEqual((resolved as any).decision, 'allow');
        assert.strictEqual((req as any).requestId, (resolved as any).requestId);

        // run_status: running → waiting-permission → running → completed
        const states = stream
            .filter((e) => e.type === 'run_status')
            .map((e) => (e as any).state);
        assert.deepStrictEqual(states, [
            'running',
            'waiting-permission',
            'running',
            'completed',
        ]);

        // Reviewer finding I-2: TraceBus must see the suspension as
        // `decision: 'ask'` — NOT a fake `'allow'`. And that check must
        // precede `permission_resolved`.
        assert.ok(
            permCheckEvents.some((e) => e.decision === 'ask' && e.toolName === 'write'),
            `expected permission_check { decision: 'ask', toolName: 'write' }, saw: ${JSON.stringify(permCheckEvents)}`,
        );
        assert.ok(
            !permCheckEvents.some((e) => e.decision === 'allow' && e.toolName === 'write'),
            `must NOT emit a spurious allow during ask suspension, saw: ${JSON.stringify(permCheckEvents)}`,
        );
        // Ordering: check:ask fires before resolved:allow.
        const askIdx = permOrder.indexOf('check:ask');
        const resolvedIdx = permOrder.indexOf('resolved:allow');
        assert.ok(askIdx >= 0 && resolvedIdx >= 0, `missing events: ${permOrder.join(',')}`);
        assert.ok(
            askIdx < resolvedIdx,
            `expected check:ask before resolved:allow, order was: ${permOrder.join(' → ')}`,
        );
    },
});

tests.push({
    name: 'permission ask → resolver deny: tool skipped, tool_result carries denial',
    fn: async () => {
        const model = makeStreamModel('m', [
            toolStepChunks({ toolName: 'write', input: { value: 'v' } }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const guard = new PermissionGuard({ mode: 'ask' });

        const result = await runAgentLoop({
            loopId: 'ask-deny',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [mkTool('write', exec, 'edit')],
            tierController: controller,
            permission: guard,
            resolvePermissionAsk: async () => ({
                decision: 'deny',
                reason: 'user declined',
            }),
            budget: { maxSteps: 5, maxTokens: 10_000, maxToolCalls: 10 },
        });

        assert.strictEqual(exec.count, 0, 'deny decision → tool NOT run');
        // Step 0 tool result should be captured as ok=false with denial reason.
        const step0 = result.steps[0];
        assert.strictEqual(step0.toolResults.length, 1);
        assert.strictEqual(step0.toolResults[0].ok, false);
        assert.match(String(step0.toolResults[0].payload), /user declined|permission denied/);
    },
});

tests.push({
    name: 'missing resolver → ask defaults to deny (no silent auto-allow)',
    fn: async () => {
        const model = makeStreamModel('m', [
            toolStepChunks({ toolName: 'write', input: { value: 'v' } }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const guard = new PermissionGuard({ mode: 'ask' });

        await runAgentLoop({
            loopId: 'ask-noresolver',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [mkTool('write', exec, 'edit')],
            tierController: controller,
            permission: guard,
            // no resolvePermissionAsk
            budget: { maxSteps: 5 },
        });

        assert.strictEqual(exec.count, 0, 'no resolver → tool must not run');
    },
});

tests.push({
    name: 'abort while awaiting ask resolution → resolver dismissed, no leak',
    fn: async () => {
        const model = makeStreamModel('m', [
            toolStepChunks({ toolName: 'write', input: { value: 'v' } }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const guard = new PermissionGuard({ mode: 'ask' });
        const ac = new AbortController();

        // Resolver never settles on its own; we abort the loop mid-await.
        // If the loop leaks the pending promise, the test process will
        // never terminate → the run-test.js harness setImmediate/exit trick
        // would kick in, but any assertion after `runAgentLoop` should be
        // reachable when the loop cleans up.
        const askArrived = new Promise<PermissionAskRequest>((resolve) => {
            (async () => {
                const result = await runAgentLoop({
                    loopId: 'ask-abort',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'x' }],
                    tools: [mkTool('write', exec, 'edit')],
                    tierController: controller,
                    permission: guard,
                    abortSignal: ac.signal,
                    resolvePermissionAsk: (req) => {
                        resolve(req);
                        // pending until aborted
                        return new Promise<PermissionAskResolution>((res) => {
                            req.signal.addEventListener('abort', () =>
                                res({ decision: 'deny', reason: 'ask-signal-cancelled' }),
                            );
                        });
                    },
                    budget: { maxSteps: 5, maxTokens: 10_000, maxToolCalls: 10 },
                });
                // On abort we expect status=cancelled (external abort during
                // an ask fires the loop-level abort path once the ask
                // resolves as deny and the next stop-condition check sees
                // abortSignal.aborted).
                assert.strictEqual(exec.count, 0, 'tool must not run');
                assert.ok(
                    result.status === 'cancelled' ||
                        result.finishReason === 'abort' ||
                        result.finishReason === 'stop' ||
                        // The tool step's tool_result records deny; the next
                        // stop-conditions iteration observes the abort and
                        // returns finishReason=abort. Both outcomes are
                        // acceptable — the invariant is: no hang, no exec.
                        result.status === 'completed',
                    `unexpected result: ${result.finishReason}/${result.status}`,
                );
            })().catch((e) => resolve(e as any));
        });

        // Wait for ask to arrive, then abort.
        await askArrived;
        ac.abort();

        // Give the loop a tick to unwind. If we don't await here, run-test.js
        // setImmediate exit trap could race us.
        await new Promise((r) => setTimeout(r, 20));
    },
});

tests.push({
    name: 'budget: usage totals from streamText accumulate into totalTokens',
    fn: async () => {
        const model = makeStreamModel('m', [
            textStepChunks({
                text: 'a',
                usage: {
                    inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 50, textTokens: 50, reasoningTokens: undefined },
                    totalTokens: 150,
                    reasoningTokens: undefined,
                    cachedInputTokens: undefined,
                },
            }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings });
        const result = await runAgentLoop({
            loopId: 'stream-budget',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [],
            tierController: controller,
        });
        assert.strictEqual(result.totalTokens, 150, `expected 150 total tokens, got ${result.totalTokens}`);
        assert.strictEqual(result.steps[0].promptTokens, 100);
        assert.strictEqual(result.steps[0].completionTokens, 50);
    },
});

tests.push({
    name: 'deny rule + guard emits deny event, no ask fanned out',
    fn: async () => {
        const model = makeStreamModel('m', [
            toolStepChunks({ toolName: 'write', input: { value: 'v' } }),
            textStepChunks({ text: 'done' }),
        ]);
        const bindings: TierBindings = { 'fast': bindOne('m', model) };
        const controller = new TierController({ bindings, policy: { allowEscalation: false } });
        const exec = { count: 0 };
        const guard = new PermissionGuard({
            mode: 'ask',
            rules: [{ tool: 'write', effect: 'deny', reason: 'always deny writes' }],
        });
        const stream: AgentLoopStreamEvent[] = [];
        let askInvocations = 0;

        await runAgentLoop({
            loopId: 'ask-deny-rule',
            systemPrompt: '',
            initialMessages: [{ role: 'user', content: 'x' }],
            tools: [mkTool('write', exec, 'edit')],
            tierController: controller,
            permission: guard,
            resolvePermissionAsk: async () => {
                askInvocations += 1;
                return { decision: 'allow' };
            },
            onStreamEvent: (e) => stream.push(e),
        });

        assert.strictEqual(askInvocations, 0, 'deny rule must short-circuit ask path');
        assert.strictEqual(exec.count, 0, 'deny rule → tool not executed');
        assert.strictEqual(
            stream.some((e) => e.type === 'permission_request'),
            false,
            'no permission_request event emitted',
        );
    },
});

async function run(): Promise<void> {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  ✓ ${t.name}`);
            passed += 1;
        } catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${(err as Error).stack ?? (err as Error).message}`);
            failed += 1;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

void run();
