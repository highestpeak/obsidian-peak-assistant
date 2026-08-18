# Vault Intelligence visual parity correction

## Outcome

Bring the production workspace back to the confirmed V2 hierarchy and visual
language across Overview, Vault contents, Activity, Work queue, Scan setup,
Run progress, Completed and maintenance review. The production UI must use
real state and honest unavailable states; synthetic Mock counts are reference
data, not values to copy into the Vault.

## Source of truth

1. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/continuation-handoff.md`
2. `docs/superpowers/specs/2026-08-15-vault-scan-follow-up-and-work-queue-contract.md`
3. `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html`
4. the 2026-08-13 final design package for details not superseded above

## Confirmed root causes

1. `VaultIntelligenceWorkspace.tsx` imports the Tailwind/shadcn Button, whose
   DOM does not contain `.pk-btn`. Most Vault Intelligence geometry selectors
   require `.pk-btn`, so they never match in production.
2. After the missing class was restored, the shared Tailwind primitive still
   emitted `display: inline-flex !important`. That overrode ordinary
   `display: grid` declarations and collapsed inventory cards and work rows
   into a different layout model.
3. The previous "production parity defense" was inserted thousands of lines
   before the base Vault Intelligence block. Later rules override its
   non-important width, padding and layout corrections.
4. Contract tests grep CSS and source strings but never render the component.
   They proved that dead selectors existed, not that the real DOM matched them
   or that computed geometry survived Obsidian's reset.
5. Several production screens preserve only the information architecture, not
   the final layout. Activity is a generic heatmap instead of a recorded-source
   timeline with period/session context; Vault contents lacks the summary and
   dense type table; Overview puts the primary work list beside secondary
   cards; maintenance review is a generic full-page choice grid instead of the
   domain review workspace.
6. The supplied recording has an empty real queue while the Mock uses
   exhaustive synthetic review data. Row density cannot be compared across
   those states, but shell geometry, controls, empty-state hierarchy and the
   other populated screens remain directly diagnosable.
7. Main-route transitions preserved `.pk-vi-main.scrollTop`. Starting a Scan
   from the bottom of Setup therefore opened Run progress in the middle of its
   operations table, hiding the title, progress summary and stage rail.

## Mock to production map

| Mock role | Production contract |
| --- | --- |
| header action | shadcn Button with a Vault Intelligence skin that owns all fixed geometry |
| top and local tabs | underline navigation; never a filled host-blue button |
| inventory card | full-width hit target with explicit 78px geometry and visible surface border |
| filter option | compact segmented/filter treatment with subtle selected fill |
| task row | dedicated semantic row; no generic CTA padding or host button fill |
| graph canvas | shared `AtlasGraphCanvas`, with loading/empty state and context below |
| maintenance review | centered task workspace for Completed; domain projections and canonical choices |

## Implementation tracks

### P0 Rendered contract

- Add a real Vault Intelligence harness using the production React tree.
- Seed both populated and empty snapshots.
- Assert DOM classes, computed tab/card/task geometry and normal/narrow layouts.
- Capture route screenshots; source-regex tests remain secondary.
- Assert every primary route starts at scroll offset zero so a correct page is
  not presented from the wrong visual anchor.

### P1 CSS and primitive repair

- Give every Vault Intelligence button role a selector that matches the actual
  DOM; do not depend on a missing `.pk-btn` class.
- Consolidate the Vault Intelligence stylesheet in one final source-order
  block and remove the earlier override island.
- Explicitly defend width, height, min/max dimensions, padding, background,
  border and states with scoped `!important` only where the host reset requires
  it.
- Restore the light-gray workspace canvas, visible card surfaces, underline
  tabs, readable typography and Mock density.

### P2 Global screens

- Overview: inventory row, full-width Continue work and change ribbon, then
  secondary Index, priority, change and activity surfaces.
- Vault contents: contextual title/actions, readiness summary, pie plus dense
  two-column file-type rows, graph and below-graph context.
- Activity: recorded-source timeline, deterministic date grouping and work
  sessions when evidence exists, period summary, explicit coverage gaps and
  disabled AI themes when no routed analysis exists.
- Work queue: final filters, guidance capability state, dense rows, and a
  designed empty state without fake tasks.

### P3 Scan route

- Scan setup: safe-scan hero, scope cards, four check groups, Index/AI plan and
  estimate in the confirmed hierarchy.
- Run progress: overall and Index progress, four-stage rail, current work,
  usage, stop/resume and retained partial state.
- Completed: compact run/automatic-update disclosures followed immediately by
  this-run owner work.

### P4 Maintenance review

- Replace the one-size-fits-all visual grammar with domain presentation.
- Preserve one canonical decision set across projections and keep
  `owner choice > current suggestion > history/evidence` visible.
- Do not invent Apply: file-changing outcomes remain guarded review decisions
  until a real proposal writer, diff carrier, receipt and recheck exist.

## Verification and stop rule

1. Focused model/runtime/source tests.
2. Rendered normal and narrow harness: screenshots plus computed geometry.
3. Production build and bundle selector/class checks.
4. Real Obsidian CDP: plugin-only reload, DOM/computed geometry and final
   screenshots when a listener is available.
5. If CDP is unavailable, report `INTERACTION NOT VERIFIED`; harness results do
   not become host acceptance.

The correction is not complete if only the missing `.pk-btn` match is repaired
or if only Overview looks closer. Every reachable route must have an intentional
layout and the rendered contract must fail on the original production code.
