import assert from 'assert';
import { z } from 'zod';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type { PermissionRule } from '@/service/agents/harness/permission/types';
import { makeStreamModel, textStepChunks, toolStepChunks } from './harness-fixtures/mockStreamModel';

/** Mock a model that emits one tool call then a stop step. */
function makeToolThenStopBinding(toolName: string, args: any, finalText = 'done'): TierBinding {
    const model = makeStreamModel('m', [
        toolStepChunks({ toolName, input: args }),
        textStepChunks({ text: finalText }),
    ]);
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId: 'm',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function mkTool(name: string, kind: ToolDef['kind'], executed: { count: number }): ToolDef {
    return {
        name,
        description: `tool ${name}`,
        inputSchema: z.object({ value: z.string().optional() }),
        kind,
        async execute(args: any) {
            executed.count += 1;
            return { ok: true as const, data: { echo: args.value ?? '' } };
        },
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
        {
            name: 'pure check: deny rule wins over allow rule',
            fn: () => {
                const rules: PermissionRule[] = [
                    { tool: 'vault.delete', effect: 'deny', reason: 'destructive' },
                    { tool: /.*/, effect: 'allow' },
                ];
                const guard = new PermissionGuard({ mode: 'acceptEdits', rules });
                const d = guard.check({ name: 'vault.delete', kind: 'destructive' }, {});
                assert.strictEqual(d.decision, 'deny');
                if (d.decision === 'deny') assert.match(d.reason, /destructive/);
            },
        },
        {
            name: 'deny-first invariant: bypassPermissions cannot override deny rule',
            fn: () => {
                const rules: PermissionRule[] = [
                    { tool: /^danger\./, effect: 'deny', reason: 'always blocked' },
                ];
                const guard = new PermissionGuard({ mode: 'bypassPermissions', rules });
                const d = guard.check({ name: 'danger.exec', kind: 'destructive' }, {});
                assert.strictEqual(d.decision, 'deny', 'bypassPermissions must NOT bypass deny rules');
                // sanity: non-denied tool is allowed
                const ok = guard.check({ name: 'safe.read', kind: 'read' }, {});
                assert.strictEqual(ok.decision, 'allow');
            },
        },
        {
            name: 'read mode rejects edit/destructive tools, allows read',
            fn: () => {
                const guard = new PermissionGuard({ mode: 'read' });
                assert.strictEqual(guard.check({ name: 'r', kind: 'read' }, {}).decision, 'allow');
                assert.strictEqual(guard.check({ name: 'e', kind: 'edit' }, {}).decision, 'deny');
                assert.strictEqual(guard.check({ name: 'd', kind: 'destructive' }, {}).decision, 'deny');
                // meta tools (escalate, subagent) should be allowed even in read mode
                assert.strictEqual(guard.check({ name: 'm', kind: 'meta' }, {}).decision, 'allow');
            },
        },
        {
            name: 'argsPredicate on rule gates the match',
            fn: () => {
                const rules: PermissionRule[] = [
                    {
                        tool: 'vault.write',
                        effect: 'deny',
                        reason: 'outside vault',
                        when: (a: any) => typeof a?.path === 'string' && a.path.startsWith('/etc/'),
                    },
                ];
                const guard = new PermissionGuard({ mode: 'acceptEdits', rules });
                assert.strictEqual(
                    guard.check({ name: 'vault.write', kind: 'edit' }, { path: '/etc/passwd' }).decision,
                    'deny',
                );
                assert.strictEqual(
                    guard.check({ name: 'vault.write', kind: 'edit' }, { path: 'notes/x.md' }).decision,
                    'allow',
                );
            },
        },
        {
            name: 'AgentLoop: permission deny returns tool error to model, does not execute',
            fn: async () => {
                const executed = { count: 0 };
                const bindings: TierBindings = {
                    'fast': makeToolThenStopBinding('vault.delete', { value: 'x' }),
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const guard = new PermissionGuard({
                    mode: 'acceptEdits',
                    rules: [{ tool: 'vault.delete', effect: 'deny', reason: 'destructive in test' }],
                });
                const result = await runAgentLoop({
                    loopId: 'P1',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'rm it' }],
                    tools: [mkTool('vault.delete', 'destructive', executed)],
                    tierController: controller,
                    permission: guard,
                });
                assert.strictEqual(executed.count, 0, 'denied tool must not execute');
                const tr = result.steps[0].toolResults[0];
                assert.strictEqual(tr.ok, false);
                assert.match(String(tr.payload), /permission denied/);
            },
        },
        {
            name: 'AgentLoop: bypassPermissions still blocks denied tool',
            fn: async () => {
                const executed = { count: 0 };
                const bindings: TierBindings = {
                    'fast': makeToolThenStopBinding('danger.exec', {}),
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const guard = new PermissionGuard({
                    mode: 'bypassPermissions',
                    rules: [{ tool: /^danger\./, effect: 'deny', reason: 'sandbox' }],
                });
                const result = await runAgentLoop({
                    loopId: 'P2',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'run it' }],
                    tools: [mkTool('danger.exec', 'destructive', executed)],
                    tierController: controller,
                    permission: guard,
                });
                assert.strictEqual(executed.count, 0, 'deny rule survives bypassPermissions');
                assert.match(String(result.steps[0].toolResults[0].payload), /permission denied/);
            },
        },
        {
            name: 'AgentLoop: read mode rejects write tool without explicit rule',
            fn: async () => {
                const executed = { count: 0 };
                const bindings: TierBindings = {
                    'fast': makeToolThenStopBinding('vault.write', { value: 'data' }),
                };
                const controller = new TierController({ bindings, policy: { allowEscalation: false } });
                const guard = new PermissionGuard({ mode: 'read' });
                const result = await runAgentLoop({
                    loopId: 'P3',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'write' }],
                    tools: [mkTool('vault.write', 'edit', executed)],
                    tierController: controller,
                    permission: guard,
                });
                assert.strictEqual(executed.count, 0, 'edit tool blocked by read mode');
                assert.match(String(result.steps[0].toolResults[0].payload), /read-only/);
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
