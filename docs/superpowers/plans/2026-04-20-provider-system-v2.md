# Provider System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the entire Vercel AI SDK stack and unify all LLM calls to Claude Agent SDK `query()` via a Profile Registry, making the plugin desktop-only for AI features.

**Architecture:** Profile Registry (single config surface) materializes to Agent SDK env vars. A subprocess pool pre-warms at plugin load. Every LLM call uses one of three `query()` patterns: Pattern A (agent loop with tools), Pattern B (single-turn, no tools), Pattern C (structured output with jsonSchema). Embeddings go through a minimal ~50-line HTTP helper.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (already in deps), Agent SDK `query()`/`startup()`, existing Obsidian plugin infrastructure, React settings UI.

**Spec:** `docs/superpowers/specs/2026-04-11-provider-system-v2-design.md`

---

## File Structure

### New files

| File | Purpose |
|---|---|
| `src/core/profiles/types.ts` | Profile data model, ProfileKind union |
| `src/core/profiles/ProfileRegistry.ts` | CRUD, persist to PluginSettings, active profile selectors |
| `src/core/profiles/materialize.ts` | `toAgentSdkEnv()` + `toEmbeddingConfig()` pure functions |
| `src/core/profiles/presets.ts` | Anthropic Direct / OpenRouter / LiteLLM / Custom preset factories |
| `src/core/profiles/migrate-v1.ts` | One-shot migration from v1 `llmProviderConfigs` to Profile[] |
| `src/service/agents/core/sdkAgentPool.ts` | Subprocess pool: `startup()`, `shutdown()`, shared `queryWithProfile()` |
| `src/service/agents/core/sdkMessageAdapter.ts` | `translateSdkMessages()` → `LLMStreamEvent` stream |
| `src/core/embeddings/embedClient.ts` | `embedText()` / `embedTexts()` — fetch-based OpenAI-format helper |
| `src/ui/view/settings/ProfileSettingsTab.tsx` | Profile CRUD UI replacing ProviderSettings |

### Existing files — major rewrite

| File | Current lines | Action |
|---|---|---|
| `src/service/chat/service-manager.ts` | 809 | Strip provider routing; `streamChat`/`blockChat`/`streamObjectWithPrompt` → `query()` wrappers |
| `src/service/agents/report/ReportOrchestrator.ts` | ~550 | 6 `streamText` → `query()` Pattern B; keep parallel execution |
| `src/service/agents/DocSimpleAgent.ts` | 190 | `Experimental_Agent` → `query()` Pattern A |
| `src/service/agents/FollowupChatAgent.ts` | 133 | `Experimental_Agent` → `query()` Pattern A |
| `src/app/settings/types.ts` | ~470 | Add `profiles[]`, `activeAgentProfileId`, `activeEmbeddingProfileId`, `sdkSettings` |
| `src/ui/view/settings/ModelConfigTab.tsx` | ~200 | Replace provider list with Profile UI |

### Delete

| Path | Lines | Reason |
|---|---|---|
| `src/core/providers/adapter/ai-sdk-adapter.ts` | 450 | Replaced by sdkAgentPool |
| `src/core/providers/base/claude.ts` | 100 | Per-provider adapter |
| `src/core/providers/base/openai.ts` | 108 | Per-provider adapter |
| `src/core/providers/base/gemini.ts` | 95 | Per-provider adapter |
| `src/core/providers/base/ollama.ts` | 372 | Per-provider adapter |
| `src/core/providers/base/openrouter.ts` | 522 | Per-provider adapter |
| `src/core/providers/base/perplexity.ts` | 90 | Per-provider adapter |
| `src/core/providers/base/factory.ts` | 301 | Provider factory |
| `src/core/providers/MultiProviderChatService.ts` | 237 | Multi-provider router |
| `src/core/providers/helpers/stream-helper.ts` | 638 | Vercel AI SDK stream transforms |
| `src/core/providers/helpers/message-helper.ts` | 93 | Vercel AI SDK message helpers |
| `src/service/agents/core/tool-executor.ts` | 61 | Old tool executor |
| `src/ui/view/settings/component/ProviderSettings.tsx` | ~300 | Old provider UI |

**Estimated delta:** Delete ~3500+ lines, Add ~1800 lines, Net ~-1700 lines.

---

## Sub-Wave Structure

```
Sub-Wave A (Foundation)           Sub-Wave B (Migration)           Sub-Wave C (Cleanup)
Tasks 1-4                         Tasks 5-9                        Tasks 10-12
                                                                   
Profile Registry                  ReportOrchestrator               Delete old stack
SDK Agent Pool                    Auxiliary agents                  Settings UI overhaul
SDK Message Adapter               Structured extraction            Build config + manifest
Chat mode migration               Embedding helper                 
                                                                   
[--- merge to master ---]         [--- merge to master ---]        [--- merge to master ---]
```

Each sub-wave merges to master before the next starts. This avoids a long-lived branch.

---

## Sub-Wave A: Foundation (Tasks 1-4)

### Task 1: Profile Data Model + Registry

**Files:**
- Create: `src/core/profiles/types.ts`
- Create: `src/core/profiles/ProfileRegistry.ts`
- Create: `src/core/profiles/materialize.ts`
- Create: `src/core/profiles/presets.ts`
- Create: `src/core/profiles/migrate-v1.ts`
- Modify: `src/app/settings/types.ts:418-465` (add profile fields to MyPluginSettings)
- Modify: `src/app/settings/PluginSettingsLoader.ts` (migration logic)
- Test: `test/profile-registry.test.ts`

**Context:** The existing `vaultSearch.sdkProfile` at `src/app/settings/types.ts:455-465` already has the right shape for a single profile. This task generalizes it into an array with CRUD + active selectors.

- [ ] **Step 1: Write Profile type**

```typescript
// src/core/profiles/types.ts
export type ProfileKind = 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';

export interface Profile {
  id: string;
  name: string;
  kind: ProfileKind;
  enabled: boolean;
  createdAt: number;

  // Agent SDK materialization (for query())
  baseUrl: string;
  apiKey: string | null;
  authToken: string | null;
  primaryModel: string;
  fastModel: string;
  customHeaders: Record<string, string>;

  // Embedding materialization (for embedText())
  embeddingEndpoint: string | null;
  embeddingApiKey: string | null;
  embeddingModel: string | null;

  // UX
  icon: string | null;
  description: string | null;
}

export interface ProfileSettings {
  profiles: Profile[];
  activeAgentProfileId: string | null;
  activeEmbeddingProfileId: string | null;
  sdkSettings: SdkSettings;
}

export interface SdkSettings {
  cliPathOverride: string | null;
  subprocessPoolSize: number;
  warmupOnLoad: boolean;
}

export const DEFAULT_SDK_SETTINGS: SdkSettings = {
  cliPathOverride: null,
  subprocessPoolSize: 1,
  warmupOnLoad: true,
};
```

- [ ] **Step 2: Write materialize functions**

Extract and generalize the existing `toAgentSdkEnv` logic from `VaultSearchAgentSDK.ts:78-110` (the `readProfileFromSettings` + env building). The new version takes a `Profile` directly.

```typescript
// src/core/profiles/materialize.ts
import type { Profile } from './types';

export function toAgentSdkEnv(profile: Profile): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl,
    DISABLE_PROMPT_CACHING: '0',
  };
  if (profile.apiKey) env.ANTHROPIC_API_KEY = profile.apiKey;
  if (profile.authToken) env.ANTHROPIC_AUTH_TOKEN = profile.authToken;
  if (profile.primaryModel) env.ANTHROPIC_MODEL = profile.primaryModel;
  if (profile.fastModel) env.ANTHROPIC_SMALL_FAST_MODEL = profile.fastModel;
  if (Object.keys(profile.customHeaders).length > 0) {
    env.ANTHROPIC_CUSTOM_HEADERS = JSON.stringify(profile.customHeaders);
  }
  return env;
}

export function toEmbeddingConfig(profile: Profile): {
  endpoint: string; apiKey: string; model: string;
} | null {
  if (!profile.embeddingEndpoint || !profile.embeddingModel) return null;
  return {
    endpoint: profile.embeddingEndpoint,
    apiKey: profile.embeddingApiKey ?? profile.apiKey ?? '',
    model: profile.embeddingModel,
  };
}
```

- [ ] **Step 3: Write presets**

```typescript
// src/core/profiles/presets.ts
import type { Profile, ProfileKind } from './types';

export function createPresetProfile(kind: ProfileKind, overrides?: Partial<Profile>): Profile {
  const base = PRESETS[kind];
  return { ...base, id: `profile-${Date.now()}`, createdAt: Date.now(), ...overrides };
}

const PRESETS: Record<ProfileKind, Omit<Profile, 'id' | 'createdAt'>> = {
  'anthropic-direct': {
    name: 'Anthropic Direct', kind: 'anthropic-direct', enabled: true,
    baseUrl: 'https://api.anthropic.com', apiKey: null, authToken: null,
    primaryModel: 'claude-opus-4-6', fastModel: 'claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null, embeddingApiKey: null, embeddingModel: null,
    icon: null, description: null,
  },
  'openrouter': {
    name: 'OpenRouter', kind: 'openrouter', enabled: true,
    baseUrl: 'https://openrouter.ai/api', apiKey: '', authToken: null,
    primaryModel: 'anthropic/claude-opus-4-6', fastModel: 'anthropic/claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: 'https://openrouter.ai/api/v1', embeddingApiKey: null, embeddingModel: 'openai/text-embedding-3-large',
    icon: null, description: null,
  },
  'litellm': {
    name: 'LiteLLM', kind: 'litellm', enabled: true,
    baseUrl: 'http://localhost:4000/anthropic', apiKey: null, authToken: null,
    primaryModel: 'claude-opus-4-6', fastModel: 'claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: 'http://localhost:4000/v1', embeddingApiKey: null, embeddingModel: 'text-embedding-3-large',
    icon: null, description: null,
  },
  'custom': {
    name: 'Custom', kind: 'custom', enabled: true,
    baseUrl: '', apiKey: null, authToken: null,
    primaryModel: '', fastModel: '',
    customHeaders: {},
    embeddingEndpoint: null, embeddingApiKey: null, embeddingModel: null,
    icon: null, description: null,
  },
};
```

- [ ] **Step 4: Write ProfileRegistry**

```typescript
// src/core/profiles/ProfileRegistry.ts
import type { Profile, ProfileSettings, SdkSettings } from './types';
import { DEFAULT_SDK_SETTINGS } from './types';

export class ProfileRegistry {
  private static instance: ProfileRegistry | null = null;
  private profiles: Profile[] = [];
  private activeAgentProfileId: string | null = null;
  private activeEmbeddingProfileId: string | null = null;
  private sdkSettings: SdkSettings = DEFAULT_SDK_SETTINGS;
  private persistFn: ((settings: ProfileSettings) => void) | null = null;

  static getInstance(): ProfileRegistry {
    if (!this.instance) this.instance = new ProfileRegistry();
    return this.instance;
  }

  static clearInstance(): void { this.instance = null; }

  load(settings: ProfileSettings, persistFn: (s: ProfileSettings) => void): void {
    this.profiles = settings.profiles;
    this.activeAgentProfileId = settings.activeAgentProfileId;
    this.activeEmbeddingProfileId = settings.activeEmbeddingProfileId;
    this.sdkSettings = settings.sdkSettings ?? DEFAULT_SDK_SETTINGS;
    this.persistFn = persistFn;
  }

  getActiveAgentProfile(): Profile | null {
    return this.profiles.find(p => p.id === this.activeAgentProfileId && p.enabled) ?? null;
  }

  getActiveEmbeddingProfile(): Profile | null {
    return this.profiles.find(p => p.id === this.activeEmbeddingProfileId && p.enabled) ?? null;
  }

  getSdkSettings(): SdkSettings { return this.sdkSettings; }
  getAllProfiles(): Profile[] { return this.profiles; }

  addProfile(profile: Profile): void {
    this.profiles.push(profile);
    if (!this.activeAgentProfileId) this.activeAgentProfileId = profile.id;
    this.persist();
  }

  updateProfile(id: string, updates: Partial<Profile>): void {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx !== -1) { this.profiles[idx] = { ...this.profiles[idx], ...updates }; this.persist(); }
  }

  deleteProfile(id: string): void {
    this.profiles = this.profiles.filter(p => p.id !== id);
    if (this.activeAgentProfileId === id) this.activeAgentProfileId = this.profiles[0]?.id ?? null;
    if (this.activeEmbeddingProfileId === id) this.activeEmbeddingProfileId = null;
    this.persist();
  }

  setActiveAgentProfile(id: string): void { this.activeAgentProfileId = id; this.persist(); }
  setActiveEmbeddingProfile(id: string): void { this.activeEmbeddingProfileId = id; this.persist(); }

  private persist(): void {
    this.persistFn?.({
      profiles: this.profiles,
      activeAgentProfileId: this.activeAgentProfileId,
      activeEmbeddingProfileId: this.activeEmbeddingProfileId,
      sdkSettings: this.sdkSettings,
    });
  }
}
```

- [ ] **Step 5: Write v1 migration**

```typescript
// src/core/profiles/migrate-v1.ts
import type { Profile } from './types';
import { createPresetProfile } from './presets';

/** Detect v1 settings and create a default Profile from existing provider configs. */
export function migrateFromV1(settings: any): Profile[] | null {
  const sdkProfile = settings?.vaultSearch?.sdkProfile;
  const llmConfigs = settings?.ai?.llmProviderConfigs;
  if (!sdkProfile && !llmConfigs) return null; // fresh install

  // If sdkProfile already exists, create Profile from it (already partially v2)
  if (sdkProfile?.apiKey || sdkProfile?.authToken) {
    const profile = createPresetProfile(sdkProfile.kind ?? 'anthropic-direct', {
      name: 'Migrated Profile',
      apiKey: sdkProfile.apiKey ?? null,
      authToken: sdkProfile.authToken ?? null,
      baseUrl: sdkProfile.baseUrl ?? 'https://api.anthropic.com',
      primaryModel: sdkProfile.primaryModel ?? 'claude-opus-4-6',
      fastModel: sdkProfile.fastModel ?? 'claude-haiku-4-5',
    });
    return [profile];
  }

  // Fallback: look at old llmProviderConfigs for any enabled provider with an API key
  if (!llmConfigs) return null;
  for (const [provider, config] of Object.entries(llmConfigs) as [string, any][]) {
    if (config?.enabled && config?.apiKey) {
      const kind = provider === 'claude' ? 'anthropic-direct'
        : provider === 'openrouter' ? 'openrouter' : 'custom';
      const profile = createPresetProfile(kind, {
        name: `Migrated (${provider})`,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl ?? undefined,
      });
      return [profile];
    }
  }
  return null;
}
```

- [ ] **Step 6: Add profile fields to MyPluginSettings**

In `src/app/settings/types.ts`, add to the `MyPluginSettings` interface:

```typescript
// Add after existing fields (~line 465)
profileSettings?: ProfileSettings;
```

And update `PluginSettingsLoader.ts` to call `migrateFromV1` on first load.

- [ ] **Step 7: Write tests for ProfileRegistry**

```typescript
// test/profile-registry.test.ts
import { ProfileRegistry } from '../src/core/profiles/ProfileRegistry';
import { createPresetProfile } from '../src/core/profiles/presets';
import { toAgentSdkEnv, toEmbeddingConfig } from '../src/core/profiles/materialize';

// Test: create preset, add to registry, get active, materialize
// Test: v1 migration creates valid profile
// Test: toAgentSdkEnv produces correct env vars for each kind
// Test: toEmbeddingConfig returns null when no embedding fields set
```

- [ ] **Step 8: Run tests, verify, commit**

```bash
npm run test -- test/profile-registry.test.ts
git add src/core/profiles/ test/profile-registry.test.ts
git commit -m "feat: add Profile Registry, materialization, presets, and v1 migration"
```

---

### Task 2: SDK Agent Pool

**Files:**
- Create: `src/service/agents/core/sdkAgentPool.ts`
- Modify: `src/service/agents/VaultSearchAgentSDK.ts:78-110` (use pool instead of inline warmup)
- Modify: `src/main.ts` (call `startup()` on plugin load, `shutdown()` on unload)

**Context:** `VaultSearchAgentSDK.ts` already has `warmupSdkAgentPool()` and inline `query()` calls. This task extracts the pool into a shared service that all agents can use.

- [ ] **Step 1: Create sdkAgentPool.ts**

Extract and generalize the subprocess management from `VaultSearchAgentSDK.ts`. The pool provides `queryWithProfile(profile, options)` which handles env materialization + `query()` call.

```typescript
// src/service/agents/core/sdkAgentPool.ts
import { query, startup, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { toAgentSdkEnv } from '@/core/profiles/materialize';
import type { Profile } from '@/core/profiles/types';

let warmedUp = false;

export async function warmupPool(): Promise<void> {
  if (warmedUp) return;
  const registry = ProfileRegistry.getInstance();
  const profile = registry.getActiveAgentProfile();
  if (!profile) return;
  const sdkSettings = registry.getSdkSettings();
  const cliPath = sdkSettings.cliPathOverride ?? findClaudeCodeCli();
  try {
    await startup({ pathToClaudeCodeExecutable: cliPath });
    warmedUp = true;
  } catch (e) {
    console.warn('[sdkAgentPool] warmup failed:', e);
  }
}

export function shutdownPool(): void { warmedUp = false; }

export interface QueryOptions {
  prompt: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, any>;
  jsonSchema?: any;
  canUseTool?: (name: string, input: any) => Promise<boolean>;
  signal?: AbortSignal;
}

/** Execute a query using the active agent profile. Returns an async iterable of SDK messages. */
export async function* queryWithProfile(
  profile: Profile,
  options: QueryOptions,
): AsyncGenerator<SDKMessage> {
  const sdkSettings = ProfileRegistry.getInstance().getSdkSettings();
  const cliPath = sdkSettings.cliPathOverride ?? findClaudeCodeCli();
  const env = toAgentSdkEnv(profile);

  const result = query({
    prompt: options.prompt,
    options: {
      pathToClaudeCodeExecutable: cliPath,
      env,
      maxTurns: options.maxTurns ?? 1,
      systemPrompt: options.systemPrompt,
      allowedTools: options.allowedTools ?? [],
      disallowedTools: options.disallowedTools ?? DEFAULT_DISALLOWED,
      mcpServers: options.mcpServers,
      jsonSchema: options.jsonSchema,
      canUseTool: options.canUseTool,
    },
  });

  for await (const message of result) {
    if (options.signal?.aborted) break;
    yield message;
  }
}

const DEFAULT_DISALLOWED = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

function findClaudeCodeCli(): string {
  // Reuse existing logic from VaultSearchAgentSDK
  // Check node_modules/@anthropic-ai/claude-agent-sdk/cli.js
  const path = require('path');
  const pluginDir = (globalThis as any).__peakPluginDir ?? '';
  return path.join(pluginDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
}
```

- [ ] **Step 2: Update VaultSearchAgentSDK to use pool**

Replace the inline `warmupSdkAgentPool()` and `query()` calls in `VaultSearchAgentSDK.ts` with `queryWithProfile()` from the pool. Remove `readProfileFromSettings` (replaced by `ProfileRegistry.getActiveAgentProfile()`).

- [ ] **Step 3: Wire startup/shutdown in main.ts**

Add `warmupPool()` call after TemplateManager init, and `shutdownPool()` in `onunload()`.

- [ ] **Step 4: Verify vault search still works**

```bash
npm run build
```

Test in Obsidian: run a vault search query, verify it works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/core/sdkAgentPool.ts src/service/agents/VaultSearchAgentSDK.ts src/main.ts
git commit -m "feat: extract SDK agent pool from VaultSearchAgentSDK for shared use"
```

---

### Task 3: SDK Message Adapter

**Files:**
- Create: `src/service/agents/core/sdkMessageAdapter.ts`
- Modify: `src/service/agents/VaultSearchAgentSDK.ts` (use shared adapter)

**Context:** `VaultSearchAgentSDK.ts` already has `translateSdkMessage()` that converts SDK messages to `LLMStreamEvent`. This task extracts it so ReportOrchestrator, DocSimpleAgent, etc. can reuse it.

- [ ] **Step 1: Extract translateSdkMessage into shared module**

Move the translation logic from `VaultSearchAgentSDK.ts` into `sdkMessageAdapter.ts`. The function signature stays the same but becomes a public export.

```typescript
// src/service/agents/core/sdkMessageAdapter.ts
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { LLMStreamEvent } from '@/core/providers/types';

/** Translate SDK messages into LLMStreamEvents for UI consumption. */
export function* translateSdkMessages(
  messages: AsyncIterable<SDKMessage>,
  options?: { triggerName?: string },
): AsyncGenerator<LLMStreamEvent> {
  // ... extracted from VaultSearchAgentSDK.ts translateSdkMessage logic
}

/** Extract plain text from an SDK message stream (for Pattern B single-turn calls). */
export async function collectText(messages: AsyncIterable<SDKMessage>): Promise<string> {
  const chunks: string[] = [];
  for await (const msg of messages) {
    if (msg.type === 'assistant' && typeof msg.message?.content === 'string') {
      chunks.push(msg.message.content);
    }
    // Also handle streaming text deltas
    if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') {
      chunks.push(msg.delta.text);
    }
  }
  return chunks.join('');
}

/** Extract structured JSON from an SDK message stream (for Pattern C jsonSchema calls). */
export async function collectJson<T>(messages: AsyncIterable<SDKMessage>): Promise<T> {
  const text = await collectText(messages);
  return JSON.parse(text);
}
```

- [ ] **Step 2: Update VaultSearchAgentSDK to import from adapter**

Replace inline `translateSdkMessage` with import from `sdkMessageAdapter.ts`.

- [ ] **Step 3: Verify, commit**

```bash
npm run build
git add src/service/agents/core/sdkMessageAdapter.ts src/service/agents/VaultSearchAgentSDK.ts
git commit -m "refactor: extract SDK message adapter from VaultSearchAgentSDK"
```

---

### Task 4: Chat Mode Migration

**Files:**
- Modify: `src/service/chat/service-manager.ts:389-757` (replace streamChat/blockChat/streamObjectWithPrompt)
- Modify: `src/service/prompt/PromptService.ts` (update chat/stream calls)
- Modify: `src/service/chat/service-conversation.ts` (title gen, summaries)
- Modify: `src/service/chat/model-resolution.ts` (simplify — no more per-provider model resolution)
- Modify: `src/core/providers/types.ts` (remove AI SDK type re-exports, keep LLMStreamEvent)

**Context:** This is the highest-blast-radius task. `AIServiceManager` is the central facade. After this task, all code paths that previously went through `MultiProviderChatService` → adapter → `streamText`/`generateText` will go through the agent pool's `queryWithProfile()`.

- [ ] **Step 1: Add query-based methods to AIServiceManager**

Add three new methods alongside the existing ones (dual-stack temporarily):

```typescript
// In service-manager.ts, add:

/** Pattern B: Single-turn LLM call via Agent SDK. Returns plain text. */
async queryText(promptId: PromptId, variables: Record<string, string>, opts?: { maxTokens?: number }): Promise<string> {
  const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
  if (!profile) throw new Error('No active AI profile configured');
  const systemPrompt = await this.renderPrompt(promptId, variables);
  const prompt = variables._userPrompt ?? variables.content ?? '';
  const messages = queryWithProfile(profile, {
    prompt, systemPrompt, maxTurns: 1,
    disallowedTools: ALL_DISALLOWED,
  });
  return collectText(messages);
}

/** Pattern B: Streaming single-turn via Agent SDK. Yields LLMStreamEvents. */
async* queryStream(promptId: PromptId, variables: Record<string, string>): AsyncGenerator<LLMStreamEvent> {
  const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
  if (!profile) throw new Error('No active AI profile configured');
  const systemPrompt = await this.renderPrompt(promptId, variables);
  const prompt = variables._userPrompt ?? '';
  yield* translateSdkMessages(
    queryWithProfile(profile, { prompt, systemPrompt, maxTurns: 1, disallowedTools: ALL_DISALLOWED }),
  );
}

/** Pattern C: Structured output via Agent SDK. Returns parsed JSON. */
async queryStructured<T>(promptId: PromptId, variables: Record<string, string>, schema: any): Promise<T> {
  const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
  if (!profile) throw new Error('No active AI profile configured');
  const systemPrompt = await this.renderPrompt(promptId, variables);
  const prompt = variables._userPrompt ?? variables.content ?? '';
  const messages = queryWithProfile(profile, {
    prompt, systemPrompt, maxTurns: 1, jsonSchema: schema, disallowedTools: ALL_DISALLOWED,
  });
  return collectJson<T>(messages);
}
```

- [ ] **Step 2: Migrate chatWithPrompt callers**

Update all `chatWithPrompt` / `chatWithPromptWithUsage` call sites to use `queryText`:

| File | Method | PromptId |
|---|---|---|
| `service-conversation.ts:498` | `generateConversationTitle` | `ApplicationGenerateTitle` |
| `service-conversation.ts:556` | short summary | `ConversationSummaryShort` |
| `service-conversation.ts:567` | full summary | `ConversationSummaryFull` |
| `service-project.ts:83` | project short summary | `ProjectSummaryShort` |
| `service-project.ts:93` | project full summary | `ProjectSummaryFull` |
| `UserProfileService.ts:56` | extract candidates | `MemoryExtractCandidatesJson` |
| `UserProfileService.ts:101` | organize profile | `UserProfileOrganizeMarkdown` |
| `rerank/llm.ts:40` | LLM reranker | `SearchRerankRankGpt` |
| `ImageDocumentLoader.ts:130` | image summary | `ImageSummary` |
| `ImageDocumentLoader.ts:207` | image description | `ImageDescription` |
| `DocumentLoaderHelpers.ts:154` | doc summary | `DocSummaryShort` / `DocSummaryFull` |
| `useAIAnalysisPostAIInteractions.ts:177` | save filename | `AiAnalysisSaveFileName` |
| `useAIAnalysisPostAIInteractions.ts:209` | save folder | `AiAnalysisSaveFolder` |
| `BuildUserProfileRunner.ts:132` | build profile | profile prompt |

Each migration follows the same pattern:
```typescript
// Before:
const result = await aiServiceManager.chatWithPrompt(promptId, variables);
// After:
const result = await aiServiceManager.queryText(promptId, variables);
```

- [ ] **Step 3: Migrate chatWithPromptStream callers**

Update streaming call sites to use `queryStream`:

| File | PromptId |
|---|---|
| `DocSimpleAgent.ts:157` | `AiAnalysisTitle` |
| `MobileVaultSearchAgent.ts:210` | `AiAnalysisTitle` |
| `useAIAnalysisPostAIInteractions.ts:70` | followup prompts |
| `useAIAnalysisPostAIInteractions.ts:320` | overview regenerate |

- [ ] **Step 4: Migrate streamObjectWithPrompt callers**

Update all `streamObjectWithPrompt` / `streamObjectWithPromptWithUsage` call sites to use `queryStructured`:

| File | PromptId | Schema |
|---|---|---|
| `intuition.recon.ts:167` | `KnowledgeIntuitionSubmit` | `knowledgeIntuitionSubmitSchema` |
| `hubDiscover.ts:3247` | `HubSemanticMerge` | `hubSemanticMergeLlmSchema` |
| `hubDocServices.ts:359` | `HubDocSummary` | `hubDocSummaryLlmSchema` |
| `TagService.ts:493` | `DocTagGenerateJson` | `docTagResponseSchema` |

Each migration:
```typescript
// Before:
const result = await aiServiceManager.streamObjectWithPrompt(promptId, variables, schema);
// After:
const result = await aiServiceManager.queryStructured(promptId, variables, zodToJsonSchema(schema));
```

- [ ] **Step 5: Remove old methods from AIServiceManager**

Delete `blockChat`, `streamChat`, `chatWithPrompt`, `chatWithPromptWithUsage`, `chatWithPromptStream`, `streamObjectWithPrompt`, `streamObjectWithPromptWithUsage`, `getMultiChat`, `getModelInstanceForPrompt` and all references to `MultiProviderChatService`.

- [ ] **Step 6: Clean up types.ts**

In `src/core/providers/types.ts`, remove all re-exports from `'ai'` (`LanguageModelUsage`, `FinishReason`, `LanguageModel`, etc.). Keep `LLMStreamEvent` and related UI types. Replace `LanguageModelUsage` references with a local `LLMUsage` type (which likely already exists).

- [ ] **Step 7: Build + test**

```bash
npm run build
```

Fix any remaining import errors. Test chat mode, vault search, title generation in Obsidian.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: migrate chat mode and all chatWithPrompt callers to Agent SDK query()"
```

---

### SUB-WAVE A CHECKPOINT

**Gate:** `npm run build` passes. Vault search works. Chat title generation works. Tag inference works.
**Merge to master before continuing.**

---

## Sub-Wave B: Feature Migration (Tasks 5-9)

### Task 5: ReportOrchestrator Migration

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts` (6 `streamText` → `queryWithProfile`)

**Context:** ReportOrchestrator has 6 direct `streamText` calls that bypass the service layer. Each needs to become a `queryWithProfile` Pattern B call with the same prompt template.

- [ ] **Step 1: Replace each streamText call**

The 6 call sites at lines 169, 271, 364, 409, 489, 529 all follow the same pattern:

```typescript
// Before (e.g., line 169):
const result = streamText({ model, system: systemPrompt, prompt: userPrompt, maxTokens: 4096 });
for await (const chunk of result.fullStream) { ... }

// After:
const stream = queryWithProfile(profile, {
  prompt: userPrompt, systemPrompt, maxTurns: 1,
});
for await (const msg of stream) {
  // Extract text deltas from SDK messages
  const text = extractTextDelta(msg);
  if (text) { /* same chunk handling */ }
}
```

Preserve the parallel execution pattern — `generateReport` fires all sections concurrently via `Promise.allSettled`.

- [ ] **Step 2: Remove `streamText` import from ReportOrchestrator**

Delete `import { streamText } from 'ai'` at line 1.

- [ ] **Step 3: Remove model resolution calls**

Replace `mgr.getModelInstanceForPrompt(promptId)` with `ProfileRegistry.getInstance().getActiveAgentProfile()`.

- [ ] **Step 4: Build + verify report generation**

```bash
npm run build
```

Test: run a vault search, approve plan, verify all report sections generate correctly.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: migrate ReportOrchestrator from streamText to Agent SDK query()"
```

---

### Task 6: Document Agents Migration

**Files:**
- Modify: `src/service/agents/DocSimpleAgent.ts:67-188` (Experimental_Agent → query() Pattern A)
- Modify: `src/service/agents/FollowupChatAgent.ts:79-132` (Experimental_Agent → query() Pattern A)

- [ ] **Step 1: Rewrite DocSimpleAgent**

Replace `new Agent<DocSimpleToolSet>({ model, tools, ... })` with `queryWithProfile()` Pattern A. Register the same 11 tools as an MCP server (like VaultSearchAgentSDK does).

```typescript
// DocSimpleAgent.ts �� new pattern:
async *stream(query: string, systemPrompt: string): AsyncGenerator<LLMStreamEvent> {
  const profile = ProfileRegistry.getInstance().getActiveAgentProfile()!;
  const mcpServer = buildDocSimpleMcpServer(this.tools);
  const messages = queryWithProfile(profile, {
    prompt: query, systemPrompt, maxTurns: 15,
    mcpServers: { doc: mcpServer },
    allowedTools: ['mcp__doc__*'],
  });
  yield* translateSdkMessages(messages);
}
```

- [ ] **Step 2: Rewrite FollowupChatAgent**

Same pattern as DocSimpleAgent but with `maxTurns: 5` and followup-specific tools.

- [ ] **Step 3: Remove `Experimental_Agent` import**

Delete `import { Experimental_Agent as Agent, hasToolCall } from 'ai'` from both files.

- [ ] **Step 4: Build + test**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: migrate DocSimpleAgent and FollowupChatAgent to Agent SDK query()"
```

---

### Task 7: Auxiliary Agents Migration

**Files:**
- Modify: `src/service/agents/SynthesizeAgent.ts:39` (1 `streamText` call)
- Modify: `src/service/agents/PatternDiscoveryAgent.ts:49` (1 `generateText` call)
- Modify: `src/service/agents/intuition-helper/intuition.recon.ts:100` (1 `streamText` + 1 `streamObjectWithPrompt`)
- Modify: `src/service/agents/AIGraphAgent.ts` (uses `blockChat`)

Each agent's migration is straightforward — replace the single call with `queryWithProfile()`.

- [ ] **Step 1: Migrate SynthesizeAgent**

```typescript
// Before: streamText({ model, system, prompt, maxTokens: 8192 })
// After: queryWithProfile(profile, { prompt, systemPrompt, maxTurns: 1 })
```

- [ ] **Step 2: Migrate PatternDiscoveryAgent**

```typescript
// Before: generateText({ model, prompt, maxTokens: 2000 })
// After: queryWithProfile(profile, { prompt, maxTurns: 1 })
// Then: collectText(messages) + JSON.parse
```

- [ ] **Step 3: Migrate intuition.recon.ts**

Two calls:
1. Line 100: `streamText` with tools → `queryWithProfile` Pattern A
2. Line 167: `streamObjectWithPrompt` → `queryStructured` via `AIServiceManager`

- [ ] **Step 4: Migrate AIGraphAgent**

Replace `getMultiChat().blockChat()` with `queryText` from `AIServiceManager`.

- [ ] **Step 5: Remove all remaining `from 'ai'` imports in agent files**

Grep to verify:
```bash
grep -r "from 'ai'" src/service/agents/
```
Should return zero results.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: migrate SynthesizeAgent, PatternDiscovery, intuition.recon, AIGraphAgent to SDK"
```

---

### Task 8: Embedding Helper

**Files:**
- Create: `src/core/embeddings/embedClient.ts`
- Modify: `src/service/search/query/queryService.ts:71,199` (replace embedding calls)
- Modify: `src/service/search/index/indexService.ts:738` (replace embedding calls)
- Test: `test/embed-client.test.ts`

- [ ] **Step 1: Write embedClient.ts**

```typescript
// src/core/embeddings/embedClient.ts
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { toEmbeddingConfig } from '@/core/profiles/materialize';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const profile = ProfileRegistry.getInstance().getActiveEmbeddingProfile();
  if (!profile) throw new Error('No embedding profile configured');
  const config = toEmbeddingConfig(profile);
  if (!config) throw new Error('Embedding endpoint not configured on active profile');

  const response = await fetch(`${config.endpoint}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.data.map((item: any) => item.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [result] = await embedTexts([text]);
  return result;
}
```

- [ ] **Step 2: Replace embedding call sites**

In `queryService.ts` and `indexService.ts`, replace:
```typescript
// Before:
const embeddings = await aiServiceManager.getMultiChat().generateEmbeddings(texts, model, provider);
// After:
const embeddings = await embedTexts(texts);
```

- [ ] **Step 3: Write test**

```typescript
// test/embed-client.test.ts — mock fetch, verify request format, verify response parsing
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add embedClient helper, replace provider-based embedding calls"
```

---

### Task 9: MobileVaultSearchAgent Adaptation

**Files:**
- Modify: `src/service/agents/MobileVaultSearchAgent.ts` (uses `streamChat`)

**Context:** Mobile agent uses `multiChat.streamChat()` and `chatWithPromptStream()`. Since the plugin is going desktop-only for AI features, this file can be simplified or gated.

- [ ] **Step 1: Assess mobile agent usage**

Since `isDesktopOnly: true` will be set, mobile vault search should be disabled. Two options:
- **Option A:** Delete `MobileVaultSearchAgent.ts` entirely (mobile AI is dead)
- **Option B:** Keep it as a lightweight fallback that shows "AI features require desktop"

Choose Option A — the mobile support was already conditional (`Platform.isMobile` guard in `VaultSearchAgent.ts`).

- [ ] **Step 2: Update VaultSearchAgent router**

Remove the mobile branch in `VaultSearchAgent.ts:26-55`. The router always goes to `VaultSearchAgentSDK`.

- [ ] **Step 3: Delete MobileVaultSearchAgent.ts**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: remove MobileVaultSearchAgent (plugin is now desktop-only for AI)"
```

---

### SUB-WAVE B CHECKPOINT

**Gate:** `npm run build` passes. Zero `from 'ai'` imports remain outside `core/providers/` (which we haven't deleted yet). All agents work via Agent SDK. Embeddings work via the new helper.
**Merge to master before continuing.**

---

## Sub-Wave C: Cleanup (Tasks 10-12)

### Task 10: Delete Old Provider Stack

**Files to delete:**
- `src/core/providers/adapter/ai-sdk-adapter.ts`
- `src/core/providers/base/claude.ts`
- `src/core/providers/base/openai.ts`
- `src/core/providers/base/gemini.ts`
- `src/core/providers/base/ollama.ts`
- `src/core/providers/base/openrouter.ts`
- `src/core/providers/base/perplexity.ts`
- `src/core/providers/base/factory.ts`
- `src/core/providers/MultiProviderChatService.ts`
- `src/core/providers/helpers/stream-helper.ts`
- `src/core/providers/helpers/message-helper.ts`
- `src/service/agents/core/tool-executor.ts`
- `src/service/chat/model-resolution.ts`

**Dependencies to remove from package.json:**
- `ai`
- `@ai-sdk/anthropic`
- `@ai-sdk/openai`
- `@ai-sdk/google`
- `@ai-sdk/perplexity`
- `@openrouter/ai-sdk-provider`
- `ollama-ai-provider-v2`

- [ ] **Step 1: Grep for remaining imports**

```bash
grep -r "from 'ai'" src/
grep -r "@ai-sdk/" src/
grep -r "ollama-ai-provider" src/
grep -r "openrouter/ai-sdk" src/
grep -r "MultiProviderChatService" src/
grep -r "ProviderServiceFactory" src/
grep -r "ai-sdk-adapter" src/
grep -r "stream-helper" src/
grep -r "message-helper" src/
grep -r "tool-executor" src/
```

Fix any remaining references before deleting files.

- [ ] **Step 2: Delete files**

```bash
rm src/core/providers/adapter/ai-sdk-adapter.ts
rm src/core/providers/base/claude.ts src/core/providers/base/openai.ts
rm src/core/providers/base/gemini.ts src/core/providers/base/ollama.ts
rm src/core/providers/base/openrouter.ts src/core/providers/base/perplexity.ts
rm src/core/providers/base/factory.ts
rm src/core/providers/MultiProviderChatService.ts
rm src/core/providers/helpers/stream-helper.ts src/core/providers/helpers/message-helper.ts
rm src/service/agents/core/tool-executor.ts
rm src/service/chat/model-resolution.ts
```

- [ ] **Step 3: Remove packages from package.json**

```bash
npm uninstall ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google @ai-sdk/perplexity @openrouter/ai-sdk-provider ollama-ai-provider-v2
```

- [ ] **Step 4: Clean types.ts**

In `src/core/providers/types.ts`, remove all `import ... from 'ai'` lines. Keep only the plugin's own types (`LLMStreamEvent`, `LLMUsage`, `LLMRequest`, etc.). If any of these reference AI SDK types, replace them with standalone definitions.

- [ ] **Step 5: Build and fix**

```bash
npm run build
```

Fix any remaining compilation errors from dangling references.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: delete Vercel AI SDK stack — all LLM calls now go through Agent SDK"
```

---

### Task 11: Settings UI Overhaul

**Files:**
- Create: `src/ui/view/settings/ProfileSettingsTab.tsx`
- Modify: `src/ui/view/settings/ModelConfigTab.tsx` (replace ProviderSettings with ProfileSettings)
- Delete: `src/ui/view/settings/component/ProviderSettings.tsx`
- Modify: `src/ui/view/settings/hooks/useSettingsUpdate.ts` (add profile update functions)

**Note:** This task involves UI design. The visual companion should be used to review mockups with the user before implementation.

- [ ] **Step 1: Design Profile settings UI**

The new "Model Config" tab shows:
1. **Profile list** — cards showing name, kind badge, active indicator
2. **Add Profile** button with preset picker (Anthropic Direct / OpenRouter / LiteLLM / Custom)
3. **Profile editor** — form with: name, baseUrl, apiKey/authToken, primaryModel, fastModel, embedding fields
4. **Active profile selectors** — two dropdowns at top: "Agent Profile" and "Embedding Profile"
5. **SDK Settings** — collapsible section: CLI path override, warmup on load toggle

This is a standard CRUD settings panel. Use existing shadcn/ui components from the project.

- [ ] **Step 2: Implement ProfileSettingsTab**

Build the React component with Zustand store integration.

- [ ] **Step 3: Wire into ModelConfigTab**

Replace `<ProviderSettingsComponent>` with `<ProfileSettingsTab>`.

- [ ] **Step 4: Delete old ProviderSettings**

```bash
rm src/ui/view/settings/component/ProviderSettings.tsx
```

- [ ] **Step 5: Test in Obsidian settings panel**

Verify: add profile, edit profile, switch active profile, delete profile.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: replace provider settings UI with Profile-based configuration"
```

---

### Task 12: Build Config + Manifest

**Files:**
- Modify: `manifest.json` (`isDesktopOnly: true`)
- Modify: `esbuild.config.mjs` (clean up external list if needed)
- Modify: `src/app/settings/types.ts` (remove old `llmProviderConfigs` type, clean up `AIServiceSettings`)

- [ ] **Step 1: Flip isDesktopOnly**

In `manifest.json:10`:
```json
"isDesktopOnly": true
```

- [ ] **Step 2: Clean up AIServiceSettings type**

Remove `llmProviderConfigs`, `defaultModel` `{provider, modelId}` pattern, and other v1 fields that are now handled by the Profile Registry. Keep fields unrelated to provider selection.

- [ ] **Step 3: Remove mobile guards for AI features**

The `Platform.isMobile` guards in `main.ts` and `VaultSearchAgent.ts` that skip AI initialization can be simplified (AI features are always available since the plugin is desktop-only).

- [ ] **Step 4: Archive superseded docs**

```bash
mkdir -p docs/superpowers/archive
mv docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md docs/superpowers/archive/
mv docs/superpowers/specs/2026-04-10-search-inspector-tools-overhaul-design.md docs/superpowers/archive/
mv docs/superpowers/plans/2026-04-10-search-inspector-tools-overhaul.md docs/superpowers/archive/
```

- [ ] **Step 5: Final build + full test**

```bash
npm run build
npm run test
```

Verify in Obsidian:
- [ ] Vault search works
- [ ] Chat works
- [ ] Report generation works
- [ ] Title/tag/summary generation works
- [ ] Embeddings/indexing works
- [ ] Settings UI shows Profile config
- [ ] Plugin loads without errors

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: complete Provider v2 — desktop-only, archive v1 docs"
```

---

### SUB-WAVE C CHECKPOINT

**Gate:** `npm run build` and `npm run test` pass. Zero `@ai-sdk/*` in package.json. Zero `from 'ai'` imports in src/. Settings show Profile UI. Plugin works end-to-end in Obsidian.
**Merge to master. Provider v2 is complete.**

---

## Risk Mitigation Notes

1. **Sub-wave A is the riskiest** — it changes the core chat/prompt plumbing. If something breaks, the entire plugin's LLM calls are affected. Test thoroughly at the checkpoint.

2. **Pattern B/C subprocess overhead** — after Task 4, benchmark simple calls (title gen, tag inference). If latency is unacceptable, add a fast-path using `@anthropic-ai/sdk` (a transitive dep) for `maxTurns: 1` calls. This is the spec's documented contingency (§10.2).

3. **The AI SDK `Experimental_Agent` class** used by DocSimpleAgent and FollowupChatAgent provides automatic tool-call looping. The Agent SDK's `query()` with `maxTurns` provides the same capability — verify tool execution works correctly in Task 6.

4. **Embedding endpoint compatibility** — the new `embedClient.ts` assumes OpenAI-format `/v1/embeddings`. Verify with the user's actual embedding provider.

5. **Settings migration** — `migrate-v1.ts` runs once on first load. If it fails, users start with empty profiles and are prompted to add one. This is acceptable as a fallback.
