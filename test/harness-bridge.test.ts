/**
 * Tests for ClaudeAgentSDKBridge.
 *
 * Post 2026-07 SDK-backend retirement the bridge has one path: it wraps
 * runAgentLoop in a RunEnvelope. The pre-retirement `useSDK` branch is gone;
 * these tests exercise the single path and the AgentLoopResult shape.
 */

import assert from 'assert';
import { ClaudeAgentSDKBridge } from '@/service/agents/harness-bridge/ClaudeAgentSDKBridge';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import { DEFAULT_HARNESS_SETTINGS } from '@/core/config/settingsTypes';
import type { TierBinding, TierBindings } from '@/service/agents/harness/tier/types';
import type { AppHandle } from '@/core/ports/AppHandle';
import { makeStreamModel, textStepChunks } from './harness-fixtures/mockStreamModel';

// Minimal stub satisfying BridgeRunConfig.app (T11J B1: bridge no longer reads AppContext).
const STUB_APP = {} as unknown as AppHandle;
const STUB_PLUGIN_ID = 'peak-assistant-test';

function makeBinding(text: string): TierBinding {
    const model = makeStreamModel('mock-fast', [textStepChunks({ text })]);
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId: 'mock-fast',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function makeTierController(text: string): TierController {
    const bindings: TierBindings = {
        'fast': makeBinding(text),
    };
    return new TierController({ bindings, policy: { preferred: 'fast' } });
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

// ─── default settings still route to harness ─────────────────────────────────

async function testDefaultUsesHarness() {
    const bridge = new ClaudeAgentSDKBridge();
    const result = await bridge.run({
        loopId: 'bridge-default-1',
        systemPrompt: 'System.',
        initialMessages: [{ role: 'user', content: 'ping' }],
        tools: [],
        tierController: makeTierController('pong'),
        app: STUB_APP,
        pluginId: STUB_PLUGIN_ID,
        harnessSettings: DEFAULT_HARNESS_SETTINGS,
    });

    assert.strictEqual(result.finalText, 'pong', 'default routes to harness');
    console.log('[harness-bridge] default settings → harness: PASS');
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
