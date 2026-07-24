# UI Design System

The single source for how plugin UI gets built — from raw color values up through React component selection, plus the Obsidian-specific traps that bite every UI engineer at some point.

## TL;DR by layer

| Layer | Rule |
|---|---|
| **§1 Tokens** | All visual values come from `--pk-*` tokens in `src/styles/peak-tokens.css`. No inline hex, no Obsidian-theme `var(--…)` chain-throughs, no fallback chains. |
| **§2 Primitive catalog** | 11 shared `.pk-*` CSS classes + matching React wrappers in `src/ui/components/primitives/`. Use the React wrapper by default. |
| **§3 Primitive usage** | Pick the primitive by **intent**, not by **shape**. `<Pill>` is a filter chip, not a button; `<Row>` is the Settings card spec, not a generic row. Produce a mock→primitive map before each surface; gaps mean "add the primitive", not "use the closest one". |
| **§4 Obsidian CSS defense** | Obsidian injects styles onto bare tags (`<button>`, `<input>`, `<h1-6>`, `<a>`). Modal-mounted surfaces MUST add `peak-design-root` to the outermost element; button-based primitives need `!important` on bg/border/padding/border-radius to beat `.modal-content button`. |
| **§5 JSX-mock fidelity** | Audits include a JSX-vs-mock structural diff, not just CSS-vs-CSS. `{x ?? ''}` and `<span>{maybe || ''}</span>` inside flex/grid are NOT no-ops — they pollute height. Optional decorations sit inline with required content, not in sometimes-empty subtitle slots. |
| **§6 Surface drift prevention** | Per-surface chip/pill/button classes are a smell — one Chip primitive across the plugin. Surface migrations are all-or-nothing: leaving one screen in a family on the old system reliably drifts. "Intentionally omitted" scope in a PR is a debt receipt — track it. Mock data fixtures are required for rich UI states (agent runs, artifacts) — without a fixture the UI is invisible and rots. |

## Quick navigation

- §1 — [Design tokens](#1-design-tokens)
- §2 — [Component primitives catalog](#2-component-primitives-catalog)
- §3 — [Primitive usage — decision rules](#3-primitive-usage--decision-rules)
- §4 — [Obsidian CSS defense](#4-obsidian-css-defense)
- §5 — [JSX-mock fidelity](#5-jsx-mock-fidelity)
- §6 — [Surface drift prevention](#6-surface-drift-prevention)
- §7 — [Consolidated checklist](#7-consolidated-checklist)

For unrelated rules see [`configurability.md`](./configurability.md) (data layer — no inline i18n / regex / label maps).

---

## 1. Design tokens

### 1.1 Why

The plugin previously had **5 parallel token systems** (`--pk-*`, `--vr-*`, mock `--accent` no-prefix, shadcn HSL, Obsidian chain-throughs) that drifted out of sync — the same purple button rendered as 3 different shades across surfaces. The 2026-05-22 migration consolidated to **one source of truth** so:

- Plugin visual is fully autonomous (third-party Obsidian themes can't pollute it)
- Light/dark switching works via a single `.theme-dark` cascade
- Designers and engineers reference the same value names
- Mocks and shipped UI render identically

Spec: `docs/superpowers/specs/2026-05-22-design-system-migration.md`. Visual contract: `docs/mockups/_design-tokens-preview.html`.

### 1.2 Do

**Use the Tailwind utility when one exists** (most common):

```tsx
<button className="pktw-bg-pk-accent pktw-text-pk-accent-fg hover:pktw-bg-pk-accent-hover">
  Save
</button>

<div className="pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-text-pk-text-primary">
  Card content
</div>
```

**Font sizes: only the `pk-*` fontSize utilities are token classes** — `pktw-text-pk-xs`(10) `pk-sm`(11) `pk-base`(12) `pk-md`(13) `pk-md-plus`(13.5) `pk-lg`(14) `pk-lg-plus`(14.5) `pk-xl`(16) `pk-2xl`(20) `pk-3xl`(28). Tailwind's native `pktw-text-xs/sm/base/lg/xl/…` classes also exist but are **rem-based Tailwind defaults** (`text-sm` = 0.875rem = 14px, `text-xs` = 12px), NOT pk tokens — the names look token-ish but belong to a different scale that additionally stretches with the root font size. Never use a native size class to express a design-system size, and never write `pktw-text-[13px]` for a value that exists on the ladder (the 2026-07-18 sweep converted 447 such uses).

**Use `var(--pk-*)` directly when Tailwind is awkward** (inline styles, dynamic computed values, CSS-in-JS):

```tsx
<svg stroke="var(--pk-border)" />
<div style={{ background: 'var(--pk-accent-tint)', color: 'var(--pk-accent-text)' }} />
<Recharts.Line stroke="var(--pk-info)" />
```

**Add a new token by editing `src/styles/peak-tokens.css`** — declare in BOTH light and dark blocks even if dark just copies light. Then expose in `tailwind.config.js` if it'll be used as a utility.

### 1.3 Don't

```tsx
// ❌ inline hex — breaks dark mode, won't follow token updates
<div style={{ background: '#7c3aed' }} />
<span className="pktw-text-[#2e3338]" />

// ❌ Obsidian theme var direct ref — third-party themes hijack
<div style={{ color: 'var(--text-normal)' }} />
<span className="pktw-bg-[var(--background-primary)]" />

// ❌ fallback chains — pk tokens always resolve
color: var(--pk-text-primary, var(--text-normal, #2e3338));

// ❌ component-local tokens — this is how --vr-* / --accent etc. happened
.my-modal { --my-modal-accent: #abc; }

// ❌ raw Tailwind palette classes — frozen hex, never flips with .theme-dark
<span className="pktw-text-red-500 pktw-bg-gray-100" />
// → pktw-text-pk-error / pktw-bg-pk-surface-sunken (map by SEMANTIC role:
//   red→error, green/emerald→success, amber/yellow→warning, blue→info,
//   purple/violet→accent, gray→foreground-muted/-faint or surface/border)

// ❌ bracket-var when a semantic utility exists — invisible to grep, invites drift
<span className="pktw-text-[var(--pk-text-secondary)]" />  // → pktw-text-pk-text-secondary

// ❌ ghost-token fallback — the token was never defined, the fallback silently
//    becomes the permanent value and dark mode never flips
color: var(--pk-text-on-accent, #ffffff);   /* no such token; wanted --pk-accent-fg */
transition: var(--pk-motion-base, 240ms);   /* no such token; wanted --pk-transition-slow */
```

The `var(--pk-x, var(--obsidian-y))` two-step fallback is permitted **only** for rules that can genuinely apply outside `.pktw-root`/`.peak-design-root` scope (CodeMirror tooltips mounted in Obsidian's editor DOM, style that runs before scope classes attach). Inside scoped surfaces, write the bare token — a fallback there is dead code that eventually lies (dashboard-charts shipped 27 wrong fallback values that would have applied silently if the scope ever changed).

### 1.4 Token reference

**Radius — `--pk-radius-pill` vs `--pk-radius-full`**: both `9999px`. Use `pill` for chips/badges/pill buttons (semantically pill-shaped); use `full` for avatars/circular icon buttons/dot indicators (max rounding on arbitrary surface).

**Shadow rungs** (visual weight ascending):
- `--pk-shadow-sm` — faint lift for inline chips, sparkline tiles, hover micro-affordances
- `--pk-shadow-md` — mid lift for raised cards in dense layouts (dashboard tiles, popout previews)
- `--pk-shadow-card` — default card surface, includes 1px ring; use when surface has no border
- `--pk-shadow-popover` — floating menus, dropdowns, tooltips with body
- `--pk-shadow-modal` — modal dialogs, command palette, full-overlay surfaces

`sm`/`md` are pure drop-shadows; `card`/`popover`/`modal` include a 1px ring.

**Typography half-steps** — base scale is `xs:10 sm:11 base:12 md:13 lg:14 xl:16 2xl:20 3xl:28`. Two half-step tokens exist for surfaces where 1px rounding visibly thins content:
- `--pk-text-md-plus` (13.5px) — chat author name, outline row names, modal choice titles
- `--pk-text-lg-plus` (14.5px) — chat message body, conversation header title

Prefer the base scale; reach for half-steps only when the mock genuinely needs them.

**Off-ladder registry (2026-07-18)** — sizes that ship in current UI but are deliberately NOT on the ladder. Don't add new ones; converging these needs a design pass (candidate tokens: `pk-2xs` ~8-9px micro-badges, `pk-title` 17-18px panel titles, `pk-stat` 22px numerals):

| Size | Where | Role |
|---|---|---|
| 8px / 9px (~42 uses) | copilot panels (`WritingPlanPanel`, `TagSuggestionPanel`, `SuggestionBodyParts`, …) | micro uppercase category badges |
| 9.5 / 10.5 / 11.5 / 12.5px (~77 uses) | `VaultAutoRunContent`, `file-atlas.css`, quick-search | dense data tables / mock-exact half-steps |
| 15px | `.pk-modal-shell__title` | modal title between lg/xl |
| 17px / 18px | `PickerReadinessCard`, `VaultAutoRunContent`, `CopilotReviewHistoryContent`, `.pkonb-section__title`, `.pkset-head__title` | panel-level titles |
| 22px | `VaultAutoRunContent` stats, `.pkonb-hero__title` | large stat numerals / hero |

**Provider brand hues — `--pk-prov-*`**: each provider has a `base` (hex) and `-soft` (rgba ~0.18 light / ~0.22 dark) variant. Same hex in light + dark; only `-soft` alpha bumps in dark.

| Provider | Token base | Hex |
|---|---|---|
| OpenAI | `--pk-prov-openai` | `#54d39e` |
| Anthropic | `--pk-prov-anthropic` | `#e0934f` |
| Google | `--pk-prov-google` | `#6bb6e0` |
| OpenRouter | `--pk-prov-openrouter` | `#b58ce0` |
| Perplexity | `--pk-prov-perplexity` | `#e8b056` |
| Ollama | `--pk-prov-ollama` | `#7a8696` |

```tsx
<span style={{ background: 'var(--pk-prov-anthropic-soft)', color: 'var(--pk-prov-anthropic)' }}>
  Claude
</span>
```

### 1.5 Legitimate exceptions (keep hex)

| Category | Example file(s) | Why |
|---|---|---|
| Provider brand colors | `ProviderIcon.tsx`, `provider-brand-icons.tsx` | Anthropic / OpenAI / Google / Perplexity / OpenRouter trademarks |
| Knowledge graph edge semantics | `LensEdgeComponent.tsx` | Specific edge-type encoding |
| Knowledge graph node clusters | `LensNodeComponent.tsx` | Cluster palette intentionally varied |
| Recharts data series palette | `usage-dashboard/*` | Rotating chart series colors |
| Mermaid status colors | `streamdown.css` | Inside shadow DOM, status-encoded |
| Tooltip black | `ControlSettingItem.tsx` | Intentional `#000` for high-contrast hover tooltip |
| Animation gradient stops | `AnimatedSparkles.tsx` | Decorative gradient, status-encoded |
| Provider icon gradients | `ProviderIcon.tsx` `ICON_GRADIENTS` | duplicate truth vs `--pk-prov-*` — pending design decision which set wins; do NOT merge silently |
| File Atlas type/badge palette | `file-atlas.css` | replication-mode mock-exact; known gap: no `.theme-dark` branch |
| Toggle knob white + URL-thumb gradient | `peak-components.css` (registered in its file-header exception list) | knob is white in both themes; thumb gradient is decorative |
| Result graph palette | `ResultGraphView.tsx` cytoscape stylesheet | third-party canvas renderer can't consume CSS custom properties |

When adding to this list, document the reason inline (one-line comment near the hex).

### 1.6 Streamdown is a separate COLOR token system — but typography INHERITS

Streamdown renders markdown inside its own Shadow DOM with shadcn-style HSL tokens (`--background`, `--foreground`, `--primary`, etc.) — these **color** tokens are NOT `--pk-*` and should not be replaced. Mapping documented at the top of `src/styles/streamdown-shadow-host.css`. When updating peak tokens, eyeball markdown surfaces to confirm they still feel "of the same family".

**Typography is different (2026-07-18)**: the shadow `:host` must NOT declare `font-family` or `font-size`. It previously pinned `var(--font-interface)` + `1rem`, which cut the inheritance chain and rendered every markdown body (chat messages, reasoning, insights, quick-search reports — 6 surfaces) at 16px in the vault's interface font while the surrounding chrome ran `--pk-font-sans` at 13-14px — the single most visible "fonts feel off" source. Inherited font properties and custom properties DO cross the shadow boundary, so the light-DOM wrapper decides: `.pkchat-msg__body` → `--pk-text-lg-plus` (14.5px); insight/report panels → their body size class. Never reintroduce a font pin in `streamdown-shadow-host.css` (`streamdown-isolated-css.ts` is build-generated from it — edit only the source).

### 1.7 File map

| File | Role |
|---|---|
| `src/styles/peak-tokens.css` | Source of truth — all `--pk-*` definitions, light + dark |
| `src/styles/peak-variables.css` | Legacy alias shell (to be removed after callers migrate) |
| `tailwind.config.js` | Exposes `--pk-*` as Tailwind utilities |
| `src/styles/vault-review.css` | Vault Review modal styles, consumes `--pk-*` |
| `src/styles/streamdown-shadow-host.css` | Streamdown shadow DOM tokens (separate shadcn HSL + pass-through) |
| `docs/mockups/_design-tokens-preview.html` | Visual reference for all tokens |
| `docs/superpowers/specs/2026-05-22-design-system-migration.md` | Migration history + rationale |

---

## 2. Component primitives catalog

11 shared `.pk-*` CSS classes live in `src/styles/peak-components.css`, with React wrappers in `src/ui/components/primitives/`. They are the visual atoms used across settings, onboarding, chat, and usage-dashboard surfaces. **Reach for the React primitive by default** (`import { Row, Chip, Modal, Button, ... } from '@/ui/components/primitives'`); drop the class directly on a `div`/`button` only when JSX scaffolding would be overkill.

This section is the **catalog** (what exists). For **which one to use when**, see §3.

### 2.1 Scope discipline

Every selector in `peak-components.css` is comma-scoped as `.pktw-root X, .peak-design-root X`. That means:

- Works inside any surface mounted under `.pktw-root` (chat / settings / project views) or `.peak-design-root` (modals)
- Does NOT leak into Obsidian's own UI chrome
- Specificity is `(0,2,0)` per branch — beats `obsidian-reset.css` rules like `.peak-design-root button { padding:0; border:0 }` (`(0,1,1)`)

**Do NOT use `:where(.pktw-root, .peak-design-root) X`** — that's `(0,1,0)` and gets blanked by the reset. Commit `7ad6d20` rewrote all primitives to the comma form after a Playwright specificity test confirmed the regression. See §4.4 for full context.

### 2.2 Mock → production token rename

The mocks under `docs/gstack/*-redesign-2026-05-29/` invented token names the production system doesn't ship. When porting mock CSS into the plugin, translate:

| Mock | Production |
|---|---|
| `--pk-text-strong`, `--pk-text` | `--pk-text-primary` |
| `--pk-text-muted` | `--pk-text-secondary` |
| `--pk-text-subtle` | `--pk-text-tertiary` |
| `--pk-surface-hover`, `--pk-surface-muted` | `--pk-surface-sunken` |
| `--pk-divider` | `--pk-border-soft` |
| `--pk-success-soft` / `--pk-warning-soft` / `--pk-danger-soft` | `--pk-success-bg` / `--pk-warning-bg` / `--pk-error-bg` |
| `--pk-danger` | `--pk-error` |
| `--pk-accent-soft-strong` | `--pk-accent-soft` |
| `--pk-accent-fg-on-soft` | `--pk-accent-text` |
| `--pk-r-sm/md/lg/xl` | `--pk-radius-sm/md/lg/xl` |
| inline `999px` | `--pk-radius-pill` |

Chip variants in the mock had explicit colored borders (`rgba(47, 148, 96, 0.2)` etc.); production chips use `border-color: transparent` and rely on `*-bg` background + `*` text color for definition.

### 2.3 Primitives

#### `.pk-row` (+ subparts + variants)

Settings/onboarding card row: `[32px icon] [body: title + desc + meta] [right: chip + value + control]`. Sized for Settings spec — radius-lg, `pk-shadow-card`, 14px padding.

```html
<div class="pk-row">
  <span class="pk-row__icon"><svg ... /></span>
  <div class="pk-row__body">
    <span class="pk-row__title">Embedding model</span>
    <span class="pk-row__desc">Used for semantic search across your vault.</span>
    <span class="pk-row__meta">Last indexed 3h ago</span>
  </div>
  <div class="pk-row__right">
    <span class="pk-chip pk-chip--success">Ready</span>
    <span class="pk-row__value">text-embedding-3-small</span>
  </div>
</div>
```

Variants: `--compact` (denser padding + 28px icon), `--disclosure` (clickable, hover surface sunken, `align-items: start`). `.pk-row__value--sans` overrides default mono font. React wrapper: `<Row>` + `Row.Icon` / `Row.Body` / `Row.Title` / `Row.Desc` / `Row.Meta` / `Row.Right` / `Row.Value`.

#### `.pk-chip` (+ 6 color variants)

Pill-shaped status/label chip, sized to inline text.

```html
<span class="pk-chip pk-chip--success">
  <CheckIcon class="icon" /> Ready
</span>
```

Variants: `--success`, `--warning`, `--danger`, `--neutral`, `--accent`, `--info`, `--provider`. `--danger` reads from production `--pk-error*` tokens despite its name.

#### `.pk-pill`

Toggleable filter pill (document-type pickers, tag filters). **Not a CTA button** — see §3.

```html
<button class="pk-pill" data-selected="false">PDF</button>
<button class="pk-pill" data-selected="true">Markdown</button>
```

#### `.pk-btn` (+ `--primary` / `--secondary` / `--ghost` / `--sm`)

CTA button — modal footer Back/Continue, wizard CTAs, form submits. Matches mock `.btn` spec: `radius-md`, 8×14 padding, 14px icons, primary = solid accent fill + white text.

```html
<button class="pk-btn pk-btn--primary"><CheckIcon /> Save</button>
<button class="pk-btn pk-btn--ghost"><ChevronLeftIcon /> Back</button>
```

Uses `!important` on bg/border/padding/border-radius to beat Obsidian's `.modal-content button` (see §4.3).

#### `.pk-icon-btn`

Square 28px transparent button for header close/dismiss or compact toolbar icons. Hover dims to `surface-sunken` + primary text. Uses `!important` (same Obsidian leak reason).

```html
<button class="pk-icon-btn" aria-label="Close"><XIcon class="icon" /></button>
```

#### `.pk-segmented` + `.pk-segmented__opt`

Inline segmented control (Index mode picker, list/grid view toggles).

```html
<div class="pk-segmented" role="tablist">
  <button class="pk-segmented__opt" data-selected="true">List</button>
  <button class="pk-segmented__opt" data-selected="false">Grid</button>
</div>
```

#### `.pk-modal-*`

Modal scaffolding: scrim overlay + sized shell + standard head/body/footer slots.

```html
<div class="pk-modal-overlay" data-open="true">
  <div class="pk-modal-shell pk-modal-shell--wide">
    <div class="pk-modal-shell__head">
      <div>
        <span class="pk-modal-shell__title">Add Provider</span>
        <span class="pk-modal-shell__sub">Pick a vendor to connect</span>
      </div>
      <button class="pk-icon-btn" aria-label="Close"><XIcon /></button>
    </div>
    <div class="pk-modal-shell__body">…</div>
    <div class="pk-modal-shell__footer">
      <button class="pk-btn">Cancel</button>
      <button class="pk-btn pk-btn--primary">Save</button>
    </div>
  </div>
</div>
```

Variants: `--narrow` (460px), default 560px, `--wide` (720px). Overlay scrim `rgba(0,0,0,0.42)` hardcoded intentionally (dialog convention, not a token surface). Title uses `--pk-text-lg` (14px).

React wrapper: `<Modal>` compound with `Modal.Trigger` / `Modal.Content` (`width: 'narrow' | 'default' | 'wide'`) / `Modal.Header` / `Modal.Title` / `Modal.Subtitle` / `Modal.Close` / `Modal.Body` / `Modal.Footer`. Uses Radix Dialog for focus trap + escape-to-close + portal mounting. `Modal.Close` renders an `<IconButton>` internally.

#### `.pk-popover` + `.pk-pop-item`

Floating menu surface (model picker, action menus, quick command lists). Positioning is the caller's responsibility — typically wired via Radix popover or Floating UI.

```html
<div class="pk-popover">
  <button class="pk-pop-item"><EditIcon class="icon" /> Rename</button>
  <button class="pk-pop-item"><CopyIcon class="icon" /> Duplicate</button>
</div>
```

#### `.pk-form-*` (grid + row + label + control + input + slider + number)

Form layout primitives for modal bodies and disclosure panels.

```html
<div class="pk-form-grid">
  <div class="pk-form-row">
    <label class="pk-form-label">
      API Key
      <span class="pk-form-label__hint">Stored locally; never sent.</span>
    </label>
    <div class="pk-form-control">
      <input class="pk-form-input" type="password" />
      <span class="pk-form-control__hint">Find this on your provider dashboard.</span>
    </div>
  </div>

  <div class="pk-form-row pk-form-row--stack">
    <label class="pk-form-label">System prompt</label>
    <textarea class="pk-form-textarea pk-form-input--sans"></textarea>
  </div>

  <div class="pk-form-slider">
    <input type="range" min="0" max="2" step="0.1" />
    <span class="pk-form-slider__value">0.7</span>
  </div>

  <div class="pk-form-number">
    <input type="number" />
    <span class="pk-form-number__unit">ms</span>
  </div>
</div>
```

Inputs use mono (`--pk-font-mono`) since most production form fields hold technical content (keys, IDs, paths). Add `.pk-form-input--sans` for free-text fields. `.pk-form-select` defaults to sans for readability.

#### `.pk-disclosure-body`

Content frame that sits flush below a `.pk-row--disclosure`, sharing borders to form a continuous "open" surface.

```html
<div class="pk-row pk-row--disclosure" aria-expanded="true">…</div>
<div class="pk-disclosure-body">
  <div class="pk-row">Nested row, flipped to surface bg for contrast</div>
  <div class="pk-row">Another nested row</div>
</div>
```

Nested `.pk-row` instances are automatically flipped to `--pk-surface` background for contrast against the sunken disclosure frame.

#### `.pk-brand-av` (+ `--sm`, + `[data-provider]`)

Circular provider avatar; either a brand SVG/icon child or letter fallback. Color binds via data-attribute to the `--pk-prov-*` tokens.

```html
<span class="pk-brand-av" data-provider="anthropic"><AnthropicMark /></span>
<span class="pk-brand-av pk-brand-av--sm" data-provider="openai">O</span>
```

Sizes: default 28px, `--sm` 20px. Supported providers: `openai`, `anthropic`, `google`, `openrouter`, `perplexity`, `ollama`. To add another, define `--pk-prov-<name>` + `--pk-prov-<name>-soft` in `peak-tokens.css` first, then add the `[data-provider="<name>"]` selector here. Without `data-provider`, falls back to neutral sunken bg + secondary text.

### 2.4 Known surface modifiers

When a mock spec differs from a base primitive's defaults, add a surface modifier (don't fork the primitive, don't inline-style). The modifier name follows the surface namespace (`pkonb-` / `pkset-` / `pkchat-` / `pkdash-`).

| Modifier | Base primitive | What it changes |
|---|---|---|
| `pkonb-provider-row` | `pk-row` | Flat: radius-md, no shadow, 10×12 padding |
| `pkchat-role-pill` | `pk-pill` | Grid-cell fill (`width: 100%`, `justify-content: center`), `xs` font, nowrap+ellipsis — for the 3×2 role grid in the run-settings popover |
| `pkchat-msg__model-chip` | `pk-chip--accent` | Mono font + 11.5px size + right margin — `<Chip variant="accent" className="pkchat-msg__model-chip">` for the per-message model identifier |
| `pkchat-msg__mode-badge` | `pk-chip--accent` | Smaller font (xs) + tighter padding + uppercase — `<Chip variant="accent" className="pkchat-msg__mode-badge">` for the inline Agent / Plan badge in the message head row |
| `pkchat-starter` | `pk-btn` (`--ghost`) | Pill starter chip: 30px height, pill radius, transparent + soft border, `sm`/400 weight, 13px icon — the start-state prompt starters below the composer |
| `pkchat-projhero__action` | `pk-btn` (`--primary`) | Project-hero primary action at mock 30px: 30px height, `0 10px` padding, radius-md, `sm` font, 13px icon — "New conversation" in the project identity hero |
| `pkchat-projdesc-btn` | `pk-btn` | Shared 27px sizing for the three description-editor buttons (AI / Cancel / Save): 27px height, `0 8px` padding, radius-sm, `sm` font, 12px icon |
| `pkchat-projdesc-ai` | `pk-btn` | Adds accent-tint fill + accent text + accent border on top of `pkchat-projdesc-btn` — the "Draft with AI" description-editor button |
| `pkchat-projsection__action` | `pk-btn` (`--ghost`) | Section-head secondary action at 26px: 26px height, `space-1` padding, radius-sm, secondary text, `sm` font, 13px icon — "New conversation" / "Add resource" / "New plan" |
| `pkstudio-picker-search` | search input | Mock `.compact-search` idiom (30px pill + focus ring) for the ViewAll conversation-picker filter input; `<input>` box props `!important` (bare-tag defense) like `.pkchat-idx__search` |
| `pkstudio-picker-row` | `pkstudio-nav-row` density | 30px result row for the ViewAll picker: 13px `--pk-font-sans` label + trailing 10px mono uppercase `--pk-text-tertiary` type tag (`__label` / `__tag` slots) |

Add yours here when you introduce a new surface modifier.

### 2.5 React wrapper vs CSS class

- **Use the React wrapper** — anytime inside a `.tsx` file building structured UI; you get prop typing, slot composition, accessibility wiring (focus trap, aria-* attrs)
- **Use the CSS class directly** — quick prototypes in `.html` mocks, one-off snippets, test fixtures

Keep call-sites grep-able by always using the `pk-*` prefix.

### 2.6 Build pipeline

`peak-components.css` is imported from `src/styles/tailwind.css` immediately after `peak-tokens.css` and `peak-variables.css` (depends on tokens, must precede Tailwind utilities so per-component overrides in Tailwind classes can still win specificity). Tailwind compiles to `styles.tailwind.css`; `scripts/concat-css.mjs` concatenates into final plugin `styles.css`.

If you add new primitives, append them to this doc and to `peak-components.css` (same section ordering). Don't introduce parallel `.peak-*` or `.kb-*` namespaces — keep `pk-*` as the one prefix.

**The `@import` list at the very top of `src/styles/tailwind.css` is the ONLY gate into the bundle.** Per CSS spec, an `@import` placed below the first style rule is silently ignored — this is exactly how `codemirror.css` shipped orphaned for months while looking imported (a mid-file `@import` at old line 112). When adding a stylesheet: import it in the top block, then verify a distinctive selector actually appears in built `styles.css` (`grep 'your-selector' styles.css`). Source-level review is not proof; the bundle is.

---

## 3. Primitive usage — decision rules

§2 tells you what exists; §3 tells you which one to use. Pick by **intent**, not by **shape**.

### 3.1 Why

Five visual regressions in a row (2026-06-01) all had the same DNA: implementer grabbed a primitive whose CSS shape was close to the mock, but whose **semantic intent** was for a different role. The CSS itself was correct in isolation — the *call site* was wrong. CSS-vs-CSS audits don't catch this; only intent-based audits do.

Concrete examples:

- `<Pill>` used for onboarding footer Back / Got it CTAs. Pill's `selected` background is `accent-soft` (filter active tint), not the solid accent fill a primary CTA needs. The shape (999px) was also wrong — CTAs in the mock use `radius-md`.
- `<Row>` used for onboarding's saved-provider list. Row is sized for Settings cards (radius-lg + `pk-shadow-card` + 14px padding). The onboarding mock spec is flatter — radius-md, no shadow, 10×12 padding. Reusing Row made every onboarding row look chunky.

Root cause behind both: the primitive library was missing a real `Button` primitive entirely, and Row was over-unified across surfaces. Implementers had no correct option, so they grabbed the closest-shaped one.

### 3.2 Decision tree

| You want… | Use | NOT |
|---|---|---|
| Primary CTA button (Save, Continue, Got it) | `<Button variant="primary">` | ❌ `<Pill selected>` |
| Secondary CTA (Add, Edit, Cancel inside form) | `<Button variant="secondary">` | ❌ `<Pill>` |
| Tertiary / link-style CTA (Back, Skip) | `<Button variant="ghost">` | ❌ `<Pill>` |
| Toggleable filter chip (PDF / MD / Tag pickers) | `<Pill data-selected="…">` | ❌ `<Button>` |
| Status / label chip (Ready / Failed / Indexed) | `<Chip variant="…">` | ❌ `<Pill>` |
| Icon-only square button (Close, Delete in list) | `<IconButton>` | ❌ `<button>` with `<X />` |
| Settings card row (big — list of preferences) | `<Row>` | — |
| Onboarding flat row (compact saved-provider list) | `<Row className="pkonb-provider-row">` | ❌ bare `<Row>` |
| Multi-step picker (List/Grid, Mode toggle) | `<Segmented>` | ❌ row of `<Pill>` |
| Modal dialog | `<Modal>` compound | — |
| Floating menu | `<Popover>` compound | — |
| Form input layout | `<FormRow>` / `<FormGrid>` | — |

### 3.3 Before implementing a new step / surface, produce a mock→primitive map

For every mock CSS class the surface uses, list which primitive it maps to. Anything that resolves to "❌ no primitive matches" is a **stop-work signal**: fix the primitive library first, *then* write the step.

Good:

```
mock class            primitive
.btn                  pk-btn / <Button>
.btn--primary         <Button variant="primary">
.btn--ghost           <Button variant="ghost">
.provider-row         <Row className="pkonb-provider-row">  # surface modifier
.provider-chip        pkonb-provider-chip (already exists)
.field                <FormRow>
.input                <FormRow.Input>
```

Bad (gaps unflagged):

```
mock class            primitive
.btn                  <Pill>                                # ❌ wrong intent
.provider-row         <Row>                                 # ❌ wrong spec
```

If the second list ships, you get image #25 + image #26 regressions.

### 3.4 When mock differs from existing primitive → add a surface modifier

Don't fork the primitive. Don't inline-style override it. Add a CSS modifier scoped to the surface:

```css
/* peak-components.css */
.pktw-root .pk-row.pkonb-provider-row,
.peak-design-root .pk-row.pkonb-provider-row {
  border-radius: var(--pk-radius-md);
  box-shadow: none;
  padding: 10px 12px;
  gap: 12px;
}
```

```tsx
<Row className="pkonb-provider-row" data-selected={selected ? 'true' : undefined}>
  …
</Row>
```

Register the new modifier in §2.4.

### 3.5 When no primitive fits at all → add one to the library

If the mock needs something the library doesn't have (e.g. a CTA button before `pk-btn` existed):

1. Add the CSS to `peak-components.css` with comma-scoping (see §2.1)
2. Add the React wrapper to `src/ui/components/primitives/`
3. Export from `src/ui/components/primitives/index.ts`
4. Document it in §2.3 (catalog + when-to-use-vs-class)
5. *Then* use it in the surface

Don't ship the surface with the gap papered over by inline styles or a wrong primitive.

### 3.6 Don't

```tsx
// ❌ <Pill> for any button that's not a toggleable filter
<Pill selected onClick={handleContinue}>
  <ChevronRight />
  <span>Got it — let's configure</span>
</Pill>

// ✅ Button is the CTA primitive
<Button variant="primary" onClick={handleContinue}>
  <span>Got it — let's configure</span>
  <ChevronRight />
</Button>
```

```tsx
// ❌ inline-style override a primitive's geometry — fights the primitive
<Row style={{ borderRadius: '8px', boxShadow: 'none', padding: '10px 12px' }}>

// ✅ surface modifier in CSS
<Row className="pkonb-provider-row">
```

```tsx
// ❌ conditional inline-style for state — can't be styled via :hover etc.
<Row style={selected ? { borderColor: 'var(--pk-accent)', background: '…' } : {}}>

// ✅ data-attribute, all states in CSS
<Row data-selected={selected ? 'true' : undefined}>
```

If the mock has a `.btn` and you have no `<Button>`, the answer is "add `<Button>`", not "use `<Pill>` because it's also round" (§3.5).

Worktree handoffs that hand the implementer a mock file but no primitive mapping will reliably ship image #25-class regressions. The map is a 10-minute artifact that prevents hours of visual-fidelity firefighting.

---

## 4. Obsidian CSS defense

### 4.1 The mechanism

Obsidian's `app.css` and themes contain rules like:

```css
button {
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--input-radius);
    padding: var(--size-4-2) var(--size-4-3);
    ...
}
input, textarea, select { ... }
h1, h2, h3, h4, h5, h6 { ... }
a { ... }
```

These are **unscoped bare-tag selectors** with no class qualifier. They apply to every matching element in the DOM, including inside plugin modals.

**Rule**: every scoped UI surface (modal / panel / overlay) MUST add the `peak-design-root` class on its outermost element. That class triggers the reset defined in `src/styles/obsidian-reset.css`.

**Root font pin (2026-07-18)**: the reset also pins `font-family: var(--pk-font-sans)` + `font-size: var(--pk-text-md)` + antialiasing on `.pktw-root, .peak-design-root`. Declaring the token (§1) is NOT enough — without a root-level *application*, every surface inherits Obsidian's `--font-interface`, which vaults routinely customize (the discovery vault ran "PingFang MO" + two custom CJK faces, making every panel look subtly alien no matter how correct the leaf styles were). Leaf `--pk-font-mono` rules still override. Portal surfaces get the pin via the `pk-portal-host` scope root (`ReactRenderer.portalHostForDocument`).

**The pin only holds while it is the bundle's ONLY root `font-family` declaration.** Regression (2026-07-18, same day the pin landed): `tailwind.css`'s own `.pktw-root` isolation block still carried `font-family: var(--font-interface, …)` from the pre-token era. A file's body rules concatenate AFTER its `@import`s, so that declaration sat later in the cascade at equal specificity and silently re-un-pinned every surface — visual spot-checks missed it because PingFang's Latin glyphs resemble SF Pro. Verify at the bundle: `grep -o 'font-family:var(--font-interface[^;]*' styles.css` must return only the documented Obsidian-embedded exemptions (currently `.peak-serendipity-hint`, an editor-gutter widget that SHOULD follow the editor font). Any new rule setting `font-family` on `.pktw-root`/`.peak-design-root` outside `obsidian-reset.css` is a review-blocking error.

### 4.2 Why our scoped CSS often loses

We write `.peak-vault-modal .vr-tab { border: 1px solid transparent }` on `<button class="vr-tab">`. Specificity is `(0,2,0)` — we should win. But three things conspire against us:

1. **Obsidian themes use `!important` liberally** in places we didn't expect
2. **We typically only override a few properties** (border, background) and leave `border-radius`, `padding`, `box-shadow` to be controlled by Obsidian — those leak through and break the look
3. **Hover / focus / disabled states** aren't explicitly set, so they fall back to Obsidian's

### 4.3 Regression #3: `.modal-content button` beats primitive comma-scoping (2026-06-01)

Obsidian's modal CSS ships a rule like `.modal-content button { background: var(--interactive-normal); border: 1px solid …; padding: …; border-radius: … }`. Specificity: `(0,2,1)`.

Our primitive scoping is `.pktw-root .pk-X, .peak-design-root .pk-X` — `(0,2,0)` per branch. **Loses to Obsidian** for every button-based primitive mounted inside an Obsidian Modal (`pk-btn`, `pk-icon-btn`, `pk-pill`, `pkonb-radio-card`, etc.). Symptom: trash buttons render with a gray rounded box (Obsidian's `--interactive-normal` bg); radio cards get wrong padding making rows visually overlap.

`obsidian-reset.css`'s `.peak-design-root button { background: none; … }` is `(0,1,1)` — also loses.

**Fix pattern**: button-based primitives must use `!important` on the properties Obsidian aggressively styles — `background`, `border` (and `border-color`), `padding`, `border-radius`, **plus `width` / `height` / `min-width` / `min-height`** — in both the base rule and any state variants (`:hover`, `[data-selected="true"]`, etc.):

```css
.pktw-root .pk-icon-btn,
.peak-design-root .pk-icon-btn {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  border-radius: var(--pk-radius-md) !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  min-height: 28px !important;
  …
}
```

`!important` is required because we're fighting `(0,2,1)` with `(0,2,0)` — bumping a class selector or rewriting as `.peak-design-root button.pk-icon-btn` (tie at `(0,2,1)`, source-order dependent) is more fragile across Obsidian theme overrides.

**Surfaces affected**: any primitive rendered as `<button>` inside an Obsidian `Modal` subclass *or* a `WorkspaceLeaf`. The original framing of §4.3 (2026-06-01) only flagged Modal surfaces because `obsidian-reset.css`'s `.peak-design-root button` only acted on bg/border/padding/border-radius back then. The 2026-06-03 sub-regression below proved leaves are equally affected once you start fighting the reset on `height`/`width`.

#### 4.3.1 Sub-regression: 16px collapsed button height in chat composer (2026-06-03)

DevTools on `.pkchat-composer__foot-right` reported `269.23 × 16px` — the entire right cluster (run-chip + mic + send) was rendering at icon-natural height (~16px). RunChip had `height: 30px`; send had `width: 32px; height: 32px`. None had `!important`. The reset's `.peak-design-root button { height: auto !important; min-height: 0 !important; max-height: none !important }` (specificity `(0,1,1)` + `!important`) was winning against the primitives' `(0,2,0)` rules.

Why this is sneaky: every other button visual property (`bg`, `border`, `padding`, `border-radius`) had `!important` because §4.3 had been around since the modal regression. But `height`/`width` had been left bare, on the assumption that "non-modal surfaces don't need defense." They do — the reset itself nulls these globally inside any `peak-design-root`, modal or not.

Fix landed in commits to `peak-components.css`:

- `.pk-icon-btn` — added `!important` on `width`/`height`/`min-width`/`min-height`
- `.pkchat-run-chip` — added `!important` on `height`/`min-height`/`padding`
- `.pkchat-send` — added `!important` on `width`/`height`/`min-width`/`min-height`/`padding`

**Heuristic for future primitives**: if you set an explicit `width` or `height` (px / rem) on a `<button>` inside `peak-design-root` and the DevTools-reported size differs, the reset is winning. Add `!important` to the dimension AND to `min-*`/`max-*` (the reset clamps all three). Don't try to "diagnose" with Computed → Show All — just add the !important up front.

**Detection signal**: when a new button-based primitive lands, open it in Obsidian, hover the rendered DOM in DevTools, and verify the box dimensions match the CSS values. A pixel mismatch means a leak.

### 4.4 Regression #2: modalEl is outside `peak-design-root` scope (2026-06-01)

Obsidian's `Modal` class renders TWO elements: `modalEl` (outer chrome — border, shadow, rounded corners) and `contentEl` (inner content). Adding `peak-design-root` to `contentEl` only protects the inside. The outer `modalEl` still inherits **the theme's accent border + box-shadow**, which on some themes is a thick purple ring that visibly overrides the design system's intended subtle gray border.

**Fix pattern** (per `HarnessOnboardingModal.onOpen`):

```ts
onOpen(): void {
    this.modalEl.addClass('pkonb-modal-shell');  // tag the OUTER, not contentEl
    this.contentEl.addClass('peak-design-root'); // inner protection still needed
    ...
}
onClose(): void {
    this.modalEl.removeClass('pkonb-modal-shell');
    ...
}
```

CSS overrides must use `!important` because they're fighting Obsidian's theme stylesheet:

```css
.pktw-root .pkonb-modal-shell,
.peak-design-root .pkonb-modal-shell {
    border: 1px solid var(--pk-border) !important;
    box-shadow: var(--pk-shadow-modal) !important;
    border-radius: var(--pk-radius-lg) !important;
    background: var(--pk-surface) !important;
}
```

Each modal class needs its own outer tag. Tag both `modalEl` AND `contentEl` if you want the full design language.

### 4.5 Regression #1: `:where()` vs reset (2026-05-31)

The Design System Unification (PR-0) scoped every `.pk-*` primitive with `:where(.pktw-root, .peak-design-root) .pk-foo` to "keep specificity low so per-component overrides could win without `!important`". That logic worked for component-level overrides — but it ignored that the local reset itself uses `.peak-design-root button { padding: 0; border: 0; border-radius: 0; ... }` (specificity `(0,1,1)`). `:where()` contributes 0 specificity, so the scoped selectors were `(0,1,0)` — LOWER than the reset. Every `<button>`/`<input>` based primitive (`.pk-pill`, `.pk-icon-btn`, `.pk-segmented__opt`, `.pkonb-radio-card`, etc.) had its border/padding/background blanked.

**Fix**: use plain comma-scoping `.pktw-root .pk-foo, .peak-design-root .pk-foo` — `(0,2,0)` per branch, beats the reset. See commit `7ad6d20`. **Do not re-introduce `:where()` for primitives that share a tag with reset rules.**

**Recurred 2026-07-18** in `dashboard-charts.css`, which wrapped its entire file in `:where(.peak-design-root.usage-dashboard)` — the pager (`.pk-pager__btn`) and KPI (`.pk-kpi-action`) `<button>`s collapsed in production exactly as described above (the reset's `height: auto !important` + bg/border/padding blanking won at `(0,1,1)` vs `(0,1,0)`). Fixed by swapping the wrapper to `:is()`. Review heuristic: `:where()` in a file that styles any `<button>`/`<input>`-rendered component is an automatic red flag.

### 4.6 Why this is a recurring trap

- Most components look fine in isolation (storybook / mock HTML opened in browser) because there's no Obsidian to inject
- Each new component author rediscovers the issue and fixes case-by-case (e.g. swapping `<button>` for `<div role="button">`)
- There's no project-level reset that new code can opt into without remembering `peak-design-root`

### 4.7 Do

**Scope-class contract (2026-07-18)**:

| Class | Grants | Use on |
|---|---|---|
| `pktw-root` | `--pk-*` tokens + root font pin (family / 13px base / smoothing) | every plugin surface — including hand-built `extends Modal` DOM that keeps Obsidian's native `mod-cta`/`mod-warning` button chrome |
| `peak-design-root` | all of the above PLUS the bare-tag reset (`obsidian-reset.css`) | fully design-system surfaces (pixel-perfect React UI) |

`ReactRenderer.render()` and `portalHostForDocument()` stamp **both** classes automatically (2026-07-18) — React surfaces need no manual class wiring. Hand-built Obsidian `Modal` subclasses must `contentEl.addClass('pktw-root')` themselves; add `peak-design-root` only if the modal does NOT rely on Obsidian's native button styling. `--font-interface` is legitimate only on surfaces living inside Obsidian's own UI (editor gutter, status bar).

**Portals**: never `createPortal(x, document.body)`. Use `usePortalContainer()` (provided by every `ReactRenderer` tree) or `portalHostForDocument(el.ownerDocument)` — the host carries both scope classes, is per-Document (popout-safe), and is `isConnected`-rechecked. A bare-body portal loses every token: `var(--pk-*)` resolves to nothing, not just "wrong font".

```tsx
// 1. Add peak-design-root to your modal / panel root
async onOpen(): Promise<void> {
    this.modalEl.addClass('peak-my-feature-modal');
    this.modalEl.addClass('peak-design-root'); // ← neutralises Obsidian
    ...
}

// For React-only mounts (non-modal):
<div className="peak-my-feature-panel peak-design-root">
    ...
</div>
```

```css
/* 2. Write scoped CSS that builds UP from the reset baseline
   After the reset, <button> has no bg/border/padding/outline. */
.peak-my-feature-modal .vr-tab {
    background: var(--pk-accent-tint);
    color: var(--pk-accent-text);
    border: 1px solid var(--pk-accent-soft);
    padding: 7px 12px;
    border-radius: 10px;
    /* explicit at every property — no relying on inheritance */
}
.peak-my-feature-modal .vr-tab:hover {
    background: var(--pk-accent-tint-hover);
    /* states must be explicit too */
}
```

```tsx
// 3. Prefer the <Button> primitive (Tailwind important: true)
<Button variant="primary">Save</Button>
```

### 4.8 Don't

```tsx
// ❌ Skip the reset class and hope CSS specificity wins
this.modalEl.addClass('peak-my-modal');
// .peak-my-modal button { background: transparent; }
// → border / padding / border-radius still come from Obsidian
```

```tsx
// ❌ Use raw <button> outside a peak-design-root scope
<button className="my-btn">Click</button>
// → will pick up Obsidian's button styling
```

If you can't add `peak-design-root` to a wrapper, either use `<div role="button" tabIndex={0} onKeyDown={...}>` or the `<Button>` primitive.

```css
/* ❌ Override only `border` and trust the rest */
.peak-my-modal button { border: 0; }
/* Obsidian still sets background, padding, border-radius, box-shadow, outline */
```

### 4.9 Properties the reset must null

Each property Obsidian touches on bare tags has to be explicitly defended. The list below grew incident-by-incident — **add to it every time we find a new leak** instead of letting future code rediscover the same trap.

| Property | Why Obsidian sets it | Symptom when leaked |
|---|---|---|
| `background` / `border` / `padding` / `border-radius` / `box-shadow` / `outline` | Default `button` chrome | Card-style buttons get pill shape, theme colours, extra ring |
| `height: var(--input-height)` (32px) | Obsidian wants every modal button to be touch-target-sized | Card buttons get locked to 32px even when content needs 60+px — flex layout breaks. **Required:** `height: auto !important; min-height: 0 !important; max-height: none !important` |
| `height: auto !important; min-height: 0 !important` on `.peak-design-root button` (our own reset) | Defensive null applied so per-primitive height wins — but only if THAT primitive's height is also `!important` | Button-based primitives with bare `height: 30px` collapse to icon-natural height (~14-16px). Symptom: `pkchat-composer__foot-right` renders 269×16 instead of 269×32. **Required:** every primitive that needs an explicit size must use `!important` on `width`/`height`/`min-width`/`min-height` (see §4.3.1) |
| `justify-content: center` | Same reason as above | Custom flex content gets centered instead of `flex-start` |
| `transform: translateY(-1px)` on `:hover` | Theme "press" animation | Hovered row visibly shifts up 1–2px |
| `transform: scale(1.05)` on `:focus` / `:active` | Theme focus emphasis | Clicked row visually grows |
| `box-shadow: 0 0 0 Npx ...` on `:hover`/`:focus` | Theme glow/halo | Coloured halo around hovered buttons |
| `outline: 2px solid ...` on `:focus-visible` | Browser/Obsidian focus indicator | Visible ring after click |
| `padding`/`margin` on `:hover` | Some themes bump padding for "active" state | Row geometry changes only on hover |
| `transition: ... padding ...` | Theme animates state changes | Animated size pop on hover |
| `::before` / `::after` with absolute positioning | Theme ripple / hover glow effects | "Halo" around button that can't be killed from the button itself |

**Defensive default** in the reset for `:hover`, `:focus`, `:active`, `:focus-visible`: every property above is set to `none !important` (or the safe-default equivalent), so a new component can rely on its own Tailwind / inline styles being the only thing that takes effect.

### 4.10 Diagnosing a suspected leak

When a component looks wrong in Obsidian but fine in the static mock:

1. Open DevTools, select the offending element, look at **Computed** styles
2. Search for properties that aren't from your CSS (no `--pk-*` source). Common smoking guns: `height: var(--input-height)`, `transform: translateY`, `box-shadow: ... var(--background-modifier-...)`, `outline: ... var(--focus-ring-color)`
3. If found → it's an Obsidian leak. Either add the property to the reset above with `!important`, or add an explicit Tailwind utility that overrides it
4. **Always reproduce the same markup in `/tmp/*.html` with the built `styles.css` loaded** — if it renders correctly there, the bug is 100% an Obsidian leak (not your component code)

### 4.11 Implementation

The reset itself lives at `src/styles/obsidian-reset.css`. It's imported by `src/styles/tailwind.css` so it lands in the final bundled `styles.css`. The reset is scoped by `.peak-design-root` so it's a no-op outside opted-in surfaces.

---

## 5. JSX-mock fidelity

CSS-vs-CSS audits don't catch JSX structure bugs. When implementing a mock, the audit must include a **JSX-vs-mock structural diff**: every section, slot, and conditional in the mock HTML maps to a section/slot/conditional in the JSX.

### 5.1 Why

Image #30 (commit `7257710`): bootstrap model list rendered with `align-items: flex-start` + `<span className="hint">{option.hint ?? ''}</span>`. Half the rows had no hint, but the empty span still claimed line-height of vertical space. The body became taller than the icon, the icon parked at the top, the blank bottom strip showed under each icon as a "phantom row fragment". User read it as "大量错位".

Image #22 (commit `afc1e63`): run-chip popover. CSS perfectly matched mock. But the JSX rendered only 1 of the 5 sections specified in the HTML mock — the other 4 (Role / Model / Context / Tools) were entirely missing. The visual-fidelity audit was CSS-only, so it didn't notice.

Image #23 (commit `1110e67`): ConversationIndex Messages tab. CSS for the new layout was in place, but the JSX still rendered the old nested accordion structure. Same audit blind spot.

Pattern: **the audit was comparing styles, not structure**. A new component that renders a different DOM tree than the mock will pass every CSS-token / spacing / shadow check and still look completely wrong.

### 5.2 Two recurring JSX traps

**Trap 1: `{x ?? ''}` and `<span>{maybe || ''}</span>` are NOT no-ops in flex layouts.** An empty span still occupies a line-height worth of vertical space. Use `{x && <span>{x}</span>}` so the slot collapses to zero when empty.

**Trap 2: Optional decorations belong INLINE with the primary text**, not in a separate "subtitle" slot — unless that slot is always non-empty across all rows. Otherwise rows become ragged: some have one line, some have two, the column looks like a broken accordion.

### 5.3 Do

**1. Conditional render, not falsy-fallback content**

```tsx
// RIGHT — slot collapses to 0px when absent
{option.hint && (
    <span className="card__hint">{option.hint}</span>
)}

// RIGHT — fragment so the optional pieces share their parent's flex/gap
{(option.recommended || option.hint) && (
    <span className="card__hint">
        {option.recommended && <Chip variant="accent">Recommended</Chip>}
        {option.hint}
    </span>
)}
```

**2. Inline optional decorations with the title**

```tsx
// RIGHT — title and optional badge share one row; row height is constant
<span className="card__title-row">
    <span className="card__title">{name}</span>
    {recommended && <Chip variant="accent">Recommended</Chip>}
</span>

// .card__title-row { display: inline-flex; align-items: center; gap: var(--pk-space-2); }
```

The title row is always non-empty (title is required), so adding an optional chip to it doesn't change row count or height.

**3. Floor variable-content cards with `min-height`**

When a list has cards whose internal content can vary (some have hint text, some don't), set a `min-height` so the worst-case empty card still aligns with its filled neighbors:

```css
.pkonb-radio-card {
  min-height: 56px;
}
```

Belt-and-suspenders defense against future JSX changes that re-introduce variable height.

**4. Audit must include JSX structural diff**

```
□ For every <section> / <div class="…"> in the mock HTML, the JSX renders
  a corresponding container with the same class
□ For every conditional / loop in the mock, the JSX has matching React
  conditional or .map
□ Optional slots use { x && <…/> } not { x ?? '' } and not <span>{x || ''}</span>
□ Every card in a list renders to the same DOM shape regardless of optional
  fields (test by setting all fields empty, then all fields full — both
  should render at the same height ± content-driven growth)
```

If a JSX structural diff doesn't fit in the visual-fidelity audit doc, do it as a second pass.

### 5.4 Don't

```tsx
// ❌ {x ?? ''} or <span>{maybe || ''}</span> inside flex column
// empty span occupies line-height, making body taller than icon
<span className="body">
    <span className="title">{name}</span>
    <span className="hint">{hint ?? ''}</span>
</span>
```

```tsx
// ❌ Stack optional decoration under title in a sometimes-empty slot
// when recommended is false, hint slot is empty; rows are ragged
<span className="body">
    <span className="title">{name}</span>
    <span className="hint">
        {recommended && <Chip>Recommended</Chip>}
        {hint}
    </span>
</span>
```

```tsx
// ❌ visibility:hidden to fake a constant-height slot — screen-reader noise + fragile
<Chip style={{ visibility: recommended ? 'visible' : 'hidden' }}>Recommended</Chip>
```

A "✅ all tokens correct" verdict on a CSS-only audit means the component will paint correctly *for the elements that exist*. It says nothing about whether the elements exist at all. Always pair with a structural pass.

### 5.5 Where this rule has bitten us

- Bootstrap model list (`pkonb-radio-card`) — image #30 / commit `7257710` / 2026-06-01
- Run-chip popover sections — image #22 / commit `afc1e63` / 2026-06-01
- ConversationIndex Messages tab — image #23 / commit `1110e67` / 2026-06-01

Add new instances here when this rule rescues a regression.

---

## 6. Surface drift prevention

§1-§5 handle *building* a surface right. §6 is about what happens at the *fleet* level — multiple surfaces drifting away from the system over time. Every rule here was distilled from a real audit that found the same root cause across many components at once.

### 6.1 Chip / pill / button proliferation

**Symptom.** Audit finds N parallel CSS classes (`pksurfaceA-thing-chip`, `pksurfaceB-thing-pill`, `pksurfaceC-thing-tag`, …) that all do the same thing visually but drift in `border-radius`, `padding`, `font-size`, and `background` over time. Every new surface invents its own.

**Real case (chat audit, 2026-06-02).** Seven independent chip-shaped classes coexisted in `peak-components.css`. Each had its own `border-radius`/`padding`/`font-size`/`background` value. Designer feedback: "胶囊样式不固定, 不一样" — the chips that look identical in the mock render visibly inconsistent in the product.

Migration result (2026-06-02):

| Class | Disposition | Why |
|---|---|---|
| `pkchat-idx__filter` | → `<Pill selected>` | Toggleable filter — exact Pill intent |
| `pkchat-runpop__role-pill` | → `<Pill className="pkchat-role-pill">` | Toggleable role picker + grid-cell sizing as a surface modifier (§2.4) |
| `pkchat-idx__count-pill` | → `<Chip variant="neutral">` | Count badge — exact Chip intent |
| `pkchat-msg__model-chip` | → `<Chip variant="accent" className="pkchat-msg__model-chip">` | Accent label + mono font (surface modifier in §2.4) |
| `pkchat-msg__suggest-chip` | Kept | CTA-shaped clickable pill with arrow icon — not a status chip, not a filter; intent gap |
| `pkchat-idx-attach` | Kept | Truncating filename link with icon — intent gap |
| `pkchat-run-chip` | Kept | Multi-segment composite (mode · model · ctx · role + chevron) — not a single chip |

The 3 kept classes are tracked here so future audits stop counting them as drift. If/when the design system gains a primitive that matches their intent (`<ChipButton>` for CTA-pills, `<TruncatingLink>` for attachments), migrate then.

**Rule.** *Before* creating a new `pk(surface)-*-chip` / `*-pill` / `*-tag` class, check the §3.2 decision tree:

- **Toggleable filter / picker / role selector** → `<Pill data-selected="…">`. Don't invent a new pill class for "the role pill in this popover".
- **Status / label / count badge** → `<Chip variant="…">`. Even a count "3" is a chip.
- **Capsule-shaped CTA / link with arrow** → `<Button variant="ghost" className="…--capsule">` + add a `--capsule` surface modifier if the mock truly needs pill-radius on a CTA.

If none fit, the answer is "add a primitive" (§3.5), **not** "add another `pksurfaceX-foo-chip`".

**Detection signal.** `grep -c "border-radius: var(--pk-radius-pill)" src/styles/peak-components.css` — if the count climbs by more than one or two per major PR, you're proliferating. Also: file a quick chip inventory in the PR description for any surface touching ≥3 pill-shaped elements.

#### Peer action consistency contract

Visual consistency is evaluated by **interaction role + density + state**, not by DOM ancestry or whether an action is powered by AI. Two controls that sit in the same toolbar and perform peer actions must share the same primitive and the same geometry.

For every action surface, classify each control before styling it:

| Family | Intended role | Required shared properties |
|---|---|---|
| Toolbar action | Text/icon command inside one toolbar | height, horizontal padding, radius, resting surface, hover/focus/disabled treatment, icon size |
| Toolbar icon action | Icon-only formatting, close, history, or navigation command | square hit target, radius, icon size, hover/focus/disabled treatment |
| Rail control | Block disclosure, drag, or adjacent structural control | hit target, border, radius, icon weight, shadow, spacing |
| Review action | Accept, reject, retry, restore, or cancel for one candidate | height, radius, typography and state model; semantic color may vary by intent |
| Status chip | Non-destructive label, count, warning, provenance, or state | chip height, pill radius, label typography and semantic color mapping |
| Toolbar / popover shell | Container around a related action group | border, surface, outer radius, shadow and internal gap |

Rules:

- Peer controls in one toolbar MUST be pixel-identical for all shared properties. `AI` is a capability source, not a separate button shape: an AI action may add a sparkle icon or semantic divider, but cannot silently change height, radius, resting background, or hover behavior.
- Controls from different families SHOULD remain visually distinct. Do not turn every toolbar icon, review button and panel into a pill merely to make the page look uniform. Consistency means a stable hierarchy, not one radius everywhere.
- Within a toolbar shell, use the inner/outer radius relationship: a `--pk-radius-lg` shell normally contains `--pk-radius-md` controls; free-standing capsule actions use `--pk-radius-pill` intentionally.
- A semantic state may override color, border, or emphasis only: primary/accept, danger/reject, selected, disabled and success. It does not create a new geometry.
- A surface-specific selector may position or size the group, but must not restyle peer controls one by one. If the current primitives cannot represent the toolbar action, add a dedicated primitive such as `ToolbarAction`; do not misuse `Pill`, which remains a toggleable filter.
- Static mocks must publish a component-contract table and consume the production `--pk-*` tokens where possible. A mock-only value must name its production mapping and may not become a second token system.

**Review test.** For each toolbar, compare computed `height`, `border-radius`, `padding`, `background-color`, `color`, `border`, and `outline` for every peer control in rest, hover, focus-visible, active, disabled and success states. A screenshot that merely looks close is not enough.

### 6.2 Surface migrations are all-or-nothing

**Symptom.** A design-system unification PR (or wave of PRs) covers most surfaces but skips one or two for time reasons. The skipped surfaces drift further over the next quarter because every fix lands "in the style of the old system". Eventually the skipped surface is hopelessly behind, and re-migrating it is harder than the original would have been.

**Real case.** The 2026-05-30 Design System Unification (21 PRs) covered onboarding, settings, copilot, and the usage dashboard — but **not chat**. By 2026-06-02, the chat surface had ~60% design-fidelity vs the mocks, with every recent chat PR landing changes against the old token consumption (inline `style={{ ... }}` for radius, surface-local chip classes, raw `<button>` for icons). All of it was correct *given the old baseline*; none of it converged on the system.

**Rule.** When kicking off a design-system migration wave, **list every surface family up front** and require either:

1. **Inclusion** — surface ports in this wave; or
2. **Explicit deferral** — surface is excluded with a tracked follow-up issue + a do-not-touch boundary so subsequent PRs don't bake more drift into it before the follow-up ships.

A surface that is silently skipped, with normal PRs still landing against the unmigrated version, is the failure mode. There is no third option.

**Operational check before merging a unification PR:**

- [ ] Did we list every surface (Settings / Onboarding / Chat / Copilot / Dashboard / Knowledge Center / Maintenance / Skill picker / Command center / …)?
- [ ] Is every surface either migrated or carrying a `// MIGRATION-DEFERRED: <issue-link>` marker on its root component?
- [ ] Are deferred surfaces flagged in the design conventions doc, so the next developer touching them knows the rules they're outside of?

### 6.3 "Intentionally omitted" is a debt receipt — track it

**Symptom.** A component lands with comments like `// Tools cluster is intentionally omitted in PR-X — collapses into the run-chip popover, which PR-X+1 will flesh out`. Each individual PR is honest about its scope. But the cumulative effect across 10 such comments is that the production UI is missing 30% of the mock spec, and no one is tracking "all the things we said we'd add later".

**Real case (chat, 2026-06-02).** Concrete debt receipts found in chat code:

- `ComposerRetained.tsx:467` — footer-left tools cluster (+/attach/database/context) "intentionally omitted in PR-Chat-1"
- `RunChip` — 5 rows marked `data-disabled="true" title="Coming soon"` (Current note, Manual override, Tools count, Pinned sources)
- `HeaderRetained` — comment explicitly lists 4 omitted controls (model picker, mode toggle, system-prompt popover, resources popover)
- `MessageMorePopover` — design spec calls for ACTIONS group with 5 entries; production has 0

None of these were tracked in a follow-up issue or todo, and the next person reading the code has no way to know whether they were skipped on purpose or simply forgotten.

**Rule.** "Intentionally omitted" comments must always include:

1. **A tracking handle** — issue number, spec section, or todo file path. `// TODO(PR-Chat-2):` is acceptable only if PR-Chat-2 actually exists and lands within the same release; otherwise create an issue.
2. **The mock element being omitted**, by exact class name or section ID — so a future audit can grep for it.
3. **The blocker**, if any. "Out of scope" is fine; "needs backend X" is better.

```tsx
// ❌ undated, untracked, unrecoverable
// Tools cluster is intentionally omitted in PR-Chat-1 — collapses into
// the run-chip popover, which PR-Chat-2+ will flesh out.

// ✅ tracking handle + grep-able mock element
// MIGRATION-DEFERRED: footer-left tools cluster (mock .composer-tools-left:
// add / attach / vault-search / context-picker). Tracked in issue #NNN;
// blocked on tag-store refactor landing first.
```

When closing one of these out, also remove the comment — comments outliving their fix become folklore.

### 6.4 Mock data fixtures for rich UI states

**Symptom.** Designs show rich UI states (agent runs with tool counts + duration + cost; assistant messages with artifact cards; an inbox with starred items + read receipts). The code path exists to render them, but no real conversation in the developer's vault ever exercises the path. The UI rots silently — the next developer's audit can't even see what's supposed to be there.

**Real case.** The chat mock shows assistant messages with inline artifact cards (`architecture-sketch.png`, `vault-flow.drawio`, `implementation-plan.md`, `review-proposal.diff +126/-48`) and an Agent run header with `· 3 tools · 1.2k tokens · 8.4s`. None of these renders in practice because (a) no `ArtifactCard` component exists, and (b) `tokenUsage` and tool counts are only set during streaming, not persisted on the `ChatMessage`. A developer opening any real conversation sees plain markdown only and has no clue the spec called for more.

**Rule.** For any UI surface whose richness depends on data that doesn't naturally accumulate (agent artifacts, tool calls, cost receipts, dashboard high-volume states):

1. **Ship a fixture conversation** in `docs/fixtures/` (or wherever the project keeps them) that exercises every variant in the mock.
2. **Provide a "load fixture" affordance** in dev mode — a settings toggle or command that imports the fixture into the user's vault.
3. **Tie the fixture to the audit checklist**: every visual-fidelity audit must open the fixture conversation and confirm the rich states render. Plain conversations alone are insufficient.

If the data model lacks fields the mock needs (`durationMs`, `toolCount`, `artifactRefs`), that's a separate gap to close *before* the audit passes — not "the UI just doesn't show it yet".

### 6.5 When this section gets a new bullet

Every time an audit finds the same root cause across ≥3 surfaces or ≥3 components, add a §6.x for it. The first time it bites a surface, fix it in §1-§5. The third time, it's a drift class — promote the lesson here.

---

## 7. Consolidated checklist

When implementing or reviewing a new UI surface, work through this list (each item links to the section that explains it):

**Tokens (§1)**
- [ ] No bare `#rrggbb` in `style={{ ... }}` or `pktw-*-[#xxx]` arbitrary values (unless in §1.5 exception list)
- [ ] No `var(--text-normal)` / `var(--background-primary)` / `var(--interactive-accent)` etc. Obsidian-direct references
- [ ] No `var(--pk-X, fallback)` fallback chains
- [ ] New tokens declared in BOTH light and dark blocks of `peak-tokens.css`
- [ ] Tailwind utility used when one exists

**Primitive choice (§3)**
- [ ] A mock→primitive map exists in the PR description or step file header
- [ ] No `<Pill>` outside of toggleable filter contexts
- [ ] Any "I'll just use X because it's closest" thought triggered a check against the §3.2 decision tree
- [ ] Any mock class without a primitive triggered "add the primitive" (§3.5), not "use the nearest"
- [ ] Surface modifiers (e.g. `pkonb-provider-row`) registered in §2.4

**Layout discipline (§3 + §4)**
- [ ] Outer wrapper (`modalEl`, root `<div>`) carries the `peak-design-root` class
- [ ] No raw `<button>` / `<input>` / `<select>` — use `<Button>` / `<IconButton>` / `<Pill>` (intent-correct)
- [ ] Button-based primitives have `!important` on bg/border/padding/border-radius (§4.3) if mounted in a Modal
- [ ] If using Obsidian `Modal`, both `modalEl` AND `contentEl` are tagged (§4.4)
- [ ] No inline `style={{ borderRadius / boxShadow / padding / border / background }}` on a primitive — add a surface modifier instead
- [ ] Selected / hover / disabled states use `data-*` attrs + CSS, not conditional inline style

**JSX-mock fidelity (§5)**
- [ ] Every named container / section in the mock HTML has a corresponding JSX element
- [ ] No `{x ?? ''}` / `<span>{x || ''}</span>` inside flex / grid containers — use `{x && <span>{x}</span>}`
- [ ] Optional decorations sit inline with required content (title row), not in a separate sometimes-empty slot
- [ ] List-item cards have a `min-height` set if their internal content can vary
- [ ] Tested with all-fields-empty *and* all-fields-full to confirm uniform row height
- [ ] Visual-fidelity audit includes a JSX structural diff section, not just CSS tokens

**Surface drift prevention (§6)**
- [ ] No new `pk(surface)-*-chip` / `*-pill` / `*-tag` class — use `<Chip>` or `<Pill>` (§6.1)
- [ ] Every action surface has a role map: toolbar action / toolbar icon / rail / review action / status chip / shell (§6.1)
- [ ] Peer actions in the same toolbar share computed height, radius, padding, resting surface, hover, focus and disabled behavior; AI actions do not introduce a second shape (§6.1)
- [ ] Different component families keep an intentional radius hierarchy; consistency was not implemented as “make everything a pill” (§6.1)
- [ ] If this PR is part of a design-system migration wave, every surface family is either in scope or carries a `// MIGRATION-DEFERRED` marker with tracking handle (§6.2)
- [ ] Every `// intentionally omitted` comment has a tracking handle + mock-element reference + blocker (§6.3)
- [ ] If the surface relies on rich data states (agent artifacts, tool calls, cost receipts), a fixture conversation exists and is exercised by the audit (§6.4)

**Test inside Obsidian, not just the mock browser** — Obsidian leaks (§4) only show in Obsidian. A mock-HTML preview will lie about the final appearance.
