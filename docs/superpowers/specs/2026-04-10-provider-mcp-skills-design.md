# Provider / MCP / Skill System Design Spec

> Date: 2026-04-10
> Status: Approved
> Scope: Provider architecture refactor, MCP client integration, Skill system, Usage dashboard

---

## 1. Goals & Non-Goals

### Goals

- **Provider flexibility**: First-class support for major providers (OpenAI, Claude, Gemini, Ollama), gateway support (OpenRouter), and user-defined OpenAI-compatible endpoints (LM Studio, LiteLLM proxy, vLLM, custom)
- **Model registry maintainability**: Centralized, self-maintained JSON model definitions, separated from provider logic code
- **MCP ecosystem access**: Consume external MCP server tools within the existing PeakAgentLoop
- **Skill system**: Markdown-based skill definitions (Prompt + Tools + Config) living in the vault, with an online store for distribution and monetization
- **Usage visibility**: Persistent per-call usage logging with a dashboard aggregated by time, provider, model, and usage type
- **Offline-first**: All core features work without internet; online services (model sync, skill store) are additive
- **Business model**: Subscription-based model registry sync + premium skill store

### Non-Goals

- Migrate to AI SDK `createProviderRegistry` (current factory pattern is sufficient)
- Expose plugin as MCP server (future work, not this iteration)
- Budget control / alerting for usage (overkill for personal knowledge base)
- Data retention / cleanup policies (local storage, keep forever)
- Demote Perplexity to OpenAI-compatible (has dedicated SDK + unique web search capability)

---

## 2. Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Provider tiers | Hybrid: first-class + gateway + OpenAI-compatible | Balance deep integration with user freedom |
| 2 | Model config format | Self-maintained JSON, server-synced | Full control, monetizable sync service |
| 3 | MCP integration | Client-only (Phase A); server exposure later (Phase B) | Minimal invasion, immediate ecosystem access |
| 4 | Skill definition | Prompt + Tools + Config combo in markdown | Natural for Obsidian users, editable, shareable |
| 5 | Usage tracking | Per-call SQLite log + aggregation dashboard | Enough visibility for model selection decisions |
| 6 | Custom endpoint UX | Presets + custom + auto model discovery | Lowers barrier for local LLM users |
| 7 | Skill distribution | Vault markdown + online store (free + premium) | Enables monetization while keeping local-first |
| 8 | Model registry format | Per-provider JSON directory | Clean git diffs, scriptable, data-logic separation |
| 9 | Model sync source | User's own server API (not direct LiteLLM/OpenRouter) | Monetizable, controllable, single source of truth |
| 10 | Data retention | Permanent, no cleanup | Local storage has no pressure |

---

## 3. Architecture Overview

### 3.1 Three-Tier Provider Architecture

```
+--------------------------------------------------+
|           MultiProviderChatService                |
|         (existing factory pattern)                |
+-------------+--------------+---------------------+
| First-class |   Gateway    | OpenAI-compatible    |
|             |              |  (user-defined)      |
+-------------+--------------+---------------------+
| OpenAI      | OpenRouter   | LM Studio (preset)   |
| Claude      |              | LiteLLM Proxy (preset)|
| Gemini      |              | vLLM (preset)        |
| Ollama      |              | Custom endpoint x N  |
| Perplexity  |              |                      |
+-------------+--------------+---------------------+
```

**First-class providers**: Dedicated AI SDK adapter, dedicated model registry JSON, full capability matrix, special features (Claude thinking, Gemini PDF, OpenAI reasoning). Embedding support where available.

**Gateway provider**: OpenRouter retains independent status. Dynamic model discovery via `/api/v1/models` with live pricing and capability data. No local registry needed.

**OpenAI-compatible providers**: Created via AI SDK `createOpenAICompatible()`. User provides name + baseUrl + apiKey. Models auto-discovered via `GET /v1/models`. Multiple instances supported. Presets lower the configuration barrier.

### 3.2 System Integration Map

```
+------------------+     +------------------+     +------------------+
|  Model Registry  |     |   MCP Client     |     |  Skill System    |
|  (JSON files)    |     |   Manager        |     |  (vault markdown)|
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                         |
         v                        v                         v
+--------+---------+     +--------+---------+     +--------+---------+
| ProviderService  |     | MCPToolAdapter   |     | SkillExecutor    |
| Factory          |     | (AgentTool iface)|     | (PeakAgentConfig)|
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                         |
         +----------+-------------+-------------------------+
                    |
                    v
         +------------------+
         |  PeakAgentLoop   |
         |  (ReAct cycle)   |
         +--------+---------+
                  |
                  v
         +------------------+
         |  UsageLogger     |
         |  (SQLite)        |
         +------------------+
```

---

## 4. Module 1: Model Registry

### 4.1 Directory Structure

```
src/core/providers/model-registry/
  +-- _schema.json              # JSON Schema for self-documentation
  +-- _defaults.json            # Fallback capabilities for unknown models
  +-- openai.json
  +-- claude.json
  +-- gemini.json
  +-- perplexity.json
  +-- ollama-families.json      # Model family -> capability/icon mapping
```

### 4.2 JSON Format

```jsonc
{
  "provider": "openai",
  "models": {
    "gpt-4o": {
      "apiModelId": "gpt-4o-2024-11-20",
      "displayName": "GPT-4o",
      "icon": "gpt-4",
      "pricing": {
        "input": "2.50",          // USD per 1M tokens
        "output": "10.00",
        "cachedInput": "1.25"
      },
      "tokenLimits": {
        "maxContext": 128000,
        "maxOutput": 16384
      },
      "capabilities": {
        "vision": true,
        "pdfInput": false,
        "tools": true,
        "webSearch": false,
        "reasoning": false,
        "embedding": false,
        "imageGeneration": false
      },
      "releaseDate": "2024-11-20"
    }
  }
}
```

### 4.3 `ollama-families.json` Format

For Ollama, models are discovered dynamically. This file maps model name patterns to capabilities:

```jsonc
{
  "families": {
    "llama3.1": {
      "icon": "llama-3",
      "maxContext": 131072,
      "capabilities": { "tools": true, "vision": false }
    },
    "gemma2": {
      "icon": "gemma",
      "maxContext": 8192,
      "capabilities": { "tools": false, "vision": false }
    }
  }
}
```

### 4.4 `_defaults.json` Format

Fallback for OpenAI-compatible endpoints where model capabilities are unknown:

```jsonc
{
  "defaultCapabilities": {
    "vision": false,
    "pdfInput": false,
    "tools": false,
    "webSearch": false,
    "reasoning": false,
    "embedding": false
  },
  "defaultTokenLimits": {
    "maxContext": 4096,
    "maxOutput": 2048
  }
}
```

### 4.5 Capability Detection for Custom Endpoints

Three-tier fallback:

1. **Name matching**: If model name matches a known family in any registry JSON (e.g. `llama-3.1-8b` matches `ollama-families.json`), use those capabilities
2. **Defaults**: If no match, use `_defaults.json` conservative values
3. **User override**: User can manually set capabilities per model in settings UI

### 4.6 Migration from `MODEL_ID_MAP`

Each provider's hardcoded `MODEL_ID_MAP` in TypeScript files moves to the corresponding JSON file. Provider class loads JSON at initialization:

```typescript
// Before (in openai.ts)
const MODEL_ID_MAP: Record<string, ModelMapping> = { /* hundreds of lines */ };

// After (in openai.ts)
import openaiRegistry from '../model-registry/openai.json';
// Provider class reads from openaiRegistry.models
```

### 4.7 Sync Mechanism

**Development time**: `scripts/sync-model-registry.ts` pulls from LiteLLM JSON + OpenRouter API, transforms to local format, outputs diff for review.

**Runtime (subscription)**: Plugin calls user's server API (`GET /api/model-registry/latest?provider=openai`) to check for updates. Response is the same JSON format. Merged with local overrides. Requires subscription auth token.

**Offline**: Static JSON files bundled with plugin release always work.

---

## 5. Module 2: OpenAI-Compatible Provider

### 5.1 Implementation

New class `OpenAICompatibleChatService` implementing `LLMProviderService`:

- Uses `createOpenAICompatible()` from AI SDK to create model client
- `getAvailableModels()`: calls `GET {baseUrl}/models`, maps to `ModelMetaData[]`
- Capability detection via the three-tier fallback (Section 4.5)
- Embedding support via `GET {baseUrl}/embeddings` if available

### 5.2 Configuration

```typescript
interface OpenAICompatibleEndpoint {
  id: string;                    // Auto-generated UUID
  name: string;                  // User-facing label, e.g. "My LM Studio"
  icon?: string;                 // Optional custom icon
  baseUrl: string;               // e.g. "http://localhost:1234/v1"
  apiKey?: string;               // Optional (LM Studio doesn't require)
  preset?: 'lmstudio' | 'litellm' | 'vllm' | 'custom';
  modelConfigs?: Record<string, ModelConfig>;  // Per-model overrides
}
```

Settings structure addition:

```typescript
interface AIServiceSettings {
  // ... existing fields ...
  customEndpoints?: OpenAICompatibleEndpoint[];  // NEW
}
```

### 5.3 Presets

Defined in `src/core/constant.ts`:

```typescript
export const OPENAI_COMPATIBLE_PRESETS = {
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    icon: 'lmstudio',
  },
  litellm: {
    name: 'LiteLLM Proxy',
    baseUrl: 'http://localhost:4000/v1',
    icon: 'litellm',
  },
  vllm: {
    name: 'vLLM',
    baseUrl: 'http://localhost:8000/v1',
    icon: 'vllm',
  },
} as const;
```

### 5.4 Factory Registration

```typescript
// In ProviderServiceFactory
for (const endpoint of settings.customEndpoints ?? []) {
  this.register(`custom:${endpoint.id}`, (config) => {
    return new OpenAICompatibleChatService(endpoint);
  });
}
```

### 5.5 Settings UI

In the provider settings panel, below existing providers:

```
+-- Custom Endpoints -----------------------------------+
|                                                        |
|  [+ Add from Preset]  [+ Add Custom]                  |
|                                                        |
|  +-- My LM Studio -------------- * Connected --+      |
|  | Base URL: http://localhost:1234/v1           |      |
|  | Models: 3 discovered                        |      |
|  | [Edit] [Test Connection] [Remove]            |      |
|  +----------------------------------------------+     |
|                                                        |
|  +-- Company LLM Gateway -------- * Connected --+     |
|  | Base URL: https://llm.internal.co/v1         |     |
|  | API Key: ****                                |     |
|  | Models: 12 discovered                        |     |
|  | [Edit] [Test Connection] [Remove]            |     |
|  +----------------------------------------------+     |
+--------------------------------------------------------+
```

"Test Connection" button: calls `GET {baseUrl}/models`, shows success/failure + model count.

---

## 6. Module 3: MCP Client Integration

### 6.1 Pre-Requisite: Technical Spike

Before implementation, verify:

- [ ] `@modelcontextprotocol/sdk` bundles with esbuild CommonJS target
- [ ] stdio transport can spawn child processes from Obsidian's Electron context
- [ ] If SDK fails, assess effort to implement lightweight JSON-RPC client manually

Fallback: HTTP transport only (remote MCP servers), skip stdio support.

### 6.2 Architecture

```
PeakAgentLoop
  +-- Built-in AgentTools (vault search, graph inspector, ...)
  +-- MCP Tools ← MCPToolAdapter ← MCPClientManager ← External MCP Servers
                                                         +-- stdio (local)
                                                         +-- Streamable HTTP (remote)
```

MCP does NOT replace the existing tool system. It injects additional tools.

### 6.3 Core Components

**MCPClientManager** (`src/service/mcp/MCPClientManager.ts`):

```typescript
class MCPClientManager {
  private connections: Map<string, MCPConnection>;

  async connect(config: MCPServerConfig): Promise<void>;
  async disconnect(serverId: string): Promise<void>;
  async discoverTools(serverId: string): Promise<MCPToolDefinition[]>;
  async callTool(serverId: string, toolName: string, args: unknown): Promise<unknown>;
  async getAllToolsAsAgentTools(): Promise<Record<string, AgentTool>>;
  dispose(): void;  // Clean shutdown on plugin unload
}
```

**MCPToolAdapter** (`src/service/mcp/MCPToolAdapter.ts`):

```typescript
function mcpToolToAgentTool(
  serverName: string,
  mcpTool: MCPToolDefinition
): AgentTool {
  return {
    description: mcpTool.description,
    inputSchema: jsonSchemaToZod(mcpTool.inputSchema),  // JSON Schema -> Zod
    execute: async (input) => {
      const result = await mcpClientManager.callTool(serverName, mcpTool.name, input);
      return result;
    },
  };
}
// Tool name: `mcp_${serverName}_${toolName}` to avoid collisions
```

### 6.4 Configuration

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'http';
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http
  url?: string;
  headers?: Record<string, string>;
}
```

Settings structure addition:

```typescript
interface MyPluginSettings {
  // ... existing ...
  mcpServers?: MCPServerConfig[];  // NEW
}
```

### 6.5 Agent Integration

At tool-set construction time:

```typescript
const builtinTools = buildReconTools(/* ... */);
const mcpTools = await mcpClientManager.getAllToolsAsAgentTools();
const allTools = { ...builtinTools, ...mcpTools };
// Pass allTools to PeakAgentConfig
```

Skills can whitelist MCP tools (see Module 4).

### 6.6 Security

- MCP tool results tagged as `source: 'external'` in agent context
- System prompt warns LLM about potential injection from external tool results
- stdio `command` requires explicit user confirmation on first run
- Optional tool approval mode: agent pauses before calling MCP tool for user confirmation

### 6.7 Settings UI

New "MCP Servers" section in settings (either separate tab or section in existing tab):

```
+-- MCP Servers ----------------------------------------+
|                                                        |
|  [+ Add Server]                                        |
|                                                        |
|  +-- GitHub -------------- (green) Connected ---+     |
|  | Transport: stdio                              |     |
|  | Command: npx @modelcontextprotocol/...        |     |
|  | Tools: 12 discovered                          |     |
|  | [Edit] [Disable] [Remove]                     |     |
|  +-----------------------------------------------+    |
|                                                        |
|  +-- Custom API --------- (gray) Disabled ------+     |
|  | Transport: HTTP                               |     |
|  | URL: https://mcp.example.com/sse              |     |
|  | [Edit] [Enable] [Remove]                      |     |
|  +-----------------------------------------------+    |
+--------------------------------------------------------+
```

---

## 7. Module 4: Skill System

### 7.1 Skill File Format

Skills are markdown files in a configurable vault folder (default: `_skills/`).

**Simple Skill** (single-phase):

```markdown
---
id: weekly-report
name: Weekly Report Generator
version: 1.0.0
author: Peak Assistant
description: Compile weekly activity into a structured report
icon: calendar
tags: [productivity, writing]
license: free

type: simple

tools:
  builtin:
    - content_reader
    - local_search_whole_vault
    - recent_changes_whole_vault
  mcp: []

model:
  recommended: gpt-4o
  minCapabilities:
    tools: true
  outputControl:
    temperature: 0.5
    reasoningEffort: medium

inputs:
  - name: period
    type: text
    description: Time period (e.g. "last 7 days")
    required: true
    default: "last 7 days"
---

## System Prompt

You are a knowledge base assistant. Compile a weekly report based on
recent changes in the vault for the period: {{period}}.

## Output Template

### Weekly Report: {{period}}

#### Key Changes
{{changes}}

#### Insights
{{insights}}
```

**Pipeline Skill** (multi-phase):

```markdown
---
id: literature-review
name: Literature Review
version: 1.0.0
author: Peak Assistant
description: Systematic literature review across vault documents
icon: book-open
tags: [academic, research]
license: premium

type: pipeline

model:
  recommended: claude-3-5-sonnet
  minCapabilities:
    tools: true
    reasoning: true

inputs:
  - name: topic
    type: text
    description: Research topic
    required: true
  - name: scope
    type: file
    description: Folder or tag to scope the search
    required: false

phases:
  - name: discover
    tools:
      builtin: [local_search_whole_vault, search_by_dimensions]
    prompt: |
      Search the vault for all documents related to: {{topic}}
      Scope: {{scope}}
      Identify key papers, notes, and connections.

  - name: analyze
    tools:
      builtin: [content_reader, inspect_note_context]
    prompt: |
      For each discovered document, extract:
      - Core thesis / findings
      - Methodology
      - Key citations and connections to other vault notes

  - name: synthesize
    tools:
      builtin: [content_reader]
    prompt: |
      Synthesize findings into a structured literature review.
      Identify themes, gaps, and contradictions across sources.
---

## Output Template

### Literature Review: {{topic}}

#### Themes
{{themes}}

#### Source Analysis
{{source_analysis}}

#### Gaps & Future Directions
{{gaps}}
```

### 7.2 Core Components

**SkillDefinition** type (`src/service/skills/types.ts`):

```typescript
interface SkillDefinition {
  // Frontmatter
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon?: string;
  tags: string[];
  license: 'free' | 'community' | 'premium';
  type: 'simple' | 'pipeline';

  // Tools
  tools?: {
    builtin?: string[];
    mcp?: string[];        // MCP tool names (mcp_serverName_toolName)
  };

  // Model
  model?: {
    recommended?: string;
    minCapabilities?: Partial<ModelCapabilities>;
    outputControl?: Partial<LLMOutputControlSettings>;
  };

  // Inputs
  inputs?: SkillInput[];

  // Pipeline phases (type: 'pipeline' only)
  phases?: SkillPhase[];

  // Markdown body
  systemPrompt: string;       // Parsed from ## System Prompt section
  outputTemplate?: string;    // Parsed from ## Output Template section
}

interface SkillInput {
  name: string;
  type: 'file' | 'text' | 'selection' | 'active-note';
  description: string;
  required: boolean;
  default?: string;
}

interface SkillPhase {
  name: string;
  tools: { builtin?: string[]; mcp?: string[] };
  prompt: string;
}
```

**SkillRegistry** (`src/service/skills/SkillRegistry.ts`):

- Scans configurable vault folder for `.md` files with skill frontmatter
- Built-in skills loaded from `src/service/skills/builtin/`
- Hot-reload via `vault.on('modify' | 'create' | 'delete')` on the skills folder
- Provides `getAll()`, `getById()`, `getByTag()`

**SkillExecutor** (`src/service/skills/SkillExecutor.ts`):

- Parses `SkillDefinition` into `PeakAgentConfig`
- For `simple` type: single AgentLoop run with tools whitelist + system prompt
- For `pipeline` type: sequential phases, each phase is an AgentLoop run
- Input collection: renders input form based on `SkillInput[]` definition
- Capability check: validates selected model meets `minCapabilities`, warns if not
- Execution streams through existing StepList UI (each phase = a step)

### 7.3 Integration with StepList UI

Skill execution maps to the existing step-based architecture:

- **Simple skill**: single step in StepList (type: `skill-execute`)
- **Pipeline skill**: each phase becomes a step (type: `skill-phase-{phaseName}`)
- Reuse existing step renderers where applicable (e.g., recon phase reuses recon step UI)
- New generic `SkillPhaseStep` renderer for custom phases

### 7.4 Skill Store

**SkillStoreService** (`src/service/skills/SkillStoreService.ts`):

Server API (hosted on user's server):

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/skills` | GET | None | Browse skill catalog (paginated, filterable) |
| `/api/skills/:id` | GET | None | Skill detail + preview |
| `/api/skills/:id/download` | GET | Token | Download skill markdown (premium requires valid license) |
| `/api/skills/:id/review` | POST | Token | Submit rating/review |
| `/api/skills/check-updates` | POST | Token | Check for updates to installed skills |

Client flow:
1. Browse/search in Skill Store UI within settings or dedicated view
2. Install = download markdown file to `_skills/` folder
3. Premium skill = validate license token before download
4. Updates = compare local `version` with remote, prompt user

**Skill Store UI** (in settings or dedicated view):

```
+-- Skill Store ----------------------------------------+
|  [Search skills...]             [My Skills (12)]      |
|                                                        |
|  +-- Featured ---+  +-- Categories ----------------+  |
|  | Paper Review  |  | Academic (8)  Writing (12)   |  |
|  | Weekly Report |  | Research (9)  PKM (6)        |  |
|  | Meeting Notes |  | Coding (4)   Business (7)    |  |
|  +---------------+  +------------------------------+  |
|                                                        |
|  +-- Literature Review ----- Premium ---------------+ |
|  | by Peak Assistant  v1.0.0  Rating: 4.5           | |
|  | Systematic literature review across vault docs   | |
|  | Requires: reasoning, tools                       | |
|  | [Install] [Preview]                              | |
|  +---------------------------------------------------+|
+--------------------------------------------------------+
```

### 7.5 Skill Selection UX

Entry points for skill selection:

1. **Chat view**: Button next to input box opens skill picker. Selecting a skill shows input collection form, then executes.
2. **Quick search**: Skill selector in search modal. Some skills are search-oriented.
3. **Command palette**: Obsidian command `Peak: Run Skill` opens skill picker.

---

## 8. Module 5: Usage Tracking

### 8.1 Database Schema

New table in `chat.sqlite`:

```sql
CREATE TABLE usage_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       INTEGER NOT NULL,
  provider        TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  usage_type      TEXT NOT NULL,    -- 'chat' | 'search' | 'indexing' | 'skill' | 'embedding' | 'rerank'
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cached_tokens   INTEGER DEFAULT 0,
  reasoning_tokens INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0,
  conversation_id TEXT,
  skill_id        TEXT,
  prompt_id       TEXT
);

CREATE INDEX idx_usage_timestamp ON usage_log(timestamp);
CREATE INDEX idx_usage_provider ON usage_log(provider);
CREATE INDEX idx_usage_type ON usage_log(usage_type);
```

Data is permanent. No cleanup policy.

### 8.2 UsageLogger

**Location**: `src/service/usage/UsageLogger.ts`

- Singleton, holds SQLite connection
- Buffered writes: accumulate up to 10 records or 5 seconds, then batch INSERT
- Flush on plugin unload
- Auto-records from AI SDK adapter finish events

### 8.3 Per-Message Display

Each AI message footer shows:

```
gpt-4o  *  1,234 in / 567 out  *  $0.0078
```

Conversation-level summary in conversation info panel.

### 8.4 Usage Dashboard

New "Usage" tab in settings:

```
+-- Usage Dashboard ------------------------------------+
|                                                        |
|  Period: [Today] [7d] [30d] [All]      Total: $12.34  |
|                                                        |
|  +-- By Type -----------------------------------+     |
|  |  [============================  ] Chat  $8.20 67% | |
|  |  [============                  ] Search $2.80 23% | |
|  |  [====                          ] Index  $1.10  9% | |
|  |  [=                             ] Skill  $0.24  2% | |
|  +-----------------------------------------------+    |
|                                                        |
|  +-- By Provider --------------------------------+    |
|  |  Provider     Tokens       Cost      Calls    |    |
|  |  OpenAI       234,567     $5.60        89     |    |
|  |  Claude       123,456     $4.80        34     |    |
|  |  Ollama       890,123     $0.00       156     |    |
|  |  OpenRouter    45,678     $1.94        23     |    |
|  +-----------------------------------------------+    |
|                                                        |
|  +-- Top Models ---------------------------------+    |
|  |  gpt-4o              $4.20   (67 calls)       |    |
|  |  claude-3-5-sonnet   $3.90   (28 calls)       |    |
|  |  gpt-4o-mini         $1.40   (22 calls)       |    |
|  |  llama-3.1:8b        $0.00  (156 calls)       |    |
|  |  o3-mini             $0.84    (6 calls)       |    |
|  +-----------------------------------------------+    |
|                                                        |
|  [Export CSV]                                          |
+--------------------------------------------------------+
```

---

## 9. Module 6: Gemini Embedding

### 9.1 Changes

- Implement `generateEmbeddings()` in `gemini.ts` provider using `@ai-sdk/google` embedding API
- Add embedding model entries to `gemini.json` registry (`text-embedding-004`)
- Embedding model selector in settings automatically shows Gemini options

### 9.2 Rationale

Gemini embedding has a free tier. Important for users who don't want OpenAI dependency.

---

## 10. Module 7: Dev Toolchain

### 10.1 MCP Configuration Files

**`.cursor/mcp.json`**:

```jsonc
{
  "mcpServers": {
    "sqlite-vault": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-sqlite",
               "--db-path", "./test-vault/.obsidian/plugins/obsidian-peak-assistant/vault.sqlite"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"]
    }
  }
}
```

**`.claude/settings.json`**:

```jsonc
{
  "mcpServers": {
    "sqlite-vault": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-sqlite",
               "--db-path", "./test-vault/.obsidian/plugins/obsidian-peak-assistant/vault.sqlite"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"]
    }
  }
}
```

### 10.2 Recommended MCP Servers

| Server | Purpose | Transport |
|--------|---------|-----------|
| SQLite MCP | Query vault.sqlite / chat.sqlite for debugging | stdio |
| Context7 | Look up AI SDK, Obsidian API docs | stdio |
| Sequential Thinking | Structured reasoning for architecture decisions | stdio |
| Playwright MCP | Automated UI testing (optional) | stdio |

### 10.3 Documentation

Write `docs/dev-tools.md` explaining:
- What each MCP server does and when to use it
- Installation prerequisites
- Usage examples
- How to add/remove servers

---

## 11. Implementation Phases

### Phase 1: Foundation (internal refactor, no UI changes)

| Task | Description | Verification |
|------|-------------|-------------|
| 1a | Model Registry JSON migration | `getAvailableModels()` returns identical results for all providers |
| 1b | Gemini Embedding | Generate embedding vector with Gemini API key |
| 1c | UsageLogger + `usage_log` table + per-message cost display | Send chat message, verify SQLite record written |

### Phase 2: Provider Extension

| Task | Description | Verification |
|------|-------------|-------------|
| 2a | OpenAI-compatible provider + presets + model name matching | Configure LM Studio endpoint, auto-discover models, successful chat |
| 2b | Settings UI: custom endpoint management | Add/edit/delete endpoint, test connection, config persists after reload |
| 2c | Usage Dashboard tab | Charts render correctly with data; empty state when no data |

### Phase 3: MCP Client

| Task | Description | Verification |
|------|-------------|-------------|
| PRE | esbuild + Obsidian compatibility spike for MCP SDK | Bundle succeeds, stdio spawn works in Electron |
| 3a | MCPClientManager + MCPToolAdapter | Connect to stdio MCP server, list tools |
| 3b | Settings UI: MCP server configuration | Add/remove server, status indicator correct |
| 3c | Agent integration | Agent loop calls MCP tool and gets result |

### Phase 4: Skill System

| Task | Description | Verification |
|------|-------------|-------------|
| 4a | Skill format (simple + pipeline) + SkillRegistry | Place markdown in `_skills/`, registry parses correctly |
| 4b | SkillExecutor + StepList UI integration | Select skill, collect input, execute, results render in StepList |
| 4c | Built-in skill migration + skill selection UX | Vault search works as built-in skill; skill picker accessible from chat/search |
| 4d | Skill Store server + client | Browse store, install free skill, purchase premium skill |

### Phase 5: Dev Toolchain (lightweight, can be done anytime)

| Task | Description | Verification |
|------|-------------|-------------|
| 5a | `.cursor/mcp.json` + `.claude/settings.json` | Cursor/Claude Code auto-discover MCP servers after clone |
| 5b | `docs/dev-tools.md` | Documentation complete and accurate |

### Dependency Graph

```
Phase 1a ──+
Phase 1b   |──> Phase 2a ──> Phase 2b
Phase 1c ──+               > Phase 2c

Phase 2a ─────> Phase 3-PRE ──> Phase 3a ──> Phase 3b
                                           > Phase 3c

Phase 3c ──+
Phase 2b ──+──> Phase 4a ──> Phase 4b ──> Phase 4c ──> Phase 4d

Phase 5 (independent, anytime)
```

---

## 12. Offline vs Online Feature Matrix

| Feature | Offline | Requires Server |
|---------|---------|-----------------|
| Built-in model registry (JSON) | Yes | No |
| All first-class providers | Yes | No |
| OpenAI-compatible endpoints | Yes | No |
| Vault custom skills | Yes | No |
| MCP client | Yes | No |
| Usage tracking + dashboard | Yes | No |
| Model registry online sync | No | Yes (subscription) |
| Skill Store browse/download | No | Yes |
| Premium skill purchase | No | Yes (license) |

---

## 13. Excluded from Scope

| Item | Reason | Future? |
|------|--------|---------|
| `createProviderRegistry` migration | Current factory sufficient, high migration cost | Maybe |
| MCP server exposure (B plan) | Valuable but independent feature | Yes, next iteration |
| Perplexity -> OpenAI-compatible | Has dedicated SDK + unique web search | No |
| Usage budget/alerting | Overkill for personal KB plugin | Maybe |
| Data retention/cleanup | Local storage, no pressure | No |
| Batch API support | Low priority for interactive use | Maybe |
| Prompt/response caching | AI SDK feature, nice-to-have | Maybe |
