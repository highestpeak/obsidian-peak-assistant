# Model Selection Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify model selection into profile-level pills only, add dynamic Ollama model fetch, and fix Ollama baseUrl passthrough.

**Architecture:** Remove `primaryModel`/`fastModel` from provider card UI. Add `activeAgentFastConfig` to `ProfileSettings` with a new "Agent Fast" pill. Fetch Ollama models at runtime from `/api/tags`. Enable free-text input in ModelCombobox for Ollama.

**Tech Stack:** React, TypeScript, Zustand-like pattern (ProfileRegistry singleton)

---

### Task 1: Add `activeAgentFastConfig` to types and ProfileRegistry

**Files:**
- Modify: `src/core/profiles/types.ts:35-42`
- Modify: `src/core/profiles/ProfileRegistry.ts:18-21,55-58,76-129,158-169,176-181,185-247,249-262`
- Test: `test/profile-registry.test.ts`

- [ ] **Step 1: Write failing test for Agent Fast config**

Add to `test/profile-registry.test.ts`, after the existing `setActiveAgentProfile` test block (line ~413):

```typescript
{
  name: 'ProfileRegistry: Agent Fast config CRUD',
  fn: () => {
    ProfileRegistry.resetInstance();
    const registry = ProfileRegistry.getInstance();
    const persisted: ProfileSettings[] = [];
    registry.load(
      { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
      (s) => { persisted.push(s); },
    );

    const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
    registry.addProfile(p);

    // Initially null
    assert.strictEqual(registry.getActiveAgentFastConfig(), null);

    // Set via config
    registry.setActiveAgentFastConfig({ profileId: p.id, modelId: 'claude-haiku-4-5' });
    const cfg = registry.getActiveAgentFastConfig();
    assert.ok(cfg);
    assert.strictEqual(cfg!.profile.id, p.id);
    assert.strictEqual(cfg!.modelId, 'claude-haiku-4-5');

    // Persisted snapshot includes it
    const last = persisted[persisted.length - 1];
    assert.ok(last.activeAgentFastConfig);
    assert.strictEqual(last.activeAgentFastConfig!.modelId, 'claude-haiku-4-5');

    // Clear
    registry.setActiveAgentFastConfig(null);
    assert.strictEqual(registry.getActiveAgentFastConfig(), null);
  },
},
{
  name: 'ProfileRegistry: delete profile clears Agent Fast config',
  fn: () => {
    ProfileRegistry.resetInstance();
    const registry = ProfileRegistry.getInstance();
    registry.load(
      { profiles: [], activeAgentProfileId: null, activeEmbeddingProfileId: null, sdkSettings: DEFAULT_SDK_SETTINGS },
      () => {},
    );

    const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
    registry.addProfile(p);
    registry.setActiveAgentFastConfig({ profileId: p.id, modelId: 'claude-haiku-4-5' });
    assert.ok(registry.getActiveAgentFastConfig());

    registry.deleteProfile(p.id);
    assert.strictEqual(registry.getActiveAgentFastConfig(), null);
  },
},
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/profile-registry.test.ts`
Expected: FAIL — `getActiveAgentFastConfig` is not a function

- [ ] **Step 3: Add `activeAgentFastConfig` to `ProfileSettings` type**

In `src/core/profiles/types.ts`, change lines 35-42:

```typescript
export interface ProfileSettings {
  profiles: Profile[];
  activeAgentConfig: RoleConfig | null;
  activeAgentFastConfig: RoleConfig | null;
  activeChatConfig: RoleConfig | null;
  activeEmbeddingConfig: RoleConfig | null;
  activeWebSearchConfig: RoleConfig | null;
  sdkSettings: SdkSettings;
}
```

- [ ] **Step 4: Add Agent Fast to ProfileRegistry**

In `src/core/profiles/ProfileRegistry.ts`:

Add field at line 21 (after `activeAgentConfig`):
```typescript
private activeAgentFastConfig: RoleConfig | null = null;
```

In `load()` at line 56 (after `activeAgentConfig` line), add:
```typescript
this.activeAgentFastConfig = (settings as any).activeAgentFastConfig ?? null;
```

Add getters after `getActiveAgentConfig()` (after line 88):
```typescript
getActiveAgentFastConfig(): { profile: Profile; modelId: string } | null {
  if (!this.activeAgentFastConfig) return null;
  const profile = this.profiles.find((p) => p.id === this.activeAgentFastConfig!.profileId);
  if (!profile) return null;
  return { profile, modelId: this.activeAgentFastConfig.modelId };
}
```

Add setter after `setActiveAgentConfig()` (after line 199):
```typescript
setActiveAgentFastConfig(config: RoleConfig | null): void {
  if (config && !this.profiles.some((p) => p.id === config.profileId)) {
    throw new Error(`Profile with id "${config.profileId}" not found`);
  }
  this.activeAgentFastConfig = config;
  this.persist();
}
```

In `deleteProfile()` at line 165 (after clearing activeAgentConfig), add:
```typescript
if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
```

In `toggleEnabled()` at line 177 (after clearing activeAgentConfig), add:
```typescript
if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
```

In `persist()` snapshot (line 253-261), add `activeAgentFastConfig`:
```typescript
const snapshot: ProfileSettings = {
  profiles: this.profiles.map((p) => ({ ...p })),
  activeAgentConfig: this.activeAgentConfig,
  activeAgentFastConfig: this.activeAgentFastConfig,
  activeChatConfig: this.activeChatConfig,
  activeEmbeddingConfig: this.activeEmbeddingConfig,
  activeWebSearchConfig: this.activeWebSearchConfig,
  sdkSettings: { ...this.sdkSettings },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- test/profile-registry.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/profiles/types.ts src/core/profiles/ProfileRegistry.ts test/profile-registry.test.ts
git commit -m "feat: add activeAgentFastConfig to ProfileSettings and ProfileRegistry"
```

---

### Task 2: Update `materialize.ts` to accept explicit model IDs

**Files:**
- Modify: `src/core/profiles/materialize.ts:14-43`
- Modify: `test/profile-registry.test.ts` (toAgentSdkEnv tests at lines 67-115)

- [ ] **Step 1: Update failing tests for new signature**

In `test/profile-registry.test.ts`, update the `toAgentSdkEnv` tests. Change the import if needed, then update:

```typescript
{
  name: 'toAgentSdkEnv: uses explicit model IDs',
  fn: () => {
    const p = createPresetProfile('anthropic', { apiKey: 'sk-ant-test' });
    const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
    assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
    assert.strictEqual(env.ANTHROPIC_API_KEY, 'sk-ant-test');
    assert.strictEqual(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-6');
    assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
    assert.strictEqual(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-opus-4-6');
  },
},
{
  name: 'toAgentSdkEnv: openrouter with bearer token',
  fn: () => {
    const p = createPresetProfile('openrouter', { authToken: 'sk-or-test' });
    const env = toAgentSdkEnv(p, 'anthropic/claude-opus-4-6', 'anthropic/claude-haiku-4-5');
    assert.strictEqual(env.ANTHROPIC_API_KEY, '');
    assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, 'sk-or-test');
    assert.strictEqual(env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api');
  },
},
{
  name: 'toAgentSdkEnv: throws on missing credentials',
  fn: () => {
    const p = createPresetProfile('anthropic');
    assert.throws(() => toAgentSdkEnv(p, 'model', 'fast'), /credentials/i);
  },
},
{
  name: 'toAgentSdkEnv: custom headers serialized',
  fn: () => {
    const p = createPresetProfile('anthropic', {
      apiKey: 'sk-test',
      customHeaders: { 'X-Org': 'test-org' },
    });
    const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
    assert.strictEqual(env.ANTHROPIC_CUSTOM_HEADERS, JSON.stringify({ 'X-Org': 'test-org' }));
  },
},
{
  name: 'toAgentSdkEnv: empty customHeaders not included',
  fn: () => {
    const p = createPresetProfile('anthropic', { apiKey: 'sk-test' });
    const env = toAgentSdkEnv(p, 'claude-opus-4-6', 'claude-haiku-4-5');
    assert.strictEqual(env.ANTHROPIC_CUSTOM_HEADERS, undefined);
  },
},
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- test/profile-registry.test.ts`
Expected: FAIL — `toAgentSdkEnv` expects 1 argument, got 3

- [ ] **Step 3: Update `toAgentSdkEnv` signature**

In `src/core/profiles/materialize.ts`, replace lines 14-27:

```typescript
export function toAgentSdkEnv(
  profile: Profile,
  agentModelId: string,
  agentFastModelId: string,
): Record<string, string> {
  const hasAuth = Boolean(profile.apiKey || profile.authToken);
  if (!hasAuth) {
    throw new Error(
      'Profile is missing credentials: at least one of apiKey or authToken must be set',
    );
  }

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: agentModelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: agentFastModelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: agentModelId,
  };
```

- [ ] **Step 4: Update callers of `toAgentSdkEnv`**

In `src/service/agents/core/sdkAgentPool.ts:141`, change:

```typescript
// Before:
const profileEnv = toAgentSdkEnv(profile);

// After:
const registry = ProfileRegistry.getInstance();
const agentConfig = registry.getActiveAgentConfig();
const agentFastConfig = registry.getActiveAgentFastConfig();
const agentModelId = agentConfig?.modelId ?? profile.primaryModel;
const agentFastModelId = agentFastConfig?.modelId ?? profile.primaryModel;
const profileEnv = toAgentSdkEnv(profile, agentModelId, agentFastModelId);
```

Add import at top of `sdkAgentPool.ts`:
```typescript
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
```

In `src/service/agents/vault-sdk/sdkProfile.ts:47-51`, update the `toSdkEnv` function similarly. Find where it calls env var assignment and change:

```typescript
// Before:
const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: profile.primaryModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: profile.primaryModel,
};

// After:
const registry = ProfileRegistry.getInstance();
const agentConfig = registry.getActiveAgentConfig();
const agentFastConfig = registry.getActiveAgentFastConfig();
const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: agentConfig?.modelId ?? profile.primaryModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: agentFastConfig?.modelId ?? profile.primaryModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: agentConfig?.modelId ?? profile.primaryModel,
};
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- test/profile-registry.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/profiles/materialize.ts src/service/agents/core/sdkAgentPool.ts src/service/agents/vault-sdk/sdkProfile.ts test/profile-registry.test.ts
git commit -m "refactor: toAgentSdkEnv accepts explicit model IDs from RoleConfig"
```

---

### Task 3: Add "Agent Fast" pill to StatusBar

**Files:**
- Modify: `src/ui/view/settings/components/StatusBar.tsx:144-194`

- [ ] **Step 1: Add Agent Fast pill**

In `src/ui/view/settings/components/StatusBar.tsx`, add after line 154 (after `agentConfig`):
```typescript
const agentFastConfig = registry.getActiveAgentFastConfig();
```

Then between the Agent pill and Chat pill (after line 168, before line 169), insert:

```typescript
<RoleSelectorChip
    role="agent"
    label="Agent Fast"
    activeConfig={agentFastConfig}
    profiles={profiles}
    onSelect={(config) => { registry.setActiveAgentFastConfig(config); bump(); }}
    onClear={() => { registry.setActiveAgentFastConfig(null); bump(); }}
/>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/StatusBar.tsx
git commit -m "feat: add Agent Fast pill to StatusBar"
```

---

### Task 4: Remove MODELS section from ProfileCard

**Files:**
- Modify: `src/ui/view/settings/components/ProfileCard.tsx:141,232-249`

- [ ] **Step 1: Remove the Models section**

In `src/ui/view/settings/components/ProfileCard.tsx`:

Delete lines 232-249 (the entire `{/* Models */}` block including `SectionTitle` and the grid with Primary/Fast Model comboboxes):

```tsx
// DELETE these lines:
{/* Models */}
<SectionTitle label="Models" />
<div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
    <ModelCombobox
        label="Primary Model"
        value={profile.primaryModel}
        onChange={(id) => update({ primaryModel: id })}
        providerKind={profile.kind}
        allowFreeText={allowFreeText}
    />
    <ModelCombobox
        label="Fast Model"
        value={profile.fastModel}
        onChange={(id) => update({ fastModel: id })}
        providerKind={profile.kind}
        allowFreeText={allowFreeText}
    />
</div>
```

- [ ] **Step 2: Update subtitle to not reference primaryModel**

Change line 141 from:
```typescript
const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${profile.primaryModel || '—'} · ${profile.apiKey ? 'API key set' : 'no key'}`;
```
To:
```typescript
const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${profile.apiKey ? 'API key set' : 'no key'}`;
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/components/ProfileCard.tsx
git commit -m "refactor: remove Primary/Fast Model from ProfileCard"
```

---

### Task 5: Dynamic Ollama model fetch

**Files:**
- Create: `src/core/providers/ollama/fetchOllamaModels.ts`
- Modify: `src/core/providers/model-registry.ts:89-130,159-168`
- Modify: `src/ui/view/settings/ProfilesTab.tsx:1-2,44-53`

- [ ] **Step 1: Create `fetchOllamaModels.ts`**

Create `src/core/providers/ollama/fetchOllamaModels.ts`:

```typescript
/**
 * Fetch installed models from a running Ollama instance.
 * Returns model names on success, empty array on failure (silent).
 */
export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Add `mergeRuntimeModels()` to ModelRegistry**

In `src/core/providers/model-registry.ts`, add after `getAllProviderIds()` (after line 209):

```typescript
/**
 * Merge runtime-discovered models (e.g. from Ollama API) into a provider's
 * model list. Deduplicates against existing catalog entries.
 */
public mergeRuntimeModels(providerId: string, modelIds: string[]): void {
  const key = normalizeProviderId(providerId);
  let provider = this.providers.get(key);
  if (!provider) {
    // Create a minimal provider entry if none exists
    provider = {
      id: providerId,
      name: providerId,
      defaultBaseUrl: '',
      icon: undefined,
      models: [],
      modelById: new Map(),
      modelByApiModelId: new Map(),
    };
    this.providers.set(key, provider);
  }

  for (const id of modelIds) {
    const normalized = normalizeModelKey(id);
    if (provider.modelById.has(normalized)) continue;

    const entry: InternalModelEntry = {
      id,
      displayName: id,
      modelType: DEFAULT_MODEL_TYPE,
      normalizedId: normalized,
    };
    provider.models.push(entry);
    provider.modelById.set(normalized, entry);
  }
}
```

- [ ] **Step 3: Trigger fetch on ProfilesTab mount**

In `src/ui/view/settings/ProfilesTab.tsx`, add imports at the top:

```typescript
import { useEffect } from 'react';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { modelRegistry } from '@/core/providers/model-registry';
```

(Also add `useEffect` to the existing `useState` import from React.)

Inside `ProfilesTab` function body, after `const profiles = ...` (line 54), add:

```typescript
// Fetch Ollama models on mount for each enabled Ollama profile
useEffect(() => {
  const ollamaProfiles = profiles.filter((p) => p.kind === 'ollama' && p.enabled);
  for (const p of ollamaProfiles) {
    fetchOllamaModels(p.baseUrl).then((models) => {
      if (models.length > 0) {
        modelRegistry.mergeRuntimeModels('ollama', models);
        bump();
      }
    });
  }
}, []);
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/core/providers/ollama/fetchOllamaModels.ts src/core/providers/model-registry.ts src/ui/view/settings/ProfilesTab.tsx
git commit -m "feat: dynamic Ollama model fetch on settings page load"
```

---

### Task 6: Enable free-text input in ModelCombobox for Ollama

**Files:**
- Modify: `src/ui/view/settings/components/ModelCombobox.tsx:106`
- Modify: `src/ui/view/settings/components/ProfileCard.tsx:140`

- [ ] **Step 1: Update ProfileCard to allow free text for Ollama**

In `src/ui/view/settings/components/ProfileCard.tsx`, change line 140:

```typescript
// Before:
const allowFreeText = profile.kind === 'custom' || profile.kind === 'litellm';

// After:
const allowFreeText = profile.kind === 'custom' || profile.kind === 'litellm' || profile.kind === 'ollama';
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/ProfileCard.tsx
git commit -m "feat: enable free-text model input for Ollama profiles"
```

---

### Task 7: Fix Ollama baseUrl passthrough in provider-factory

**Files:**
- Modify: `src/core/providers/vercel/provider-factory.ts:52-54`

- [ ] **Step 1: Pass baseUrl to ollama provider**

In `src/core/providers/vercel/provider-factory.ts`, change lines 52-54:

```typescript
// Before:
case 'ollama': {
    return ollama(modelId);
}

// After:
case 'ollama': {
    return ollama(modelId, { baseURL: baseUrl || undefined });
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors. Check that `ollama-ai-provider-v2`'s `ollama()` function accepts a second options argument with `baseURL`. If the type doesn't match, check the package's API.

- [ ] **Step 3: Commit**

```bash
git add src/core/providers/vercel/provider-factory.ts
git commit -m "fix: pass profile baseUrl to Ollama provider factory"
```

---

### Task 8: Update StatusBar `getModelsForProfile` fallback

**Files:**
- Modify: `src/ui/view/settings/components/StatusBar.tsx:17-25`

- [ ] **Step 1: Remove primaryModel/fastModel fallback**

In `src/ui/view/settings/components/StatusBar.tsx`, change `getModelsForProfile` (lines 17-25):

```typescript
function getModelsForProfile(profile: Profile): string[] {
    const catalogId = PROVIDER_CATALOG[profile.kind];
    if (catalogId) {
        const models = modelRegistry.getModelsForProvider(catalogId);
        if (models.length > 0) return models.map(m => m.id);
    }
    // No fallback to primaryModel/fastModel — catalog or runtime models only
    return [];
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/StatusBar.tsx
git commit -m "refactor: remove primaryModel/fastModel fallback in StatusBar model list"
```

---

### Task 9: Run full test suite and build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: No errors, no warnings about missing exports

- [ ] **Step 3: Verify no remaining references to removed pattern**

Search for code that reads `profile.primaryModel` or `profile.fastModel` outside of migration/preset code. These should be limited to:
- `src/core/profiles/presets.ts` (still needed for preset defaults, but fields are deprecated)
- `src/core/profiles/migrate-v1.ts` (migration code)
- `test/profile-registry.test.ts` (preset tests)

Run: `grep -rn 'profile\.primaryModel\|profile\.fastModel' src/ --include='*.ts' --include='*.tsx' | grep -v 'presets\.ts\|migrate-v1\.ts\|migrate-v2\.ts'`

Any hits outside presets/migration are code that needs updating.
