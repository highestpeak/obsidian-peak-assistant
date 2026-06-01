# Obsidian CSS Defense

## TL;DR

Obsidian injects global styles onto bare HTML tags (`<button>`, `<input>`,
`<a>`, `<h1>–<h6>`, `<p>`, `<select>`, `<textarea>`). Any plugin UI that uses
those tags **without a defensive reset** will look inconsistent with the
design (extra borders, wrong padding, theme-bound colors).

**Rule**: every scoped UI surface (modal / panel / overlay) MUST add the
`peak-design-root` class on its outermost element. That class triggers the
reset defined in `src/styles/obsidian-reset.css`.

## Why this keeps biting us

### The mechanism

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

These are **unscoped bare-tag selectors** with no class qualifier. They apply
to every matching element in the DOM, including inside plugin modals.

### Why our scoped CSS often loses

We write `.peak-vault-modal .vr-tab { border: 1px solid transparent }` and
attach it to `<button class="vr-tab">`. Specificity is `(0,2,0)` — we
should win. But three things conspire against us:

1. **Obsidian themes use `!important` liberally** in places we didn't expect
2. **We typically only override a few properties** (border, background) and
   leave `border-radius`, `padding`, `box-shadow` to be controlled by
   Obsidian — those leak through and break the look
3. **Hover / focus / disabled states** aren't explicitly set, so they fall
   back to Obsidian's

### The 2026-06-01 regression #3: `.modal-content button` beats primitive comma-scoping

Obsidian's modal CSS ships a rule like
`.modal-content button { background: var(--interactive-normal); border: 1px solid …; padding: …; border-radius: … }`.
Specificity: `(0,2,1)`.

Our primitive scoping is `.pktw-root .pk-X, .peak-design-root .pk-X` —
`(0,2,0)` per branch. **Loses to Obsidian** for every button-based primitive
mounted inside an Obsidian Modal (`pk-btn`, `pk-icon-btn`, `pk-pill`,
`pkonb-radio-card`, etc.). Symptom: trash buttons render with a gray rounded
box (Obsidian's `--interactive-normal` bg); radio cards get wrong padding
making rows visually overlap their neighbors.

`obsidian-reset.css`'s `.peak-design-root button { background: none; … }` is
specificity `(0,1,1)` — also loses.

**Fix pattern**: button-based primitives must use `!important` on the four
properties Obsidian aggressively styles — `background`, `border` (and
`border-color`), `padding`, `border-radius` — in both the base rule and any
state variants (`:hover`, `[data-selected="true"]`, etc.). Example from
`pk-icon-btn`:

```css
.pktw-root .pk-icon-btn,
.peak-design-root .pk-icon-btn {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  border-radius: var(--pk-radius-md) !important;
  width: 28px;
  height: 28px;
  …
}
```

`!important` is required because we're fighting `(0,2,1)` with `(0,2,0)` —
bumping a class selector or rewriting as `.peak-design-root button.pk-icon-btn`
(tie at `(0,2,1)`, source-order dependent) is more fragile across Obsidian
theme overrides.

**Surfaces affected**: any primitive rendered as `<button>` inside an
Obsidian `Modal` subclass. View-mode UIs (chat, dashboard) mount in a
`WorkspaceLeaf`, not `.modal-content`, so they don't hit this — but Settings
and onboarding do. Apply the `!important` pattern when adding a new
button-based primitive.

### The 2026-06-01 regression #2: modalEl is outside `peak-design-root` scope

Obsidian's `Modal` class renders TWO elements: `modalEl` (outer chrome —
border, shadow, rounded corners) and `contentEl` (inner content). Adding
`peak-design-root` to `contentEl` only protects the inside. The outer
`modalEl` still inherits **the theme's accent border + box-shadow**, which
on some themes is a thick purple ring that visibly overrides the design
system's intended subtle gray border.

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

CSS overrides must use `!important` because they're fighting Obsidian's
theme stylesheet (which itself uses high specificity):
```css
.pktw-root .pkonb-modal-shell,
.peak-design-root .pkonb-modal-shell {
    border: 1px solid var(--pk-border) !important;
    box-shadow: var(--pk-shadow-modal) !important;
    border-radius: var(--pk-radius-lg) !important;
    background: var(--pk-surface) !important;
}
```

**Don't forget**: each modal class needs its own outer tag. Tag both
`modalEl` AND `contentEl` if you want the full design language.

### The 2026-05-31 regression: `:where()` vs reset

The Design System Unification (PR-0) scoped every `.pk-*` primitive with
`:where(.pktw-root, .peak-design-root) .pk-foo` to "keep specificity low so
per-component overrides could win without `!important`". That logic worked
for component-level overrides — but it ignored that the local reset itself
uses `.peak-design-root button { padding: 0; border: 0; border-radius: 0; ... }`
(specificity `(0,1,1)`). `:where()` contributes 0 specificity, so the scoped
selectors were `(0,1,0)` — LOWER than the reset. Every `<button>`/`<input>`
based primitive (`.pk-pill`, `.pk-icon-btn`, `.pk-segmented__opt`,
`.pkonb-radio-card`, etc.) had its border/padding/background blanked.

**Fix**: use plain comma-scoping `.pktw-root .pk-foo, .peak-design-root .pk-foo`
— `(0,2,0)` per branch, beats the reset. See commit `7ad6d20`. **Do not
re-introduce `:where()` for primitives that share a tag with reset rules.**

### Why this is a recurring trap

- Most components look fine in isolation (storybook / mock HTML opened in
  browser) because there's no Obsidian to inject
- Each new component author rediscovers the issue and fixes case-by-case
  (e.g. swapping `<button>` for `<div role="button">`)
- There's no project-level reset that new code can opt into
- `CLAUDE.md` had "no semantic HTML" advice but didn't explain WHY in detail

## Do

### 1. Add `peak-design-root` to your modal / panel root

```tsx
async onOpen(): Promise<void> {
    this.modalEl.addClass('peak-my-feature-modal');
    this.modalEl.addClass('peak-design-root'); // ← neutralises Obsidian
    ...
}
```

For React-only mounts (non-modal):

```tsx
<div className="peak-my-feature-panel peak-design-root">
    ...
</div>
```

### 2. Write scoped CSS that builds UP from the reset baseline

After the reset, `<button>` has no background / border / padding / outline.
Your own styles add what you need:

```css
.peak-my-feature-modal .vr-tab {
    background: var(--vr-accent-tint);
    color: var(--vr-accent);
    border: 1px solid var(--vr-accent-soft);
    padding: 7px 12px;
    border-radius: 10px;
    /* explicit at every property — no relying on inheritance */
}
.peak-my-feature-modal .vr-tab:hover {
    background: var(--vr-accent-tint-hover);
    /* states must be explicit too */
}
```

### 3. Use Tailwind utility classes when possible

Tailwind in this project has `important: true`. All `pktw-*` classes emit
`!important` and bypass Obsidian's interference automatically. Prefer
shadcn's `Button` component or `pktw-*` utilities for simple cases.

## Don't

### ❌ Skip the reset class and hope CSS specificity wins

```tsx
// Modal without peak-design-root
this.modalEl.addClass('peak-my-modal');

// Your CSS
.peak-my-modal button { background: transparent; }
// → border / padding / border-radius still come from Obsidian
```

### ❌ Use raw `<button>` outside a `peak-design-root` scope

```tsx
// In a plain React component without scope reset
<button className="my-btn">Click</button>
// → will pick up Obsidian's button styling
```

If you can't add `peak-design-root` to a wrapper, either:
- Use `<div role="button" tabIndex={0} onKeyDown={...}>` (accessible alt)
- Or use the shadcn `<Button>` component (Tailwind, `!important` baked in)

### ❌ Override only `border` and trust the rest

```css
.peak-my-modal button { border: 0; } /* not enough! */
```

Obsidian still sets `background`, `padding`, `border-radius`, `box-shadow`,
`outline`. Use the reset class for full neutralisation.

## Checklist

When writing or reviewing a new scoped UI surface:

- [ ] Outer wrapper (`modalEl`, root `<div>`) carries the `peak-design-root` class
- [ ] No raw `<button>`/`<input>`/`<select>` outside a `peak-design-root` scope
- [ ] When testing visual fidelity, **test inside Obsidian** (not the mock
      HTML in a plain browser) — the visual diff only appears in Obsidian
- [ ] If a state (hover/focus/disabled) looks wrong, it's almost certainly
      Obsidian leaking — make sure your CSS sets that state explicitly

## Implementation

The reset itself lives at `src/styles/obsidian-reset.css`. It's imported by
`src/styles/tailwind.css` so it lands in the final bundled `styles.css`.
The reset is scoped by `.peak-design-root` so it's a no-op outside your
opted-in surfaces.

## Properties the reset must null

Each property Obsidian touches on bare tags has to be explicitly defended.
The list below grew incident-by-incident — **add to it every time we find
a new leak** instead of letting future code rediscover the same trap.

| Property | Why Obsidian sets it | Symptom when leaked |
|---|---|---|
| `background` / `border` / `padding` / `border-radius` / `box-shadow` / `outline` | Default `button` chrome | Card-style buttons get pill shape, theme colours, extra ring |
| `height: var(--input-height)` (32px) | Obsidian wants every modal button to be touch-target-sized | **Our card buttons get locked to 32px even when content needs 60+px** — flex layout breaks, hover bg fills only a 32px strip, content overflows the visible area. **Required:** `height: auto !important; min-height: 0 !important; max-height: none !important` |
| `justify-content: center` | Same reason as above | Custom flex content gets centered instead of `flex-start` |
| `transform: translateY(-1px)` on `:hover` | Theme "press" animation | Hovered row visibly shifts up 1–2px, looks taller than siblings |
| `transform: scale(1.05)` on `:focus` / `:active` | Theme focus emphasis | Clicked row visually grows |
| `box-shadow: 0 0 0 Npx ...` on `:hover`/`:focus` | Theme glow/halo | Coloured halo around hovered/focused buttons that extends beyond their box |
| `outline: 2px solid ...` on `:focus-visible` | Browser/Obsidian focus indicator | Visible ring after click — looks like the row got bigger |
| `padding`/`margin` on `:hover` | Some themes bump padding for "active" state | Row geometry changes only on hover |
| `transition: ... padding ...` | Theme animates state changes | Animated size pop on hover |
| `::before` / `::after` with absolute positioning | Theme ripple / hover glow effects | "Halo" around button that can't be killed from the button itself |

**Defensive default in the reset for `:hover`, `:focus`, `:active`,
`:focus-visible`**: every property above is set to `none !important`
(or the safe-default equivalent), so a new component can rely on its
own Tailwind / inline styles being the only thing that takes effect.

## Diagnosing a suspected leak

When a component looks wrong in Obsidian but fine in the static mock:

1. Open DevTools, select the offending element, look at **Computed** styles.
2. Search for properties that aren't from your CSS (no `--pk-*` source).
   Common smoking guns: `height: var(--input-height)`, `transform: translateY`,
   `box-shadow: ... var(--background-modifier-...)`, `outline: ... var(--focus-ring-color)`.
3. If found → it's an Obsidian leak. Either add the property to the reset
   above with `!important`, or add an explicit Tailwind utility that
   overrides it on your component.
4. **Always reproduce the same markup in `/tmp/*.html` with the built
   `styles.css` loaded** — if it renders correctly there, the bug is
   100% an Obsidian leak (not your component code).

## Where this rule is enforced

- Vault Auto Review modal (`peak-vault-auto-run-modal`)
- Copilot Picker modal (`peak-copilot-picker-modal`)

Add your component here when you adopt the convention.
