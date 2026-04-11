# Provider System v2 Design Spec

> **Date**: 2026-04-11
> **Status**: Proposal (pre-implementation)
> **Supersedes**: `2026-04-10-provider-mcp-skills-design.md` (v1, previously Approved)
> **Incorporates by reference**: `2026-04-11-vault-search-agent-sdk-migration-design.md` (vault search technical details), `2026-04-11-provider-system-unification-analysis.md` (decision trail)
> **Scope**: The entire AI runtime stack of the plugin — every code path that makes an LLM call, every provider abstraction, every skill execution, every MCP integration

---

## Executive Summary

**Core principle**: one runtime, one mental model, one configuration surface. All LLM work in the plugin flows through Claude Agent SDK's `query()`. All provider configuration flows through a single Profile Registry. There are no dual stacks, no runtime-selection decisions, no "which SDK does this feature use" questions for developers to answer.

**What changes from v1**:

- The three-tier provider architecture (first-class adapters / gateway / OpenAI-compatible) is **retired** as an active design. It worked when Vercel AI SDK was the only runtime; it is replaced in v2 by the Profile Registry + Agent SDK materialization model.
- Every feature that currently calls Vercel AI SDK's `streamText` / `streamObject` / `generateText` / `generateObject` will migrate to call `query()` from `@anthropic-ai/claude-agent-sdk`.
- The entire `@ai-sdk/*` package family, `ollama-ai-provider-v2`, `@openrouter/ai-sdk-provider`, and the top-level `ai` package are removed as dependencies.
- The plugin becomes **desktop-only** for all AI features. The `isDesktopOnly` flag in `manifest.json` is flipped; mobile no longer has chat, vault search, summary, tag inference, or any other AI feature. This is a deliberate trade-off the user has explicitly accepted.
- Skills are rewritten to run exclusively on Agent SDK. The `simple` / `pipeline` distinction becomes "how many `query()` calls" rather than "which runtime."
- MCP integration is unified: Agent SDK's built-in MCP client is the only MCP client in the plugin. The previously-planned `MCPClientManager` wrapping `@modelcontextprotocol/sdk` directly is dropped because Agent SDK already exposes the same functionality.

**Two inherent splits that cannot be eliminated**:

1. **Embeddings**. Anthropic does not provide an embedding API; Agent SDK wraps the Claude API which has no embedding endpoint. Embedding must go through a separate, minimal path (≈50 lines). This is **not** a second runtime. It is a utility function that reads a Profile and posts to an OpenAI-format `/v1/embeddings` endpoint (typically via OpenRouter, LiteLLM, or direct OpenAI/Gemini). It introduces zero cognitive load because it is a pure data pipeline function, not an agent abstraction.

2. **Subprocess overhead for trivial calls**. Every `query()` call spawns or reuses a subprocess and goes through JSON-RPC IPC. For a 10-token title-generation call, this is dramatically more overhead than a direct HTTP request would be. The mitigation is `startup()`, which pre-warms the subprocess at plugin load time and makes subsequent calls ~20× faster. The user has explicitly stated that cost is not a concern relative to the goal of a unified architecture, so this overhead is accepted.

**What's preserved from v1**: Model Registry JSON format, Skill file format (markdown frontmatter), Skill Store design, Usage Tracking schema (`usage_log` table), Gemini/OpenAI embedding capability, and the Dev Toolchain module (`.cursor/mcp.json`, `.claude/settings.json`, recommended dev MCP servers). These sections of v1 carry over unchanged or with small augmentations noted per section below.

**What motivates this decision**: the user's explicit priorities, stated across the design conversation, in order of importance:

1. **Reduce cognitive and maintenance burden** — one system is simpler than two.
2. **Effect over flexibility** — Claude Opus 4.6 is SOTA for agentic tool use; locking vault search and skills to the Anthropic format gives access to Claude at full fidelity plus OpenRouter's 300+ models as secondary options.
3. **Focus on product UX** — outsourcing agent-loop engineering to Anthropic frees developer time for interaction design, which is where the plugin's differentiation lives.
4. **Global users, not specialized** — Profile system + OpenRouter covers global provider selection without hardcoding regional assumptions.
5. **No mobile** — explicitly accepted.
6. **No budget constraint on bundle size or subprocess overhead** — explicitly accepted.

**Estimated code delta** (preliminary; final counts in the implementation plan):

- **Delete**: ~5000–7000 lines across `service/chat/`, `service/agents/`, `core/providers/adapter/`, `core/providers/base/`, and all provider-specific code paths
- **Add**: ~1500–2000 lines across `service/agents/VaultSearchAgentSDK.ts`, vault MCP tools, Profile Registry, materialization layer, embedding helper, skill executor rewrite, UI adapter
- **Net deletion**: ~3500–5000 lines

---

## 0. How to Read This Document

This is a full architectural replacement spec. It does not delta against v1. Readers who want the history of decisions should consult the three source documents listed at the top.

Sections are structured as:

- **§1–§2**: the principle and the architecture diagram. Read these first.
- **§3**: Profile Registry data model. The load-bearing abstraction.
- **§4**: what every feature does in the new architecture (Vault Search, Chat, Skills, Embeddings, Document agents, Structured extraction).
- **§5**: what gets deleted, with explicit paths.
- **§6**: what gets added, with explicit paths.
- **§7**: MCP unification.
- **§8**: Usage tracking unification.
- **§9**: Implementation phase plan.
- **§10**: Risks and mitigations.
- **§11**: Open decisions (should be minimal at this point).
- **§12**: Supersession notes and document hygiene.

---

## 1. Core Principle

**One runtime.** Every LLM call in the plugin — whether it is a multi-step vault search agent, a single-turn title generator, a structured-output classifier, or a multi-turn conversational chat — flows through `query()` from `@anthropic-ai/claude-agent-sdk`. The function is the same, the subprocess is (mostly) reused across calls, the configuration is the same Profile, the message format is the same stream of SDK events.

**One configuration surface.** Every provider choice is a Profile in a single Profile Registry. Users add Profiles in one settings section. Every feature reads from that Registry. Users never configure Claude "for chat" and separately "for vault search" — they configure Claude once, and every feature uses it.

**One materialization path** (for AI work). Profile → Agent SDK env vars → subprocess IPC → Anthropic-format API call → response → UI event stream. There is no adapter-per-provider, no factory pattern, no per-feature provider routing logic.

**The only explicit split** is embeddings, which are handled by a ~50-line utility function that reads a Profile and makes a direct HTTP call to an OpenAI-format `/v1/embeddings` endpoint. This function is not a runtime, not a system, not an abstraction layer — it is a utility. It exists because embeddings are fundamentally not an agent operation and do not benefit from any agent infrastructure. Users configure it via the same Profile Registry (a Profile has an optional `embeddingEndpoint` + `embeddingModel` field).

The goal is **cognitive singularity**: when a developer or user thinks about "how does the plugin do AI work", the answer is "Claude Agent SDK, via Profiles." Any deeper detail is an implementation detail of that sentence.

---

## 2. Architecture

### 2.1 Runtime Stack

```
┌──────────────────────────────────────────────────────────┐
│                   Profile Registry                        │
│                (single source of truth)                   │
│   [Anthropic Direct] [OpenRouter] [LiteLLM] [Custom]      │
└───────────────────────────┬──────────────────────────────┘
                            │
              materializes to env vars / config
                            │
        ┌───────────────────┼────────────────────┐
        │                                        │
        ▼                                        ▼
┌────────────────┐                    ┌──────────────────┐
│ Agent SDK      │                    │ Embedding Helper │
│ query()        │                    │ (fetch wrapper)  │
│                │                    │                  │
│ · Vault search │                    │ · Index vault    │
│ · Chat mode    │                    │ · Query embed    │
│ · Skills       │                    │ · Chunk embed    │
│ · Doc agents   │                    │                  │
│ · Titles       │                    │ ~50 lines,       │
│ · Tags         │                    │ one function     │
│ · Summaries    │                    └──────────────────┘
│ · Classifying  │
│ · Structured   │
│   extraction   │
│                │
│ All via one    │
│ function, one  │
│ subprocess     │
│ pool           │
└────────────────┘
```

### 2.2 The `query()` Contract

Every LLM call is a call to `query()` with one of three usage patterns. The same function handles all three; only its arguments differ.

**Pattern A — Agent loop** (multi-turn, with tools).
Used for vault search, conversational chat with context retrieval, pipeline skills, complex document agents.

```
query({
  prompt: userQuery,
  options: {
    maxTurns: 20,
    allowedTools: ['mcp__vault__*'],
    disallowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    mcpServers: { vault: vaultMcpServer },
    systemPrompt: reflectiveQueryPlaybook,
    pathToClaudeCodeExecutable: cliPath,
    env: profile.toAgentSdkEnv(),
    canUseTool: hitlCallback,
  }
})
```

**Pattern B — Single-turn LLM call** (no tools, one response).
Used for title generation, tag inference, summary generation, any simple prompt → text transformation.

```
query({
  prompt: inputText,
  options: {
    maxTurns: 1,
    allowedTools: [],
    disallowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    systemPrompt: "Generate a 3-5 word title for this text.",
    pathToClaudeCodeExecutable: cliPath,
    env: profile.toAgentSdkEnv(),
  }
})
```

**Pattern C — Structured output** (single-turn with JSON Schema).
Used for classification, extraction, dimension analysis, intuition generation, anywhere the old pipeline used `streamObject`.

```
query({
  prompt: inputText,
  options: {
    maxTurns: 1,
    allowedTools: [],
    disallowedTools: [...],
    systemPrompt: classifierSystemPrompt,
    jsonSchema: myClassificationSchema.jsonSchema(),
    pathToClaudeCodeExecutable: cliPath,
    env: profile.toAgentSdkEnv(),
  }
})
```

The SDK handles JSON Schema enforcement and returns a parsed object. No intermediate streaming machinery, no manual `await result.object`, no "must consume partialObjectStream" footguns. One function.

### 2.3 Subprocess Pool and Warm-Up

A naive implementation would spawn a new subprocess for every `query()` call, which would make simple operations like title generation prohibitively slow. The mitigation is the SDK's **subprocess pooling** model:

- On plugin load, call `startup()` to pre-warm a single long-lived subprocess
- Subsequent `query()` calls reuse that subprocess via session continuation
- The subprocess stays alive for the plugin's lifetime; it is killed on plugin unload

Per the Agent SDK's CHANGELOG (v0.2.89), `startup()` is documented as making "the first query ~20x faster when startup cost can be paid upfront." This is the exact pattern the plugin needs.

For trivial calls (Pattern B), the subprocess reuse plus Anthropic's prompt caching make the overhead acceptable. For agent calls (Pattern A), the startup cost is negligible relative to the multi-turn LLM work that follows.

### 2.4 The Embedding Exception

Embeddings do not go through `query()`. The architectural decision:

- A single function `embedText(text: string, profile: Profile): Promise<number[]>` exists at `src/core/embeddings/embedClient.ts` (or equivalent path)
- It reads `profile.embeddingEndpoint`, `profile.embeddingModel`, `profile.embeddingApiKey`
- It makes a POST to `{endpoint}/embeddings` with OpenAI-format JSON body
- It parses the response and returns the vector
- Total implementation: ~50 lines, zero abstraction

The Profile Registry has a dedicated section for embedding configuration, independent of chat/agent configuration. Users may configure a single embedding provider (typically OpenAI `text-embedding-3-large`, Gemini `text-embedding-004`, Cohere `embed-english-v3`, or Voyage `voyage-3-large`) and reuse it for both vault indexing and query-time embeddings.

OpenRouter also exposes `/api/v1/embeddings` in OpenAI format, so a user whose main Profile is OpenRouter can reuse the same auth for embeddings by pointing `embeddingEndpoint` at `https://openrouter.ai/api/v1`.

This exception does not violate the "one system" principle in practice because:

- Embeddings are never an agent operation
- Users do not switch between "agent mode" and "embedding mode" in their mental model; they think of indexing and search as background infrastructure
- The embedding helper is one function, not a system
- Profile Registry is still the single config source (embedding config lives inside Profile)

---

## 3. Profile Registry

### 3.1 Profile Data Model

A Profile is the single unit of provider configuration. Each user may define multiple Profiles; one is active at any given time for a given feature, with per-feature overrides.

```
Profile
  id                 unique
  name               user-facing label (e.g. "My Anthropic Key", "OpenRouter Multi-Model")
  kind               'anthropic-direct' | 'openrouter' | 'litellm' | 'custom'
  enabled            boolean
  createdAt          timestamp

  // Agent SDK materialization (for query())
  baseUrl            string                 // maps to ANTHROPIC_BASE_URL
  apiKey             string | null          // maps to ANTHROPIC_API_KEY
  authToken          string | null          // maps to ANTHROPIC_AUTH_TOKEN (Bearer auth path)
  primaryModel       string                 // maps to ANTHROPIC_DEFAULT_OPUS_MODEL
  fastModel          string                 // maps to ANTHROPIC_DEFAULT_HAIKU_MODEL
  customHeaders      Record<string,string>  // maps to ANTHROPIC_CUSTOM_HEADERS (optional)

  // Embedding materialization (for embedText())
  embeddingEndpoint  string | null          // e.g. 'https://api.openai.com/v1' or 'https://openrouter.ai/api/v1'
  embeddingApiKey    string | null          // may be same as apiKey for OpenRouter
  embeddingModel     string | null          // e.g. 'text-embedding-3-large', 'openai/text-embedding-3-large'

  // Metadata / UX
  icon               string | null          // optional icon name
  description        string | null          // user notes
```

### 3.2 Profile Kinds

Only four kinds exist. Everything else is accessed through `custom`.

| kind | Agent SDK support | Embedding support | Typical use |
|---|---|---|---|
| `anthropic-direct` | Yes (full fidelity: cache_control, thinking, prompt caching 1h) | No (Anthropic has no embedding API; user must configure a separate embedding endpoint) | Highest-quality default for users who already have an Anthropic API key |
| `openrouter` | Yes (via Anthropic Skin; ≥95% fidelity for core features; cache_control and thinking may be lossy on non-Claude models) | Yes (OpenAI-format `/v1/embeddings`, routes to any embedding provider OpenRouter supports) | Recommended default for users who want multi-model flexibility without multiple accounts |
| `litellm` | Yes (if user configures LiteLLM with Anthropic endpoint; lossy on non-Claude) | Yes (LiteLLM proxies `/v1/embeddings` to any backend) | Self-hosted for local models (Ollama, vLLM, LM Studio), privacy-conscious users, compliance environments |
| `custom` | Conditional (user declares whether the endpoint supports Anthropic format) | Conditional (user declares whether `/v1/embeddings` is available) | Escape hatch for anything else: enterprise gateways, regional providers, experimental setups |

**Explicitly NOT first-class presets**:

- Direct OpenAI, Gemini, Perplexity, Ollama: these do not speak Anthropic format natively. Users who want them access them via OpenRouter (`openai/gpt-5`, `google/gemini-2.5-pro`, etc.) or via LiteLLM self-hosted (`ollama/llama-4-*`).
- AWS Bedrock / Google Vertex / Azure Foundry: these do speak Anthropic format (they host Claude), but they require cloud-credential configuration that is outside the plugin's UX scope. Enterprise users can use `custom` and set the relevant env vars manually.

### 3.3 Materialization

Two pure functions derive the runtime-specific form from a Profile:

```
function toAgentSdkEnv(profile: Profile): Record<string, string>
  returns a complete env var bundle suitable for passing to query({ options: { env } })

function toEmbeddingConfig(profile: Profile): { endpoint: string, apiKey: string, model: string }
  returns the config for embedText()
```

These functions live in `src/core/profiles/materialize.ts`. They are pure, side-effect-free, testable, and called at the point of use (per `query()` call, per `embedText()` call). Profile itself is never mutated; the materialized outputs are ephemeral and discarded after the call.

### 3.4 Per-Feature Default Profile Selection

Settings UI includes a per-feature selector:

```
Active profile for:
  Agent work (chat, vault search, skills, etc.): [▼ Profile name]
  Embeddings: [▼ Profile name]
```

Only one "agent work" profile is active at a time. All features that use `query()` share it. Users can have multiple Profiles defined but only one active; switching is a single dropdown.

Embedding has an independent selector because it is common to use a different provider for embeddings (OpenAI for cost, Voyage for quality, Gemini for free tier) than for agent work. Users may select the same Profile for both if their chosen Profile supports embeddings.

---

## 4. Feature Map

Every feature that currently exists in the plugin is mapped to its new execution model.

| Feature | Old path | New path | Pattern |
|---|---|---|---|
| **Vault search agent** | `VaultSearchAgent.ts` + `classify` + `decompose` + `queryUnderstanding` + `recon` + `AgentLoop.ts` + `tool-executor.ts` + Vercel AI SDK `streamText` and `streamObject` | `VaultSearchAgentSDK.ts` calls `query()` with vault MCP tools | Pattern A |
| **Chat mode (main conversational UI)** | `MultiProviderChatService` + `@ai-sdk/*` adapters + custom orchestration | Single `query()` call per user turn, with session resumption across turns | Pattern A (with tools) or Pattern B (tools off) depending on user preference |
| **Document Q&A (DocSimpleAgent)** | `DocSimpleAgent.ts` + `streamText` | `query()` with `maxTurns: 1`, system prompt includes the document content | Pattern B |
| **Followup Chat Agent** | `FollowupChatAgent.ts` + `streamText` | `query()` with short `maxTurns`, optional minimal tool set | Pattern A (short) |
| **Simple skills** (simple markdown frontmatter skills) | `SkillExecutor` + Vercel AI SDK | `query()` with `maxTurns: 1`, no tools unless skill declares them | Pattern B or Pattern A depending on skill |
| **Pipeline skills** (multi-phase skills) | `SkillExecutor` iterating phases on Vercel AI SDK | Sequential `query()` calls, one per phase, with session resumption or explicit state passing | Pattern A per phase |
| **Intuition / classify / decompose / dimension analysis** | `streamObject` with Zod schemas | `query()` with `jsonSchema` option | Pattern C |
| **Search architect / task planning** | `streamObject` | `query()` with `jsonSchema` | Pattern C |
| **Report generation** (dashboard blocks, executive summary, etc.) | `streamObject` + `streamText` | `query()` with `jsonSchema` for structured parts, `query()` with no tools for streaming text parts | Pattern B + Pattern C |
| **Title generation** | `generateText` or `streamText` on a short prompt | `query()` with `maxTurns: 1`, very short system prompt | Pattern B |
| **Tag inference** | `generateObject` with a tag schema | `query()` with `jsonSchema` | Pattern C |
| **Summary generation** | `streamText` | `query()` with `maxTurns: 1` and streaming | Pattern B |
| **Topic updates** | `streamObject` | `query()` with `jsonSchema` | Pattern C |
| **Mermaid diagram generation** | `streamText` | `query()` with `maxTurns: 1` and streaming | Pattern B |
| **Hub discovery** | Custom logic + LLM calls | `query()` with `jsonSchema` for scoring, with tools for inspection | Pattern A or C |
| **Knowledge intuition generation** (folder summaries, global map) | `streamObject` | `query()` with `jsonSchema` | Pattern C |
| **Document chunk embeddings (indexing)** | `@ai-sdk/openai` embedding call | `embedText()` helper function | Embedding path |
| **Query-time embeddings (vault search fallback)** | Same | `embedText()` helper function | Embedding path |

Every row in this table is expressible as one of the three `query()` patterns or the embedding helper. Nothing in the plugin requires any capability that Agent SDK does not expose.

---

## 5. What Gets Deleted

This is the authoritative deletion list for the v2 implementation. It should be read alongside the Phase 9 step of the implementation plan (§9), which specifies the order of deletions.

### 5.1 Dependencies (`package.json`)

**Remove**:

- `ai` (Vercel AI SDK top-level)
- `@ai-sdk/anthropic`
- `@ai-sdk/openai`
- `@ai-sdk/google`
- `@ai-sdk/perplexity`
- `@openrouter/ai-sdk-provider`
- `ollama-ai-provider-v2`
- (Possibly) `@langchain/core` and `@langchain/community` — only if they are used solely for LLM calls and not for document loading. Verify before removal.

**Add**:

- `@anthropic-ai/claude-agent-sdk` (~51MB, brings `cli.js` bundled + `@anthropic-ai/sdk` + `@modelcontextprotocol/sdk` as transitive deps)

**Keep unchanged**:

- `zod` (schemas, including for `jsonSchema` option to `query()`)
- `@langchain/textsplitters` (chunking, not LLM)
- `better-sqlite3`, `sqlite-vec`, `kysely` (storage)
- All Obsidian API deps
- All UI deps (React, Radix, @xyflow, mermaid, shiki, streamdown, etc.)
- `gray-matter`, `remark-*` (markdown parsing)
- `pdf-parse`, `officeparser`, `mammoth`, `playwright` (document loading)

**Bundle size effect**: approximately +50 MB from the Agent SDK, minus ~10-15 MB from removed Vercel AI SDK adapters. Net plugin distribution increase: ~35-40 MB. The user has explicitly accepted this.

### 5.2 Source Files

**Delete outright**:

- `src/service/agents/core/AgentLoop.ts`
- `src/service/agents/core/tool-executor.ts`
- `src/service/agents/vault/phases/classify.ts`
- `src/service/agents/vault/phases/decompose.ts`
- `src/service/agents/vault/phases/queryUnderstanding.ts`
- `src/service/agents/vault/phases/intuitionFeedback.ts`
- `src/service/agents/vault/phases/probe.ts`
- `src/service/agents/vault/phases/routeQuery.ts`
- `src/service/agents/vault/phases/recon.ts` (legacy multi-phase implementation)
- The recon-facing subset of `src/service/tools/search-graph-inspector/` (the subset used only by the deleted recon phase; the dashboard-facing tools are retained)

**Rewrite substantially** (same filename, new content):

- `src/service/agents/VaultSearchAgent.ts` — becomes a thin outer shell that delegates to `VaultSearchAgentSDK`
- `src/service/agents/vault/phases/presentPlan.ts` — becomes a `submit_plan` MCP tool handler + HITL callback
- `src/service/agents/vault/phases/report.ts` — rewrites its internal call from `streamObject` to `query({ jsonSchema })`
- `src/service/agents/DocSimpleAgent.ts` — becomes a thin wrapper over `query()` with `maxTurns: 1`
- `src/service/agents/FollowupChatAgent.ts` — becomes a thin wrapper over `query()` with session resumption
- `src/service/chat/service-manager.ts` (`AIServiceManager`) — becomes the Profile Registry + materialization layer + subprocess pool manager; no longer orchestrates adapters
- `src/core/providers/MultiProviderChatService.ts` — deleted or replaced with a file of the same name that contains only `query()`-based wrappers (probably cleaner to delete)
- `src/core/providers/base/anthropic.ts`, `openai.ts`, `gemini.ts`, `perplexity.ts`, `ollama.ts`, `openrouter.ts` — deleted (no more per-provider adapters)
- `src/core/providers/adapter/ai-sdk-adapter.ts` — deleted
- `src/core/providers/helpers/stream-helper.ts` — the parts that transform Vercel AI SDK's `fullStream` are deleted; a new adapter translates SDK messages into the same UI event format

**Moderate rewrite** (adapt to new runtime):

- `src/core/providers/types.ts` — `LLMStreamEvent` type is preserved; its source changes
- `src/ui/view/quick-search/hooks/useSearchSession.ts` — `routeEvent` function gets new cases for SDK-native event types but overall shape is preserved
- All skill-related files in `src/service/skills/` (currently planned in v1) — rewrite the executor to use `query()` for all skill types

### 5.3 Prompts and Templates

Prompts in `templates/prompts/` remain as markdown files. Their structure is unchanged. The code paths that load them change: instead of being assembled into Vercel AI SDK message arrays, they are passed as `systemPrompt` to `query()`.

Some prompts can be simplified because they no longer need to work around limitations of the hand-rolled pipeline:

- `ai-analysis-vault-query-understanding-system.md` — either deleted (if query understanding becomes implicit in the agent loop) or heavily simplified
- `ai-analysis-vault-recon-plan-system.md` — rewritten as the generic vault search playbook from the migration spec's §6.4
- `ai-analysis-search-architect-system.md` — deleted (no more decompose phase)

---

## 6. What Gets Added

### 6.1 New Source Files

- `src/service/agents/VaultSearchAgentSDK.ts` — thin outer shell for vault search; calls `query()` with vault MCP tools, handles HITL pause, streams SDK events as `LLMStreamEvent`s
- `src/core/profiles/ProfileRegistry.ts` — CRUD for profiles, persistent storage in plugin settings, active profile selectors per feature
- `src/core/profiles/materialize.ts` — pure `toAgentSdkEnv(profile)` and `toEmbeddingConfig(profile)` functions
- `src/core/profiles/presets.ts` — defines the three presets (Anthropic Direct, OpenRouter, LiteLLM) plus the Custom factory
- `src/core/embeddings/embedClient.ts` — the ~50-line `embedText()` helper + its tests
- `src/service/agents/core/sdkAgentPool.ts` — manages the pre-warmed subprocess pool; calls `startup()` at plugin load; provides a shared `query()` wrapper that pipes through the pool
- `src/service/agents/core/sdkMessageAdapter.ts` — translates SDK `SDKMessage` events into the plugin's existing `LLMStreamEvent` format (so UI consumers are unchanged)
- `src/service/agents/vault/tools/vaultMcpServer.ts` — defines the vault MCP tools (`vault_list_folders`, `vault_read_folder`, `vault_read_note`, `vault_grep`, `vault_wikilink_expand`, `vault_vector_search`, `submit_plan`) via `createSdkMcpServer`
- `src/service/skills/SkillExecutorV2.ts` — rewritten skill executor that uses `query()` for all skill types
- `src/ui/settings/ProfileSettings.tsx` — settings UI for Profile management
- `src/ui/settings/AgentSdkSettings.tsx` — settings UI for SDK-specific options (CLI path override, subprocess pool size, debug log verbosity)
- `scripts/copy-agent-sdk.mjs` — post-build script that copies `@anthropic-ai/claude-agent-sdk` files to the plugin distribution directory

### 6.2 Build Tooling Changes

**`esbuild.config.mjs`**:

- Add `@anthropic-ai/claude-agent-sdk` to the `external` list so esbuild does not attempt to bundle `cli.js` or `sdk.mjs`
- Add a post-build step invoking `scripts/copy-agent-sdk.mjs`, which copies `node_modules/@anthropic-ai/claude-agent-sdk/{sdk.mjs, cli.js, manifest.json, vendor/, ...}` to `dist/sdk/` (or wherever the plugin distribution puts its sidecar files)
- Remove `@ai-sdk/*` from any adapter path lists

**`manifest.json`**:

- `isDesktopOnly: true` — flip to true for all AI features
- Document the new size expectation in `README.md`

**`package.json` scripts**:

- `build` script chains through `copy-agent-sdk.mjs` after the esbuild step
- `dev` script same

### 6.3 New Settings Data Structures

```
interface PluginSettings {
  // ... existing non-AI settings unchanged ...

  // AI configuration (replaces existing provider settings)
  profiles: Profile[];
  activeAgentProfileId: string | null;
  activeEmbeddingProfileId: string | null;
  sdkSettings: {
    cliPathOverride: string | null;        // if user wants a specific Claude Code version
    subprocessPoolSize: number;             // default 1
    enableDevTools: boolean;                // gates verbose debug capture
    warmupOnLoad: boolean;                  // call startup() on plugin load
  };
}
```

Migration from v1 settings: on first load after upgrade, if the plugin detects v1 settings (existence of `aiServiceSettings` or similar), it runs a migration step that creates a default Profile from the old settings and preserves other fields. If migration fails, users start with an empty Profile list and are prompted to add their first Profile.

---

## 7. MCP Integration (Unified)

### 7.1 Single MCP Client

v1 proposed a separate `MCPClientManager` built on `@modelcontextprotocol/sdk` to wrap external MCP servers for use by the plugin's agent loop. v2 **drops** this component entirely. Claude Agent SDK's `query()` already accepts `options.mcpServers` and handles all MCP client duties for the plugin:

- **In-process custom tools** via `createSdkMcpServer` + `tool()`. Used for vault MCP tools (`vault_list_folders`, `vault_read_folder`, etc.) that need access to the Obsidian Vault API, SQLite, and plugin state.
- **External MCP servers** via `options.mcpServers: { serverName: { command, args, env } | { type: 'http', url } }`. Same config format as v1 planned. Agent SDK spawns or connects to these servers, handles tool discovery, and exposes the tools to the agent.

Users configure external MCP servers in a settings section. The config shape is:

```
MCPServerConfig
  id            unique
  name          user-facing
  enabled       boolean
  transport     'stdio' | 'http'
  command       string | null           // stdio
  args          string[] | null         // stdio
  env           Record<string,string>   // stdio
  url           string | null           // http
  headers       Record<string,string>   // http
```

At `query()` call time, the plugin builds `options.mcpServers` by filtering for enabled external MCP configs and passing them through to the SDK. The SDK handles everything else.

### 7.2 Benefits of This Unification

- One MCP implementation (Anthropic's), battle-tested in Claude Code
- No need for the v1-planned technical spike on `@modelcontextprotocol/sdk` + esbuild bundling compatibility (which was a known risk in v1)
- No need to write `jsonSchemaToZod` converters, tool collision naming, or transport abstractions
- Every MCP tool that works in Claude Code works in the plugin
- Future MCP protocol features ship to the plugin for free with Agent SDK updates

### 7.3 Security Considerations

Same as v1: MCP tool results are external content; system prompts should warn the LLM about potential injection. Agent SDK supports a `canUseTool` callback that can gate tool calls before they run, allowing user approval for high-risk operations.

---

## 8. Usage Tracking (Unified)

The `usage_log` SQLite schema from v1 is preserved:

```sql
CREATE TABLE usage_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       INTEGER NOT NULL,
  provider        TEXT NOT NULL,    -- now: Profile ID
  model_id        TEXT NOT NULL,
  usage_type      TEXT NOT NULL,    -- 'chat' | 'vault_search' | 'skill' | 'embedding' | 'structured_extraction' | ...
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cached_tokens   INTEGER DEFAULT 0,
  reasoning_tokens INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0,
  conversation_id TEXT,
  skill_id        TEXT,
  prompt_id       TEXT
);
```

**Change**: the `provider` column now stores a Profile ID rather than a provider-type name. The dashboard resolves Profile IDs to human-readable names at display time. This gives users per-Profile usage tracking (e.g., "I spent $5 on my OpenRouter profile and $12 on my Anthropic Direct profile this month").

**Event source unification**: all usage events come from two sources:

1. **Agent SDK `result` messages.** The SDK emits a `result` message type at the end of every `query()` session. This message includes token counts, cached tokens, reasoning tokens, and model information. The plugin's SDK message adapter intercepts `result` messages and calls `UsageLogger.record()` with `usage_type` set based on the calling context.

2. **Embedding helper.** `embedText()` records usage directly after each call, with `usage_type: 'embedding'`.

There are no other event sources. `UsageLogger` has one public API (`record()`) and two call sites.

**Dashboard**: same layout and queries as v1. The only change is that the "by provider" panel becomes "by profile", with Profile names.

---

## 9. Implementation Phases

### Phase 0 — Debug Log Infrastructure

Duration: 1–2 days. Independent of SDK choice. Deliverables listed in migration spec §8.1 and reproduced in unification analysis §8.

**Output**: one-click "Copy Debug Log" button that exports the full session's agent rounds as markdown.

### Phase 1 — Agent SDK Spike

Duration: 0.5 day. Seven verification checks listed in migration spec §8.2.

**Go/No-Go**: all of A, B, C, D, E, F must pass; G can be tuned after.

**If No-Go**: fall back to Path A from the migration spec — in-place refactor on Vercel AI SDK with the same vault MCP tool set and playbook prompt. v2 is paused; execution reverts to v1 architecture augmented with the Path A ideas.

### Phase 2 — Profile Registry and Materialization

Duration: 2–3 days.

Scope:

1. `Profile` data model (`src/core/profiles/types.ts`)
2. `ProfileRegistry` class (CRUD, persistent storage in `PluginSettings`)
3. `materialize.ts` pure functions (`toAgentSdkEnv`, `toEmbeddingConfig`)
4. Three preset definitions (Anthropic Direct, OpenRouter, LiteLLM)
5. Settings UI for Profile list, add/edit/delete Profile, active Profile dropdowns per feature
6. Migration from v1 settings (detect old `aiServiceSettings` shape, synthesize a default Profile, carry over embedding config)
7. `sdkAgentPool.ts` subprocess pool manager with `startup()` pre-warm

**Output**: users can configure Profiles, the plugin warms up an Agent SDK subprocess on load, and a test command (`Debug: Test Profile`) verifies that `query({ maxTurns: 1, prompt: "Hello" })` returns a response for the active Profile.

### Phase 3 — Vault Search Migration

Duration: 3–5 days.

Scope:

1. `src/service/agents/VaultSearchAgentSDK.ts` — the main shell
2. Vault MCP tools (`vaultMcpServer.ts` — glob, read_folder, read_note, grep, wikilink_expand, vector_search, submit_plan)
3. `sdkMessageAdapter.ts` — translates SDK messages to `LLMStreamEvent`
4. System prompt playbook (`templates/prompts/vault-search-playbook.md`)
5. HITL integration via `submit_plan` tool + callback
6. Feature flag `vaultSearch.useV2` (default false during development, flipped true after verification)
7. Update `VaultSearchAgent.ts` outer shell to delegate to V2 when flag is on

**Output**: vault search works end-to-end on Agent SDK. Reflective queries achieve high recall on a test vault. Debug log is complete.

### Phase 4 — Chat Mode Migration

Duration: 2–4 days.

Scope:

1. Replace `MultiProviderChatService` usage in chat mode with a thin wrapper over `query()`
2. Support session resumption across conversation turns (use SDK's `resume` option with the persistent session ID)
3. Optional tool mode: if user has external MCP servers configured, chat mode can use them
4. Update chat UI message streaming to consume SDK events via the same `LLMStreamEvent` adapter
5. Migrate chat-mode prompt templates if any Vercel-AI-SDK-specific patterns exist

**Output**: chat mode works on Agent SDK. Multi-turn conversation with persistence. Optional tool use.

### Phase 5 — Document Agents Migration

Duration: 1–2 days.

Scope:

1. `DocSimpleAgent.ts` — rewrite as `query()` with `maxTurns: 1`, document passed as system prompt context or as a file reference
2. `FollowupChatAgent.ts` — rewrite as short-`maxTurns` `query()`, session management for followup context

**Output**: document agents work on Agent SDK.

### Phase 6 — Structured Extraction Migration

Duration: 3–5 days.

Scope: every file that currently calls `streamObject` or `generateObject` is rewritten to call `query()` with `jsonSchema`. This includes:

- `report.ts` — dashboard block generation, executive summary
- Title generation calls (wherever they live)
- Tag inference calls
- Topic updates
- Summary generation
- Mermaid generation
- Hub discovery scoring
- Knowledge intuition generation
- Any other `streamObject` call sites (grep for `streamObject` and `generateObject` after Phase 5)

For each call site, the work is: remove the Vercel AI SDK import, construct a JSON Schema from the existing Zod schema (`z.toJSONSchema()` or equivalent), pass it to `query()` with `jsonSchema`, and parse the result.

**Output**: no more `streamObject` / `generateObject` in the codebase.

### Phase 7 — Embedding Helper

Duration: 1 day.

Scope:

1. `src/core/embeddings/embedClient.ts` — the ~50-line `embedText()` function
2. Unit tests against OpenRouter and OpenAI Direct endpoints (or mocked HTTP if CI budget is tight)
3. Replace existing embedding call sites (indexing pipeline, query-time embeddings) with `embedText()`
4. Remove the `@ai-sdk/*` imports used only for embeddings

**Output**: embeddings work through the minimal helper. Vector indexing is unchanged in behavior.

### Phase 8 — Skill System v2

Duration: 3–5 days.

Scope:

1. `SkillExecutorV2.ts` — unified executor that runs all skill types through `query()`
2. Skill frontmatter format unchanged (from v1); the executor chooses the right `query()` pattern based on `type: simple | pipeline | agent`
3. Built-in skills: migrate any v1 skills (e.g., weekly report, literature review from v1 spec examples) to the new executor
4. Skill selection UX in chat and quick search views
5. Skill input collection form (unchanged from v1)

**Output**: skill system works on Agent SDK. Users can install and run skills from the (yet to be built) Skill Store.

Note: Skill Store server and client (v1 §7.4) are separate work, not part of this phase.

### Phase 9 — Delete Vercel AI SDK Stack

Duration: 1–2 days.

Scope: the deletions listed in §5. Execute in this order:

1. Verify all phases 3–8 are working (feature flag off for old paths)
2. Delete old agent pipeline files from vault search (see §5.2 deletion list)
3. Delete `MultiProviderChatService` and per-provider adapters (see §5.2 rewrite list)
4. Delete Vercel-AI-SDK-specific stream helper code
5. Remove dependencies from `package.json` (see §5.1)
6. Run `npm install` to regenerate lockfile
7. Run full build; fix any remaining imports
8. Archive v1 docs with supersession markers (see §12)

**Output**: `@ai-sdk/*` is gone. `ai` is gone. The plugin runs exclusively on Agent SDK + minimal embedding helper.

### Phase 10 — Usage Dashboard + Settings UX Polish

Duration: 2–3 days.

Scope:

1. Usage dashboard implementation (tables, charts, period filters) as specified in v1 §8.4, reading from `usage_log`
2. Profile-level usage aggregation in the dashboard
3. Per-message cost display in chat (uses profile's `primaryModel` + cached pricing from Model Registry)
4. Settings UX polish: Profile edit dialog, preset picker, active-profile switcher, embedding profile selector
5. Model Registry integration for Profile UI (display model pricing, capability badges, dropdowns for common models)

**Output**: users see real usage and cost. Settings feel polished.

### Phase 11 — UX Focus (Open-Ended)

From here, development effort shifts to user experience. No more agent infrastructure work. Possible UX initiatives:

- Skill Store browse and install flow
- Onboarding for first-time users (profile setup wizard)
- In-modal explanation of what the agent is doing ("I'm looking at your ideas folder... now reading each file...")
- Cost-aware query suggestions ("This query will cost approximately $0.08 with your current profile")
- Profile comparison mode ("Same query on Profile A vs Profile B, compare results")
- Skill editor UI (write skills without touching markdown files)
- Automatic quality regression detection when users switch profiles
- Integration with other Obsidian features (daily notes, templater, canvas)

This phase is where the plugin's differentiation lives. Everything before it is plumbing.

---

## 10. Risks and Mitigations

### 10.1 Spike Failure on Phase 1

**Risk**: the SDK does not run correctly in the Obsidian plugin host. One of the spike's critical checks (A, B, D, E) fails.

**Mitigation**: fall back to Path A from the migration spec. This is a fully designed fallback path that preserves the 6-provider Vercel AI SDK stack but adds the vault MCP tool set and skills-style playbook. It delivers the vault search recall fix without any of v2's cross-cutting changes. If fallback is required, v2 is deferred; the plugin remains on v1 + Path A improvements.

### 10.2 Subprocess Overhead on Trivial Calls

**Risk**: title generation, tag inference, and other trivial calls become slow due to subprocess IPC overhead, degrading the plugin's responsiveness.

**Mitigations**:

1. Call `startup()` at plugin load to pre-warm the subprocess
2. Keep a long-lived subprocess; reuse across calls
3. Use `maxTurns: 1` and empty tool sets for trivial calls to minimize per-call overhead
4. Benchmark during Phase 3; if overhead is unacceptable, consider a fast-path using `@anthropic-ai/sdk` (a transitive dep of Agent SDK) for trivial calls. This would be a minor exception to "one runtime" but preserves "one Profile config" — the `@anthropic-ai/sdk` client reads from the same Profile via `toAgentSdkEnv()`.

**Fallback choice**: if Phase 3 benchmarking shows unacceptable latency, the exception is added in Phase 5 or 6 without blocking Phase 3–4 progress.

### 10.3 SDK API Breaking Changes

**Risk**: Anthropic ships a breaking change in a future Claude Agent SDK version. Plugin's `query()` call sites break.

**Mitigations**:

1. Pin the SDK version in `package.json` (`"@anthropic-ai/claude-agent-sdk": "0.2.101"` exact, not `^`)
2. Monitor CHANGELOG proactively; plan upgrade windows
3. Integration tests covering the main `query()` patterns (A, B, C) run on every upgrade
4. Profile Registry's `sdkSettings.cliPathOverride` lets users pin to a specific working version at runtime if the default package version breaks

### 10.4 CJK Encoding Regression in SDK

**Risk**: SDK's stream-json IPC corrupts non-ASCII file paths or content, making Chinese/Japanese/Korean vaults unusable.

**Mitigation**: Phase 1 spike explicitly checks CJK round-tripping. Phase 3 verification includes CJK test cases. If a regression ships in a later SDK update, pin to the last known-good version.

### 10.5 Mobile User Backlash

**Risk**: users on Obsidian mobile discover that AI features no longer work. Some may have been using the plugin primarily for mobile chat.

**Mitigations**:

1. Flip `isDesktopOnly: true` in a release clearly marked as breaking for mobile
2. Document the change in release notes and the plugin README
3. Before flipping the flag, announce the deprecation with at least one release lead time, giving mobile users notice to stay on an older version
4. For users who need mobile AI, point them at alternative plugins or the Obsidian Copilot / Smart Connections plugins that still support mobile

**The user has accepted this trade-off in the design conversation**, so no design change is warranted, but execution needs careful release messaging.

### 10.6 Plugin Distribution Size Review

**Risk**: Obsidian community plugin directory reviewers push back on the ~50 MB size increase, making distribution through the official channel harder.

**Mitigations**:

1. Engage reviewers early with a rationale document (this spec, essentially)
2. Worst case: distribute outside the official community directory (manual install, plugin's own GitHub releases)
3. Alternative worst case: implement on-demand download of the SDK's `cli.js` at first run instead of bundling, trading first-run UX for distribution tractability — only if pushback is severe, since the user has preferred direct bundling

### 10.7 The "Everything Through query()" Assumption

**Risk**: some feature turns out to have a requirement that `query()` cannot satisfy.

**Candidate problem features**:

- Features requiring specific non-Anthropic model features (e.g., OpenAI's `logprobs`, Gemini's safety settings). If any are currently relied upon, they need fallback to a direct API call.
- Features requiring raw streaming byte-by-byte for super-low-latency rendering (e.g., a typewriter effect). Agent SDK's message streaming has per-chunk granularity but not per-byte.
- Features requiring call-level control over retry, timeout, abort in ways the SDK does not expose.

**Mitigation**: during Phase 4–6 migration of each feature, verify that `query()` actually supports what the feature needs. If a feature cannot migrate cleanly, evaluate whether to (a) change the feature's behavior to fit `query()`, (b) use `@anthropic-ai/sdk` directly as a one-off exception, or (c) keep that one feature on Vercel AI SDK as a documented exception.

**Known acceptable exception**: embeddings (§2.4). That is the only exception currently planned.

---

## 11. Open Decisions

| # | Decision | Default / proposal | Status |
|---|---|---|---|
| 1 | Proceed with v2 unification | **Yes** | User confirmed |
| 2 | No mobile for any AI feature | **Yes** | User confirmed |
| 3 | Profile presets: Anthropic Direct, OpenRouter, LiteLLM, Custom only | **Yes** | User confirmed |
| 4 | All features on `query()` | **Yes** | User confirmed |
| 5 | Embedding exception (≈50-line helper) | **Accepted as necessary** | This document's recommendation |
| 6 | Subprocess overhead for trivial calls | **Accepted, mitigated by `startup()`** | User-stated "don't care about cost"; benchmarking in Phase 3 will confirm acceptability |
| 7 | Fallback to `@anthropic-ai/sdk` for trivial calls if benchmarking is bad | **Deferred**, evaluate after Phase 3 | This document's contingency plan |
| 8 | Delete all `@ai-sdk/*` dependencies | **Yes**, in Phase 9 after all features migrated | Implementation sequence |
| 9 | v1 spec supersession | **Yes**, mark `2026-04-10-provider-mcp-skills-design.md` as Superseded in document header, keep file for history | §12 |
| 10 | Migration spec and unification analysis status | **Active reference docs**, not superseded; migration spec is a technical companion to v2 and unification analysis is the decision trail | §12 |
| 11 | Old `search-inspector-tools-overhaul-design.md` and its plan | **Archive** in Phase 9; it becomes irrelevant once the tool set is simplified | §12 |

The user should confirm item 1–5 (most are already confirmed in conversation). Items 6–11 are implementation-level and do not need explicit confirmation.

---

## 12. Document Hygiene and Supersession

This v2 spec and its sibling documents collectively describe the plugin's AI architecture. They relate as follows:

```
2026-04-10-provider-mcp-skills-design.md                  [Superseded by v2]
  → historical reference only; do not edit

2026-04-11-provider-system-unification-analysis.md        [Active, decision trail]
  → explains how v2 was derived from v1 and the migration spec
  → kept for readers who want "why did we do this"

2026-04-11-vault-search-agent-sdk-migration-design.md     [Active, technical companion]
  → detailed technical design for the vault search subsystem specifically
  → referenced by v2 Phase 3 implementation

2026-04-11-provider-system-v2-design.md                   [Active, authoritative]
  → THIS DOCUMENT
  → the single source of truth for the plugin's AI architecture

2026-04-10-search-inspector-tools-overhaul-design.md      [To be archived in Phase 9]
  → proposed cleanup of tools that v2 deletes outright
  → no longer relevant after Phase 9 deletion

2026-04-10-search-inspector-tools-overhaul.md (plan)      [To be archived in Phase 9]
  → implementation plan for the above; same fate
```

**Recommended action at Phase 9 completion**:

1. Add a `**Status**: Superseded by 2026-04-11-provider-system-v2-design.md` header line to `2026-04-10-provider-mcp-skills-design.md`. Do not delete the file — it is historical record.
2. Add an archive marker to the two search-inspector-tools-overhaul documents, move them to a `docs/superpowers/archive/` subdirectory if convenient, or simply leave them in place with the archive marker.
3. Update `docs/superpowers/README.md` (if it exists) to list v2 as the current spec and mark v1 as historical.

---

## 13. Appendix — Quick Reference

### 13.1 `query()` Patterns Cheat Sheet

| Pattern | Use case | Key options |
|---|---|---|
| **A** | Multi-turn agent | `maxTurns: 15–20, mcpServers, allowedTools, disallowedTools, systemPrompt (playbook)` |
| **B** | Single-turn LLM | `maxTurns: 1, allowedTools: [], disallowedTools: all built-ins, systemPrompt (task)` |
| **C** | Structured output | `maxTurns: 1, jsonSchema, allowedTools: [], systemPrompt` |

All patterns additionally pass `pathToClaudeCodeExecutable: cliPath` and `env: profile.toAgentSdkEnv()`.

### 13.2 Profile Preset Configurations

**Anthropic Direct**:
```
baseUrl:      https://api.anthropic.com
apiKey:       <user-provided>
authToken:    null
primaryModel: claude-opus-4-6
fastModel:    claude-haiku-4-5
```

**OpenRouter**:
```
baseUrl:      https://openrouter.ai/api
apiKey:       ""                              # must be empty
authToken:    <user-provided OpenRouter key>
primaryModel: <any OpenRouter slug, e.g. anthropic/claude-opus-4-6 or openai/gpt-5>
fastModel:    <any OpenRouter slug, optionally cheaper, e.g. deepseek/deepseek-v3>
```

**LiteLLM Self-Hosted**:
```
baseUrl:      <user's LiteLLM Anthropic endpoint, e.g. http://localhost:4000/anthropic>
apiKey:       <user's LiteLLM master key, if any>
authToken:    null
primaryModel: <user-configured LiteLLM route, e.g. ollama-llama4-70b>
fastModel:    <user-configured LiteLLM route, possibly same>
```

### 13.3 Dependencies Summary

**Added**: `@anthropic-ai/claude-agent-sdk`

**Removed**: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/perplexity`, `@openrouter/ai-sdk-provider`, `ollama-ai-provider-v2`

**Unchanged**: everything else

---

**End of v2 design document.**
