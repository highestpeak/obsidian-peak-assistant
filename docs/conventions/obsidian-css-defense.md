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

## Where this rule is enforced

- Vault Auto Review modal (`peak-vault-auto-run-modal`)

Add your component here when you adopt the convention.
