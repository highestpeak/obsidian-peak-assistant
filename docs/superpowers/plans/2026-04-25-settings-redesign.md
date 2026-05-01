# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chaotic 3-tab settings UI with a Profile-Centric design: searchable model combobox, unified embedding config, health status bar, dual-mode rendering (Settings tab + standalone modal), and `peak-config.json` for power-user settings.

**Architecture:** Three-tier settings (Essential UI → Advanced collapsed → peak-config.json). ProfileKind expanded from 4 to 8. Single `ModelCombobox` component replaces all model selectors. Embedding dual-knob eliminated — Profile is the single source of truth.

**Tech Stack:** React 18, Zustand, Tailwind (pktw- prefix), Lucide icons, existing TemplateRegistry/ProfileRegistry infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-25-settings-redesign-design.md`

**Mockups:** `.superpowers/brainstorm/18773-*/content/mockup-full-settings.html`, `mockup-searchable-dropdown.html`, `mockup-providers-expanded.html`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/ui/view/settings/ProfilesTab.tsx` | Profiles tab: status bar + card list + add + advanced |
| `src/ui/view/settings/SearchTab.tsx` | Search & Indexing tab (simplified) |
| `src/ui/view/settings/components/StatusBar.tsx` | Health chips (Agent/Embedding/SQLite) |
| `src/ui/view/settings/components/ProfileCard.tsx` | Collapsible profile card with all fields |
| `src/ui/view/settings/components/ModelCombobox.tsx` | Searchable model dropdown |
| `src/ui/view/settings/components/AddProfileGrid.tsx` | 8-card provider picker |
| `src/ui/view/settings/components/DocTypeGrid.tsx` | Document type chip toggles |
| `src/ui/view/settings/components/ProviderIcon.tsx` | SVG icon per ProfileKind |
| `src/ui/view/SettingsModal.tsx` | Standalone modal wrapper |
| `src/core/profiles/peak-config.ts` | Load/merge peak-config.json from vault |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/profiles/types.ts:9` | Expand ProfileKind to 8 values |
| `src/core/profiles/presets.ts:15-94` | Add 4 new preset factories |
| `src/core/profiles/ProfileRegistry.ts:75-118` | Add `toggleEnabled(id)` method |
| `src/core/profiles/materialize.ts:26-43` | Handle new provider kinds in env mapping |
| `src/core/profiles/migrate-v1.ts:64` | `anthropic-direct` → `anthropic` rename |
| `src/app/settings/PluginSettingsLoader.ts:343-354` | Profile migration + deprecated field cleanup |
| `src/ui/view/SettingsView.tsx:10-79` | New 3-tab structure (Profiles/Search/General) |
| `src/ui/view/settings/GeneralTab.tsx:26-190` | Add attachment handling, simplify |
| `src/ui/view/settings/hooks/useSettingsUpdate.ts:152-199` | Remove deprecated model update helpers |
| `src/service/search/query/queryService.ts:65-68` | Fix embedding gate → read from ProfileRegistry |
| `src/service/search/index/indexService.ts:480-483` | Fix embedding gate → read from ProfileRegistry |
| `data/model-catalog.json:553-594` | Add ~25 OpenRouter models + Ollama models |
| `main.ts:194` | Register settings modal command |
| `src/app/commands/Register.ts:640-666` | Add `peak-open-settings` command |

### Deleted Files
| File | Reason |
|------|--------|
| `src/ui/view/settings/ModelConfigTab.tsx` | Replaced by ProfilesTab + peak-config.json |
| `src/ui/view/settings/ProfileSettingsTab.tsx` | Replaced by ProfileCard |
| `src/ui/view/settings/SearchSettingsTab.tsx` | Replaced by SearchTab |

---

## Task 1: ProfileKind Expansion + Presets

**Files:**
- Modify: `src/core/profiles/types.ts:9`
- Modify: `src/core/profiles/presets.ts:15-94`
- Modify: `src/core/profiles/materialize.ts:26-43`
- Modify: `src/core/profiles/migrate-v1.ts:64`

- [ ] **Step 1: Expand ProfileKind type**

In `src/core/profiles/types.ts:9`, replace:
```ts
export type ProfileKind = 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';
```
with:
```ts
export type ProfileKind = 'anthropic' | 'openai' | 'google' | 'perplexity' | 'ollama' | 'openrouter' | 'litellm' | 'custom';
```

- [ ] **Step 2: Add preset factories**

In `src/core/profiles/presets.ts`, rename the `'anthropic-direct'` key to `'anthropic'` at line 16, then add 4 new factory entries after the `'custom'` entry (line 94). Each follows the existing pattern (`createPresetProfile` → `PRESET_FACTORIES[kind](overrides)`):

```ts
'openai': (overrides) => ({
    name: overrides?.name ?? 'OpenAI',
    kind: 'openai' as ProfileKind,
    baseUrl: 'https://api.openai.com/v1',
    primaryModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    embeddingEndpoint: 'https://api.openai.com/v1',
    embeddingModel: 'text-embedding-3-small',
    ...buildBase(overrides),
}),
'google': (overrides) => ({
    name: overrides?.name ?? 'Google',
    kind: 'google' as ProfileKind,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    primaryModel: 'gemini-2.5-pro',
    fastModel: 'gemini-2.5-flash',
    embeddingEndpoint: null,
    embeddingModel: null,
    ...buildBase(overrides),
}),
'perplexity': (overrides) => ({
    name: overrides?.name ?? 'Perplexity',
    kind: 'perplexity' as ProfileKind,
    baseUrl: 'https://api.perplexity.ai',
    primaryModel: 'sonar-pro',
    fastModel: 'sonar',
    embeddingEndpoint: null,
    embeddingModel: null,
    ...buildBase(overrides),
}),
'ollama': (overrides) => ({
    name: overrides?.name ?? 'Ollama',
    kind: 'ollama' as ProfileKind,
    baseUrl: 'http://localhost:11434',
    primaryModel: 'llama3.1',
    fastModel: 'llama3.1',
    embeddingEndpoint: null,
    embeddingModel: null,
    ...buildBase(overrides),
}),
```

Note: `buildBase` is a helper that constructs `{ id, enabled, createdAt, apiKey, authToken, customHeaders, embeddingApiKey, icon, description }` with defaults — extract this from the existing pattern in each factory to DRY up the code.

- [ ] **Step 3: Update materialize.ts for new kinds**

In `src/core/profiles/materialize.ts:26-43`, the `toAgentSdkEnv` function currently only handles `openrouter` specially (sets `ANTHROPIC_API_KEY=''` + `ANTHROPIC_AUTH_TOKEN`). All other kinds use the same env-var mapping. The new kinds (`openai`, `google`, `perplexity`, `ollama`) work through the Agent SDK which only understands Anthropic env vars, so they follow the same default path. No logic change needed — just verify the existing `else` branch covers them.

- [ ] **Step 4: Update migrate-v1.ts**

In `src/core/profiles/migrate-v1.ts:64`, change the mapping:
```ts
// Before:
kind = 'anthropic-direct';
// After:
kind = 'anthropic';
```

- [ ] **Step 5: Add migration for existing profiles in PluginSettingsLoader.ts**

In `src/app/settings/PluginSettingsLoader.ts`, after the profile settings are loaded (~line 343-354), add a migration step that renames any existing `anthropic-direct` profiles:

```ts
// Migrate ProfileKind 'anthropic-direct' → 'anthropic'
if (settings.profileSettings?.profiles) {
    for (const p of settings.profileSettings.profiles) {
        if ((p as any).kind === 'anthropic-direct') {
            (p as any).kind = 'anthropic';
        }
    }
}
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds. No TypeScript errors from the kind expansion.

- [ ] **Step 7: Commit**

```bash
git add src/core/profiles/types.ts src/core/profiles/presets.ts src/core/profiles/materialize.ts src/core/profiles/migrate-v1.ts src/app/settings/PluginSettingsLoader.ts
git commit -m "feat(profiles): expand ProfileKind from 4 to 8 providers"
```

---

## Task 2: Model Catalog Expansion

**Files:**
- Modify: `data/model-catalog.json:553-594`

- [ ] **Step 1: Add OpenRouter models**

In `data/model-catalog.json`, within the `openrouter` provider's `models` array (after line 592), add entries for DeepSeek, Meta, Mistral, xAI, Cohere, Qwen, NVIDIA. Each entry follows the existing shape:

```json
{
  "id": "deepseek/deepseek-r1",
  "apiModelId": "deepseek/deepseek-r1",
  "icon": "deepseek",
  "modelType": "llm",
  "costInput": "0",
  "costOutput": "0",
  "tokenLimits": { "maxTokens": 128000, "maxInputTokens": 128000, "recommendedSummaryThreshold": 100000 },
  "capabilities": { "vision": false, "pdfInput": false, "tools": true, "webSearch": false, "reasoning": true, "maxCtx": 128000 }
}
```

Full list to add (21 models):
- `deepseek/deepseek-r1` (reasoning, 128K)
- `deepseek/deepseek-r1-0528` (reasoning, 128K)
- `deepseek/deepseek-chat-v3` (128K)
- `meta-llama/llama-4-maverick` (1M)
- `meta-llama/llama-4-scout` (512K)
- `meta-llama/llama-3.3-70b` (128K)
- `meta-llama/llama-3.1-405b` (128K)
- `mistralai/mistral-large-2` (128K)
- `mistralai/mistral-medium-3` (128K)
- `mistralai/codestral` (32K)
- `mistralai/ministral-8b` (128K)
- `x-ai/grok-3` (reasoning, 128K)
- `x-ai/grok-3-mini` (reasoning, 128K)
- `x-ai/grok-2` (128K)
- `cohere/command-a` (256K)
- `cohere/command-r-plus` (webSearch, 128K)
- `cohere/command-r` (webSearch, 128K)
- `qwen/qwen3-235b` (reasoning, 128K)
- `qwen/qwen3-30b` (reasoning, 128K)
- `qwen/qwen-2.5-72b` (128K)
- `nvidia/llama-3.1-nemotron-70b` (128K)

Also add `capabilities` and `tokenLimits` to existing OpenRouter entries that lack them (lines 559-592 use simplified shapes).

- [ ] **Step 2: Add Ollama models**

In the `ollama` provider's `models` array, add:
- `deepseek-r1` (reasoning)
- `qwen3` (reasoning)
- `gemma3`
- `phi4`
- `llama-3.3`
- `mistral-small`

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds. The JSON is imported statically by `model-registry.ts:1`.

- [ ] **Step 4: Commit**

```bash
git add data/model-catalog.json
git commit -m "feat(catalog): add 27 models to OpenRouter + Ollama"
```

---

## Task 3: ProviderIcon Component

**Files:**
- Create: `src/ui/view/settings/components/ProviderIcon.tsx`

- [ ] **Step 1: Create SVG icon component**

Create `src/ui/view/settings/components/ProviderIcon.tsx` — a mapping from `ProfileKind` to inline SVG. Each icon is a clean, recognizable brand representation:

```tsx
import React from 'react';
import { ProfileKind } from '@/core/profiles/types';
import { Settings2 } from 'lucide-react';

const ICON_SVGS: Record<ProfileKind, React.FC<{ size?: number }>> = {
    anthropic: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M13.827 3L22 21h-4.14l-1.636-3.6H9.776L8.14 21H4L12.173 3h1.654zm-.918 4.2L9.776 15.6h6.275L12.91 7.2z" fill="currentColor"/>
        </svg>
    ),
    openai: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z" fill="currentColor"/>
        </svg>
    ),
    google: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M12 11h8.533c.044.385.067.78.067 1.184 0 2.734-.98 5.036-2.678 6.6-1.485 1.371-3.518 2.183-5.922 2.183A8.967 8.967 0 0 1 3 12 8.967 8.967 0 0 1 12 3c2.348 0 4.36.826 5.946 2.18l-2.478 2.39C14.55 6.66 13.372 6.2 12 6.2c-3.2 0-5.8 2.6-5.8 5.8s2.6 5.8 5.8 5.8c2.8 0 4.622-1.6 5.02-3.8H12V11z" fill="currentColor"/>
        </svg>
    ),
    perplexity: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none"/>
        </svg>
    ),
    ollama: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
    ),
    openrouter: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none"/><path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
    ),
    litellm: ({ size = 20 }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M13 2L4 14h7l-2 8 11-12h-7l2-8z" fill="currentColor"/>
        </svg>
    ),
    custom: ({ size = 20 }) => <Settings2 size={size} />,
};

const ICON_GRADIENTS: Record<ProfileKind, string> = {
    anthropic: 'pktw-from-[#d4a574] pktw-to-[#c4956a]',
    openai: 'pktw-from-[#10a37f] pktw-to-[#1a7f5a]',
    google: 'pktw-from-[#4285f4] pktw-to-[#34a853]',
    perplexity: 'pktw-from-[#20b2aa] pktw-to-[#2dd4bf]',
    ollama: 'pktw-from-[#333] pktw-to-[#555]',
    openrouter: 'pktw-from-[#6366f1] pktw-to-[#818cf8]',
    litellm: 'pktw-from-[#059669] pktw-to-[#34d399]',
    custom: 'pktw-from-[#3a3a3a] pktw-to-[#4a4a4a]',
};

export const PROVIDER_LABELS: Record<ProfileKind, { label: string; desc: string }> = {
    anthropic: { label: 'Anthropic', desc: 'Claude models' },
    openai: { label: 'OpenAI', desc: 'GPT & o-series' },
    google: { label: 'Google', desc: 'Gemini models' },
    perplexity: { label: 'Perplexity', desc: 'Search-first AI' },
    ollama: { label: 'Ollama', desc: 'Local models' },
    openrouter: { label: 'OpenRouter', desc: 'All providers' },
    litellm: { label: 'LiteLLM', desc: 'Proxy gateway' },
    custom: { label: 'Custom', desc: 'Any OpenAI-compatible' },
};

interface ProviderIconProps {
    kind: ProfileKind;
    size?: number;
    className?: string;
}

export function ProviderIcon({ kind, size = 34, className }: ProviderIconProps) {
    const IconSvg = ICON_SVGS[kind] ?? ICON_SVGS.custom;
    const gradient = ICON_GRADIENTS[kind] ?? ICON_GRADIENTS.custom;
    return (
        <div className={`pktw-rounded-lg pktw-flex pktw-items-center pktw-justify-center pktw-bg-gradient-to-br ${gradient} pktw-text-white ${className ?? ''}`}
             style={{ width: size, height: size }}>
            <IconSvg size={size * 0.55} />
        </div>
    );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/ProviderIcon.tsx
git commit -m "feat(settings): add ProviderIcon component with SVG per ProfileKind"
```

---

## Task 4: ModelCombobox Component

**Files:**
- Create: `src/ui/view/settings/components/ModelCombobox.tsx`

- [ ] **Step 1: Create the combobox**

This is the core shared component. It renders a text input that opens a filterable dropdown of models grouped by vendor. Build it with the following API:

```tsx
interface ModelComboboxProps {
    value: string;                   // current model id
    onChange: (modelId: string) => void;
    providerKind: ProfileKind;       // filters which models to show
    allowFreeText?: boolean;         // true for custom/litellm
    placeholder?: string;
    label?: string;
}
```

Key behaviors:
- **Data source**: import `modelRegistry` from `@/core/providers/model-registry`. Call `modelRegistry.getModelsForProvider(providerId)` to get the model list for direct providers. For `openrouter`/`litellm`, get all providers and flatten. For `ollama`, use catalog models (live detection is a future enhancement).
- **Provider-to-catalog mapping**: `anthropic` → catalog `claude`, `openai` → catalog `openai`, `google` → catalog `gemini`, `perplexity` → catalog `perplexity`, `ollama` → catalog `ollama`, `openrouter` → catalog `openrouter`, `litellm` → all catalogs.
- **Grouping**: For `openrouter`/`litellm`, group by vendor prefix (e.g., `anthropic/`, `openai/`, `deepseek/`). For direct providers, no grouping needed (flat list).
- **Filtering**: Case-insensitive substring match on model id. Empty groups hidden. Matching text highlighted in purple (`pktw-text-pk-accent`).
- **Capability tags**: Read from model entry's `capabilities` field. Show tags: `reason` (reasoning=true), `vision` (vision=true), `search` (webSearch=true), context size formatted from `maxCtx` (e.g., `128K`, `1M`).
- **Keyboard**: `ArrowDown`/`ArrowUp` navigate, `Enter` select, `Escape` close.
- **Free text**: When `allowFreeText=true` and no match found, show "Press Enter to use `<value>`". When false, only catalog models can be selected.
- **State**: Use local `useState` for `isOpen`, `filter`, `highlightIndex`. `useRef` for the container (click-outside close) and input.

The component should be ~150-200 lines. Use `cn()` from `@/ui/react/lib/utils` for class merging, standard Tailwind `pktw-*` classes.

Note: `ModelRegistry` currently only has `getModelIdsForProvider(providerId)` (returns `string[]`). We need `getModelsForProvider(providerId)` that returns the full model objects with capabilities. Add this method to `src/core/providers/model-registry.ts:159`:

```ts
public getModelsForProvider(providerId: string): ReadonlyArray<{ id: string; capabilities?: any; tokenLimits?: any }> {
    const entry = this.providers.get(normalizeProviderId(providerId));
    return entry ? [...entry.modelById.values()] : [];
}
```

Also add a method to get all providers:

```ts
public getAllProviderIds(): string[] {
    return [...this.providers.keys()];
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/ModelCombobox.tsx src/core/providers/model-registry.ts
git commit -m "feat(settings): add searchable ModelCombobox component"
```

---

## Task 5: StatusBar Component

**Files:**
- Create: `src/ui/view/settings/components/StatusBar.tsx`

- [ ] **Step 1: Create status bar**

Reads from `ProfileRegistry`, `sqliteStoreManager`, and renders health chips:

```tsx
import React from 'react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export function StatusBar() {
    const registry = ProfileRegistry.getInstance();
    const agentProfile = registry.getActiveAgentProfile();
    const embeddingProfile = registry.getActiveEmbeddingProfile() ?? agentProfile;
    const sqliteReady = sqliteStoreManager.isInitialized();

    const hasEmbedding = embeddingProfile?.embeddingEndpoint && embeddingProfile?.embeddingModel;

    return (
        <div className="pktw-flex pktw-gap-2.5 pktw-mb-5 pktw-flex-wrap">
            <Chip ok={!!agentProfile}
                  label={agentProfile ? `Agent: ${agentProfile.primaryModel}` : 'Agent: Not configured'} />
            <Chip ok={!!hasEmbedding}
                  label={hasEmbedding ? `Embedding: ${embeddingProfile!.embeddingModel}` : 'Embedding: Not configured'} />
            <Chip ok={sqliteReady}
                  label={sqliteReady ? 'SQLite: ready' : 'SQLite: unavailable'} />
        </div>
    );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs ${
            ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success' : 'pktw-bg-pk-error-muted pktw-text-pk-error'
        }`}>
            <div className={`pktw-w-1.5 pktw-h-1.5 pktw-rounded-full ${ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error'}`} />
            {label}
        </div>
    );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/StatusBar.tsx
git commit -m "feat(settings): add StatusBar health chips component"
```

---

## Task 6: ProfileCard Component

**Files:**
- Create: `src/ui/view/settings/components/ProfileCard.tsx`

- [ ] **Step 1: Create profile card**

The largest new component (~200 lines). A collapsible card with Connection, Models, Embedding sections and Role toggles. Props:

```tsx
interface ProfileCardProps {
    profile: Profile;
    isActiveAgent: boolean;
    isActiveEmbedding: boolean;
    onUpdate: (id: string, updates: Partial<Profile>) => void;
    onDelete: (id: string) => void;
    onToggleAgent: (id: string) => void;
    onToggleEmbedding: (id: string) => void;
    onToggleEnabled: (id: string) => void;
}
```

Structure:
- **Header**: `<ProviderIcon kind={profile.kind}>`, profile name, role badges (`Agent`/`Embedding` when active), subtitle (kind · model · key status), Test button, ⋯ menu (Popover with: Rename, Duplicate, Enable/Disable, Delete).
- **Body** (visible when expanded via local `isExpanded` state):
  - **Connection section**: Type (plain `<select>` of ProfileKinds since these are only 8 static values), Base URL (`<input>`), API Key (`<input type="password">`).
  - **Models section**: Primary Model (`<ModelCombobox providerKind={profile.kind}>`), Fast Model (`<ModelCombobox>`). Grid layout `grid-cols-2`.
  - **Embedding section**: Endpoint (`<input>`), API Key (`<input type="password">`), Model (`<ModelCombobox>` filtered to embedding models — for now use the same provider catalog; embedding-specific filtering is a future refinement).
  - **Role toggles**: Two checkbox-style toggles: "Use as Agent", "Use as Embedding". Clicking calls `onToggleAgent`/`onToggleEmbedding`.

All field changes call `onUpdate(profile.id, { fieldName: newValue })` on blur or on selection.

The card border is `pktw-border-pk-accent` when `isActiveAgent || isActiveEmbedding`, normal `pktw-border-pk-border` otherwise. Disabled profiles have `pktw-opacity-45`.

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/ProfileCard.tsx
git commit -m "feat(settings): add ProfileCard collapsible component"
```

---

## Task 7: AddProfileGrid Component

**Files:**
- Create: `src/ui/view/settings/components/AddProfileGrid.tsx`

- [ ] **Step 1: Create provider picker**

Shows an 8-card grid of provider icons. When user clicks a provider, calls `onSelect(kind)`. Parent creates a new profile via `createPresetProfile(kind)` + `ProfileRegistry.addProfile()`.

```tsx
import React from 'react';
import { ProfileKind } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';

const KINDS: ProfileKind[] = ['anthropic', 'openai', 'google', 'openrouter', 'perplexity', 'ollama', 'litellm', 'custom'];

interface AddProfileGridProps {
    onSelect: (kind: ProfileKind) => void;
    onCancel: () => void;
}

export function AddProfileGrid({ onSelect, onCancel }: AddProfileGridProps) {
    return (
        <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-p-4 pktw-mb-3">
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-3">
                <span className="pktw-text-sm pktw-font-medium">Choose provider</span>
                <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-cursor-pointer hover:pktw-text-pk-foreground"
                      onClick={onCancel}>Cancel</span>
            </div>
            <div className="pktw-grid pktw-grid-cols-4 pktw-gap-2.5">
                {KINDS.map(kind => {
                    const meta = PROVIDER_LABELS[kind];
                    return (
                        <div key={kind}
                             className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-pk-accent pktw-transition-colors"
                             onClick={() => onSelect(kind)}>
                            <ProviderIcon kind={kind} size={36} />
                            <span className="pktw-text-xs pktw-font-medium">{meta.label}</span>
                            <span className="pktw-text-[10px] pktw-text-pk-foreground-faint">{meta.desc}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/AddProfileGrid.tsx
git commit -m "feat(settings): add AddProfileGrid provider picker"
```

---

## Task 8: ProfilesTab — Assembly

**Files:**
- Create: `src/ui/view/settings/ProfilesTab.tsx`
- Modify: `src/core/profiles/ProfileRegistry.ts:92-102`

- [ ] **Step 1: Add `toggleEnabled` to ProfileRegistry**

In `src/core/profiles/ProfileRegistry.ts`, add after `deleteProfile` (~line 102):

```ts
toggleEnabled(id: string): void {
    const profile = this.profilesMap.get(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);
    profile.enabled = !profile.enabled;
    // If disabling an active profile, clear it
    if (!profile.enabled) {
        if (this.activeAgentProfileId === id) this.activeAgentProfileId = null;
        if (this.activeEmbeddingProfileId === id) this.activeEmbeddingProfileId = null;
    }
    this.persist();
}
```

- [ ] **Step 2: Create ProfilesTab**

Create `src/ui/view/settings/ProfilesTab.tsx`. This assembles `StatusBar`, `ProfileCard` list, `AddProfileGrid`, and an Advanced collapsed section (LLM Output Control + SDK Settings).

```tsx
import React, { useState, useCallback } from 'react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import { ProfileKind } from '@/core/profiles/types';
import { StatusBar } from './components/StatusBar';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileGrid } from './components/AddProfileGrid';
import { SettingsUpdates } from './hooks/useSettingsUpdate';
import { MyPluginSettings } from '@/app/settings/types';
```

State: `showAddGrid` boolean, `tick` counter (increment on every mutation to force re-render).

Profile operations delegate to `ProfileRegistry.getInstance()`:
- `handleUpdate(id, updates)` → `registry.updateProfile(id, updates); setTick(t+1);`
- `handleDelete(id)` → `registry.deleteProfile(id); setTick(t+1);`
- `handleToggleAgent(id)` → `registry.setActiveAgentProfile(registry.getActiveAgentProfile()?.id === id ? null : id); setTick(t+1);`
- `handleToggleEmbedding(id)` → `registry.setActiveEmbeddingProfile(registry.getActiveEmbeddingProfile()?.id === id ? null : id); setTick(t+1);`
- `handleAdd(kind)` → `const p = createPresetProfile(kind); registry.addProfile(p); setShowAddGrid(false); setTick(t+1);`

Advanced section (collapsed by default): reuse the existing `OutputControlSettingsList` from `ModelConfigTab.tsx` — extract it as a standalone sub-component or inline the 6 fields (temperature, topP, reasoningEffort, textVerbosity, timeoutTotal, timeoutStep) reading from `settings.ai.defaultOutputControl`. Also show SDK Settings (CLI path, pool size, warmup) from `settings.profileSettings.sdkSettings`.

Bottom callout: "Power-user settings live in `peak-config.json` (vault root): Per-prompt model mapping (37 prompts) · Inspector link params · Graph viz tuning · Hub discover params"

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/ProfilesTab.tsx src/core/profiles/ProfileRegistry.ts
git commit -m "feat(settings): add ProfilesTab with status bar, profile cards, and advanced section"
```

---

## Task 9: Embedding Dual-Knob Fix

**Files:**
- Modify: `src/service/search/query/queryService.ts:65-68`
- Modify: `src/service/search/index/indexService.ts:480-483`

- [ ] **Step 1: Fix queryService embedding gate**

In `src/service/search/query/queryService.ts:65-76`, replace the gate that reads from `this.searchSettings.chunking.embeddingModel`:

```ts
// Before:
const embeddingModel = this.searchSettings.chunking.embeddingModel;
let embedding: number[] | undefined;
// ...
if (embeddingModel && vectorSearchAvailable) {

// After:
const registry = ProfileRegistry.getInstance();
const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
const hasEmbedding = embProfile?.embeddingEndpoint && embProfile?.embeddingModel;
let embedding: number[] | undefined;
// ...
if (hasEmbedding && vectorSearchAvailable) {
```

Add import: `import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';`

- [ ] **Step 2: Fix indexService embedding gate**

In `src/service/search/index/indexService.ts:480-483`, replace:

```ts
// Before:
const embeddingModel = settings.chunking.embeddingModel;
const embeddingModelName = embeddingModel ? `${embeddingModel.provider}:${embeddingModel.modelId}` : undefined;
const canGenerateEmbeddings = opts.includeEmbeddings && embeddingModel != null && vectorSearchAvailable;

// After:
const registry = ProfileRegistry.getInstance();
const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
const hasEmbedding = embProfile?.embeddingEndpoint && embProfile?.embeddingModel;
const embeddingModelName = hasEmbedding ? embProfile!.embeddingModel! : undefined;
const canGenerateEmbeddings = opts.includeEmbeddings && hasEmbedding && vectorSearchAvailable;
```

Add import: `import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';`

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/search/query/queryService.ts src/service/search/index/indexService.ts
git commit -m "fix(embedding): unify embedding gate to read from ProfileRegistry (eliminate dual-knob)"
```

---

## Task 10: SearchTab Redesign

**Files:**
- Create: `src/ui/view/settings/SearchTab.tsx`
- Create: `src/ui/view/settings/components/DocTypeGrid.tsx`

- [ ] **Step 1: Create DocTypeGrid**

Chip toggle grid for document types:

```tsx
import React from 'react';
import { DocumentType } from '@/core/document/types'; // verify actual import path

interface DocTypeGridProps {
    types: Record<string, boolean>;
    onToggle: (type: string, value: boolean) => void;
}

export function DocTypeGrid({ types, onToggle }: DocTypeGridProps) {
    return (
        <div className="pktw-grid pktw-grid-cols-4 pktw-gap-1.5 pktw-my-2">
            {Object.entries(types).map(([type, enabled]) => (
                <div key={type}
                     className={`pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1.5 pktw-rounded-md pktw-border pktw-text-xs pktw-cursor-pointer pktw-transition-colors ${
                         enabled
                             ? 'pktw-border-pk-accent pktw-text-pk-accent pktw-bg-pk-accent-muted'
                             : 'pktw-border-pk-border pktw-text-pk-foreground-muted'
                     }`}
                     onClick={() => onToggle(type, !enabled)}>
                    <div className={`pktw-w-2 pktw-h-2 pktw-rounded-sm pktw-border ${
                        enabled ? 'pktw-bg-pk-accent pktw-border-pk-accent' : 'pktw-border-pk-foreground-faint'
                    }`} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Create SearchTab**

Create `src/ui/view/settings/SearchTab.tsx`. Three sections: Indexing, Chunking, AI Analysis. Uses the existing `useSettingsUpdate` hook functions.

Structure matches the mockup:
- **Indexing**: auto-index toggle, DocTypeGrid, ignore patterns (Edit button → inline textarea with Save/Cancel).
- **Chunking**: maxChunkSize + chunkOverlap as number inputs.
- **AI Analysis**: web search method dropdown, auto-save toggle, save folder input, history limit input.

No deprecated settings (maxMultiAgentIterations, maxJudgeCalls). No hub discover params (moved to peak-config.json). No summary lengths (moved to peak-config.json).

Bottom callout: "Moved to peak-config.json: Summary lengths · Session summary word count · Hub discover params · Index refresh interval"

Use `SettingField` from `src/ui/view/settings/component/setting-field.tsx:37` for consistent label+description layout.

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/SearchTab.tsx src/ui/view/settings/components/DocTypeGrid.tsx
git commit -m "feat(settings): add SearchTab with simplified indexing/chunking/analysis"
```

---

## Task 11: GeneralTab Redesign

**Files:**
- Modify: `src/ui/view/settings/GeneralTab.tsx:26-190`

- [ ] **Step 1: Rewrite GeneralTab**

Rewrite `src/ui/view/settings/GeneralTab.tsx` with three sections:

**Folders**: data storage folder + chat root folder (keep existing `InputWithConfirm` pattern).

**Behavior** (new section): Attachment handling dropdown (`'direct'` / `'degrade_to_text'`), reading/writing `settings.ai.attachmentHandlingDefault`.

**Developer**: DevTools toggle (existing). Graph Visualization Tuning inside a collapsible section (existing sliders, but now uses a `<details>` element or the existing `CollapsibleSettingsSection`).

Bottom callout: "Moved to peak-config.json: MST prune depth · Skeleton backbone only · MST leaf opacity / width scale · Prompt rewrite toggle"

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/GeneralTab.tsx
git commit -m "feat(settings): redesign GeneralTab with attachment handling + simplified layout"
```

---

## Task 12: SettingsView Rewrite + Old File Cleanup

**Files:**
- Modify: `src/ui/view/SettingsView.tsx:10-79`
- Delete: `src/ui/view/settings/ModelConfigTab.tsx`
- Delete: `src/ui/view/settings/ProfileSettingsTab.tsx`
- Delete: `src/ui/view/settings/SearchSettingsTab.tsx`

- [ ] **Step 1: Rewrite SettingsView tab structure**

In `src/ui/view/SettingsView.tsx`, replace the tab definitions and content:

```tsx
type TabId = 'profiles' | 'search' | 'general';

// Tab definitions:
const TABS: { id: TabId; label: string }[] = [
    { id: 'profiles', label: 'Profiles' },
    { id: 'search', label: 'Search & Indexing' },
    { id: 'general', label: 'General' },
];

// Tab content (inside render):
{activeTab === 'profiles' && <ProfilesTab settings={settings} settingsUpdates={settingsUpdates} />}
{activeTab === 'search' && <SearchTab settings={settings} settingsUpdates={settingsUpdates} />}
{activeTab === 'general' && <GeneralTab settings={settings} settingsUpdates={settingsUpdates} />}
```

Remove imports of `ModelConfigTab`, `SearchSettingsTab`.

- [ ] **Step 2: Delete old files**

```bash
rm src/ui/view/settings/ModelConfigTab.tsx
rm src/ui/view/settings/ProfileSettingsTab.tsx
rm src/ui/view/settings/SearchSettingsTab.tsx
```

- [ ] **Step 3: Fix any remaining imports**

Search for imports of deleted files across the codebase and remove/replace them. Key locations:
- `SettingsView.tsx` (already updated)
- Any other file that imports `ProfileSettingsTab` or `ModelConfigTab` (likely none — they were only used in SettingsView)

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds. All old tab references removed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): rewrite SettingsView with new 3-tab structure, delete old tabs"
```

---

## Task 13: peak-config.json Loader

**Files:**
- Create: `src/core/profiles/peak-config.ts`

- [ ] **Step 1: Create loader**

```tsx
import { App } from 'obsidian';

export interface PeakConfig {
    promptModelMap?: Record<string, { provider: string; modelId: string }>;
    inspectorLinks?: {
        keywordTopN?: number;
        tagTopN?: number;
        folderGroupingEnabled?: boolean;
        folderGroupMinCount?: number;
        folderGroupMaxDepth?: number;
    };
    graphViz?: {
        mstPruneDepth?: number;
        skeletonBackboneOnly?: boolean;
        mstLeafOpacity?: number;
        mstLeafWidthScale?: number;
    };
    hubDiscover?: {
        enableLlmSemanticMerge?: boolean;
        maxRounds?: number;
        maxJudgeCalls?: number;
        minCoverageGain?: number;
    };
    summaryLengths?: {
        short?: number;
        full?: number;
        sessionWordCount?: number;
    };
    indexRefreshInterval?: number;
}

const DEFAULTS: PeakConfig = {
    inspectorLinks: { keywordTopN: 10, tagTopN: 5, folderGroupingEnabled: true, folderGroupMinCount: 3, folderGroupMaxDepth: 2 },
    graphViz: { mstPruneDepth: 2, skeletonBackboneOnly: false, mstLeafOpacity: 0.25, mstLeafWidthScale: 0.6 },
    hubDiscover: { enableLlmSemanticMerge: false, maxRounds: 5, maxJudgeCalls: 20, minCoverageGain: 0.02 },
    summaryLengths: { short: 150, full: 2000, sessionWordCount: 1200 },
    indexRefreshInterval: 5000,
};

let cached: PeakConfig | null = null;

export async function loadPeakConfig(app: App): Promise<PeakConfig> {
    if (cached) return cached;
    try {
        const file = app.vault.getAbstractFileByPath('peak-config.json');
        if (!file) { cached = DEFAULTS; return cached; }
        const raw = await app.vault.read(file as any);
        const parsed = JSON.parse(raw) as Partial<PeakConfig>;
        cached = deepMerge(DEFAULTS, parsed);
        return cached;
    } catch {
        cached = DEFAULTS;
        return cached;
    }
}

export function getPeakConfig(): PeakConfig {
    return cached ?? DEFAULTS;
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof T)[]) {
        const val = override[key];
        if (val != null && typeof val === 'object' && !Array.isArray(val) && typeof (base as any)[key] === 'object') {
            (result as any)[key] = deepMerge((base as any)[key], val as any);
        } else if (val !== undefined) {
            (result as any)[key] = val;
        }
    }
    return result;
}
```

- [ ] **Step 2: Wire into main.ts**

In `main.ts`, after `normalizePluginSettings` (~line 93), add:

```ts
import { loadPeakConfig } from '@/core/profiles/peak-config';
// ... in onload():
await loadPeakConfig(this.app);
```

- [ ] **Step 3: Wire consumers**

Replace direct reads of moved settings with `getPeakConfig()`:
- `src/service/search/index/indexService.ts` — `settings.search.indexRefreshInterval` → `getPeakConfig().indexRefreshInterval`
- `src/service/search/query/queryService.ts` — short/full summary lengths → `getPeakConfig().summaryLengths`
- Hub discover consumers — read from `getPeakConfig().hubDiscover`
- Inspector links consumers — read from `getPeakConfig().inspectorLinks`
- Graph viz consumers — merge `settings.graphViz` with `getPeakConfig().graphViz` for the advanced-only params

Note: These consumer wiring changes should be done carefully — search for each setting's current read site and redirect. This step may need to be split during execution if there are many consumers.

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/core/profiles/peak-config.ts main.ts
git commit -m "feat(settings): add peak-config.json loader for power-user settings"
```

---

## Task 14: Settings Modal + Command

**Files:**
- Create: `src/ui/view/SettingsModal.tsx`
- Modify: `src/app/commands/Register.ts:640-666`
- Modify: `main.ts:194`

- [ ] **Step 1: Create SettingsModal**

```tsx
import { Modal } from 'obsidian';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { SettingsRoot } from './SettingsView';
import { AppContext } from '@/app/context/AppContext';

export class SettingsModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(private readonly appContext: AppContext) {
        super(appContext.app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        contentEl.addClass('peak-settings-modal');
        contentEl.addClass('pktw-root');
        contentEl.style.padding = '0';

        modalEl.style.width = '860px';
        modalEl.style.maxWidth = '90vw';
        modalEl.style.maxHeight = 'calc(100vh - 120px)';
        modalEl.style.padding = '0';

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                SettingsRoot,
                { onClose: () => this.close() },
                this.appContext,
            ),
        );
    }

    onClose(): void {
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) {
            setTimeout(() => r.unmount(), 0);
        }
        this.contentEl.empty();
    }
}
```

- [ ] **Step 2: Add command**

In `src/app/commands/Register.ts`, add to the `buildCoreCommands` function:

```ts
{
    id: 'peak-open-settings',
    name: 'Peak: Open Settings',
    callback: () => {
        new SettingsModal(appContext).open();
    },
}
```

Add import: `import { SettingsModal } from '@/ui/view/SettingsModal';`

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/SettingsModal.tsx src/app/commands/Register.ts
git commit -m "feat(settings): add standalone SettingsModal + Peak: Open Settings command"
```

---

## Task 15: Cleanup Deprecated Settings + useSettingsUpdate Simplification

**Files:**
- Modify: `src/ui/view/settings/hooks/useSettingsUpdate.ts:152-199`
- Modify: `src/app/settings/PluginSettingsLoader.ts`

- [ ] **Step 1: Remove deprecated update helpers from useSettingsUpdate**

In `src/ui/view/settings/hooks/useSettingsUpdate.ts`, remove these functions that are no longer needed (their consumers — ModelConfigTab and SearchSettingsTab — are deleted):

- `updateSearchModel` (line 137-147) — was for `searchSummaryModel`
- `updateChunkingModel` (line 152-166) — was for `search.chunking.embeddingModel` and `rerankModel`
- `updateAIAnalysisModel` (line 171-184) — was for `search.aiAnalysisModel`
- `updateAnalysisModel` (line 189-199) — was for `ai.analysisModel`
- `updatePromptModel` (line 253-268) — was for per-prompt model mapping (now in peak-config.json)

Also remove them from the return object (line 270-285).

Keep: `updateSettings`, `update`, `updateAI`, `updateSearch`, `updateChunking`, `updateDefaultModel`, `updateInspectorLinks`, `updateDocumentType`, `updateAISettings`.

- [ ] **Step 2: Clean up deprecated defaults in PluginSettingsLoader**

In `src/app/settings/PluginSettingsLoader.ts`, the migration step added in Task 1 Step 5 already handles `anthropic-direct` → `anthropic`. Add cleanup for deprecated fields:

```ts
// Remove deprecated fields from persisted data
if (settings.search) {
    delete (settings.search as any).searchSummaryModel;
    delete (settings.search as any).maxMultiAgentIterations;
    if (settings.search.hubDiscover) {
        delete (settings.search.hubDiscover as any).maxJudgeCalls;
    }
    if (settings.search.chunking) {
        delete (settings.search.chunking as any).rerankModel;
    }
}
delete (settings as any).vaultSearch;
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds. All references to deleted functions/settings resolved.

- [ ] **Step 4: Full build + manual smoke test**

Run: `npm run build`
Then in Obsidian:
1. Open Settings → Peak Assistant → verify 3 tabs render
2. Open command palette → "Peak: Open Settings" → verify modal opens
3. Add a profile → verify provider grid shows 8 options
4. Expand a profile → verify model combobox opens with searchable dropdown
5. Check Status Bar shows correct health state
6. Verify embedding works if profile has embedding configured

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(settings): clean up deprecated settings and simplify useSettingsUpdate"
```

---

## Summary

| Task | Component | Key Change |
|------|-----------|-----------|
| 1 | ProfileKind | 4 → 8 provider kinds + presets + migration |
| 2 | Model Catalog | +27 models (DeepSeek, Meta, Mistral, xAI, Cohere, Qwen) |
| 3 | ProviderIcon | SVG icon per provider kind |
| 4 | ModelCombobox | Searchable dropdown with groups + capability tags |
| 5 | StatusBar | Health chips (Agent/Embedding/SQLite) |
| 6 | ProfileCard | Collapsible card with Connection/Models/Embedding/Roles |
| 7 | AddProfileGrid | 8-card provider selection |
| 8 | ProfilesTab | Assembly: status + cards + add + advanced |
| 9 | Embedding Fix | Unify gate to ProfileRegistry (kill dual-knob) |
| 10 | SearchTab | Simplified indexing/chunking/analysis |
| 11 | GeneralTab | Add attachment handling, simplify layout |
| 12 | SettingsView | New 3-tab structure, delete old tabs |
| 13 | peak-config.json | Loader + consumer wiring for power-user settings |
| 14 | SettingsModal | Standalone modal + command |
| 15 | Cleanup | Remove deprecated settings + simplify hooks |
