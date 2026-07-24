/**
 * M3 — ContextManager behavior + AgentLoop integration.
 *
 * Covers:
 *   - estimateTokens consistency on the chars/4 heuristic shared with
 *     service/chat/token-estimation.ts.
 *   - compactIfNeeded is a no-op under threshold.
 *   - Over-threshold drops evictable blocks lowest-priority-first.
 *   - Sliding window keeps system + last N non-system messages.
 *   - Agent loop wires ContextManager + MemoryStore and emits
 *     `context_compacted` traces.
 */

import assert from 'assert';
import type { ModelMessage } from 'ai';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { DEFAULT_TIER_CAPABILITIES } from '@/service/agents/harness/tier/types';
import type { TierBindings, TierBinding } from '@/service/agents/harness/tier/types';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type { ContextCompactedEvent } from '@/service/agents/harness/trace/events';
import { ContextManager } from '@/service/agents/harness/context/ContextManager';
import {
    MemoryStore,
    createMemoryBlock,
} from '@/service/agents/harness/memory';
import { makeStreamModel, textStepChunks } from './harness-fixtures/mockStreamModel';

function makeStopBinding(text: string): TierBinding {
    const model = makeStreamModel('m', [textStepChunks({ text })]);
    return {
        tier: 'fast',
        providerId: 'mock',
        modelId: 'm',
        resolve: () => model,
        capabilities: { ...DEFAULT_TIER_CAPABILITIES },
        estimatedSingleStepP: 0.9,
    };
}

async function run(): Promise<void> {
    const tests: Array<{ name: string; fn: () => Promise<void> }> = [
        {
            name: 'estimateTokens returns positive count and grows with content',
            fn: async () => {
                const cm = new ContextManager({ maxTokens: 1000 });
                const short = cm.estimateTokens([
                    { role: 'user', content: 'hi' },
                ]);
                const long = cm.estimateTokens([
                    { role: 'user', content: 'x'.repeat(400) },
                ]);
                assert.ok(short > 0);
                assert.ok(long > short);
                // chars/4 + 10 framing overhead = (400 + 10) / 4 ≈ 103.
                assert.ok(long >= 100 && long <= 110, `expected ~103, got ${long}`);
            },
        },
        {
            name: 'estimateTokens counts memory blocks alongside messages',
            fn: async () => {
                const cm = new ContextManager({ maxTokens: 1000 });
                const msgs: ModelMessage[] = [{ role: 'user', content: 'go' }];
                const noBlocks = cm.estimateTokens(msgs);
                const withBlocks = cm.estimateTokens(msgs, [
                    createMemoryBlock({ id: 'a', name: 'task', content: 'x'.repeat(200) }),
                ]);
                assert.ok(withBlocks > noBlocks, 'blocks should increase token count');
            },
        },
        {
            name: 'compactIfNeeded is a no-op under threshold',
            fn: async () => {
                const cm = new ContextManager({ maxTokens: 10_000, compactionThreshold: 0.8 });
                const msgs: ModelMessage[] = [
                    { role: 'system', content: 'sys' },
                    { role: 'user', content: 'hi' },
                    { role: 'assistant', content: 'hello' },
                ];
                const blocks = [
                    createMemoryBlock({ id: 'a', name: 'task', content: 'small', priority: 5 }),
                ];
                const result = await cm.compactIfNeeded(msgs, blocks);
                assert.strictEqual(result.compacted, false);
                assert.strictEqual(result.droppedBlocks.length, 0);
                assert.strictEqual(result.droppedMessageCount, 0);
                assert.deepStrictEqual(
                    result.messages.map((m) => m.role),
                    ['system', 'user', 'assistant'],
                );
                assert.strictEqual(result.keptBlocks.length, 1);
            },
        },
        {
            name: 'compactIfNeeded drops evictable blocks lowest-priority first',
            fn: async () => {
                // Budget 100 tokens; 3 evictable blocks each ~150 tokens.
                const cm = new ContextManager({ maxTokens: 100, compactionThreshold: 0.8 });
                const blocks = [
                    createMemoryBlock({ id: 'low', name: 'low', content: 'a'.repeat(600), priority: 1 }),
                    createMemoryBlock({ id: 'mid', name: 'mid', content: 'b'.repeat(600), priority: 5 }),
                    createMemoryBlock({ id: 'high', name: 'high', content: 'c'.repeat(600), priority: 9 }),
                ];
                const msgs: ModelMessage[] = [{ role: 'user', content: 'go' }];
                const result = await cm.compactIfNeeded(msgs, blocks);
                assert.strictEqual(result.compacted, true);
                // Lowest priority should be dropped before higher priority.
                const droppedIds = result.droppedBlocks.map((b) => b.id);
                assert.strictEqual(droppedIds[0], 'low');
                if (droppedIds.length >= 2) assert.strictEqual(droppedIds[1], 'mid');
                // Surviving blocks are priority desc.
                const keptIds = result.keptBlocks.map((b) => b.id);
                for (let i = 1; i < keptIds.length; i++) {
                    const a = result.keptBlocks[i - 1].priority;
                    const b = result.keptBlocks[i].priority;
                    assert.ok(a >= b, `keptBlocks should be priority desc, got ${a} before ${b}`);
                }
            },
        },
        {
            name: 'compactIfNeeded never drops pinned (evictable=false) blocks',
            fn: async () => {
                const cm = new ContextManager({ maxTokens: 50, compactionThreshold: 0.8 });
                const blocks = [
                    createMemoryBlock({
                        id: 'pin',
                        name: 'system',
                        content: 'p'.repeat(2000),
                        priority: 0,
                        evictable: false,
                    }),
                    createMemoryBlock({
                        id: 'extra',
                        name: 'task',
                        content: 'e'.repeat(2000),
                        priority: 10,
                    }),
                ];
                const result = await cm.compactIfNeeded(
                    [{ role: 'user', content: 'go' }],
                    blocks,
                );
                assert.ok(result.compacted);
                assert.ok(result.keptBlocks.some((b) => b.id === 'pin'), 'pinned block must be retained');
                assert.ok(result.droppedBlocks.every((b) => b.id !== 'pin'));
            },
        },
        {
            name: 'compactIfNeeded slides window keeping system + last N',
            fn: async () => {
                const cm = new ContextManager({
                    maxTokens: 80,
                    compactionThreshold: 0.8,
                    keepRecentMessages: 2,
                });
                const heavy = 'z'.repeat(400);
                const msgs: ModelMessage[] = [
                    { role: 'system', content: 'sys-anchor' },
                    { role: 'user', content: `u1 ${heavy}` },
                    { role: 'assistant', content: `a1 ${heavy}` },
                    { role: 'user', content: `u2 ${heavy}` },
                    { role: 'assistant', content: `a2 ${heavy}` },
                    { role: 'user', content: 'u3-recent' },
                    { role: 'assistant', content: 'a3-recent' },
                ];
                const result = await cm.compactIfNeeded(msgs, []);
                assert.ok(result.compacted);
                assert.ok(result.droppedMessageCount >= 2, `expected drops, got ${result.droppedMessageCount}`);
                // System anchor preserved.
                const sys = result.messages.find((m) => m.role === 'system');
                assert.ok(sys, 'system message must survive');
                assert.strictEqual(typeof sys!.content === 'string' ? sys!.content : '', 'sys-anchor');
                // Last two non-system messages preserved verbatim.
                const tail = result.messages.slice(-2);
                assert.strictEqual(tail[0].role, 'user');
                assert.strictEqual(tail[1].role, 'assistant');
                assert.strictEqual(tail[0].content as string, 'u3-recent');
                assert.strictEqual(tail[1].content as string, 'a3-recent');
                // Placeholder inserted.
                const placeholder = result.messages.find(
                    (m) => typeof m.content === 'string' && (m.content as string).includes('summarized'),
                );
                assert.ok(placeholder, 'summary placeholder should be present');
            },
        },
        {
            name: 'AgentLoop emits context_compacted when memory blows past budget',
            fn: async () => {
                const bindings: TierBindings = { 'fast': makeStopBinding('ok') };
                const controller = new TierController({ bindings });
                const bus = new TraceBus();
                const events: ContextCompactedEvent[] = [];
                bus.on('context_compacted', (e) => events.push(e));

                const memory = new MemoryStore();
                // Two heavy evictable blocks > budget → compaction must run.
                memory.set(createMemoryBlock({
                    id: 'low', name: 'task', content: 'x'.repeat(4000), priority: 1,
                }));
                memory.set(createMemoryBlock({
                    id: 'high', name: 'vault_ctx', content: 'y'.repeat(4000), priority: 9,
                }));
                const context = new ContextManager({ maxTokens: 200, compactionThreshold: 0.5 });

                const result = await runAgentLoop({
                    loopId: 'L-ctx',
                    systemPrompt: 'system base',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [],
                    tierController: controller,
                    trace: bus,
                    memory,
                    context,
                });
                assert.strictEqual(result.finishReason, 'stop');
                assert.ok(events.length >= 1, 'context_compacted should fire at least once');
                const ev = events[0];
                assert.strictEqual(ev.loopId, 'L-ctx');
                assert.ok(ev.tokensBefore >= ev.tokensAfter, 'tokensAfter should not exceed tokensBefore');
                assert.ok(ev.droppedBlocks >= 1, 'at least one block should have been dropped');
                assert.ok(
                    Array.isArray(ev.compactSummaries) && ev.compactSummaries.length >= 1,
                    'context_compacted event carries recoverable CompactSummary anchors',
                );
                const blockSummary = ev.compactSummaries.find((s) => s.anchors[0]?.kind === 'block');
                assert.ok(blockSummary, 'summary for dropped block should be emitted');
                assert.strictEqual(blockSummary!.level, 4, 'dropped block level=4');
                assert.ok(blockSummary!.suggestedRefetch.length > 0, 'summary carries refetch hint');
            },
        },
        {
            name: 'AgentLoop without context manager is unchanged (no compaction trace)',
            fn: async () => {
                const bindings: TierBindings = { 'fast': makeStopBinding('ok') };
                const controller = new TierController({ bindings });
                const bus = new TraceBus();
                const events: ContextCompactedEvent[] = [];
                bus.on('context_compacted', (e) => events.push(e));
                await runAgentLoop({
                    loopId: 'L-noctx',
                    systemPrompt: '',
                    initialMessages: [{ role: 'user', content: 'go' }],
                    tools: [],
                    tierController: controller,
                    trace: bus,
                });
                assert.strictEqual(events.length, 0);
            },
        },
        {
            name: 'stage (c) summariser replaces placeholder + enriches CompactSummary',
            fn: async () => {
                const heavy = 'z'.repeat(400);
                const cm = new ContextManager({
                    maxTokens: 80,
                    compactionThreshold: 0.8,
                    keepRecentMessages: 2,
                    summarizer: async ({ droppedMessages }) => {
                        return `Compacted ${droppedMessages.length} turns. User asked to write; assistant drafted twice.`;
                    },
                });
                const msgs: ModelMessage[] = [
                    { role: 'system', content: 'sys' },
                    { role: 'user', content: `u1 ${heavy}` },
                    { role: 'assistant', content: `a1 ${heavy}` },
                    { role: 'user', content: `u2 ${heavy}` },
                    { role: 'assistant', content: `a2 ${heavy}` },
                    { role: 'user', content: 'u3-recent' },
                    { role: 'assistant', content: 'a3-recent' },
                ];
                const result = await cm.compactIfNeeded(msgs, []);
                assert.ok(result.compacted);
                // The placeholder must be gone — replaced with the summariser output.
                const placeholderStill = result.messages.some(
                    (m) => typeof m.content === 'string' && (m.content as string).includes('summarized'),
                );
                assert.strictEqual(placeholderStill, false, 'stage (b) placeholder was replaced');
                const summaryMsg = result.messages.find(
                    (m) => typeof m.content === 'string' && (m.content as string).includes('[Summary of prior turns]'),
                );
                assert.ok(summaryMsg, 'summary message present');
                assert.ok(
                    typeof summaryMsg!.content === 'string' && (summaryMsg!.content as string).includes('drafted twice'),
                    'summary body carried through',
                );
                // CompactSummary carries the LLM prose in `summary`, not the default text.
                const messageSummary = result.compactSummaries.find((s) => s.anchors[0]?.kind === 'message');
                assert.ok(messageSummary);
                assert.ok(messageSummary!.summary.includes('drafted twice'), 'CompactSummary.summary uses stage (c) prose');
            },
        },
        {
            name: 'stage (c) failure falls back to placeholder — never breaks the loop',
            fn: async () => {
                const heavy = 'z'.repeat(400);
                const cm = new ContextManager({
                    maxTokens: 80,
                    compactionThreshold: 0.8,
                    keepRecentMessages: 2,
                    summarizer: async () => {
                        throw new Error('LLM offline');
                    },
                });
                const msgs: ModelMessage[] = [
                    { role: 'system', content: 'sys' },
                    { role: 'user', content: `u1 ${heavy}` },
                    { role: 'assistant', content: `a1 ${heavy}` },
                    { role: 'user', content: 'u2-recent' },
                    { role: 'assistant', content: 'a2-recent' },
                ];
                const result = await cm.compactIfNeeded(msgs, []);
                assert.ok(result.compacted, 'still compacted');
                // Placeholder from stage (b) must survive when stage (c) throws.
                const placeholder = result.messages.find(
                    (m) => typeof m.content === 'string' && (m.content as string).includes('summarized'),
                );
                assert.ok(placeholder, 'stage (b) placeholder retained');
            },
        },
        {
            name: 'stage (c) empty return also falls back to placeholder',
            fn: async () => {
                const heavy = 'z'.repeat(400);
                const cm = new ContextManager({
                    maxTokens: 80,
                    compactionThreshold: 0.8,
                    keepRecentMessages: 2,
                    summarizer: async () => '   ',
                });
                const msgs: ModelMessage[] = [
                    { role: 'system', content: 'sys' },
                    { role: 'user', content: `u1 ${heavy}` },
                    { role: 'assistant', content: `a1 ${heavy}` },
                    { role: 'user', content: 'u2-recent' },
                    { role: 'assistant', content: 'a2-recent' },
                ];
                const result = await cm.compactIfNeeded(msgs, []);
                const placeholder = result.messages.find(
                    (m) => typeof m.content === 'string' && (m.content as string).includes('summarized'),
                );
                assert.ok(placeholder, 'whitespace-only summariser output → placeholder retained');
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
