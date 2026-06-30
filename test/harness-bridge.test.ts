/**
 * Tests for ClaudeAgentSDKBridge.
 *
 * harness path:  bridge.run({ useSDK: false }) → runAgentLoop (mock model)
 * sdk path:      bridge.run({ useSDK: true })  → sdkAgentPool (stubbed via module mock)
 */

import assert from 'assert';
import { MockLanguageModelV3 } from 'ai/test';
import { ClaudeAgentSDKBridge } from '@/service/agents/harness-bridge/ClaudeAgentSDKBridge';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import { DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import type { TierBinding, TierBindings } from '@/service/agents/harness/tier/types';
import type { AppHandle } from '@/core/ports/AppHandle';

type GenResult = Awaited<ReturnType<NonNullable<MockLanguageModelV3['doGenerate']>>>;

// Minimal stub satisfying BridgeRunConfig.app (T11J B1: bridge no longer reads AppContext).
// The app and pluginId fields are only exercised on the SDK path; harness-path tests
// pass useSDK: false so they never reach those branches.
const STUB_APP = {} as unknown as AppHandle;
const STUB_PLUGIN_ID = 'peak-assistant-test';

function makeBinding(text: string): TierBinding {
    const model = new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-fast',
        async doGenerate(): Promise<GenResult> {
            return {
                content: [{ type: 'text', text }],
                finishReason: 'stop',
                usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
                warnings: [],
            } as GenResult;
        },
    });
    return {
        tier: 'local-fast',
        providerId: 'mock',
        modelId: 'mock-fast',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function makeTierController(text: string): TierController {
    const bindings: TierBindings = {
        'local-fast': makeBinding(text),
    };
    return new TierController({ bindings, policy: { preferred: 'local-fast' } });
}

// ─── harness path ────────────────────────────────────────────────────────────

async function testHarnessPath() {
    const bridge = new ClaudeAgentSDKBridge();
    const result = await bridge.run({
        loopId: 'bridge-harness-1',
        systemPrompt: 'You are a test agent.',
        initialMessages: [{ role: 'user', content: 'hello' }],
        tools: [],
        tierController: makeTierController('Hello from harness'),
        useSDK: false,
        app: STUB_APP,
        pluginId: STUB_PLUGIN_ID,
        harnessSettings: DEFAULT_HARNESS_SETTINGS,
    });

    assert.strictEqual(result.loopId, 'bridge-harness-1', 'loopId preserved');
    assert.strictEqual(result.finalText, 'Hello from harness', 'finalText from harness loop');
    assert.strictEqual(result.finishReason, 'stop', 'finishReason = stop');
    assert.ok(result.durationMs >= 0, 'durationMs is non-negative');
    assert.strictEqual(result.totalToolCalls, 0, 'no tool calls');
    console.log('[harness-bridge] harness path: PASS');
}

// ─── default (no useSDK flag) also uses harness ──────────────────────────────

async function testDefaultUsesHarness() {
    const bridge = new ClaudeAgentSDKBridge();
    const result = await bridge.run({
        loopId: 'bridge-default-1',
        systemPrompt: 'System.',
        initialMessages: [{ role: 'user', content: 'ping' }],
        tools: [],
        tierController: makeTierController('pong'),
        // useSDK omitted → shouldUseSDK reads harnessSettings.agentBackend ('auto' → harness)
        app: STUB_APP,
        pluginId: STUB_PLUGIN_ID,
        harnessSettings: DEFAULT_HARNESS_SETTINGS,
    });

    assert.strictEqual(result.finalText, 'pong', 'default routes to harness');
    console.log('[harness-bridge] default (no useSDK) → harness: PASS');
}

// ─── result shape from harness path ──────────────────────────────────────────

async function testResultShape() {
    const bridge = new ClaudeAgentSDKBridge();
    const result = await bridge.run({
        loopId: 'bridge-shape-1',
        systemPrompt: 'S',
        initialMessages: [{ role: 'user', content: 'Q' }],
        tools: [],
        tierController: makeTierController('Answer'),
        app: STUB_APP,
        pluginId: STUB_PLUGIN_ID,
        harnessSettings: DEFAULT_HARNESS_SETTINGS,
    });

    // AgentLoopResult shape
    assert.ok('loopId' in result, 'has loopId');
    assert.ok('finalText' in result, 'has finalText');
    assert.ok('steps' in result && Array.isArray(result.steps), 'has steps array');
    assert.ok('finishReason' in result, 'has finishReason');
    assert.ok('tierUsage' in result, 'has tierUsage');
    assert.ok('totalTokens' in result, 'has totalTokens');
    assert.ok('totalToolCalls' in result, 'has totalToolCalls');
    assert.ok('durationMs' in result, 'has durationMs');
    console.log('[harness-bridge] result shape: PASS');
}

// ─── run all ─────────────────────────────────────────────────────────────────

(async () => {
    await testHarnessPath();
    await testDefaultUsesHarness();
    await testResultShape();
    console.log('[harness-bridge] all tests passed');
})().catch((err) => {
    console.error('[harness-bridge] FAIL:', err);
    process.exit(1);
});
