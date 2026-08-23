import assert from 'assert';
import { TierController } from '@/service/agents/harness/tier/TierController';
import type { TierBindings } from '@/service/agents/harness/tier/types';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type { StepResult } from '@/service/agents/harness/trace/events';

function fakeBinding(tier: 'fast' | 'research' | 'stronger') {
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
        tier: 'fast',
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
                    'fast': fakeBinding('fast'),
                    'research': fakeBinding('research'),
                    stronger: fakeBinding('stronger'),
                };
                const c = new TierController({ bindings, policy: { preferred: 'fast' } });
                assert.strictEqual(c.currentTier(), 'fast');
            },
        },
        {
			name: 'rejects when preferred tier is unbound',
            fn: () => {
                const bindings: TierBindings = {
                    'research': fakeBinding('research'),
                    stronger: fakeBinding('stronger'),
                };
				assert.throws(() => new TierController({ bindings, policy: { preferred: 'fast' } }), /runtime fallback is disabled/i);
            },
        },
        {
            name: 'throws when no bindings at all',
            fn: () => {
				assert.throws(() => new TierController({ bindings: {} }), /runtime fallback is disabled/i);
            },
        },
        {
            name: 'auto-escalates on low score below threshold',
            fn: () => {
                const bindings: TierBindings = {
                    'fast': fakeBinding('fast'),
                    stronger: fakeBinding('stronger'),
                };
                const trace = new TraceBus();
                let upgraded = 0;
                trace.on('tier_escalate', () => { upgraded += 1; });
                const c = new TierController({
                    bindings,
                    trace,
                    loopId: 'L',
                    policy: { preferred: 'fast', escalationThreshold: 0.95, maxEscalationsPerLoop: 1 },
                });
                // step with one failed tool → low schema pass-rate → low score
                const bad = step({
                    toolCalls: [{ toolName: 't', toolCallId: '1', args: {} }],
                    toolResults: [{ toolName: 't', toolCallId: '1', ok: false, payload: 'err', durationMs: 1 }],
                });
                c.onStepFinish(bad);
                assert.strictEqual(c.currentTier(), 'stronger');
                assert.strictEqual(upgraded, 1);
                assert.strictEqual(c.escalationCount(), 1);
            },
        },
        {
            name: 'respects maxEscalationsPerLoop cap',
            fn: () => {
                const bindings: TierBindings = {
                    'fast': fakeBinding('fast'),
                    'research': fakeBinding('research'),
                    stronger: fakeBinding('stronger'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'fast', escalationThreshold: 1.0, maxEscalationsPerLoop: 1 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'research');
                c.onStepFinish(step({ text: "I'm not sure" }));
                // cap hit → stays at local-deep
                assert.strictEqual(c.currentTier(), 'research');
            },
        },
        {
            name: 'no escalation when allowEscalation=false',
            fn: () => {
                const bindings: TierBindings = {
                    'fast': fakeBinding('fast'),
                    stronger: fakeBinding('stronger'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'fast', allowEscalation: false, escalationThreshold: 1.0 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'fast');
            },
        },
        {
            name: 'no escalation when already at top bound tier',
            fn: () => {
                const bindings: TierBindings = {
                    'fast': fakeBinding('fast'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'fast', escalationThreshold: 1.0 },
                });
                c.onStepFinish(step({ text: "I'm not sure" }));
                assert.strictEqual(c.currentTier(), 'fast');
            },
        },
        {
            name: 'forcedScore=0 forces upgrade (escalate tool path)',
            fn: () => {
                const bindings: TierBindings = {
                    'fast': fakeBinding('fast'),
                    stronger: fakeBinding('stronger'),
                };
                const c = new TierController({
                    bindings,
                    policy: { preferred: 'fast', escalationThreshold: 0.6 },
                });
                c.onStepFinish(step({ text: 'normal answer' }), { forcedScore: 0 });
                assert.strictEqual(c.currentTier(), 'stronger');
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
