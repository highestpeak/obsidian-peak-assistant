# Provider Settings Polish Design

**Date:** 2026-05-09
**Scope:** 4 targeted improvements to the Profiles settings tab

---

## 1. Pill Search Panel (`RoleModelPicker`)

### Problem

The `RoleSelectorChip` dropdown (`StatusBar.tsx:73-131`) is a flat list of all models grouped by profile, with no search. As the number of providers and models grows, finding the right model becomes tedious.

### Design

Replace the inline dropdown with a **floating search panel** (Command Palette style).

**New component:** `RoleModelPicker` — rendered as a popover anchored below the pill.

**Layout:**
- Width: 320px, max-height: 380px
- Top: auto-focused search input
- Body: scrollable model list grouped by profile, each item shows `modelId` + `CapTags` (reason/vision/search/context window)
- Bottom: "Clear selection" divider (when active config exists)

**Search behavior:**
- Substring match on `modelId`, case-insensitive
- Real-time filtering as user types
- Matched text highlighted in accent color

**Keyboard navigation:**
- ArrowUp/Down: move highlight
- Enter: select highlighted item
- Escape: close panel

**Data flow:**
- Receives `profiles: Profile[]`, `activeConfig`, `onSelect(RoleConfig)`, `onClear()`, `modelFilter?`
- Internally builds flat list: `{ profileId, profileName, profileKind, modelId, capabilities }[]` using existing `getModelsForProfile()` + `modelRegistry.getModelsForProvider()` for capabilities lookup
- Agent/Agent Fast restrictions unchanged: only anthropic/openrouter profiles, Claude model filter

**Shared utilities:** Extract `CapTags`, `highlightMatch`, `formatCtx` from `ModelCombobox.tsx` into `src/ui/view/settings/components/model-display-utils.tsx`. Both `ModelCombobox` and `RoleModelPicker` import from there.

### Files changed

| File | Change |
|---|---|
| `src/ui/view/settings/components/model-display-utils.tsx` | **New.** Extracted `CapTags`, `highlightMatch`, `formatCtx` |
| `src/ui/view/settings/components/ModelCombobox.tsx` | Import shared utils instead of local definitions |
| `src/ui/view/settings/components/StatusBar.tsx` | Replace `RoleSelectorChip` dropdown (lines 73-131) with `RoleModelPicker` |

---

## 2. AddProfileGrid Deduplication

### Problem

`AddProfileGrid.tsx` always shows all 8 provider kinds regardless of what's already configured, allowing accidental duplicates.

### Design

**Default view:** Hide kinds that already have a profile.

**Escape hatch:** A text link at the bottom — "Add another instance of existing provider" — reveals all kinds. Already-configured kinds show a small "already configured" badge.

### Interface change

```ts
interface AddProfileGridProps {
    onSelect: (kind: ProfileKind) => void;
    onCancel: () => void;
    existingKinds: Set<ProfileKind>;  // new
}
```

`ProfilesTab.tsx` passes `existingKinds={new Set(profiles.map(p => p.kind))}`.

### Files changed

| File | Change |
|---|---|
| `src/ui/view/settings/components/AddProfileGrid.tsx` | Add `existingKinds` prop, filter logic, "add another" toggle |
| `src/ui/view/settings/ProfilesTab.tsx` | Pass `existingKinds` to `AddProfileGrid` |

---

## 3. ProfileCard Subtitle — Credential Display Fix

### Problem

`ProfileCard.tsx:117` shows `"no key"` when `profile.apiKey` is falsy. But:
- **Ollama** needs no key at all — "no key" is misleading
- **OpenRouter** stores credentials in `authToken`, not `apiKey` — shows "no key" even when authenticated

### Design

Replace the hardcoded subtitle with a function:

```
getCredentialLabel(profile):
  kind === 'ollama'          → "no key needed"
  profile.authToken truthy   → "auth token set"
  profile.apiKey truthy      → "API key set"
  else                       → "no key"
```

Subtitle format: `"{providerLabel} · {credentialLabel}"`.

Additionally, fix `testProviderConnection.ts:49` — the `else` branch (used by OpenRouter and others) should use `profile.authToken ?? profile.apiKey ?? ''` for the Bearer token, so OpenRouter profiles with `authToken` but no `apiKey` authenticate correctly.

### Files changed

| File | Change |
|---|---|
| `src/ui/view/settings/components/ProfileCard.tsx:117` | Replace inline subtitle with `getCredentialLabel()` |
| `src/core/providers/testProviderConnection.ts:49` | Use `authToken ?? apiKey` for Bearer token |

---

## 4. Migration Cleanup

No code change needed. "Migrated OpenRouter" and similar profiles are one-time migration artifacts. Users can delete them via the existing `ProfileCard ⋯ → Delete` action. No automatic cleanup logic will be added.

---

## Out of Scope

- Model catalog updates or runtime model fetching changes
- Profile data model changes (no new fields)
- Changes to how `ProfileRegistry` persists data
