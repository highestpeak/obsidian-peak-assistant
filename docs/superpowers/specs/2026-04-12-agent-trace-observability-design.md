# Agent Trace Observability — Design

**Date:** 2026-04-12
**Status:** Approved (pre-implementation, execution gated on provider v2 refactor landing)
**Branch:** refactor_search_pipeline
**Depends on:** `2026-04-11-provider-system-v2-design.md` (must land first)
**Scope:** `src/core/telemetry/`, `scripts/run-agent.ts`, `scripts/trace-latest.ts`, `src/app/commands/run-trace-scenario.ts`, `test/scenarios/**`, `test/fixtures/vault/**`, `package.json` scripts, `docs/trace-format.md`

---

## 0. Executive Summary

**Goal:** Tighten the feedback loop between "I change agent code / prompts / tools" and "Claude Code knows whether the change worked," so Claude Code can run its own improvement cycles autonomously, freeing the developer to focus on product design.

**Core move:** Claude Agent SDK's `query()` already emits a structured event stream (`SDKMessage`). We attach a single trace sink to the consumer side of that stream and project each run into two JSONL files on disk: a small metadata-only `*.meta.jsonl` (fast to grep, safe to commit) and a content-rich `*.full.jsonl` (for deep inspection).

**Primary user:** Claude Code (and similar coding agents), operating a loop of: change code → invoke a named scenario via CLI → grep the resulting trace → decide the next change. Secondary user: the developer running real-vault calibration via an Obsidian command.

**Scope discipline.** Five things are deliberately *not* built in v1:
1. Unit test framework expansion (existing `test/**/*.test.ts` + `run-test.js` continues unchanged; new pure-logic modules land with tests alongside refactor work).
2. Trace assertions / golden tests / regression gates (LLM non-determinism makes automated assertions brittle; correctness judgment stays with Claude Code and the developer, reading the JSONL).
3. Trace inspector UIs / `trace:diff` tooling (`rg` + `jq` + the standard `Grep` / `Read` tools are sufficient; one 20-line helper script is the only exception).
4. Streaming trace writes, retention / rotation, usage dashboards, `usage_log` joins, MCP trace consumers.
5. Scenarios beyond `VaultSearchAgent` (other agents get free coverage from the generic sink and can adopt CLI scenarios opportunistically, not as an up-front deliverable).

**Non-goal:** This spec does not propose a competitor to Langfuse / Honeycomb / OpenTelemetry. It is a ~1000-line, four-concept module local to this plugin.

**Estimated code delta:** ~1000 new lines + ~25 fixture markdown files. No existing files are modified by v1 beyond a single DI hook in the (post-refactor) agent SDK consumer loop and a handful of `package.json` scripts.

---

## 1. Why Now, And Why This Shape

### 1.1 The feedback loop problem

The plugin's primary development flow today is vibe coding: a prompt, tool definition, ranking algorithm, or agent loop gets changed; correctness is verified by opening Obsidian, triggering a search, and watching the UI. Claude Code participates in this loop only as far as the developer relays UI observations back to it as text. The loop has a human segment; it is the bottleneck.

The decisive insight is that Claude Code already has every primitive needed to own the whole loop except one: a way to run an agent without Obsidian and a way to read what happened in a structured, grep-friendly form. Everything else — code edits, reasoning, repo navigation — it already does well.

### 1.2 Why observability is *not* unit testing

Pure unit tests (`test/textRank.test.ts`, `test/boolean-expression-parser.test.ts`, etc.) cover deterministic, framework-agnostic code: parsers, chunkers, rankers, graph algorithms. They work well and will continue to be written as new pure-logic modules land during the provider refactor. This spec does not expand or replace them.

Agent traces cover the opposite regime: multi-step LLM-driven behavior with non-deterministic outputs. A "unit test" for an agent would have to either (a) mock the LLM (which defeats the purpose of testing agent behavior) or (b) assert against live LLM output (which is flaky). The correct posture is **observation, not assertion**: record exhaustively, let human + Claude Code judgment interpret.

### 1.3 Why post-provider-v2

Provider v2 deletes ~5000–7000 lines including all of `PeakAgentEvent`, `runAgentLoop`, and the Vercel AI SDK family. Any observability hook written against the current runtime would be throwaway code, and any canonical trace format pinned to today's events would need re-derivation after the refactor.

By gating execution on provider v2 landing, we attach directly to Agent SDK's stable `SDKMessage` type — the one-and-only event format the plugin will ever speak post-refactor. The sink is written once, against a stable surface. The cost is flying blind for the duration of the refactor, which is accepted.

### 1.4 Design now, build later

The design is written now, while the refactor context is fresh and the trace needs are sharp in mind, then dropped into an implementation plan the moment provider v2 merges. This avoids re-loading context twice and lets the refactor benefit from knowing in advance where its observability hook point will be.

---

## 2. Architecture

### 2.1 Layered view

```
┌───────────────────────────────────────────────────────────┐
│ Invocation tracks (pick one; output format is identical)  │
├────────────────────────────────┬──────────────────────────┤
│ (a) Node CLI harness           │ (b) Obsidian command     │
│   scripts/run-agent.ts         │   Peak: Run Trace        │
│   - fixture vault              │   - real vault           │
│   - filesystem MCP vault tools │   - real MCP tools       │
│   - daily smoke loop           │   - truth calibration    │
├────────────────────────────────┴──────────────────────────┤
│ Shared substrate: Profile Registry + Agent SDK query()    │
├───────────────────────────────────────────────────────────┤
│ Trace Sink                                                │
│   - consumes SDKMessage async iterator                    │
│   - maps each message to canonical record                 │
│   - buffers in memory until run-end                       │
│   - flushes two JSONL projections on completion / abort   │
├───────────────────────────────────────────────────────────┤
│ Output                                                    │
│   data/traces/YYYY-MM-DD/<scenario>-<ts>.meta.jsonl       │
│   data/traces/YYYY-MM-DD/<scenario>-<ts>.full.jsonl       │
└───────────────────────────────────────────────────────────┘
```

### 2.2 Four concepts, no more

The entire mental model is:

1. **Canonical trace record** — one TS type, two JSONL projections (meta / full).
2. **Two invocation tracks** — Node CLI (fast, fixture-backed, for Claude Code) and Obsidian command (slow, real-vault, for developer-triggered truth calibration).
3. **Scenario catalog** — named YAML files under `test/scenarios/`, forming a shared vocabulary between the developer and Claude Code.
4. **Fixture vault** — a small, git-tracked, intentionally contrived vault under `test/fixtures/vault/` used exclusively by the CLI track.

If a developer or Claude Code needs to understand this system, those four terms and this diagram are the whole story.

### 2.3 Where the trace sink attaches

In the post-refactor world, every agent consumes `query()` as an async iterator to drive the UI. The trace sink is an *additional, optional subscriber* on that same iterator — not a parallel pipeline, not an interceptor, not a decorator. Conceptually:

```typescript
// Post-refactor agent consumer (sketch)
const stream = query({ prompt, mcpServers, options });
for await (const msg of stream) {
    yield mapSDKMessageToUIEvent(msg);   // existing: drive the UI
    traceSink?.consume(msg);             // new: optional, DI'd
}
```

`traceSink` is an optional dependency. The CLI harness constructs one; the Obsidian trace command constructs one; ordinary user chat / search flows pass `null`. Zero runtime overhead when absent.

### 2.4 Dual-track rationale

Neither track alone is sufficient.

- **CLI-only** risks drift: the filesystem MCP shim may not perfectly replicate Obsidian's `MetadataCache` behavior (link resolution, tag inheritance, etc.). Claude Code optimizing exclusively against the shim could improve shim behavior at the expense of real-vault behavior.
- **Obsidian-only** destroys the autonomous loop: Claude Code cannot trigger `Cmd+P` → `Run Trace Scenario` on its own, so the developer is back in the loop.

The dual-track answer: Claude Code runs the CLI track for every small change (dozens of runs per session, fully autonomous); the developer triggers the Obsidian command at milestone points (a handful of runs per week) to verify the shim has not drifted. Both tracks emit identical canonical records, so any meaningful divergence between them is immediately visible via meta.jsonl diff.

---

## 3. Components

Nine new modules / files. Sizes are rough order-of-magnitude targets, not hard limits.

| # | Path | Role | Rough size |
|---|------|------|------------|
| 1 | `src/core/telemetry/trace-types.ts` | Canonical record TS types + helper type guards | ~80 |
| 2 | `src/core/telemetry/traceSink.ts` | `TraceSink` class: buffers events, flushes two JSONL files | ~200 |
| 3 | `src/core/telemetry/sdk-message-mapper.ts` | Pure function: `SDKMessage → CanonicalEvent` | ~150 |
| 4 | `src/core/telemetry/fs-vault-mcp/` | Filesystem-backed vault MCP server (read / list / grep / frontmatter / link resolve) | ~300 |
| 5 | `scripts/run-agent.ts` | CLI entry: argv → scenario → Profile → fs vault → `query()` → sink → exit | ~150 |
| 6 | `scripts/trace-latest.ts` | Prints the most recent trace path for a given agent / scenario glob | ~20 |
| 7 | `src/app/commands/run-trace-scenario.ts` | Obsidian command: fuzzy-pick scenario → real vault → sink | ~100 |
| 8 | `test/scenarios/vault-search/*.yaml` | First five named scenarios | 5 × ~15 |
| 9 | `test/fixtures/vault/small/**/*.md` | Curated fixture vault (~25 notes) | content |

Plus small edits:
- `package.json`: add `trace`, `trace:latest` scripts
- `docs/trace-format.md`: short reference of the canonical record schema and how to add a scenario
- `CLAUDE.md`: append a short "How to run a trace" section pointing Claude Code at `npm run trace`
- One DI hook in the post-refactor `VaultSearchAgentSDK.ts` (the `traceSink?.consume(msg)` line)

### 3.1 `trace-types.ts`

Defines the canonical event union. Both `meta.jsonl` and `full.jsonl` are sequences of `CanonicalEvent`; the difference is only that `full.jsonl` events carry populated content fields that are omitted in the meta projection.

```typescript
// Sketch; final fields settled at implementation time.
export type CanonicalEvent = SessionHeader | IterationEvent | FinalEvent;

export interface SessionHeader {
    type: 'session';
    sessionId: string;
    ts: string;                  // ISO 8601
    agentName: string;           // e.g. 'vault-search'
    scenarioName?: string;       // if invoked via scenario catalog
    intent?: string;             // copied from scenario yaml `intent:`
    profileId: string;
    fixture?: string;            // fixture vault name, CLI track only
    track: 'cli' | 'obsidian';
}

export interface IterationEvent {
    type: 'iteration';
    index: number;
    planMs: number;
    toolCount: number;
    toolCalls: ToolCallRecord[];
    submitPresent: boolean;
    // Full-only fields (undefined in meta projection):
    plan?: {
        systemPromptHash: string;
        systemPromptPreview: string;   // first 500 chars
        userMessages: unknown[];
        assistantText: string;
        reasoning?: string;
    };
    submit?: unknown;                   // full JSON of structured submit
}

export interface ToolCallRecord {
    toolName: string;
    durationMs: number;
    inputShape: Record<string, string>;  // meta: shape only, e.g. { query: 'string(12)' }
    // Full-only:
    input?: unknown;
    output?: string;
    outputTruncated?: boolean;
}

export interface FinalEvent {
    type: 'final';
    stoppedReason: 'should_stop' | 'max_iterations' | 'callback_stop' | 'aborted' | 'error';
    totalIterations: number;
    totalToolCalls: number;
    durationMs: number;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    finalOutputShape: { kind: string; count?: number };    // meta
    finalOutput?: unknown;                                   // full
    error?: { message: string; stack?: string };            // if stoppedReason === 'error'
}
```

### 3.2 `traceSink.ts`

A class, not a singleton. One instance per run. Responsibilities:

- Accept `SDKMessage` objects via `consume(msg)`, delegate to `sdk-message-mapper` to produce zero or one `CanonicalEvent` deltas, append to an in-memory event list.
- Track per-iteration state (current iteration index, open tool calls awaiting their `tool_result` pairing, cumulative usage).
- On `flush()`: compute both projections from the event list, write `meta.jsonl` and `full.jsonl` atomically (write-to-tmp + rename), and return both paths.
- Truncate any tool output string longer than `PEAK_TRACE_TOOL_CAP` (default 10240) in the full projection, keeping first 4KB + `\n[...truncated N bytes]\n` + last 4KB, and setting `outputTruncated: true`. Meta is unaffected (it never carries `output`).
- Be robust to `consume` being called after an error: if the run aborts partway, `flush()` still writes whatever events accumulated plus a `FinalEvent` with `stoppedReason: 'error'`.

### 3.3 `sdk-message-mapper.ts`

A pure function library. For each `SDKMessage` variant:

- `system` init → contribute to `SessionHeader` fields the sink doesn't already know.
- `assistant` with `content: [{type:'text', text}, {type:'tool_use', id, name, input}, ...]` → open a new iteration (if not already open), record assistant text as `plan.assistantText`, register tool calls as pending.
- `user` with `content: [{type:'tool_result', tool_use_id, content}]` → close the matching pending tool call, record output and duration.
- `result` → close iteration, emit `FinalEvent` with usage and stop reason.

The mapper is pure (no IO, no state) and tested directly via standard `test/**/*.test.ts` unit tests.

### 3.4 `fs-vault-mcp/`

A minimal MCP server exposing the subset of vault operations that vault-search tools actually need:

- `read_file(path)`
- `list_files(glob?)`
- `grep(query, path?)`
- `read_frontmatter(path)`
- `resolve_link(from_path, link_text)` — uses a best-effort markdown-link walker with fixture-sized graph
- `list_backlinks(path)` — precomputed from an initial scan at server startup

These map 1:1 to what the post-refactor MCP vault tools will do against real Obsidian, but are backed by Node `fs` reads under a fixture root. Frontmatter is parsed with a small inline YAML frontmatter parser (no new dependencies). Link resolution is deliberately naive — it handles `[[wikilinks]]` and relative `.md` paths; it does *not* attempt to replicate Obsidian's full unresolved-link heuristics. Divergence from real behavior is precisely what the Obsidian track exists to catch.

### 3.5 `scripts/run-agent.ts`

```
Usage:
  npm run trace -- scenario <agent>/<name>            # named scenario
  npm run trace -- <agent> --fixture <name> "<query>" # free form

Flags:
  --fixture <name>     (default: small)
  --profile <id>       (default: from data.json / env)
  --tool-cap <bytes>   (default: 10240)
```

Steps:
1. Parse argv. If first arg is `scenario`, load YAML; otherwise build an ephemeral scenario from argv.
2. Load the Profile Registry from `data.json` (or env fallback) and resolve the profile.
3. Start the filesystem MCP vault server pointed at `test/fixtures/vault/<fixture>/`.
4. Construct a new `TraceSink` with session metadata.
5. Call Agent SDK `query({ prompt, mcpServers: [fsVault], ... })` and consume the iterator, forwarding every `SDKMessage` to the sink and optionally echoing a one-line summary to stdout (`[iter 2] grep_file_tree "provider" → 6 paths (80ms)`).
6. On completion or error, `sink.flush()` to produce both JSONL files.
7. Print `TRACE: <meta-path>` as the final stdout line and exit with 0 (or 1 on error, still after flushing).

This path deliberately does not load Obsidian, the plugin's main `App` class, or any Vault/MetadataCache code. Provider v2 already isolates the AI runtime from Obsidian (the Claude Agent SDK subprocess talks directly to Anthropic); the only remaining Obsidian-coupled piece is vault access, and we substitute the filesystem MCP server there.

### 3.6 `scripts/trace-latest.ts`

Twenty-line helper. Given an optional scenario glob, walks `data/traces/` and prints the newest matching `meta.jsonl` path. Exists so Claude Code can say `npm run trace:latest vault-search` → `Read` the path directly, without `ls -t` gymnastics.

### 3.7 `src/app/commands/run-trace-scenario.ts`

An Obsidian command registered in `src/app/commands/` (existing pattern). When invoked:

1. Scans `test/scenarios/**/*.yaml` via the plugin's file access.
2. Opens a fuzzy picker listing scenarios with `agent/name — intent (first line)` as display.
3. On selection, builds a `TraceSink` and invokes the same post-refactor agent entry point the real UI uses, but:
    - MCP servers are the real vault MCP servers, not the filesystem shim
    - `track: 'obsidian'` is set in the session header
    - `fixture` is absent
4. Flushes trace files to the same `data/traces/` location.
5. Shows a notice: `Trace written: <meta path>`.

This command is the **truth calibration** entry. It is expected to be run by the developer, rarely, typically after a significant change is validated by the CLI track. It is not meant for Claude Code to invoke — there is no programmatic trigger.

### 3.8 Scenario YAML format

```yaml
# test/scenarios/vault-search/hub-discovery.yaml
agent: vault-search
fixture: small
query: "整个 provider refactor 的核心动机是什么"
intent: |
  Verify the agent can aggregate 5 scattered spoke files into a hub file
  and surface "reduce cognitive burden" as the top motivation.
profile: claude-opus-4-6   # optional
```

Fields:

- `agent` (required) — maps to a registered CLI agent entry point
- `fixture` (required for CLI track) — subdirectory under `test/fixtures/vault/`
- `query` (required) — the prompt string
- `intent` (required) — a one-to-three-sentence, human-readable description of **what this scenario is intended to test**. This is the single most load-bearing field for Claude Code's autonomous loop: it tells the agent why the scenario exists and how to judge "improvement" even though no assertions exist.
- `profile` (optional) — override the default profile

**Explicitly forbidden fields:** `expect`, `assert`, `golden`, `deadline`. This is not a test framework. Do not be tempted.

### 3.9 First five scenarios

| Scenario | What it exercises |
|----------|-------------------|
| `hub-discovery.yaml` | Aggregation across 5 spoke files to a central hub; tests whether the agent stops when the hub is found rather than continuing to chase spokes |
| `direct-answer.yaml` | Single-hit query where one file contains the answer; tests whether the agent over-explores (should finish in 1–2 iterations max) |
| `ambiguous-query.yaml` | Short keyword hitting many files of mixed relevance; tests ranking and early-stop discipline |
| `multilingual.yaml` | Chinese query expecting a blend of Chinese and English results; tests tokenizer / chunker behavior end-to-end |
| `not-found.yaml` | Query about a topic absent from the fixture; tests graceful "not found" rather than hallucination or endless searching |

### 3.10 Fixture vault design (`test/fixtures/vault/small/`)

~25 markdown files. Hand-authored to include, at minimum:

- **Hub + spokes:** one `provider-v2-overview.md` hub with wiki links to five spoke files, each covering one aspect (Profile Registry, subprocess IPC, MCP unification, embedding split, skill rewrite). Content is fake / paraphrased, not copied from real project docs.
- **Ambiguous titles:** two files whose titles overlap on keywords but whose contents differ.
- **Frontmatter variation:** several files with `tags: [...]` and one with nested YAML frontmatter.
- **Multilingual:** ~8 files with pure Chinese content, ~5 mixed, rest English. At least one has a Chinese title.
- **Decoy:** several files that look topically relevant but are off-target (e.g., `provider-api-billing.md` which is about billing APIs, not the refactor).
- **Orphans:** a couple of files with no incoming or outgoing links.
- **Long file:** one deliberately-long note to test chunking thresholds.

The fixture is **entirely fake content written for this purpose**. It is git-tracked, contains no proprietary information, and is safe to commit full traces against.

---

## 4. Data Flow (CLI track, end-to-end)

```
$ npm run trace -- scenario vault-search/hub-discovery
       │
       ▼
scripts/run-agent.ts
   ├─ parse argv → scenarioPath
   ├─ load test/scenarios/vault-search/hub-discovery.yaml
   ├─ load Profile Registry from data.json / env
   ├─ start fs-vault-mcp on test/fixtures/vault/small/
   └─ new TraceSink({ sessionId, agentName, scenarioName, intent, track: 'cli' })
       │
       ▼
query({ prompt: scenario.query, mcpServers: [fsVault], profile })
       │
       ▼ async iterator of SDKMessage
for await (const msg of stream) {
    sdkMessageMapper(msg) → zero or one CanonicalEvent
    sink.consume(delta)
    echoOneLineSummary(msg)  // optional stdout: [iter 2] grep_file_tree "…" → 6 paths (80ms)
}
       │
       ▼
sink.flush()
   ├─ write data/traces/2026-04-12/vault-search-hub-discovery-<ts>.meta.jsonl  (atomic)
   └─ write data/traces/2026-04-12/vault-search-hub-discovery-<ts>.full.jsonl  (atomic)
       │
       ▼
stdout: "TRACE: data/traces/2026-04-12/vault-search-hub-discovery-<ts>.meta.jsonl"
process.exit(0)
```

Claude Code's typical consumption:

```
1. Run: npm run trace -- scenario vault-search/hub-discovery
2. Read the last "TRACE: …" line from stdout to obtain the meta path.
3. Use Grep over meta.jsonl to check e.g. which tools were called, how many iterations, total tokens.
4. If something looks surprising, open full.jsonl by the same sessionId to inspect plan prompts,
   tool inputs, tool outputs.
5. Form a hypothesis, edit code or prompts, re-run from step 1.
```

The Obsidian track differs only in steps 1 and 3 of the run-agent flow: the developer invokes the command from `Cmd+P`, the MCP servers are real vault servers, and `track: 'obsidian'` is stamped in the header. Every downstream step and the output format are identical.

---

## 5. File Layout

```
obsidian-peak-assistant/
├── scripts/
│   ├── run-agent.ts                    # NEW: CLI harness
│   └── trace-latest.ts                 # NEW: trace path helper
├── src/
│   ├── core/telemetry/                 # NEW: entire module
│   │   ├── trace-types.ts
│   │   ├── traceSink.ts
│   │   ├── sdk-message-mapper.ts
│   │   └── fs-vault-mcp/
│   │       ├── server.ts
│   │       ├── fs-reader.ts
│   │       └── link-resolver.ts
│   └── app/commands/
│       └── run-trace-scenario.ts       # NEW: Obsidian command
├── test/
│   ├── fixtures/vault/small/           # NEW: fixture vault
│   │   └── (~25 .md files)
│   └── scenarios/                      # NEW: scenario catalog
│       └── vault-search/
│           ├── hub-discovery.yaml
│           ├── direct-answer.yaml
│           ├── ambiguous-query.yaml
│           ├── multilingual.yaml
│           └── not-found.yaml
├── data/
│   └── traces/                         # runtime output, .gitignored
│       └── YYYY-MM-DD/
│           └── <scenario>-<ts>.{meta,full}.jsonl
├── docs/
│   └── trace-format.md                 # NEW: schema + how to add a scenario
├── CLAUDE.md                           # EDITED: append "How to run a trace"
└── package.json                        # EDITED: add `trace`, `trace:latest` scripts
```

`data/traces/` is created lazily by the first run. Its entire contents are `.gitignore`d by default, with a single exception pattern that allows explicit allow-listing of specific "golden" traces if the developer chooses to commit them (this is a manual, rare action — not the default).

---

## 6. What v1 Delivers

Success for v1 is:

1. On a clean clone, `npm install && npm run trace -- scenario vault-search/hub-discovery` runs end to end and writes both JSONL files.
2. `data/traces/<date>/` contains the expected `meta.jsonl` and `full.jsonl`, both parsable and conforming to `trace-types.ts`.
3. Claude Code can complete at least one "change code → run scenario → read meta → change code" cycle without human intervention or Obsidian being open.
4. The Obsidian command `Peak: Run Trace Scenario` successfully runs the same scenarios against the real vault and writes trace files in the same canonical format with `track: 'obsidian'` stamped.
5. At least one pair of traces exists comparing a CLI-track run and an Obsidian-track run of the same scenario, demonstrating the format parity.

### Out of scope for v1 (see §0 for the full "not doing" list)

- Scenarios for `FollowupChatAgent`, `DocSimpleAgent`, `KnowledgeIntuitionAgent`. The generic trace sink will record their events for free the moment they invoke `query()` with a sink passed in; adding named CLI scenarios for them is a later, additive task.
- Trace diff tooling, inspector UIs, retention / rotation, streaming writes, assertion frameworks, usage dashboards, `usage_log` table joins, MCP-based trace consumers.
- Expansion of the unit test layer beyond what provider v2 brings in naturally.

---

## 7. Post-Refactor Integration Point

Provider v2 spec §6.1 introduces `VaultSearchAgentSDK.ts`. That file is where the trace sink DI hook lands:

```typescript
// VaultSearchAgentSDK.ts — post-refactor consumer loop, with trace hook
import type { TraceSink } from '@/core/telemetry/traceSink';

export async function* runVaultSearch(input: VaultSearchInput, opts?: { traceSink?: TraceSink }) {
    const stream = query({
        prompt: input.query,
        mcpServers: opts?.mcpServers ?? defaultVaultMcpServers(),
        // ...
    });
    for await (const msg of stream) {
        yield mapSDKMessageToUIEvent(msg);   // existing UI path
        opts?.traceSink?.consume(msg);       // NEW: one line, optional
    }
}
```

The CLI harness constructs the sink and passes it in. The Obsidian command does the same. Ordinary chat / search UI paths pass nothing (or pass `undefined`), incurring zero cost.

When other agents migrate to Agent SDK as part of provider v2, each one adds the same single line at its consumer loop; no further observability work is needed to cover them. Their named scenarios can be added later as the developer chooses.

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `fs-vault-mcp` diverges from real Obsidian `MetadataCache` semantics (link resolution, tag inheritance, unresolved link handling) | Claude Code optimizes against shim behavior, improving shim metrics while regressing real-vault behavior | Obsidian command exists as truth calibration; CLAUDE.md explicitly instructs "run the Obsidian command before any significant agent change is considered shipped"; the two tracks emit identical canonical format so any divergence surfaces via meta.jsonl diff |
| Agent SDK `SDKMessage` shape changes in a minor version | `sdk-message-mapper.ts` breaks | Mapper is a 150-line pure function with direct test coverage; pin the SDK version in package.json; breakage is localized and fixable in minutes |
| 10KB tool-output cap drops critical tail content | Occasional runs hide relevant information | `PEAK_TRACE_TOOL_CAP` env var overrides; setting it to 0 disables truncation entirely and writes a `full.jsonl.raw` file |
| Agent SDK subprocess warmup adds seconds per run | Iterating on one scenario repeatedly is annoying | Measure first; if it becomes actually painful, add a `--keep-alive` mode that runs multiple scenarios against one long-lived subprocess. Do not pre-optimize. |
| Fixture vault drifts into maintenance burden | Adding scenarios feels heavy | First 25 files are designed to cover ~5-8 scenarios; adding a scenario that needs new fixture content is typically a 1–3 file addition. If content needs grow past ~50 files, re-evaluate fixture structure. |
| YAML scenarios tempt toward `expect:` fields over time | Slippage from "observability" back toward "assertions" | This spec explicitly forbids those fields and `docs/trace-format.md` repeats the prohibition. Any future change introducing assertions must update this spec first. |
| Trace files accumulate in `data/traces/` indefinitely | Disk usage | Accepted; retention is out of scope. A `rm -rf data/traces/*` is always safe. |

---

## 9. Open Items

None blocking implementation. Items to revisit once v1 is in use:

1. **Whether to add a second fixture vault (`medium`, ~100 files)** for scenarios that need more graph density. Decision deferred until at least one scenario is confirmed to be under-served by `small`.
2. **Whether to auto-generate a summary line per run to stdout** richer than `TRACE: <path>` (e.g., `iterations=3 tokens=2440 tools=7 status=should_stop`). Trivial to add; deferred to first use.
3. **Whether Claude Code should get a slash command** (`/peak-trace vault-search hub-discovery`) wrapper, or continue using `npm run trace`. `npm run trace` works today with no new infrastructure; a slash command is a convenience layer that can be added if and when Claude Code's raw bash invocation proves awkward.

---

## 10. Relationship to Existing Specs

- **`2026-04-11-provider-system-v2-design.md`** — hard dependency. This spec is executed *after* provider v2 lands, and attaches to the `SDKMessage` event stream that v2 introduces. The single DI hook in `VaultSearchAgentSDK.ts` is the only touchpoint.
- **`2026-04-11-vault-search-agent-sdk-migration-design.md`** — provides the concrete `VaultSearchAgentSDK.ts` consumer loop where the trace hook lands. Scenario authoring for `VaultSearchAgent` assumes that migration is complete.
- **`2026-04-10-provider-mcp-skills-design.md`** (superseded by provider v2) — the `usage_log` table it defined is not used by this spec; trace observability and long-term usage accounting are deliberately separate concerns.
- **`2026-04-10-search-inspector-tools-overhaul-design.md`** — already merged. The tools it defines are what `fs-vault-mcp` has to emulate for `VaultSearchAgent` scenarios to function; any tool added there post-dates this spec needs a parallel update to the filesystem MCP shim.

---

## 11. Glossary

- **Canonical trace record** — The TS-typed schema of what an agent run looks like on disk. Both meta and full JSONL files are projections of the same underlying event sequence.
- **Meta projection** — Content-free summary: tool names, timings, usage, shapes. Fast to grep, safe to commit.
- **Full projection** — Meta plus every prompt, tool input, tool output (truncated), submit JSON, and final output. Git-ignored by default.
- **Scenario** — A named YAML file under `test/scenarios/` describing one agent invocation the developer and Claude Code both know about by name.
- **Fixture vault** — A small curated set of markdown files used by the CLI track in place of the real Obsidian vault.
- **CLI track** — Running an agent via `scripts/run-agent.ts` without Obsidian, against the fixture vault via the filesystem MCP shim. The autonomous path.
- **Obsidian track** — Running an agent via `Peak: Run Trace Scenario` inside Obsidian, against the real vault. The truth-calibration path.
- **Trace sink** — The class that consumes `SDKMessage` events, buffers canonical records, and writes the two JSONL projections on flush.
