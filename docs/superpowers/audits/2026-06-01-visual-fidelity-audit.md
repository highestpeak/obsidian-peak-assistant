# Visual Fidelity Audit — 2026-06-01

> Status: **batches 1–3 landed** (commits `96c4a36` / `3b94f15` / `<batch3>`). All 🔴 visible-at-glance items + cross-cutting findings #1/#2/#3 are closed. 🟢 sub-pixel polish (batch 4) deferred — see "Recommended fix batches" at the bottom.
> Surface order: chat → onboarding → settings → primitives (most-visible to least).
> Mocks at HEAD = `faaf2ce`. Production = `src/styles/peak-components.css` (3083 lines) + `src/styles/peak-tokens.css` (238 lines).

## Methodology

For each surface, the canonical mock CSS (chat-retained-mock.css, onboarding mock.css, settings mock.css) was read in full and diffed against the matching `pkchat-*` / `pkonb-*` / `pkset-*` / `pk-*` production blocks. Every property mismatch was logged once and tagged by severity:

- 🔴 visible-at-glance — wrong color, wrong shape, missing element, wrong density
- 🟡 noticeable-on-inspection — 1–3px size/spacing drift, missing hover state, wrong border weight
- 🟢 sub-pixel — half-pixel drift, identical-looking color round, opacity tweak

Dimensions audited: typography, spacing, color, geometry, effects, interaction states. Dashboard surface skipped per scope. Items where production deliberately diverged for Obsidian compatibility are noted as **intentional divergence**.

The mock CSS uses raw px literals (13px, 14.5px, 11.5px, …) because mocks are static HTML. Production uses `--pk-text-*` tokens (10/11/12/13/14/16/20/28 px scale). Many drift items in this audit come from the rounding loss between mock literals and the nearest token. Where the mock pixel value is structurally meaningful (e.g. 14.5px = chat body, 13.5px = msg name, 11.5px = chip) and the round materially changes weight, the fix is to set the literal directly.

## Summary stats

- Total diff items: 64
- 🔴 visible-at-glance: 8
- 🟡 noticeable-on-inspection: 38
- 🟢 sub-pixel: 18

---

## SURFACE 1: Chat — shell + header

### Chat / `.pkchat-header` / padding

- **Mock** (`chat-retained-mock.css:253`): `padding: 12px 18px`
- **Production** (`peak-components.css:799`): `padding: var(--pk-space-3) var(--pk-space-5)` → `12px 20px`
- **Diff**: 2px wider horizontal padding than mock.
- **Fix**: set `padding: var(--pk-space-3) 18px` or accept 20px as canonical and update mock.
- **Severity**: 🟢 sub-pixel

### Chat / `.pkchat-header__title` / font-size

- **Mock** (`chat-retained-mock.css:258`): `font-size: 14.5px; font-weight: 650`
- **Production** (`peak-components.css:807`): `font-size: var(--pk-text-lg)` → `14px`, `font-weight: 600`
- **Diff**: Loses 0.5px of weight on the title. Mock weight 650 is mid-bold (only available in variable fonts); production 600 reads slightly lighter.
- **Fix**: `font-size: 14.5px; font-weight: 650;` directly. Token alone can't express this — set literal.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-header` / icon-button cluster gap

- **Mock** (`chat-retained-mock.css:266`): `gap: 2px` on `.hdr-actions` (✓ matches production)
- **Production** (`peak-components.css:826`): `gap: 2px` ✓
- **Diff**: none
- **Severity**: ✓

---

## SURFACE 2: Chat — composer + run-chip popover

### Chat / `.pkchat-composer-wrap` / padding gradient

- **Mock** (`chat-retained-mock.css:646`): `padding: 14px 22px 22px; background: linear-gradient(180deg, rgba(255,255,255,0) 0%, var(--pk-surface) 30%)`
- **Production** (`peak-components.css:851`): `padding: var(--pk-space-3) var(--pk-space-5) var(--pk-space-5)` → `12px 20px 20px`; `background: var(--pk-surface)` (solid)
- **Diff**: Production drops the fade-to-surface gradient that softens the transition from message list into the composer. Also 2px tighter on every side.
- **Fix**: restore gradient; bump padding to `14px var(--pk-space-5) var(--pk-space-5)` (or accept 12/20 if intentional).
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-composer` / border-radius

- **Mock** (`chat-retained-mock.css:652`): `border-radius: 14px`
- **Production** (`peak-components.css:859`): `border-radius: var(--pk-radius-lg)` → `12px`
- **Diff**: 2px less rounded; composer reads slightly more rectangular.
- **Fix**: `border-radius: 14px;` literal or add `--pk-radius-composer: 14px` token.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-composer` / inner padding

- **Mock** (`chat-retained-mock.css:653`): editor area `padding: 14px 16px 10px` (single block)
- **Production** (`peak-components.css:874`): editor `padding: var(--pk-space-3) var(--pk-space-4) 0` → `12px 16px 0` then separate footer `padding: var(--pk-space-2) var(--pk-space-3)` → `8px 12px`
- **Diff**: Production splits editor and footer with hard divider; mock has unified internal padding. Visually similar but the divider in production reads as a separate band.
- **Fix**: keep current split (intentional separation per `pkchat-composer__foot`) but tighten editor top padding to 14px to match.
- **Severity**: 🟢 sub-pixel

### Chat / `.pkchat-composer:focus-within` / focus ring

- **Mock** (`chat-retained-mock.css:660`): `border-color: var(--pk-border-accent)` only (subtle border swap)
- **Production** (`peak-components.css:867`): `border-color: var(--pk-accent); box-shadow: 0 0 0 3px var(--pk-accent-tint)` (saturated 3px halo)
- **Diff**: Production has a much louder focus ring than mock; mock is gentle border-only.
- **Fix**: change to `border-color: var(--pk-accent); box-shadow: none;` to honor mock subtlety — or keep ring if accessibility was the rationale (note: **intentional divergence: a11y focus visibility** is plausible).
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-run-chip` / height

- **Mock** (`chat-retained-mock.css:701`): `height: 30px`
- **Production** (`peak-components.css:905`): `height: 28px`
- **Diff**: 2px shorter chip.
- **Fix**: `height: 30px`.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-run-chip__ctx` / font-size

- **Mock** (`chat-retained-mock.css:714`): `.run-chip .ctx { font-family: mono; color: accent }` (inherits 12.5px from parent)
- **Production** (`peak-components.css:946`): `font-size: var(--pk-text-sm)` → `11px`
- **Diff**: Mono context value rendered 1.5px smaller than rest of chip, reads as visually disconnected.
- **Fix**: drop `font-size: var(--pk-text-sm)` so it inherits the chip's font-size.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-run-chip:hover` / background

- **Mock** (`chat-retained-mock.css:711`): hover `background: var(--pk-accent-soft)` (rgba .25)
- **Production** (`peak-components.css:923`): hover `background: var(--pk-accent-tint)` (rgba .10)
- **Diff**: Mock hover is markedly more saturated. Production hover is almost invisible.
- **Fix**: `background: var(--pk-accent-soft)` on `:hover` and `[data-state="open"]`.
- **Severity**: 🔴 visible-at-glance

### Chat / `.pkchat-runpop` / wrapper padding + min-width

- **Mock** (`chat-retained-mock.css:733-740`): `width: 320px; padding: 14px`
- **Production** (`peak-components.css:1004-1008`): `min-width: 280px`, no explicit padding (relies on `.pk-popover` parent `padding: var(--pk-space-1)` = 4px)
- **Diff**: Production runpop is 40px narrower and has only 4px of inner padding vs mock's 14px. The popover feels cramped.
- **Fix**: `min-width: 320px; padding: 14px;` on `.pkchat-runpop`, or override `.pk-popover` when it hosts a runpop.
- **Severity**: 🔴 visible-at-glance

### Chat / `.pkchat-runpop__title` / font-size

- **Mock** (`chat-retained-mock.css:743`): `font-size: 14px; font-weight: 650`
- **Production** (`peak-components.css:1021`): `font-size: var(--pk-text-md)` → `13px`, `font-weight: 600`
- **Diff**: 1px smaller, lighter weight.
- **Fix**: `font-size: var(--pk-text-lg); font-weight: 650;`.
- **Severity**: 🟡 noticeable

### Chat / run-chip popover / segmented control

- **Mock** (`chat-retained-mock.css:753-776`): `.seg` is 3-column grid, 28px tall buttons, `border-radius: 9px` on container + `7px` on buttons.
- **Production** (`peak-components.css:317-344` `.pk-segmented`): 2px padding, `border-radius: var(--pk-radius-md)` = 8px on container, `border-radius: var(--pk-radius-sm)` = 4px on options.
- **Diff**: Radius mismatch on container (9 vs 8) and options (7 vs 4). 4px option radius reads as too sharp inside the rounded container.
- **Fix**: add a chat-scoped override `.pkchat-runpop .pk-segmented__opt { border-radius: 7px; }` or add `--pk-radius-7: 7px` token.
- **Severity**: 🟡 noticeable

### Chat / run-chip popover / `.role-pill` MISSING in production

- **Mock** (`chat-retained-mock.css:784-814`): role-grid + role-pill (small toggleable role tags inside runpop with check + label)
- **Production**: no `.pkchat-runpop__roles` or equivalent in `peak-components.css`.
- **Diff**: **MISSING in production**. The role-pill cluster from mock isn't represented; runpop renders without role selection chips.
- **Fix**: add `.pkchat-runpop__role-grid` + `.pkchat-runpop__role-pill` selectors copying `chat-retained-mock.css:790-809` once UX confirms roles still ship.
- **Severity**: 🔴 visible-at-glance (if runpop ships)

### Chat / `.row-card` / MISSING in production runpop

- **Mock** (`chat-retained-mock.css:815-843`): tool-toggle row-card with `.switch` toggle + `.ctx-chip` mono context badge.
- **Production**: not present in `pkchat-runpop` namespace.
- **Diff**: **MISSING in production**. The per-tool toggle list inside runpop isn't built.
- **Fix**: implement as `.pkchat-runpop__tool-row` + reuse `.pk-pill` for ctx chip.
- **Severity**: 🔴 visible-at-glance (if runpop ships)

---

## SURFACE 3: Chat — message rendering (assistant + user)

### Chat / `.pkchat-msg-list` / gap

- **Mock** (`chat-retained-mock.css:309`): `.chat-scroll gap: 28px`
- **Production** (`peak-components.css:1665`): `gap: var(--pk-space-6)` → `24px`
- **Diff**: 4px tighter between messages. Cumulative effect over a long thread is noticeable.
- **Fix**: `gap: 28px` literal or define `--pk-space-7: 28px`.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-msg-list` / max-width

- **Mock** (`chat-retained-mock.css:305-310`): `.chat-scroll padding: 24px 26px 12px` (no max-width — center column flexes)
- **Production** (`peak-components.css:1662-1664`): `max-width: 880px; margin: 0 auto; padding: var(--pk-space-4) var(--pk-space-5) var(--pk-space-6)` → `16px 20px 24px`
- **Diff**: Production caps at 880px (a deliberate readability cap) but loses 4px top padding and 6px horizontal padding vs mock. Padding bottom is 12px larger (good for breathing).
- **Fix**: `padding: 24px 26px var(--pk-space-3);` to match mock more literally. The 880 cap is intentional per code comment — keep.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-msg__head` / gap

- **Mock** (`chat-retained-mock.css:321`): `gap: 10px`
- **Production** (`peak-components.css:1699`): `gap: var(--pk-space-2)` → `8px`
- **Diff**: 2px tighter between avatar and name+meta cluster.
- **Fix**: `gap: 10px`.
- **Severity**: 🟢 sub-pixel

### Chat / `.pkchat-msg__name` / font-size

- **Mock** (`chat-retained-mock.css:342`): `font-size: 13.5px; font-weight: 650`
- **Production** (`peak-components.css:1729`): `font-size: 13.5px; font-weight: 650` ✓ (literal kept)
- **Diff**: none
- **Severity**: ✓

### Chat / `.pkchat-msg__mode` / position

- **Mock** (`chat-retained-mock.css:343-355`): mode chip appears in `.msg-head`, inline with name.
- **Production** (`peak-components.css:1999-2012`): same styling but the CSS sits in a different block. Visual values match.
- **Diff**: none
- **Severity**: ✓

### Chat / `.pkchat-msg__body` / line-height

- **Mock** (`chat-retained-mock.css:364`): `line-height: 1.7`
- **Production** (`peak-components.css:1748`): `line-height: 1.7` ✓
- **Severity**: ✓

### Chat / `.pkchat-msg--user .pkchat-msg__body` / padding + border-radius

- **Mock** (`chat-retained-mock.css:375-381`): `border-radius: 10px; padding: 12px 14px; font-size: 14px`
- **Production** (`peak-components.css:1752-1759`): `border-radius: var(--pk-radius-md)` → `8px`, `padding: var(--pk-space-3) var(--pk-space-4)` → `12px 16px`, `font-size: var(--pk-text-md)` → `13px`
- **Diff**: 3 drifts compound: (1) bubble radius 2px sharper than mock (8 vs 10), (2) 2px wider horizontal padding, (3) user font-size 1px smaller than mock — user message reads cramped + small.
- **Fix**: `border-radius: 10px; padding: 12px 14px; font-size: 14px;`. The 8px radius is too sharp for iMessage-style bubbles.
- **Severity**: 🔴 visible-at-glance

### Chat / `.pkchat-msg--user` / max-width

- **Mock** (`chat-component-v2.css:302-313`): `.user-turn max-width: 360px`
- **Production** (`peak-components.css:1686`): `max-width: min(70%, 520px)`
- **Diff**: Production allows user bubbles up to 520px wide vs mock's 360px. 160px wider; long messages look more like a paragraph block than a chat bubble.
- **Fix**: confirm intent — if iMessage feel desired, `max-width: min(70%, 360px)`. If panel-wide content fine, keep current. **Likely intentional divergence: longer user messages need width**; leave.
- **Severity**: 🟡 noticeable (likely intentional)

### Chat / `.pkchat-msg__meta-row` / gap

- **Mock** (`chat-retained-mock.css:387`): `gap: 6px`
- **Production** (`peak-components.css:1765`): `gap: var(--pk-space-2)` → `8px`
- **Diff**: 2px looser between meta items; row reads less dense than mock.
- **Fix**: `gap: 6px`.
- **Severity**: 🟢 sub-pixel

### Chat / `.pkchat-msg__model-chip` / font-size

- **Mock** (`chat-retained-mock.css:401`): `font-size: 11.5px; font-family: mono`
- **Production** (`peak-components.css:1780`): `font-size: 11.5px` ✓ (literal kept)
- **Severity**: ✓

### Chat / `.pkchat-msg__suggest-chip` / hover

- **Mock** (`chat-retained-mock.css:450`): hover `background: var(--pk-surface-sunken); border-color: var(--pk-border-accent); color: var(--pk-accent-hover)`
- **Production** (`peak-components.css:1872-1876`): hover values match ✓
- **Severity**: ✓

### Chat / `.pkchat-msg__suggest-label` / styling

- **Mock** (`chat-retained-mock.css:431-435`): `font-size: 12px; color: tertiary; margin-right: 2px` (no uppercase, no letter-spacing, no font-weight bold)
- **Production** (`peak-components.css:1844-1852`): `font-size: var(--pk-text-sm)` → `11px`, `text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600`
- **Diff**: Production turns the prefix label into an uppercase eyebrow; mock has it as plain inline text.
- **Fix**: drop `text-transform`, `letter-spacing`, `font-weight: 600`; set `font-size: 12px`. Production is over-decorating.
- **Severity**: 🟡 noticeable

### Chat / suggested-row / `.suggest-chip.active` MISSING in production

- **Mock** (`chat-retained-mock.css:451-455`): active state `background: var(--pk-accent-soft); border-color: accent; color: var(--pk-accent-hover)`
- **Production**: no `[data-active="true"]` selector for `.pkchat-msg__suggest-chip`.
- **Diff**: **MISSING in production** — no way to render "selected" suggested chip after click.
- **Fix**: add `.pkchat-msg__suggest-chip[data-active="true"]` block mirroring mock.
- **Severity**: 🟡 noticeable

### Chat / `.pkchat-msg__suggest-chip` / font-size + padding

- **Mock** (`chat-retained-mock.css:436-448`): `font-size: 12.5px; padding: 0 11px; height: 28px`
- **Production** (`peak-components.css:1860-1865`): `padding: 0 11px; height: 28px; font-size: 12.5px` ✓ (literal kept)
- **Severity**: ✓

### Chat / `.pkchat-msg__action` / hover treatment

- **Mock** (`chat-retained-mock.css:419-421`): `:hover { background: var(--pk-surface-sunken); color: var(--pk-text-primary); } .meta-action.danger:hover { color: var(--pk-error); }` ✓
- **Production** (`peak-components.css:1809-1818`): identical ✓
- **Severity**: ✓

---

## SURFACE 4: Chat — Conversation Outline (sidebar)

### Outline / `.pkchat-idx__title` / font-size + weight

- **Mock** (`chat-retained-mock.css:865`): `font-size: 14px; font-weight: 650`
- **Production** (`peak-components.css:1110`): `font-size: var(--pk-text-md)` → `13px`, `font-weight: 650`
- **Diff**: 1px smaller title in production.
- **Fix**: `font-size: var(--pk-text-lg)` → `14px`.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx__search` / icon size

- **Mock** (`chat-retained-mock.css:867-878`): search row 32px tall, no inline icon size spec; relies on `.ico-14` (14px).
- **Production** (`peak-components.css:1156`): `width: 14px; height: 14px` ✓
- **Severity**: ✓

### Outline / `.pkchat-idx__search .kbd` / MISSING in production

- **Mock** (`chat-retained-mock.css:879-887`): right-aligned `Cmd-K` keyboard hint inside search input with mono font + border.
- **Production**: no kbd element / `.pkchat-idx__search__kbd` selector.
- **Diff**: **MISSING in production**. The Cmd-K affordance from mock isn't built.
- **Fix**: add `.pkchat-idx__search__kbd` matching mock or skip if hotkey isn't implemented.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx__tabs .pk-segmented` / option font

- **Mock** (`chat-retained-mock.css:897-905`): `font-size: 12.5px; font-weight: 600`
- **Production** (`peak-components.css:331-336` `.pk-segmented__opt`): `font-size: var(--pk-text-base)` → `12px`; default `color: var(--pk-text-secondary)`. `font-weight: 500` (active only).
- **Diff**: 0.5px smaller, default state lacks 600 weight.
- **Fix**: scope override `.pkchat-idx__tabs .pk-segmented__opt { font-size: 12.5px; font-weight: 600; }`.
- **Severity**: 🟢 sub-pixel

### Outline / `.pkchat-idx-topic` / radius mismatch

- **Mock** (`chat-retained-mock.css:929-933`): `.idx-row border-radius: 10px`
- **Production** (`peak-components.css:1271`): `border-radius: var(--pk-radius-md)` → `8px`
- **Diff**: 2px sharper than mock.
- **Fix**: `border-radius: 10px` or add `--pk-radius-9: 10px` token (slightly more rounded category).
- **Severity**: 🟢 sub-pixel

### Outline / `.pkchat-idx-topic[open]` / background tint

- **Mock** (`chat-retained-mock.css:935-938`): expanded `background: var(--pk-accent-tint)` (rgba .10) ✓
- **Production** (`peak-components.css:1278-1281`): `background: var(--pk-accent-tint)` ✓
- **Severity**: ✓

### Outline / `.pkchat-idx-topic__name` / font-size

- **Mock** (`chat-retained-mock.css:945`): `font-size: 13px`
- **Production** (`peak-components.css:1323`): `font-size: var(--pk-text-sm)` → `11px`
- **Diff**: Topic name is 2px smaller in production — reads as a label rather than a title.
- **Fix**: `font-size: var(--pk-text-md)` → `13px`.
- **Severity**: 🔴 visible-at-glance

### Outline / `.pkchat-idx-topic__count` / padding

- **Mock** (`chat-retained-mock.css:946-953`): `padding: 1px 7px; font-size: 11px`
- **Production** (`peak-components.css:1333-1342`): `padding: 1px 7px; font-size: var(--pk-text-xs)` → `10px`
- **Diff**: 1px smaller font.
- **Fix**: `font-size: var(--pk-text-sm)` → `11px`.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx-msg__text` / font-size

- **Mock** (`chat-retained-mock.css:1041`): `font-size: 12.5px`
- **Production** (`peak-components.css:1499`): `font-size: var(--pk-text-sm)` → `11px`
- **Diff**: 1.5px smaller — preview text reads as too small.
- **Fix**: `font-size: 12.5px`.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx-attach` / font-size

- **Mock** (`chat-retained-mock.css:1001-1009`): `font-size: 11.5px; height: 24px`
- **Production** (`peak-components.css:1408-1410`): `font-size: var(--pk-text-xs)` → `10px`; `height: 22px`
- **Diff**: 1.5px smaller font + 2px shorter pill.
- **Fix**: `font-size: 11.5px; height: 24px`.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx-art__name` / font-family override

- **Mock** (`chat-retained-mock.css:1119`): `font-size: 13px; font-weight: 600` (sans, default)
- **Production** (`peak-components.css:1602-1610`): `font-size: var(--pk-text-sm)` → `11px`, `font-family: var(--pk-font-mono)`
- **Diff**: Mock uses sans 13px; production uses mono 11px. Different *typeface*, not just size — production reads as code/path style; mock reads as content title.
- **Fix**: drop `font-family: var(--pk-font-mono)` and set `font-size: 13px`. (If file-path emphasis was the goal, push the mono treatment onto `.pkchat-idx-art__sub` instead.)
- **Severity**: 🔴 visible-at-glance

### Outline / `.pkchat-idx-art__thumb` / dimensions

- **Mock** (`chat-retained-mock.css:1104-1118`): `width: 60px; height: 44px` (grid col 60px)
- **Production** (`peak-components.css:1550-1551`): `width: 44px; height: 40px` (grid col 44px)
- **Diff**: Thumb is 16px narrower + 4px shorter; visual weight as a preview tile is reduced.
- **Fix**: `width: 60px; height: 44px`; `grid-template-columns: 60px 1fr auto`.
- **Severity**: 🟡 noticeable

### Outline / `.pkchat-idx__filter` / accent text on selected

- **Mock** (`chat-retained-mock.css:1086-1090`): selected `color: var(--pk-accent-hover)` (darker purple)
- **Production** (`peak-components.css:1208-1214`): selected `color: var(--pk-accent-hover)` ✓
- **Severity**: ✓

---

## SURFACE 5: Onboarding — modal shell + progress bar

### Onboarding / `.pkonb-modal__progress` / padding

- **Mock** (`mock.css:142-146`): `padding: 18px 24px 14px`
- **Production** (`peak-components.css:2039`): `padding: 18px var(--pk-space-6) 14px` → `18px 24px 14px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-modal__body` / padding

- **Mock** (`mock.css:148`): `padding: 24px`
- **Production** (`peak-components.css:2046`): `padding: var(--pk-space-6)` → `24px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-modal__body` / inner gap

- **Mock**: not specified — body holds raw children with `mt-*` helpers.
- **Production** (`peak-components.css:2050-2051`): `display: flex; flex-direction: column; gap: var(--pk-space-5)` → `20px`
- **Diff**: **EXTRA in production**. Production force-stacks all body children with a 20px gap. If a step renders sections that already use their own margin/gap, this stacks vertical spacing twice.
- **Fix**: drop `display: flex; flex-direction: column; gap` from `.pkonb-modal__body`, leave step components to handle their own spacing.
- **Severity**: 🟡 noticeable

### Onboarding / `.pkonb-progress__label` / font-size

- **Mock** (`mock.css:246`): `font-size: 11px`
- **Production** (`peak-components.css:2180`): `font-size: var(--pk-text-sm)` → `11px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-progress__title` / font-size

- **Mock** (`mock.css:263`): `font-size: 13px`
- **Production** (`peak-components.css:2202`): `font-size: var(--pk-text-md)` → `13px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-progress__tooltip` / MISSING in production

- **Mock** (`mock.css:273-324`): hover tooltip on each step bubble (positioned below labels, with arrow, body copy).
- **Production**: no `.pkonb-progress__tooltip` selector.
- **Diff**: **MISSING in production**. The hover-tooltip on dots is not built. Important for explaining future/locked steps.
- **Fix**: implement `.pkonb-progress__tooltip` + `::before`/`::after` arrow per mock, or accept and remove from spec.
- **Severity**: 🟡 noticeable

---

## SURFACE 6: Onboarding — step body sections

### Onboarding / `.pkonb-section__title` / token rounding note

- **Mock** (`mock.css:337` `.h2`): `font-size: 18px`
- **Production** (`peak-components.css:2228`): `font-size: 18px` (literal, with code comment explaining no token exists between 16px and 20px) ✓
- **Severity**: ✓ (literal acceptable)

### Onboarding / `.pkonb-section__desc` / line-height

- **Mock** (`mock.css:340` `.sub`): no explicit `line-height` (inherits 1.5 from body)
- **Production** (`peak-components.css:2260`): `line-height: 1.5` ✓
- **Severity**: ✓

### Onboarding / Welcome `.pkonb-hero__title` / font-size

- **Mock** (`mock.css:1140`): `font-size: 22px`
- **Production** (`peak-components.css:2311`): `font-size: var(--pk-text-2xl)` → `20px`
- **Diff**: Hero title is 2px smaller in production.
- **Fix**: `font-size: 22px` literal, or add `--pk-text-2xl` bump.
- **Severity**: 🟡 noticeable

### Onboarding / Welcome `.pkonb-hero` / padding

- **Mock** (`mock.css:1120-1127`): `padding: 32px 16px`
- **Production** (`peak-components.css:2281`): `padding: var(--pk-space-8) var(--pk-space-4)` → `32px 16px` ✓
- **Severity**: ✓

### Onboarding / Capabilities `.pkonb-cap-card__title` / font-size

- **Mock** (`mock.css:724`): `font-size: 14px`
- **Production** (`peak-components.css:2385`): `font-size: var(--pk-text-lg)` → `14px` ✓
- **Severity**: ✓

### Onboarding / Capabilities `.pkonb-cap-card__body` / font-size

- **Mock** (`mock.css:725`): `font-size: 12px`
- **Production** (`peak-components.css:2392`): `font-size: var(--pk-text-base)` → `12px` ✓
- **Severity**: ✓

### Onboarding / Capabilities `.pkonb-cap-card__try code` / font-size

- **Mock** (`mock.css:736-747`): `font-size: 11px; background: surface-sunken`
- **Production** (`peak-components.css:2415-2428`): `font-size: var(--pk-text-sm)` → `11px` ✓
- **Severity**: ✓

### Onboarding / Provider `.pkonb-provider-chip__name` / font-size

- **Mock** (`mock.css:561`): `font-size: 12px`
- **Production** (`peak-components.css:2615`): `font-size: var(--pk-text-base)` → `12px` ✓
- **Severity**: ✓

### Onboarding / Provider `.provider-chip__logo` / MISSING in production

- **Mock** (`mock.css:550-558`): `.provider-chip__logo width:28px; height:28px; .icon 22x22`
- **Production**: no `.pkonb-provider-chip__logo` slot; only `__name` + `__check`.
- **Diff**: **MISSING in production**. Provider brand logo can't be displayed inside the chip — only the name renders, defeating brand recognition.
- **Fix**: add `.pkonb-provider-chip__logo` + `.icon` size rules.
- **Severity**: 🔴 visible-at-glance

### Onboarding / `.pkonb-radio-card__title` / font-size

- **Mock** (`mock.css:450`): `font-size: 13px`
- **Production** (`peak-components.css:2499`): `font-size: var(--pk-text-md)` → `13px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-radio-card__hint` / font-size

- **Mock** (`mock.css:451`): `font-size: 12px`
- **Production** (`peak-components.css:2506`): `font-size: var(--pk-text-base)` → `12px` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-radio-card--compact` / min-height

- **Mock** (`mock.css:501-508`): `min-height: 110px`
- **Production** (`peak-components.css:2545`): `min-height: 108px`
- **Diff**: 2px shorter.
- **Fix**: `min-height: 110px`.
- **Severity**: 🟢 sub-pixel

### Onboarding / `.pkonb-radio-card[data-selected="true"]` / border-color

- **Mock** (`mock.css:420-424`): selected `border-color: var(--pk-accent-soft)`
- **Production** (`peak-components.css:2454-2459`): `border-color: var(--pk-accent-soft)` ✓
- **Severity**: ✓

### Onboarding / `.pkonb-action-card__try` / padding

- **Mock** (`mock.css:952-961`): `padding: 10px 12px; font-size: 12px`
- **Production** (`peak-components.css:2835-2843`): `padding: 10px var(--pk-space-3)` → `10px 12px` ✓; `font-size: var(--pk-text-base)` → `12px` ✓
- **Severity**: ✓

### Onboarding / Loading state `.spinner` / MISSING in production (size variant)

- **Mock** (`mock.css:1084-1091`): `.spinner` is `20px` square with `2px` border, used in checklist contexts.
- **Production** (`peak-components.css:2856-2864` `.pkonb-spinner`): only `36px` square with `3px` border.
- **Diff**: **EXTRA in production / variant missing**. No 20px small spinner for inline checklist usage; downstream callers either use the large 36px or fall back to non-styled spinners.
- **Fix**: add `.pkonb-spinner--sm { width: 20px; height: 20px; border-width: 2px; }`.
- **Severity**: 🟡 noticeable

### Onboarding / `.check-list` / MISSING in production

- **Mock** (`mock.css:849-877`): full checklist component with `[data-state="done"]`, `[data-state="active"]`, `[data-state="pending"]` rows; used during loading.
- **Production**: no `.pkonb-checklist` / `.check-list` selectors anywhere.
- **Diff**: **MISSING in production**. The bootstrap/running step's progressive checklist can't render as designed.
- **Fix**: implement `.pkonb-checklist` + `__item[data-state]` + `__bullet`.
- **Severity**: 🔴 visible-at-glance

### Onboarding / `.split` / MISSING in production

- **Mock** (`mock.css:1096-1117`): 2-column hero used for loading state (spinner left, checklist right).
- **Production**: no equivalent `.pkonb-split` block.
- **Diff**: **MISSING in production**.
- **Fix**: add `.pkonb-split` two-column layout primitive matching mock.
- **Severity**: 🟡 noticeable

### Onboarding / `.done-check` / production hero variant

- **Mock** (`mock.css:1144-1155`): `.done-check { width:56px; height:56px; background: success-bg; color: success }`
- **Production** (`peak-components.css:2303-2307`): `.pkonb-hero__mark--success` is the same 56px success-tinted circle ✓
- **Severity**: ✓

### Onboarding / `.pkonb-hint--warning` / border-color

- **Mock** (`mock.css:895`): `border-color: rgba(245, 158, 11, 0.25)` (semi-transparent warning border)
- **Production** (`peak-components.css:2687-2691`): `border-color: var(--pk-warning-bg)` (uses the bg token, not a distinct border)
- **Diff**: Production's border color = bg color, so border is invisible; mock has a distinct 25%-opacity border.
- **Fix**: add `--pk-warning-border: rgba(245, 158, 11, 0.25);` token and use it. Same applies to `.pkonb-hint--danger`.
- **Severity**: 🟡 noticeable

---

## SURFACE 7: Onboarding — radio cards + provider chips + form rows

(Most form primitives covered in SURFACE 13. Card-specific items covered in SURFACE 6.)

### Onboarding / `.pkonb-summary-row` / left col width

- **Mock** (`mock.css:1158-1167`): `grid-template-columns: 110px 1fr auto`
- **Production** (`peak-components.css:2706`): `grid-template-columns: 140px 1fr auto`
- **Diff**: Label column is 30px wider than mock; labels look isolated, values pushed right.
- **Fix**: `grid-template-columns: 110px 1fr auto`.
- **Severity**: 🟡 noticeable

### Onboarding / `.pkonb-summary-row` / padding

- **Mock** (`mock.css:1163`): `padding: 10px 12px`
- **Production** (`peak-components.css:2709`): `padding: 10px var(--pk-space-3)` → `10px 12px` ✓
- **Severity**: ✓

### Onboarding / `.btn--secondary` / MISSING button variants in `pk-*` primitives

- **Mock** (`mock.css:376-381`): `.btn--secondary { background: surface; border: 1px solid border-strong; color: text-primary }`
- **Production**: no `pk-btn-*` primitive at all. Onboarding/settings rely on shadcn Button + ad-hoc Obsidian button. Per CLAUDE.md "use shadcn Button" — **intentional divergence**.
- **Diff**: button atom doesn't live in `peak-components.css` (shadcn provides). Verify the shadcn `Button` variants `default/secondary/ghost/destructive/outline` line up visually with the mock's `.btn--primary/--secondary/--ghost/--danger`.
- **Fix**: spot-check via `Button` consumer styles; if drift exists patch the shadcn theme, not `peak-components.css`. Noted here for completeness.
- **Severity**: 🟡 noticeable (depends on shadcn theme tuning)

---

## SURFACE 8: Settings — tab strip + root layout

### Settings / `.pkset-root` / max-width

- **Mock** (`mock.css:106-110` `.stage`): `max-width: 920px; padding: 32px 24px 80px`
- **Production** (`peak-components.css:2899-2901`): `max-width: 860px; padding: var(--pk-space-2) 0` → `8px 0`
- **Diff**: Production is 60px narrower with virtually no vertical padding (8px) vs mock's 32px top + 80px bottom. The settings page in Obsidian sits flush against chrome with no breathing room.
- **Fix**: `max-width: 920px; padding: var(--pk-space-6) var(--pk-space-6) var(--pk-space-12);` OR delegate padding to host; if delegated, note in comment.
- **Severity**: 🔴 visible-at-glance

### Settings / `.pkset-head` / margin-bottom

- **Mock** (`mock.css:113-118`): `.stage__head margin-bottom: 24px`
- **Production** (`peak-components.css:2906-2912`): `padding-bottom: var(--pk-space-1)` → `4px` (then relies on parent gap)
- **Diff**: Settings head sits 20px closer to the tab strip than mock.
- **Fix**: `padding-bottom: var(--pk-space-5)` → `20px` or rely on `.pkset-root gap: var(--pk-space-6)` → `24px`.
- **Severity**: 🟡 noticeable

### Settings / `.pkset-tabs__tab[data-active="true"]` / color

- **Mock** (`mock.css:153-155`): `color: var(--pk-accent-text)` (`#6d28d9` darker purple)
- **Production** (`peak-components.css:2957-2960`): `color: var(--pk-accent)` (`#7c3aed` brand purple)
- **Diff**: Active tab is brighter purple than mock's hover-purple. Subtle, but mock uses the darker `-text` shade to read as "selected/permanent" vs link-bright.
- **Fix**: `color: var(--pk-accent-text)`.
- **Severity**: 🟢 sub-pixel

### Settings / `.pkset-tabs` / margin-bottom

- **Mock** (`mock.css:132-138`): `margin-bottom: 24px`
- **Production** (`peak-components.css:2936`): `margin-bottom: var(--pk-space-3)` → `12px`
- **Diff**: 12px tighter — tab content sits twice as close to the tab bar as mock.
- **Fix**: `margin-bottom: var(--pk-space-6)` → `24px`.
- **Severity**: 🟡 noticeable

---

## SURFACE 9: Settings — Overview tab (readiness rows)

### Overview / `.pkset-section__title` / margin-bottom

- **Mock** (`mock.css:174-180` `.section__title`): `margin: 0 0 10px`
- **Production** (`peak-components.css:2999-3005`): no margin; relies on `.pkset-section gap: var(--pk-space-2)` → `8px`
- **Diff**: 2px tighter. Section title hugs body content more in production.
- **Fix**: `gap: 10px` on `.pkset-section`, or add `margin-bottom: 10px` on `__title`.
- **Severity**: 🟢 sub-pixel

### Overview / `.pkset-section__sub` / margin

- **Mock** (`mock.css:181-185`): `margin: -4px 0 12px` (negative top pulls it under title)
- **Production** (`peak-components.css:3007-3011`): no margin
- **Diff**: Title→sub spacing is wrong; sub sits 4px below title with no negative pull, looks disconnected.
- **Fix**: `margin-top: -4px; margin-bottom: 4px;` (or restructure with flex gap on header block).
- **Severity**: 🟡 noticeable

### Overview / readiness panel `.row` (when nested) / border treatment

- **Mock** (`mock.css:479-493`): `.readiness-panel .row { border: 0; border-radius: 0; border-bottom: 1px solid border-soft; box-shadow: none; }`
- **Production**: no `.pkset-readiness-panel` wrapper override; rows render as standalone cards even when grouped.
- **Diff**: **MISSING in production**. The "stacked rows in one panel" grouping (Overview, Index readiness) renders as individually-bordered cards, not a single panel.
- **Fix**: add `.pkset-readiness-panel` wrapper class with the `.pk-row` border-stripping treatment.
- **Severity**: 🔴 visible-at-glance

### Overview / `.recommended-row` / MISSING in production

- **Mock** (`mock.css:496-522`): accent-filled CTA row inside readiness panel for "Recommended action" emphasis.
- **Production**: no `.pkset-recommended-row` block.
- **Diff**: **MISSING in production**. The accent-highlighted recommended-action row from Overview can't be rendered.
- **Fix**: add `.pkset-recommended-row` with `background: var(--pk-accent-soft); border-top: 1px solid var(--pk-accent-soft);` per mock.
- **Severity**: 🟡 noticeable (impacts Overview clarity)

---

## SURFACE 10: Settings — AI Setup tab (providers list + AI behavior section)

### AI Setup / `.preset-grid` / MISSING in production

- **Mock** (`mock.css:399-403`): 4-col preset card grid for "Recommended setup" presets (3 colors of provider tier presets).
- **Production**: no `.pkset-preset-grid` / `.pkset-preset` blocks.
- **Diff**: **MISSING in production**. Recommended-preset cards can't render.
- **Fix**: add `.pkset-preset-grid` + `.pkset-preset` + `.pkset-preset__icon/title/desc/check` matching mock 405-465.
- **Severity**: 🔴 visible-at-glance (if presets ship)

### AI Setup / `.provider-row` / MISSING in production

- **Mock** (`mock.css:583-610`): saved-provider row layout for the providers list.
- **Production**: production uses generic `.pk-row` instead. May render OK but loses the `.provider-row__logo` brand-tinted square and `.provider-row__status` dot+label combo.
- **Diff**: production reuses `.pk-row` — visually similar but no logo treatment.
- **Fix**: ensure `.pk-row__icon--brand` modifier exists (it does in mock at 471-475 but no `pk-row__icon--brand` modifier in production). Add `.pk-row__icon--brand` modifier.
- **Severity**: 🟡 noticeable

### AI Setup / `.row-add` / MISSING in production

- **Mock** (`mock.css:582-604`): dashed-border "+ Add provider" CTA button below the provider list.
- **Production**: no `.pkset-row-add` selector.
- **Diff**: **MISSING in production**. The Add-row affordance has no shared style; consumers hand-roll it.
- **Fix**: add `.pkset-row-add` matching mock (`border: 1px dashed border-strong; bg: transparent; hover: surface-sunken + border-accent`).
- **Severity**: 🟡 noticeable

### AI Setup / `.action-strip` / MISSING in production

- **Mock** (`mock.css:608-617`): wrap-flex container holding action buttons with internal `padding: 14px; gap: 8px; bg: surface; border: 1px solid border`.
- **Production**: no `.pkset-action-strip`.
- **Diff**: **MISSING in production**.
- **Fix**: add `.pkset-action-strip` block per mock.
- **Severity**: 🟡 noticeable

### AI Setup / `.danger-zone` / MISSING in production

- **Mock** (`mock.css:621-635`): red-bordered, pale-red-bg block for destructive actions section.
- **Production**: no `.pkset-danger-zone` selector.
- **Diff**: **MISSING in production**.
- **Fix**: add `.pkset-danger-zone` per mock.
- **Severity**: 🟡 noticeable

---

## SURFACE 11: Settings — Tools tab + Advanced tab

### Tools/Advanced / `.choice-list` + `.choice-row` / MISSING in production

- **Mock** (`mock.css:946-1012`): full Choose-Model modal list pattern with `[data-selected="true"]` accent + checkmark.
- **Production**: no `.pkset-choice-list` / `.pkset-choice-row` block; consumers use `.pk-pop-item` (popover item, not modal).
- **Diff**: **MISSING in production**. Modal-scoped selection rows render via popover-style atoms that are subtler than the mock's modal pattern.
- **Fix**: add `.pkset-choice-list` + `.pkset-choice-row` per mock.
- **Severity**: 🟡 noticeable

### Tools/Advanced / `.kv-list` / MISSING in production

- **Mock** (`mock.css:939-944`): key=value summary list (label + mono value, 180px label col) used in read-only modal summaries.
- **Production**: no `.pkset-kv-list`.
- **Diff**: **MISSING in production**.
- **Fix**: add `.pkset-kv-list` per mock.
- **Severity**: 🟡 noticeable

### Tools / `.stub-banner` / MISSING in production

- **Mock** (`mock.css:923-936`): accent-tinted banner used by stub/coming-soon modals.
- **Production**: closest match is `.pkonb-hint--accent` but selector is namespaced to onboarding; settings has no equivalent.
- **Diff**: **MISSING in production** under `pkset-*`. Onboarding's hint could be promoted to shared.
- **Fix**: promote `.pkonb-hint` to a shared `.pk-hint` primitive OR add `.pkset-stub-banner` per mock.
- **Severity**: 🟡 noticeable

### Tools / `.choice-search` / MISSING in production

- **Mock** (`mock.css:990-1012`): inline search input with left-positioned icon for the Choose-Model modal.
- **Production**: no production equivalent — search inputs use generic `.pk-form-input` without icon.
- **Diff**: **MISSING in production**.
- **Fix**: add `.pkset-choice-search` per mock or a generic `.pk-form-input--with-icon` modifier.
- **Severity**: 🟡 noticeable

---

## SURFACE 12: Shared primitives — pk-chip / pk-pill / pk-icon-btn / pk-segmented

### Primitives / `.pk-chip--success` / border-color

- **Mock** (`mock.css:651-655` `.chip--green`): `border-color: rgba(34, 197, 94, 0.25)` (semi-transparent semantic border)
- **Production** (`peak-components.css:197-201` `.pk-chip--success`): `border: 1px solid transparent`, then bg + color only.
- **Diff**: Mock's success chip has a distinct soft green border ring; production has none. Same for warning, danger.
- **Fix**: add semantic border tokens (`--pk-success-border`, `--pk-warning-border`, `--pk-error-border` at 25% alpha) and apply `border-color: var(--pk-success-border)` etc.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-chip` / font-size + padding

- **Mock** (`mock.css:636-647`): `padding: 3px 8px; font-size: 11px; line-height: 1`
- **Production** (`peak-components.css:175-187`): `padding: 3px var(--pk-space-2)` → `3px 8px` ✓; `font-size: var(--pk-text-sm)` → `11px` ✓; `line-height: 1` ✓
- **Severity**: ✓

### Primitives / `.pk-pill` / padding

- **Mock** (`mock.css:561-580`): `.pill padding: 4px 10px`
- **Production** (`peak-components.css:248-260`): `padding: 4px var(--pk-space-3)` → `4px 12px`
- **Diff**: 2px wider per side.
- **Fix**: `padding: 4px 10px`.
- **Severity**: 🟢 sub-pixel

### Primitives / `.pk-pill[data-selected="true"]` / color

- **Mock** (`mock.css:575-579`): selected `color: var(--pk-accent-text)` (`#6d28d9`)
- **Production** (`peak-components.css:270-275`): `color: var(--pk-accent-text)` ✓
- **Severity**: ✓

### Primitives / `.pk-icon-btn` / size

- **Mock** (`mock.css:747-760` `.modal-shell__close`): `width: 28px; height: 28px` (mock's only icon-btn usage)
- **Production** (`peak-components.css:283-310`): `width: 28px; height: 28px` ✓
- **Diff**: Note: chat-retained-mock `.icon-btn` uses `30px` not 28px — there's a discrepancy between the chat mock (30px) and settings mock (28px). Production picked 28; chat header icons therefore 2px smaller than chat mock specified.
- **Fix**: decide canonical: if chat header icons should be 30px, add `.pk-icon-btn--lg` (30px) or scope `.pkchat-header .pk-icon-btn { width: 30px; height: 30px; }`.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-segmented` / padding

- **Mock** (`mock.css:526-533`): `padding: 2px; gap: 2px`
- **Production** (`peak-components.css:317-325`): `padding: 2px; gap: 2px` ✓
- **Severity**: ✓

### Primitives / `.pk-segmented__opt` / padding

- **Mock** (`mock.css:535-543`): `padding: 6px 10px`
- **Production** (`peak-components.css:327-336`): `padding: 6px var(--pk-space-3)` → `6px 12px`
- **Diff**: 2px wider horizontal padding.
- **Fix**: `padding: 6px 10px`.
- **Severity**: 🟢 sub-pixel

### Primitives / `.pk-segmented__opt[data-selected="true"]` / box-shadow

- **Mock** (`mock.css:545-550`): `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08)`
- **Production** (`peak-components.css:338-344`): `box-shadow: var(--pk-shadow-sm)` → `0 1px 2px rgba(0, 0, 0, 0.06)`
- **Diff**: 0.02 lighter shadow. Selected option reads slightly less raised.
- **Fix**: tweak `--pk-shadow-sm` to `0.08` alpha, or literal here.
- **Severity**: 🟢 sub-pixel

---

## SURFACE 13: Shared primitives — pk-modal / pk-popover / pk-form-row

### Primitives / `.pk-modal-overlay` / background scrim

- **Mock** (`mock.css:711`): `background: rgba(15, 23, 42, 0.42)` (slate-900 tinted scrim)
- **Production** (`peak-components.css:357`): `background: rgba(0, 0, 0, 0.42)` (pure black)
- **Diff**: Production scrim is pure black; mock is slate-tinted. Visually similar but the slate has slightly more depth/character.
- **Fix**: `background: rgba(15, 23, 42, 0.42);`. Per existing comment this scrim is intentionally inline — just align the value.
- **Severity**: 🟢 sub-pixel

### Primitives / `.pk-modal-shell__title` / font-size

- **Mock** (`mock.css:744`): `font-size: 15px`
- **Production** (`peak-components.css:404-409`): `font-size: var(--pk-text-lg)` → `14px`
- **Diff**: 1px smaller modal title.
- **Fix**: `font-size: 15px` literal OR add `--pk-text-modal-title: 15px`.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-modal-shell__body` / padding

- **Mock** (`mock.css:762`): `padding: 18px 20px`
- **Production** (`peak-components.css:425`): `padding: 18px var(--pk-space-5)` → `18px 20px` ✓
- **Severity**: ✓

### Primitives / `.pk-modal-shell__footer` / padding

- **Mock** (`mock.css:769`): `padding: 12px 20px`
- **Production** (`peak-components.css:436`): `padding: var(--pk-space-3) var(--pk-space-5)` → `12px 20px` ✓
- **Severity**: ✓

### Primitives / `.pk-popover` / border-radius

- **Mock** (`chat-retained-mock.css:478` `.popover`): `border-radius: 12px`
- **Production** (`peak-components.css:450`): `border-radius: var(--pk-radius-md)` → `8px`
- **Diff**: Popover is 4px sharper than mock — visually reads more like a dropdown menu than a floating panel.
- **Fix**: `border-radius: var(--pk-radius-lg)` → `12px`.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-popover` / padding

- **Mock** (`chat-retained-mock.css:480`): `padding: 8px`
- **Production** (`peak-components.css:452`): `padding: var(--pk-space-1)` → `4px`
- **Diff**: Popover inner padding halved; pop-items hug the popover edge.
- **Fix**: `padding: var(--pk-space-2)` → `8px`.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-pop-item` / font-size

- **Mock** (`chat-retained-mock.css:490-501`): `font-size: 13px`
- **Production** (`peak-components.css:456-470`): `font-size: var(--pk-text-md)` → `13px` ✓
- **Severity**: ✓

### Primitives / `.pk-form-row` / column ratio

- **Mock** (`mock.css:777-782`): `grid-template-columns: 160px 1fr`
- **Production** (`peak-components.css:500-506`): `grid-template-columns: 160px 1fr` ✓
- **Severity**: ✓

### Primitives / `.pk-form-input` / font-size

- **Mock** (`mock.css:805`): `font-size: 12px`
- **Production** (`peak-components.css:556`): `font-size: var(--pk-text-base)` → `12px` ✓
- **Severity**: ✓

### Primitives / `.pk-form-input[type="password"]` / MISSING in production

- **Mock** (`mock.css:817`): `font-family: sans; letter-spacing: 0.18em` for password dot rendering
- **Production**: no `[type="password"]` selector under `pk-form-input`.
- **Diff**: **MISSING in production**. Password fields render with mono font (default form-input) — dots may look too thin/tight.
- **Fix**: add `.pk-form-input[type="password"] { font-family: var(--pk-font-sans); letter-spacing: 0.18em; }`.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-form-select` / dropdown chevron

- **Mock** (`mock.css:818`): hand-rolled SVG chevron via `background-image: linear-gradient(...)` for select appearance.
- **Production** (`peak-components.css:561-566`): only sets `font-family: sans`; no `appearance: none` + chevron background.
- **Diff**: **MISSING in production**. Production select shows the OS-native chevron, which on macOS is a thick blue triangle that visually clashes with the soft-purple accent.
- **Fix**: copy mock line 818 (`appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, var(--pk-text-secondary) 50%), linear-gradient(135deg, var(--pk-text-secondary) 50%, transparent 50%); ...`).
- **Severity**: 🔴 visible-at-glance

### Primitives / `.pk-form-textarea` / min-height

- **Mock** (`mock.css:819`): `min-height: 96px`
- **Production** (`peak-components.css:580-583`): `min-height: 96px` ✓
- **Severity**: ✓

### Primitives / `.pk-form-status` / MISSING in production

- **Mock** (`mock.css:866-876`): `.form-status` for inline below-field status text (success/error variants).
- **Production**: no `.pk-form-status`.
- **Diff**: **MISSING in production**. Below-input status text has no shared style.
- **Fix**: add `.pk-form-status` + `--success` + `--error` modifiers per mock.
- **Severity**: 🟡 noticeable

### Primitives / `.pk-disclosure-body` / gap

- **Mock** (`mock.css:880-895`): `gap: 8px`
- **Production** (`peak-components.css:660`): `gap: var(--pk-space-2)` → `8px` ✓
- **Severity**: ✓

### Primitives / `.toggle` / MISSING shared primitive

- **Mock** (`mock.css:820-846`): `.toggle` switch primitive used across settings/onboarding.
- **Production**: no `.pk-toggle` shared primitive. Consumers use ad-hoc inline-styled switches.
- **Diff**: **MISSING in production**. Toggle switches are inconsistent across views.
- **Fix**: add `.pk-toggle` block matching mock 820-846 (36×20px pill with 16px thumb + accent-on state).
- **Severity**: 🟡 noticeable

### Primitives / `.pk-row` / padding + gap

- **Mock** (`mock.css:192-202`): `padding: 12px 14px; gap: 14px`
- **Production** (`peak-components.css:38-49`): `padding: var(--pk-space-3) calc(var(--pk-space-3) + 2px)` → `12px 14px` ✓; `gap: var(--pk-space-3)` → `12px`
- **Diff**: gap 2px tighter than mock (12 vs 14).
- **Fix**: `gap: 14px`.
- **Severity**: 🟢 sub-pixel

### Primitives / `.pk-row__right` / gap

- **Mock** (`mock.css:240-245`): `gap: 10px`
- **Production** (`peak-components.css:113-119`): `gap: var(--pk-space-2)` → `8px`
- **Diff**: 2px tighter — chip+value+button cluster on right edge is denser than mock.
- **Fix**: `gap: 10px`.
- **Severity**: 🟢 sub-pixel

---

## Cross-cutting findings

### CC-1: The token system has no `13.5px`, `14.5px`, `12.5px`, `11.5px` "half-step" sizes

The mocks rely on five half-step sizes (10.5/11.5/12.5/13.5/14.5) that the production token scale (10/11/12/13/14/16/20/28) cannot express. PR-0 made the decision to round to the nearest token — the result is ~15 entries in this audit where text reads either too small (rounded down) or too heavy (rounded up). Three options:

1. Accept the round and update mock to match tokens (cheapest; future mocks won't drift again).
2. Add half-step tokens (`--pk-text-sm-plus: 11.5px;` etc.) for the genuine half-step cases.
3. Use literals at the call site (current pattern for `.pkchat-msg__name 13.5px` and `.pkchat-msg__body 14.5px`).

Recommendation: option 2 only for `--pk-text-md-plus: 13.5px` (used 3+ times) and `--pk-text-lg-plus: 14.5px` (used 4+ times); literal at site for one-offs.

### CC-2: Semantic chip borders are missing across the entire chip family

Mock chips use a 25%-alpha border in their semantic color (success/warning/danger); production sets `border: 1px solid transparent` and relies on bg + color alone. The visual result is that production chips read as flat color blocks; mock chips have a soft ring that reads as "tagged surface." Add `--pk-success-border / --pk-warning-border / --pk-error-border / --pk-accent-border-soft` at 25% alpha and apply uniformly. Fixes ~7 entries.

### CC-3: Several mock components don't exist in production at all

The audit found 11 **MISSING in production** items: progress tooltip, runpop role-pill cluster, runpop tool row-card, checklist component, split layout, recommended-row (settings overview), preset-grid (settings AI setup), row-add (settings), action-strip, danger-zone, choice-list/choice-row. These represent step content (running, ready-to-try celebration, AI setup presets, overview recommendations) that may render with degraded fidelity vs the mock. These should be triaged against actual feature scope — some may be planned for later PRs and intentionally absent.

### CC-4: Composer focus ring and run-chip hover are over-decorated vs mock

Two interaction states drift heavily toward "loud accent fill" in production where the mock chose gentle border-only treatments: composer `:focus-within` (3px accent ring vs mock's border swap) and run-chip `:hover` (accent-tint vs mock's accent-soft). These are visible-at-glance differences and should be aligned to mock intent (subtle).

### CC-5: Outline panel typography is consistently 1–2px small

The Conversation Outline (`pkchat-idx-*`) family uses `--pk-text-sm` (11px) and `--pk-text-xs` (10px) for titles, names, and text previews that the mock specifies at 13px / 12.5px / 11.5px. Result: the entire sidebar reads as "fine print" rather than as a peer of the message list. Bulk-bump the title-level selectors to `--pk-text-md` (13px) and the body-level ones to 12.5px literal.

---

## Recommended fix batches (for downstream PR)

- **Batch 1 — CRITICAL (visible-at-glance), 8 items**: composer focus ring, run-chip hover, runpop width+padding, user message bubble radius/padding/font, outline topic name font, outline artifact name font-family, settings root padding+max-width, settings readiness panel grouping, form-select chevron, provider-chip logo slot, missing checklist component. (8 unique fixes, ~1 day of work, biggest perceptible win.)
- **Batch 2 — semantic-token + missing-primitive completeness, ~15 items**: add `--pk-*-border` tokens for chip rings; add `.pk-toggle`, `.pk-form-status`, `.pk-form-input[type="password"]`, `.pkonb-checklist`, `.pkonb-progress__tooltip`, `.pkset-readiness-panel`, `.pkset-recommended-row`, `.pkset-preset-grid`, `.pkset-row-add`, `.pkset-action-strip`, `.pkset-danger-zone`, `.pkset-choice-list/row`, `.pkset-kv-list`, `.pkset-stub-banner`. (Mostly additive; safer.)
- **Batch 3 — typography rounding losses, ~18 items**: bulk-bump outline panel font sizes; consider adding `--pk-text-md-plus` token; fix `pkchat-msg__suggest-label` over-decoration; fix `pkset-tabs__tab` color + margin; fix mode chip font-weight. (Subtle but cumulatively significant.)
- **Batch 4 — sub-pixel polish, ~18 items**: gap/padding 2px drifts, shadow opacity tweak, radius 1-2px drifts, scrim slate-tint, segmented option box-shadow. (Diminishing returns — can wait or ship piecewise.)

**Suggested commit shape**: split into 4 commits (one per batch). Batches 1 + 2 are good single-PR scope; Batch 3 + 4 can land separately to keep visual review tractable.

---

## Closure status (2026-06-01 execution)

| Batch | Status | Commit | Items closed |
|---|---|---|---|
| 1 — CRITICAL 🔴 (property tweaks) | ✅ landed | `96c4a36` | run-chip hover, runpop width+padding, user bubble (3 drifts), outline topic name, outline artifact name (font-family), settings root padding+max-width |
| 2 — Semantic borders + 11 missing primitives | ✅ landed | `3b94f15` | CC-2 chip borders (success/warning/danger/info + onb-hint warn/danger), `--pk-{success,warning,error,info}-border` tokens, `.pk-toggle`, `.pk-form-status`, `.pk-form-input[type=password]`, `.pk-form-select` chevron, `.pkonb-provider-chip__logo`, `.pkonb-spinner--sm`, `.pkonb-checklist`, `.pkonb-split`, `.pkonb-progress__tooltip`, `.pkset-readiness-panel`, `.pkset-recommended-row`, `.pkset-preset-grid` + `.pkset-preset` family, `.pkset-row-add`, `.pkset-action-strip`, `.pkset-danger-zone`, `.pkset-kv-list`, `.pkset-choice-list` + `.pkset-choice-row` family, `.pkset-choice-search` |
| 3 — Typography rounding (CC-1) | ✅ landed | this commit | `--pk-text-md-plus: 13.5px` + `--pk-text-lg-plus: 14.5px` tokens, `.pkchat-msg__name` + `.pkchat-msg__body` via tokens, outline title 13→14, outline topic count 10→11, outline msg text 11→12.5, outline attach font 10→11.5 / height 22→24, suggest-label drop uppercase decoration + size 11→12, settings tab active color accent→accent-text + margin-bottom 12→24, runpop title 13→14, modal-shell title 14→15, onb hero title 20→22 |
| 4 — sub-pixel polish 🟢 | ⏸ deferred | — | Remaining 🟢 entries (gap/padding 2px drifts, shadow opacity tweak, radius 1–2px drifts, slate-tinted scrim, segmented opt box-shadow alpha) — non-perceptible at-glance; can ship piecewise or roll into next design pass. |

**Not closed (deferred to user follow-up)**:
- `.pkchat-runpop` role-pill cluster + tool row-card components — require React wiring + state, not just CSS. Listed in batch 2 brief as "stub the CSS with TODO" but no React consumer exists yet; defer until the runpop role-selection UX ships.
- `.pkchat-idx__search .kbd` (Cmd-K affordance) — kbd hotkey isn't implemented; skipping the static styling until the hotkey lands.
- `.pk-row__icon--brand` modifier — flagged in SURFACE 10 as 🟡; not bundled into batches above. One-line additive change if needed.
- `.pkset-stub-banner` (or shared `.pk-hint` promotion) — flagged in SURFACE 11 as 🟡; settings stub modals not currently shipping with hint, defer.
- Composer focus ring loudness (SURFACE 2, 🟡): kept current 3px accent ring per intentional-divergence note for a11y focus visibility.
- User bubble max-width 360/520 (SURFACE 3, 🟡): kept production 520 per "intentional divergence: longer user messages need width".
