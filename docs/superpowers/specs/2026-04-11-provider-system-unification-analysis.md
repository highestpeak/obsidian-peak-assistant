# Provider System Unification Analysis

> **Date**: 2026-04-11
> **Status**: Analysis (pre-decision)
> **Purpose**: Integrate the Claude Agent SDK migration (`2026-04-11-vault-search-agent-sdk-migration-design.md`) with the existing provider/MCP/skill design (`2026-04-10-provider-mcp-skills-design.md`) into a single coherent provider architecture
> **Decision required**: Whether to update the existing spec in place, write a v2 spec, or keep them as layered documents

---

## Executive Summary

The vault search migration (dated 2026-04-11) introduces a second provider abstraction — environment-variable-driven "Profiles" for Claude Agent SDK — that operates in parallel with the existing Vercel AI SDK-based provider abstraction from `2026-04-10-provider-mcp-skills-design.md`. Left unaddressed, the plugin would end up with two disconnected provider configuration surfaces that users must maintain separately.

This analysis proposes a unified **Profile Registry** that acts as the single source of truth for provider configuration across all plugin features. Each profile declares its capabilities (which subsystems it supports), and at call time the plugin materializes the profile into either a Vercel AI SDK adapter instance or a set of Agent SDK environment variables, depending on what the caller needs.

**Key outcomes of this unification**:

1. **Users configure providers once**. Chat, vault search, embedding, and skills all read from the same profile registry.
2. **Agent-SDK compatibility becomes a profile capability flag**, not a separate configuration namespace. Users see at a glance which profiles can drive vault search.
3. **The existing spec's Module 1 (Model Registry), Module 5 (Usage Tracking), Module 6 (Gemini Embedding), and Module 7 (Dev Toolchain) remain unchanged.** They are orthogonal to the SDK migration.
4. **The existing spec's Module 2 (OpenAI-compatible provider) and Module 3 (MCP Client) gain a second consumer** (Agent SDK) but their core design is preserved.
5. **The existing spec's Module 4 (Skill System) needs the most rework**, because skills currently bind to `PeakAgentConfig` which the vault search migration deletes. Skills must be re-abstracted over a runtime-selectable executor (Agent SDK or Vercel AI SDK agent loop) based on skill declared type.
6. **The three-tier provider architecture (first-class / gateway / OpenAI-compatible) remains valid but gets augmented with an orthogonal capability dimension**: "Anthropic-format compatible". Not all providers in all tiers have this capability.

---

## 1. What the Existing Spec Covers

Brief recap for cross-reference. The existing `2026-04-10-provider-mcp-skills-design.md` ("Approved" status) covers:

| Module | Content | Status after migration |
|---|---|---|
| **1. Model Registry** | Per-provider JSON files with pricing, capabilities, token limits; self-maintained + subscription sync | **Unchanged.** Still serves Vercel AI SDK providers and displays model metadata in Profile UI. |
| **2. OpenAI-Compatible Provider** | `OpenAICompatibleChatService`, `createOpenAICompatible()`, presets for LM Studio / LiteLLM / vLLM, settings UI | **Augmented.** Still the primary way to consume OpenAI-compatible backends for chat. A subset of these (those whose backend has Anthropic compat, e.g. LiteLLM with Anthropic endpoint) also become Agent-SDK-compatible profiles. |
| **3. MCP Client Integration** | `MCPClientManager`, stdio + HTTP transport, `MCPToolAdapter`, tool gating | **Coexists with Agent SDK.** For chat mode and skill execution on Vercel AI SDK side, the plugin still needs its own MCP client. For vault search via Agent SDK, the SDK's built-in MCP client handles both in-process custom tools and external MCP servers passed via `options.mcpServers`. Two MCP clients exist but serve different sides. |
| **4. Skill System** | Markdown-based skill definitions with `simple` + `pipeline` types, `SkillExecutor` binding to `PeakAgentConfig`, skill store | **Requires significant rework.** See §6. |
| **5. Usage Tracking** | `usage_log` SQLite table, `UsageLogger`, per-message cost, dashboard | **Augmented.** Usage events now come from two sources (Vercel AI SDK adapter finish events and Agent SDK message stream). Both must be funneled into the same `UsageLogger`. |
| **6. Gemini Embedding** | Add embedding support to `gemini.ts` provider | **Unchanged.** Embedding is orthogonal to agent runtime. |
| **7. Dev Toolchain** | `.cursor/mcp.json`, `.claude/settings.json`, recommended MCP servers | **Unchanged.** Completely orthogonal. |

---

## 2. What the Migration Spec Introduces

From `2026-04-11-vault-search-agent-sdk-migration-design.md`:

- **Claude Agent SDK as the vault search runtime.** Replaces hand-rolled `AgentLoop.ts` + classify/decompose/recon pipeline.
- **Profile system** for environment-variable-driven provider switching. Three default presets: Anthropic Direct, OpenRouter, LiteLLM.
- **In-process vault MCP tools** via `createSdkMcpServer`. Obsidian Vault API, metadata cache, SQLite all callable from the agent subprocess.
- **Per-slot model mapping** (`ANTHROPIC_DEFAULT_OPUS_MODEL` / `_SONNET_MODEL` / `_HAIKU_MODEL`) for cost optimization within a single agent run.
- **Desktop-only** for vault search feature (`Platform.isMobile` gates it off).
- **Dynamic folder discovery** as the default for reflective queries; pinned scopes as opt-in power-user feature.

---

## 3. The Structural Conflict

The two specs propose **two different provider abstractions**:

### Existing spec's abstraction
```
Provider (first-class / gateway / OpenAI-compatible)
  - adapter type: @ai-sdk/anthropic | @ai-sdk/openai | @ai-sdk/google | ollama | ...
  - config: baseUrl, apiKey, available models
  - consumed by: MultiProviderChatService → every feature (chat, vault search, embedding, skills)
```

### Migration spec's abstraction
```
SdkProfile
  - env vars: ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN,
              ANTHROPIC_DEFAULT_OPUS_MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL, ...
  - consumed by: Claude Agent SDK subprocess → vault search only
```

Before the migration, the existing spec's `MultiProviderChatService` is the single source of truth and all features go through it. After the migration, vault search does *not* go through `MultiProviderChatService`; it goes through `VaultSearchAgentSDK` which takes env-var profiles. Chat, embedding, and everything else still go through `MultiProviderChatService`.

**If we stop here**, the plugin has two configuration surfaces: users add providers in the existing "Providers" settings tab, and **separately** add profiles in a "Vault Search Profiles" section. Users who want to use Claude for both chat and vault search would configure Claude twice. This is the bad state that the unification addresses.

---

## 4. The Unified Profile Registry

The proposal: **merge both abstractions into a single `Profile` concept that materializes differently at call time depending on which runtime needs it.**

### 4.1 Profile Data Model

A `Profile` describes a provider configuration at a level of abstraction above both Vercel AI SDK adapters and Agent SDK env vars. At call time, the Profile is materialized into the specific form that the caller needs.

```
Profile
  id                unique
  name              user-facing label
  kind              enum of known provider types (see §4.2)
  enabled           boolean

  // Credentials (shared across both runtimes)
  baseUrl           string (normalized to the provider's HTTP endpoint)
  apiKey            string | null
  authToken         string | null   // some providers use Bearer, some use x-api-key

  // Model selection
  primaryModel      string          // default for main tasks
  fastModel         string          // default for subagent / cheap tasks
  embeddingModel    string | null   // if provider supports embedding

  // Capabilities (what subsystems this profile supports)
  capabilities:
    chat                     boolean
    embedding                boolean
    anthropicFormatCompat    boolean   // critical flag for vault search
    toolUse                  boolean
    streaming                boolean
    vision                   boolean
    reasoning                boolean
    promptCaching            boolean
```

### 4.2 Profile Kinds and Their Capabilities

Each Profile has a `kind` that determines how it materializes at call time. The capability matrix:

| Kind | Materializes to (chat) | Materializes to (vault search) | Anthropic-format compat |
|---|---|---|---|
| `anthropic-direct` | `@ai-sdk/anthropic` adapter | Agent SDK env (`ANTHROPIC_BASE_URL=api.anthropic.com`) | ✅ |
| `openai-direct` | `@ai-sdk/openai` adapter | ❌ (not usable for vault search; fallback only) | ❌ |
| `gemini-direct` | `@ai-sdk/google` adapter | ❌ | ❌ |
| `perplexity` | `@ai-sdk/perplexity` adapter | ❌ | ❌ |
| `ollama-direct` | `ollama-ai-provider-v2` adapter | ❌ | ❌ |
| `openrouter` | `@openrouter/ai-sdk-provider` (chat-completions format) | Agent SDK env with `ANTHROPIC_BASE_URL=openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN=<key>`, empty `ANTHROPIC_API_KEY` | ✅ |
| `litellm-proxy` | `createOpenAICompatible()` pointing at user's LiteLLM | Agent SDK env with `ANTHROPIC_BASE_URL=<litellm-anthropic-endpoint>` IF LiteLLM is configured with Anthropic passthrough | ✅ (conditional on LiteLLM config) |
| `lmstudio-preset` | `createOpenAICompatible()` pointing at LM Studio | ❌ (LM Studio does not expose Anthropic format) | ❌ |
| `vllm-preset` | `createOpenAICompatible()` | ❌ | ❌ |
| `openai-compatible-custom` | `createOpenAICompatible()` | Conditional: only if `baseUrl` points at an Anthropic-compatible endpoint (user-declared flag) | Conditional |

**Key observation**: `anthropicFormatCompat` is a capability flag that cuts across the existing spec's three-tier architecture. It is orthogonal to "first-class / gateway / OpenAI-compatible". A gateway provider (OpenRouter) has it; a first-class provider (Anthropic) has it; an OpenAI-compatible provider (LiteLLM with Anthropic config) has it; but other first-class providers (OpenAI, Gemini) do not.

### 4.3 Runtime Materialization

At call time, the Profile is materialized into the specific form the runtime needs.

**For Vercel AI SDK runtime (chat, embedding, existing features):**

```
materializeToVercelAdapter(profile: Profile) → LanguageModel
  switch profile.kind:
    case 'anthropic-direct': return createAnthropic({ apiKey: profile.apiKey })(profile.primaryModel)
    case 'openai-direct':    return createOpenAI({ apiKey: profile.apiKey })(profile.primaryModel)
    case 'gemini-direct':    return createGoogle({ apiKey: profile.apiKey })(profile.primaryModel)
    case 'openrouter':       return createOpenRouter({ apiKey: profile.apiKey })(profile.primaryModel)
    case 'litellm-proxy':
    case 'lmstudio-preset':
    case 'openai-compatible-custom':
                             return createOpenAICompatible({ baseUrl, apiKey })(profile.primaryModel)
    ... etc
```

This is essentially what the existing `MultiProviderChatService` factory already does — the Profile abstraction is a slightly different name for it, so migration is small.

**For Agent SDK runtime (vault search):**

```
materializeToAgentSdkEnv(profile: Profile) → Record<string, string>
  require: profile.capabilities.anthropicFormatCompat === true
  require: profile.enabled

  switch profile.kind:
    case 'anthropic-direct':
      return {
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        ANTHROPIC_API_KEY:  profile.apiKey,
        ANTHROPIC_DEFAULT_OPUS_MODEL:  profile.primaryModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
      }
    case 'openrouter':
      return {
        ANTHROPIC_BASE_URL:   'https://openrouter.ai/api',
        ANTHROPIC_API_KEY:    '',                 // must be explicitly empty
        ANTHROPIC_AUTH_TOKEN: profile.authToken ?? profile.apiKey,
        ANTHROPIC_DEFAULT_OPUS_MODEL:  profile.primaryModel,   // e.g. 'anthropic/claude-opus-4-6' or 'openai/gpt-5'
        ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
      }
    case 'litellm-proxy':
      return {
        ANTHROPIC_BASE_URL:   profile.baseUrl,    // must be the LiteLLM Anthropic endpoint
        ANTHROPIC_API_KEY:    profile.apiKey ?? '',
        ANTHROPIC_DEFAULT_OPUS_MODEL:  profile.primaryModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
      }
    default:
      throw new Error(`Profile kind '${profile.kind}' is not Anthropic-format compatible`)
```

**Key design property**: The Profile is the single source of truth. The two materialization functions are pure projections of it. Users never see or configure env vars directly — they configure a Profile, and the plugin projects it into whichever runtime needs it.

### 4.4 Feature → Profile Routing

Each plugin feature selects a Profile at call time. The selection logic:

```
Feature: Vault Search
  requires: anthropicFormatCompat=true, toolUse=true
  selection: user-specified active profile OR default profile
  if no compatible profile: show error "Vault Search requires an Anthropic-format-compatible provider"

Feature: Chat Mode
  requires: chat=true
  selection: user-specified active profile OR default profile
  any profile kind allowed

Feature: Embedding
  requires: embedding=true
  selection: user-specified embedding profile (usually different from chat profile)

Feature: Skill Execution
  requires: depends on skill declaration
  selection: skill may specify a preferred profile or fall back to chat's active profile
```

**Default active profiles**: On first install, the plugin has no profiles. On first access to any feature, the plugin prompts the user to add their first profile. A suggested onboarding flow: "Which provider do you want to use?" → [Anthropic Direct] [OpenRouter] [Other] — based on choice, guide them through the minimum config.

---

## 5. Per-Module Impact Analysis

Each module of the existing spec is examined for impact.

### 5.1 Module 1 — Model Registry

**Impact**: None directly. Minor extension.

The JSON registry format (per-provider, with capabilities and pricing) is unchanged. Profile UI displays model metadata from the registry. For Agent-SDK-via-OpenRouter profiles, the registry can optionally include the OpenRouter-specific model slugs (e.g., `anthropic/claude-opus-4-6`, `openai/gpt-5`), fetched dynamically from `https://openrouter.ai/api/v1/models`.

**Suggested addition to `_schema.json`**: an optional `anthropicFormatSupported: boolean` field at the provider level, marking whether this provider's backend exposes an Anthropic-compatible endpoint.

**Change size**: Trivial.

### 5.2 Module 2 — OpenAI-Compatible Provider

**Impact**: Augmented with Anthropic-format awareness.

The `OpenAICompatibleChatService` continues to handle chat mode for LM Studio / LiteLLM / vLLM / custom endpoints. But the configuration form needs a new field:

```
+-- Custom Endpoint ----------------------------------+
|  Name: [My LiteLLM]                                 |
|  Base URL: [http://localhost:4000/v1]               |
|  API Key: [****]                                    |
|                                                      |
|  Supports Anthropic format? [ ] Yes  [x] No         |
|  (If yes, will be available for Vault Search)       |
|                                                      |
|  Anthropic endpoint path: [/anthropic]              |
|  (optional, if different from /v1)                  |
+------------------------------------------------------+
```

This exposes `anthropicFormatCompat` as a user-declared flag for custom endpoints. The plugin cannot reliably auto-detect whether an arbitrary OpenAI-compatible endpoint also speaks Anthropic format — the user must declare it. Presets (LM Studio, vLLM) default to `false`; LiteLLM defaults to `true` with a note that the user must configure their LiteLLM to expose the Anthropic endpoint.

**Change size**: Small. One field in the UI, one boolean in the data model, one conditional in the Profile capability calculation.

### 5.3 Module 3 — MCP Client Integration

**Impact**: Two MCP clients coexist.

The existing spec's `MCPClientManager` is designed to feed external MCP servers into the Vercel-AI-SDK-based agent loop (`PeakAgentLoop`). This is still needed for any skill or feature running on the Vercel AI SDK side.

The Agent SDK has its **own** MCP client built in. It accepts:
- **In-process MCP servers** via `createSdkMcpServer()` + `tool()` — used for vault MCP tools (§4.4 of migration spec).
- **External MCP servers** via `options.mcpServers: { [name]: { command, args, env } | { transport: 'http', url } }` — Same config format as the existing spec.

**Integration opportunity**: The same `MCPServerConfig` format can feed both clients. If a user configures an MCP server in settings, it can be made available to:
- Chat mode via the existing `MCPClientManager`
- Vault search via the Agent SDK's `options.mcpServers`

In fact, **the Agent SDK's external MCP support is simpler and more reliable than hand-rolling one** (the existing spec's Module 3 pre-requisite is a technical spike on `@modelcontextprotocol/sdk` bundling with esbuild, which the Agent SDK has already solved internally). If vault search is the primary use case for external MCP integration, we could potentially **defer or simplify Module 3** by letting the Agent SDK handle external MCP for vault search, and adding MCP to chat mode later when there's a clear need.

**Change recommendation**: Keep Module 3's design as planned, but note that **the Agent SDK provides an alternative MCP path for vault search**, and treat chat-mode MCP as a separate, lower-priority track.

**Change size**: Small (add a note). Or medium, if we decide to re-scope chat-mode MCP.

### 5.4 Module 4 — Skill System (LARGEST IMPACT)

**Impact**: Needs rework. Skills currently bind to `PeakAgentConfig`, which depends on the hand-rolled `AgentLoop.ts` that the vault search migration deletes.

The existing spec's `SkillExecutor` translates a `SkillDefinition` into a `PeakAgentConfig` and runs it through `runAgentLoop()`. After the migration, vault search no longer uses `runAgentLoop()`; it uses the Agent SDK's internal loop. But **other skills** — those that run on chat mode, document processing, etc. — still need an executor.

Three options:

**Option A — Dual executor, skill declares runtime.**
Each skill's frontmatter declares `runtime: 'agent-sdk' | 'vercel-ai-sdk'`. The `SkillExecutor` dispatches to the appropriate backend. Skills that want filesystem-like agent behavior (long multi-step reasoning, tool orchestration) use `agent-sdk`. Skills that want simple single-turn or short-chain LLM calls use `vercel-ai-sdk`. The existing `simple` / `pipeline` skill types become orthogonal to the runtime choice.

**Option B — All skills run on Agent SDK.**
Delete the `vercel-ai-sdk`-based skill execution path entirely. All skills go through Agent SDK. Simple skills become a degenerate case (zero tool use, single turn). Pipeline skills become multi-turn agent sessions with explicit phase transitions. This is the cleanest but forces Agent SDK as a hard dependency for any skill, which means skills also become desktop-only and Anthropic-format-only.

**Option C — All skills run on Vercel AI SDK.**
Keep the existing spec's skill system unchanged. Vault search is a separate beast that doesn't go through the skill system. Skills remain simpler Vercel-AI-SDK-based workflows. This is backward-compatible but loses the opportunity to leverage Agent SDK infrastructure for more ambitious skills.

**Recommendation**: **Option A (dual executor)**. It preserves the existing skill system's flexibility, allows mobile-compatible skills to run on the Vercel side, and lets power-user skills leverage the Agent SDK's sophistication when desktop-Anthropic conditions are met. Implementation effort is roughly "one new `SkillExecutor` variant plus a runtime field in the frontmatter".

**Note on Claude Code skills**: Claude Code (and therefore the Agent SDK) has its own skill format at `.claude/skills/*/SKILL.md`. If the plugin's skill format is close enough, it could potentially load from both locations. But the plugin's skill format (from the existing spec) has richer metadata (`type: simple | pipeline`, `inputs`, `phases`, `outputTemplate`) than Claude Code's native format. Unification of formats is a separate project; initial implementation should keep the two formats distinct and translate at execution time.

**Change size**: Medium. New `AgentSdkSkillExecutor` variant, runtime field in frontmatter, dispatcher in `SkillExecutor`, documentation update. Existing Vercel-AI-SDK-based executor remains for mobile and non-Claude skills.

### 5.5 Module 5 — Usage Tracking

**Impact**: New event source.

The existing `UsageLogger` intercepts Vercel AI SDK `finish` events and writes to `usage_log` SQLite table. After the migration, vault search runs via Agent SDK and emits usage via the SDK message stream (`result` message type contains token counts).

**Change**: Extend `UsageLogger` with a second entry point — the adapter layer that translates `SDKMessage` events in `VaultSearchAgentSDK.ts` should call `UsageLogger.record()` on `result` messages, with `usage_type: 'vault_search'` and the profile's ID as the provider.

**Data model extension**: Add a `profile_id` column (or repurpose `provider` to hold profile IDs instead of provider type names). This lets the dashboard show usage per profile, which is more meaningful than per adapter when multiple profiles exist per provider type.

**Change size**: Small. One new code path, one optional column.

### 5.6 Module 6 — Gemini Embedding

**Impact**: None.

Embedding is orthogonal to agent runtime. Profile can include `embeddingModel` field. At call time, embedding is always materialized to a Vercel AI SDK embedding call (Agent SDK does not handle embedding). If a profile doesn't support embedding (e.g., Anthropic-only), the plugin uses a separate embedding profile configured specifically for embedding work.

**Change recommendation**: Add a "default embedding profile" selector in settings, independent of the chat/vault-search profile selectors.

**Change size**: Trivial.

### 5.7 Module 7 — Dev Toolchain

**Impact**: None. Completely orthogonal.

---

## 6. Revised Three-Tier Architecture Diagram

The existing spec's Section 3.1 shows:

```
+--------------------------------------------------+
|           MultiProviderChatService                |
+-------------+--------------+---------------------+
| First-class |   Gateway    | OpenAI-compatible   |
+-------------+--------------+---------------------+
```

The revised architecture is:

```
+-----------------------------------------------------------+
|                    Profile Registry                        |
|      (Single source of truth for all provider config)     |
+-----+------------+---------------------+-------------------+
      |            |                     |
      |            |                     |
  First-class   Gateway              OpenAI-compatible
  (anthropic,   (openrouter)         (lmstudio, vllm,
   openai,                            litellm, custom)
   gemini,
   ollama,
   perplexity)
      |            |                     |
      +-------+----+---------+-----------+
              |              |
              |              |
       +------v------+  +----v-----------+
       | Vercel AI   |  |  Claude Agent  |
       | SDK Runtime |  |  SDK Runtime   |
       | (chat,      |  |  (vault search)|
       |  embedding, |  |                |
       |  skills)    |  |                |
       +-------------+  +----------------+
              |              |
              v              v
       Any profile      Only profiles with
       allowed          anthropicFormatCompat=true
```

Key differences from the existing diagram:

1. **Profile Registry replaces `MultiProviderChatService` as the top of the hierarchy.** `MultiProviderChatService` becomes a consumer of the Profile Registry, not the owner.
2. **The three tiers (first-class / gateway / OpenAI-compatible) are preserved** as categories of provider kind. They are still meaningful for chat-mode configuration and model registry organization.
3. **Two runtime consumers** sit below the Profile Registry. Vercel AI SDK Runtime (broad but single-turn-ish) accepts any profile. Claude Agent SDK Runtime (specialized for multi-step agentic work) accepts only Anthropic-format-compatible profiles.
4. **The `anthropicFormatCompat` capability flag** is orthogonal to tier membership. Some first-class providers have it (Anthropic), some don't (OpenAI, Gemini). The gateway provider (OpenRouter) has it. Some OpenAI-compatible providers have it (LiteLLM with Anthropic passthrough), others don't (LM Studio, vLLM).

---

## 7. Revised Settings UI

The existing spec's settings UI shows separate sections for built-in providers and custom endpoints. The revised UI consolidates:

```
+-- Providers & Profiles -------------------------------+
|                                                        |
|  Chat & Embedding profiles:                           |
|  +-- My Claude ------------- default for chat ----+   |
|  | Kind: Anthropic Direct                          |   |
|  | Model: claude-opus-4-6                          |   |
|  | Chat ✓   Embedding ✗   Agent SDK ✓              |   |
|  | [Edit] [Remove]                                 |   |
|  +-------------------------------------------------+   |
|                                                        |
|  +-- OpenAI GPT-5 ------- default for embedding --+   |
|  | Kind: OpenAI Direct                             |   |
|  | Model: gpt-5, text-embedding-3-large            |   |
|  | Chat ✓   Embedding ✓   Agent SDK ✗              |   |
|  | [Edit] [Remove]                                 |   |
|  +-------------------------------------------------+   |
|                                                        |
|  +-- OpenRouter -------- default for vault search -+  |
|  | Kind: Gateway (OpenRouter)                      |   |
|  | Primary: anthropic/claude-opus-4-6              |   |
|  | Fast: deepseek/deepseek-v3                      |   |
|  | Chat ✓   Embedding ✗   Agent SDK ✓              |   |
|  | [Edit] [Remove]                                 |   |
|  +-------------------------------------------------+   |
|                                                        |
|  [+ Add Profile]                                       |
|                                                        |
|  Default profile selection:                           |
|    For chat mode:         [ My Claude ▼ ]              |
|    For vault search:      [ OpenRouter ▼ ]             |
|    For embedding:         [ OpenAI GPT-5 ▼ ]           |
|    For skill execution:   [ My Claude ▼ ]              |
|                                                        |
+--------------------------------------------------------+
```

Key UX principles:

- **One list of profiles**, each with capability indicators.
- **Per-feature default profile selectors** at the bottom. Each feature independently chooses its default.
- **Capability badges** (Chat / Embedding / Agent SDK) are computed from the profile's `kind` and (for custom endpoints) user-declared flags.
- **Users cannot enable "Agent SDK" on a profile whose kind does not support it** — the badge is grayed out.
- **When the user selects a profile for vault search, only Agent-SDK-compatible profiles are shown in the dropdown**. This prevents the error case of picking OpenAI direct for vault search.

---

## 8. Revised Implementation Phases

The existing spec's 5-phase plan needs adjustment to fold in the vault search migration.

### Revised Phase Order

| Phase | Source spec | Description | Dependencies |
|---|---|---|---|
| **A** | Migration §8.1 | **Phase 0 — Debug Log Infrastructure.** Add round-level `pk-debug` events, `debugRounds` in store, Copy Debug Log button. | None |
| **B** | Migration §8.2 | **Phase 1 — SDK Spike.** Validate `@anthropic-ai/claude-agent-sdk` in Obsidian plugin host via 7 checks. Go/No-Go. | A |
| **C1** | Existing Module 1 | **Model Registry JSON migration.** Per-provider JSON files. | None (independent) |
| **C2** | Existing Module 6 | **Gemini Embedding.** `@ai-sdk/google` embedding support. | C1 |
| **C3** | Existing Module 5 | **UsageLogger + usage_log table + per-message cost.** | C1 |
| **D1** | **New (unification)** | **Profile Registry data model + migration of existing provider configs.** Unified Profile type, Profile storage, selection defaults. Migrate existing Vercel-AI-SDK provider settings to Profile format. | C1, C3 |
| **D2** | Existing Module 2 (augmented) | **OpenAI-Compatible provider** with `anthropicFormatCompat` flag. | D1 |
| **D3** | **New (unification)** | **Profile settings UI** (single list, capability badges, per-feature defaults). Replaces parts of existing Section 5.5. | D1, D2 |
| **D4** | Existing Module 5 (extended) | **Usage Dashboard tab.** | C3, D1 |
| **E** | Migration §8.3 | **Phase 2 — Build new vault search agent shell.** `VaultSearchAgentSDK`, vault MCP tools, system prompt playbook. Uses profile materialization. | B (spike passed), D1 |
| **F** | Migration §8.4 | **Phase 3 — Verification.** Generic verification of the new vault search pipeline. | E |
| **G** | Migration §8.5 | **Phase 4 — Delete old vault search pipeline.** | F |
| **H1** | Existing Module 3 PRE | **MCP client spike** (now lower priority — can defer if Agent SDK's internal MCP covers the main use case). | None |
| **H2** | Existing Module 3a-c | **MCP client for chat mode.** Only needed if chat mode has concrete MCP use cases. | H1 |
| **I1** | Existing Module 4a | **Skill format + SkillRegistry.** Scans `_skills/` folder, parses markdown frontmatter. | D1 |
| **I2** | **New (unification)** | **SkillExecutor with runtime dispatcher.** Vercel AI SDK executor and Agent SDK executor variants. Skill frontmatter declares `runtime`. | E, I1 |
| **I3** | Existing Module 4b-c | **Built-in skill migration + skill selection UX.** | I2 |
| **I4** | Existing Module 4d | **Skill Store server + client.** | I3 |
| **J** | Existing Module 7 | **Dev Toolchain** (MCP config files, docs). | None |

### Dependency Graph

```
A ──> B
C1 ──> C2
C1 ──> C3
C1 + C3 ──> D1 ──> D2 ──> D3 ──> D4

B + D1 ──> E ──> F ──> G

H1 ──> H2  (independent, lower priority)

D1 ──> I1 ──> I2 ──> I3 ──> I4
                     ↑
                     └── E (for Agent SDK executor variant)

J (independent, anytime)
```

### What Gets Deferred / Reduced Scope

- **Existing Module 3 (MCP Client)** becomes lower priority. The Agent SDK already handles vault search's MCP needs. Chat-mode MCP is nice to have but not urgent.
- **Existing Section 3.2 System Integration Map** gets superseded by the revised architecture diagram in §6 above.
- **Existing Section 7.2 `SkillExecutor` binding to `PeakAgentConfig`** gets superseded by the dual-executor design.

### What Gets Preserved Untouched

- Model Registry (Module 1) format, sync, `_defaults.json`.
- Skill file format (Section 7.1) — markdown frontmatter structure.
- Skill Store design (Section 7.4) — server API and UI.
- Usage Dashboard (Section 8.4) — presentation layer.
- Dev Toolchain (Module 7) — entire module.

---

## 9. Conflict Resolution Summary

| Conflict | Resolution |
|---|---|
| Two provider abstractions (Vercel AI SDK adapters vs SDK Profiles) | Unified `Profile` type with two materialization functions (one per runtime); profile is single source of truth |
| Where to configure Claude for vault search vs chat | Single Profile registry; user configures Claude once; vault search and chat both read from it |
| Which runtime runs skills | Skill frontmatter declares `runtime`; dual executor dispatches accordingly |
| Two MCP clients (existing `MCPClientManager` vs Agent SDK internal) | Coexist; Agent SDK handles vault search MCP; existing `MCPClientManager` handles chat MCP; share `MCPServerConfig` format |
| Usage tracking from two sources | `UsageLogger` exposes `record()` as a shared entry point; both runtimes call it |
| Model registry coverage | Registry serves both runtimes; registry entries get optional `anthropicFormatSupported` flag for Agent SDK routing hints |
| Tier architecture (first-class / gateway / OpenAI-compat) vs Agent-SDK routing | Tier is about adapter type; `anthropicFormatCompat` is an orthogonal capability flag; both are valid classifications of a profile |

---

## 10. Non-Goals for This Unification

To prevent scope creep, the following are explicitly not part of this unification:

- **Merging the plugin's skill format with Claude Code's `.claude/skills/SKILL.md` format.** Separate project, future work.
- **Replacing `MultiProviderChatService` entirely.** The chat path continues to use Vercel AI SDK. Only the provider config layer is unified.
- **Auto-detecting Anthropic-format compatibility for arbitrary custom endpoints.** User-declared flag. We don't probe endpoints automatically.
- **Cross-profile cost optimization** (e.g., "use cheap profile for fast tasks automatically"). Within a profile, Opus-slot vs Haiku-slot mapping is supported. Cross-profile routing is a separate feature.
- **Profile sharing / import / export across vaults.** Valuable but orthogonal.
- **Changing the `usage_log` schema substantially.** Only additive changes (new column for profile_id or equivalent).

---

## 11. Recommendation for the Existing Spec Document

Three options for how to apply this analysis to `2026-04-10-provider-mcp-skills-design.md`:

### Option 1 — Edit in place with revision markers

Update the existing spec directly. Add a "Revision History" section at the top noting 2026-04-11 changes. Replace affected sections (3.1 Three-Tier Architecture, 3.2 System Integration Map, 5 OpenAI-Compatible Provider, 7 Skill System, 8 Usage Tracking, 11 Implementation Phases) with their revised versions. Leave unchanged sections as-is.

**Pros**: Single document to reference; all decisions in one place.
**Cons**: Large edit; risk of breaking approved decisions if done carelessly; the spec's "Approved" status becomes ambiguous (approved + revised is a third state).

### Option 2 — Write a v2 spec that supersedes v1

Create `2026-04-11-provider-system-v2-design.md` as the new authoritative spec. Mark the existing spec as "Superseded by v2". v2 is self-contained; it re-uses content from v1 where unchanged but presents a complete, coherent design incorporating the unification.

**Pros**: Clean supersession model; v1 preserved as historical record; v2 is self-contained and easier to review.
**Cons**: Two documents in the spec folder; cross-references get more complex; more duplication of unchanged content.

### Option 3 — Layered documents (current state of this analysis)

Keep the existing spec as-is. Keep the migration spec as-is. This analysis document (the one you are reading) describes the integration. Readers of the existing spec get a pointer to this analysis for the "what changed since 2026-04-10" story.

**Pros**: Zero risk of breaking approved decisions; clear audit trail; minimal edit.
**Cons**: Readers must reconcile three documents to understand the full design; new team members must read in the right order.

### Recommendation

**Option 2 (v2 spec)** is cleanest for long-term maintenance. Write a consolidated `2026-04-11-provider-system-v2-design.md` that incorporates:

- The unchanged parts from `2026-04-10-provider-mcp-skills-design.md` (Modules 1, 2, 3, 5, 6, 7; skill format; store design; dashboard; dev toolchain)
- The unified Profile Registry model from this analysis
- The revised three-tier + capability-flag architecture
- The dual-executor skill system
- The integrated implementation phase ordering

Mark the original spec as "Superseded by 2026-04-11-v2". Keep the migration spec (`2026-04-11-vault-search-agent-sdk-migration-design.md`) as a more detailed technical companion focused specifically on the vault search pipeline internals.

This gives the plugin codebase three documents in logical order:
1. **Provider System v2** — authoritative architecture, read first
2. **Vault Search Agent SDK Migration** — technical detail on vault search pipeline internals
3. **v1 spec** — historical record only

---

## 12. Open Decisions

Before proceeding with any edits, the following need explicit decisions:

| # | Decision | Proposed default |
|---|---|---|
| 1 | Which documentation option (1/2/3 from §11)? | **Option 2** (v2 spec) |
| 2 | Skill executor design (A/B/C from §5.4)? | **Option A** (dual executor, skill declares runtime) |
| 3 | Defer existing Module 3 (chat-mode MCP client)? | **Yes**, lower priority until concrete use case |
| 4 | `MCPServerConfig` shared format between two MCP clients? | **Yes**, same schema |
| 5 | Profile Registry replaces existing `AIServiceSettings.customEndpoints`? | **Yes**, migration in D1 |
| 6 | Anthropic-format detection auto vs manual? | **Manual** (user flag) |
| 7 | Per-feature default profile selectors in settings? | **Yes**, chat / vault search / embedding / skills each have their own |
| 8 | Write v2 spec now, or wait until after Phase 0/1 of migration? | **Write now** (before implementation starts) so implementation matches |

---

## 13. Next Steps

Given the user has stated:
- "减少认知和维护负担" (reduce cognitive and maintenance burden)
- "专注在产品体验设计" (focus on product UX)
- "全球用户" (global users)
- Don't hardcode user-specific vault data
- Profile presets: Anthropic Direct, OpenRouter, LiteLLM only
- Effect is most important
- Not writing code yet; document first

The suggested next step sequence is:

1. **User reviews this analysis document.** Confirm or reject the proposed Profile Registry unification model.
2. **If confirmed, user picks documentation option** (1/2/3 from §11). Recommendation: Option 2.
3. **If Option 2 is chosen**, proceed to write `2026-04-11-provider-system-v2-design.md` incorporating all unified decisions. Archive the v1 spec with a "Superseded" marker.
4. **After v2 is written and reviewed**, proceed to Phase 0 (debug log infrastructure) from the migration spec. This is independent of provider system changes and can start immediately.
5. **After Phase 0 and spike (Phase 1)**, begin Phase D1 (Profile Registry data model) and the rest of the implementation sequence in §8 of this analysis.

---

## Appendix: Documents Referenced

- `docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md` — Existing provider/MCP/skill spec (approved 2026-04-10)
- `docs/superpowers/specs/2026-04-11-vault-search-agent-sdk-migration-design.md` — New migration spec (proposal 2026-04-11)
- `docs/superpowers/plans/2026-04-10-search-inspector-tools-overhaul.md` — Old plan, will be archived
- `docs/superpowers/specs/2026-04-10-search-inspector-tools-overhaul-design.md` — Old design, will be archived

---

**End of unification analysis.**
