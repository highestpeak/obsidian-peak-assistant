/**
 * Task B1 (plan §5.2 R3) — MCP tools wired into Chat's Harness AgentLoop.
 *
 * Covered slices:
 *   1. `buildChatHarnessTools` includes ToolDefs only for CONNECTED MCP
 *      servers; disconnected servers do not contribute tools.
 *   2. Running the Chat harness runner with a mock model that requests
 *      `mcp_<server>_<tool>` invokes the underlying MCP `callTool` and
 *      emits `tool-call` + `tool-result` events on the UI stream.
 *   3. Availability + strategy path stays honest: with no MCP manager wired
 *      the strategy returns zero MCP tools; with one wired, tool count
 *      reflects only connected+discovered tools.
 */

import assert from 'assert';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModel } from 'ai';
import { harnessStreamChatWithModel } from '@/service/chat/harnessChatRunner';
import { buildChatHarnessTools } from '@/service/chat/tools/harnessChatTools';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type { AppHandle } from '@/core/ports/AppHandle';
import type { LLMRequestMessage, LLMStreamEvent, ModelCapabilities } from '@/core/providers/types';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { MCPConnectionInfo } from '@/core/types/mcp';
import type { Profile } from '@/core/profiles/types';

const APP_STUB = {} as unknown as AppHandle;
const CAPS_NO_NATIVE: ModelCapabilities = { vision: false, pdfInput: false, tools: true, webSearch: false };

const PROFILE_STUB: Profile = {
    id: 'p1',
    name: 'p1',
    kind: 'openai',
    enabled: true,
    createdAt: 0,
    baseUrl: 'https://example.com',
    apiKey: null,
    primaryModel: 'm-primary',
    fastModel: 'm-fast',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: null,
};

interface McpFixture {
    infos: MCPConnectionInfo[];
    tools: Array<{ serverId: string; serverName: string; tools: Array<{ name: string; description?: string }> }>;
    calls: Array<{ serverId: string; toolName: string; args: unknown }>;
    callReturnByTool: Record<string, string>;
}

function makeMcpManager(fx: McpFixture): MCPClientManager {
    return {
        getAllConnectionInfo: () => fx.infos,
        getAllDiscoveredTools: () =>
            fx.tools.map((t) => ({
                serverId: t.serverId,
                serverName: t.serverName,
                tools: t.tools,
            })),
        callTool: async (serverId: string, toolName: string, args: unknown) => {
            fx.calls.push({ serverId, toolName, args });
            const key = `${serverId}:${toolName}`;
            return fx.callReturnByTool[key] ?? 'ok';
        },
        connect: async () => {},
        disconnect: async () => {},
        dispose: async () => {},
        getConnectionInfo: () => undefined,
        getDiscoveredTools: () => [],
    } as unknown as MCPClientManager;
}

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

function mcpToolThenTextModel(toolName: string, toolInput: any, finalText: string): MockLanguageModelV3 {
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
        modelId: 'mock-mcp',
        doStream: async () => {
            const idx = Math.min(call, steps.length - 1);
            call += 1;
            return { stream: convertArrayToReadableStream([...steps[idx]] as any) };
        },
    });
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

async function testMcpToolsInBuildOnlyForConnected(): Promise<void> {
    const mcp = makeMcpManager({
        infos: [
            { serverId: 's1', status: 'connected', toolCount: 2 },
            { serverId: 's2', status: 'connecting', toolCount: 0 },
        ],
        tools: [
            { serverId: 's1', serverName: 'FS', tools: [{ name: 'read_file' }, { name: 'write_file' }] },
            // s2 has no discovered tools yet — connecting.
        ],
        calls: [],
        callReturnByTool: {},
    });
    const tools = buildChatHarnessTools(
        {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: false,
            mcpClientManager: mcp,
        },
        CAPS_NO_NATIVE,
    );
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['mcp_FS_read_file', 'mcp_FS_write_file']);
    console.log('PASS: buildChatHarnessTools includes only connected MCP tools');
}

async function testMcpAbsentWhenManagerMissing(): Promise<void> {
    const tools = buildChatHarnessTools(
        {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: false,
            mcpClientManager: null,
        },
        CAPS_NO_NATIVE,
    );
    assert.strictEqual(tools.length, 0);
    console.log('PASS: absent MCP manager → no MCP tools in build');
}

async function testMcpToolExecutedThroughAgentLoop(): Promise<void> {
    // Mock MCP manager with one connected server exposing `read_file`.
    const fx: McpFixture = {
        infos: [{ serverId: 's1', status: 'connected', toolCount: 1 }],
        tools: [
            {
                serverId: 's1',
                serverName: 'FS',
                tools: [
                    {
                        name: 'read_file',
                        description: 'read a file',
                    },
                ],
            },
        ],
        calls: [],
        callReturnByTool: { 's1:read_file': 'hello from mcp' },
    };
    const mcp = makeMcpManager(fx);

    // Build the tool set exactly as production Chat does.
    const tools = buildChatHarnessTools(
        {
            app: APP_STUB,
            pluginId: 'peak-test',
            enableWebSearch: false,
            enableVaultSearch: false,
            mcpClientManager: mcp,
        },
        CAPS_NO_NATIVE,
    );
    const target = tools.find((t) => t.name === 'mcp_FS_read_file');
    assert.ok(target, 'mcp_FS_read_file is present in the tool set');

    const model = mcpToolThenTextModel('mcp_FS_read_file', { path: 'a.md' }, 'done');
    // Permission mode `bypassPermissions` so the ask path stays clear of the
    // MCP-tool integration slice (permission has its own dedicated test).
    const guard = new PermissionGuard({ mode: 'bypassPermissions' });
    const gen = harnessStreamChatWithModel(
        {
            profile: PROFILE_STUB,
            modelId: 'm',
            messages: USER_MSG,
            tools,
            loopId: 'run-mcp',
            budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
            permission: guard,
        },
        model as unknown as LanguageModel,
    );
    const { events } = await drain(gen);

    // Real MCP call happened once with the shaped args.
    assert.strictEqual(fx.calls.length, 1);
    assert.strictEqual(fx.calls[0].serverId, 's1');
    assert.strictEqual(fx.calls[0].toolName, 'read_file');
    assert.deepStrictEqual(fx.calls[0].args, { path: 'a.md' });

    // UI stream saw tool-call and tool-result.
    const call = events.find((e) => e.type === 'tool-call') as any;
    assert.ok(call, 'tool-call event fired');
    assert.strictEqual(call.toolName, 'mcp_FS_read_file');
    const result = events.find((e) => e.type === 'tool-result') as any;
    assert.ok(result, 'tool-result event fired');
    assert.strictEqual(result.toolName, 'mcp_FS_read_file');

    console.log('PASS: MCP tool executed through AgentLoop and surfaces on UI stream');
}

async function main(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ['MCP tools only for connected servers', testMcpToolsInBuildOnlyForConnected],
        ['no MCP manager → no MCP tools', testMcpAbsentWhenManagerMissing],
        ['MCP tool call flows through AgentLoop', testMcpToolExecutedThroughAgentLoop],
    ];
    for (const [name, fn] of tests) {
        try {
            await fn();
        } catch (err) {
            console.error(`FAIL: ${name}`);
            throw err;
        }
    }
    console.log(`\nmcp-chat-integration: all ${tests.length} guards passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
