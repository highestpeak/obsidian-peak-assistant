# Configurability

## TL;DR

Never hardcode user-visible strings, regex patterns, label maps, color maps, or style configs directly in logic files. Use a **two-tier extraction**:

1. **`templates/config/<surface>.json`** (preferred) — JSON config loaded at runtime via `TemplateManager.loadJson(ConfigTemplateId.X)`. Editable without code changes; survives a hot-reload.
2. **`src/core/constant.ts`** (fallback) — compiled defaults for when template loading is unavailable (cold-start, test fixtures).

If a value would change for a different language / locale / brand / per-user customisation / per-deployment style, it belongs in a config — not inline.

## Why

Three classes of problem this prevents:

- **i18n drift** — UI strings inline in JSX make every locale change a code change. With templates, a non-engineer can edit `templates/config/onboarding.json` and the change ships.
- **Multilingual regex** — query classification patterns and document-type detection often need locale-specific terms. Inline regex with one or two language patterns ages badly. Centralise so adding a language is a one-line config edit.
- **Designer-engineer round-trip cost** — color maps, label tables, mermaid styles, tool name→label mappings are things designers iterate on. Templates let them update without a PR.

The pattern matches the existing `TemplateRegistry` / `TemplateId` / `PromptId` / `PromptService` discipline — prompts already follow it; configs extend the same idea to non-prompt data.

## Do

### 1. Strings, regex, label maps, color/style configs → template config

```ts
// RIGHT — load at runtime, falls back to constant if config unavailable
import { TemplateManager } from '@/core/templates/TemplateManager';
import { ConfigTemplateId } from '@/core/templates/template-registry';
import { DEFAULT_ONBOARDING_STRINGS } from '@/ui/view/onboarding/onboardingStrings';

const strings = (await TemplateManager.getInstance().loadJson(
    ConfigTemplateId.Onboarding
)) ?? DEFAULT_ONBOARDING_STRINGS;
```

```jsonc
// templates/config/onboarding.json
{
  "actions": { "back": "Back", "continue": "Continue" },
  "steps": { ... }
}
```

### 2. Constants used across the codebase → `src/core/constant.ts`

Compile-time values that aren't user-editable (DB names, registry keys, internal limits, debug flags) belong in the shared constants file. Importing scattered local constants creates rename hell.

### 3. The four registered surface configs (PR-0 scaffold, 2026-05-30)

`onboarding` · `settings` · `chat` · `dashboard` — each has a stub at `templates/config/<surface>.json` and is loaded via `ConfigTemplateId.X`. When you add a new user-visible string to one of these surfaces, append the key here, not in the React component.

## Don't

### ❌ Inline i18n strings in JSX

```tsx
// WRONG — every locale change becomes a code edit
<button>Continue</button>

// RIGHT
<button>{strings.actions.continue}</button>
```

### ❌ Inline regex with locale-specific terms

```ts
// WRONG — hardcodes English query terms, breaks for Chinese / Japanese / etc.
const isHowto = /\b(how to|how do|how can)\b/i.test(query);

// RIGHT — pattern lives in a config or constant
const isHowto = QUERY_PATTERNS.howto.test(query);
```

### ❌ Inline color maps / style configs

```ts
// WRONG — designer can't tweak without a PR
const dimensionColors = { Performance: '#7c3aed', Cost: '#dc2626' };

// RIGHT — `templates/config/dashboard.json` or `core/constant.ts`
const dimensionColors = await TemplateManager.getInstance().loadJson(
    ConfigTemplateId.Dashboard
).then((c) => c.dimensionColors);
```

### ❌ Use template config for one-off values

If a string is used in exactly one place and is unambiguously English-only forever (debug logs, error keys for telemetry), inline is fine. The rule applies to **user-visible** or **multiplied-across-surfaces** values.

## Checklist

When implementing or reviewing a new surface:

- [ ] No string literals visible in the rendered UI are inlined in JSX — all go through a `strings.X.Y` lookup
- [ ] No regex with locale-specific terms in logic files
- [ ] No color maps, label-to-display tables, mermaid theme configs inlined
- [ ] Constants used across files live in `src/core/constant.ts`, not duplicated
- [ ] If you added a new surface, you registered a `ConfigTemplateId` and a stub `templates/config/<surface>.json`

## Where this rule applies

- Tool name → display label mappings
- Query classification patterns (RAG router, intent detection)
- Dimension color schemes (dashboard / analysis)
- Mermaid theme + style definitions
- Provider display names + brand metadata
- Any user-facing copy
- Any data a non-engineer might reasonably want to tweak

If a value would surprise a future maintainer by being editable from JSON, it shouldn't be — but the test is "would a non-engineer ever want to change this?", and the answer is yes more often than you'd think.
