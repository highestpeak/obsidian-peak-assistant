# Provider Settings Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Profiles settings tab with 4 improvements: searchable pill model picker, AddProfileGrid deduplication, accurate credential labels, and connection test auth fix.

**Architecture:** All changes are in the UI layer (`src/ui/view/settings/components/`) and one core file (`testProviderConnection.ts`). Shared display utilities are extracted from `ModelCombobox` to avoid duplication. No data model changes.

**Tech Stack:** React 18, Lucide icons, Tailwind (pktw- prefix), existing `modelRegistry` + `ProfileRegistry` singletons.

**Spec:** `docs/superpowers/specs/2026-05-09-provider-settings-polish-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/ui/view/settings/components/model-display-utils.tsx` | **Create** | Shared `CapTags`, `highlightMatch`, `formatCtx` components/functions |
| `src/ui/view/settings/components/ModelCombobox.tsx` | **Modify** | Remove local `CapTags`/`highlightMatch`/`formatCtx`, import from shared |
| `src/ui/view/settings/components/RoleModelPicker.tsx` | **Create** | Floating search panel for pill model selection |
| `src/ui/view/settings/components/StatusBar.tsx` | **Modify** | Replace `RoleSelectorChip` dropdown with `RoleModelPicker` |
| `src/ui/view/settings/components/AddProfileGrid.tsx` | **Modify** | Add `existingKinds` filtering + "add another" toggle |
| `src/ui/view/settings/ProfilesTab.tsx` | **Modify** | Pass `existingKinds` prop |
| `src/ui/view/settings/components/ProfileCard.tsx` | **Modify** | Smart credential subtitle |
| `src/core/providers/testProviderConnection.ts` | **Modify** | Use `authToken` fallback for Bearer auth |

---

### Task 1: Extract shared model display utilities

**Files:**
- Create: `src/ui/view/settings/components/model-display-utils.tsx`
- Modify: `src/ui/view/settings/components/ModelCombobox.tsx:65-104`

- [ ] **Step 1: Create `model-display-utils.tsx`**

Extract three items from `ModelCombobox.tsx` lines 65-104 into a new file:

```tsx
import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { ModelCapabilities } from '@/core/providers/types';

export function formatCtx(maxCtx?: number): string | null {
    if (!maxCtx) return null;
    if (maxCtx >= 1_000_000) return `${Math.round(maxCtx / 1_000_000)}M`;
    if (maxCtx >= 1_000) return `${Math.round(maxCtx / 1_000)}K`;
    return `${maxCtx}`;
}

export function CapTags({ caps }: { caps?: ModelCapabilities }) {
    if (!caps) return null;
    const tags: { label: string; cls: string }[] = [];
    if (caps.reasoning) tags.push({ label: 'reason', cls: 'pktw-bg-yellow-500/20 pktw-text-yellow-700 dark:pktw-text-yellow-400' });
    if (caps.vision) tags.push({ label: 'vision', cls: 'pktw-bg-blue-500/20 pktw-text-blue-700 dark:pktw-text-blue-400' });
    if (caps.webSearch) tags.push({ label: 'search', cls: 'pktw-bg-green-500/20 pktw-text-green-700 dark:pktw-text-green-400' });
    const ctx = formatCtx(caps.maxCtx);
    if (ctx) tags.push({ label: ctx, cls: 'pktw-bg-pk-border/40 pktw-text-pk-muted-foreground' });
    if (tags.length === 0) return null;
    return (
        <span className="pktw-flex pktw-gap-1 pktw-shrink-0">
            {tags.map((t) => (
                <span key={t.label} className={cn('pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[10px] pktw-font-medium pktw-leading-none', t.cls)}>
                    {t.label}
                </span>
            ))}
        </span>
    );
}

export function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return (
        <>
            {text.slice(0, idx)}
            <span className="pktw-text-pk-accent pktw-font-semibold">{text.slice(idx, idx + query.length)}</span>
            {text.slice(idx + query.length)}
        </>
    );
}
```

- [ ] **Step 2: Update `ModelCombobox.tsx` to import from shared**

In `ModelCombobox.tsx`, remove the local `formatCtx` (lines 65-70), `CapTags` (lines 72-90), and `highlightMatch` (lines 92-104) definitions. Add this import at the top:

```tsx
import { CapTags, highlightMatch, formatCtx } from './model-display-utils';
```

The `formatCtx` import is needed because it's still used in `ModelCombobox` internally (in `CapTags`'s usage — but since `CapTags` is now imported, `formatCtx` is only needed if used standalone). Check: `formatCtx` is only used inside `CapTags`, so only `CapTags` and `highlightMatch` need to be imported. But keep `formatCtx` in the export for `RoleModelPicker` usage later.

Updated imports in `ModelCombobox.tsx`:

```tsx
import { CapTags, highlightMatch } from './model-display-utils';
```

Remove the `import type { ModelCapabilities } from '@/core/providers/types';` line (line 6) since it's no longer needed directly.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/components/model-display-utils.tsx src/ui/view/settings/components/ModelCombobox.tsx
git commit -m "refactor: extract shared model display utilities from ModelCombobox"
```

---

### Task 2: Create `RoleModelPicker` search panel

**Files:**
- Create: `src/ui/view/settings/components/RoleModelPicker.tsx`

- [ ] **Step 1: Create the `RoleModelPicker` component**

This is a floating search panel that replaces the `RoleSelectorChip` dropdown. It receives the same props but renders a Command Palette-style popover with search.

```tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { modelRegistry } from '@/core/providers/model-registry';
import { ProviderIcon } from './ProviderIcon';
import { CapTags, highlightMatch } from './model-display-utils';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import type { ModelCapabilities } from '@/core/providers/types';

// Map provider kind → catalog id for model lookup
const PROVIDER_CATALOG: Record<string, string | null> = {
    anthropic: 'claude', openai: 'openai', google: 'gemini',
    perplexity: 'perplexity', ollama: 'ollama', openrouter: 'openrouter',
    litellm: null, custom: null,
};

interface PickerItem {
    profileId: string;
    profileName: string;
    profileKind: string;
    modelId: string;
    capabilities?: ModelCapabilities;
}

function buildPickerItems(profiles: Profile[], modelFilter?: (modelId: string) => boolean): PickerItem[] {
    const items: PickerItem[] = [];
    for (const profile of profiles) {
        if (profile.enabled === false) continue;
        const catalogId = PROVIDER_CATALOG[profile.kind];
        if (!catalogId) continue;
        const models = modelRegistry.getModelsForProvider(catalogId);
        for (const model of models) {
            if (modelFilter && !modelFilter(model.id)) continue;
            items.push({
                profileId: profile.id,
                profileName: profile.name,
                profileKind: profile.kind,
                modelId: model.id,
                capabilities: model.capabilities,
            });
        }
    }
    return items;
}

export interface RoleModelPickerProps {
    activeConfig: { profile: Profile; modelId: string } | null;
    profiles: Profile[];
    onSelect: (config: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

export function RoleModelPicker({ activeConfig, profiles, onSelect, onClear, modelFilter }: RoleModelPickerProps) {
    const [query, setQuery] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const allItems = useMemo(() => buildPickerItems(profiles, modelFilter), [profiles, modelFilter]);

    const filtered = useMemo(() => {
        if (!query) return allItems;
        const q = query.toLowerCase();
        return allItems.filter(item => item.modelId.toLowerCase().includes(q) || item.profileName.toLowerCase().includes(q));
    }, [allItems, query]);

    // Group by profile
    const groups = useMemo(() => {
        const map = new Map<string, { profile: { id: string; name: string; kind: string }; items: PickerItem[] }>();
        for (const item of filtered) {
            let group = map.get(item.profileId);
            if (!group) {
                group = { profile: { id: item.profileId, name: item.profileName, kind: item.profileKind }, items: [] };
                map.set(item.profileId, group);
            }
            group.items.push(item);
        }
        return Array.from(map.values());
    }, [filtered]);

    // Flat list for keyboard nav
    const flatFiltered = useMemo(() => groups.flatMap(g => g.items), [groups]);

    // Auto-focus
    useEffect(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    // Scroll highlighted into view
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [highlightIdx]);

    // Reset highlight on query change
    useEffect(() => { setHighlightIdx(0); }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(i => Math.min(i + 1, flatFiltered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = flatFiltered[highlightIdx];
            if (item) onSelect({ profileId: item.profileId, modelId: item.modelId });
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Parent handles close via onClear or click-outside
        }
    };

    const isSelected = (item: PickerItem) =>
        activeConfig?.profile.id === item.profileId && activeConfig?.modelId === item.modelId;

    let flatIdx = 0;

    return (
        <div className="pktw-w-[320px] pktw-max-h-[380px] pktw-flex pktw-flex-col pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-popover pktw-shadow-lg">
            {/* Search input */}
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-border-b pktw-border-pk-border">
                <Search className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-muted-foreground pktw-shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search models..."
                    className="pktw-flex-1 pktw-bg-transparent pktw-border-0 pktw-outline-none pktw-text-xs pktw-text-pk-foreground placeholder:pktw-text-pk-muted-foreground"
                />
            </div>

            {/* Model list */}
            <div ref={listRef} className="pktw-flex-1 pktw-overflow-y-auto pktw-py-1">
                {groups.map(group => (
                    <div key={group.profile.id}>
                        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-2 pktw-pb-1">
                            <ProviderIcon kind={group.profile.kind as any} size={14} />
                            <span className="pktw-text-[10px] pktw-font-semibold pktw-text-pk-foreground-faint pktw-uppercase pktw-tracking-wider">
                                {group.profile.name}
                            </span>
                        </div>
                        {group.items.map(item => {
                            const idx = flatIdx++;
                            const selected = isSelected(item);
                            return (
                                <button
                                    key={`${item.profileId}-${item.modelId}`}
                                    type="button"
                                    data-idx={idx}
                                    onMouseEnter={() => setHighlightIdx(idx)}
                                    onClick={() => onSelect({ profileId: item.profileId, modelId: item.modelId })}
                                    className={cn(
                                        'pktw-w-full pktw-text-left pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none pktw-transition-colors pktw-cursor-pointer',
                                        idx === highlightIdx && 'pktw-bg-pk-accent/10',
                                        selected && 'pktw-font-semibold',
                                    )}
                                >
                                    <span className="pktw-pl-2 pktw-flex-1 pktw-truncate pktw-font-mono">
                                        {highlightMatch(item.modelId, query)}
                                    </span>
                                    <CapTags caps={item.capabilities} />
                                    {selected && <Check className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-pk-accent" />}
                                </button>
                            );
                        })}
                    </div>
                ))}

                {flatFiltered.length === 0 && (
                    <div className="pktw-px-3 pktw-py-4 pktw-text-xs pktw-text-pk-muted-foreground pktw-text-center">
                        No models found
                    </div>
                )}
            </div>

            {/* Clear selection */}
            {activeConfig && (
                <>
                    <div className="pktw-border-t pktw-border-pk-border" />
                    <button
                        type="button"
                        className="pktw-w-full pktw-text-left pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-pk-muted-foreground pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-rounded-none hover:pktw-bg-pk-accent/5 pktw-transition-colors pktw-cursor-pointer"
                        onClick={onClear}
                    >
                        Clear selection
                    </button>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build (component not yet wired in).

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/RoleModelPicker.tsx
git commit -m "feat: add RoleModelPicker searchable panel component"
```

---

### Task 3: Wire `RoleModelPicker` into `StatusBar`

**Files:**
- Modify: `src/ui/view/settings/components/StatusBar.tsx`

- [ ] **Step 1: Rewrite `RoleSelectorChip` to use `RoleModelPicker`**

Replace the entire `RoleSelectorChip` component (lines 39-131) in `StatusBar.tsx`. The pill button stays the same, but the dropdown is replaced with the `RoleModelPicker` panel. Also remove the now-unused `getModelsForProfile` function (lines 17-24) and `PROVIDER_CATALOG` (lines 10-14).

Updated `StatusBar.tsx`:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { RoleModelPicker } from './RoleModelPicker';
import type { Profile, RoleConfig } from '@/core/profiles/types';

type RoleKind = 'agent' | 'chat' | 'copilot' | 'embedding' | 'webSearch';

interface RoleSelectorChipProps {
    role: RoleKind;
    label: string;
    activeConfig: { profile: Profile; modelId: string } | null;
    profiles: Profile[];
    onSelect: (config: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

function RoleSelectorChip({ role, label, activeConfig, profiles, onSelect, onClear, modelFilter }: RoleSelectorChipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const ok = !!activeConfig;
    const displayText = activeConfig
        ? `${label}: ${activeConfig.modelId}`
        : `${label}: Not configured`;

    return (
        <div ref={ref} className="pktw-relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs pktw-cursor-pointer pktw-transition-colors pktw-border-0',
                    ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success hover:pktw-bg-pk-success-muted/80'
                       : 'pktw-bg-pk-error-muted pktw-text-pk-error hover:pktw-bg-pk-error-muted/80',
                )}
            >
                <div className={cn('pktw-w-1.5 pktw-h-1.5 pktw-rounded-full', ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error')} />
                {displayText}
                <ChevronDown className={cn('pktw-w-3 pktw-h-3 pktw-transition-transform', open && 'pktw-rotate-180')} />
            </button>

            {open && (
                <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-z-50">
                    <RoleModelPicker
                        activeConfig={activeConfig}
                        profiles={profiles}
                        onSelect={(config) => { onSelect(config); setOpen(false); }}
                        onClear={() => { onClear(); setOpen(false); }}
                        modelFilter={modelFilter}
                    />
                </div>
            )}
        </div>
    );
}

function StaticChip({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={cn(
            'pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-full pktw-text-xs',
            ok ? 'pktw-bg-pk-success-muted pktw-text-pk-success' : 'pktw-bg-pk-error-muted pktw-text-pk-error',
        )}>
            <div className={cn('pktw-w-1.5 pktw-h-1.5 pktw-rounded-full', ok ? 'pktw-bg-pk-success' : 'pktw-bg-pk-error')} />
            {label}
        </div>
    );
}

export function StatusBar() {
    const [, setTick] = useState(0);
    const bump = () => setTick(t => t + 1);

    const registry = ProfileRegistry.getInstance();
    const profiles = registry.getAllProfiles();

    const agentConfig = registry.getActiveAgentConfig();
    const agentFastConfig = registry.getActiveAgentFastConfig();
    const chatConfig = registry.getActiveChatConfig();
    const copilotConfig = registry.getActiveCopilotConfig();
    const embeddingConfig = registry.getActiveEmbeddingConfig();
    const webSearchConfig = registry.getActiveWebSearchConfig();

    const sqliteReady = sqliteStoreManager.isInitialized();

    const agentProfiles = profiles.filter(p => p.kind === 'anthropic' || p.kind === 'openrouter');
    const agentModelFilter = (modelId: string) => !modelId.includes('/') || modelId.startsWith('anthropic/');

    return (
        <div className="pktw-flex pktw-gap-2.5 pktw-mt-4 pktw-mb-5 pktw-flex-wrap">
            <RoleSelectorChip
                role="agent" label="Agent"
                activeConfig={agentConfig} profiles={agentProfiles}
                onSelect={(config) => { registry.setActiveAgentConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentConfig(null); bump(); }}
                modelFilter={agentModelFilter}
            />
            <RoleSelectorChip
                role="agent" label="Agent Fast"
                activeConfig={agentFastConfig} profiles={agentProfiles}
                onSelect={(config) => { registry.setActiveAgentFastConfig(config); bump(); }}
                onClear={() => { registry.setActiveAgentFastConfig(null); bump(); }}
                modelFilter={agentModelFilter}
            />
            <RoleSelectorChip
                role="chat" label="Chat"
                activeConfig={chatConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveChatConfig(config); bump(); }}
                onClear={() => { registry.setActiveChatConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="copilot" label="Copilot"
                activeConfig={copilotConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveCopilotConfig(config); bump(); }}
                onClear={() => { registry.setActiveCopilotConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="embedding" label="Embedding"
                activeConfig={embeddingConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveEmbeddingConfig(config); bump(); }}
                onClear={() => { registry.setActiveEmbeddingConfig(null); bump(); }}
            />
            <RoleSelectorChip
                role="webSearch" label="Web Search"
                activeConfig={webSearchConfig} profiles={profiles}
                onSelect={(config) => { registry.setActiveWebSearchConfig(config); bump(); }}
                onClear={() => { registry.setActiveWebSearchConfig(null); bump(); }}
            />
            <StaticChip ok={sqliteReady} label={sqliteReady ? 'SQLite: ready' : 'SQLite: unavailable'} />
        </div>
    );
}
```

The key changes:
- Remove `PROVIDER_CATALOG`, `getModelsForProfile`, `Check` import, `ProviderIcon`/`PROVIDER_LABELS` imports, `modelRegistry` import
- Add `RoleModelPicker` import
- `RoleSelectorChip` dropdown (lines 73-128) replaced with `<RoleModelPicker>` in a positioned wrapper
- `onSelect`/`onClear` wrappers call `setOpen(false)` after delegating

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/StatusBar.tsx
git commit -m "feat: wire RoleModelPicker into StatusBar pills"
```

---

### Task 4: AddProfileGrid deduplication

**Files:**
- Modify: `src/ui/view/settings/components/AddProfileGrid.tsx`
- Modify: `src/ui/view/settings/ProfilesTab.tsx:86-91,140`

- [ ] **Step 1: Update `AddProfileGrid` with filtering**

Replace the entire `AddProfileGrid.tsx`:

```tsx
import React, { useState } from 'react';
import { ProfileKind } from '@/core/profiles/types';
import { ProviderIcon, PROVIDER_LABELS } from './ProviderIcon';

const KINDS: ProfileKind[] = ['anthropic', 'openai', 'google', 'openrouter', 'perplexity', 'ollama', 'litellm', 'custom'];

interface AddProfileGridProps {
    onSelect: (kind: ProfileKind) => void;
    onCancel: () => void;
    existingKinds: Set<ProfileKind>;
}

export function AddProfileGrid({ onSelect, onCancel, existingKinds }: AddProfileGridProps) {
    const [showAll, setShowAll] = useState(false);

    const newKinds = KINDS.filter(k => !existingKinds.has(k));
    const displayKinds = showAll ? KINDS : newKinds;
    const hasExisting = existingKinds.size > 0 && newKinds.length < KINDS.length;

    return (
        <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-p-4 pktw-mb-3">
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-3">
                <span className="pktw-text-sm pktw-font-medium">Choose provider</span>
                <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-cursor-pointer hover:pktw-text-pk-foreground"
                      onClick={onCancel}>Cancel</span>
            </div>
            <div className="pktw-grid pktw-grid-cols-4 pktw-gap-2.5">
                {displayKinds.map(kind => {
                    const meta = PROVIDER_LABELS[kind];
                    const alreadyExists = existingKinds.has(kind);
                    return (
                        <div key={kind}
                             className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-[var(--interactive-accent)] hover:pktw-shadow-md pktw-transition-all pktw-duration-200"
                             onClick={() => onSelect(kind)}>
                            <ProviderIcon kind={kind} size={36} />
                            <span className="pktw-text-xs pktw-font-medium">{meta.label}</span>
                            <span className="pktw-text-[10px] pktw-text-pk-foreground-faint">
                                {alreadyExists && showAll ? 'already configured' : meta.desc}
                            </span>
                        </div>
                    );
                })}
            </div>
            {hasExisting && !showAll && (
                <span
                    className="pktw-block pktw-text-center pktw-text-[11px] pktw-text-pk-muted-foreground pktw-mt-3 pktw-cursor-pointer hover:pktw-text-pk-foreground pktw-transition-colors"
                    onClick={() => setShowAll(true)}
                >
                    Add another instance of existing provider
                </span>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Pass `existingKinds` from `ProfilesTab.tsx`**

In `ProfilesTab.tsx`, update line 140 to pass the new prop:

Change:
```tsx
<AddProfileGrid onSelect={handleAdd} onCancel={() => setShowAddGrid(false)} />
```

To:
```tsx
<AddProfileGrid
    onSelect={handleAdd}
    onCancel={() => setShowAddGrid(false)}
    existingKinds={new Set(profiles.map(p => p.kind))}
/>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/components/AddProfileGrid.tsx src/ui/view/settings/ProfilesTab.tsx
git commit -m "feat: hide already-configured providers in AddProfileGrid"
```

---

### Task 5: ProfileCard credential subtitle fix

**Files:**
- Modify: `src/ui/view/settings/components/ProfileCard.tsx:117`

- [ ] **Step 1: Replace hardcoded subtitle with smart credential label**

In `ProfileCard.tsx`, replace line 117:

```tsx
const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${profile.apiKey ? 'API key set' : 'no key'}`;
```

With:

```tsx
function getCredentialLabel(profile: Profile): string {
    if (profile.kind === 'ollama') return 'no key needed';
    if (profile.authToken) return 'auth token set';
    if (profile.apiKey) return 'API key set';
    return 'no key';
}
```

And update line 117 to:

```tsx
const subtitle = `${PROVIDER_LABELS[profile.kind].label} · ${getCredentialLabel(profile)}`;
```

Place the `getCredentialLabel` function above `ProfileCard` (e.g. after the `INPUT_CLS` constant at line 49).

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/ProfileCard.tsx
git commit -m "fix: show accurate credential status per provider kind"
```

---

### Task 6: Connection test authToken fallback

**Files:**
- Modify: `src/core/providers/testProviderConnection.ts:23,49`

- [ ] **Step 1: Update Bearer token resolution**

In `testProviderConnection.ts`, change line 23:

```tsx
const key = profile.apiKey ?? '';
```

To:

```tsx
const key = profile.authToken ?? profile.apiKey ?? '';
```

This ensures OpenRouter profiles that store credentials in `authToken` (not `apiKey`) will send the correct Bearer token during connection tests.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/core/providers/testProviderConnection.ts
git commit -m "fix: use authToken fallback for Bearer auth in connection test"
```

---

### Task 7: Final integration verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Bundle size check**

Run: `ls -la main.js`
Verify the bundle size has not grown unreasonably (new code is ~150 lines, expect < 1KB increase in minified output).
