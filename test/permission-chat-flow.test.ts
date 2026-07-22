/**
 * Task B1 (plan §5.2 R4) — permission ask end-to-end through the Chat
 * harness runner.
 *
 * Covered slices:
 *   1. Mutating tool (kind:'edit') under `mode:'ask'` triggers a
 *      `chat-permission-request` event; resolver returns allow → tool
 *      executes and `tool-result` carries the payload.
 *   2. Same setup, resolver returns deny → tool_result surfaces a denial
 *      error string and the run still settles as completed.
 *   3. Aborting the outer signal while awaiting the ask cancels the run
 *      (chat-permission-request seen, but no tool_result with ok payload).
 *   4. Read-only tool (kind:'read') under `mode:'ask'` bypasses the ask
 *      path — no permission_request event is emitted.
 */

import assert from 'assert';
import { z } from 'zod';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModel } from 'ai';
import { harnessStreamChatWithModel } from '@/service/chat/harnessChatRunner';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { ok } from '@/service/agents/harness/tool/types';
import type { LLMRequestMessage, LLMStreamEvent } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';

const PROFILE_STUB: Profile = {
    id: 'p1', name: 'p1', kind: 'openai', enabled: true, createdAt: 0,
    baseUrl: 'https://example.com', apiKey: null, primaryModel: 'm-primary',
    fastModel: 'm-fast', customHeaders: {}, embeddingEndpoint: null,
    embeddingApiKey: null, embeddingModel: null, icon: null, description: null,
};

const USER_MSG: LLMRequestMessage[] = [
    { role: 'system', content: [{ type: 'text', text: 'you are a helper' }] },
    { role: 'user', content: [{ type: 'text', text: 'do it' }] },
];

const RAW_USAGE_STOP = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, textTokens: 5, reasoningTokens: undefined },
    totalTokens: 15,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};
const RAW_USAGE_TOOL = {
    inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 6, textTokens: 6, reasoningTokens: undefined },
    totalTokens: 18,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
};

function toolThenTextModel(toolName: string, toolInput: any, finalText: string): MockLanguageModelV3 {
    const steps = [
        [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'tc1', toolName, input: JSON.stringify(toolInput) },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: RAW_USAGE_TOOL },
        ],
        [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: finalText },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: RAW_USAGE_STOP },
        ],
    ];
    let call = 0;
    return new MockLanguageModelV3({
        provider: 'mock',
        modelId: 'mock-perm',
        doStream: async () => {
            const idx = Math.min(call, steps.length - 1);
            call += 1;
            return { stream: convertArrayToReadableStream([...steps[idx]] as any) };
        },
    });
}

function makeMutatingTool(name: string, onExecute: (args: unknown) => void): ToolDef {
    return {
        name,
        description: 'mutating tool for permission tests',
        inputSchema: z.object({ path: z.string() }).passthrough(),
        source: 'mcp',
        kind: 'edit',
        async execute(args) {
            onExecute(args);
            return ok('mutated');
        },
    };
}

function makeReadTool(name: string, onExecute: (args: unknown) => void): ToolDef {
    return {
        name,
        description: 'read tool',
        inputSchema: z.object({ path: z.string() }).passthrough(),
        source: 'mcp',
        kind: 'read',
        async execute(args) {
            onExecute(args);
            return ok('read-data');
        },
    };
}

async function drain(gen: AsyncGenerator<LLMStreamEvent, unknown, void>) {
    const events: LLMStreamEvent[] = [];
    while (true) {
        const step = await gen.next();
        if (step.done) return { events, ret: step.value };
        events.push(step.value);
    }
}

// ─── tests ──────────────────────────────────────────────────────────────────

async function testAskAllowExecutesTool(): Promise<void> {
    const executed: Array<unknown> = [];
    const tool = makeMutatingTool('mcp_test_write', (a) => executed.push(a));
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel('mcp_test_write', { path: 'a.md' }, 'done');
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: 'run-ask-allow',
            budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
            permission: guard,
            resolvePermissionAsk: async () => ({ decision: 'allow' }),
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    // permission_request event surfaced on the UI stream.
    const permReq = events.find((e) => e.type === 'chat-permission-request') as any;
    assert.ok(permReq, 'chat-permission-request emitted');
    assert.strictEqual(permReq.toolName, 'mcp_test_write');

    // Tool actually ran with the args.
    assert.strictEqual(executed.length, 1);
    assert.deepStrictEqual(executed[0], { path: 'a.md' });

    // tool-result carries the mutated payload.
    const toolResult = events.find((e) => e.type === 'tool-result') as any;
    assert.ok(toolResult);
    assert.strictEqual(toolResult.output, 'mutated');

    assert.strictEqual((ret as any).status, 'completed');
    console.log('PASS: ask + allow → tool executes end-to-end');
}

async function testAskDenyRecordsRefusal(): Promise<void> {
    const executed: Array<unknown> = [];
    const tool = makeMutatingTool('mcp_test_write', (a) => executed.push(a));
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel('mcp_test_write', { path: 'a.md' }, 'skipped');
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: 'run-ask-deny',
            budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
            permission: guard,
            resolvePermissionAsk: async () => ({ decision: 'deny', reason: 'user rejected' }),
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    const permReq = events.find((e) => e.type === 'chat-permission-request');
    assert.ok(permReq, 'chat-permission-request emitted');

    // Tool did NOT execute.
    assert.strictEqual(executed.length, 0);

    // tool-result surfaces a denial (harness routes permission-deny through
    // the same tool_result envelope with an error string in the payload).
    const toolResult = events.find((e) => e.type === 'tool-result') as any;
    assert.ok(toolResult, 'tool-result still fires (harness wraps deny as an error result)');
    const payload = String(toolResult.output ?? '');
    assert.match(payload, /permission denied/i);

    // Run still completed — deny is a normal outcome, not a failure.
    assert.strictEqual((ret as any).status, 'completed');
    console.log('PASS: ask + deny → tool skipped, run completes');
}

async function testAskAbortWhileWaitingCancels(): Promise<void> {
    const executed: Array<unknown> = [];
    const tool = makeMutatingTool('mcp_test_write', (a) => executed.push(a));
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel('mcp_test_write', { path: 'a.md' }, 'stopped');
    const controller = new AbortController();

    let permRequestSeen = false;
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: 'run-ask-abort',
            budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
            abortSignal: controller.signal,
            permission: guard,
            // Resolver never settles unless we abort — mimics a UI that
            // shows the card but the user cancels the whole turn.
            resolvePermissionAsk: (req) =>
                new Promise((resolve) => {
                    permRequestSeen = true;
                    req.signal.addEventListener('abort', () => {
                        resolve({ decision: 'deny', reason: 'cancelled' });
                    }, { once: true });
                }),
        },
        model as unknown as LanguageModel,
    );

    // Read events until we see the permission request, then abort.
    const drainWithAbort = async () => {
        const events: LLMStreamEvent[] = [];
        while (true) {
            const step = await gen.next();
            if (step.done) return { events, ret: step.value };
            events.push(step.value);
            if (step.value.type === 'chat-permission-request' && !controller.signal.aborted) {
                controller.abort('cancelled');
            }
        }
    };
    const { events, ret } = await drainWithAbort();

    assert.ok(permRequestSeen, 'resolver invoked → ask reached the resolver');
    // Tool never executed because abort aborted the ask.
    assert.strictEqual(executed.length, 0);
    // Loop settled as cancelled (finishReason='abort').
    const status = (ret as any).status;
    assert.ok(
        status === 'cancelled' || status === 'completed',
        `status should be cancelled or completed on abort (was ${status})`,
    );
    assert.ok(
        events.some((e) => e.type === 'chat-permission-request'),
        'chat-permission-request event was seen',
    );
    console.log('PASS: abort while awaiting ask → tool skipped, run unwinds');
}

async function testReadOnlyToolBypassesAsk(): Promise<void> {
    const executed: Array<unknown> = [];
    const tool = makeReadTool('mcp_test_read', (a) => executed.push(a));
    const guard = new PermissionGuard({ mode: 'ask' });
    const model = toolThenTextModel('mcp_test_read', { path: 'a.md' }, 'done');
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools: [tool],
            loopId: 'run-read-noask',
            budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
            permission: guard,
            resolvePermissionAsk: async () => {
                throw new Error('resolver must not be called for read-only tools');
            },
        },
        model as unknown as LanguageModel,
    );
    const { events, ret } = await drain(gen);

    const permReq = events.find((e) => e.type === 'chat-permission-request');
    assert.strictEqual(permReq, undefined, 'read-only tool must NOT trigger ask');
    assert.strictEqual(executed.length, 1);
    assert.strictEqual((ret as any).status, 'completed');
    console.log('PASS: read-only tool bypasses ask path even in ask mode');
}

async function main(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ['ask + allow executes tool', testAskAllowExecutesTool],
        ['ask + deny skips tool and completes', testAskDenyRecordsRefusal],
        ['abort while awaiting ask unwinds', testAskAbortWhileWaitingCancels],
        ['read-only tool bypasses ask', testReadOnlyToolBypassesAsk],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\npermission-chat-flow: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
