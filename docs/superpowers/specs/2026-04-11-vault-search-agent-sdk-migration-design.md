# Vault Search Agent — Claude Agent SDK Migration Design

> **Date**: 2026-04-11
> **Status**: Proposal (pre-implementation, pre-spike)
> **Branch**: `refactor_search_pipeline`
> **Supersedes**: `2026-04-10-search-inspector-tools-overhaul-design.md` (merged into Phase 4 delete list; tool polishing is replaced by tool set simplification)
> **Related**: `2026-04-10-provider-mcp-skills-design.md` (complementary — that doc governs chat/embedding provider abstraction; this doc governs vault search specifically, which takes a different path)
> **Scope**: Vault search agent pipeline (`src/service/agents/VaultSearchAgent.ts` + `src/service/agents/vault/**` + `src/service/agents/core/AgentLoop.ts`) and its supporting tool, prompt, and debug event layers

---

## Executive Summary

**Problem.** The vault search agent's recall rate on reflective queries ("evaluate all my X", "what did I do last year", "my methodology") is ~21%. Broad folder content gets systematically missed because the pipeline trusts semantic similarity over user-organized directory structure. Only ~1 in N runs accidentally succeeds due to keyword-extraction luck in the probe phase.

**Root cause.** An 8-layer signal loss chain runs from folder intuition ranking down to recon tool selection. At every layer, structural information about user-organized folders is discarded in favor of semantic ranking. The LLM never gets the context it needs to call the right tool (directory enumeration) with the right argument (the target path), so it defaults to vector search, which collapses on homogeneous folder contents.

**First principles.** For a hand-organized personal vault, user-placed folders are ground-truth taxonomy. Any retrieval system that does not make folder structure first-class is throwing away the strongest signal. This is verified industry SOTA: Claude Code, Karpathy's llm-wiki, and agentic "Glob+Grep+Read" patterns all outperform vector RAG on personal knowledge bases by this principle.

**Decision.** Migrate the vault search agent from hand-rolled orchestration on Vercel AI SDK to Anthropic's Claude Agent SDK. The SDK bundles Claude Code's agent loop as an in-process-callable component (verified: cli.js is bundled in the npm package, no separate install required). Custom Obsidian-native tools are registered via `createSdkMcpServer` and run in-process. Multi-model support is achieved through environment-variable-driven profile switching, with OpenRouter's Anthropic-compatible "Anthropic Skin" endpoint providing access to 300+ models through a single configuration.

**Non-goals, by user decision.**
- No mobile support for vault search (feature flagged off on `Platform.isMobile`).
- No hardcoded vault directory paths in plugin code or prompts (this is a global plugin for many users; core directories are per-user configuration or runtime discovery).
- No per-user benchmark queries shipped in product (benchmarks are a dev-time tool, not a product feature).
- No AWS Bedrock / GCP Vertex / Azure Foundry presets (low user value; accessible via "Custom endpoint" if ever needed).

**Cost.** +~50 MB plugin distribution (user explicitly accepted). ~2400 lines of hand-rolled orchestration deleted. ~1100 lines of new infrastructure (Profile system + vault MCP tools + SDK adapter) added. Desktop-only vault search.

**Risk gate.** One half-day spike validates 7 specific technical unknowns (esbuild bundling strategy, Electron renderer subprocess, CJK encoding through stream-json IPC, MCP callback return path, disallowed-tools enforcement, custom-tool sufficiency, reflective-query behavior in practice). Any failure on critical checks triggers fallback to an in-place Vercel AI SDK + Glob/Grep/Read refactor, with clear per-check remediation.

---

## 1. Problem Diagnosis

### 1.1 Observable Symptoms

A representative failing query recorded from the existing pipeline:

| Metric | Observed | Expected (for a vault where ~56 relevant files exist) |
|---|---|---|
| Sources discovered | 12 | ~50+ |
| Topics covered | 10 | 10 |
| Topics with "low coverage" | 5 / 10 | 0 / 10 |
| Classify phase duration | 120.6 s | < 30 s |
| Dimensions produced by classifier | 26 | 6–8 |
| Decompose task count | 6 | 4–6 |
| Recon phase duration | 145.3 s | varies |
| Pipeline success rate | ~1/N runs | ~100% |

The 120.6 s classification time and 26-dimension explosion are the surface symptoms of a deeper prompt-structure issue. The low recall and thin coverage are the symptoms of the signal loss chain described below.

### 1.2 The 8-Layer Signal Loss Chain

Every layer independently contributes to the loss. The compound effect is the observed recall rate.

```
[Data layer]
  A user-organized folder with N same-topic notes
  (e.g., an "ideas" folder, a "reviews" folder, a "journals" folder)
  · Typically 2-3 levels deep in the vault structure
  · No user-maintained MOC / index file
  · Naming conventions present but not machine-declared
       │
       ▼
[Layer 1] listTopFoldersForSearchOrient(30)
  · Ranks folders by PageRank and doc count
  · Large top-level directories (resources, top-level kb folders) dominate top-20
  · Smaller, deeper subfolders with only dozens of files cannot enter folder context
  · LOSS: folderContext in classifier prompt does not contain the target folder
       │
       ▼
[Layer 2] runProbePhase
  · Extracts 2-3 keywords from user query
  · Each runs hybrid search with topK=5 → max 15 hits
  · For broad queries, hits are distributed across many top-level dirs
  · Target folder's share in dirCounts is 2-3 out of 15 at best
  · LOSS: probeContext may or may not mention the target folder, depending on
    the luck of keyword extraction
       │
       ▼
[Layer 3] runQueryUnderstandingPhase
  · System prompt contains contradicting instructions:
      "Most queries touch 3-6 semantic dimensions" and
      "Only omit a dimension if it is truly irrelevant"
  · Broad reflective queries trigger the expansion interpretation
  · 15 semantic + topology + temporal dimensions = 20-26 total
  · Since target folder is not in folderContext (Layer 1) and rarely in probeContext
    (Layer 2), LLM cannot produce scope_constraint.path pointing to it
  · LOSS: task scope is null; 120s wasted on over-enumeration
       │
       ▼
[Layer 4] decompose → PhysicalTask.targetAreas
  · targetAreas = scope_constraint.path ? [path] : []
  · Almost always [] for broad reflective queries
  · Recon user-prompt template has {{#if targetAreas}} — section skipped entirely
  · LOSS: downstream prompt has no folder anchor
       │
       ▼
[Layer 5] recon system prompt's "soft instruction" fails
  · System prompt item 4 says: "use explore_folder on directories named
    with 'ideas', 'idea', 'all-ideas', 'A-All'"
  · But the LLM has no way to fill the path parameter since task has no
    targetAreas and initialLeads are just top-k vector hits
  · LLM's natural chain becomes local_search → inspect_note → graph_traversal
  · LOSS: explore_folder is never called with the right path
       │
       ▼
[Layer 6] vector search collapse on homogeneous corpora
  · Many same-topic notes live in one embedding cluster
  · Top-k returns the "most typical" 8-12 cluster members
  · Remaining 30-40 files are mutually shadowed in embedding space
  · LOSS: ~70% of the relevant files are unreachable via semantic search alone
       │
       ▼
[Layer 7] hard iteration cap
  · RECON_ITERATIONS_PER_TASK = 3
  · No budget to pivot after discovering the folder structure mid-loop
  · 90 s wall-clock timeout per task
  · LOSS: even if the LLM wanted to correct course, there is no room
       │
       ▼
[Layer 8] PathSubmitOutput.discovered_leads: string[]
  · Submit schema only returns paths and a summary
  · Report phase has never read the actual file contents
  · It can only produce vague summaries based on filenames it saw
  · LOSS: even for the 12 files that were found, the report has no depth
```

### 1.3 Why Occasional Success Was Luck

The rare successful run occurs when the probe's keyword extraction happens to pick tokens whose hybrid-search hits all land in the same user folder. When this happens by chance, probe dirCounts ranks that folder first, probeContext mentions its path, the classifier LLM copies it into `scope_constraint.path`, decompose preserves it in `targetAreas`, recon's prompt contains the Target Areas section, and the LLM finally has a path to feed into `explore_folder`. The entire pipeline is downstream of a random-enough keyword split. This is not strategy. This is a 15% lottery.

### 1.4 Current Code Distribution

Approximate line counts of the code that will be affected by this migration. Exact counts are in the Phase 4 delete list (§8.4).

| File | Lines | Fate under this design |
|---|---:|---|
| `VaultSearchAgent.ts` | ~320 | **Keep as thin outer shell**, rewrite internals |
| `service/agents/core/AgentLoop.ts` | 318 | **Delete** (SDK provides agent loop) |
| `service/agents/core/tool-executor.ts` | ~100 | **Delete** (SDK handles tool execution) |
| `service/agents/vault/phases/classify.ts` | 240 | **Delete** (already dead code; queryUnderstanding replaced it) |
| `service/agents/vault/phases/decompose.ts` | 235 | **Delete** (LLM plans dynamically inside SDK loop) |
| `service/agents/vault/phases/queryUnderstanding.ts` | 250 | **Delete** (same) |
| `service/agents/vault/phases/intuitionFeedback.ts` | ~100 | **Delete** |
| `service/agents/vault/phases/probe.ts` | 185 | **Delete** (SDK agent does discovery as first tool call) |
| `service/agents/vault/phases/routeQuery.ts` | 67 | **Delete** |
| `service/agents/vault/phases/recon.ts` | 290 | **Delete**, replaced by thin SDK adapter |
| `service/agents/vault/phases/presentPlan.ts` | ~100 | **Restructure** into `submit_plan` tool handler |
| `service/agents/vault/phases/report.ts` | ~190 | **Keep** (final LLM call for report synthesis) |
| `service/tools/search-graph-inspector/**` (recon-facing subset) | ~500 | **Delete**; dashboard-facing subset retained |
| **Total affected / removed** | **~2400** | |

---

## 2. First-Principles Analysis

### 2.1 The Core Insight

A personal knowledge vault, hand-organized by one user, encodes their taxonomy in the filesystem structure. When a user places notes in a named folder, the folder placement is an act of classification; the folder name is a label; and the sibling set is a declared equivalence class. These are **strong priors**, freely available, and declared by the ground-truth authority (the user themselves).

A retrieval system that throws away this information and re-derives equivalence classes from ML-inferred text similarity is solving a problem the user has already solved, less reliably, with less information. For the specific task class of "enumerate my X," the correct retrieval primitive is a directory listing, not a semantic search. Semantic search is appropriate when the relevant notes are scattered and the structure is unclear; it is actively harmful when the user has pre-clustered them.

This can be stated as an invariant:

> **Any vault search system that does not treat user folders as first-class retrieval primitives is leaving the strongest signal on the table.**

The current pipeline violates this invariant. The redesign must honor it.

### 2.2 Industry SOTA

This invariant is not novel. It has been the implicit or explicit design principle behind several recent systems:

- **Karpathy's llm-wiki** (2026). A local knowledge base architecture consisting of `raw/`, LLM-compiled per-concept markdown, and `index.md`. No vector store. Retrieval pattern: "read index first, drill in." Query-time process is file enumeration + directed reading, not similarity search. Reference implementations for Obsidian exist in the community.

- **Claude Code's architecture**. No vector indexing. Primary tools are Glob, Grep, and Read. An Amazon Science paper (2026-02) quantified that agentic tool use over a filesystem reaches >90% of vector-RAG quality with zero vector database. Anthropic internal benchmarks reportedly showed the agentic approach outperforming vector search by a wide margin during Claude Code development.

- **"The RAG Obituary"** and related writing (Nicolas Bustamante et al., 2025–2026). Argues that for corpora where a human has imposed structure, agent + full-context reads are displacing RAG as the default pattern.

- **RAPTOR / GraphRAG / LightRAG / A-RAG**. Research lines exploring hierarchical summarization and hybrid graph/vector retrieval. These outperform flat vector RAG on exploratory queries.

The practical pattern converges on: **Glob first, Grep second, Read third; vector as fallback**.

### 2.3 Obsidian-Specific Signal Ranking

Obsidian provides additional signals beyond a generic filesystem that are user-declared and stronger than ML-inferred similarity. Ranked by how directly they encode user intent:

| Signal | Strength | Source | Notes |
|---|---:|---|---|
| Folder structure | ★★★★★ | user-placed | Ground-truth taxonomy |
| `[[wikilinks]]` | ★★★★★ | user-typed | Explicit semantic edges |
| MOCs (`index.md`, `*-MOC.md`) | ★★★★★ | user-written | Explicit table of contents |
| Frontmatter properties | ★★★★☆ | user-typed | Structured metadata |
| File naming conventions | ★★★★☆ | user-chosen | Often prefix-encoded category |
| Tags (`#tag`) | ★★★☆☆ | user-typed | Faceted classification |
| Backlinks | ★★★☆☆ | derived | Inferred from wikilinks |
| Vector similarity | ★★☆☆☆ | ML-inferred | Noisy on homogeneous corpora |
| Full-text search | ★★☆☆☆ | surface | Keyword-dependent |

For reflective broad queries ("my X," "all Y," "everything about Z"), the top-3 signals (folder, wikilink, MOC) are load-bearing. For specific-concept queries ("how did I describe Z in my notes"), FTS and wikilink expansion are load-bearing. Vector is fallback in both cases.

### 2.4 Implication for Tool Set

The implication is that the vault search agent's tool set should lead with:

- **Folder listing / enumeration**
- **Directory-scoped file reading**
- **Wikilink graph traversal**
- **Full-text search (keyword-based)**
- **Vector similarity (as fallback only)**

And should *omit* specialized graph tools (key nodes, path finding, hub discovery, orphan detection, dimension-filtered search) from the default recon tool set. Those tools serve dashboard and maintenance use cases, not query-time retrieval. Keeping them in the recon tool menu encourages the LLM to make the wrong tool choice.

---

## 3. Architectural Decision

### 3.1 Candidate Paths Considered

Three architectures were considered. Their differences are at the infrastructure level; the LLM used can be the same (Claude Opus 4.6) in all cases, so quality differences are not the primary axis.

**Path A — In-place refactor on Vercel AI SDK.** Keep Vercel AI SDK as provider abstraction. Delete hand-rolled `AgentLoop.ts`, `classify`, `decompose`, `queryUnderstanding`, `probe`. Use Vercel AI SDK's built-in agent loop (`generateText` with `stopWhen` or `experimental_Agent`). Write 5–6 vault-native tools (glob, read, grep, wikilink_expand, list_folders). Write a skills-style system prompt. Deletes ~2000 lines, adds ~600 lines, net −1400. Preserves all 6 existing providers, preserves mobile, preserves full control, no vendor lock. Failure modes are local and reversible.

**Path B — Migrate to Claude Agent SDK.** Adopt `@anthropic-ai/claude-agent-sdk` as the vault search agent's core. Its bundled Claude Code runtime (cli.js) handles the agent loop. Write vault-native tools as in-process MCP servers via `createSdkMcpServer`. Use env-var-driven profile switching for multi-model support, with OpenRouter's Anthropic Skin as the 300+ model bridge. Deletes ~2400 lines, adds ~1100 lines (including Profile system and MCP tool wrappers), net −1300. Inherits Anthropic's agent loop, hooks, sessions, subagents, skills infrastructure, and gets free upgrades with every Claude Code release. Loses: mobile support for vault search (no `child_process` on iOS/Android). Gains: near-zero agent-loop maintenance.

**Path C — Hybrid dual-track.** Path A for mobile and non-Claude providers, Path B for desktop Claude users. Doubles maintenance, contradicts the stated goal of reducing infrastructure burden. Rejected.

### 3.2 Why Path B

The decision rests on three facts that only became clear late in the analysis phase:

1. **The SDK is actually embeddable.** `@anthropic-ai/claude-agent-sdk@0.2.101` bundles `cli.js` (13.5 MB) inside the npm package. There is no separate CLI install required. The package has dedicated `./embed`, `./browser`, `./bridge`, and `./assistant` export entries, explicitly built for non-CLI hosts. Verification: `npm pack` and file inspection.

2. **Multi-model is first-class, not a workaround.** cli.js source contains 20+ references to `ANTHROPIC_BASE_URL`, dedicated env vars for per-slot model mapping (`ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`), a `nH()` function that detects first-party vs third-party base URLs, and a `ccrBaseUrl` code path named after the community `claude-code-router` project. Third-party endpoint routing is accommodated at the code level, not a gray-zone hack. Verification: grep against cli.js.

3. **OpenRouter's Anthropic Skin is the global multi-model solution.** A single OpenRouter API key routes Anthropic-format requests to 300+ models (Claude, GPT, Gemini, Llama, Mistral, DeepSeek, Qwen, Kimi, GLM, Grok, and any future provider). Setup is three environment variables. Claude family has zero-loss passthrough; non-Claude models have format translation with known-good fidelity for core features (text, system prompt, tool use, streaming) and lossy but non-breaking degradation for Anthropic-specific extensions (cache_control, thinking blocks). Verification: OpenRouter's official documentation.

These three facts, taken together, mean that Path B does not force the user to give up provider flexibility. It replaces the hand-coded 6-provider adapter matrix with a config-layer abstraction that supports an open-ended number of Anthropic-compatible providers. The code-layer "support for provider X" question becomes the config-layer "does a user's profile point at provider X" question. New providers cost zero code.

The trade-offs, stated honestly:

| Trade-off | Cost | Benefit |
|---|---|---|
| Vendor coupling to Anthropic's API format standard | You inherit their upgrade cadence; any format change must be followed | You also inherit Anthropic's agent engineering work for free |
| Plugin distribution +50 MB | Slower download, larger install | Self-contained; no user setup friction |
| Desktop-only vault search | Mobile users can't use this specific feature | Mobile Obsidian would have been a poor host for this feature anyway (no good UI for multi-step agents) |
| Subprocess fragility | Process lifecycle management, kill on unload, CJK stream-json edge cases | Isolation: the agent can't crash the Obsidian renderer |
| SDK upgrade risk | Anthropic may change SDK API in a breaking way | Lockable to specific version; migration is usually small |

### 3.3 What Is Explicitly Not Being Considered

- **Replacing all of Vercel AI SDK in the plugin.** Only vault search migrates. Chat mode (`DocSimpleAgent`, `FollowupChatAgent`, conversational features) continues to use Vercel AI SDK with all 6 providers. Embedding pipeline, hub discovery, orphan detection, and dashboard features continue unchanged.
- **Migrating the overall provider abstraction.** The `provider-mcp-skills-design.md` spec governs the plugin's general provider architecture; that design is untouched here. Vault search takes a specialized path because its needs (agentic tool use, long multi-step reasoning, HITL plan review) are qualitatively different from chat-mode needs.
- **Pre-committing to SDK migration before the spike.** The migration is conditional on the half-day spike passing its verification gates (§8.2). Failure cascades into Path A fallback.
- **Hardcoding user-specific vault structure.** All folder paths, file patterns, and query examples in this design are user-configured or runtime-discovered. The plugin ships as a general-purpose tool and learns about each user's vault at runtime.

---

## 4. Claude Agent SDK Technical Foundation

### 4.1 SDK Package Architecture (Verified)

The following was verified by running `npm pack @anthropic-ai/claude-agent-sdk` and inspecting the tarball contents (version 0.2.101 at time of verification):

```
@anthropic-ai/claude-agent-sdk/
  sdk.mjs              ~645 KB   main entry; thin wrapper around subprocess
  cli.js               ~13.5 MB  bundled Claude Code runtime (Node JS)
  browser-sdk.js       ~592 KB   alternate browser entry (WebSocket-transported)
  embed.js             ~1 KB     Bun-compile embedded entry
  bridge.mjs           ~865 KB   alternate bridge entry
  assistant.mjs        ~1.35 MB  alternate assistant API entry
  sdk.d.ts, *.d.ts              TypeScript declarations
  manifest.json                 runtime manifest
  vendor/ripgrep/               search binary dependencies
  vendor/audio-capture/         audio dependencies
  package.json                  main: sdk.mjs; files: [cli.js, sdk.mjs, ...]
```

Total unpacked size: 51.5 MB. Runtime dependencies: only `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk`. Peer dependency: `zod`. Optional dependencies: cross-platform `@img/sharp-*` for image handling.

**Key fact**: `cli.js` is a JavaScript bundle, not a native binary. It is executed by Node, meaning any Node environment (including Obsidian's Electron renderer with Node integration) can spawn it. There is no separate Claude Code installer step, and no native binary requirement.

### 4.2 Subprocess Model

The `query()` function in `sdk.mjs` performs roughly the following at runtime (verified by source grep):

```
query(options):
  cliPath = options.pathToClaudeCodeExecutable
  if cliPath is unset:
      attempt to resolve a native optional dependency binary
      if not found: fall back to require.resolve('./cli.js')
  spawn cliPath via child_process.spawn
  communicate via stdio using JSON-RPC (stream-json frame format)
  yield AsyncIterable<SDKMessage>
```

The message stream contains discriminated-union events (`system`, `assistant`, `user`, `result`, plus tool-lifecycle events). The plugin consumes this stream and translates events into the existing UI event format for rendering.

Subprocess lifecycle management is the plugin's responsibility: kill on plugin unload, abort on user cancel, handle abnormal exit. The SDK provides `AbortController` support and emits clear exit events.

### 4.3 Embedding in Obsidian Plugin

Obsidian plugins run in the Electron renderer process with Node integration enabled. `require('child_process').spawn` is available. Therefore the SDK's subprocess model is compatible in principle. The spike (§8.2) verifies this in practice.

Specific constraints of the Obsidian plugin host:

- **esbuild bundling**. The plugin builds with esbuild into a single `main.js`. The SDK's `sdk.mjs` uses `import.meta.url` + `createRequire` to resolve `cli.js`. If esbuild inlines `sdk.mjs` into `main.js`, `import.meta.url` will resolve to the plugin bundle's path, not the SDK's original location, and `require.resolve('./cli.js')` will fail. **Solution**: mark `@anthropic-ai/claude-agent-sdk` as `external` in esbuild config; run a post-build script that copies `node_modules/@anthropic-ai/claude-agent-sdk/{sdk.mjs, cli.js, vendor/, manifest.json, ...}` into the plugin's distribution directory (e.g. `sdk/` subdirectory); at runtime, load the SDK via absolute-path `await import()` and pass `pathToClaudeCodeExecutable` explicitly to bypass `import.meta.url` resolution.

- **Distribution size**. The plugin's shipped artifact grows by ~50 MB. The user has explicitly accepted this trade-off. The plugin's `manifest.json` flags it as `isDesktopOnly: true`.

- **Mobile disablement**. Vault search feature is gated behind `!Platform.isMobile`. On mobile, the UI entry point for vault search is hidden or replaced with a "Desktop-only feature" placeholder. Other plugin features (chat, embedding, dashboard) remain mobile-capable via Vercel AI SDK paths.

- **Vault file access strategy**. Two possible modes, both supported by the SDK:
  1. **Filesystem-mediated** (use built-in `Read`, `Glob`, `Grep` tools with `cwd` set to the vault root). Faster, no custom tools needed for basic file access. Bypasses Obsidian's metadata cache and file watcher; other plugins may not see agent-mediated changes.
  2. **Vault-API-mediated** (disable all built-in filesystem tools via `disallowedTools`, register custom MCP tools that wrap `app.vault` API). Slower, more code, but integrates cleanly with Obsidian's metadata cache, frontmatter parsing, wikilink resolution, and plugin ecosystem.

  **Decision**: use vault-API-mediated mode. The plugin's core value is Obsidian-native signals (wikilinks, frontmatter, metadata cache), which are only accessible through the Vault API. Filesystem-mediated mode would be faster but would throw away exactly the signals that make the agent valuable on Obsidian specifically.

### 4.4 Custom MCP Tools (In-Process)

The SDK exposes `createSdkMcpServer` and `tool()` from its main entry. Tools registered this way run **in the plugin's process**, not in the subprocess. When the agent (running inside the subprocess) calls a custom tool, the call is JSON-RPC'd back to the plugin process, the tool function executes with full access to the plugin's runtime context (app, vault, sqlite, state stores), and the result is sent back.

This is the critical property that makes the migration viable for Obsidian. Without it, custom tools would need to run in an isolated subprocess that cannot access the plugin's state. With it, the agent gains access to the Vault API, the SQLite index, and any plugin-level state through a standard MCP interface.

Tool registration pattern (illustrative, not implementation):

```
vault_list_folders tool          → enumerates top-level folders with file counts
vault_read_folder tool           → recursive listing of a folder's .md files
vault_read_note tool             → full content of a note (frontmatter + body + wikilinks)
vault_grep tool                  → FTS search via the existing SQLite FTS index
vault_wikilink_expand tool       → N-hop wikilink traversal via metadataCache
vault_vector_search tool         → vector similarity via sqlite-vec (fallback)
submit_plan tool                 → triggers HITL plan review modal
```

Built-in SDK tools (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`) are gated off via `disallowedTools`. The agent only sees the vault-native tools.

### 4.5 Multi-Model Support via Environment Variables

The cli.js binary reads several environment variables to determine which model and which provider to call. The following were verified by grepping cli.js (occurrence counts shown):

| Environment variable | Role |
|---|---|
| `ANTHROPIC_API_KEY` (78 refs) | Legacy auth path |
| `ANTHROPIC_AUTH_TOKEN` (9 refs) | Bearer-token auth path (used by OpenRouter) |
| `ANTHROPIC_BASE_URL` (20 refs) | HTTP endpoint override; this is how non-Anthropic backends are reached |
| `ANTHROPIC_MODEL` (7 refs) | Global default model |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` (12 refs) | "Opus slot" model — used for the main agent |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` (12 refs) | "Sonnet slot" model |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` (16 refs) | "Haiku slot" model — used for subagents and cheap tasks |
| `ANTHROPIC_SMALL_FAST_MODEL` (13 refs) | Small-fast model for routine work |
| `ANTHROPIC_CUSTOM_HEADERS` | Custom HTTP headers for proxies |
| `HTTPS_PROXY` | Standard HTTP proxy |

There is also a function `nH()` in cli.js that explicitly checks whether `ANTHROPIC_BASE_URL` points at `api.anthropic.com` or elsewhere, and a `ccrBaseUrl` code path referencing the community `claude-code-router` project. These are explicit accommodations for third-party-routed operation, not accidental undocumented features. Some optimizations (such as optimistic tool search) are gracefully disabled on third-party endpoints, but the core agent loop, tool use, streaming, and structured output work normally.

**Key capability**: the three per-slot model variables (`_OPUS_MODEL`, `_SONNET_MODEL`, `_HAIKU_MODEL`) allow different parts of a single agent run to use different models. The main agent can run on an expensive high-quality model while subagents run on a cheap fast model. This is cost optimization at the agent level, built into the SDK, accessible via environment variables.

---

## 5. Provider Strategy

### 5.1 The Profile System

A Profile is a named bundle of environment variables that, when passed to `query({ options: { env: profile.envVars } })`, directs the SDK subprocess at a specific provider. Users manage profiles in plugin settings. Each vault search query uses the currently active profile.

Profile data model (illustrative, not implementation):

```
SdkProfile:
  id:           unique string
  name:         user-facing label
  preset:       "anthropic" | "openrouter" | "litellm" | "custom"
  baseUrl:      maps to ANTHROPIC_BASE_URL
  apiKey:       maps to ANTHROPIC_API_KEY (may be empty)
  authToken:    maps to ANTHROPIC_AUTH_TOKEN (may be empty)
  primaryModel: maps to ANTHROPIC_DEFAULT_OPUS_MODEL (main agent slot)
  fastModel:    maps to ANTHROPIC_DEFAULT_HAIKU_MODEL (subagent / cheap slot)
  customHeaders: optional, maps to ANTHROPIC_CUSTOM_HEADERS
```

At query time, the plugin expands the active profile into the SDK's `env` option and spawns the subprocess. No other provider logic exists in plugin code.

### 5.2 Supported Profile Presets

Three presets ship by default. Additional providers are accessible via the "Custom" option, which presents the raw fields for user configuration.

**Preset 1 — Anthropic Direct.** Default. Highest fidelity. Uses Anthropic's first-party API.

```
baseUrl       = https://api.anthropic.com
apiKey        = <user-provided>
authToken     = (empty)
primaryModel  = claude-opus-4-6
fastModel     = claude-haiku-4-5
```

All SDK features work at full fidelity: cache_control, thinking blocks, parallel tool calls, streaming event granularity.

**Preset 2 — OpenRouter.** The multi-model bridge. Uses OpenRouter's Anthropic-compatible "Anthropic Skin" endpoint. One account grants access to 300+ models across every major provider.

```
baseUrl       = https://openrouter.ai/api
apiKey        = (empty — must be explicitly cleared)
authToken     = <user-provided OpenRouter key>
primaryModel  = <user-chosen model slug, e.g. anthropic/claude-opus-4-6 or openai/gpt-5 or google/gemini-2.5-pro>
fastModel     = <user-chosen model slug, possibly a cheaper model like deepseek/deepseek-v3>
```

Notes on OpenRouter:
- The apiKey field must be explicitly empty; OpenRouter auth goes through `ANTHROPIC_AUTH_TOKEN` (Bearer), not `ANTHROPIC_API_KEY`.
- Anthropic-family model slugs (`anthropic/*`) route with zero translation loss.
- Non-Anthropic model slugs go through OpenRouter's format translation layer. Core features (text, system prompt, tool use, streaming) work reliably. Anthropic-specific features (cache_control, thinking blocks) are either ignored or unsupported on non-Anthropic backends; the plugin's behavior degrades gracefully (higher cost on cache miss, thinking mode unavailable) but does not break.
- Model slugs can be fetched live from OpenRouter's `/api/v1/models` endpoint for a dropdown, or typed freely by the user.

**Preset 3 — LiteLLM Self-Hosted.** For users who want local models (Ollama, LM Studio, vLLM), data sovereignty, or an open-source translation layer they can audit.

```
baseUrl       = http://localhost:4000   (or user-specified)
apiKey        = <depends on LiteLLM config, often empty or a user secret>
authToken     = (depends)
primaryModel  = <LiteLLM-routed model name, e.g. ollama/llama-4-70b>
fastModel     = <LiteLLM-routed model name>
```

Users must run their own LiteLLM proxy (documented in plugin README with a minimal command). The plugin does not spawn LiteLLM.

### 5.3 What Is Not a Preset, and Why

The following providers and configurations were considered and rejected as default presets:

- **AWS Bedrock / GCP Vertex / Azure Foundry.** The SDK supports them natively via `CLAUDE_CODE_USE_BEDROCK` / `_USE_VERTEX` / `_USE_FOUNDRY` env vars and additional cloud-credential vars. But these require AWS/GCP/Azure credential setup that is far outside the plugin's UX scope, and the user population for this is enterprise-only. Users who need this can use the "Custom" preset and set the env vars manually. Not worth the configuration surface.

- **Per-provider direct endpoints** (Moonshot/Kimi, Zhipu GLM, DeepSeek, Qwen, etc., each of which ships their own Anthropic-compatible endpoint). Users who have direct accounts with these providers get slightly lower cost (no OpenRouter margin) but require a dedicated preset per provider. This is deferred to post-launch. OpenRouter covers these providers adequately for the initial release.

- **Hand-rolled Vercel AI SDK provider paths for vault search.** This was Path A. It is the fallback if the spike fails, not a default.

### 5.4 How OpenRouter's Anthropic Skin Works (Mechanism)

OpenRouter exposes `/api/v1/messages` accepting Anthropic's MessagesRequest schema: `model`, `system`, `messages`, `tools`, `tool_choice`, `cache_control`, `stream`, `temperature`, `top_p`, `top_k`, `stop_sequences`, `thinking`, `metadata`, `user`, and OpenRouter-specific `provider` for routing preferences.

Internally, OpenRouter routes based on the `model` field's provider prefix:

- `anthropic/*` — direct passthrough to `api.anthropic.com`, zero translation
- `openai/*` — format translated to OpenAI's `/v1/chat/completions` schema
- `google/*` — format translated to Gemini API schema
- `deepseek/*`, `moonshotai/*`, `meta-llama/*`, `qwen/*`, `x-ai/*`, and 300+ more — similar translation

Translation examples (Anthropic → OpenAI for illustration):

| Anthropic field | OpenAI equivalent |
|---|---|
| `system: "..."` (top-level) | `messages[0] = { role: "system", content: "..." }` |
| `tools: [{ name, description, input_schema }]` | `tools: [{ type: "function", function: { name, description, parameters } }]` |
| `{ type: "tool_use", id, name, input }` | `tool_calls: [{ id, function: { name, arguments: JSON.stringify(input) } }]` |
| `{ role: "user", content: [{ type: "tool_result", tool_use_id, content }] }` | `{ role: "tool", tool_call_id, content }` |
| `stop_reason: "end_turn" / "tool_use"` | `finish_reason: "stop" / "tool_calls"` |
| Streaming SSE `content_block_start/delta/stop` | Streaming `chat.completion.chunk` events |

Responses are translated in the reverse direction before being returned to the SDK. To the plugin, it looks indistinguishable from talking to Anthropic directly.

**Caveat from OpenRouter's official documentation**: *"Claude Code with OpenRouter is only guaranteed to work with the Anthropic first-party provider."* In practice, this caveat covers edge cases in tool use translation, parallel tool calls, and provider-specific features. The core pattern of agentic vault search — system prompt + messages + tool calls + streaming — works reliably on all major providers (GPT family, Gemini family, DeepSeek, Kimi, GLM, Llama family, Mistral family). Users who encounter edge cases can fall back to Anthropic direct.

**Caveat regarding lossy fields**:
- `cache_control` is honored by Anthropic models and ignored by non-Anthropic models. Cache-miss cost is higher but behavior is unchanged.
- `thinking` blocks are produced only by reasoning-capable models (Anthropic Claude, OpenAI o-series, Gemini 2.x reasoning variants, DeepSeek R1). On other models, the response simply lacks thinking blocks.
- High-TTL prompt caching (1-hour) is Anthropic-specific.

For the vault search use case, none of these losses are critical. The core agent loop is unaffected.

---

## 6. Core Directory Discovery (No Hardcoding)

This section addresses the user correction that the plugin serves global users, so no hardcoded vault-specific paths may appear in plugin code or prompts.

### 6.1 The Anti-Pattern Being Avoided

A wrong design would be:

```
CORE_DIRECTORIES = [
  "kb2-learn-prd/B-2-创意和想法管理/A-All Ideas",
  "kb2-learn-prd/B-3-复盘和日记",
  "kb1-life-notes",
]
```

This approach hardcodes one user's specific vault layout into the plugin. It fails for every other user. It also fails for the same user if they reorganize their vault. This pattern is rejected.

### 6.2 Dynamic Discovery (Default Behavior)

The primary mechanism is runtime discovery: the agent determines relevant folders at query time by inspecting the vault structure. This requires no per-user configuration and works on any vault layout.

**Mechanism**: the agent's system prompt instructs it that for any reflective query (detected by linguistic markers such as "my X", "all Y", "everything about Z", "summarize", "evaluate"), its **first tool call must be `vault_list_folders`**. This tool returns a snapshot of the vault's folder structure with file counts per folder, two or three levels deep. The agent then reasons over this snapshot to decide which folders are relevant to the query.

Example reasoning path (illustrative, not literal):

```
Query: "my methodology"

Agent reasoning (first iteration):
  1. This is a reflective query. I must call vault_list_folders first.
  2. [calls vault_list_folders]
  3. Result shows top-level folders with file counts.
     I see a folder named "methodology" or "principles" or "templates" —
     any of these might contain what the user wants.
  4. I call vault_read_folder on the candidate folders.
  5. I read notes individually with vault_read_note.
  6. I synthesize and call submit_plan.
```

The LLM's reasoning about folder relevance is based on folder names, which users typically make human-readable. Folder-name matching to query intent is a task that capable models (Claude Opus 4.6, GPT-5, Gemini 2.5) handle well.

### 6.3 Optional Pinned Scopes (Power User Setting)

A secondary mechanism exists for users who run the same kind of query repeatedly and want to skip the discovery step. Plugin settings include an optional field:

```
Settings → Vault Search → Pinned Reflective Scopes
  [+ Add folder]
```

Users may add folder paths that the agent always considers candidates for reflective queries. If pinned scopes are configured, they are passed to the agent as additional context in the initial system prompt, and the agent may choose to bypass the discovery step if a pinned scope clearly matches the query intent.

**Default state**: empty. No pinned scopes out of the box. Dynamic discovery handles everything.

This is a pure optimization. Users who never touch it get identical functionality to users who configure it, just with one extra tool call per query.

### 6.4 System Prompt Playbook Structure

The system prompt that governs reflective-query behavior is structured as a generic playbook with no vault-specific content:

```
You are a vault search agent operating over an Obsidian vault.

## Query Type Classification

Classify each query as one of:

1. Reflective / enumerative — the user wants a collection ("my X", "all Y",
   "everything about Z", "summarize my Q", "evaluate my R"). These queries
   require you to enumerate user-organized folders.

2. Specific lookup — the user wants information about a particular concept
   or claim ("what did I say about X", "how do I Y", "where is Z"). These
   queries are best served by full-text search and wikilink traversal.

## Reflective Query Playbook

1. If pinned scopes are configured in the session context, consider them first.
2. Otherwise, your FIRST tool call must be vault_list_folders. Do not skip this.
3. Read the returned folder structure. Identify folders whose names or file
   counts suggest they contain the requested collection.
4. Call vault_read_folder on each candidate folder to get the full file list.
5. Call vault_read_note on notes that are clearly relevant, in batches.
6. Synthesize findings and call submit_plan.

## Specific Lookup Playbook

1. Start with vault_grep to search by keyword.
2. For top hits, call vault_read_note for full content.
3. If initial hits are sparse or ambiguous, call vault_wikilink_expand from
   the top hit to follow user-declared semantic edges.
4. Only fall back to vault_vector_search when grep and wikilink expansion
   have both failed.
5. Synthesize findings and call submit_plan.

## Never

- Never use vault_vector_search as the first tool for a reflective query.
  Vector search collapses on homogeneous folders and will miss most of the
  collection.
- Never call submit_plan without having called at least vault_list_folders
  (for reflective queries) or vault_grep (for lookups).
```

This playbook contains no user-specific information. It is the same for every vault. Per-user customization (pinned scopes, preferred models, query detection heuristics) is injected as additional context at runtime, not hardcoded in the prompt.

### 6.5 Vault Structure Analysis (Optional First-Run Feature)

A future refinement (not part of the initial migration): on the user's first vault search, the plugin optionally runs a one-time analysis pass that suggests pinned scopes based on heuristics like folder depth, file density, and naming patterns ("folders with >10 .md files whose names contain collection-indicating words"). The user accepts or rejects suggestions. This is a UX-polish feature, deferred until after the core migration is validated.

---

## 7. Debug Infrastructure (Phase 0, Independent of Migration)

Phase 0 builds the debug infrastructure before any other work. This is necessary regardless of whether the SDK migration proceeds, because:

1. During the spike (Phase 1), the plugin needs to observe the full SDK event stream to verify behavior.
2. During migration (Phase 2), the plugin needs to compare old-pipeline output with new-pipeline output on the same queries.
3. If the spike fails and Path A is taken instead, the same debug infrastructure is needed to diagnose pipeline issues.
4. For production users, a "copy debug log" button allows them to send reproducible traces when reporting bugs.

### 7.1 Gaps in Current Debug Information

The following table compares what the current pipeline captures versus what would be necessary to debug agent behavior:

| Signal | Current state | Gap |
|---|---|---|
| User query | captured | none |
| Probe keyword search results | logged to console only | not in store |
| Plan system prompt per iteration | explicitly omitted (comment in `stream-helper.ts` says "no system prompt show in debug … design this for cache") | **critical gap** — cannot see what the LLM was instructed |
| Plan user prompt / input messages | emitted in `pk-debug` event but no consumer stores it | **critical gap** |
| Plan reasoning (delta text) | stored only as deltas | fragmented, hard to read |
| Plan output text | truncated to 150 characters in `agent-step-progress.detail` | **critical gap** — this contains the LLM's decision rationale |
| Tool call arguments | captured | none |
| Tool results | partially captured (output field only, often further summarized to 100 chars) | incomplete |
| `runSubmit` return value | never emitted as event | **critical gap** — `tactical_summary`, `battlefield_assessment`, `should_submit_report` are all lost |
| Merged state after each iteration | never emitted | **critical gap** |
| Report phase inputs and outputs | not emitted | **critical gap** |
| Per-iteration timing | emitted as `pk-debug` but not stored | minor |
| Per-tool timing | captured in agent-stats event | OK |

The three **critical gaps** in plan visibility (system prompt, input messages, plan text) together mean that when the agent makes a wrong tool choice, there is no way to determine *why* it made that choice. This makes agent debugging impossible with the current infrastructure.

### 7.2 Required Events (to be added to `AgentLoop.ts`)

Each iteration of the agent loop should emit five new `pk-debug` events capturing the complete round:

```
agent-round-input   { iteration, systemPrompt, userMessages, toolSet, taskIndex, stepLabel }
agent-round-plan    { iteration, reasoning, text, toolCalls, durationMs, taskIndex }
agent-round-tools   { iteration, toolResults (full, not summarized), timings, taskIndex }
agent-round-submit  { iteration, submit (full object), durationMs, taskIndex }
agent-round-state   { iteration, state (serialized), shouldStopResult, taskIndex }
```

These events are stored in `searchSessionStore` under a new `debugRounds` array, grouped by `(phase, taskIndex, iteration)` so that parallel task execution can be untangled at display time.

### 7.3 Copy-to-Clipboard UX

A "Copy Debug Log" button in the steps panel (or a dedicated debug drawer) serializes the entire current session's `debugRounds` into markdown and writes it to the clipboard. The markdown format groups by phase, then by task, then by iteration, showing each round's full content (system prompt, input, plan, tools, submit, state).

Gated behind `plugin.settings.enableDevTools === true` so that normal users do not accumulate debug memory unnecessarily. A configurable cap (e.g., 200 rounds) prevents unbounded growth.

### 7.4 Why This Is a Prerequisite

The spike in Phase 1 explicitly requires reading the SDK event stream. Without Phase 0's infrastructure, the spike is blind. The "does the SDK run in Obsidian" question has to be answered with "yes, and here is what it did, round by round" — not just "yes, it didn't crash."

---

## 8. Migration Roadmap

### 8.1 Phase 0 — Debug Log Infrastructure

**Duration**: 1–2 days.

**Scope**: Add the five new round-level `pk-debug` events to `AgentLoop.ts`. Extend `searchSessionStore` with `debugRounds`. Update `useSearchSession.routeEvent` to dispatch the new events. Add a markdown serializer for session debug rounds. Add a "Copy Debug Log" button to the steps panel, gated on `enableDevTools`.

**Output**: At any point during or after a vault search session, the user can click one button and paste a complete markdown debug log showing every round's system prompt, input messages, plan text, tool calls, tool results, submit data, and state snapshot.

**Independence**: This phase does not touch the agent pipeline itself and does not depend on the spike. It is valuable whether Path A or Path B is ultimately taken.

### 8.2 Phase 1 — SDK Spike

**Duration**: 0.5 day.

**Scope**: Install `@anthropic-ai/claude-agent-sdk`. Write a minimal POC (on the order of 50–100 lines) that attempts to invoke `query()` from within the plugin process. Run a specific list of verification checks:

| # | Check | Failure mode → remediation |
|---|---|---|
| A | `await import(sdkAbsolutePath)` succeeds from the plugin | esbuild external config or ESM interop — adjustable |
| B | Subprocess spawns successfully; `init` system message is received | Electron renderer restrictions — may need IPC to main process, or fallback to Path A |
| C | Built-in filesystem tools (with cwd set to vault root) can read a vault file | cwd or permission issue — adjustable |
| D | A file and folder with CJK characters in the name round-trips through stream-json IPC without U+FFFD corruption | **No-Go critical**. SDK regression; wait for SDK fix, fall back to Path A in the meantime |
| E | A custom MCP tool registered via `createSdkMcpServer` is callable by the agent and returns data to the plugin process | Custom tool wiring — if broken, major blocker; may require fallback |
| F | `disallowedTools` successfully prevents the agent from using built-in filesystem tools, forcing it through custom MCP tools only | Tool-gating issue; if broken, accept filesystem-mediated mode as a compromise |
| G | A representative reflective query (composed generically for any vault) produces the expected first tool call of `vault_list_folders` | Prompt playbook needs tuning, but not a blocker |

**Go criterion**: A, B, C, D, E, F all pass. G may require prompt iteration but is not a hard gate.

**No-Go criterion**: A, B, D, or E fails. These are structural. If any fails, Path A becomes the default and the remaining phases below adapt to Path A (broadly similar but using Vercel AI SDK's agent loop instead of Claude Agent SDK's).

### 8.3 Phase 2 — Build New Agent Shell

**Duration**: 3–5 days (conditional on Phase 1 Go).

**Scope**:

1. **Profile system** (~450 lines). Profile data model, persistent storage in plugin settings, CRUD operations, React settings UI for listing/editing/deleting profiles, three presets (Anthropic Direct, OpenRouter, LiteLLM Self-Hosted), env-var expansion logic.

2. **Vault MCP tools** (~500 lines). In-process implementations of `vault_list_folders`, `vault_read_folder`, `vault_read_note`, `vault_grep`, `vault_wikilink_expand`, `vault_vector_search`, `submit_plan`. All implementations wrap Obsidian's `app.vault` / `app.metadataCache` / existing SQLite repos.

3. **System prompt playbook** (~80 lines of markdown as a template). Loaded via `TemplateManager` per plugin convention. Contains the generic query-type classification and playbook structure from §6.4.

4. **`VaultSearchAgentSDK.ts`** (~200 lines). Thin outer shell that:
   - Resolves the active profile
   - Assembles the MCP tool server
   - Calls `query()` with `disallowedTools` + `allowedTools` + `pathToClaudeCodeExecutable` + profile env
   - Translates incoming `SDKMessage` events into the plugin's existing `LLMStreamEvent` format
   - Handles HITL pause via the `submit_plan` tool's callback
   - Delegates to existing `report.ts` for the final report generation step

5. **Feature flag**. A plugin setting `vaultSearch.useSdkAgent` (default `false` initially) switches between the old pipeline and the new SDK-backed pipeline. This allows side-by-side comparison during Phase 3 and a safety net if issues are discovered late.

6. **Build tooling**. Post-build script in `esbuild.config.mjs` that copies `node_modules/@anthropic-ai/claude-agent-sdk/` (or the necessary subset of its files) into the plugin's distribution directory, under a `sdk/` subfolder.

### 8.4 Phase 3 — Verification

**Duration**: 2–3 days.

**Scope**: Verify the new pipeline behaves correctly using generic verification criteria rather than user-specific benchmark queries.

Verification targets (applied to the developer's own test vault, not shipped):

- **Recall on reflective queries**: for a test query over a test folder of N files, the new pipeline should reach >80% file enumeration. Compared to the old pipeline's ~21%, this is the headline metric.
- **Report citation fidelity**: the new pipeline's report should reference specific file contents by quotation or specific detail. The old pipeline's reports were vague because `report.ts` never received full file content.
- **Debug log completeness**: every agent round should show complete system prompt, input messages, plan text, tool calls, tool results, submit data, state snapshot in the copied debug log.
- **Profile switching**: switching between Anthropic Direct and OpenRouter profiles should transparently switch the effective provider without any code-level changes.
- **HITL flow**: `submit_plan` tool callback should cleanly pause the agent, surface the plan in the modal, and resume on user feedback.
- **CJK handling**: files with non-ASCII paths should round-trip correctly through the SDK.
- **Cancellation**: user cancel should terminate the subprocess cleanly.
- **Error handling**: API errors, rate limits, and subprocess crashes should be surfaced to the UI, not silently swallowed.

No user-facing benchmark queries are shipped. Developers run generic verification against their own vaults during this phase.

### 8.5 Phase 4 — Delete Old Pipeline

**Duration**: 1 day.

**Scope**: Once Phase 3 validates the new pipeline, remove the old pipeline entirely. The deletion list:

- `src/service/agents/core/AgentLoop.ts`
- `src/service/agents/core/tool-executor.ts`
- `src/service/agents/vault/phases/classify.ts`
- `src/service/agents/vault/phases/decompose.ts`
- `src/service/agents/vault/phases/queryUnderstanding.ts`
- `src/service/agents/vault/phases/intuitionFeedback.ts`
- `src/service/agents/vault/phases/probe.ts`
- `src/service/agents/vault/phases/routeQuery.ts`
- `src/service/agents/vault/phases/recon.ts`
- The recon-facing subset of `src/service/tools/search-graph-inspector/*` (retain the dashboard-facing tools)
- `docs/superpowers/plans/2026-04-10-search-inspector-tools-overhaul.md` (archived; this design supersedes it)
- `docs/superpowers/specs/2026-04-10-search-inspector-tools-overhaul-design.md` (archived)

Retained:
- `src/service/agents/VaultSearchAgent.ts` (restructured as the shell around `VaultSearchAgentSDK`)
- `src/service/agents/vault/phases/report.ts` (final report generation)
- All UI components (`SearchResultView`, `StepList`, `SearchModal`, etc.)
- All Zustand stores (`searchSessionStore`, etc.)
- `DocSimpleAgent.ts`, `FollowupChatAgent.ts` (chat mode, unaffected)
- `MultiProviderChatService` and `@ai-sdk/*` adapters (still used by chat mode)
- SQLite, sqlite-vec, embedding pipeline, hub discovery, orphan detection (all unaffected)
- The dashboard-facing subset of `search-graph-inspector` tools

**Total deletion**: approximately 2400 lines.

### 8.6 Phase 5 — UX Refinement (Open-Ended)

With the agent infrastructure outsourced to Anthropic's SDK and the code surface reduced, the plugin's development effort can shift to user experience work: interaction polish on the steps panel, profile switcher shortcuts, improved HITL modal, onboarding flows for first-time users, documentation for multi-model profiles, and so on. This phase is open-ended and represents the transition the user explicitly requested ("专注产品体验设计").

---

## 9. Risks and Fallbacks

### 9.1 Spike Failure Modes

Addressed in §8.2. Briefly: any failure on A/B/D/E triggers fallback to Path A (in-place refactor on Vercel AI SDK, keeping 6-provider support and mobile). Path A is broadly defined as: delete the same old pipeline, write the same vault MCP tools (but as Vercel AI SDK tools), use `generateText` with `stopWhen: stepCountIs(15)` as the agent loop, keep the same skills-style system prompt. Path A is reversible and does not block the user from revisiting Path B later when SDK constraints relax.

### 9.2 Long-Term Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anthropic ships a breaking change to SDK API | medium | Pin specific SDK version; monitor CHANGELOG; update proactively |
| cli.js regresses on CJK encoding | low | Phase 3 verification includes CJK round-trip checks; can pin to a known-good version |
| OpenRouter ceases operation or changes API | very low | Profile system lets users switch to Anthropic Direct or any other Anthropic-compatible provider with zero code change |
| SDK deprecates the embed/subprocess pattern | low | Use `pathToClaudeCodeExecutable` explicitly rather than relying on `./embed` resolution; the explicit path is a stable contract |
| Obsidian policy or platform change forbidding subprocess | very low | Many community plugins already use `child_process`; no signals of impending restriction |
| Plugin distribution size becomes a rejection reason in community plugin review | low-medium | Size is within Obsidian's historical tolerance for AI plugins; user has explicitly accepted the trade-off; worst case is manual distribution outside the community directory |

### 9.3 Capabilities Preserved Through the Migration

The migration intentionally preserves:

- All existing UI components (`SearchResultView`, `StepList`, `SearchModal`, dashboard, mermaid visualizations, all `ai-analysis-sections` components)
- The HITL plan-review modal and its interaction model
- The full six-provider abstraction in `MultiProviderChatService` (used by chat mode, unaffected)
- SQLite-based FTS and vector search (used as backends for vault MCP tools)
- Embedding pipeline, hub discovery, orphan detection, dashboard analytics (all orthogonal to vault search agent)
- The dashboard-facing subset of `search-graph-inspector` tools (key nodes, hub graph, graph traversal for visualization — retained because they serve a different use case than recon)
- Chat mode on mobile (mobile vault search is disabled, but mobile chat still works via Vercel AI SDK)

---

## 10. Code Impact Summary

| Area | Before (lines) | After (lines) | Delta |
|---|---:|---:|---:|
| `VaultSearchAgent.ts` outer shell | 320 | 100 | −220 |
| `AgentLoop.ts` + `tool-executor.ts` | 418 | 0 | −418 |
| `vault/phases/*` (dead + active) | ~1647 | ~200 (only report.ts + a shell for submit_plan) | −1447 |
| `search-graph-inspector` recon subset | ~500 | 0 | −500 |
| New `VaultSearchAgentSDK.ts` | 0 | ~200 | +200 |
| New vault MCP tools | 0 | ~500 | +500 |
| New Profile system | 0 | ~450 | +450 |
| New system prompt playbook | 0 | ~80 (markdown) | +80 |
| **Net** | **~2885** | **~1530** | **−1355** |

(Line counts are approximate. Actual counts will be in the Phase 2 plan.)

The net reduction is ~47%. More importantly, the deleted code is the hardest-to-maintain part of the codebase (hand-rolled agent orchestration, multi-phase state machines, stream merging with timeouts and abort handling). The added code is the easiest-to-maintain part (MCP tool wrappers, profile CRUD, settings UI). The maintenance-weighted reduction is much larger than the raw line delta suggests.

---

## 11. Open Decisions

The following items need explicit resolution before implementation begins. Most are settled by prior discussion; listed here for completeness.

| # | Decision | Default / proposal | Owner |
|---|---|---|---|
| 1 | Overall direction: Path B (Claude Agent SDK) | **Proceed**, contingent on spike success | User: confirmed |
| 2 | Mobile vault search support | **Disabled**; feature hidden on `Platform.isMobile` | User: confirmed |
| 3 | Profile presets to ship | **Anthropic Direct, OpenRouter, LiteLLM Self-Hosted** (plus Custom) | User: confirmed |
| 4 | Core directory strategy | **Dynamic discovery via `vault_list_folders` as first tool call; optional pinned scopes in settings with empty default** | User: confirmed (no hardcoding) |
| 5 | Benchmark queries in product | **Not shipped**; generic verification in Phase 3 only | User: confirmed |
| 6 | API key UX | Profile-level fields; user provides their own; no plugin-bundled keys | Proposed |
| 7 | Bundle strategy | **Direct bundling** (~50 MB) rather than on-demand download | User: confirmed (indifferent to size) |
| 8 | Phase 0 execution | **Proceed first**, before spike | Proposed |
| 9 | Vault access strategy | **Vault-API-mediated** (custom MCP tools), not filesystem-mediated | Proposed (for Obsidian-native signal access) |
| 10 | Fallback plan if spike fails | Path A (Vercel AI SDK + Glob/Grep/Read tools + same playbook prompt) | Proposed |
| 11 | Version pinning strategy | Pin to a known-good SDK version in `package.json`; bump manually | Proposed |
| 12 | Provider-mcp-skills-design interaction | This design is complementary to `2026-04-10-provider-mcp-skills-design.md`; vault search takes a specialized path, other features follow the general spec | Proposed |

---

## Appendix A: Verification Evidence

This section records where the factual claims in this design came from.

**Claim**: `@anthropic-ai/claude-agent-sdk` bundles `cli.js` inside the npm package.
**Evidence**: `npm pack @anthropic-ai/claude-agent-sdk` produces a tarball containing `cli.js` (13.5 MB) alongside `sdk.mjs` and other entry points. `package.json`'s `files` array explicitly lists `cli.js`.

**Claim**: `cli.js` is a Node JavaScript bundle, not a native binary.
**Evidence**: First line of cli.js is `#!/usr/bin/env node`, followed by minified JavaScript. It is executed via `node cli.js` (implicitly via shebang + chmod, or explicitly via `node` invocation).

**Claim**: SDK spawns `cli.js` via `child_process.spawn`.
**Evidence**: `sdk.mjs` imports `spawn` from `child_process`. Source includes:
```
let cliPath = options.pathToClaudeCodeExecutable;
if (!cliPath) {
  const sdkFileUrl = fileURLToPath(import.meta.url);
  const req = createRequire(sdkFileUrl);
  try { cliPath = req.resolve("./cli.js"); } catch { throw Error(...); }
}
```

**Claim**: cli.js respects `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, etc.
**Evidence**: grep of cli.js yields occurrence counts: `ANTHROPIC_BASE_URL` (20), `ANTHROPIC_AUTH_TOKEN` (9), `ANTHROPIC_DEFAULT_OPUS_MODEL` (12), `ANTHROPIC_DEFAULT_SONNET_MODEL` (12), `ANTHROPIC_DEFAULT_HAIKU_MODEL` (16), `ANTHROPIC_SMALL_FAST_MODEL` (13).

**Claim**: cli.js has explicit first-party-detection code and tolerates non-first-party endpoints.
**Evidence**: cli.js contains a function `nH()` that checks whether `new URL(process.env.ANTHROPIC_BASE_URL).host === "api.anthropic.com"`. Log messages show optimizations like "ToolSearch:optimistic" being conditionally disabled when the base URL is not first-party, confirming graceful degradation rather than rejection. There is also a `ccrBaseUrl` code path named after the community `claude-code-router` project.

**Claim**: OpenRouter provides an Anthropic-compatible `/v1/messages` endpoint with Claude Code integration.
**Evidence**: OpenRouter's documentation at `https://openrouter.ai/docs/guides/coding-agents/claude-code-integration` specifies the base URL (`https://openrouter.ai/api`), the three required environment variables, and the per-slot model mapping pattern. OpenRouter refers to the compatibility layer as "Anthropic Skin". Their API reference at `/docs/api/api-reference/anthropic-messages/create-messages` documents the endpoint as accepting the Anthropic MessagesRequest schema.

**Claim**: OpenRouter's caveat about first-party-only guarantees.
**Evidence**: Quoted directly from the Claude Code integration guide: *"Claude Code with OpenRouter is only guaranteed to work with the Anthropic first-party provider."*

**Claim**: Anthropic's agentic tool use approach outperforms vector RAG on personal corpora.
**Evidence**: Amazon Science paper (Feb 2026) reporting agentic Glob/Grep/Read tool use achieving >90% of vector-RAG retrieval quality with zero vector index; multiple public statements from Anthropic engineering about Claude Code's no-index design outperforming alternatives during development.

**Claim**: The current pipeline's recall issue is caused by the 8-layer signal loss chain.
**Evidence**: Source code inspection of `src/service/agents/vault/phases/*.ts`, `src/service/agents/core/AgentLoop.ts`, and associated prompts in `templates/prompts/*.md`. Each layer's loss mechanism was traced back to specific code lines. The chain is reproducible by running the current pipeline on any reflective query over a test vault.

---

## Appendix B: Relationship to Other Design Documents

- **`2026-04-10-provider-mcp-skills-design.md`** (Approved): governs the plugin's general provider abstraction for chat mode, embedding, and other features. Defines the three-tier provider architecture (first-class, gateway, OpenAI-compatible), model registry format, skill system, and usage dashboard. This design is **not superseded**. Vault search takes a different path because its use case (agentic tool use with multi-step reasoning) benefits from specialized infrastructure (Claude Agent SDK + Profile system) that would be overkill for simpler use cases.

- **`2026-04-10-search-inspector-tools-overhaul-design.md`** (was: Approved): proposed a set of in-place fixes to the `search-graph-inspector` tool suite, including typed params, limit semantic unification, tool description rewrites, and `find_path` restructuring. **This design supersedes it.** Most of the tools that would have been cleaned up are instead deleted in Phase 4 because the new agent pipeline uses a smaller, more focused tool set (see §2.4). The remaining dashboard-facing tools continue unchanged; they do not need the proposed overhaul because they are already stable for their actual use case.

- **`2026-04-10-search-inspector-tools-overhaul.md` (plan)**: the implementation plan for the overhaul above. **This design supersedes it.** The plan document will be archived at the start of Phase 4 with a note pointing at this design.

- **`2026-04-08-ai-search-ui-step-based-refactor.md` (plan)**: the step-based UI refactor currently in progress. **Unaffected**. The UI components being refactored are consumers of `LLMStreamEvent`s, which the new SDK adapter will continue to emit in the same shape. The migration is transparent to UI components.

---

## Appendix C: Phase 0 Immediate Next Steps

Independent of the decisions still outstanding on the larger architecture, Phase 0 (debug log infrastructure) can begin immediately. Its scope is listed here as a bridge from this design spec to a Phase 0 implementation plan document, which will be written separately using the `superpowers:writing-plans` skill.

Phase 0 deliverables:

1. Five new `pk-debug` event types defined in `src/core/providers/types.ts`
2. `AgentLoop.ts` emits these events at appropriate points in each iteration
3. `searchSessionStore` gains a `debugRounds: DebugRound[]` field and an `appendDebugRound` action
4. `useSearchSession.routeEvent` routes the new `pk-debug` events to `appendDebugRound` based on `debugName`
5. A new `formatDebugLog(session)` function serializes `debugRounds` into markdown
6. A "Copy Debug Log" button in the steps panel (or a new debug drawer) calls `formatDebugLog` and writes to clipboard
7. `plugin.settings.enableDevTools` gates the accumulation and button visibility
8. The accumulation is capped at a configurable maximum (e.g., 200 rounds) to prevent unbounded memory growth

This work is entirely within the existing codebase; it does not touch the SDK, the Profile system, or the agent loop itself. It can ship independently and is safe to commit before the spike.

---

**End of design document.**
