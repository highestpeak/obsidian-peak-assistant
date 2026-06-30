# T11X-C Authorized Consolidation Wave — Preflight STOP

> **Status:** Halted at preflight gate. Safe expected reduction across the six authorized tracks is approximately **-515 LOC (conservative)** to **-835 LOC (target)**, well below the **-2,000 STOP threshold** stated in the owner's Impact Contract.
>
> Per the owner's gate: *"If safe expected reduction is below -2,000 after preflight, STOP. Do not implement another -500 cleanup and call it a wave."* — this wave is not executed.

## Owner Impact Contract (recap)

- Hard floor for a valid wave: **-2,500** product TS/TSX LOC
- Target: -4,000
- Stretch: -5,500
- STOP threshold: -2,000

Baseline measured: **134,222** product TS/TSX LOC (excludes `*.test.ts(x)`).

## Why the six tracks cannot reach the floor safely

### Track 1 — Migrate/delete `src/ui/component/shared-ui`

Total `shared-ui` LOC: **838** across 11 files. There is no barrel `index.ts`; every consumer imports the leaf module directly.

| File | LOC | Primitive equivalent | Consumers | Safe to delete this wave? |
|---|---|---|---|---|
| `button.tsx` | 54 | `primitives/Button` (variant/size mismatch) | **60** | Migration possible but +churn at 60 sites — risk of variant regressions. Net product LOC change ≈ 0 to -54 |
| `InputModal.tsx` | 91 | `primitives/Modal` (compound) | 3 | Yes, but inlining a `Modal + form` triplet at each site likely adds ~30 LOC per site (≈ +30 net). |
| `hover-card.tsx` | 26 | none (would create new primitive) | 2 | Yes (delete + new primitive ≈ neutral). |
| `icon-button.tsx` | 86 | `primitives/IconButton` (semantic + size differences) | 4 | Yes, net -50 to -70. |
| `input.tsx` | 24 | `primitives/FormRow.Input` or raw `<input>` | 7 | Yes, net -20. |
| `number-input.tsx` | 198 | none (validation + async confirm + animation) | 1 | Rebuild risk; keep for now. |
| `pill.tsx` | 40 | `primitives/Pill` (8 variants → 1; span vs button) | 3 (+1 internal in tabs.tsx) | Yes if owner accepts visual reduction, net -30. |
| `popover.tsx` | 36 | `primitives/PopoverContent` (minor align default diff) | 1 | Yes, net -30. |
| `switch.tsx` | 81 | none | 3 | Rebuild as new primitive ≈ neutral; keep this wave. |
| `tabs.tsx` | 170 | none (segmented ≠ tabs; two variants + count badges + subtitles not in primitives) | 2 | Rebuild required; high risk; keep this wave. |
| `tooltip.tsx` | 32 | none | 2 | Rebuild ≈ neutral; keep this wave. |

**Safely deletable this wave (without rebuild risk):** `button.tsx`, `InputModal.tsx`, `icon-button.tsx`, `input.tsx`, `pill.tsx`, `popover.tsx`, `hover-card.tsx`. Sum: **361 LOC** in raw deletes, minus consumer-site growth (Button at 60 sites, InputModal inlining, IconButton aria-label requirements).

**Realistic net for Track 1: -200 to -350 LOC.** Bigger numbers would require rebuilding `Switch / Tabs / Tooltip / NumberInput / HoverCard` as new primitives this wave — which the owner has not authorized and which carries direct regression risk on settings, vault-lint, copilot vault, and prompt input.

### Track 2 — Land surface grammar (SurfacePanel / StatCard / KpiGrid / StatusPill / StatusDot / SurfaceRow)

The audit confirmed all four meet the ≥2-consumer bar. But surface grammar files themselves **add** code (~60-90 LOC total). The reduction shows up indirectly in tracks 3 and 4, not in this track.

**Net Track 2 in isolation: +60 LOC.**

### Track 3 — VaultAutoRunContent reduction

File is **1,601 LOC** but already well-factored. Audit found at most ~110 LOC of compressible duplication (table headers shared between DanglingRefs/StaleHubs, inlined ClusterDetailCard, info-card pattern, detail-info grids, SourcePreview extraction). The 6 tabs render unique content and must stay.

**Net Track 3: -70 (conservative) / -110 (target).**

### Track 4 — Usage Dashboard reduction

Total dashboard LOC: **3,119** across 6 screens + components. Audit found:
- 4 duplicated `formatUsd`, 3 `formatTokens`, 6+ inline `formatPercent` → ~45 LOC removable via shared helpers.
- Inline KPI / panel / pill patterns → ~200 LOC removable across screens via surface grammar consumption.
- Money fallback policy (`"—"` for missing/invalid, `"$0"` only for real zero) must be applied to: `BudgetAlerts.tsx`, `InlineReceipt.tsx`, `Optimization.tsx`, `ProviderModel.tsx`, `History.tsx`, `RecommendationBlock.tsx`, `ScenarioRadio.tsx`.

**Net Track 4: -155 (conservative) / -220 (target).**

### Track 5 — App shell completion

- `AmbientPushView` (67 LOC) — clean migration to `ReactItemViewHost` saves ~28 LOC but requires async-render support in the host.
- `VaultXRayView` (46 LOC) — same async blocker, saves ~28 LOC.
- `QuickSearchModal` (73 LOC) — migration to `ReactModalHost` saves ~25 LOC with a new `onClose` hook option; no async blocker.

Host extensions cost ~15-30 LOC.

**Net Track 5: -50 to -65 LOC.**

### Track 6 — Provider/Model truth-source (T11Z-A)

The largest cleanup opportunity is removing `templates/config/models/*.json` (~200 lines). But those are `.json` data files, not TS/TSX — they do not count against the product TS/TSX floor.

The golden tests required first (per owner's directive) add `~250` LOC of test code — also outside the product TS/TSX scope.

Preset/default consolidation in `presets.ts` and `settingsTypes.ts` would save another ~150 LOC but the audit flagged this as **CRITICAL risk** without explicit invariant tests, because:
- Removing preset defaults assigns empty strings to new profiles.
- `chat default ≠ search default ≠ profile preset` invariants are unenforced.
- Curator catalog must stay in sync; no automated check exists.

**Net Track 6 (TS/TSX, this wave): 0.** Golden tests can land as preparation, but the product TS/TSX delta is ≈ 0 until a follow-up wave applies the consolidation behind those tests.

## Aggregate

| Track | Conservative | Target |
|---|---|---|
| 1. shared-ui | -300 | -500 |
| 2. surface grammar | +60 | +60 |
| 3. VaultAutoRunContent | -70 | -110 |
| 4. Usage Dashboard | -155 | -220 |
| 5. App shell | -50 | -65 |
| 6. Provider/Model | 0 | 0 |
| **Total** | **-515** | **-835** |

Both conservative and target are below the **-2,000 STOP threshold**, and far below the **-2,500 hard floor** for a valid wave.

## What this means

The six tracks as authorized are mostly *quality* work (consistency, primitive consolidation, formatter unification, host adoption), not *bulk* work. The codebase is not 2,500-LOC wasteful in these areas. T11X-B was correctly rejected as too small; T11X-C, as scoped, would land in the same range and the owner has explicitly said not to do that.

## Options for the owner

These are non-overlapping ways forward. Each is a deliberate scope choice for the owner — none of them are the "more aggressive try" that the gate forbids.

1. **Expand authorized track list.** Areas the preflight did *not* audit and which historically carry duplication / dead code:
   - Service-layer module consolidation (agent harness, chat orchestrator, search service helpers).
   - Settings UI — the v2 dashboard work consolidated screens; remnants likely remain.
   - Prompt-input split between `src/ui/component/prompt-input/*` and chat-view streaming hooks.
   - Legacy `view-Home`, `view-ProjectOverview` and supporting helpers.
   - Onboarding wizard remnants now that the v2 wizard is shipped.
   - Dead exports / unused files (would require an `ts-prune` pass or similar; owner has not authorized adding tools).
   A focused dead-code + service-layer audit would likely add another -1,000 to -2,500 LOC and bring the wave inside the hard floor. **Recommend authorizing this audit pass next.**

2. **Restate the wave as quality, not bulk.** Drop the -2,500 hard floor for T11X-C, ship the six tracks as a quality wave (-500 to -835 LOC + visual normalization + golden test prep + surface grammar landing), and reserve the next wave for the bulk reductions in option 1.

3. **Park T11X-C entirely.** The owner's gate language ("Do not implement another -500 cleanup and call it a wave") implies this is acceptable. Resume when a track that obviously hits the floor is identified.

## What was NOT changed

No code was modified. The four planning tasks remain in the task list; the execution task is blocked behind owner direction.

## Files / data captured during preflight

- `src/ui/component/shared-ui/` — 11 files, 838 LOC, consumer map complete (button: 60 consumers, others ≤7).
- `src/ui/components/primitives/` — 12 files, audited for API parity against shared-ui.
- `src/ui/components/surface/` — currently only `EmptyState.tsx` and `index.ts`. Four new components meet the ≥2-consumer bar (verdict: LAND if/when wave proceeds).
- `src/ui/view/copilot/vault/VaultAutoRunContent.tsx` — 1,601 LOC, 6 tabs, 18 helpers; max ~110 safe LOC removable.
- Usage Dashboard — 6 screens, 3,119 LOC, formatter + grammar consolidation opportunities mapped per-file.
- `src/app/shell/ReactItemViewHost.ts` and `ReactModalHost.ts` — 82 + 75 LOC; extensions needed: async render and onClose hook.
- Provider/Model — 7 duplication sites mapped; 5 golden tests listed; consolidation is the right *next* wave, not this one.

This preflight is reusable as input for any successor plan.
