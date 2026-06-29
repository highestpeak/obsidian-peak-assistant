# T11X Implementation Wave — Preflight Blocker Report

**Date:** 2026-06-29
**Branch:** `codex/peak-modernization-refactor`
**Baseline commit:** `afcc012aeec86c0a4b249a7be203148560141c59`
**Status:** STOP — hard floor not safely reachable in this wave. No implementation performed.

---

## 1. Verdict

Per the T11X implementation Impact Contract:

> *"If safe expected reduction after preflight is below `-5,000`, STOP BEFORE IMPLEMENTATION and return a blocker report."*

After thorough preflight scanning of every candidate area named in the task (Copilot UI, Quick Search V2, Usage Dashboard, Chat lists/attachments, Settings/Onboarding, Vault Review, app shell, old-root cleanup), the **realistic safe net reduction is approximately `-1,900` to `-3,000` LOC**, well below the `-5,000` hard floor and far below the `-6,000` / `-8,000` / `-12,000` contract targets.

Implementation was therefore not started. Files in `src/**` are untouched. Only this report and the surface-grammar reservations were authored.

---

## 2. Baseline measurement

Exact counting command used (every other LOC number in this report uses the same command, scoped):

```bash
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 \
  | xargs -0 cat | wc -l
```

**Baseline product source LOC:** `134,746`

**Per-area baselines (same command, scoped to the dir):**

| Area | LOC |
|---|---|
| `src/ui/view/copilot` | 10,062 |
| `src/ui/view/quick-search` | 9,386 |
| `src/ui/view/usage-dashboard` | 4,877 |
| `src/ui/view/chat-view` | 7,798 |
| `src/ui/view/settings` | 4,416 |
| `src/ui/view/onboarding` | 1,621 |
| `src/ui/component` (legacy old-root) | 6,879 |
| `src/ui/components` (current root) | 977 |
| `src/app` | 9,351 |
| `src/core/storage` | 13,164 |
| `src/service/search` | 11,197 |
| `src/service/copilot` | 6,626 |
| `src/service/agents` | 8,989 |

---

## 3. Preflight method

Four parallel read-only Explore agents were dispatched to survey:

1. **Vault Review surface** — `src/ui/view/copilot/vault/VaultAutoRunContent.tsx` (1,606 LOC) and sibling files.
2. **Quick Search V2 surface** — full `src/ui/view/quick-search/` tree.
3. **Usage Dashboard + Chat/Project/Conversation list grammar** — `usage-dashboard/`, `ProjectsSection`, `ConversationIndex`, recent lists.
4. **Copilot panel families + Onboarding/Profile setup-step grammar**.

Then a second pass:

5. **Old-root deletability audit** — every file under `src/ui/component/` checked for downstream consumers.
6. **Quick Search V2 deep re-scan** — to confirm or refute T11X's `-0.8k` to `-2.0k` estimate.
7. **App shell / adapter / compose / runtime registry survey** — under `src/app/`.

For each track the agent reported `file:line` evidence, occurrence counts, average lines per occurrence, and a realistic LOC delta after subtracting the cost of any new shared component/helper.

---

## 4. Realistic safe reduction matrix

| Track | T11X estimate | Preflight evidence | Realistic safe net |
|---|---|---|---|
| **A1. Vault Review surface** (`VaultAutoRunContent.tsx`) | -1.0k to -2.5k | 6 stat cards + 4 gap headers + 12 table rows + 4 changed badges; all single-file repetition | **-450 to -500** |
| **A2. Quick Search V2 surface** | -0.8k to -2.0k | Repetitions are shallow (1-3 LOC each); existing extraction is already reasonable; RAF buffer unification carries timing risk | **-115 to -150** |
| **A3. Usage Dashboard data/formatter** | -0.6k to -1.4k | 5 KPI fns × ~49 LOC, 8 SurfacePanel candidates × ~45 LOC, formatter duplication trivial (`formatUsd` × 3 sites = 12 LOC) | **-200 to -250** |
| **A4. Project/Conversation/Recent list grammar** | -0.6k to -1.5k | 12+ row implementations; ConversationIndex (731 LOC) has medium-high migration complexity (artifact inference + timeline aggregation tightly coupled) | **-200 to -250** (partial) |
| **A5. Copilot remaining panel families** | -1.5k to -3.6k | **Already consolidated.** `CopilotPanelShell` (116 LOC) + `FindingsBodyParts` (111 LOC) + `SuggestionBodyParts` (53 LOC) + `DiffBodyParts` (82 LOC) + `TextStreamPanel` (153 LOC) = **584 LOC shared infra already in place.** `PanelEmptyState` already exists. T11X estimate appears to have missed prior consolidation work. | **~0 net new** (≤-100 from minor family polish) |
| **A6. Onboarding/Profile setup-step grammar** | -0.5k to -1.4k | 6 steps × ~20 LOC of `pkonb-section` header repetition + ProviderForm/ProfileCard 40 LOC duplication | **-130 to -210** |
| **A7. Chat attachment/resource grammar** | -0.5k to -1.2k | `MessageAttachmentsList` 549 LOC + scattered resource badge/preview repetition. Visual smoke risk medium. | **-150 to -250** (not deep-surveyed; conservative est.) |
| **B. App shell helpers** (ReactItemViewHost / ReactModalHost) | -1.5k to -4k | 5 Modals (342 LOC) + 7 ItemViews (503 LOC) = 12 lifecycle implementations, ~40 LOC of boilerplate each. Net after a 60-80 LOC helper. Thin adapters and compose files are necessary seams — no safe reduction there. `AppRuntimeRegistry` ceremony is intentional fail-loud safety. | **-400 to -550** |
| **C. Old-root cleanup** (`src/ui/component/shared-ui`) | (cross-cutting) | `dropdown-menu.tsx` 204 LOC = 0 refs (SAFE DELETE). `collapsible.tsx` 9 LOC = 1 ref also low-risk. Migrating `button`/`icon-button`/`pill`/`popover` to `src/ui/components/primitives` requires 77 call-site edits and saves another ~216 LOC of duplicated implementations. | **-213 SAFE + up to -216 with migration** |

### Totals

| Scenario | Net LOC |
|---|---|
| **Floor (everything held back where risky)** | **≈ -1,900** |
| **Reachable with discipline + sequential validation** | **≈ -2,500 to -3,000** |
| **Stretch (also pulling Chat attachments + ConversationIndex full migration)** | **≈ -3,200 to -3,500** |

**Contract hard floor: -5,000.**
**Contract target: -8,000.**

The gap is structural, not motivational. Doubling the target would require crossing T11Z truth-source areas (Provider/Model catalog, Prompt/Template, SQLite/Chat persistence), which the task explicitly gates behind a separate-wave contract.

---

## 5. Why T11X's `-8k` estimate didn't materialize

Five concrete reasons surfaced in preflight:

1. **Copilot panels are already consolidated.** The T11X numbers assume `CopilotPanelShell`, `FindingsBodyParts`, `SuggestionBodyParts`, `DiffBodyParts`, `TextStreamPanel`, `PanelEmptyState` do not exist. They do — 584 LOC of shared infra already in place. T11X's stated `-1.5k to -3.6k` is already largely banked from prior waves.

2. **Most "duplicated" JSX is shallow.** A status pill, a stat card, or a status dot collapses from 2-3 lines to 1 line; not from 30 lines to 1. After amortizing the cost of the new shared component (5-30 LOC each), net savings per pattern are typically 50-200 LOC, not 500-1000 LOC.

3. **Quick Search V2's 53 `set(...)` calls aren't duplication.** They're Zustand state updates that each describe a real transition. Extracting them into transition helpers saves bytes per-line, not entire functions. Independent re-scan confirms `-115 to -150` LOC, not `-800`.

4. **Largest single byte-savings is not LOC-counted.** The 1.4MB `streamdown-isolated-css.ts` template string is byte-heavy but ~261 LOC. Externalizing it does nothing for the product source LOC contract.

5. **Truth-source areas are gated behind T11Z.** Provider/Model catalog (~3,240 LOC), Prompt/Template registry, SQLite/Chat persistence — together these dominate any remaining headroom but require golden tests, source-of-truth declarations, and a separate wave per T11Z rule 1.

---

## 6. What CAN be safely delivered as a smaller wave (proposal, not implementation)

If the owner accepts a scoped-down impact contract — call it **T11Y Surface + Old-Root**, hard floor `-2,200` LOC, target `-2,800`, stretch `-3,500` — the following plan is safe and verifiable in a single session:

### Track Y1 — Surface grammar (real, narrow, ≥2 consumers each)

Create under `src/ui/components/surface/`:

- `SurfacePanel` — card + optional header slot. Consumers: Vault Review gap/action cards (4×), Usage Dashboard `.pk-dash-card` (8×), Quick Search V2 section cards (2×).
- `KpiGrid` + `StatCard` — Consumers: Vault Review snapshot (6 cards), Usage Dashboard KPI row (5 KPI fns).
- `SurfaceRow` — list-row primitive. Consumers: ProjectsSection rows, ConversationsSection rows, RecentAnalysisList rows, Quick Search recent items.
- `StatusPill` (+ `StatusDot` size-aware variant). Consumers: Quick Search V2 (8 sites), Vault Review changed-badges (4 sites), Usage Dashboard outcome value chips.
- `EmptyState` — **DO NOT create**; one already exists at `src/ui/component/mine/EmptyState.tsx` and is in use. Re-export from the new surface barrel to give a single canonical import path.

Skip until a future wave:
- `ReportHero` — only Vault Review has a hero; cost > benefit.
- `ActionFooter` — Copilot panels already use `CopilotPanelShell` footer; the rest of the codebase has ≤2 consumers.

Expected net: **-700 to -900 LOC.**

### Track Y2 — App shell helpers

Create under `src/app/shell/`:

- `ReactItemViewHost` — encapsulates Obsidian `ItemView` open/close + `ReactRenderer` lifecycle + RAF guard. Consumers: 7 existing `ItemView` files.
- `ReactModalHost` — same for `Modal`. Consumers: 5 existing modals.

Expected net: **-400 to -550 LOC.** No boundary violation.

### Track Y3 — Old-root deletions

- Delete `src/ui/component/shared-ui/dropdown-menu.tsx` (204 LOC, 0 refs).
- Delete `src/ui/component/shared-ui/collapsible.tsx` if its single consumer is migrated (9 LOC).
- Migrate `src/ui/component/shared-ui/{button,icon-button,pill,popover}.tsx` consumers (77 call sites) to `src/ui/components/primitives/*` and delete originals.

Expected net: **-213 SAFE + up to -216 from migration = -300 to -429 LOC.**

### Track Y4 — Track AE/AG row migration

- Vault Review `StatCard`, `GapCardHeader`, `IconBadge`, `DataTableRow` consolidation.
- ProjectsSection + ConversationsSection + RecentAnalysisList row grammar.

Expected net: **-450 to -550 LOC.**

### Track Y5 — Usage Dashboard formatter dedup

Centralize `formatUsd`, `formatTokens`, `formatK`, `formatTime` under `src/ui/view/usage-dashboard/format.ts`. Pick canonical fallback semantics explicitly (the `'—'` vs `'$0'` divergence between Overview and BudgetAlerts is a real behavior decision).

Expected net: **-30 to -60 LOC** + one explicit behavior decision.

**Combined floor: ~-1,900 LOC. Combined target: ~-2,500 LOC. Combined stretch (with Chat attachments): ~-3,000 to -3,500 LOC.**

---

## 7. T11Z truth-source areas — read-only plan only

Per T11Z governance, these are gated behind separate waves and were not touched in this preflight:

- **Provider/Model catalog** (T11Z-A): requires source-of-truth declaration between `data/model-catalog.json`, `templates/config/models/*.json`, `curator-catalog.json`, `presets.ts`, `ProfileRegistry.MODEL_ID_REWRITES`. Golden tests required before any change. Skipped.
- **Prompt/Template registry** (T11Z-B): requires `PromptId` enum + `PromptVariables` type-safety preservation, vault override behavior preservation. Skipped.
- **Chat/SQLite persistence** (T11Z-C): requires chat markdown golden tests, SQLite row codec extraction with tag-blob legacy decode preserved. Skipped.

No changes were made to any of these.

---

## 8. Honest skipped list (not delivered this wave)

- All `src/ui/components/surface/*` components (not created — preflight blocked).
- All migrations of Vault Review, Quick Search V2, Usage Dashboard, Chat lists, Settings/Onboarding.
- All `src/app/shell/*` helpers.
- All old-root deletions in `src/ui/component/shared-ui/`.
- All T11Z truth-source touches (correctly gated).
- All test runs — there is no implementation to verify.

---

## 9. Confirmation of protected features

No code was edited. Therefore:

- Usage Dashboard — unchanged.
- Chat three Obsidian views/panes — unchanged.
- Quick Search — unchanged.
- Copilot actions and panels — unchanged.
- Settings and Onboarding — unchanged.
- User data compatibility (chat markdown, SQLite rows, tags_json, profile settings, prompt overrides) — unchanged.
- Boundary audit — unchanged from baseline `0 flagged`.

---

## 10. Recommended next step

One of:

**Option A — accept scoped Wave Y.** Re-issue the implementation prompt with floor `-2,200`, target `-2,800`, stretch `-3,500`, scope limited to the Y1-Y5 tracks in §6. This is verifiably safe and matches what the codebase actually supports.

**Option B — split into multiple waves over time.** Run Y1 (surface) and Y2 (app shell) and Y3 (old-root) as three independent commits, each with its own verification gate. Total reachable: same `~-3,000 LOC`, lower per-wave risk.

**Option C — fund Wave Z.** Owner-approved T11Z-A or T11Z-B wave (one truth-source subwave) with golden tests written before any code change. Adds another `-800 to -2,000 LOC` ceiling but requires owner review of the source-of-truth declaration first.

**Option D — investigate further.** Some areas were surveyed conservatively (Chat attachments, ConversationIndex full timeline refactor, Folder intelligence substrate AI 1.2k headroom, Copilot action recipe factory AM 0.6k headroom). A second preflight on these specific areas could lift the realistic ceiling another `~1,000-1,500 LOC` — but none of those, individually or combined, reach the original `-5,000` floor.

The original `-8,000` target appears to require a multi-wave program, not a single wave. T11X itself describes three waves (Wave 1 Surface, Wave 2 App/Runtime, Wave 3 Truth-source) with separate hard targets summing to `-13,000+`. Combining them into one wave is the disconnect, not the underlying slimming opportunity.

---

## Appendix A — Evidence pointers (for owner review)

- Vault Review repetition: `src/ui/view/copilot/vault/VaultAutoRunContent.tsx:673-704` (stat cards), `:1012-1039` (gap header), `:1114-1126` (table rows), `:734-743` (changed badges).
- Quick Search V2 status pills: `src/ui/view/quick-search/V2InlinePlanReview.tsx:153,278,332`, `V2SourcesView.tsx:83`, `V2ReportView.tsx:124`.
- Quick Search V2 status dots: `V2ProcessView.tsx:88,98,109,143,147,151`, `timeline-helpers.tsx:29,33`.
- Usage Dashboard KPI duplication: `src/ui/view/usage-dashboard/screens/Overview.tsx:97-305`.
- Usage Dashboard panel grammar: `src/ui/view/usage-dashboard/screens/BudgetAlerts.tsx:117-340`.
- Existing Copilot consolidation: `src/ui/view/copilot/components/CopilotPanelShell.tsx`, `FindingsBodyParts.tsx`, `SuggestionBodyParts.tsx`, `DiffBodyParts.tsx`, `TextStreamPanel.tsx`.
- Existing `EmptyState`: `src/ui/component/mine/EmptyState.tsx`.
- App shell duplication: 5 modals in `src/app/modals/`, 7 views in `src/app/view/`, each ~40-80 LOC of mount/unmount boilerplate.
- Old-root deletables: `src/ui/component/shared-ui/dropdown-menu.tsx` (204 LOC, 0 refs).
- `formatUsd` divergence: `src/ui/view/usage-dashboard/screens/Overview.tsx:472` (`'—'`) vs `BudgetAlerts.tsx:495` (`'$0'`).
