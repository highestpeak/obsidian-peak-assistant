import assert from 'assert';
import { TierController } from '@/service/agents/harness/tier/TierController';
import type { TierBindings } from '@/service/agents/harness/tier/types';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type { StepResult } from '@/service/agents/harness/trace/events';

function fakeBinding(tier: 'local-fast' | 'local-deep' | 'online') {
    return {
        tier,
        providerId: `provider-${tier}`,
        modelId: `model-${tier}`,
        resolve: () => ({} as any),
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function step(over: Partial<StepResult> = {}): StepResult {
    return {
        loopId: 'L',
        stepIndex: 0,
        tier: 'local-fast',
        modelId: 'm',
        providerId: 'p',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        toolCalls: [],
        toolResults: [],
        text: 'ok',
        finishReason: 'stop',
        durationMs: 0,
        ...over,
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [
        {
            name: 'starts at preferred tier when bound',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                    'local-deep': fakeBinding('local-deep'),
                    online: fakeBinding('online'),
                };
                const c = new TierController({ bindings, policy: { preferred: 'local-fast' } });
                assert.strictEqual(c.currentTier(), 'local-fast');
            },
        },
        {
            name: 'falls forward when preferred tier unbound',
            fn: () => {
                const bindings: TierBindings = {
                    'local-deep': fakeBinding('local-deep'),
                    online: fakeBinding('online'),
                };
                const c = new TierController({ bindings, policy: { preferred: 'local-fast' } });
                assert.strictEqual(c.currentTier(), 'local-deep');
            },
        },
        {
            name: 'throws when no bindings at all',
            fn: () => {
                assert.throws(() => new TierController({ bindings: {} }), /No usable tier bindings/);
            },
        },
        {
            name: 'auto-escalates on low score below threshold',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                    online: fakeBinding('online'),
                };
                const trace = new TraceBus();
                let upgraded = 0;
                trace.on('tier_escalate', () => { upgraded += 1; });
                const c = new TierController({
                    bindings,
                    trace,
                    loopId: 'L',
                    policy: { preferred: 'local-fast', escalationThreshold: 0.95, maxEscalationsPerLoop: 1 },
                });
                // step with one failed tool → low schema pass-rate → low score
                const bad = step({
                    toolCalls: [{ toolName: 't', toolCallId: '1', args: {} }],
                    toolResults: [{ toolName: 't', toolCallId: '1', ok: false, payload: 'err', durationMs: 1 }],
                });
                c.onStepFinish(bad);
                assert.strictEqual(c.currentTier(), 'online');
                assert.strictEqual(upgraded, 1);
                assert.strictEqual(c.escalationCount(), 1);
            },
        },
        {
            name: 'respects maxEscalationsPerLoop cap',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                    'local-deep': fakeBinding('local-deep'),
                    online: fakeBinding('online'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'local-fast', escalationThreshold: 1.0, maxEscalationsPerLoop: 1 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'local-deep');
                c.onStepFinish(step({ text: "I'm not sure" }));
                // cap hit → stays at local-deep
                assert.strictEqual(c.currentTier(), 'local-deep');
            },
        },
        {
            name: 'no escalation when allowEscalation=false',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                    online: fakeBinding('online'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'local-fast', allowEscalation: false, escalationThreshold: 1.0 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'local-fast');
            },
        },
        {
            name: 'no escalation when already at top bound tier',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'local-fast', escalationThreshold: 1.0 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'local-fast');
            },
        },
        {
            name: 'forcedScore=0 forces upgrade (escalate tool path)',
            fn: () => {
                const bindings: TierBindings = {
                    'local-fast': fakeBinding('local-fast'),
                    online: fakeBinding('online'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'local-fast', escalationThreshold: 0.6 },
                });
                c.onStepFinish(step({ text: 'normal answer' }), { forcedScore: 0 });
                assert.strictEqual(c.currentTier(), 'online');
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
            console.error(`    ${(err as Error).message}`);
            failed += 1;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

void run();
