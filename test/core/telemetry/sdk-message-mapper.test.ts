import { SdkMessageMapper } from '@/core/telemetry/sdk-message-mapper';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

/**
 * Build a minimal valid SDKSystemMessage for tests.
 * Fields we don't care about are stubbed with plausible values.
 */
function systemInit(overrides: Partial<any> = {}): SDKMessage {
    return {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'user',
        claude_code_version: '0.0.0-test',
        cwd: '/tmp',
        tools: [],
        mcp_servers: [],
        model: 'claude-opus-4-6',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
        skills: [],
        plugins: [],
        uuid: 'sess-uuid',
        session_id: 'sess-id',
        ...overrides,
    } as any;
}

function assistantWithText(text: string, session_id = 'sess-id'): SDKMessage {
    return {
        type: 'assistant',
        message: {
            id: 'm1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text }],
            model: 'claude-opus-4-6',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, service_tier: null, server_tool_use: null },
        },
        parent_tool_use_id: null,
        uuid: 'a-uuid',
        session_id,
    } as any;
}

function assistantWithToolUse(toolName: string, input: unknown, toolUseId: string): SDKMessage {
    return {
        type: 'assistant',
        message: {
            id: 'm2',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'text', text: 'calling a tool' },
                { type: 'tool_use', id: toolUseId, name: toolName, input },
            ],
            model: 'claude-opus-4-6',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 20, output_tokens: 15, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, service_tier: null, server_tool_use: null },
        },
        parent_tool_use_id: null,
        uuid: 'au-uuid',
        session_id: 'sess-id',
    } as any;
}

function userToolResult(toolUseId: string, output: string): SDKMessage {
    return {
        type: 'user',
        message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUseId, content: output }],
        },
        parent_tool_use_id: null,
        uuid: 'u-uuid',
        session_id: 'sess-id',
    } as any;
}

function resultSuccess(text: string): SDKMessage {
    return {
        type: 'result',
        subtype: 'success',
        duration_ms: 4321,
        duration_api_ms: 3000,
        is_error: false,
        num_turns: 2,
        result: text,
        stop_reason: 'end_turn',
        total_cost_usd: 0.012,
        usage: {
            input_tokens: 120,
            output_tokens: 40,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            server_tool_use: null,
        },
        modelUsage: {},
        permission_denials: [],
        uuid: 'r-uuid',
        session_id: 'sess-id',
    } as any;
}

// Test 1: system init populates header model
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    const buf = m.getBuffer();
    assert(buf.header.sessionId === 'sess-id', 'session id preserved');
    assert(buf.header.model === 'claude-opus-4-6', 'model extracted from system init');
    assert(buf.header.track === 'cli', 'track stamped');
}

// Test 2: assistant message with tool_use opens a new iteration and registers a tool call
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    m.consume(assistantWithToolUse('grep_file_tree', { query: 'abc' }, 'tool-1'));
    const buf = m.getBuffer();
    assert(buf.iterations.length === 1, 'one iteration opened');
    assert(buf.iterations[0].toolCalls.length === 1, 'one tool call registered');
    assert(buf.iterations[0].toolCalls[0].toolName === 'grep_file_tree', 'tool name captured');
    assert(buf.iterations[0].toolCalls[0].toolUseId === 'tool-1', 'tool_use id captured');
    assert((buf.iterations[0].plan?.assistantText ?? '').includes('calling a tool'), 'assistant text captured in plan');
    assert(
        buf.iterations[0].toolCalls[0].inputShape.query === 'string(3)',
        'inputShape summarizes query field as string(3)',
    );
}

// Test 3: user tool_result closes the matching tool call and attaches output
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    m.consume(assistantWithToolUse('grep_file_tree', { query: 'abc' }, 'tool-1'));
    m.consume(userToolResult('tool-1', '- file1.md\n- file2.md'));
    const buf = m.getBuffer();
    assert(buf.iterations[0].toolCalls[0].output === '- file1.md\n- file2.md', 'tool output attached');
    assert(buf.iterations[0].toolCount === 1, 'toolCount reflects closed count');
}

// Test 4: a second assistant message opens a new iteration
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    m.consume(assistantWithToolUse('grep_file_tree', { query: 'abc' }, 'tool-1'));
    m.consume(userToolResult('tool-1', 'r1'));
    m.consume(assistantWithToolUse('inspect_note_context', { path: '/a' }, 'tool-2'));
    m.consume(userToolResult('tool-2', 'r2'));
    const buf = m.getBuffer();
    assert(buf.iterations.length === 2, 'second iteration opened');
    assert(buf.iterations[0].index === 0, 'first iteration index 0');
    assert(buf.iterations[1].index === 1, 'second iteration index 1');
}

// Test 5: result message populates final event
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    m.consume(assistantWithToolUse('grep_file_tree', { query: 'abc' }, 'tool-1'));
    m.consume(userToolResult('tool-1', 'r1'));
    m.consume(resultSuccess('final answer text'));
    const buf = m.getBuffer();
    assert(buf.final !== undefined, 'final event present');
    assert(buf.final?.stoppedReason === 'success', 'stopped reason = success');
    assert(buf.final?.durationMs === 4321, 'duration captured from result');
    assert(buf.final?.totalToolCalls === 1, 'total tool calls aggregated');
    assert(buf.final?.totalIterations === 1, 'total iterations aggregated');
    assert(buf.final?.usage.inputTokens === 120, 'usage tokens captured');
    assert(buf.final?.finalOutput === 'final answer text', 'final output string captured');
    assert(buf.final?.finalOutputShape.kind === 'text', 'final output shape = text');
    assert(buf.final?.finalOutputShape.length === 'final answer text'.length, 'final output length captured');
}

// Test 6: plain-text assistant message (no tool_use) does NOT open an iteration
{
    const m = new SdkMessageMapper({
        sessionId: 'sess-id',
        agentName: 'vault-search',
        profileId: 'claude-opus-4-6',
        track: 'cli',
    });
    m.consume(systemInit());
    m.consume(assistantWithText('I am thinking out loud'));
    const buf = m.getBuffer();
    assert(buf.iterations.length === 0, 'text-only assistant does not open iteration');
}
