# Model Selection Unification

## Problem

Three issues with the current model selection system:

1. **Dual model config**: Provider cards have `primaryModel`/`fastModel` fields, while profile-level pills (Agent/Chat/Embedding/Web Search) independently assign models via `RoleConfig.modelId`. Two systems doing the same job, confusing UX.
2. **Static Ollama model list**: Ollama models are hardcoded in `data/model-catalog.json` (16 models). Missing critical embedding models like `nomic-embed-text`. No runtime fetch from Ollama API.
3. **Ollama baseUrl ignored**: `provider-factory.ts:52` calls `ollama(modelId)` without forwarding `profile.baseUrl`.

## Design

### 1. Remove Primary/Fast Model from Provider Cards

**ProfileCard.tsx:234–249** — delete the "MODELS" section (Primary Model + Fast Model selectors).

Provider cards retain only:
- CONNECTION: Type, Base URL, API Key
- EMBEDDING: Endpoint, API Key, Model
- Bottom role toggles: Use as Agent / Embedding / Web Search

**Profile type** (`types.ts:11–28`):
- Keep `primaryModel`/`fastModel` fields for backward compat, mark as `@deprecated`
- No new code reads these fields; all reads go through `RoleConfig`

### 2. Add "Agent Fast" Pill

Add a fifth pill to the StatusBar for the Agent SDK's lightweight model tier.

**`ProfileSettings`** (`types.ts:35–42`) — add:
```typescript
activeAgentFastConfig: RoleConfig | null;
```

**`ProfileRegistry`** (`ProfileRegistry.ts`) — add:
- `getActiveAgentFastConfig(): { profile: Profile; modelId: string } | null`
- `setActiveAgentFastConfig(config: RoleConfig): void`

**`StatusBar.tsx:161–193`** — add `RoleSelectorChip` for "Agent Fast" between Agent and Chat.

**`materialize.ts:14–43`** — `toAgentSdkEnv()` changes:
```typescript
// Before:
ANTHROPIC_DEFAULT_OPUS_MODEL: profile.primaryModel,
ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
ANTHROPIC_DEFAULT_SONNET_MODEL: profile.primaryModel,

// After: accept two RoleConfig-resolved model IDs
export function toAgentSdkEnv(
  profile: Profile,
  agentModelId: string,
  agentFastModelId: string,
): Record<string, string> {
  // ...
  ANTHROPIC_DEFAULT_OPUS_MODEL: agentModelId,
  ANTHROPIC_DEFAULT_SONNET_MODEL: agentModelId,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: agentFastModelId,
}
```

**Callers** (`sdkAgentPool.ts:141`, `sdkProfile.ts:47–51`) — resolve both model IDs from `ProfileRegistry` before calling `toAgentSdkEnv()`.

### 3. Ollama Dynamic Model Fetch

**New utility** `src/core/providers/ollama/fetchOllamaModels.ts`:
```typescript
export async function fetchOllamaModels(baseUrl: string): Promise<string[]>
```
- `GET {baseUrl}/api/tags` → parse `response.models[].name`
- Timeout: 3s
- On failure: return `[]` (silent fail)

**ModelRegistry integration** (`model-registry.ts`):
- Add `mergeRuntimeModels(providerId: string, modelIds: string[])` — merges fetched models into the provider's model list, deduplicating against static catalog entries
- Models fetched at runtime are tagged `source: 'runtime'` to distinguish from catalog entries

**Settings page trigger** — when ProfilesTab mounts, for each enabled Ollama profile:
```typescript
fetchOllamaModels(profile.baseUrl).then(models => {
  modelRegistry.mergeRuntimeModels('ollama', models);
});
```

### 4. ModelCombobox Free Input for Ollama

**`ModelCombobox.tsx`** — when `providerKind === 'ollama'`:
- Allow typing arbitrary model names that don't exist in the list
- On blur/enter, if the typed value doesn't match any listed model, accept it as a custom model ID
- This is already partially supported by the Combobox pattern; ensure `onValueChange` accepts free text

This also applies to other provider kinds where users might have custom model deployments (e.g., `litellm`, `custom`).

### 5. Fix Ollama baseUrl Passthrough

**`provider-factory.ts:51–53`** — change:
```typescript
// Before:
case 'ollama': {
    return ollama(modelId);
}

// After:
case 'ollama': {
    return ollama(modelId, { baseURL: profile.baseUrl });
}
```

### 6. Data Migration

In `migrate-v1.ts` or a new `migrate-v2.ts`, on settings load:

1. For each profile with `primaryModel` set:
   - If `activeAgentConfig` is null → set `activeAgentConfig = { profileId: profile.id, modelId: profile.primaryModel }`
   - If `activeChatConfig` is null → set `activeChatConfig = { profileId: profile.id, modelId: profile.primaryModel }`
2. For each profile with `fastModel` set:
   - If `activeAgentFastConfig` is null → set `activeAgentFastConfig = { profileId: profile.id, modelId: profile.fastModel }`
3. Migration runs once; mark with a version flag in settings.

**Important**: Only fill empty configs. If the user already has pills configured, don't overwrite.

## Files Changed

| File | Change |
|------|--------|
| `src/core/profiles/types.ts:11–28` | Deprecate `primaryModel`/`fastModel`, add `activeAgentFastConfig` to `ProfileSettings` |
| `src/core/profiles/ProfileRegistry.ts` | Add Agent Fast config getters/setters |
| `src/core/profiles/materialize.ts:14–43` | Accept explicit model IDs instead of reading from profile |
| `src/core/profiles/migrate-v1.ts` | Add v2 migration for primaryModel/fastModel → RoleConfig |
| `src/ui/view/settings/components/ProfileCard.tsx:234–249` | Remove MODELS section |
| `src/ui/view/settings/components/StatusBar.tsx:161–193` | Add Agent Fast pill |
| `src/ui/view/settings/components/ModelCombobox.tsx` | Enable free input for ollama/custom kinds |
| `src/core/providers/vercel/provider-factory.ts:51–53` | Pass baseUrl to ollama() |
| `src/core/providers/model-registry.ts` | Add `mergeRuntimeModels()` |
| `src/core/providers/ollama/fetchOllamaModels.ts` | New: fetch models from Ollama API |
| `src/service/agents/core/sdkAgentPool.ts:141` | Resolve Agent + Agent Fast from registry |
| `src/service/agents/vault-sdk/sdkProfile.ts:47–51` | Update env var construction |

## Not In Scope

- Removing `primaryModel`/`fastModel` fields from the `Profile` type entirely (keep for backward compat)
- Dynamic model fetch for non-Ollama providers (OpenRouter already has full catalog)
- Changes to the chat-view ModelSelector (it uses the v1 system, separate migration)
