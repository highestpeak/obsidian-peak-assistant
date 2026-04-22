import { TraceSink } from '@/core/telemetry/traceSink';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

function tmpTraceDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'trace-sink-'));
}

function systemInit(): any {
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
        uuid: 's-uuid',
        session_id: 'sess-a',
    };
}

function assistantToolUse(): any {
    return {
        type: 'assistant',
        message: {
            id: 'm1',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'text', text: 'planning' },
                { type: 'tool_use', id: 't1', name: 'grep_file_tree', input: { query: 'xyz' } },
            ],
            model: 'claude-opus-4-6',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
        parent_tool_use_id: null,
        uuid: 'a1',
        session_id: 'sess-a',
    };
}

function userResult(longOutput: boolean): any {
    const content = longOutput ? 'x'.repeat(50000) : '- note1.md\n- note2.md';
    return {
        type: 'user',
        message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 't1', content }],
        },
        parent_tool_use_id: null,
        uuid: 'u1',
        session_id: 'sess-a',
    };
}

function resultSuccess(): any {
    return {
        type: 'result',
        subtype: 'success',
        duration_ms: 1200,
        duration_api_ms: 1000,
        is_error: false,
        num_turns: 1,
        result: 'done.',
        stop_reason: 'end_turn',
        total_cost_usd: 0.001,
        usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        uuid: 'r1',
        session_id: 'sess-a',
    };
}

// Test 1: a complete run writes both files with expected filenames
{
    const dir = tmpTraceDir();
    const sink = new TraceSink({
        rootDir: dir,
        agentName: 'vault-search',
        scenarioName: 'hub-discovery',
        intent: 'test',
        profileId: 'claude-opus-4-6',
        track: 'cli',
        toolCapBytes: 10240,
        now: () => new Date('2026-04-12T10:00:00Z'),
        sessionId: 'sess-a',
    });
    sink.consume(systemInit());
    sink.consume(assistantToolUse());
    sink.consume(userResult(false));
    sink.consume(resultSuccess());
    const { metaPath, fullPath } = sink.flush();

    assert(fs.existsSync(metaPath), 'meta.jsonl file exists');
    assert(fs.existsSync(fullPath), 'full.jsonl file exists');
    assert(metaPath.includes('2026-04-12'), 'meta path includes date dir');
    assert(metaPath.endsWith('.meta.jsonl'), 'meta path ends with .meta.jsonl');
    assert(fullPath.endsWith('.full.jsonl'), 'full path ends with .full.jsonl');
    assert(metaPath.includes('vault-search-hub-discovery'), 'meta filename includes scenario');
}

// Test 2: meta lines are parseable JSONL without content fields
{
    const dir = tmpTraceDir();
    const sink = new TraceSink({
        rootDir: dir,
        agentName: 'vault-search',
        scenarioName: 'hub-discovery',
        profileId: 'claude-opus-4-6',
        track: 'cli',
        toolCapBytes: 10240,
        sessionId: 'sess-b',
    });
    sink.consume(systemInit());
    sink.consume(assistantToolUse());
    sink.consume(userResult(false));
    sink.consume(resultSuccess());
    const { metaPath } = sink.flush();
    const lines = fs.readFileSync(metaPath, 'utf8').trim().split('\n');
    assert(lines.length === 3, 'meta has 3 lines (session, iteration, final)');
    for (const line of lines) {
        const obj = JSON.parse(line);
        assert(typeof obj.type === 'string', 'each meta line is a valid JSON object with a type');
    }
    const iter = JSON.parse(lines[1]);
    assert(iter.toolCalls[0].input === undefined, 'meta iteration omits raw tool input');
    assert(iter.toolCalls[0].output === undefined, 'meta iteration omits raw tool output');
    assert(iter.plan === undefined, 'meta iteration omits plan field');
    const fin = JSON.parse(lines[2]);
    assert(fin.finalOutput === undefined, 'meta final omits finalOutput');
    assert(typeof fin.finalOutputShape === 'object', 'meta final has finalOutputShape');
}

// Test 3: full lines contain content and honor tool cap
{
    const dir = tmpTraceDir();
    const sink = new TraceSink({
        rootDir: dir,
        agentName: 'vault-search',
        scenarioName: 'big-output',
        profileId: 'claude-opus-4-6',
        track: 'cli',
        toolCapBytes: 1000,
        sessionId: 'sess-c',
    });
    sink.consume(systemInit());
    sink.consume(assistantToolUse());
    sink.consume(userResult(true)); // 50000 chars
    sink.consume(resultSuccess());
    const { fullPath } = sink.flush();
    const lines = fs.readFileSync(fullPath, 'utf8').trim().split('\n');
    const iter = JSON.parse(lines[1]);
    assert(iter.toolCalls[0].outputTruncated === true, 'tool output marked truncated');
    assert(iter.toolCalls[0].originalOutputBytes === 50000, 'original bytes preserved');
    assert(iter.toolCalls[0].output.includes('[...truncated'), 'truncation marker present');
    assert(iter.toolCalls[0].output.length < 5000, 'truncated output much smaller than original');
    assert(typeof iter.plan.assistantText === 'string', 'full iteration has plan text');
}

// Test 4: flush after error (no result message) still writes both files with aborted/error final
{
    const dir = tmpTraceDir();
    const sink = new TraceSink({
        rootDir: dir,
        agentName: 'vault-search',
        scenarioName: 'crashy',
        profileId: 'claude-opus-4-6',
        track: 'cli',
        toolCapBytes: 10240,
        sessionId: 'sess-d',
    });
    sink.consume(systemInit());
    sink.consume(assistantToolUse());
    // Simulate crash: no tool result, no final result message.
    sink.finalizeWithError('boom');
    const { metaPath, fullPath } = sink.flush();
    assert(fs.existsSync(metaPath), 'meta written after error');
    assert(fs.existsSync(fullPath), 'full written after error');
    const metaLines = fs.readFileSync(metaPath, 'utf8').trim().split('\n');
    const final = JSON.parse(metaLines[metaLines.length - 1]);
    assert(final.stoppedReason === 'error_during_execution', 'error sink produces error_during_execution stop');
    assert(final.error?.message === 'boom', 'error message preserved');
}

// Test 5: PEAK_TRACE_TOOL_CAP=0 disables truncation
{
    const dir = tmpTraceDir();
    const sink = new TraceSink({
        rootDir: dir,
        agentName: 'vault-search',
        scenarioName: 'nocap',
        profileId: 'claude-opus-4-6',
        track: 'cli',
        toolCapBytes: 0,
        sessionId: 'sess-e',
    });
    sink.consume(systemInit());
    sink.consume(assistantToolUse());
    sink.consume(userResult(true)); // 50000 chars
    sink.consume(resultSuccess());
    const { fullPath } = sink.flush();
    const lines = fs.readFileSync(fullPath, 'utf8').trim().split('\n');
    const iter = JSON.parse(lines[1]);
    assert(iter.toolCalls[0].outputTruncated === false, 'cap=0 disables truncation');
    assert(iter.toolCalls[0].output.length === 50000, 'cap=0 preserves full length');
}
