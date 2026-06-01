# Primitive Usage

## TL;DR

Pick the primitive by **intent**, not by **shape**. `Pill` is *not* a button — it's a toggleable filter chip whose `selected` color = filter-active, not CTA-primary. `Row` is *not* a generic row — it's the Settings card spec (radius-lg + shadow). Before reaching for "the one that looks closest", check the decision tree below and the anti-patterns at the bottom. If nothing fits, the gap is in the primitive library — fix it there, don't paper over with inline styles.

## Why

Five visual regressions in a row (2026-06-01) all had the same DNA: implementer grabbed a primitive whose CSS shape was close to the mock, but whose **semantic intent** was for a different role. The CSS itself was correct in isolation — it was the *call site* that was wrong. CSS-vs-CSS audits don't catch this; only intent-based audits do.

Concrete examples:

- `<Pill>` used for onboarding footer Back / Got it CTAs. Pill's `selected` background is `accent-soft` (filter active tint), not the solid accent fill a primary CTA needs. The shape (999px) was also wrong — CTAs in the mock use `radius-md`.
- `<Row>` used for onboarding's saved-provider list. Row is sized for Settings cards (radius-lg + `pk-shadow-card` + 14px padding). The onboarding mock spec is flatter — radius-md, no shadow, 10×12 padding. Reusing Row made every onboarding row look chunky.

Root cause behind both: the primitive library was missing a real `Button` primitive entirely, and Row was over-unified across surfaces. Implementers had no correct option, so they grabbed the closest-shaped one.

See also [component-primitives.md](./component-primitives.md) for the full primitive catalog and [obsidian-css-defense.md](./obsidian-css-defense.md) for the parallel rule about CSS scoping.

## Do

### 1. Decision tree — pick by intent

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

### 2. Before implementing a new step / surface, produce a mock→primitive map

For every mock CSS class the surface uses, list which primitive it maps to. Anything that resolves to "❌ no primitive matches" is a **stop-work signal**: fix the primitive library first, *then* write the step.

Example (good):

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

Example (bad — gaps unflagged):

```
mock class            primitive
.btn                  <Pill>                                # ❌ wrong intent
.provider-row         <Row>                                 # ❌ wrong spec
```

If the second list ships, you get image #25 + image #26.

### 3. When a mock spec differs from an existing primitive, add a surface modifier

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
// step component
<Row className="pkonb-provider-row" data-selected={selected ? 'true' : undefined}>
  …
</Row>
```

The modifier name follows the surface namespace (`pkonb-` / `pkset-` / `pkchat-` / `pkdash-`). This keeps surface-specific spec colocated with the surface yet still reuses the base primitive's structure.

### 4. When no primitive fits at all, add one to the library

If the mock needs something the library doesn't have (e.g. a CTA button before `pk-btn` existed):

1. Add the CSS to `peak-components.css` with comma-scoping (see [component-primitives.md](./component-primitives.md))
2. Add the React wrapper to `src/ui/components/primitives/`
3. Export from `src/ui/components/primitives/index.ts`
4. Document it in `component-primitives.md` (catalog + when-to-use-vs-class)
5. *Then* use it in the surface

Don't ship the surface with the gap papered over by inline styles or a wrong primitive.

## Don't

### ❌ Use `<Pill>` for any button that's not a toggleable filter

```tsx
// WRONG — Pill is a filter chip
<Pill selected onClick={handleContinue}>
  <ChevronRight />
  <span>Got it — let's configure</span>
</Pill>

// RIGHT — Button is the CTA primitive
<Button variant="primary" onClick={handleContinue}>
  <span>Got it — let's configure</span>
  <ChevronRight />
</Button>
```

### ❌ Inline-style override a primitive's geometry

```tsx
// WRONG — fights the primitive, drifts on every refactor
<Row style={{ borderRadius: '8px', boxShadow: 'none', padding: '10px 12px' }}>

// RIGHT — surface modifier that lives in CSS
<Row className="pkonb-provider-row">
```

### ❌ Conditionally inline-style for selected state

```tsx
// WRONG — state in JS, can't be styled via :hover etc.
<Row style={selected ? { borderColor: 'var(--pk-accent)', background: '…' } : {}}>

// RIGHT — data-attribute, all states in CSS
<Row data-selected={selected ? 'true' : undefined}>
```

### ❌ Reach for the closest-shaped primitive when none fits

If the mock has a `.btn` and you have no `<Button>`, the answer is "add `<Button>`", not "use `<Pill>` because it's also round". See "Do #4".

### ❌ Skip the mock→primitive map step

Worktree handoffs that hand the implementer a mock file but no primitive mapping will reliably ship image #25-class regressions. The map is a 10-minute artifact that prevents hours of visual-fidelity firefighting.

## Checklist

When implementing or reviewing a new step / surface:

- [ ] A mock→primitive map exists in the PR description or step file header
- [ ] No `<Pill>` outside of toggleable filter contexts (verify each `<Pill>` could equally well be replaced with toggling a `data-selected` attr — if not, it's the wrong primitive)
- [ ] No bare `<button>` inside `peak-design-root` (reset will strip it; use `<Button>` / `<IconButton>` / `<Pill>` instead)
- [ ] No inline `style={{ borderRadius / boxShadow / padding / border / background }}` on a primitive — if you need to change those, add a surface modifier in `peak-components.css`
- [ ] Selected / hover / disabled states use `data-*` attrs + CSS, not conditional inline style
- [ ] Any "I'll just use X because it's closest" thought triggered a check against the decision tree, not a shortcut

## Known surface modifiers (registered)

| Modifier | Base primitive | What it changes |
|---|---|---|
| `pkonb-provider-row` | `pk-row` | Flat: radius-md, no shadow, 10×12 padding |

Add yours here when you introduce a new surface modifier.
