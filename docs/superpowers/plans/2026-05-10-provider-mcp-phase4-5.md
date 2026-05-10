# Provider MCP System Phases 4-5 — Skill System + Usage Dashboard Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 4 introduces a Skill System — markdown-defined reusable agent workflows stored in the vault. Phase 5 adds model registry auto-sync with latest pricing data and integrates it into the existing Usage Dashboard.

**Architecture:** Phase 4 adds a new `service/skills/` layer that parses skill markdown files, builds them into PeakAgentConfig objects, and executes them through the existing agent loop infrastructure. Phase 5 extends `ModelRegistry` with a server sync endpoint and connects the existing `UsageDashboard` to registry pricing data.

**Spec:** `docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md` (Module 4: Skill System, Module 1.7: Sync Mechanism, Module 5: Usage Tracking integration)

**Tech Stack:** Zod (schemas), TemplateManager (config loading), obsidian `parseYaml` (frontmatter parsing), Agent SDK `query()` via `queryWithProfile()` (execution), `MCPToolAdapter` (MCP tool whitelisting)

**Branch:** `feat/provider-mcp-phase4-5`

---

## Current State

**Agent tool system:** `AgentTool` interface (`src/service/tools/types.ts`) is the universal tool contract. Tools are converted to MCP servers via `agentToolsToMcpServer()` for `queryWithProfile()`. External MCP tools are merged via `mergeExternalMcpTools()`.

**Copilot actions:** 15 `CopilotAction` instances registered in `CopilotActionRegistry`. Four agent-based actions (suggest-links, knowledge-gaps, synthesize-topic, add-evidence) already use `buildCopilotAgentStream()` which wraps `queryWithProfile()` with vault MCP server tools. These represent the natural migration candidates for the skill system.

**MCP Client:** `MCPClientManager` singleton fully implemented (Phase 3). Supports stdio and SSE transports. `MCPToolAdapter` converts external MCP tools to `AgentTool` via `getAllMcpAgentTools()`.

**Usage tracking:** `UsageTrackingService` singleton with SQLite persistence via `UsageLogRepo`. Full dashboard UI in `src/ui/view/usage-dashboard/` with KPI cards, trend charts, distribution charts, daily breakdown, and recent calls table. Already deployed as a standalone Obsidian view (`peak-usage-dashboard`).

**Model registry:** `ModelRegistry` singleton loads from bundled `data/model-catalog.json` + runtime per-provider JSON via `TemplateManager`. Has `mergeProviderData()` and `mergeRuntimeModels()` methods. Pricing data exists as `costInput`/`costOutput` fields on model entries.

**Skills folder:** No `src/service/skills/` directory exists. No `templates/_skills/` folder. No skill-related types or infrastructure.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/service/skills/types.ts` | SkillDefinition, SkillInput, SkillPhase, SkillExecutionResult types |
| `src/service/skills/SkillRegistry.ts` | Singleton: discover, parse, cache skills from vault folder + builtins |
| `src/service/skills/SkillParser.ts` | Parse markdown + YAML frontmatter into SkillDefinition |
| `src/service/skills/SkillExecutor.ts` | Execute simple/pipeline skills via queryWithProfile agent loop |
| `src/service/skills/builtin/weekly-report.md` | Built-in skill: weekly report generation |
| `src/service/skills/builtin/literature-review.md` | Built-in skill: multi-phase literature review |
| `src/service/skills/builtin/vault-health-check.md` | Built-in skill: vault health analysis |
| `src/ui/view/skills/SkillPickerModal.tsx` | Modal for browsing and selecting skills |
| `src/ui/view/skills/SkillInputForm.tsx` | Dynamic form for collecting skill inputs |

### Modified Files

| File | Change |
|------|--------|
| `src/app/settings/types.ts` | Add `mcpServers` field to `MyPluginSettings`, add `skillsFolder` setting |
| `src/core/constant.ts` | Add `DEFAULT_SKILLS_FOLDER` constant |
| `main.ts` | Initialize SkillRegistry during plugin bootstrap |
| `src/service/usage/types.ts` | Add `'skill'` to `UsageFeature` union |
| `src/service/agents/core/sdkAgentPool.ts` | Accept optional `usageSkillId` in QueryOptions |
| `src/core/providers/model-registry.ts` | Add `syncFromServer()` method for online model pricing sync |

---

## Phase 4: Skill System

### Task 1: Define skill types and parser

Create the core type definitions and a parser that converts markdown files with YAML frontmatter into `SkillDefinition` objects.

**Files:**
- Create: `src/service/skills/types.ts`
- Create: `src/service/skills/SkillParser.ts`

- [ ] **Step 1: Create `src/service/skills/types.ts`**

```ts
/**
 * Skill = markdown-defined reusable agent workflow.
 * Lives in vault folder (default: _skills/) or bundled as built-in.
 */

export interface SkillDefinition {
  // Frontmatter metadata
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon?: string;
  tags: string[];
  license: 'free' | 'community' | 'premium';
  type: 'simple' | 'pipeline';

  // Tool whitelist
  tools?: {
    builtin?: string[];
    mcp?: string[];    // MCP tool names (mcp_serverName_toolName)
  };

  // Model preferences
  model?: {
    recommended?: string;
    minCapabilities?: Record<string, boolean>;
    outputControl?: {
      temperature?: number;
      reasoningEffort?: 'low' | 'medium' | 'high';
    };
  };

  // User inputs
  inputs?: SkillInput[];

  // Pipeline phases (type: 'pipeline' only)
  phases?: SkillPhase[];

  // Parsed markdown body sections
  systemPrompt: string;
  outputTemplate?: string;

  // Source location
  source: 'builtin' | 'vault';
  filePath?: string;
}

export interface SkillInput {
  name: string;
  type: 'file' | 'text' | 'selection' | 'active-note';
  description: string;
  required: boolean;
  default?: string;
}

export interface SkillPhase {
  name: string;
  tools: { builtin?: string[]; mcp?: string[] };
  prompt: string;
}

export interface SkillExecutionContext {
  skillId: string;
  inputs: Record<string, string>;
  signal?: AbortSignal;
}

export interface SkillExecutionResult {
  skillId: string;
  output: string;
  phaseResults?: Array<{ phaseName: string; output: string }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
}
```

- [ ] **Step 2: Create `src/service/skills/SkillParser.ts`**

Parse markdown files with YAML frontmatter (delimited by `---`) into `SkillDefinition`. Use Obsidian's `parseYaml` for frontmatter, then extract `## System Prompt` and `## Output Template` sections from the body.

Key parsing rules:
- Frontmatter between `---` delimiters at file start
- `## System Prompt` section: everything until next `##` heading or EOF
- `## Output Template` section: everything until next `##` heading or EOF
- Pipeline phases are defined in frontmatter `phases` array (each has name, tools, prompt)
- Template variables `{{variableName}}` map to `inputs[].name`
- Validate required fields: `id`, `name`, `type`, `systemPrompt` (or phases for pipeline)

```ts
export function parseSkillMarkdown(content: string, source: 'builtin' | 'vault', filePath?: string): SkillDefinition;
export function validateSkillDefinition(skill: SkillDefinition): string[];  // returns validation errors
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/skills/types.ts src/service/skills/SkillParser.ts
git commit -m "feat(skills): define SkillDefinition types and markdown parser"
```

---

### Task 2: SkillRegistry singleton

Implement the registry that discovers skills from a configurable vault folder and built-in source, with hot-reload support.

**Files:**
- Create: `src/service/skills/SkillRegistry.ts`
- Modify: `src/app/settings/types.ts`
- Modify: `src/core/constant.ts`

- [ ] **Step 1: Add settings and constants**

In `src/core/constant.ts`, add:
```ts
export const DEFAULT_SKILLS_FOLDER = '_skills';
```

In `src/app/settings/types.ts`, add to `MyPluginSettings`:
```ts
export interface MyPluginSettings {
    // ... existing fields ...
    mcpServers?: MCPServerConfig[];    // formalize existing untyped field
    skillsFolder?: string;             // vault path for user skills (default: _skills)
}
```

Import `MCPServerConfig` from `@/service/mcp/types`.

- [ ] **Step 2: Create `SkillRegistry.ts`**

Singleton that:
- Scans vault folder (default `_skills/`) for `.md` files with skill frontmatter
- Loads built-in skills from embedded strings (bundled at build time)
- Provides `getAll()`, `getById()`, `getByTag()`, `getByCategory()`
- Watches vault folder for changes (`vault.on('modify' | 'create' | 'delete')`) and hot-reloads
- Exposes `init(app, settings)` and `destroy()` lifecycle methods

```ts
export class SkillRegistry {
    private static instance: SkillRegistry | null = null;

    static getInstance(): SkillRegistry;
    init(app: App, skillsFolder: string): Promise<void>;
    destroy(): void;

    getAll(): SkillDefinition[];
    getById(id: string): SkillDefinition | undefined;
    getByTag(tag: string): SkillDefinition[];

    /** Force re-scan of vault folder. */
    refresh(): Promise<void>;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/skills/SkillRegistry.ts src/app/settings/types.ts src/core/constant.ts
git commit -m "feat(skills): SkillRegistry singleton with vault folder scanning and hot-reload"
```

---

### Task 3: SkillExecutor — execute skills through agent loop

Implement the executor that translates a `SkillDefinition` into `queryWithProfile()` calls, handling both simple (single-phase) and pipeline (multi-phase) skill types.

**Files:**
- Create: `src/service/skills/SkillExecutor.ts`
- Modify: `src/service/usage/types.ts`

- [ ] **Step 1: Add `'skill'` to UsageFeature**

In `src/service/usage/types.ts`, update:
```ts
export type UsageFeature = 'chat' | 'search_analysis' | 'copilot' | 'graph' | 'indexing' | 'internal' | 'skill';
```

- [ ] **Step 2: Create `SkillExecutor.ts`**

The executor:
- For `simple` skills: builds tools from `tools.builtin` list + `tools.mcp` whitelist, constructs system prompt with input variable substitution, calls `queryWithProfile()` once
- For `pipeline` skills: runs each phase sequentially, passing the output of the previous phase as context to the next
- Tool resolution: maps tool name strings to actual `AgentTool` instances from the tool registry (search-graph-inspector tools, content-reader, etc.)
- MCP tool whitelisting: filters `getAllMcpAgentTools()` to only include tools listed in `tools.mcp`
- Streams `LLMStreamEvent` for real-time UI updates
- Emits usage events with `feature: 'skill'` and `skillId`

```ts
export class SkillExecutor {
    /**
     * Execute a skill with given inputs.
     * Yields LLMStreamEvents for real-time display.
     */
    async *execute(
        skill: SkillDefinition,
        context: SkillExecutionContext,
    ): AsyncGenerator<LLMStreamEvent, SkillExecutionResult | void>;
}
```

Tool resolution strategy — map skill tool names to actual tool builder functions:
```ts
const TOOL_BUILDERS: Record<string, () => AgentTool> = {
    content_reader: () => contentReaderTool(),
    local_search_whole_vault: () => localSearchWholeVaultTool(tm),
    recent_changes_whole_vault: () => recentChangesWholeVaultTool(tm),
    inspect_note_context: () => inspectNoteContextTool(tm),
    search_by_dimensions: () => searchByDimensionsTool(tm),
    explore_folder: () => exploreFolderTool(tm),
    graph_traversal: () => graphTraversalTool(tm),
    find_path: () => findPathTool(tm),
    find_key_nodes: () => findKeyNodesTool(tm),
    find_orphans: () => findOrphansTool(tm),
    submit_final_answer: () => submitFinalAnswerTool(),
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/skills/SkillExecutor.ts src/service/usage/types.ts
git commit -m "feat(skills): SkillExecutor with simple and pipeline execution via agent loop"
```

---

### Task 4: Built-in skills + wire into plugin lifecycle

Create built-in skill definitions and integrate SkillRegistry into the plugin bootstrap sequence.

**Files:**
- Create: `src/service/skills/builtin/weekly-report.md`
- Create: `src/service/skills/builtin/literature-review.md`
- Create: `src/service/skills/builtin/vault-health-check.md`
- Modify: `main.ts`

- [ ] **Step 1: Create built-in skill markdown files**

Three built-in skills that demonstrate the format and provide immediate value:

**weekly-report.md** (simple type):
- Tools: content_reader, local_search_whole_vault, recent_changes_whole_vault
- Input: period (text, default "last 7 days")
- System prompt: compile weekly activity report

**literature-review.md** (pipeline type):
- 3 phases: discover → analyze → synthesize
- Each phase has its own tool whitelist and prompt
- Input: topic (text, required), scope (text, optional folder/tag)

**vault-health-check.md** (simple type):
- Tools: find_orphans, find_key_nodes, explore_folder, graph_traversal
- No required inputs (operates on whole vault)
- System prompt: analyze vault health and produce structured report

- [ ] **Step 2: Wire SkillRegistry into main.ts**

After TemplateManager init and before views:
```ts
import { SkillRegistry } from '@/service/skills/SkillRegistry';

// During plugin load:
const skillsFolder = this.settings.skillsFolder ?? DEFAULT_SKILLS_FOLDER;
await SkillRegistry.getInstance().init(this.app, skillsFolder);

// During plugin unload:
SkillRegistry.getInstance().destroy();
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/skills/builtin/ main.ts
git commit -m "feat(skills): built-in skills (weekly-report, literature-review, vault-health) + lifecycle wiring"
```

---

### Task 5: Skill picker UI + input form

Add a modal for browsing/selecting skills and a dynamic input form that collects required inputs before execution.

**Files:**
- Create: `src/ui/view/skills/SkillPickerModal.tsx`
- Create: `src/ui/view/skills/SkillInputForm.tsx`

- [ ] **Step 1: Create `SkillInputForm.tsx`**

Dynamic form component that renders input fields based on `SkillInput[]`:
- `text` type: text input with label and description
- `file` type: file path input with vault file picker integration
- `selection` type: displays info that current editor selection will be used
- `active-note` type: displays info that current active note will be used
- Shows default values where specified
- Submit button triggers skill execution
- Uses shadcn/ui `Button`, `Input` components, Lucide icons

- [ ] **Step 2: Create `SkillPickerModal.tsx`**

Modal component for browsing and selecting skills:
- Grid or list view of available skills
- Each skill card shows: icon (Lucide), name, description, tags, type badge (simple/pipeline)
- Filter by tag
- Search by name/description
- Selecting a skill shows `SkillInputForm`
- After form submit, closes modal and triggers execution
- Built-in vs vault skills distinguished by subtle visual indicator

- [ ] **Step 3: Add command palette entry**

Register an Obsidian command `peak-run-skill` that opens the `SkillPickerModal`.

In `main.ts` or command registration:
```ts
this.addCommand({
    id: 'peak-run-skill',
    name: 'Run Skill',
    callback: () => {
        // Open skill picker modal
    },
});
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/skills/ main.ts
git commit -m "feat(skills): skill picker modal with dynamic input form and command palette entry"
```

---

## Phase 5: Usage Dashboard Sync

### Task 6: Model registry server sync

Add a sync mechanism that fetches latest model pricing from an API endpoint and merges it into the registry.

**Files:**
- Modify: `src/core/providers/model-registry.ts`

- [ ] **Step 1: Add `syncFromServer()` method**

```ts
/**
 * Fetch latest model definitions from server API and merge into registry.
 * Endpoint: GET {baseUrl}/api/model-registry/latest?provider={providerId}
 * Response format: same JSON as per-provider template files.
 * Requires auth token (subscription feature).
 *
 * Non-destructive: merges with existing data, never removes models.
 * Pricing data takes precedence from server (fresher data).
 */
public static async syncFromServer(
    serverBaseUrl: string,
    authToken: string,
    providerIds?: string[],
): Promise<{ synced: string[]; failed: string[] }>;
```

Implementation:
- For each provider ID (defaults to all known providers): `GET {baseUrl}/api/model-registry/latest?provider={id}`
- Auth via `Authorization: Bearer {token}` header
- Parse response as per-provider JSON format
- Call `mergeProviderData()` with server data
- Track synced vs failed providers
- Timeout: 10 seconds per request
- Silent failure: log warnings, don't throw

- [ ] **Step 2: Add sync trigger in settings**

This is for future UI integration. The sync can be triggered from:
- Settings UI "Sync Now" button (manual)
- Plugin startup (optional, if authToken is configured)

For now, just expose the method. The settings UI integration is deferred to a future task (not enough existing UI infrastructure for auth token management).

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/core/providers/model-registry.ts
git commit -m "feat(registry): add syncFromServer for online model pricing sync"
```

---

### Task 7: Usage Dashboard — model pricing integration

Connect the existing Usage Dashboard to the model registry's pricing data so cost calculations use the latest pricing.

**Files:**
- Modify: `src/service/search/support/llm-cost-utils.ts` (or wherever cost computation lives)

- [ ] **Step 1: Ensure cost computation uses ModelRegistry pricing**

The `computeUsdFromUsage()` function should look up `costInput`/`costOutput` from `ModelRegistry` when available, falling back to hardcoded defaults only if the model is unknown.

Check if this is already the case. If `computeUsdFromUsage` already takes `ModelMetaData` with pricing, this step is a no-op.

If not, update the function to accept optional model info from registry:
```ts
export function computeUsdFromUsage(
    usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; totalTokens?: number },
    modelInfo?: { costInput?: string; costOutput?: string },
): number;
```

- [ ] **Step 2: Verify existing dashboard renders correctly with pricing data**

The dashboard already shows cost data. Verify that:
- `costBreakdown` in the dashboard shows per-provider costs
- Cost calculation matches what the model registry reports
- No changes needed if the pipeline already works end-to-end

- [ ] **Step 3: Verify build + test**

Run: `npm run build && npm run test`

- [ ] **Step 4: Commit**

```bash
git add src/service/search/support/llm-cost-utils.ts
git commit -m "feat(usage): ensure cost computation uses ModelRegistry pricing data"
```

---

## Task Summary

| Task | Phase | Component | Files | Deps |
|------|-------|-----------|-------|------|
| 1 | P4 | Skill types + parser | 2 new | -- |
| 2 | P4 | SkillRegistry singleton | 1 new, 2 modified | Task 1 |
| 3 | P4 | SkillExecutor | 1 new, 1 modified | Task 2 |
| 4 | P4 | Built-in skills + lifecycle | 3 new, 1 modified | Task 3 |
| 5 | P4 | Skill picker UI + input form | 2 new, 1 modified | Task 4 |
| 6 | P5 | Model registry server sync | 1 modified | -- |
| 7 | P5 | Usage Dashboard pricing integration | 1 modified | Task 6 |

**Execution order:**

```
Phase 4:  T1 ──> T2 ──> T3 ──> T4 ──> T5

Phase 5:  T6 ──> T7
          (independent of Phase 4)
```

**Parallelization:** Task 6 is independent and can run in parallel with Phase 4 tasks.
