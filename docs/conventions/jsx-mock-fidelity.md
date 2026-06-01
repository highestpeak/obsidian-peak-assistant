# JSX Mock Fidelity

## TL;DR

CSS-vs-CSS audits don't catch JSX structure bugs. When implementing a mock, the audit must include a **JSX-vs-mock structural diff**: every section, slot, and conditional in the mock HTML maps to a section/slot/conditional in the JSX. The two recurring traps below have shipped multiple regressions even when every primitive and token was "correct":

1. **`{x ?? ''}` and `<span>{maybe || ''}</span>` are NOT no-ops in flex layouts.** An empty span still occupies a line-height worth of vertical space. Use `{x && <span>{x}</span>}` so the slot collapses to zero when empty.
2. **Optional decorations (Recommended chip, status pill, "new" badge) belong INLINE with the primary text**, not in a separate "subtitle" slot — unless that slot is always non-empty across all rows. Otherwise rows become ragged: some have one line, some have two, the column looks like a broken accordion.

## Why

Image #30 (commit `7257710`): bootstrap model list rendered with `align-items: flex-start` + `<span className="hint">{option.hint ?? ''}</span>`. Half the rows had no hint, but the empty span still claimed line-height of vertical space. The body became taller than the icon, the icon parked at the top, the blank bottom strip showed under each icon as a "phantom row fragment". User read it as "大量错位".

Image #22 (commit `afc1e63`): run-chip popover. CSS perfectly matched mock. But the JSX rendered only 1 of the 5 sections specified in the HTML mock — the other 4 (Role / Model / Context / Tools) were entirely missing. The visual-fidelity audit was CSS-only, so it didn't notice.

Image #23 (commit `1110e67`): ConversationIndex Messages tab. CSS for the new layout was in place, but the JSX still rendered the old nested accordion structure. Same audit blind spot.

Pattern: **the audit was comparing styles, not structure**. A new component that renders a different DOM tree than the mock will pass every CSS-token / spacing / shadow check and still look completely wrong.

## Do

### 1. Conditional render, not falsy-fallback content

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

### 2. Inline optional decorations with the title

```tsx
// RIGHT — title and optional badge share one row; row height is constant
<span className="card__title-row">
    <span className="card__title">{name}</span>
    {recommended && <Chip variant="accent">Recommended</Chip>}
</span>

// .card__title-row { display: inline-flex; align-items: center; gap: var(--pk-space-2); }
```

The title row is always non-empty (title is required), so adding an optional chip to it doesn't change row count or height.

### 3. Floor variable-content cards with `min-height`

When a list has cards whose internal content can vary (some have hint text, some don't), set a `min-height` so the worst-case empty card still aligns with its filled neighbors:

```css
.pkonb-radio-card {
  min-height: 56px;
}
```

This is belt-and-suspenders defense against future JSX changes that re-introduce variable height.

### 4. Audit must include JSX structural diff

When auditing a surface against its mock:

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

## Don't

### ❌ `{x ?? ''}` or `<span>{maybe || ''}</span>` inside flex column

```tsx
// WRONG — empty span occupies line-height, making body taller than icon,
// breaking align-items: center / flex-start uniformity
<span className="body">
    <span className="title">{name}</span>
    <span className="hint">{hint ?? ''}</span>
</span>
```

### ❌ Stack optional decoration under title in a sometimes-empty slot

```tsx
// WRONG — when recommended is false, hint slot is empty; some rows are
// 1 line, others are 2 lines. The list looks ragged.
<span className="body">
    <span className="title">{name}</span>
    <span className="hint">
        {recommended && <Chip>Recommended</Chip>}
        {hint}
    </span>
</span>
```

### ❌ Use Chip / Pill / IconButton's `display` to "save" a missing slot

```tsx
// WRONG — using opacity:0 / visibility:hidden to fake a constant-height
// slot. The element still claims space (good) but also screen-reader noise
// (bad), and the next refactor will forget to keep it.
<Chip style={{ visibility: recommended ? 'visible' : 'hidden' }}>Recommended</Chip>
```

Use option 2 above (inline with title) or option 3 (`min-height` floor) instead.

### ❌ Audit CSS-only when porting a new mock

A "✅ all tokens correct" verdict on a CSS audit means the component will paint correctly *for the elements that exist*. It says nothing about whether the elements exist at all. Always pair with a structural pass.

## Checklist

When implementing or auditing a new mock-based surface:

- [ ] Every named container / section in the mock HTML has a corresponding JSX element
- [ ] No `{x ?? ''}` / `<span>{x || ''}</span>` inside flex / grid containers — use `{x && <span>{x}</span>}`
- [ ] Optional decorations sit inline with required content (title row), not in a separate sometimes-empty slot
- [ ] List-item cards have a `min-height` set if their internal content can vary
- [ ] Tested with all-fields-empty *and* all-fields-full to confirm uniform row height
- [ ] Visual-fidelity audit includes a JSX structural diff section, not just CSS tokens

## Where this rule has bitten us

- Bootstrap model list (`pkonb-radio-card`) — image #30 / commit `7257710` / 2026-06-01
- Run-chip popover sections — image #22 / commit `afc1e63` / 2026-06-01
- ConversationIndex Messages tab — image #23 / commit `1110e67` / 2026-06-01

Add new instances here when this rule rescues a regression.
