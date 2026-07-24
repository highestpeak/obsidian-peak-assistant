import assert from 'assert';
import { z } from 'zod';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { HookBus } from '@/service/agents/harness/hook/HookBus';
import { makeStreamModel, textStepChunks, toolStepChunks } from './harness-fixtures/mockStreamModel';

function makeToolThenStopBinding(toolName: string, args: any, finalText = 'fin'): TierBinding {
    const model = makeStreamModel('mock', [
        toolStepChunks({ toolName, input: args }),
        textStepChunks({ text: finalText }),
    ]);
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId: 'mock',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function stopBinding(text: string): TierBinding {
    const model = makeStreamModel('mock', [textStepChunks({ text })]);
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId: 'mock',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function mkTool(name: string, executed: { count: number }, payload: any = { ok: true }): ToolDef {
    return {
        name,
        description: `tool ${name}`,
        inputSchema: z.object({ value: z.string().optional() }),
        async execute() {
            executed.count += 1;
            return { ok: true as const, data: payload };
        },
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
        {
            name: 'fire returns continue when no handlers',
            fn: async () => {
                const bus = new HookBus();
                const r = await bus.fire('pre_tool_use', {
                    loopId: 'L', stepIndex: 0, tier: 'fast',
                    toolName: 't', toolCallId: 'c', args: {},
                });
                assert.strictEqual(r.kind, 'continue');
            },
        },
        {
            name: 'matcher filter: only matching tool fires handler',
            fn: async () => {
                const bus = new HookBus();
                const seen: string[] = [];
                bus.on('pre_tool_use', (ctx) => { seen.push(ctx.toolName); }, /^vault\./);
                await bus.fire('pre_tool_use', { loopId: 'L', stepIndex: 0, tier: 'fast', toolName: 'web.fetch', toolCallId: 'a', args: {} }, 'web.fetch');
                await bus.fire('pre_tool_use', { loopId: 'L', stepIndex: 0, tier: 'fast', toolName: 'vault.read', toolCallId: 'b', args: {} }, 'vault.read');
                assert.deepStrictEqual(seen, ['vault.read']);
            },
        },
        {
            name: 'block short-circuits remaining handlers',
            fn: async () => {
                const bus = new HookBus();
                let secondRan = false;
                bus.on('pre_tool_use', () => ({ kind: 'block', reason: 'nope' }));
                bus.on('pre_tool_use', () => { secondRan = true; });
                const r = await bus.fire('pre_tool_use', { loopId: 'L', stepIndex: 0, tier: 'fast', toolName: 't', toolCallId: 'c', args: {} }, 't');
                assert.strictEqual(r.kind, 'block');
                assert.strictEqual(secondRan, false);
            },
        },
        {
            name: 'handler that throws is converted to block',
            fn: async () => {
                const bus = new HookBus();
                bus.on('pre_tool_use', () => { throw new Error('boom'); });
                const r = await bus.fire('pre_tool_use', { loopId: 'L', stepIndex: 0, tier: 'fast', toolName: 't', toolCallId: 'c', args: {} }, 't');
                assert.strictEqual(r.kind, 'block');
                if (r.kind === 'block') assert.match(r.reason, /boom/);
            },
        },
        {
            name: 'AgentLoop: pre_tool_use block prevents execution, surfaces error',
            fn: async () => {
                const executed = { count: 0 };
                const bindings: TierBindings = { 'fast': makeToolThenStopBinding('vault.write', {}) };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const bus = new HookBus();
                bus.on('pre_tool_use', () => ({ kind: 'block', reason: 'unsafe path' }), 'vault.write');
                const result = await runAgentLoop({
                    loopId: 'H1',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'write' }],
                    tools: [mkTool('vault.write', executed)],
                    tierController: controller,
                    hooks: bus,
                });
                assert.strictEqual(executed.count, 0);
                const tr = result.steps[0].toolResults[0];
                assert.strictEqual(tr.ok, false);
                assert.match(String(tr.payload), /pre_tool_use hook/);
                assert.match(String(tr.payload), /unsafe path/);
            },
        },
        {
            name: 'AgentLoop: post_tool_use modify replaces result',
            fn: async () => {
                const executed = { count: 0 };
                const bindings: TierBindings = {
                    'fast': makeToolThenStopBinding('vault.read', {}),
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const bus = new HookBus();
                bus.on('post_tool_use', () => ({
                    kind: 'modify',
                    result: { ok: true as const, data: { redacted: true } },
                }), 'vault.read');
                const result = await runAgentLoop({
                    loopId: 'H2',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'read' }],
                    tools: [mkTool('vault.read', executed, { secret: 'leak' })],
                    tierController: controller,
                    hooks: bus,
                });
                assert.strictEqual(executed.count, 1);
                const tr = result.steps[0].toolResults[0];
                assert.strictEqual(tr.ok, true);
                assert.deepStrictEqual(tr.payload, { redacted: true });
            },
        },
        {
            name: 'AgentLoop: matcher filters apply at loop layer',
            fn: async () => {
                const executed = { count: 0 };
                const blocked: string[] = [];
                const bindings: TierBindings = {
                    'fast': makeToolThenStopBinding('safe.tool', {}),
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const bus = new HookBus();
                bus.on('pre_tool_use', (ctx) => {
                    blocked.push(ctx.toolName);
                    return { kind: 'block', reason: 'should not fire' };
                }, 'other.tool');
                const result = await runAgentLoop({
                    loopId: 'H3',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [mkTool('safe.tool', executed)],
                    tierController: controller,
                    hooks: bus,
                });
                assert.strictEqual(blocked.length, 0);
                assert.strictEqual(executed.count, 1);
                assert.strictEqual(result.finishReason, 'stop');
            },
        },
        {
            name: 'AgentLoop: session_start and stop hooks fire',
            fn: async () => {
                const events: string[] = [];
                const bindings: TierBindings = { 'fast': stopBinding('hi') };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const bus = new HookBus();
                bus.on('session_start', (ctx) => { events.push(`start:${ctx.loopId}`); });
                bus.on('stop', (ctx) => { events.push(`stop:${ctx.loopId}`); });
                await runAgentLoop({
                    loopId: 'H4',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'q' }],
                    tools: [],
                    tierController: controller,
                    hooks: bus,
                });
                assert.deepStrictEqual(events, ['start:H4', 'stop:H4']);
            },
        },
        {
            name: 'AgentLoop: session_start block aborts loop with hook_block reason',
            fn: async () => {
                const bindings: TierBindings = { 'fast': stopBinding('never') };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const bus = new HookBus();
                bus.on('session_start', () => ({ kind: 'block', reason: 'maintenance' }));
                const result = await runAgentLoop({
                    loopId: 'H5',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'q' }],
                    tools: [],
                    tierController: controller,
                    hooks: bus,
                });
                assert.strictEqual(result.finishReason, 'hook_block');
                assert.strictEqual(result.steps.length, 0);
                assert.match(String(result.error), /maintenance/);
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
