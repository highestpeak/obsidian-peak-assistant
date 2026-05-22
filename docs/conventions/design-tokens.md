# Design Tokens

**TL;DR** — All colors, spacing, radius, typography, shadow values in the plugin must come from `--pk-*` tokens defined in `src/styles/peak-tokens.css`. Never inline hex literals, never chain to Obsidian theme variables (`var(--background-primary)` etc.), never invent new tokens outside the source-of-truth file.

## Why

The plugin previously had **5 parallel token systems** (`--pk-*`, `--vr-*`, mock `--accent` no-prefix, shadcn HSL, Obsidian chain-throughs) that drifted out of sync — the same purple button rendered as 3 different shades across surfaces. The 2026-05-22 migration consolidated to **one source of truth** so:

- Plugin visual is fully autonomous (third-party Obsidian themes can't pollute it)
- Light/dark switching works via a single `.theme-dark` cascade
- Designers and engineers reference the same value names
- Mocks and shipped UI render identically

Spec: `docs/superpowers/specs/2026-05-22-design-system-migration.md`. Visual contract: `docs/mockups/_design-tokens-preview.html`.

## Do

**Use the token via the Tailwind utility when one exists** (most common):

```tsx
<button className="pktw-bg-pk-accent pktw-text-pk-accent-fg hover:pktw-bg-pk-accent-hover">
  Save
</button>

<div className="pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-text-pk-text-primary">
  Card content
</div>

<span className="pktw-text-pk-text-secondary pktw-text-pk-sm">
  Subtle metadata
</span>
```

**Use `var(--pk-*)` directly when Tailwind utility is awkward** (inline styles, dynamic computed values, CSS-in-JS):

```tsx
<svg stroke="var(--pk-border)" />

<div style={{
  background: 'var(--pk-accent-tint)',
  color: 'var(--pk-accent-text)',
}} />

<Recharts.Line stroke="var(--pk-info)" />
```

**Add a new token by editing `src/styles/peak-tokens.css`**:

```css
/* In the light block */
.pktw-root, .peak-design-root, .theme-light .pktw-root, ... {
  --pk-my-new-token: #abc123;
}

/* AND in the dark block */
.theme-dark .pktw-root, ... {
  --pk-my-new-token: #def456;
}
```

Then expose it in `tailwind.config.js` if it'll be used as a utility:

```js
colors: {
  'pk-my-new-token': 'var(--pk-my-new-token)',
}
```

Both light + dark values are required — even if dark just copies light.

## Don't

**Don't inline hex**:

```tsx
// ❌ breaks in dark mode, won't follow token updates
<div style={{ background: '#7c3aed' }} />
<span className="pktw-text-[#2e3338]" />

// ✅
<div className="pktw-bg-pk-accent" />
<span className="pktw-text-pk-text-primary" />
```

**Don't reference Obsidian theme variables directly**:

```tsx
// ❌ breaks autonomy — 3rd-party themes will hijack
<div style={{ color: 'var(--text-normal)' }} />
<span className="pktw-bg-[var(--background-primary)]" />

// ✅
<div style={{ color: 'var(--pk-text-primary)' }} />
<span className="pktw-bg-pk-bg" />
```

**Don't use fallback chains**:

```css
/* ❌ pk-tokens.css always defines the var; fallback is dead code */
color: var(--pk-text-primary, var(--text-normal, #2e3338));

/* ✅ */
color: var(--pk-text-primary);
```

**Don't invent component-local tokens**:

```css
/* ❌ this is how we ended up with --vr-*, --accent (no prefix), etc. */
.my-modal {
  --my-modal-accent: #abc;
  --my-modal-bg: #def;
}

/* ✅ add to peak-tokens.css if generally useful; otherwise use existing */
.my-modal {
  --pk-accent: ...; /* if you must override, document why */
}
```

## Legitimate exceptions (keep hex)

Some hex literals are legitimate and should stay:

| Category | Example file(s) | Why |
|---|---|---|
| Provider brand colors | `ProviderIcon.tsx`, `provider-brand-icons.tsx` | Anthropic / OpenAI / Google / Perplexity / OpenRouter trademarks |
| Knowledge graph edge semantics | `LensEdgeComponent.tsx` (`#5b8fd4` builds_on, `#d4a84a` applies, `#e06080` contrasts) | Specific edge-type encoding |
| Knowledge graph node clusters | `LensNodeComponent.tsx` | Cluster palette is intentionally varied |
| Recharts data series palette | `usage-dashboard/*` (Catppuccin: `#89b4fa #a6e3a1 #f9e2af #f38ba8 #cba6f7 #94e2d5 #fab387 #74c7ec`) | Rotating chart series colors |
| Mermaid status colors | `streamdown.css` `g.thinking` / `g.exploring` / `g.verified` / `g.pruned` | Inside shadow DOM, status-encoded |
| Tooltip black | `ControlSettingItem.tsx` line ~100 | Intentional `#000` for high-contrast hover tooltip |
| Animation gradient stops | `AnimatedSparkles.tsx` | Decorative gradient, status-encoded |

When adding to this list, document the reason inline (one-line comment near the hex).

## Streamdown is a separate token system

Streamdown renders markdown inside its own Shadow DOM with shadcn-style HSL tokens (`--background`, `--foreground`, `--primary`, etc.) — these are NOT `--pk-*` tokens and should not be replaced. The mapping is documented at the top of `src/styles/streamdown-shadow-host.css`. When updating peak tokens, eyeball markdown surfaces to confirm they still feel "of the same family".

## Mocks

Mocks live under `docs/mockups/` (authoritative) or `docs/mockups/_archive/` (deprecated). The visual token contract is `docs/mockups/_design-tokens-preview.html` — open it in a browser to see all tokens with light/dark toggle. Phase 4 of the migration (deferred) will unify all mock token references via a shared `_shared/peak-tokens.css`; until then, mocks may have inline `--accent` / `--pk-*` definitions and that's known tech debt.

## Checklist

When reviewing UI code, check:

- [ ] No bare `#rrggbb` in `style={{ ... }}` or `pktw-*-[#xxx]` arbitrary values (unless in exception list above)
- [ ] No `var(--text-normal)` / `var(--background-primary)` / `var(--interactive-accent)` etc. Obsidian-direct references
- [ ] No `var(--pk-X, fallback)` fallback chains — the `--pk-X` always resolves now
- [ ] New tokens declared in BOTH light and dark blocks of `peak-tokens.css`
- [ ] If a new component introduces a color, can it be expressed with an existing `--pk-*` first?
- [ ] Tailwind utility used when one exists (`pktw-bg-pk-accent` over `style={{ background: 'var(--pk-accent)' }}`)

## File map

| File | Role |
|---|---|
| `src/styles/peak-tokens.css` | Source of truth — all `--pk-*` definitions, light + dark |
| `src/styles/peak-variables.css` | Legacy alias shell (to be removed after all `--pk-fg` / `--pk-hover` etc. callers migrate) |
| `tailwind.config.js` | Exposes `--pk-*` as Tailwind utilities (`pk-bg`, `pk-accent`, etc.) |
| `src/styles/vault-review.css` | Vault Review modal styles, consumes `--pk-*` |
| `src/styles/streamdown-shadow-host.css` | Streamdown shadow DOM tokens (separate shadcn HSL system + pass-through of `--pk-*`) |
| `docs/mockups/_design-tokens-preview.html` | Visual reference for all tokens |
| `docs/superpowers/specs/2026-05-22-design-system-migration.md` | Migration history + rationale |
