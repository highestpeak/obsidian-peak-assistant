/**
 * Vault Search harness cutover guard.
 *
 * Covers the 2026-07-04 migration from Claude Agent SDK `query()`
 * orchestration to the self-hosted harness `runAgentLoop`:
 *   1. buildVaultHarnessTools produces harness ToolDefs that runAgentLoop
 *      accepts and executes.
 *   2. When the model calls vault_submit_plan, the loop terminates via
 *      `stopWhen` — no extra assistant turn is generated.
 *   3. The submit_plan tool_call trace preserves `plan_sections`,
 *      `follow_up_questions`, and `proposed_outline`, which is what the
 *      Quick Search dispatcher reads to trigger `plan_ready`.
 *   4. Both VaultSearchAgent and ContinueAnalysisAgent no longer import or
 *      instantiate VaultSearchAgentSDK.
 *   5. The legacy VaultSearchAgentSDK.ts file has been removed.
 */

import assert from 'assert';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBinding, TierBindings } from '@/service/agents/harness/tier/types';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type { ToolCallTrace, ToolResultTrace } from '@/service/agents/harness/trace/events';
import {
    buildVaultHarnessTools,
    createSubmitPlanState,
    VAULT_SUBMIT_PLAN_TOOL_NAME,
} from '@/service/agents/vault/vaultHarnessTools';
import { makeStreamModel, textStepChunks, toolStepChunks, type StepChunks } from './harness-fixtures/mockStreamModel';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeApp() {
    const files = [
        { path: 'projects/a.md', basename: 'a', extension: 'md' },
        { path: 'projects/b.md', basename: 'b', extension: 'md' },
        { path: 'notes/c.md', basename: 'c', extension: 'md' },
    ];
    return {
        vault: {
            getMarkdownFiles: () => files,
            getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
            cachedRead: async () => '# body',
        },
        metadataCache: {
            getFileCache: () => ({ frontmatter: {}, links: [], tags: [] }),
            getFirstLinkpathDest: () => null,
        },
    } as any;
}

function samplePlan() {
    return {
        selected_paths: ['projects/a.md'],
        rationale: 'projects/a.md: primary source of evidence',
        proposed_outline: 'Intro → Method → Findings',
        coverage_assessment: 'good',
        follow_up_questions: ['what next?', 'what risk?', 'what source?'],
        plan_sections: [
            {
                id: 's1',
                title: 'Findings',
                content_type: 'analysis',
                visual_type: 'none',
                evidence_paths: ['projects/a.md'],
                brief: 'Summarise the main findings.',
                weight: 8,
                mission_role: 'synthesis',
            },
        ],
    };
}

function submitPlanModelBinding(planInput: any, extraCalls = 0): TierBinding {
    const steps: StepChunks[] = [];
    for (let i = 1; i <= extraCalls; i++) {
        steps.push(
            toolStepChunks({
                toolName: 'mcp__vault__vault_grep',
                input: { query: 'context', limit: 5 },
                toolCallId: `grep-${i}`,
            }),
        );
    }
    steps.push(
        toolStepChunks({
            toolName: VAULT_SUBMIT_PLAN_TOOL_NAME,
            input: planInput,
            toolCallId: 'plan-1',
        }),
    );
    // Overflow guard: should not be consumed because stopWhen fires first.
    steps.push(textStepChunks({ text: 'unexpected extra step' }));
    const model = makeStreamModel('vault-mock', steps);
    return {
        tier: 'local-deep',
        providerId: 'mock',
        modelId: 'vault-mock',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

function buildTools() {
    const submitState = createSubmitPlanState();
    const tools = buildVaultHarnessTools({
        app: makeApp(),
        searchFn: async (query, limit) => [{ path: 'projects/a.md', snippet: query, score: limit }],
        analysisHistory: { list: async () => [], get: async () => null } as any,
        onSubmitPlan: async (plan) => ({
            approved: true,
            adjustedPaths: plan.selected_paths,
            adjustedOutline: plan.proposed_outline,
        }),
        submitState,
    });
    return { tools, submitState };
}

// ─── Tests ────────────────────────────────────────────────────────────────

async function testSubmitPlanStopsLoop() {
    const plan = samplePlan();
    const bindings: TierBindings = { 'local-deep': submitPlanModelBinding(plan) };
    const controller = new TierController({
        bindings,
        policy: { preferred: 'local-deep', allowEscalation: false },
    });
    const { tools, submitState } = buildTools();

    const result = await runAgentLoop({
        loopId: 'vault-1',
        systemPrompt: 'vault playbook',
        initialMessages: [{ role: 'user', content: 'analyse the projects folder' }],
        tools,
        tierController: controller,
        budget: { maxSteps: 5, maxTokens: 100_000, maxToolCalls: 10 },
        stopWhen: (step) =>
            step.toolResults.some(
                (r) => r.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME && r.ok === true,
            ),
    });

    assert.strictEqual(result.finishReason, 'stop', 'stopWhen terminates loop after submit_plan');
    assert.strictEqual(result.steps.length, 1, 'no extra assistant turn after submit_plan');
    const step = result.steps[0];
    assert.strictEqual(step.toolCalls.length, 1, 'exactly one tool call this step');
    assert.strictEqual(step.toolCalls[0].toolName, VAULT_SUBMIT_PLAN_TOOL_NAME);
    assert.strictEqual(step.toolResults[0].ok, true, 'submit_plan tool returned ok');
    assert.strictEqual(submitState.submitted, true, 'submit state records the call');
    assert.deepStrictEqual(submitState.plans[0].plan_sections, plan.plan_sections);
    console.log('  ✓ submit_plan terminates loop via stopWhen');
}

async function testTraceExposesSubmitInput() {
    const plan = samplePlan();
    const bindings: TierBindings = { 'local-deep': submitPlanModelBinding(plan) };
    const controller = new TierController({
        bindings,
        policy: { preferred: 'local-deep', allowEscalation: false },
    });
    const { tools } = buildTools();

    // Mirror the trace subscription VaultSearchAgent installs: translate
    // tool_call trace events into LLMStreamEvent-shaped envelopes and
    // assert the submit_plan input is preserved end-to-end.
    const trace = new TraceBus();
    const toolCalls: Array<{ toolName: string; input: unknown }> = [];
    const toolResults: Array<{ toolName: string; ok: boolean }> = [];
    trace.on('tool_call', (call: ToolCallTrace & { loopId: string; stepIndex: number }) => {
        toolCalls.push({ toolName: call.toolName, input: call.args });
    });
    trace.on('tool_result', (res: ToolResultTrace & { loopId: string; stepIndex: number }) => {
        toolResults.push({ toolName: res.toolName, ok: res.ok });
    });

    await runAgentLoop({
        loopId: 'vault-2',
        systemPrompt: '',
        initialMessages: [{ role: 'user', content: 'go' }],
        tools,
        tierController: controller,
        trace,
        budget: { maxSteps: 3, maxTokens: 100_000, maxToolCalls: 10 },
        stopWhen: (step) =>
            step.toolResults.some(
                (r) => r.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME && r.ok === true,
            ),
    });

    const submitCall = toolCalls.find((c) => c.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME);
    assert.ok(submitCall, 'trace surfaces submit_plan tool_call event');
    const args = submitCall!.input as any;
    assert.ok(args, 'tool_call carries args payload');
    assert.ok(Array.isArray(args.plan_sections), 'plan_sections preserved');
    assert.strictEqual(args.plan_sections[0].id, 's1');
    assert.strictEqual(args.proposed_outline, plan.proposed_outline);
    assert.deepStrictEqual(args.follow_up_questions, plan.follow_up_questions);

    const submitResult = toolResults.find((r) => r.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME);
    assert.ok(submitResult, 'trace surfaces submit_plan tool_result event');
    assert.strictEqual(submitResult!.ok, true);
    console.log('  ✓ trace preserves plan_sections / proposed_outline for dispatcher');
}

async function testReadToolThenSubmitPlan() {
    const plan = samplePlan();
    const bindings: TierBindings = { 'local-deep': submitPlanModelBinding(plan, 1) };
    const controller = new TierController({
        bindings,
        policy: { preferred: 'local-deep', allowEscalation: false },
    });
    const { tools } = buildTools();

    const trace = new TraceBus();
    const toolNamesSeen: string[] = [];
    trace.on('tool_call', (call: ToolCallTrace & { loopId: string; stepIndex: number }) => {
        toolNamesSeen.push(call.toolName);
    });

    const result = await runAgentLoop({
        loopId: 'vault-3',
        systemPrompt: '',
        initialMessages: [{ role: 'user', content: 'go' }],
        tools,
        tierController: controller,
        trace,
        budget: { maxSteps: 5, maxTokens: 100_000, maxToolCalls: 10 },
        stopWhen: (step) =>
            step.toolResults.some(
                (r) => r.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME && r.ok === true,
            ),
    });

    assert.deepStrictEqual(
        toolNamesSeen,
        ['mcp__vault__vault_grep', VAULT_SUBMIT_PLAN_TOOL_NAME],
        'read tool executes before submit_plan',
    );
    assert.strictEqual(result.finishReason, 'stop');
    console.log('  ✓ vault_grep executes then submit_plan terminates');
}

async function testCutoverImportGuards() {
    const sdkPath = path.join(PROJECT_ROOT, 'src/service/agents/VaultSearchAgentSDK.ts');
    assert.strictEqual(existsSync(sdkPath), false, 'VaultSearchAgentSDK.ts is deleted');

    const vaultAgentSource = readFileSync(
        path.join(PROJECT_ROOT, 'src/service/agents/VaultSearchAgent.ts'),
        'utf8',
    );
    assert.ok(
        !/from ['"](?:\.\/|@\/service\/agents\/)VaultSearchAgentSDK['"]/.test(vaultAgentSource),
        'VaultSearchAgent.ts does not import VaultSearchAgentSDK',
    );
    assert.ok(
        !/new VaultSearchAgentSDK\b/.test(vaultAgentSource),
        'VaultSearchAgent.ts does not instantiate VaultSearchAgentSDK',
    );
    assert.ok(
        /runAgentLoop/.test(vaultAgentSource),
        'VaultSearchAgent.ts routes through runAgentLoop',
    );
    assert.ok(
        /buildVaultHarnessTools/.test(vaultAgentSource),
        'VaultSearchAgent.ts builds harness tools',
    );

    const continueSource = readFileSync(
        path.join(PROJECT_ROOT, 'src/service/agents/ContinueAnalysisAgent.ts'),
        'utf8',
    );
    assert.ok(
        !/from ['"](?:\.\/|@\/service\/agents\/)VaultSearchAgentSDK['"]/.test(continueSource),
        'ContinueAnalysisAgent.ts does not import VaultSearchAgentSDK',
    );
    assert.ok(
        !/new VaultSearchAgentSDK\b/.test(continueSource),
        'ContinueAnalysisAgent.ts does not instantiate VaultSearchAgentSDK',
    );
    assert.ok(
        /new VaultSearchAgent\b/.test(continueSource),
        'ContinueAnalysisAgent.ts routes through the harness VaultSearchAgent',
    );
    console.log('  ✓ cutover import guards hold');
}

// ─── Runner ───────────────────────────────────────────────────────────────

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => Promise<void> }> = [
        { name: 'submit_plan terminates loop via stopWhen', fn: testSubmitPlanStopsLoop },
        { name: 'trace preserves submit_plan input for dispatcher', fn: testTraceExposesSubmitInput },
        { name: 'vault_grep then submit_plan', fn: testReadToolThenSubmitPlan },
        { name: 'cutover import guards', fn: testCutoverImportGuards },
    ];

    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            passed += 1;
        } catch (err) {
            console.error(`  ✗ ${t.name}`);
            console.error(`    ${(err as Error).stack ?? (err as Error).message}`);
            failed += 1;
        }
    }
    console.log(`\nvault-search-harness: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

void run();
