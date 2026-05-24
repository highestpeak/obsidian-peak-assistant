import assert from 'assert';
import { z } from 'zod';
import { MockLanguageModelV3 } from 'ai/test';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { TraceBus } from '@/service/agents/harness/trace/events';

type GenResult = Awaited<ReturnType<NonNullable<MockLanguageModelV3['doGenerate']>>>;

function makeStopBinding(modelId: string, text: string): TierBinding {
    const model = new MockLanguageModelV3({
        provider: 'mock',
        modelId,
        async doGenerate(): Promise<GenResult> {
            return {
                content: [{ type: 'text', text }],
                finishReason: 'stop',
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                warnings: [],
            } as GenResult;
        },
    });
    return {
        tier: 'local-fast',
        providerId: 'mock',
        modelId,
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function makeToolThenStopBinding(modelId: string, toolName: string, toolInput: any, finalText: string): TierBinding {
    let call = 0;
    const model = new MockLanguageModelV3({
        provider: 'mock',
        modelId,
        async doGenerate(): Promise<GenResult> {
            call += 1;
            if (call === 1) {
                return {
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'tc1',
                            toolName,
                            input: JSON.stringify(toolInput),
                        },
                    ],
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                    warnings: [],
                } as GenResult;
            }
            return {
                content: [{ type: 'text', text: finalText }],
                finishReason: 'stop',
                usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
                warnings: [],
            } as GenResult;
        },
    });
    return {
        tier: 'local-fast',
        providerId: 'mock',
        modelId,
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function alwaysStopTool(executed: { count: number }): ToolDef {
    return {
        name: 'noop',
        description: 'a noop tool',
        inputSchema: z.object({ value: z.string() }),
        async execute({ value }: { value: string }) {
            executed.count += 1;
            return { ok: true as const, data: { echo: value } };
        },
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => Promise<void> }> = [
        {
            name: 'stops on final-answer step with no tool calls',
            fn: async () => {
                const bindings: TierBindings = { 'local-fast': makeStopBinding('m', 'final answer') };
                const controller = new TierController({ bindings });
                const result = await runAgentLoop({
                    loopId: 'L1',
                    systemPrompt: 'You are a tester.',
                    initialMessages: [{ role: 'user', content: 'hi' }],
                    tools: [],
                    tierController: controller,
                });
                assert.strictEqual(result.finishReason, 'stop');
                assert.strictEqual(result.finalText, 'final answer');
                assert.strictEqual(result.steps.length, 1);
                assert.strictEqual(result.tierUsage['local-fast'], 1);
            },
        },
        {
            name: 'invokes tool then stops on second step',
            fn: async () => {
                const exec = { count: 0 };
                const bindings: TierBindings = {
                    'local-fast': makeToolThenStopBinding('m', 'noop', { value: 'hello' }, 'done'),
                };
                const controller = new TierController({ bindings });
                const result = await runAgentLoop({
                    loopId: 'L2',
                    systemPrompt: 'use the tool then answer',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [alwaysStopTool(exec)],
                    tierController: controller,
                    budget: { maxSteps: 5 },
                });
                assert.strictEqual(exec.count, 1, 'tool should be executed once');
                assert.strictEqual(result.finishReason, 'stop');
                assert.strictEqual(result.steps.length, 2);
                assert.strictEqual(result.steps[0].toolCalls.length, 1);
                assert.strictEqual(result.steps[0].toolResults.length, 1);
                assert.strictEqual(result.steps[0].toolResults[0].ok, true);
                assert.strictEqual(result.steps[1].toolCalls.length, 0);
                assert.strictEqual(result.finalText, 'done');
                assert.strictEqual(result.totalToolCalls, 1);
            },
        },
        {
            name: 'honors maxSteps budget',
            fn: async () => {
                // Always emits a tool call → loop never gets to stop step.
                let calls = 0;
                const model = new MockLanguageModelV3({
                    provider: 'mock',
                    modelId: 'loopy',
                    async doGenerate(): Promise<GenResult> {
                        calls += 1;
                        return {
                            content: [{ type: 'tool-call', toolCallId: `c${calls}`, toolName: 'noop', input: '{"value":"x"}' }],
                            finishReason: 'tool-calls',
                            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                            warnings: [],
                        } as GenResult;
                    },
                });
                const bindings: TierBindings = {
                    'local-fast': {
                        tier: 'local-fast',
                        providerId: 'mock',
                        modelId: 'loopy',
                        resolve: () => model,
                        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
                        estimatedSingleStepP: 0.9,
                    },
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const exec = { count: 0 };
                const result = await runAgentLoop({
                    loopId: 'L3',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [alwaysStopTool(exec)],
                    tierController: controller,
                    budget: { maxSteps: 3, maxTokens: 10_000, maxToolCalls: 10 },
                });
                assert.strictEqual(result.finishReason, 'max_steps');
                assert.strictEqual(result.steps.length, 3);
            },
        },
        {
            name: 'aborts when abort signal fires before start',
            fn: async () => {
                const bindings: TierBindings = { 'local-fast': makeStopBinding('m', 'ignored') };
                const controller = new TierController({ bindings });
                const ac = new AbortController();
                ac.abort();
                const result = await runAgentLoop({
                    loopId: 'L4',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'x' }],
                    tools: [],
                    tierController: controller,
                    abortSignal: ac.signal,
                });
                assert.strictEqual(result.finishReason, 'abort');
                assert.strictEqual(result.steps.length, 0);
            },
        },
        {
            name: 'emits trace events',
            fn: async () => {
                const bindings: TierBindings = { 'local-fast': makeStopBinding('m', 'ok') };
                const controller = new TierController({ bindings });
                const bus = new TraceBus();
                const events: string[] = [];
                bus.on('loop_start', () => events.push('loop_start'));
                bus.on('step_start', () => events.push('step_start'));
                bus.on('step_finish', () => events.push('step_finish'));
                bus.on('loop_finish', () => events.push('loop_finish'));
                await runAgentLoop({
                    loopId: 'L5',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'x' }],
                    tools: [],
                    tierController: controller,
                    trace: bus,
                });
                assert.deepStrictEqual(events, ['loop_start', 'step_start', 'step_finish', 'loop_finish']);
            },
        },
        {
            name: 'tool exception is captured as recoverable=false error',
            fn: async () => {
                const bindings: TierBindings = {
                    'local-fast': makeToolThenStopBinding('m', 'noop', { value: 'hi' }, 'after'),
                };
                const throwingTool: ToolDef = {
                    name: 'noop',
                    description: 'throws',
                    inputSchema: z.object({ value: z.string() }),
                    async execute() {
                        throw new Error('boom');
                    },
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const result = await runAgentLoop({
                    loopId: 'L6',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'x' }],
                    tools: [throwingTool],
                    tierController: controller,
                });
                const first = result.steps[0];
                assert.strictEqual(first.toolResults.length, 1);
                assert.strictEqual(first.toolResults[0].ok, false);
                assert.match(String(first.toolResults[0].payload), /boom/);
            },
        },
    ];

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
