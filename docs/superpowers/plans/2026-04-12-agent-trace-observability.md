# Agent Trace Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal agent trace observability system that lets Claude Code run `VaultSearchAgent` from the command line without Obsidian, writes structured JSONL traces to disk, and makes "change code → run scenario → read trace → iterate" an autonomous loop.

**Architecture:** A single optional `TraceSink` subscriber is attached to the post-refactor `query()` consumer loop. It consumes raw `SDKMessage` events, maps them to a canonical record type, buffers in memory, and flushes two JSONL projections (meta + full) at run-end. A Node-only CLI harness (`scripts/run-agent.ts`) loads a scenario YAML, starts a filesystem-backed vault MCP server over a curated fixture vault, invokes `query()`, feeds its iterator to the sink, and prints the resulting meta-trace path. An Obsidian command runs the same scenarios against the real vault for truth calibration. Five named scenarios cover the first pass at `VaultSearchAgent`.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk@0.2.101` (already installed), `@modelcontextprotocol/sdk` for the in-process MCP server, `yaml` package for scenario parsing (new dep), Node `fs` + `path` + `os`, existing `run-test.js` test runner.

**Spec reference:** `docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md`

---

## Preconditions (must hold before executing this plan)

**This plan is gated on the provider v2 refactor landing.** Do not execute until all of the following are true:

1. `@anthropic-ai/claude-agent-sdk` is a `dependencies` entry in `package.json` (verify: `npm ls @anthropic-ai/claude-agent-sdk` shows a resolved version). ✅ Already installed at time of plan authoring.
2. A file named `src/service/agents/VaultSearchAgentSDK.ts` (or its renamed post-refactor equivalent) exists, contains an async iterator consumer of `query()`'s `SDKMessage` stream, and is the live code path for `VaultSearchAgent` — i.e., ordinary UI-triggered searches route through it.
3. The Profile Registry module is implemented at `src/service/profile/` (or the module path declared in `2026-04-11-provider-system-v2-design.md` §3). Specifically, a `loadProfile(profileId?: string)` or equivalent function that returns an object with at least `{ id: string; apiKey: string; baseUrl?: string; model: string; sdkSettings?: {...} }`.
4. Legacy `src/service/agents/core/AgentLoop.ts` and `PeakAgentEvent` have been deleted, per the v2 spec §5. (Not strictly required for this plan to function, but their absence signals that the refactor is complete enough for trace work to layer on cleanly.)
5. `test/fixtures/vault/` does not already exist (this plan creates it). If it does, rename the existing directory first and migrate content manually.

**If any precondition fails, stop and report the specific file or package that is missing.** Do not attempt to create stub versions of provider v2 modules inside this plan — that is out of scope.

---

## File Map

**New files:**

| Path | Responsibility |
|---|---|
| `src/core/telemetry/trace-types.ts` | Canonical trace record TS union + narrowing helpers |
| `src/core/telemetry/truncate-tool-output.ts` | Pure function: truncate long tool output strings with marker |
| `src/core/telemetry/sdk-message-mapper.ts` | Pure function: `SDKMessage → MapperDelta` (emits session init, iteration events, final event) |
| `src/core/telemetry/traceSink.ts` | `TraceSink` class: consumes deltas, buffers, flushes two JSONL files atomically |
| `src/core/telemetry/scenario-loader.ts` | Pure function: parse `test/scenarios/<agent>/<name>.yaml` into `ScenarioDefinition` |
| `src/core/telemetry/fs-vault-mcp/server.ts` | Filesystem-backed MCP server factory: `createFsVaultMcpServer(rootDir)` |
| `src/core/telemetry/fs-vault-mcp/fs-vault-reader.ts` | Pure functions: `readFile`, `listFiles`, `grep`, `readFrontmatter` (fs-backed) |
| `src/core/telemetry/fs-vault-mcp/link-resolver.ts` | Pure functions: `extractWikiLinks`, `resolveLink`, `listBacklinks` (over a precomputed graph) |
| `scripts/run-agent.ts` | CLI entry: argv parsing → scenario load → fs vault MCP → `query()` → sink flush → exit |
| `scripts/trace-latest.ts` | 20-line helper: prints newest `*.meta.jsonl` path under `data/traces/` matching an optional scenario glob |
| `src/app/commands/run-trace-scenario.ts` | Obsidian command: `Peak: Run Trace Scenario` (fuzzy-pick → real vault → sink flush) |
| `test/core/telemetry/truncate-tool-output.test.ts` | TDD unit tests for the truncator |
| `test/core/telemetry/sdk-message-mapper.test.ts` | TDD unit tests for the mapper, using hand-built `SDKMessage` fixtures |
| `test/core/telemetry/traceSink.test.ts` | TDD unit tests for the sink (tmp-dir JSONL writes) |
| `test/core/telemetry/scenario-loader.test.ts` | TDD unit tests for YAML parse + validation |
| `test/core/telemetry/fs-vault-reader.test.ts` | TDD unit tests for the filesystem reader |
| `test/core/telemetry/link-resolver.test.ts` | TDD unit tests for wiki-link extraction and backlink indexing |
| `test/fixtures/vault/small/**/*.md` | ~25 curated fixture markdown notes (hub+spokes, ambiguous, multilingual, decoys, orphans, long) |
| `test/scenarios/vault-search/hub-discovery.yaml` | Scenario #1 |
| `test/scenarios/vault-search/direct-answer.yaml` | Scenario #2 |
| `test/scenarios/vault-search/ambiguous-query.yaml` | Scenario #3 |
| `test/scenarios/vault-search/multilingual.yaml` | Scenario #4 |
| `test/scenarios/vault-search/not-found.yaml` | Scenario #5 |
| `docs/trace-format.md` | Short reference: canonical record schema, how to add a scenario, tool-output truncation knob |

**Modified files:**

| Path | Change |
|---|---|
| `package.json` | Add `yaml` dependency; add `trace` and `trace:latest` scripts |
| `.gitignore` | Add `data/traces/` |
| `src/service/agents/VaultSearchAgentSDK.ts` | Add one-line `traceSink?.consume(msg)` inside the existing `SDKMessage` iterator loop; accept `{ traceSink?: TraceSink }` in options |
| `src/app/commands/index.ts` (or wherever commands are registered) | Register the new `run-trace-scenario` command |
| `CLAUDE.md` | Append a short "Running an agent trace" section pointing at `npm run trace` |

---

## Task 1: Module skeleton, dependency, and package.json scripts

**Files:**
- Modify: `package.json`
- Create: `src/core/telemetry/` (empty directory; will be populated by later tasks)
- Create: `test/core/telemetry/` (empty directory)
- Modify: `.gitignore`

- [ ] **Step 1: Add `yaml` dependency and trace scripts to package.json**

Run:
```bash
npm install --save yaml
```

Then open `package.json` and under `"scripts"` add these two entries (merge with existing scripts; do not remove any):

```json
"trace": "node -r esbuild-register scripts/run-agent.ts",
"trace:latest": "node -r esbuild-register scripts/trace-latest.ts"
```

If `esbuild-register` is not already a dev dependency, install it:
```bash
npm install --save-dev esbuild-register
```

(Rationale: the existing `run-test.js` uses `esbuild` to compile `.test.ts` files ahead of time; for CLI scripts we need runtime TS resolution so scripts can `import` from `src/` without a build step. `esbuild-register` is the standard minimal TS-to-Node shim and keeps the invocation to a single `node -r` call.)

- [ ] **Step 2: Verify the dependency added**

Run:
```bash
npm ls yaml
```
Expected: shows a resolved version (e.g., `yaml@2.x.x`). No errors.

Run:
```bash
npm ls esbuild-register
```
Expected: shows a resolved version.

- [ ] **Step 3: Add `data/traces/` to .gitignore**

Open `.gitignore` and append:

```
# Agent trace output (see docs/trace-format.md)
data/traces/
```

- [ ] **Step 4: Create empty module directories**

Run:
```bash
mkdir -p src/core/telemetry/fs-vault-mcp test/core/telemetry test/fixtures/vault/small test/scenarios/vault-search
```

Verify:
```bash
ls src/core/telemetry test/core/telemetry test/fixtures/vault/small test/scenarios/vault-search
```
Expected: each directory exists and is empty.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add yaml + esbuild-register deps and trace scripts for observability"
```

(Note: the empty directories themselves cannot be tracked by git. They will become non-empty in subsequent tasks.)

---

## Task 2: Canonical trace record types

**Files:**
- Create: `src/core/telemetry/trace-types.ts`

No TDD for this task — it is pure type declarations. Correctness is verified by the TypeScript compiler when downstream tasks import these types. If the type is wrong, downstream unit tests will break.

- [ ] **Step 1: Write `src/core/telemetry/trace-types.ts`**

```typescript
/**
 * Canonical trace record types for agent trace observability.
 *
 * Two JSONL projections share this schema:
 *   - meta.jsonl: content fields omitted (only shape / summary)
 *   - full.jsonl: all content fields populated, tool output truncated at tool-cap
 *
 * Both files are sequences of CanonicalEvent values.
 * See docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md §3.1
 */

export type InvocationTrack = 'cli' | 'obsidian';

export type StoppedReason =
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
    | 'aborted';

export interface UsageSummary {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    totalTokens: number;
    costUSD?: number;
}

export interface SessionHeader {
    type: 'session';
    sessionId: string;
    ts: string; // ISO 8601
    agentName: string;
    scenarioName?: string;
    intent?: string;
    profileId: string;
    model: string;
    fixture?: string; // CLI track only
    track: InvocationTrack;
}

export interface ToolCallRecord {
    toolName: string;
    toolUseId: string;
    durationMs: number;
    /** Meta projection: shape descriptors only, e.g. { query: 'string(12)', path: 'string(32)' } */
    inputShape: Record<string, string>;
    /** Full projection: raw input as returned from the model */
    input?: unknown;
    /** Full projection: raw tool output, possibly truncated */
    output?: string;
    /** Full projection: true if output was truncated by truncate-tool-output */
    outputTruncated?: boolean;
    /** Full projection: original byte size of output before truncation (undefined if not truncated) */
    originalOutputBytes?: number;
}

export interface IterationEvent {
    type: 'iteration';
    index: number;
    planMs: number;
    toolCount: number;
    toolCalls: ToolCallRecord[];
    /** Full projection: assistant-facing text and reasoning from the SDK assistant message */
    plan?: {
        systemPromptHash?: string;
        systemPromptPreview?: string;
        assistantText: string;
        thinking?: string;
    };
}

export interface FinalEvent {
    type: 'final';
    stoppedReason: StoppedReason;
    totalIterations: number;
    totalToolCalls: number;
    durationMs: number;
    usage: UsageSummary;
    /** Meta projection: shape descriptor only */
    finalOutputShape: { kind: string; length?: number };
    /** Full projection: the full result string if available */
    finalOutput?: string;
    /** If stoppedReason indicates error */
    error?: { message: string };
}

export type CanonicalEvent = SessionHeader | IterationEvent | FinalEvent;

/** Type guards */
export const isSessionHeader = (e: CanonicalEvent): e is SessionHeader => e.type === 'session';
export const isIterationEvent = (e: CanonicalEvent): e is IterationEvent => e.type === 'iteration';
export const isFinalEvent = (e: CanonicalEvent): e is FinalEvent => e.type === 'final';

/**
 * A TraceBuffer is the in-memory representation an emitting sink holds until flush().
 * Both projections are derived from this buffer, not from two parallel event streams.
 */
export interface TraceBuffer {
    header: SessionHeader;
    iterations: IterationEvent[];
    final?: FinalEvent;
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit src/core/telemetry/trace-types.ts
```
Expected: no output, exit code 0.

If that fails because the file uses `@/` aliases it does not, try the project-wide check:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep trace-types
```
Expected: no matches (no errors mentioning `trace-types`).

- [ ] **Step 3: Commit**

```bash
git add src/core/telemetry/trace-types.ts
git commit -m "feat(telemetry): add canonical trace record types"
```

---

## Task 3: Tool output truncation helper (TDD)

**Files:**
- Create: `src/core/telemetry/truncate-tool-output.ts`
- Test: `test/core/telemetry/truncate-tool-output.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/truncate-tool-output.test.ts`:

```typescript
import { truncateToolOutput, DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

// Test 1: short output is untouched
{
    const input = 'abcdef';
    const result = truncateToolOutput(input, 1024);
    assert(result.output === 'abcdef', 'short output passes through unchanged');
    assert(result.truncated === false, 'short output is not marked truncated');
    assert(result.originalBytes === undefined, 'short output has no originalBytes');
}

// Test 2: output exactly at cap is untouched
{
    const input = 'a'.repeat(100);
    const result = truncateToolOutput(input, 100);
    assert(result.output.length === 100, 'output exactly at cap is not truncated');
    assert(result.truncated === false, 'at-cap output is not marked truncated');
}

// Test 3: output above cap is head+marker+tail
{
    const input = 'h'.repeat(500) + 'm'.repeat(100) + 't'.repeat(500); // 1100 bytes
    const cap = 1000; // head = 400, tail = 400, marker consumes the middle budget
    const result = truncateToolOutput(input, cap);
    assert(result.truncated === true, 'over-cap output is marked truncated');
    assert(result.originalBytes === 1100, 'originalBytes preserved');
    assert(result.output.startsWith('hhhh'), 'head preserved');
    assert(result.output.endsWith('tttt'), 'tail preserved');
    assert(result.output.includes('[...truncated'), 'truncation marker present');
    assert(result.output.length < input.length, 'truncated output is shorter');
    assert(result.output.length <= cap + 80, 'truncated output stays near cap (marker overhead ~80 bytes)');
}

// Test 4: default cap
{
    assert(DEFAULT_TOOL_CAP_BYTES === 10240, 'default cap is 10240 bytes');
}

// Test 5: cap of 0 disables truncation (pass through)
{
    const input = 'x'.repeat(50000);
    const result = truncateToolOutput(input, 0);
    assert(result.output.length === 50000, 'cap=0 disables truncation');
    assert(result.truncated === false, 'cap=0 output not marked truncated');
}

// Test 6: unicode safety — string length is used, not byte length (approximation)
{
    const input = '你'.repeat(500); // ~500 code points
    const result = truncateToolOutput(input, 100);
    assert(result.truncated === true, 'unicode over cap is truncated');
    assert(result.output.startsWith('你'), 'first unicode char preserved');
    assert(result.output.endsWith('你'), 'last unicode char preserved');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/truncate-tool-output.test.ts
```
Expected: esbuild bundle error because `@/core/telemetry/truncate-tool-output` does not yet exist.

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/truncate-tool-output.ts`:

```typescript
/**
 * Truncate a long tool output string to a bounded length,
 * preserving the head and tail and inserting a clearly-marked middle segment.
 *
 * The cap is measured in string length (code units), not byte length.
 * For ASCII this is identical to byte length; for unicode it is a conservative
 * approximation (shorter than byte length), which is fine for our purpose:
 * the goal is "don't blow up trace files", not "exact byte accounting".
 *
 * cap <= 0 disables truncation entirely (used when PEAK_TRACE_TOOL_CAP=0).
 */

export const DEFAULT_TOOL_CAP_BYTES = 10240;

export interface TruncateResult {
    output: string;
    truncated: boolean;
    originalBytes?: number;
}

export function truncateToolOutput(input: string, cap: number): TruncateResult {
    if (cap <= 0 || input.length <= cap) {
        return { output: input, truncated: false };
    }
    // Split cap evenly between head and tail, leaving ~80 chars for the marker.
    const headLen = Math.floor(cap * 0.4);
    const tailLen = Math.floor(cap * 0.4);
    const droppedBytes = input.length - headLen - tailLen;
    const head = input.slice(0, headLen);
    const tail = input.slice(input.length - tailLen);
    const marker = `\n[...truncated ${droppedBytes} bytes]\n`;
    return {
        output: head + marker + tail,
        truncated: true,
        originalBytes: input.length,
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/truncate-tool-output.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/truncate-tool-output.ts test/core/telemetry/truncate-tool-output.test.ts
git commit -m "feat(telemetry): tool output truncator with tests"
```

---

## Task 4: SDK message mapper (TDD)

**Files:**
- Create: `src/core/telemetry/sdk-message-mapper.ts`
- Test: `test/core/telemetry/sdk-message-mapper.test.ts`

This is the core adapter from Agent SDK's `SDKMessage` union to the canonical record types. It is stateful because iterations span multiple messages (assistant message opens an iteration by emitting tool_use; the matching user message with tool_result closes each tool call; the result message closes the run). The mapper exposes a class with a `consume(msg)` method that returns the current `TraceBuffer` each call, and a `finalize()` method.

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/sdk-message-mapper.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/sdk-message-mapper.test.ts
```
Expected: esbuild bundle error because `@/core/telemetry/sdk-message-mapper` does not yet exist.

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/sdk-message-mapper.ts`:

```typescript
/**
 * Pure(ish) adapter from Agent SDK's SDKMessage union to canonical trace records.
 *
 * The mapper is stateful because iterations span multiple messages:
 *   - An `assistant` message whose content contains one or more `tool_use` blocks
 *     opens a new iteration and registers each tool call as "pending".
 *   - A `user` message whose content contains `tool_result` blocks closes
 *     pending tool calls by matching `tool_use_id`.
 *   - A `result` message finalizes the run.
 *
 * The mapper holds an in-memory TraceBuffer. Callers access it via getBuffer()
 * after each consume() or once at flush time. The mapper does no I/O.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
    CanonicalEvent,
    FinalEvent,
    IterationEvent,
    SessionHeader,
    StoppedReason,
    ToolCallRecord,
    TraceBuffer,
    UsageSummary,
} from './trace-types';

export interface SdkMessageMapperOptions {
    sessionId: string;
    agentName: string;
    scenarioName?: string;
    intent?: string;
    profileId: string;
    fixture?: string;
    track: 'cli' | 'obsidian';
}

interface PendingToolCall {
    iterationIndex: number;
    toolUseId: string;
    record: ToolCallRecord;
    startedAt: number;
}

export class SdkMessageMapper {
    private buffer: TraceBuffer;
    private currentIteration: IterationEvent | null = null;
    private pendingByToolUseId = new Map<string, PendingToolCall>();

    constructor(private options: SdkMessageMapperOptions) {
        const header: SessionHeader = {
            type: 'session',
            sessionId: options.sessionId,
            ts: new Date().toISOString(),
            agentName: options.agentName,
            scenarioName: options.scenarioName,
            intent: options.intent,
            profileId: options.profileId,
            model: options.profileId, // will be overwritten by system init message if present
            fixture: options.fixture,
            track: options.track,
        };
        this.buffer = { header, iterations: [] };
    }

    getBuffer(): TraceBuffer {
        return this.buffer;
    }

    consume(msg: SDKMessage): void {
        switch ((msg as any).type) {
            case 'system':
                this.handleSystem(msg as any);
                break;
            case 'assistant':
                this.handleAssistant(msg as any);
                break;
            case 'user':
                this.handleUser(msg as any);
                break;
            case 'result':
                this.handleResult(msg as any);
                break;
            // All other SDKMessage variants (partial, progress, hook, etc.)
            // are intentionally ignored. They do not contribute to canonical records.
            default:
                break;
        }
    }

    private handleSystem(msg: any): void {
        if (msg.subtype !== 'init') return;
        if (typeof msg.model === 'string') {
            this.buffer.header.model = msg.model;
        }
    }

    private handleAssistant(msg: any): void {
        const content = msg.message?.content;
        if (!Array.isArray(content)) return;

        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

        for (const block of content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type === 'text' && typeof block.text === 'string') {
                textParts.push(block.text);
            } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
                thinkingParts.push(block.thinking);
            } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
                toolUses.push({ id: block.id, name: block.name, input: block.input });
            }
        }

        // An assistant message without any tool_use blocks is a pure-thought turn,
        // not an iteration boundary. We do not open an iteration for it.
        if (toolUses.length === 0) return;

        const index = this.buffer.iterations.length;
        const iteration: IterationEvent = {
            type: 'iteration',
            index,
            planMs: 0, // filled from result.duration distribution later (or left 0 if unknown)
            toolCount: toolUses.length,
            toolCalls: [],
            plan: {
                assistantText: textParts.join('\n'),
                thinking: thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined,
            },
        };
        this.buffer.iterations.push(iteration);
        this.currentIteration = iteration;

        const now = Date.now();
        for (const tu of toolUses) {
            const record: ToolCallRecord = {
                toolName: tu.name,
                toolUseId: tu.id,
                durationMs: 0,
                inputShape: shapeOf(tu.input),
                input: tu.input,
            };
            iteration.toolCalls.push(record);
            this.pendingByToolUseId.set(tu.id, {
                iterationIndex: index,
                toolUseId: tu.id,
                record,
                startedAt: now,
            });
        }
    }

    private handleUser(msg: any): void {
        const content = msg.message?.content;
        if (!Array.isArray(content)) return;
        const now = Date.now();
        for (const block of content) {
            if (!block || typeof block !== 'object') continue;
            if (block.type !== 'tool_result') continue;
            const id = block.tool_use_id;
            if (typeof id !== 'string') continue;
            const pending = this.pendingByToolUseId.get(id);
            if (!pending) continue;
            pending.record.output = stringifyToolResultContent(block.content);
            pending.record.durationMs = Math.max(0, now - pending.startedAt);
            this.pendingByToolUseId.delete(id);
        }
    }

    private handleResult(msg: any): void {
        const usage: UsageSummary = {
            inputTokens: msg.usage?.input_tokens ?? 0,
            outputTokens: msg.usage?.output_tokens ?? 0,
            cacheReadInputTokens: msg.usage?.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: msg.usage?.cache_creation_input_tokens ?? 0,
            totalTokens:
                (msg.usage?.input_tokens ?? 0) +
                (msg.usage?.output_tokens ?? 0),
            costUSD: msg.total_cost_usd,
        };

        const totalToolCalls = this.buffer.iterations.reduce((acc, it) => acc + it.toolCalls.length, 0);

        const finalOutput: string | undefined = typeof msg.result === 'string' ? msg.result : undefined;

        const final: FinalEvent = {
            type: 'final',
            stoppedReason: mapStoppedReason(msg),
            totalIterations: this.buffer.iterations.length,
            totalToolCalls,
            durationMs: msg.duration_ms ?? 0,
            usage,
            finalOutputShape: {
                kind: finalOutput !== undefined ? 'text' : 'unknown',
                length: finalOutput?.length,
            },
            finalOutput,
            error: msg.is_error
                ? { message: Array.isArray(msg.errors) ? msg.errors.join('; ') : 'unknown error' }
                : undefined,
        };
        this.buffer.final = final;
    }

    finalize(errorMessage?: string): void {
        if (this.buffer.final) return;
        const totalToolCalls = this.buffer.iterations.reduce((acc, it) => acc + it.toolCalls.length, 0);
        this.buffer.final = {
            type: 'final',
            stoppedReason: errorMessage ? 'error_during_execution' : 'aborted',
            totalIterations: this.buffer.iterations.length,
            totalToolCalls,
            durationMs: 0,
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                totalTokens: 0,
            },
            finalOutputShape: { kind: 'unknown' },
            error: errorMessage ? { message: errorMessage } : undefined,
        };
    }
}

function mapStoppedReason(resultMsg: any): StoppedReason {
    if (resultMsg.subtype === 'success') return 'success';
    if (resultMsg.subtype === 'error_during_execution') return 'error_during_execution';
    if (resultMsg.subtype === 'error_max_turns') return 'error_max_turns';
    if (resultMsg.subtype === 'error_max_budget_usd') return 'error_max_budget_usd';
    if (resultMsg.subtype === 'error_max_structured_output_retries') return 'error_max_structured_output_retries';
    return 'error_during_execution';
}

/**
 * Build a shape descriptor map for the meta projection.
 * For each top-level key, record a short type+size hint, never the value itself.
 * Example: { query: "hello", path: "/notes/a.md" } → { query: "string(5)", path: "string(12)" }
 */
function shapeOf(input: unknown): Record<string, string> {
    if (input === null || typeof input !== 'object') return { _: describe(input) };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = describe(v);
    }
    return out;
}

function describe(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'string') return `string(${v.length})`;
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    if (Array.isArray(v)) return `array(${v.length})`;
    if (typeof v === 'object') return `object(${Object.keys(v as object).length})`;
    return typeof v;
}

/**
 * tool_result `content` can be a plain string or an array of blocks.
 * Normalize to a single string that the canonical record can store.
 */
function stringifyToolResultContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const b of content) {
            if (!b || typeof b !== 'object') continue;
            const block = b as Record<string, unknown>;
            if (block.type === 'text' && typeof block.text === 'string') {
                parts.push(block.text);
            } else if (block.type === 'image') {
                parts.push('[image]');
            } else {
                parts.push(JSON.stringify(block));
            }
        }
        return parts.join('\n');
    }
    try {
        return JSON.stringify(content);
    } catch {
        return String(content);
    }
}

// Convenience: non-class factory + one-shot iterator drain for cases where the
// caller prefers a functional style. Not used in tests but used in the CLI harness.
export function drainToBuffer(
    mapper: SdkMessageMapper,
    iter: AsyncIterable<SDKMessage>,
): Promise<TraceBuffer> {
    return (async () => {
        for await (const msg of iter) {
            mapper.consume(msg);
        }
        return mapper.getBuffer();
    })();
}

export type { CanonicalEvent };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/sdk-message-mapper.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/sdk-message-mapper.ts test/core/telemetry/sdk-message-mapper.test.ts
git commit -m "feat(telemetry): SDKMessage → canonical record mapper with tests"
```

---

## Task 5: Trace sink (TDD)

**Files:**
- Create: `src/core/telemetry/traceSink.ts`
- Test: `test/core/telemetry/traceSink.test.ts`

The sink wraps the mapper and handles I/O: accumulating the buffer and flushing to two JSONL files atomically.

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/traceSink.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/traceSink.test.ts
```
Expected: bundle error (`@/core/telemetry/traceSink` does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/traceSink.ts`:

```typescript
/**
 * TraceSink: holds a SdkMessageMapper, accepts SDKMessage events, and on flush()
 * writes two JSONL projections of the accumulated TraceBuffer to disk.
 *
 * Output layout:
 *   <rootDir>/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.meta.jsonl
 *   <rootDir>/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.full.jsonl
 *
 * Writes are atomic: write-to-tmp + rename, so a reader never sees a half-file.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SdkMessageMapper, type SdkMessageMapperOptions } from './sdk-message-mapper';
import { truncateToolOutput } from './truncate-tool-output';
import type {
    CanonicalEvent,
    FinalEvent,
    IterationEvent,
    SessionHeader,
    ToolCallRecord,
    TraceBuffer,
} from './trace-types';

export interface TraceSinkOptions extends Omit<SdkMessageMapperOptions, 'sessionId'> {
    /** Root directory for trace files (typically <plugin-data>/data/traces/). */
    rootDir: string;
    /** Tool output cap in bytes; 0 disables truncation. Default is DEFAULT_TOOL_CAP_BYTES. */
    toolCapBytes: number;
    /** Explicit session id (for tests / resumable sessions). Auto-generated if omitted. */
    sessionId?: string;
    /** Clock injector for deterministic tests. Defaults to () => new Date(). */
    now?: () => Date;
}

export interface FlushResult {
    metaPath: string;
    fullPath: string;
}

export class TraceSink {
    private mapper: SdkMessageMapper;
    private now: () => Date;

    constructor(private options: TraceSinkOptions) {
        this.now = options.now ?? (() => new Date());
        const sessionId = options.sessionId ?? generateSessionId();
        this.mapper = new SdkMessageMapper({
            sessionId,
            agentName: options.agentName,
            scenarioName: options.scenarioName,
            intent: options.intent,
            profileId: options.profileId,
            fixture: options.fixture,
            track: options.track,
        });
    }

    consume(msg: SDKMessage): void {
        this.mapper.consume(msg);
    }

    finalizeWithError(message: string): void {
        this.mapper.finalize(message);
    }

    flush(): FlushResult {
        const buffer = this.mapper.getBuffer();
        if (!buffer.final) this.mapper.finalize();

        const when = this.now();
        const dateDir = formatDateDir(when);
        const stamp = formatStamp(when);
        const scenarioPart = this.options.scenarioName ? `-${slug(this.options.scenarioName)}` : '';
        const baseName = `${slug(this.options.agentName)}${scenarioPart}-${stamp}`;
        const dir = path.join(this.options.rootDir, dateDir);
        fs.mkdirSync(dir, { recursive: true });

        const metaPath = path.join(dir, `${baseName}.meta.jsonl`);
        const fullPath = path.join(dir, `${baseName}.full.jsonl`);

        const metaLines = buildMetaProjection(buffer);
        const fullLines = buildFullProjection(buffer, this.options.toolCapBytes);

        writeAtomic(metaPath, metaLines.join('\n') + '\n');
        writeAtomic(fullPath, fullLines.join('\n') + '\n');

        return { metaPath, fullPath };
    }
}

// ── Projections ──────────────────────────────────────────────────────────

function buildMetaProjection(buffer: TraceBuffer): string[] {
    const lines: string[] = [];
    lines.push(JSON.stringify(buffer.header));
    for (const iter of buffer.iterations) {
        const metaIter: IterationEvent = {
            type: 'iteration',
            index: iter.index,
            planMs: iter.planMs,
            toolCount: iter.toolCount,
            toolCalls: iter.toolCalls.map((tc): ToolCallRecord => ({
                toolName: tc.toolName,
                toolUseId: tc.toolUseId,
                durationMs: tc.durationMs,
                inputShape: tc.inputShape,
                // input/output/outputTruncated/originalOutputBytes intentionally omitted
            })),
            // plan intentionally omitted in meta projection
        };
        lines.push(JSON.stringify(metaIter));
    }
    if (buffer.final) {
        const metaFinal: FinalEvent = {
            type: 'final',
            stoppedReason: buffer.final.stoppedReason,
            totalIterations: buffer.final.totalIterations,
            totalToolCalls: buffer.final.totalToolCalls,
            durationMs: buffer.final.durationMs,
            usage: buffer.final.usage,
            finalOutputShape: buffer.final.finalOutputShape,
            // finalOutput intentionally omitted in meta projection
            error: buffer.final.error,
        };
        lines.push(JSON.stringify(metaFinal));
    }
    return lines;
}

function buildFullProjection(buffer: TraceBuffer, toolCapBytes: number): string[] {
    const lines: string[] = [];
    lines.push(JSON.stringify(buffer.header));
    for (const iter of buffer.iterations) {
        const fullIter: IterationEvent = {
            type: 'iteration',
            index: iter.index,
            planMs: iter.planMs,
            toolCount: iter.toolCount,
            toolCalls: iter.toolCalls.map((tc): ToolCallRecord => {
                const out = typeof tc.output === 'string' ? truncateToolOutput(tc.output, toolCapBytes) : undefined;
                return {
                    toolName: tc.toolName,
                    toolUseId: tc.toolUseId,
                    durationMs: tc.durationMs,
                    inputShape: tc.inputShape,
                    input: tc.input,
                    output: out?.output,
                    outputTruncated: out?.truncated ?? false,
                    originalOutputBytes: out?.originalBytes,
                };
            }),
            plan: iter.plan,
        };
        lines.push(JSON.stringify(fullIter));
    }
    if (buffer.final) {
        lines.push(JSON.stringify(buffer.final));
    }
    return lines;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDateDir(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatStamp(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const rand = randomBytes(2).toString('hex');
    return `${y}${m}${day}-${hh}${mm}${ss}-${rand}`;
}

function slug(s: string): string {
    return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function writeAtomic(finalPath: string, content: string): void {
    const tmpPath = `${finalPath}.${randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, finalPath);
}

function generateSessionId(): string {
    return `sess-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

export type { CanonicalEvent, SessionHeader, IterationEvent, FinalEvent };
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/traceSink.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/traceSink.ts test/core/telemetry/traceSink.test.ts
git commit -m "feat(telemetry): trace sink with meta/full JSONL projections and atomic write"
```

---

## Task 6: Fixture vault content

**Files:**
- Create: `test/fixtures/vault/small/**/*.md` (~25 files)

No TDD — this task is curated content authored by hand. The goal is to produce a small vault where the 5 planned scenarios can each exercise a meaningful subset of real agent behavior.

- [ ] **Step 1: Create the directory skeleton**

```bash
mkdir -p test/fixtures/vault/small/refactor test/fixtures/vault/small/mcp test/fixtures/vault/small/concepts test/fixtures/vault/small/multilingual test/fixtures/vault/small/decoys test/fixtures/vault/small/orphans
```

- [ ] **Step 2: Author the hub + spokes set (6 files)**

Create `test/fixtures/vault/small/refactor/provider-v2-overview.md`:

```markdown
---
tags: [refactor, provider, overview, hub]
---
# Provider V2 Refactor — Overview

The core motivation for provider v2 is to **reduce cognitive burden** by collapsing
all LLM calls onto a single runtime. See the spokes for details:

- [[profile-registry]] — unified configuration surface
- [[subprocess-ipc]] — how queries talk to the model
- [[mcp-unification]] — tool plumbing
- [[embedding-split]] — why embeddings are the one exception
- [[skill-rewrite]] — skills on the new runtime

This refactor explicitly accepts desktop-only as a tradeoff.
```

Create `test/fixtures/vault/small/refactor/profile-registry.md`:

```markdown
---
tags: [refactor, provider, profile]
---
# Profile Registry

Every provider choice is a Profile in a single registry. Features read from this
registry rather than hold their own configuration. Backlink: [[provider-v2-overview]].
```

Create `test/fixtures/vault/small/refactor/subprocess-ipc.md`:

```markdown
---
tags: [refactor, provider, ipc]
---
# Subprocess IPC

The Agent SDK spawns a subprocess per plugin load and reuses it across calls.
JSON-RPC over stdio. Backlink: [[provider-v2-overview]].
```

Create `test/fixtures/vault/small/mcp/mcp-unification.md`:

```markdown
---
tags: [refactor, mcp]
---
# MCP Unification

Previously planned as a wrapper around the raw MCP client; now unified through
the Agent SDK's built-in MCP client. Backlink: [[provider-v2-overview]].
```

Create `test/fixtures/vault/small/concepts/embedding-split.md`:

```markdown
---
tags: [embeddings, refactor]
---
# Embedding Split

Anthropic has no embedding API, so embeddings use a ~50-line HTTP utility against
OpenAI-format endpoints. This is deliberately not a second runtime.
Backlink: [[provider-v2-overview]].
```

Create `test/fixtures/vault/small/refactor/skill-rewrite.md`:

```markdown
---
tags: [refactor, skill]
---
# Skill Rewrite

Skills are rewritten to run exclusively through the Agent SDK. The `simple` vs
`pipeline` distinction becomes "how many `query()` calls." Backlink: [[provider-v2-overview]].
```

- [ ] **Step 3: Author the ambiguous-title pair (2 files)**

Create `test/fixtures/vault/small/refactor/migration-notes.md`:

```markdown
---
tags: [refactor]
---
# Migration Notes

Step-by-step notes for the provider v2 refactor. Covers the deletion list for
legacy adapter code under `core/providers/adapter/`. See also [[migration-log]].
```

Create `test/fixtures/vault/small/concepts/migration-log.md`:

```markdown
---
tags: [journal]
---
# Migration Log

Personal journal entries written during past migrations. This is *not* the
provider v2 refactor notes — see [[migration-notes]] for that.
```

- [ ] **Step 4: Author multilingual content (6 files)**

Create `test/fixtures/vault/small/multilingual/zh-provider-refactor.md`:

```markdown
---
tags: [refactor, 中文]
---
# Provider 重构的核心动机

这份重构的根本目的是**降低认知负担**：所有 LLM 调用都走同一条路径，所有配置都落在
同一个 Profile Registry 里，不需要再回答"这个功能走哪个 SDK"。

见 [[provider-v2-overview]] 的英文概览。
```

Create `test/fixtures/vault/small/multilingual/zh-mcp-introduction.md`:

```markdown
---
tags: [mcp, 中文]
---
# MCP 是什么

Model Context Protocol 是一种让 agent 发现和调用外部工具的开放协议。
Agent SDK 内置 MCP 客户端，不再需要额外的包装层。
```

Create `test/fixtures/vault/small/multilingual/zh-embedding.md`:

```markdown
---
tags: [embeddings, 中文]
---
# 为什么 embedding 是例外

Anthropic 没有 embedding endpoint，所以 embedding 单独走一条 HTTP 路径，
典型是 OpenAI-format 的 /v1/embeddings，通过 OpenRouter 或 LiteLLM 代理。
这不是第二条 runtime，是一个纯数据工具函数。
```

Create `test/fixtures/vault/small/multilingual/zh-skill-rewrite.md`:

```markdown
---
tags: [refactor, skill, 中文]
---
# 技能系统重写

技能原本按"简单 / 流水线"分类，在新架构下这个区分退化为
"一次 query() vs 多次 query()"，不再是 runtime 的分叉点。
```

Create `test/fixtures/vault/small/multilingual/mixed-glossary.md`:

```markdown
---
tags: [glossary]
---
# Glossary / 术语

- **Profile / 画像** — A configuration snapshot for one provider + model combination.
- **Runtime / 运行时** — The execution environment for an LLM call; in v2 there is exactly one.
- **Spoke / 辐条** — A satellite note linked from a hub note.
```

Create `test/fixtures/vault/small/multilingual/multilingual-index.md`:

```markdown
---
tags: [index, 中文]
---
# 多语种笔记索引

- [[zh-provider-refactor]]
- [[zh-mcp-introduction]]
- [[zh-embedding]]
- [[zh-skill-rewrite]]
- [[mixed-glossary]]
```

- [ ] **Step 5: Author decoys (3 files)**

Create `test/fixtures/vault/small/decoys/provider-api-billing.md`:

```markdown
---
tags: [billing]
---
# Provider API Billing

Notes about how different LLM providers charge for tokens. This file mentions
"provider" and "api" heavily but is **not** about the refactor.
```

Create `test/fixtures/vault/small/decoys/refactor-to-do-list.md`:

```markdown
---
tags: [todo]
---
# Refactor To-Do List

Personal todo: unrelated household items. The word "refactor" appears only in
the title as a joke. Do not confuse with the provider v2 refactor.
```

Create `test/fixtures/vault/small/decoys/mcp-microphone-checklist.md`:

```markdown
---
tags: [todo]
---
# MCP Microphone Checklist

"MCP" here stands for "microphone check point." Nothing to do with Model Context
Protocol. A decoy for keyword-only matching.
```

- [ ] **Step 6: Author orphans and a long file (3 files)**

Create `test/fixtures/vault/small/orphans/orphan-thought.md`:

```markdown
---
tags: [fleeting]
---
# Orphan Thought

A note with no incoming or outgoing links. Exists to ensure agents handle
orphans gracefully in link traversal tools.
```

Create `test/fixtures/vault/small/orphans/another-orphan.md`:

```markdown
# Another Orphan

No frontmatter, no links, no tags. Pure text.
```

Create `test/fixtures/vault/small/concepts/long-note.md`:

```markdown
---
tags: [long, concepts]
---
# Long Note — Intentional Chunking Fixture

This note is deliberately long to exercise chunking thresholds in tools that
read note bodies in pages. The content below repeats a representative paragraph
enough times to push the body well past a typical chunk boundary.

## Section 1

Provider v2's core principle is one runtime, one mental model, one configuration
surface. Every LLM call flows through the Agent SDK. Every provider choice is a
Profile in a single registry. The only explicit split is embeddings, which are
handled by a ~50-line utility function. The goal is cognitive singularity.

## Section 2

Provider v2's core principle is one runtime, one mental model, one configuration
surface. Every LLM call flows through the Agent SDK. Every provider choice is a
Profile in a single registry. The only explicit split is embeddings, which are
handled by a ~50-line utility function. The goal is cognitive singularity.

## Section 3

Provider v2's core principle is one runtime, one mental model, one configuration
surface. Every LLM call flows through the Agent SDK. Every provider choice is a
Profile in a single registry. The only explicit split is embeddings, which are
handled by a ~50-line utility function. The goal is cognitive singularity.

## Section 4

Provider v2's core principle is one runtime, one mental model, one configuration
surface. Every LLM call flows through the Agent SDK. Every provider choice is a
Profile in a single registry. The only explicit split is embeddings, which are
handled by a ~50-line utility function. The goal is cognitive singularity.

## Section 5

Provider v2's core principle is one runtime, one mental model, one configuration
surface. Every LLM call flows through the Agent SDK. Every provider choice is a
Profile in a single registry. The only explicit split is embeddings, which are
handled by a ~50-line utility function. The goal is cognitive singularity.
```

- [ ] **Step 7: Author "not-found" scenario anchors (2 files)**

These files deliberately contain nothing about the `not-found.yaml` scenario's topic.
Their presence ensures grep still returns no meaningful hits.

Create `test/fixtures/vault/small/concepts/obsidian-keyboard-shortcuts.md`:

```markdown
---
tags: [obsidian, ui]
---
# Obsidian Keyboard Shortcuts

A reference list of useful Obsidian keyboard shortcuts unrelated to anything else
in this fixture vault.
```

Create `test/fixtures/vault/small/concepts/daily-habit-tracker.md`:

```markdown
---
tags: [habits]
---
# Daily Habit Tracker

Notes about habit tracking methodology. Unrelated to refactoring, MCP, or
provider configuration.
```

- [ ] **Step 8: Verify file count**

Run:
```bash
find test/fixtures/vault/small -name '*.md' -type f | wc -l
```
Expected: `22` (6 hub+spokes + 2 ambiguous + 6 multilingual + 3 decoys + 2 orphans + 1 long + 2 not-found anchors).

If the count is lower than 20, re-check which files are missing. The plan's success criteria require at least 20 fixture files to exercise chunking and link resolution meaningfully.

- [ ] **Step 9: Commit**

```bash
git add test/fixtures/vault/small
git commit -m "feat(telemetry): curated fixture vault for trace scenarios"
```

---

## Task 7: Filesystem vault reader (TDD)

**Files:**
- Create: `src/core/telemetry/fs-vault-mcp/fs-vault-reader.ts`
- Test: `test/core/telemetry/fs-vault-reader.test.ts`

A pure-function library: `readFile`, `listFiles`, `grep`, `readFrontmatter`. Works against any root directory; tests use the fixture vault from Task 6.

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/fs-vault-reader.test.ts`:

```typescript
import {
    readFile,
    listFiles,
    grep,
    readFrontmatter,
} from '@/core/telemetry/fs-vault-mcp/fs-vault-reader';
import * as path from 'node:path';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

const FIXTURE_ROOT = path.resolve(process.cwd(), 'test/fixtures/vault/small');

// Test 1: listFiles returns all markdown files as vault-relative paths
{
    const files = listFiles(FIXTURE_ROOT);
    assert(files.length >= 20, `listFiles returns >=20 files (got ${files.length})`);
    assert(files.every((p) => p.endsWith('.md')), 'all returned files end with .md');
    assert(files.every((p) => !path.isAbsolute(p)), 'returned paths are vault-relative');
    assert(files.includes('refactor/provider-v2-overview.md'), 'hub file is listed');
}

// Test 2: listFiles supports simple glob filter
{
    const zhFiles = listFiles(FIXTURE_ROOT, 'multilingual/**/*.md');
    assert(zhFiles.length >= 5, `multilingual files filtered (got ${zhFiles.length})`);
    assert(zhFiles.every((p) => p.startsWith('multilingual/')), 'glob filter scoped correctly');
}

// Test 3: readFile returns file content as string
{
    const content = readFile(FIXTURE_ROOT, 'refactor/provider-v2-overview.md');
    assert(content.includes('Provider V2 Refactor'), 'hub file content returned');
    assert(content.includes('[[profile-registry]]'), 'wiki link preserved');
}

// Test 4: readFile rejects paths escaping the root (path traversal defense)
{
    let threw = false;
    try {
        readFile(FIXTURE_ROOT, '../../../etc/passwd');
    } catch {
        threw = true;
    }
    assert(threw, 'path traversal rejected');
}

// Test 5: grep finds matches across all files
{
    const hits = grep(FIXTURE_ROOT, 'cognitive burden');
    assert(hits.length >= 2, `grep finds multiple hits for "cognitive burden" (got ${hits.length})`);
    assert(hits.some((h) => h.path === 'refactor/provider-v2-overview.md'), 'overview file matched');
    for (const h of hits) {
        assert(typeof h.lineNumber === 'number', 'hit has line number');
        assert(typeof h.line === 'string', 'hit has matched line');
    }
}

// Test 6: grep scoped by optional path prefix
{
    const hits = grep(FIXTURE_ROOT, '重构', 'multilingual');
    assert(hits.length >= 1, `zh-scoped grep works (got ${hits.length})`);
    assert(hits.every((h) => h.path.startsWith('multilingual/')), 'all hits within prefix');
}

// Test 7: readFrontmatter extracts YAML frontmatter as plain object
{
    const fm = readFrontmatter(FIXTURE_ROOT, 'refactor/provider-v2-overview.md');
    assert(Array.isArray(fm?.tags), 'tags is an array');
    assert((fm?.tags as string[]).includes('hub'), 'hub tag present');
}

// Test 8: readFrontmatter returns null when no frontmatter
{
    const fm = readFrontmatter(FIXTURE_ROOT, 'orphans/another-orphan.md');
    assert(fm === null, 'no frontmatter returns null');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/fs-vault-reader.test.ts
```
Expected: bundle error (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/fs-vault-mcp/fs-vault-reader.ts`:

```typescript
/**
 * Filesystem-backed vault reader.
 *
 * All functions take an absolute `root` directory and vault-relative paths.
 * Paths are resolved safely to reject traversal outside of `root`.
 *
 * This is deliberately a minimal, single-file implementation that can be audited
 * at a glance. It does NOT attempt to replicate Obsidian MetadataCache semantics
 * beyond what the first scenarios require. Divergence from real behavior is
 * caught by the Obsidian track, not by this module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface GrepHit {
    path: string;
    lineNumber: number;
    line: string;
}

export function listFiles(root: string, glob?: string): string[] {
    const absRoot = path.resolve(root);
    const all: string[] = [];
    walk(absRoot, absRoot, all);
    if (!glob) return all.sort();
    const matcher = compileGlob(glob);
    return all.filter((p) => matcher(p)).sort();
}

export function readFile(root: string, relPath: string): string {
    const abs = safeResolve(root, relPath);
    return fs.readFileSync(abs, 'utf8');
}

export function grep(root: string, query: string, scopePrefix?: string): GrepHit[] {
    const files = listFiles(root);
    const hits: GrepHit[] = [];
    const scope = scopePrefix ? scopePrefix.replace(/\/$/, '') + '/' : '';
    for (const relPath of files) {
        if (scope && !relPath.startsWith(scope)) continue;
        const content = readFile(root, relPath);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
                hits.push({ path: relPath, lineNumber: i + 1, line: lines[i] });
            }
        }
    }
    return hits;
}

export function readFrontmatter(root: string, relPath: string): Record<string, unknown> | null {
    const content = readFile(root, relPath);
    if (!content.startsWith('---\n')) return null;
    const end = content.indexOf('\n---', 4);
    if (end === -1) return null;
    const yamlBlock = content.slice(4, end);
    try {
        const parsed = parseYaml(yamlBlock);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

// ── Internals ────────────────────────────────────────────────────────────

function walk(rootAbs: string, dirAbs: string, out: string[]): void {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const abs = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
            walk(rootAbs, abs, out);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            out.push(path.relative(rootAbs, abs).split(path.sep).join('/'));
        }
    }
}

function safeResolve(root: string, relPath: string): string {
    const absRoot = path.resolve(root);
    const abs = path.resolve(absRoot, relPath);
    const prefix = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
    if (abs !== absRoot && !abs.startsWith(prefix)) {
        throw new Error(`Path escapes vault root: ${relPath}`);
    }
    return abs;
}

/**
 * Compile a minimal glob (supports `*`, `**`, `/`) to a predicate function.
 * Not a full glob engine — intentionally just enough for the scenarios we ship.
 */
function compileGlob(glob: string): (p: string) => boolean {
    const pattern =
        '^' +
        glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '§§DOUBLE§§')
            .replace(/\*/g, '[^/]*')
            .replace(/§§DOUBLE§§/g, '.*') +
        '$';
    const re = new RegExp(pattern);
    return (p: string) => re.test(p);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/fs-vault-reader.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/fs-vault-mcp/fs-vault-reader.ts test/core/telemetry/fs-vault-reader.test.ts
git commit -m "feat(telemetry): filesystem vault reader with glob + grep + frontmatter"
```

---

## Task 8: Wiki-link resolver (TDD)

**Files:**
- Create: `src/core/telemetry/fs-vault-mcp/link-resolver.ts`
- Test: `test/core/telemetry/link-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/link-resolver.test.ts`:

```typescript
import {
    extractWikiLinks,
    buildLinkIndex,
    resolveLink,
    listBacklinks,
} from '@/core/telemetry/fs-vault-mcp/link-resolver';
import * as path from 'node:path';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

const FIXTURE_ROOT = path.resolve(process.cwd(), 'test/fixtures/vault/small');

// Test 1: extract wiki links from text
{
    const text = `See [[profile-registry]] and [[subprocess-ipc|IPC layer]].`;
    const links = extractWikiLinks(text);
    assert(links.length === 2, 'two wiki links extracted');
    assert(links[0].target === 'profile-registry', 'first target extracted');
    assert(links[1].target === 'subprocess-ipc', 'pipe-aliased target extracted');
    assert(links[1].alias === 'IPC layer', 'alias preserved');
}

// Test 2: extract wiki links ignores code blocks / escaped brackets
{
    const text = `Normal [[link-a]] but not \\[[escaped-b]].`;
    const links = extractWikiLinks(text);
    assert(links.length === 1, 'escaped link ignored');
    assert(links[0].target === 'link-a', 'normal link kept');
}

// Test 3: build link index over the whole fixture vault
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    assert(index.forwardLinks.size > 0, 'forward link map non-empty');
    assert(index.backLinks.size > 0, 'back link map non-empty');
}

// Test 4: resolve a link by target name (first file whose basename matches)
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const target = resolveLink(index, 'profile-registry');
    assert(target === 'refactor/profile-registry.md', 'link resolved to full path');
}

// Test 5: unresolved link returns null
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const target = resolveLink(index, 'does-not-exist-anywhere');
    assert(target === null, 'missing link returns null');
}

// Test 6: backlinks of the hub file include every spoke
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const backlinks = listBacklinks(index, 'refactor/provider-v2-overview.md');
    assert(backlinks.length >= 5, `hub has >=5 backlinks (got ${backlinks.length})`);
    assert(backlinks.includes('refactor/profile-registry.md'), 'profile-registry backlinks to hub');
    assert(backlinks.includes('refactor/subprocess-ipc.md'), 'subprocess-ipc backlinks to hub');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/link-resolver.test.ts
```
Expected: bundle error.

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/fs-vault-mcp/link-resolver.ts`:

```typescript
/**
 * Minimal wiki-link resolver for the filesystem vault.
 *
 * Resolution rule: a target name like `profile-registry` matches the first file
 * (in lexicographic order) whose basename without extension equals the target,
 * case-insensitive. This is NOT Obsidian's full resolution algorithm — Obsidian
 * allows relative paths, unresolved links, and aliases. The minimal rule here
 * is enough for the hub-discovery / ambiguous-query scenarios and is explicitly
 * called out as a divergence point for the Obsidian track to catch.
 */

import * as path from 'node:path';
import { listFiles, readFile } from './fs-vault-reader';

export interface WikiLink {
    target: string;
    alias?: string;
}

export interface LinkIndex {
    /** vault-relative path → list of wiki links it contains */
    forwardLinks: Map<string, WikiLink[]>;
    /** vault-relative path → list of vault-relative paths that link TO it */
    backLinks: Map<string, string[]>;
    /** lowercase basename-without-ext → vault-relative path (first match wins) */
    basenameIndex: Map<string, string>;
}

const WIKI_LINK_RE = /(?<!\\)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(text: string): WikiLink[] {
    const out: WikiLink[] = [];
    const re = new RegExp(WIKI_LINK_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push({ target: m[1].trim(), alias: m[2]?.trim() });
    }
    return out;
}

export function buildLinkIndex(root: string): LinkIndex {
    const files = listFiles(root);
    const forwardLinks = new Map<string, WikiLink[]>();
    const backLinks = new Map<string, string[]>();
    const basenameIndex = new Map<string, string>();

    // Pass 1: build basenameIndex from all files.
    for (const rel of files) {
        const base = path.basename(rel, '.md').toLowerCase();
        if (!basenameIndex.has(base)) {
            basenameIndex.set(base, rel);
        }
    }

    // Pass 2: extract forward links from each file.
    for (const rel of files) {
        const content = readFile(root, rel);
        const links = extractWikiLinks(content);
        forwardLinks.set(rel, links);
    }

    // Pass 3: derive backlinks.
    for (const [fromPath, links] of forwardLinks.entries()) {
        for (const link of links) {
            const resolvedTo = basenameIndex.get(link.target.toLowerCase());
            if (!resolvedTo) continue;
            const list = backLinks.get(resolvedTo) ?? [];
            if (!list.includes(fromPath)) list.push(fromPath);
            backLinks.set(resolvedTo, list);
        }
    }

    return { forwardLinks, backLinks, basenameIndex };
}

export function resolveLink(index: LinkIndex, target: string): string | null {
    return index.basenameIndex.get(target.toLowerCase()) ?? null;
}

export function listBacklinks(index: LinkIndex, vaultRelPath: string): string[] {
    return (index.backLinks.get(vaultRelPath) ?? []).slice().sort();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/link-resolver.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/fs-vault-mcp/link-resolver.ts test/core/telemetry/link-resolver.test.ts
git commit -m "feat(telemetry): wiki-link resolver and backlink indexer"
```

---

## Task 9: Filesystem vault MCP server

**Files:**
- Create: `src/core/telemetry/fs-vault-mcp/server.ts`

This task wraps the pure-function readers from Tasks 7–8 into an in-process MCP server that the Agent SDK can consume via the `mcpServers` field of `query()`. Because this is thin plumbing around tested modules, it has no unit tests; correctness is verified by the end-to-end CLI smoke test in Task 14.

- [ ] **Step 1: Write the implementation**

Create `src/core/telemetry/fs-vault-mcp/server.ts`:

```typescript
/**
 * In-process filesystem MCP server exposing vault operations.
 *
 * Mirrors the tool surface the real vault MCP server exposes to VaultSearchAgent,
 * but reads from a fixture directory instead of Obsidian's Vault / MetadataCache.
 *
 * Tool names chosen to match what post-refactor VaultSearchAgent expects.
 * If the post-refactor names differ, this file is the only place to rename them.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { listFiles, readFile, grep, readFrontmatter } from './fs-vault-reader';
import { buildLinkIndex, resolveLink, listBacklinks } from './link-resolver';

export interface FsVaultMcpOptions {
    rootDir: string;
}

export function createFsVaultMcpServer(opts: FsVaultMcpOptions) {
    const { rootDir } = opts;
    // Precompute link index once at server construction — fixture is static.
    const linkIndex = buildLinkIndex(rootDir);

    return createSdkMcpServer({
        name: 'fs-vault',
        version: '0.1.0',
        tools: [
            tool(
                'vault_list_files',
                'List all markdown notes in the vault, optionally filtered by a simple glob.',
                {
                    glob: z.string().optional().describe('Glob like "refactor/**/*.md" (optional).'),
                },
                async ({ glob }) => ({
                    content: [
                        {
                            type: 'text',
                            text: listFiles(rootDir, glob).map((p) => `- ${p}`).join('\n'),
                        },
                    ],
                }),
            ),
            tool(
                'vault_read_note',
                'Read the full content of a note by vault-relative path.',
                {
                    path: z.string().describe('Vault-relative path, e.g. "refactor/provider-v2-overview.md".'),
                },
                async ({ path: relPath }) => ({
                    content: [{ type: 'text', text: readFile(rootDir, relPath) }],
                }),
            ),
            tool(
                'vault_grep',
                'Full-text search across the vault for a literal substring. Optional scope prefix.',
                {
                    query: z.string().describe('Literal substring to search for.'),
                    scope: z.string().optional().describe('Optional path prefix, e.g. "multilingual/".'),
                },
                async ({ query, scope }) => {
                    const hits = grep(rootDir, query, scope);
                    if (hits.length === 0) {
                        return { content: [{ type: 'text', text: 'No matches.' }] };
                    }
                    const preview = hits
                        .slice(0, 50)
                        .map((h) => `- ${h.path}:${h.lineNumber}: ${h.line.trim()}`)
                        .join('\n');
                    const more = hits.length > 50 ? `\n(+${hits.length - 50} more)` : '';
                    return { content: [{ type: 'text', text: preview + more }] };
                },
            ),
            tool(
                'vault_read_frontmatter',
                'Return the YAML frontmatter of a note as a JSON object. Returns "null" if none.',
                {
                    path: z.string(),
                },
                async ({ path: relPath }) => {
                    const fm = readFrontmatter(rootDir, relPath);
                    return {
                        content: [{ type: 'text', text: JSON.stringify(fm) }],
                    };
                },
            ),
            tool(
                'vault_resolve_link',
                'Resolve a wiki-link target name to a vault-relative path. Returns the path or "null".',
                {
                    target: z.string().describe('Link target without brackets, e.g. "profile-registry".'),
                },
                async ({ target }) => ({
                    content: [{ type: 'text', text: JSON.stringify(resolveLink(linkIndex, target)) }],
                }),
            ),
            tool(
                'vault_list_backlinks',
                'List vault-relative paths that link TO the given note.',
                {
                    path: z.string(),
                },
                async ({ path: relPath }) => {
                    const backs = listBacklinks(linkIndex, relPath);
                    if (backs.length === 0) return { content: [{ type: 'text', text: 'No backlinks.' }] };
                    return {
                        content: [{ type: 'text', text: backs.map((p) => `- ${p}`).join('\n') }],
                    };
                },
            ),
        ],
    });
}
```

- [ ] **Step 2: Compile check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "fs-vault-mcp/server"
```
Expected: no output (no errors involving this file). If `createSdkMcpServer` or `tool` are not the correct exports for the installed SDK version, verify by inspecting `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` for the actual factory names and adjust imports.

- [ ] **Step 3: Commit**

```bash
git add src/core/telemetry/fs-vault-mcp/server.ts
git commit -m "feat(telemetry): filesystem vault MCP server for CLI trace harness"
```

---

## Task 10: Scenario loader (TDD)

**Files:**
- Create: `src/core/telemetry/scenario-loader.ts`
- Test: `test/core/telemetry/scenario-loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/scenario-loader.test.ts`:

```typescript
import { parseScenario, loadScenarioFile } from '@/core/telemetry/scenario-loader';
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

// Test 1: valid scenario parses
{
    const yaml = `agent: vault-search
fixture: small
query: "why is provider v2 worth it"
intent: |
  Verify the agent answers "reduce cognitive burden" from the hub note.
profile: claude-opus-4-6
`;
    const scenario = parseScenario(yaml);
    assert(scenario.agent === 'vault-search', 'agent parsed');
    assert(scenario.fixture === 'small', 'fixture parsed');
    assert(scenario.query.includes('provider v2'), 'query parsed');
    assert(scenario.intent.includes('cognitive burden'), 'intent parsed');
    assert(scenario.profile === 'claude-opus-4-6', 'profile parsed');
}

// Test 2: missing required field throws
{
    const yaml = `fixture: small\nquery: hi\nintent: test\n`;
    let threw = false;
    try {
        parseScenario(yaml);
    } catch (e) {
        threw = true;
        assert((e as Error).message.includes('agent'), 'error message names missing field');
    }
    assert(threw, 'missing agent field throws');
}

// Test 3: forbidden expect field throws
{
    const yaml = `agent: vault-search
fixture: small
query: hi
intent: test
expect:
  - tool: grep_file_tree
`;
    let threw = false;
    try {
        parseScenario(yaml);
    } catch (e) {
        threw = true;
        assert(
            (e as Error).message.includes('expect'),
            `error mentions forbidden "expect" field (got: ${(e as Error).message})`,
        );
    }
    assert(threw, 'forbidden expect field is rejected');
}

// Test 4: loadScenarioFile reads from disk
{
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenario-test-'));
    const file = path.join(tmpDir, 'hub.yaml');
    fs.writeFileSync(
        file,
        `agent: vault-search\nfixture: small\nquery: q\nintent: i\n`,
        'utf8',
    );
    const scenario = loadScenarioFile(file);
    assert(scenario.agent === 'vault-search', 'loadScenarioFile parses from disk');
    assert(scenario.name === 'hub', 'scenario name derived from filename');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/scenario-loader.test.ts
```
Expected: bundle error.

- [ ] **Step 3: Write the implementation**

Create `src/core/telemetry/scenario-loader.ts`:

```typescript
/**
 * Scenario YAML loader and validator.
 *
 * A scenario file is a minimal declarative specification of "one trace run":
 *   agent (required)     — which agent to invoke
 *   fixture (required)   — which fixture vault subdirectory to mount (CLI track)
 *   query (required)     — the prompt string
 *   intent (required)    — human-readable description of what the scenario tests
 *   profile (optional)   — profile id override
 *
 * Forbidden fields (throw on presence): `expect`, `assert`, `golden`, `deadline`.
 * Per the design spec, this catalog is for observation, not assertion.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ScenarioDefinition {
    name: string;
    agent: string;
    fixture: string;
    query: string;
    intent: string;
    profile?: string;
}

const REQUIRED_FIELDS: Array<keyof ScenarioDefinition> = ['agent', 'fixture', 'query', 'intent'];
const FORBIDDEN_FIELDS = ['expect', 'assert', 'golden', 'deadline'];

export function parseScenario(yamlText: string, name = 'anonymous'): ScenarioDefinition {
    const doc = parseYaml(yamlText);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new Error(`Scenario ${name}: root must be a YAML mapping`);
    }
    const obj = doc as Record<string, unknown>;

    for (const field of FORBIDDEN_FIELDS) {
        if (field in obj) {
            throw new Error(
                `Scenario ${name}: forbidden field "${field}" present. ` +
                    `Scenario catalog is for observation, not assertion. ` +
                    `See docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md §3.8.`,
            );
        }
    }

    for (const field of REQUIRED_FIELDS) {
        if (obj[field] == null) {
            throw new Error(`Scenario ${name}: missing required field "${field}"`);
        }
        if (typeof obj[field] !== 'string') {
            throw new Error(`Scenario ${name}: field "${field}" must be a string`);
        }
    }

    return {
        name,
        agent: String(obj.agent),
        fixture: String(obj.fixture),
        query: String(obj.query),
        intent: String(obj.intent),
        profile: typeof obj.profile === 'string' ? obj.profile : undefined,
    };
}

export function loadScenarioFile(filePath: string): ScenarioDefinition {
    const text = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(filePath, path.extname(filePath));
    return parseScenario(text, name);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/scenario-loader.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/telemetry/scenario-loader.ts test/core/telemetry/scenario-loader.test.ts
git commit -m "feat(telemetry): scenario YAML loader with forbidden-field validation"
```

---

## Task 11: First five scenario files

**Files:**
- Create: `test/scenarios/vault-search/hub-discovery.yaml`
- Create: `test/scenarios/vault-search/direct-answer.yaml`
- Create: `test/scenarios/vault-search/ambiguous-query.yaml`
- Create: `test/scenarios/vault-search/multilingual.yaml`
- Create: `test/scenarios/vault-search/not-found.yaml`

Each file is pure content — the scenario loader from Task 10 validates them at load time.

- [ ] **Step 1: Create `hub-discovery.yaml`**

```yaml
agent: vault-search
fixture: small
query: "What is the core motivation for the provider v2 refactor, and what spokes support that argument?"
intent: |
  The fixture contains a hub note (refactor/provider-v2-overview.md) that links
  to five spokes. Verify the agent can discover the hub, follow its forward
  links, and summarize the core motivation as "reduce cognitive burden." The
  agent should NOT chase every spoke file individually before answering.
profile: claude-opus-4-6
```

- [ ] **Step 2: Create `direct-answer.yaml`**

```yaml
agent: vault-search
fixture: small
query: "Why is embedding handled outside the single-runtime rule?"
intent: |
  The answer lives in exactly one file (concepts/embedding-split.md). Verify
  the agent finds it in 1-2 tool calls and does not over-explore. A scenario
  that rewards early stopping.
profile: claude-opus-4-6
```

- [ ] **Step 3: Create `ambiguous-query.yaml`**

```yaml
agent: vault-search
fixture: small
query: "What does MCP mean in this vault?"
intent: |
  MCP appears in both the real (mcp/mcp-unification.md, zh-mcp-introduction.md)
  and decoy files (decoys/mcp-microphone-checklist.md). Verify the agent
  distinguishes Model Context Protocol from microphone-check-points based on
  surrounding context, and does not cite the decoy as an authoritative answer.
profile: claude-opus-4-6
```

- [ ] **Step 4: Create `multilingual.yaml`**

```yaml
agent: vault-search
fixture: small
query: "重构为什么要降低认知负担?"
intent: |
  A Chinese-language query expecting the agent to surface both the Chinese hub
  (multilingual/zh-provider-refactor.md) and its English counterpart
  (refactor/provider-v2-overview.md). Verify tokenizer / chunker handles CJK
  end-to-end and that the agent returns results from both language subdirectories.
profile: claude-opus-4-6
```

- [ ] **Step 5: Create `not-found.yaml`**

```yaml
agent: vault-search
fixture: small
query: "How do I configure OAuth2 for the Stripe webhook endpoint?"
intent: |
  The fixture vault contains nothing about OAuth2, Stripe, or webhooks. Verify
  the agent reports "not found" gracefully after a bounded number of tool calls
  rather than hallucinating content or looping until max iterations.
profile: claude-opus-4-6
```

- [ ] **Step 6: Verify all five parse**

Write a small verification script inline:

```bash
node -e "
const { loadScenarioFile } = require('esbuild-register/dist/node.js').register().require('./src/core/telemetry/scenario-loader');
for (const name of ['hub-discovery', 'direct-answer', 'ambiguous-query', 'multilingual', 'not-found']) {
    const s = loadScenarioFile('test/scenarios/vault-search/' + name + '.yaml');
    console.log(name, '→', s.agent, s.fixture, s.query.slice(0, 40));
}
"
```

Expected: five lines, each naming the scenario, `vault-search`, `small`, and the first 40 chars of the query. If any line fails, the scenario loader would report a specific error — fix the YAML.

(If the one-liner is too awkward, alternatively write a throwaway `.test.ts` that imports `loadScenarioFile` and iterates the five files, then run it via `npm run test`. Delete it after.)

- [ ] **Step 7: Commit**

```bash
git add test/scenarios/vault-search
git commit -m "feat(telemetry): first five vault-search trace scenarios"
```

---

## Task 12: CLI harness (`scripts/run-agent.ts`)

**Files:**
- Create: `scripts/run-agent.ts`

This is the autonomous entry point: it loads a scenario, spins up the fixture-vault MCP server, invokes Agent SDK `query()`, drains the `SDKMessage` iterator into a `TraceSink`, and prints the meta path to stdout for Claude Code to pick up. It has no unit tests — correctness is verified by the end-to-end smoke run in Task 14.

- [ ] **Step 1: Write the implementation**

Create `scripts/run-agent.ts`:

```typescript
#!/usr/bin/env node
/**
 * CLI harness: run an agent against a fixture vault and write a trace.
 *
 * Usage:
 *   npm run trace -- scenario vault-search/hub-discovery
 *   npm run trace -- vault-search --fixture small "free form query text"
 *   npm run trace -- scenario vault-search/hub-discovery --tool-cap 0
 *
 * Environment:
 *   PEAK_TRACE_TOOL_CAP  — override tool output cap in bytes (0 = disabled)
 *   ANTHROPIC_API_KEY    — required by Agent SDK at execution time
 */

import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadScenarioFile } from '@/core/telemetry/scenario-loader';
import type { ScenarioDefinition } from '@/core/telemetry/scenario-loader';
import { TraceSink } from '@/core/telemetry/traceSink';
import { DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';
import { createFsVaultMcpServer } from '@/core/telemetry/fs-vault-mcp/server';

interface CliArgs {
    mode: 'scenario' | 'free';
    scenarioPath?: string;
    freeAgent?: string;
    freeFixture?: string;
    freeQuery?: string;
    profile?: string;
    toolCap: number;
}

const REPO_ROOT = path.resolve(__dirname, '..');
const TRACES_ROOT = path.join(REPO_ROOT, 'data', 'traces');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'test', 'fixtures', 'vault');
const SCENARIOS_ROOT = path.join(REPO_ROOT, 'test', 'scenarios');

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const scenario = resolveScenario(args);

    const fixtureRoot = path.join(FIXTURES_ROOT, scenario.fixture);
    const fsVaultServer = createFsVaultMcpServer({ rootDir: fixtureRoot });

    const sink = new TraceSink({
        rootDir: TRACES_ROOT,
        agentName: scenario.agent,
        scenarioName: scenario.name,
        intent: scenario.intent,
        profileId: scenario.profile ?? 'default',
        fixture: scenario.fixture,
        track: 'cli',
        toolCapBytes: args.toolCap,
    });

    let errored = false;
    try {
        const iter = query({
            prompt: scenario.query,
            options: {
                mcpServers: { 'fs-vault': fsVaultServer },
                // Model + auth are resolved from Profile Registry at implementation
                // time; at plan-authoring time we use env vars as a minimal bootstrap.
                model: scenario.profile ?? process.env.PEAK_PROFILE_MODEL ?? 'claude-opus-4-6',
            },
        });
        for await (const msg of iter) {
            sink.consume(msg);
            echoOneLiner(msg);
        }
    } catch (err) {
        errored = true;
        const message = err instanceof Error ? err.message : String(err);
        sink.finalizeWithError(message);
        process.stderr.write(`trace: agent run failed: ${message}\n`);
    }

    const { metaPath, fullPath } = sink.flush();
    process.stdout.write(`TRACE: ${metaPath}\n`);
    process.stdout.write(`TRACE_FULL: ${fullPath}\n`);
    process.exit(errored ? 1 : 0);
}

function parseArgs(argv: string[]): CliArgs {
    let toolCap = Number(process.env.PEAK_TRACE_TOOL_CAP ?? DEFAULT_TOOL_CAP_BYTES);
    if (!Number.isFinite(toolCap)) toolCap = DEFAULT_TOOL_CAP_BYTES;

    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tool-cap') {
            toolCap = Number(argv[++i]);
            continue;
        }
        if (a === '--fixture') {
            positional.push('--fixture', argv[++i]);
            continue;
        }
        if (a === '--profile') {
            positional.push('--profile', argv[++i]);
            continue;
        }
        positional.push(a);
    }

    if (positional[0] === 'scenario') {
        const scenarioId = positional[1];
        if (!scenarioId) throw new Error('Usage: npm run trace -- scenario <agent>/<name>');
        const scenarioPath = path.join(SCENARIOS_ROOT, `${scenarioId}.yaml`);
        return { mode: 'scenario', scenarioPath, toolCap };
    }

    // Free-form mode: <agent> [--fixture <name>] [--profile <id>] "<query>"
    const freeAgent = positional[0];
    if (!freeAgent) throw new Error('Usage: npm run trace -- <agent> [--fixture <name>] "<query>"');
    let freeFixture = 'small';
    let profile: string | undefined;
    const rest: string[] = [];
    for (let i = 1; i < positional.length; i++) {
        if (positional[i] === '--fixture') {
            freeFixture = positional[++i];
        } else if (positional[i] === '--profile') {
            profile = positional[++i];
        } else {
            rest.push(positional[i]);
        }
    }
    const freeQuery = rest.join(' ');
    if (!freeQuery) throw new Error('Free-form mode requires a query string after the agent name');
    return { mode: 'free', freeAgent, freeFixture, freeQuery, profile, toolCap };
}

function resolveScenario(args: CliArgs): ScenarioDefinition {
    if (args.mode === 'scenario') {
        return loadScenarioFile(args.scenarioPath!);
    }
    const stamp = Date.now().toString(36);
    return {
        name: `freeform-${stamp}`,
        agent: args.freeAgent!,
        fixture: args.freeFixture!,
        query: args.freeQuery!,
        intent: '(free-form run, no scenario file)',
        profile: args.profile,
    };
}

function echoOneLiner(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as any;
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
        for (const block of m.message.content) {
            if (block?.type === 'tool_use') {
                const input = typeof block.input === 'object' ? JSON.stringify(block.input).slice(0, 60) : '';
                process.stdout.write(`[tool] ${block.name} ${input}\n`);
            }
        }
    } else if (m.type === 'result') {
        process.stdout.write(`[result] ${m.subtype} duration=${m.duration_ms}ms\n`);
    }
}

main().catch((err) => {
    process.stderr.write(`trace: fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(2);
});
```

- [ ] **Step 2: Compile check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "scripts/run-agent"
```
Expected: no errors involving this file. If the `query` function signature differs from the assumed shape, the error will name the property that doesn't exist — adjust the call site by reading `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` line 1892 (`prompt: string | AsyncIterable<SDKUserMessage>`) and the `Options` type.

- [ ] **Step 3: Commit**

```bash
git add scripts/run-agent.ts
git commit -m "feat(telemetry): CLI harness for running trace scenarios"
```

---

## Task 13: Trace-latest helper (TDD)

**Files:**
- Create: `scripts/trace-latest.ts`
- Test: `test/core/telemetry/trace-latest.test.ts`

The helper prints the newest `*.meta.jsonl` path under `data/traces/` matching an optional scenario name filter. Claude Code invokes it as `npm run trace:latest vault-search` to avoid `ls -t`.

Because `scripts/trace-latest.ts` is an entry point, the testable logic lives in a separate pure function exported from the same file. The test imports that function and exercises it against a tmp directory.

- [ ] **Step 1: Write the failing test**

Create `test/core/telemetry/trace-latest.test.ts`:

```typescript
import { findLatestTrace } from '@/../scripts/trace-latest';
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

function touch(filePath: string, mtimeMs: number): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n', 'utf8');
    fs.utimesSync(filePath, mtimeMs / 1000, mtimeMs / 1000);
}

// Test 1: picks newest meta file across date dirs
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-10', 'a.meta.jsonl'), 1_000_000);
    touch(path.join(dir, '2026-04-11', 'b.meta.jsonl'), 2_000_000);
    touch(path.join(dir, '2026-04-12', 'c.meta.jsonl'), 3_000_000);
    const latest = findLatestTrace(dir);
    assert(latest?.endsWith('c.meta.jsonl') === true, `newest picked (got ${latest})`);
}

// Test 2: filter by substring returns the newest matching
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-10', 'vault-search-hub.meta.jsonl'), 1_000_000);
    touch(path.join(dir, '2026-04-11', 'vault-search-direct.meta.jsonl'), 2_000_000);
    touch(path.join(dir, '2026-04-12', 'chat.meta.jsonl'), 3_000_000);
    const latest = findLatestTrace(dir, 'vault-search');
    assert(
        latest?.endsWith('vault-search-direct.meta.jsonl') === true,
        `newest matching filter (got ${latest})`,
    );
}

// Test 3: no files returns null
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    const latest = findLatestTrace(dir);
    assert(latest === null, 'no traces returns null');
}

// Test 4: ignores non-meta files
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-12', 'a.full.jsonl'), 3_000_000);
    touch(path.join(dir, '2026-04-11', 'b.meta.jsonl'), 2_000_000);
    const latest = findLatestTrace(dir);
    assert(latest?.endsWith('b.meta.jsonl') === true, 'full.jsonl not picked');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm run test -- test/core/telemetry/trace-latest.test.ts
```
Expected: bundle error (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `scripts/trace-latest.ts`:

```typescript
#!/usr/bin/env node
/**
 * Print the path of the newest *.meta.jsonl file under data/traces/.
 * Optionally filter by a substring match on the filename.
 *
 * Usage:
 *   npm run trace:latest                       # newest of all
 *   npm run trace:latest vault-search          # newest containing "vault-search"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_ROOT = path.resolve(__dirname, '..', 'data', 'traces');

export function findLatestTrace(root: string, filter?: string): string | null {
    if (!fs.existsSync(root)) return null;
    const candidates: Array<{ path: string; mtimeMs: number }> = [];
    walk(root, (p, stat) => {
        if (!p.endsWith('.meta.jsonl')) return;
        if (filter && !path.basename(p).includes(filter)) return;
        candidates.push({ path: p, mtimeMs: stat.mtimeMs });
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0].path;
}

function walk(dir: string, visit: (p: string, stat: fs.Stats) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(abs, visit);
        } else if (entry.isFile()) {
            visit(abs, fs.statSync(abs));
        }
    }
}

if (require.main === module) {
    const filter = process.argv[2];
    const latest = findLatestTrace(DEFAULT_ROOT, filter);
    if (!latest) {
        process.stderr.write('no matching trace found\n');
        process.exit(1);
    }
    process.stdout.write(`${latest}\n`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm run test -- test/core/telemetry/trace-latest.test.ts
```
Expected: all PASS lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/trace-latest.ts test/core/telemetry/trace-latest.test.ts
git commit -m "feat(telemetry): trace-latest helper script"
```

---

## Task 14: Wire trace sink into VaultSearchAgentSDK

**Files:**
- Modify: `src/service/agents/VaultSearchAgentSDK.ts` (or the file created by the provider v2 refactor holding the `query()` consumer loop — verify the actual filename at execution time)

This task adds **one line** inside the existing `for await` loop that consumes `SDKMessage` from `query()`. The trace sink is an optional DI parameter; passing it is how the CLI harness and Obsidian command get traces, while ordinary UI flows pass nothing and incur zero cost.

- [ ] **Step 1: Locate the SDKMessage consumer loop**

Run:
```bash
grep -n "for await" src/service/agents/VaultSearchAgentSDK.ts
```
Expected: at least one match pointing at the loop that iterates `query()`'s result.

If no file or no match, the precondition (provider v2 landed) is not met — STOP this plan and investigate which file holds the post-refactor consumer loop. Possible alternative paths:
- `src/service/agents/vault-sdk/sdkAgentPool.ts`
- `src/service/agents/VaultSearchAgent.ts` (if the refactor renamed rather than added)

Adjust the task to target the correct file and continue.

- [ ] **Step 2: Add the optional `traceSink` parameter to the function signature**

At the top of the function that iterates the stream (options object), add:

```typescript
import type { TraceSink } from '@/core/telemetry/traceSink';

// inside the options interface for runVaultSearch / VaultSearchAgentSDK (NAMES VARY):
// add this field
traceSink?: TraceSink;
```

Do not change any existing field. Do not rename anything. This is purely additive.

- [ ] **Step 3: Add the hook call inside the loop**

Inside the `for await` loop, add one line immediately after whatever the existing body does with `msg`:

```typescript
for await (const msg of stream) {
    // ... existing code that maps msg to UI events / yields ...
    options.traceSink?.consume(msg); // NEW: optional trace subscriber
}
```

- [ ] **Step 4: Compile check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "VaultSearchAgentSDK"
```
Expected: no errors involving this file.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/VaultSearchAgentSDK.ts
git commit -m "feat(telemetry): optional trace sink hook in VaultSearchAgentSDK"
```

---

## Task 15: Obsidian command for running scenarios

**Files:**
- Create: `src/app/commands/run-trace-scenario.ts`
- Modify: the existing command registration file (location varies; typically `src/app/commands/index.ts` or `src/app/index.ts`)

- [ ] **Step 1: Locate the command registration pattern**

Run:
```bash
grep -rn "addCommand" src/app/commands/ 2>/dev/null | head -5
```
Expected: at least one existing `plugin.addCommand({ id, name, callback })` call. Read its imports and style — match them in Step 2.

- [ ] **Step 2: Write the command module**

Create `src/app/commands/run-trace-scenario.ts`:

```typescript
/**
 * Obsidian command: Peak: Run Trace Scenario
 *
 * Lists scenarios under test/scenarios/ via a fuzzy-suggest modal, runs the
 * chosen one against the REAL vault (not the fixture), and writes a canonical
 * trace to data/traces/. The output format is identical to CLI-produced traces;
 * only the header's `track` field differs (`obsidian` vs `cli`).
 *
 * This command is the truth-calibration entry point. It is invoked manually by
 * the developer, rarely, at milestone checkpoints.
 */

import { FuzzySuggestModal, Notice, type App, type Plugin } from 'obsidian';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadScenarioFile } from '@/core/telemetry/scenario-loader';
import type { ScenarioDefinition } from '@/core/telemetry/scenario-loader';
import { TraceSink } from '@/core/telemetry/traceSink';
import { DEFAULT_TOOL_CAP_BYTES } from '@/core/telemetry/truncate-tool-output';

/** Resolved at runtime from the plugin's base directory. */
function scenariosRoot(plugin: Plugin): string {
    // @ts-expect-error Obsidian Plugin has manifest.dir at runtime
    const pluginDir = plugin.manifest.dir as string;
    return path.join((plugin.app.vault.adapter as any).basePath, pluginDir, 'test', 'scenarios');
}

function tracesRoot(plugin: Plugin): string {
    // @ts-expect-error
    const pluginDir = plugin.manifest.dir as string;
    return path.join((plugin.app.vault.adapter as any).basePath, pluginDir, 'data', 'traces');
}

function listScenarios(root: string): ScenarioDefinition[] {
    const out: ScenarioDefinition[] = [];
    if (!fs.existsSync(root)) return out;
    walk(root, (p) => {
        if (!p.endsWith('.yaml')) return;
        try {
            out.push(loadScenarioFile(p));
        } catch (e) {
            console.error('trace scenario load error', p, e);
        }
    });
    return out;
}

function walk(dir: string, visit: (p: string) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, visit);
        else if (entry.isFile()) visit(abs);
    }
}

class ScenarioPickerModal extends FuzzySuggestModal<ScenarioDefinition> {
    constructor(
        app: App,
        private scenarios: ScenarioDefinition[],
        private onChoose: (s: ScenarioDefinition) => void,
    ) {
        super(app);
    }
    getItems(): ScenarioDefinition[] { return this.scenarios; }
    getItemText(s: ScenarioDefinition): string {
        const intentLine = (s.intent || '').split('\n')[0];
        return `${s.agent}/${s.name} — ${intentLine}`;
    }
    onChooseItem(s: ScenarioDefinition): void { this.onChoose(s); }
}

export function registerRunTraceScenarioCommand(plugin: Plugin): void {
    plugin.addCommand({
        id: 'peak-run-trace-scenario',
        name: 'Peak: Run Trace Scenario',
        callback: async () => {
            const scenarios = listScenarios(scenariosRoot(plugin));
            if (scenarios.length === 0) {
                new Notice('No scenarios found under test/scenarios/');
                return;
            }
            new ScenarioPickerModal(plugin.app, scenarios, async (scenario) => {
                new Notice(`Running trace: ${scenario.agent}/${scenario.name}`);
                const capRaw = Number((plugin.app as any).env?.PEAK_TRACE_TOOL_CAP ?? DEFAULT_TOOL_CAP_BYTES);
                const toolCapBytes = Number.isFinite(capRaw) ? capRaw : DEFAULT_TOOL_CAP_BYTES;

                const sink = new TraceSink({
                    rootDir: tracesRoot(plugin),
                    agentName: scenario.agent,
                    scenarioName: scenario.name,
                    intent: scenario.intent,
                    profileId: scenario.profile ?? 'default',
                    track: 'obsidian',
                    toolCapBytes,
                    // fixture intentionally omitted — this track uses the real vault
                });

                try {
                    // At execution time, wire this through the real VaultSearchAgentSDK
                    // entry point with `{ traceSink: sink }`. The exact function name
                    // and location depend on what provider v2 settled on — follow the
                    // same hook point updated in Task 14.
                    //
                    // Example (adjust import path to the post-refactor module):
                    //
                    // const { runVaultSearch } = await import('@/service/agents/VaultSearchAgentSDK');
                    // for await (const _ of runVaultSearch({ query: scenario.query, traceSink: sink })) { /* drain */ }
                    throw new Error(
                        'TASK 15 STEP 3: wire this callback to the post-refactor VaultSearchAgentSDK entry point once confirmed',
                    );
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    sink.finalizeWithError(msg);
                    new Notice(`Trace failed: ${msg}`);
                } finally {
                    const { metaPath } = sink.flush();
                    new Notice(`Trace written: ${metaPath}`);
                    console.log('Trace written:', metaPath);
                }
            }).open();
        },
    });
}
```

- [ ] **Step 3: Replace the `throw new Error(...)` stub with the real agent call**

At execution time, with provider v2's `VaultSearchAgentSDK.ts` in hand, replace the `throw new Error(...)` line with the actual invocation as commented. The exact import path and function signature must match Task 14's hook. **Do not commit the stub — the command must work end-to-end or not at all.**

- [ ] **Step 4: Register the command at plugin load**

Open the file identified in Step 1 (wherever other commands are registered) and add:

```typescript
import { registerRunTraceScenarioCommand } from './run-trace-scenario';

// inside the plugin onload / command registration function:
registerRunTraceScenarioCommand(plugin);
```

- [ ] **Step 5: Compile check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "run-trace-scenario"
```
Expected: no errors.

- [ ] **Step 6: Manual smoke (developer)**

Build: `npm run build`. Reload the plugin in Obsidian. Open the command palette with `Cmd+P` and run `Peak: Run Trace Scenario`. Pick `vault-search/hub-discovery`. A `Trace written:` notice should appear within a few seconds pointing at a `.meta.jsonl` file under `data/traces/`.

- [ ] **Step 7: Commit**

```bash
git add src/app/commands/run-trace-scenario.ts
# plus the registration file edited in Step 4
git commit -m "feat(telemetry): Obsidian command 'Peak: Run Trace Scenario'"
```

---

## Task 16: Documentation

**Files:**
- Create: `docs/trace-format.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write `docs/trace-format.md`**

```markdown
# Trace Format Reference

This document describes the canonical trace record schema emitted by the
agent trace observability system. See the design spec for rationale:
`docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md`.

## Files

Every agent run produces exactly two files:

```
data/traces/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.meta.jsonl
data/traces/YYYY-MM-DD/<agent>-<scenario?>-<timestamp>.full.jsonl
```

Both are JSONL (one JSON object per line). The **meta** projection contains
shape-only data suitable for grep and commit. The **full** projection contains
every prompt, tool input, and tool output (the latter truncated at 10KB per
result by default). The full projection is gitignored.

## Event types

Each line is one of:

1. **`session`** — exactly one, at the top of the file
2. **`iteration`** — zero or more, one per agent tool-calling turn
3. **`final`** — exactly one, at the end

See `src/core/telemetry/trace-types.ts` for the TypeScript definitions.

## Tool output truncation

Tool outputs longer than `PEAK_TRACE_TOOL_CAP` (default 10240) are truncated
in the full projection, keeping ~40% from the head and ~40% from the tail with
a marker line in the middle. Set `PEAK_TRACE_TOOL_CAP=0` to disable truncation.

## Adding a scenario

1. Create `test/scenarios/<agent>/<name>.yaml` with `agent`, `fixture`, `query`, `intent` fields.
2. (CLI only) Ensure the fixture vault directory exists under `test/fixtures/vault/<fixture>/`.
3. Run it: `npm run trace -- scenario <agent>/<name>`.
4. Read the trace: `npm run trace:latest | xargs cat | jq .` (or just `cat`).

**Forbidden fields in scenario YAML:** `expect`, `assert`, `golden`, `deadline`.
The scenario catalog is for observation, not assertion. Correctness judgment is
made by the developer and Claude Code, reading the trace. LLM non-determinism
makes automated assertions brittle — the observability loop would be poisoned
by their false positives.

## Querying traces

```bash
# Newest meta file
npm run trace:latest

# Newest vault-search meta file
npm run trace:latest vault-search

# Count iterations across recent runs of a scenario
grep -l 'hub-discovery' data/traces/*/*.meta.jsonl | \
    xargs -I{} jq 'select(.type=="final") | .totalIterations' {}

# Which tools were called in the most recent hub-discovery run
jq 'select(.type=="iteration") | .toolCalls[].toolName' \
    "$(npm run -s trace:latest vault-search-hub-discovery)"
```

## Tracks

Every session header stamps `track: 'cli'` or `track: 'obsidian'`:

- **`cli`** — run via `npm run trace`, uses `test/fixtures/vault/<fixture>/` via the filesystem MCP shim
- **`obsidian`** — run via `Peak: Run Trace Scenario` command, uses the real vault and real vault MCP servers

The format is identical otherwise, so CLI and Obsidian runs of the same scenario
can be diffed line-by-line to surface shim divergences from real Obsidian behavior.
```

- [ ] **Step 2: Append to `CLAUDE.md`**

Open `CLAUDE.md` and add this section at the end (after existing content, before any trailing footer):

```markdown
## Running an agent trace

Claude Code can invoke an agent end-to-end without Obsidian and inspect the
resulting structured trace. This is the primary feedback loop for tuning agent
prompts and tools:

```bash
# Run a named scenario
npm run trace -- scenario vault-search/hub-discovery

# Free-form one-off query
npm run trace -- vault-search "why is provider v2 worth it"

# Get the newest trace path (filter by substring optional)
npm run trace:latest
npm run trace:latest vault-search
```

The command prints two paths to stdout: `TRACE:` (meta projection, safe for grep)
and `TRACE_FULL:` (full projection, includes prompts and tool outputs, gitignored).
Read the meta file with `Grep` / `Read` first; open the full file only when you
need to inspect a specific iteration's prompts or tool outputs.

**Scenario catalog:** `test/scenarios/<agent>/<name>.yaml`. Every scenario has
an `intent:` field describing what it is meant to test. Read it before judging
whether a run "improved" or "regressed." There are no automated assertions —
correctness is your judgment call.

**Reference:** `docs/trace-format.md` (schema, truncation, query examples).
**Design rationale:** `docs/superpowers/specs/2026-04-12-agent-trace-observability-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/trace-format.md CLAUDE.md
git commit -m "docs(telemetry): trace format reference and CLAUDE.md trace how-to"
```

---

## Task 17: End-to-end smoke test

This task is a manual verification, not a code change. It confirms that the whole pipeline — CLI harness → Agent SDK `query()` → fixture vault MCP → trace sink → JSONL files — works on one real scenario. No commit.

- [ ] **Step 1: Ensure an API key is available**

Run:
```bash
echo "$ANTHROPIC_API_KEY" | head -c 10; echo
```
Expected: first ~10 characters of an API key (not empty). If empty, `export ANTHROPIC_API_KEY=sk-ant-...` before proceeding.

- [ ] **Step 2: Run the simplest scenario**

Run:
```bash
npm run trace -- scenario vault-search/direct-answer
```

Expected output (approximate):
```
[tool] vault_grep {"query":"embedding..."}
[tool] vault_read_note {"path":"concepts/..."}
[result] success duration=5420ms
TRACE: /path/to/data/traces/2026-04-12/vault-search-direct-answer-<ts>.meta.jsonl
TRACE_FULL: /path/to/data/traces/2026-04-12/vault-search-direct-answer-<ts>.full.jsonl
```

If the run fails (auth error, model not found, MCP server mismatch), inspect the trace files (they are still written on error via `finalizeWithError`) and fix the root cause before continuing.

- [ ] **Step 3: Verify meta file is valid JSONL**

Run:
```bash
LATEST=$(npm run -s trace:latest vault-search-direct-answer)
wc -l "$LATEST"
jq . "$LATEST" > /dev/null && echo "meta is valid JSON"
```
Expected: line count of 3 or more, and `meta is valid JSON` printed.

- [ ] **Step 4: Verify full file is readable and contains content**

Run:
```bash
FULL="${LATEST/.meta.jsonl/.full.jsonl}"
jq '.type' "$FULL"
jq 'select(.type=="iteration") | .plan.assistantText' "$FULL"
```
Expected: event types printed in order (`"session"`, `"iteration"`, ..., `"final"`), and at least one non-empty assistant text in the full projection.

- [ ] **Step 5: Verify the Obsidian track produces the same format**

Open Obsidian, run `Peak: Run Trace Scenario` from the command palette, pick `vault-search/direct-answer`. Wait for the `Trace written:` notice. Then:

```bash
OBS=$(npm run -s trace:latest vault-search-direct-answer)
jq 'select(.type=="session") | .track' "$OBS"
```
Expected: `"obsidian"` (confirming the new run was the Obsidian one, not the earlier CLI one — note the latest-filter picks whichever is newest).

Compare the meta structure:
```bash
jq '.type' "$OBS"
```
Expected: identical event-type sequence as the CLI run.

- [ ] **Step 6: Report success or capture the failure mode**

If all checks pass, v1 is functionally complete. Add a note in the implementation log / PR description:

```
Smoke: direct-answer CLI and Obsidian tracks both produce valid meta+full JSONL.
Iterations: <N>, Tools called: <list>, Final: success/error, durationMs: <ms>.
```

If any check fails, file the failure mode under the task list and do not mark the plan complete. Common failure modes and likely causes:
- `TRACE:` line missing → sink.flush() not reached; check for thrown errors in run-agent.ts
- `meta is valid JSON` fails → JSONL newline handling in traceSink.ts writeAtomic
- `track: "obsidian"` missing → Task 15 stub not replaced with real agent call
- 0 iterations in trace → assistant-message block type not recognized; check sdk-message-mapper.ts handleAssistant

---

## Out of scope (explicitly deferred)

The following are called out in the spec (§11 / §6 "Out of scope") and are **not** tasks in this plan. Do not add them during execution:

- Scenarios for agents other than VaultSearch (Chat, DocSimple, KnowledgeIntuition)
- `trace:diff` / `trace:view` CLI tools, inspector UIs
- Assertion frameworks, golden tests, regression gates
- Streaming trace writes (flush is end-of-run only)
- Retention / rotation / auto-cleanup
- Usage dashboards or `usage_log` table integration
- MCP-based trace consumers (Claude Code uses raw Grep/Read)
- Second fixture vault (`medium`) — only add if a specific scenario proves under-served
- `--keep-alive` mode for the CLI harness — only add if subprocess warmup becomes genuinely annoying

Any of these can be added as a follow-up plan. None are blockers for v1.

---

## Self-review (completed by plan author)

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §2.1 layered view | Tasks 5, 9, 12, 15 (sink, MCP, CLI, Obsidian cmd) |
| §2.2 four concepts | Full plan |
| §2.3 DI hook | Task 14 |
| §3.1 trace-types | Task 2 |
| §3.2 traceSink | Task 5 |
| §3.3 sdk-message-mapper | Task 4 |
| §3.4 fs-vault-mcp | Tasks 7, 8, 9 |
| §3.5 CLI harness | Task 12 |
| §3.6 trace-latest | Task 13 |
| §3.7 Obsidian command | Task 15 |
| §3.8 scenario YAML format | Tasks 10, 11 |
| §3.9 first 5 scenarios | Task 11 |
| §3.10 fixture vault design | Task 6 |
| §4 data flow | Task 12 (+ 17 smoke) |
| §5 file layout | Task 1 (.gitignore) + all file creations |
| §6 v1 success criteria | Task 17 |
| §7 post-refactor integration | Task 14 |
| §8 risks — 10KB cap override | Task 3 + Task 12 env var handling |
| §8 risks — shim drift mitigation | Task 15 (Obsidian track) + Task 17 calibration compare |

**Placeholder scan:** The plan contains no "TBD", "TODO", "implement later", or "add appropriate X" phrases. The only deliberate in-code placeholder is the `throw new Error('TASK 15 STEP 3: …')` inside Task 15, which is explicitly called out as a stub that must be replaced in the same task before commit — Step 3 of Task 15 replaces it with the real agent invocation.

**Type consistency:** `TraceSinkOptions` in Task 5 extends `SdkMessageMapperOptions` from Task 4. The `CanonicalEvent` union defined in Task 2 is imported consistently in Tasks 4 and 5. `findLatestTrace(root, filter?)` in Task 13 is referenced from `scripts/trace-latest.ts` and exported as a named function for the test. `createFsVaultMcpServer({ rootDir })` in Task 9 matches the usage in Task 12. `loadScenarioFile` (Task 10) is called from Task 12 (CLI) and Task 15 (Obsidian). Function and property names match across tasks.

**Scope:** One coherent feature (trace observability v1). No sub-subsystems. No split required.

**Ambiguity:** Task 14 depends on the exact filename and function signature of the post-refactor `VaultSearchAgentSDK` — this is flagged as a precondition check at the top of the task with fallback paths. Task 15 Step 3 similarly flags the stub replacement requiring the real agent call, which cannot be concretely written without knowing the exact entry point name.
