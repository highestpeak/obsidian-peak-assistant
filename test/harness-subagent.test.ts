import assert from 'assert';
import { z } from 'zod';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { SubAgentDispatcher } from '@/service/agents/harness/subagent/SubAgentDispatcher';
import { buildSubagentTool, subagentToolName } from '@/service/agents/harness/subagent/subagentTool';
import type { SubAgentDefinition } from '@/service/agents/harness/subagent/types';
import {
    makeStreamModel,
    textStepChunks,
    toolStepChunks,
    type StepChunks,
} from './harness-fixtures/mockStreamModel';

/**
 * A binding whose model plays back scripted step chunk sequences, one per
 * doStream call. Lets us script multi-step subagent runs without sharing
 * state across the parent/child models.
 */
function scriptedBinding(modelId: string, steps: StepChunks[]): TierBinding {
    const model = makeStreamModel(modelId, steps);
    return {
        tier: 'local-fast',
        providerId: 'mock',
        modelId,
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function textResp(text: string, tokens = 10): StepChunks {
    const usage = {
        inputTokens: { total: tokens, noCache: tokens, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: tokens, textTokens: tokens, reasoningTokens: undefined },
        totalTokens: tokens * 2,
        reasoningTokens: undefined,
        cachedInputTokens: undefined,
    };
    return textStepChunks({ text, usage });
}

function toolCallResp(toolName: string, args: any, tcId = 'tc1'): StepChunks {
    return toolStepChunks({ toolName, input: args, toolCallId: tcId });
}

function mkTool(name: string, executed: { count: number; lastArgs?: any }, payload: any = { ok: true }): ToolDef {
    return {
        name,
        description: `tool ${name}`,
        inputSchema: z.object({ value: z.string().optional() }),
        async execute(args: any) {
            executed.count += 1;
            executed.lastArgs = args;
            return { ok: true as const, data: payload };
        },
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
        {
            name: 'SubAgentDispatcher: returns summary, isolates child context',
            fn: async () => {
                // Parent never used here — exercise dispatcher directly with a
                // parent controller binding (child uses same bindings but its
                // own controller instance).
                const parentBindings: TierBindings = {
                    'local-fast': scriptedBinding('child', [textResp('child answer', 7)]),
                };
                const parentController = new TierController({
                    bindings: parentBindings,
                    policy: { allowEscalation: false },
                });
                const dispatcher = new SubAgentDispatcher({
                    parentLoopId: 'parent-L1',
                    tierController: parentController,
                });
                const def: SubAgentDefinition = {
                    name: 'explorer',
                    description: 'subagent that explores',
                    systemPrompt: 'you are an explorer',
                    tools: [],
                    maxTurns: 3,
                };
                const summary = await dispatcher.dispatch(def, 'go explore X');
                assert.strictEqual(summary.name, 'explorer');
                assert.strictEqual(summary.finalText, 'child answer');
                assert.strictEqual(summary.finishReason, 'stop');
                assert.strictEqual(summary.steps, 1);
                assert.strictEqual(typeof summary.totalTokens, 'number');
                assert.ok(summary.durationMs >= 0);
            },
        },
        {
            name: 'subagentTool wraps subagent as ToolDef the parent loop can call',
            fn: async () => {
                const childExec = { count: 0 };
                // Parent: invokes subagent.helper once, then stops.
                const parentBinding = scriptedBinding('parent', [
                    toolCallResp(subagentToolName({ name: 'helper' } as SubAgentDefinition), { prompt: 'do X' }),
                    textResp('parent fin', 12),
                ]);
                // Child: emits a tool call to its private tool, then stops.
                const childBinding = scriptedBinding('child', [
                    toolCallResp('child.tool', { value: 'hi' }),
                    textResp('child summary'),
                ]);

                // Two controllers, but the parent's controller bindings drive
                // subagent dispatch — so we put a separate child binding into
                // the parent's bindings under same tier. Trick: dispatcher
                // uses parentController.getBindings(); we want the child to
                // resolve to a different model. Approach: separate
                // TierController + dispatcher injected via the tool factory.
                const parentBindings: TierBindings = { 'local-fast': parentBinding };
                const childBindings: TierBindings = { 'local-fast': childBinding };
                const parentController = new TierController({
                    bindings: parentBindings,
                    policy: { allowEscalation: false },
                });
                // Custom dispatcher that uses the childBindings for the child.
                const childController = new TierController({
                    bindings: childBindings,
                    policy: { allowEscalation: false },
                });
                const dispatcher = new SubAgentDispatcher({
                    parentLoopId: 'P',
                    tierController: childController,
                });

                const def: SubAgentDefinition = {
                    name: 'helper',
                    description: 'helps',
                    systemPrompt: 'you help',
                    tools: [mkTool('child.tool', childExec)],
                    maxTurns: 5,
                };
                const subTool = buildSubagentTool(def, dispatcher);

                const result = await runAgentLoop({
                    loopId: 'P',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'delegate' }],
                    tools: [subTool as ToolDef],
                    tierController: parentController,
                    budget: { maxSteps: 4 },
                });

                // Child's private tool ran exactly once and parent saw only the
                // subagent tool result, not child.tool.
                assert.strictEqual(childExec.count, 1, 'child tool executed once');
                const parentToolResult = result.steps[0].toolResults[0];
                assert.strictEqual(parentToolResult.ok, true);
                assert.strictEqual(parentToolResult.toolName, subagentToolName(def));
                // Parent payload only contains summary, finishReason, steps, tokens.
                const payload = parentToolResult.payload as any;
                assert.strictEqual(typeof payload.summary, 'string');
                assert.strictEqual(payload.summary, 'child summary');
                assert.strictEqual(payload.finishReason, 'stop');
                assert.ok(typeof payload.steps === 'number' && payload.steps > 0);
                // Parent never sees child's tool calls in its own toolResults.
                const parentToolNames = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
                assert.ok(!parentToolNames.includes('child.tool'), 'parent must not see child tool');
                // Parent context only grows by summary-sized payload; verify
                // parent steps recorded only the subagent tool call (+ final).
                assert.strictEqual(result.steps.length, 2);
                assert.strictEqual(result.finalText, 'parent fin');
            },
        },
        {
            name: 'subagents auto-injected via cfg.subagents are callable from parent',
            fn: async () => {
                const parentBinding = scriptedBinding('parent', [
                    toolCallResp(subagentToolName({ name: 'worker' } as SubAgentDefinition), { prompt: 'job' }),
                    textResp('done by parent'),
                ]);
                const childBinding = scriptedBinding('child', [textResp('child done')]);

                const parentBindings: TierBindings = { 'local-fast': parentBinding };
                const parentController = new TierController({
                    bindings: parentBindings,
                    policy: { allowEscalation: false },
                });
                // The auto-injection path uses parent's bindings for the
                // child. For this test we want the parent's binding to be a
                // separate child mock — so swap bindings only after parent's
                // step 1. Simpler: just reuse the same parent binding (which
                // is scripted, advances mono-sequentially across calls).
                // To avoid coupling tests to call-counter ordering across two
                // unrelated loops, use a controller that hands the child a
                // dedicated child binding by injecting it under the same
                // tier in a separate sub-only TierController via a custom
                // dispatcher — but auto-inject uses the parent controller.
                // So: put child binding under 'local-deep' and have the def
                // request that tier.
                parentBindings['local-deep'] = childBinding;

                const def: SubAgentDefinition = {
                    name: 'worker',
                    description: 'does work',
                    systemPrompt: 'work',
                    tools: [],
                    tier: 'local-deep',
                    maxTurns: 2,
                };
                const result = await runAgentLoop({
                    loopId: 'AUTO',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [],
                    subagents: [def],
                    tierController: parentController,
                    budget: { maxSteps: 4 },
                });

                const parentTr = result.steps[0].toolResults[0];
                assert.strictEqual(parentTr.toolName, subagentToolName(def));
                assert.strictEqual(parentTr.ok, true);
                const payload = parentTr.payload as any;
                assert.strictEqual(payload.summary, 'child done');
                assert.strictEqual(result.finalText, 'done by parent');
            },
        },
        {
            name: 'subagent failure surfaces to parent as recoverable tool error',
            fn: async () => {
                // Parent calls subagent; child immediately exhausts budget
                // (maxTurns=1, always tool-calls → max_steps).
                const parentBinding = scriptedBinding('parent', [
                    toolCallResp(subagentToolName({ name: 'looper' } as SubAgentDefinition), { prompt: 'p' }),
                    textResp('parent saw failure'),
                ]);
                const childBinding = scriptedBinding('child', [
                    toolCallResp('child.tool', { value: 'x' }),
                    toolCallResp('child.tool', { value: 'x' }),
                    toolCallResp('child.tool', { value: 'x' }),
                ]);
                const parentBindings: TierBindings = {
                    'local-fast': parentBinding,
                    'local-deep': childBinding,
                };
                const childExec = { count: 0 };
                const parentController = new TierController({
                    bindings: parentBindings,
                    policy: { allowEscalation: false },
                });
                const def: SubAgentDefinition = {
                    name: 'looper',
                    description: 'never stops',
                    systemPrompt: 'loop',
                    tools: [mkTool('child.tool', childExec)],
                    tier: 'local-deep',
                    maxTurns: 1,
                };
                const result = await runAgentLoop({
                    loopId: 'FAIL',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [],
                    subagents: [def],
                    tierController: parentController,
                    budget: { maxSteps: 4 },
                });
                const parentTr = result.steps[0].toolResults[0];
                // Subagent finished with max_steps but didn't throw — parent
                // sees it as a successful summary with non-stop finishReason.
                assert.strictEqual(parentTr.ok, true);
                const payload = parentTr.payload as any;
                assert.strictEqual(payload.finishReason, 'max_steps');
                assert.strictEqual(result.finalText, 'parent saw failure');
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
