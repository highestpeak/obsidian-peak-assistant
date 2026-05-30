# Component Primitives

**TL;DR** — 10 shared `.pk-*` CSS classes live in `src/styles/peak-components.css`, with matching React wrappers in `src/ui/components/primitives/` (PR-0 Task 3). They are the visual atoms used across settings, onboarding, chat, and usage-dashboard surfaces. Reach for the React primitives by default (`import { Row, Chip, Modal, ... } from '@/ui/components/primitives'`); drop the class directly on a `div`/`button` only when JSX scaffolding would be overkill.

## Why

The 4-stream design system unification (settings / onboarding / chat / dashboard) needs a single visual vocabulary so the same "row", "chip", "modal head" rendering exists in one place and changes propagate. Previously each surface had local variants that drifted.

Spec: `docs/superpowers/plans/2026-05-29-onboarding-settings-unification.md` (PR-0).
Tokens: `src/styles/peak-tokens.css` (see [design-tokens.md](./design-tokens.md)).

## Scope discipline

Every selector in `peak-components.css` is wrapped with `:where(.pktw-root, .peak-design-root)` low-specificity prefix. That means:

- The class works inside any surface mounted under `.pktw-root` (chat / settings / project views) or `.peak-design-root` (legacy modals).
- It does NOT escape to leak into Obsidian's own UI chrome.
- Specificity stays at 0,1,0 so per-component overrides can win without `!important`.

See [obsidian-css-defense.md](./obsidian-css-defense.md) for the broader rule.

## Mock → production token rename

The mocks under `docs/gstack/*-redesign-2026-05-29/` invented token names that the production token system doesn't ship. When porting more mock CSS into the plugin, translate:

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

## Primitives

### `.pk-row` (+ subparts + variants)

**Purpose** — Single settings/onboarding row: `[32px icon] [body: title + desc + meta] [right: chip + value + control]`.

**Structure**

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

**Variants**

- `.pk-row--compact` — denser padding + 28px icon. For Advanced / chunking tables.
- `.pk-row--disclosure` — clickable; hover surfaces sunken background; `align-items: start` so the chevron stays beside the title on multi-line descriptions.
- `.pk-row__value--sans` — override default mono font.

**When to use the class directly** — single ad-hoc row outside any list. **When to use the React wrapper** (`<Row>` + `Row.Icon` / `Row.Body` / `Row.Title` / `Row.Desc` / `Row.Meta` / `Row.Right` / `Row.Value`) — anywhere you assemble multiple rows or want sub-slots typed.

### `.pk-chip` (+ 6 color variants)

**Purpose** — Pill-shaped status/label chip; size matched to inline text.

**Structure**

```html
<span class="pk-chip pk-chip--success">
  <CheckIcon class="icon" /> Ready
</span>
```

**Variants** — `--success`, `--warning`, `--danger`, `--neutral`, `--accent`, `--info`, `--provider` (use together with `.pk-brand-av[data-provider="..."]` for brand-tinted variants).

`--danger` keeps the user-facing name "danger" but reads from production `--pk-error*` tokens.

### `.pk-pill`

**Purpose** — Toggleable filter pill (document-type pickers, tag filters).

**Structure**

```html
<button class="pk-pill" data-selected="false">PDF</button>
<button class="pk-pill" data-selected="true">Markdown</button>
```

Selected state via `data-selected="true"`.

### `.pk-icon-btn`

**Purpose** — Square 28px transparent button for header close/dismiss affordances or compact toolbar icons. Hover dims to `surface-sunken` + primary text color.

**Structure**

```html
<button class="pk-icon-btn" aria-label="Close">
  <XIcon class="icon" />
</button>
```

### `.pk-segmented` + `.pk-segmented__opt`

**Purpose** — Inline segmented control (e.g. Index mode picker, list/grid view toggles).

**Structure**

```html
<div class="pk-segmented" role="tablist">
  <button class="pk-segmented__opt" data-selected="true">List</button>
  <button class="pk-segmented__opt" data-selected="false">Grid</button>
</div>
```

### `.pk-modal-*` (overlay + shell + head/body/foot/close)

**Purpose** — Modal scaffolding: scrim overlay + sized shell + standard head/body/footer slots.

**Structure**

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

**Variants** — `.pk-modal-shell--narrow` (460px), default 560px, `.pk-modal-shell--wide` (720px).

**Note on overlay scrim** — `rgba(0, 0, 0, 0.42)` is hardcoded intentionally; modal scrims are dialog-system convention, not part of the design token surface.

**Title font** — uses `--pk-text-lg` (14px). Mock specified 15px which doesn't exist as a token; if it ever feels too small in real surfaces, file an issue rather than reintroducing a 15px literal.

**When React wrapper exists (`<Modal>` + `ModalTrigger` / `ModalContent` / `ModalHeader` / `ModalTitle` / `ModalSubtitle` / `ModalClose` / `ModalBody` / `ModalFooter`)** — use it for focus trap, escape-to-close, and portal mounting (Radix Dialog under the hood). `ModalClose` renders an `<IconButton>` internally — the previous `.pk-modal-shell__close` CSS rule was removed as a duplicate of `.pk-icon-btn`. The CSS classes are for static usage or when you need a custom shell shape.

### `.pk-popover` + `.pk-pop-item`

**Purpose** — Floating menu surface (model picker, action menus, quick command lists). Positioning is the caller's responsibility — typically wired via Radix popover or Floating UI.

**Structure**

```html
<div class="pk-popover">
  <button class="pk-pop-item"><EditIcon class="icon" /> Rename</button>
  <button class="pk-pop-item"><CopyIcon class="icon" /> Duplicate</button>
</div>
```

### `.pk-form-*` (grid + row + label + control + input + slider + number)

**Purpose** — Form layout primitives for modal bodies and disclosure panels.

**Structure**

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

**Font default** — inputs use mono (`--pk-font-mono`) since most production form fields hold technical content (keys, IDs, paths). Add `.pk-form-input--sans` for free-text fields. `.pk-form-select` already defaults to sans for readability.

### `.pk-disclosure-body`

**Purpose** — Content frame that sits flush below a `.pk-row--disclosure`, sharing borders to form a continuous "open" surface.

**Structure**

```html
<div class="pk-row pk-row--disclosure" aria-expanded="true">…</div>
<div class="pk-disclosure-body">
  <div class="pk-row">Nested row, flipped to surface bg for contrast</div>
  <div class="pk-row">Another nested row</div>
</div>
```

Nested `.pk-row` instances are automatically flipped to `--pk-surface` background for contrast against the sunken disclosure frame.

### `.pk-brand-av` (+ `--sm`, + `[data-provider]`)

**Purpose** — Circular provider avatar; either a brand SVG/icon child or letter fallback. Color binds via data-attribute to the `--pk-prov-*` tokens.

**Structure**

```html
<span class="pk-brand-av" data-provider="anthropic">
  <AnthropicMark />
</span>

<span class="pk-brand-av pk-brand-av--sm" data-provider="openai">O</span>
```

**Sizes** — default 28px, `--sm` 20px.

**Supported providers** — `openai`, `anthropic`, `google`, `openrouter`, `perplexity`, `ollama`. To add another, define `--pk-prov-<name>` + `--pk-prov-<name>-soft` in `peak-tokens.css` first, then add the `[data-provider="<name>"]` selector here.

**Without `data-provider`** — falls back to neutral sunken bg + secondary text.

## When to use the class vs the React wrapper

PR-1 ships React primitives (`<PkRow />`, `<PkChip />`, `<PkModal />`, `<PkBrandAv />`, etc.) that thin-wrap these classes with typed props and forwarded refs. Rule of thumb:

- **Use the React wrapper** — anytime you're inside a `.tsx` file building structured UI; you get prop typing, slot composition, accessibility wiring (focus trap, aria-* attrs), and Storybook coverage.
- **Use the CSS class directly** — quick prototypes in `.html` mocks, one-off snippets in unrelated components, or test fixtures. Keep call-sites grep-able by always using the `pk-*` prefix.

## Build pipeline

`peak-components.css` is imported from `src/styles/tailwind.css` immediately after `peak-tokens.css` and `peak-variables.css` (depends on the tokens, must precede Tailwind utilities so per-component overrides in Tailwind classes can still win specificity). Tailwind compiles it into `styles.tailwind.css`, which `scripts/concat-css.mjs` concatenates into the final plugin `styles.css`.

If you add new primitives, append them to this doc and to `peak-components.css` (same section ordering). Don't introduce parallel `.peak-*` or `.kb-*` namespaces — keep `pk-*` as the one prefix.
