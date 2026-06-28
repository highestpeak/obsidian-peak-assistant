# T11U Code Slimming Target Wave Handoff

> Owner intent: T11T barely passed the primary line (-2,523 LOC). T11U must be larger. Preserve product capability, but be much more aggressive about consolidation, repeated UI shells, legacy compatibility surfaces, shared component ownership, and half-wired UI.

## 0. Owner Summary

Give this file to Claude Code as one prompt.

This is not a tiny cleanup prompt. Claude should scan the listed large pools, build an internal DAG, and execute every safe/medium-safe track in one session.

Current baseline after T11T:

```text
cloc src styles.css --quiet --json --timeout 120
SUM code LOC: 113,015
Boundary audit: 0 findings
```

Large pools currently visible:

| Area | Current size signal | Why it matters |
|---|---:|---|
| `src/ui/view/quick-search/**` | ~9,390 physical lines | Largest UI feature cluster; many V2 report/session/timeline shapes. |
| `src/ui/view/chat-view/**` | ~8,032 physical lines | Protected feature, but still has coming-soon / repeated message chrome. |
| `src/ui/component/**` + `src/ui/components/**` | ~7,922 physical lines | Split ownership: `component` vs `components`, shared-ui vs primitives. |
| `src/ui/view/settings/**` | ~5,776 physical lines | Large tabs, repeated settings section/row/card shapes. |
| `src/ui/view/usage-dashboard/**` | ~5,178 physical lines | Large screens and chart/card primitives; preserve feature. |
| `src/ui/view/copilot/panels/**` | ~3,317 physical lines | T11T shell exists; remaining panels can keep shrinking. |

Expected style of Claude's final note:

- Chinese-first.
- Start with: did T11U meet the Impact Contract?
- Include before/after `cloc src styles.css` table.
- Include per-track LOC delta, not just git stat.
- Include changed files grouped by track.
- Include code reading guide for the owner.
- Include diagrams for the new dependency/module shape.
- Include protected features verified.
- Include skipped candidates with evidence.
- Include verification commands and results.

## 1. Copyable Prompt For Claude Code

Paste everything below to Claude Code.

```text
You are implementing T11U Code Slimming Target Wave for Obsidian Peak Assistant.

Repository:
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

Context:
- T11R closed boundary audit to 0 findings.
- T11T delivered a real but barely-passing code slimming wave:
  - product LOC: 115,538 -> 113,015 (-2,523)
  - boundary audit stayed 0
  - commit: 5bd84cb4 refactor(t11t): code slimming major wave — -2,523 LOC
- T11T created useful substrate:
  - `CopilotPanelShell`
  - `DiffBodyParts`
  - `FindingsBodyParts`
  - `SuggestionBodyParts`
  - retired ContextBuilder fallback
  - retired several unused T11R adapters/ports
  - moved diff primitives to `src/ui/components/shared/diff`
- T11U must be larger. Do not come back with another ~2.5k LOC wave unless a hard blocker proves larger slimming would delete protected features.

Owner goal:
- Reduce product code volume while preserving product capability.
- Do not delete important features for LOC.
- Reduce size through reusable shells, shared abstractions, compatibility-path retirement, fake/half-wired UI cleanup, and directory ownership cleanup.
- The owner wants fewer back-and-forth prompts. Build an internal DAG and complete all safe work from one prompt.

Impact Contract:
- Current baseline: `cloc src styles.css --quiet --json --timeout 120` => SUM code LOC 113,015.
- Hard minimum: product code LOC net reduction >= 4,000.
- Target: product code LOC net reduction >= 7,000.
- Stretch: product code LOC net reduction >= 10,000 if safe.
- Product code LOC means `cloc src styles.css`, not tests/docs.
- Test/docs/package cleanup must be reported separately and cannot count toward product LOC.
- If final product LOC reduction is < 4,000, you must label the result "partial progress, not T11U accepted" and explain which candidate pools were blocked with evidence.
- Do not weaken boundary scanner or existing regression guards to pass.

Required tracks:
1. Copilot panel second-pass consolidation.
2. Settings shell consolidation.
3. Usage Dashboard shell consolidation.
4. Quick Search V2/session/report consolidation.
5. Shared UI ownership cleanup (`component` vs `components`).
6. Stub / fake / half-wired surface cleanup.
7. Source guards + verification.

Protected scope:
- Do NOT remove Usage Dashboard.
- Do NOT collapse Chat into Chat Studio only. Keep the three Obsidian views: ChatView, ProjectListView, ConversationOutlineView.
- Do NOT remove Vault X-Ray unless owner explicitly approves product deletion.
- Do NOT remove Copilot actions or change action ids.
- Do NOT remove Quick Search AI Graph or Vault Analysis paths.
- Do NOT remove core search/index/agent capability.
- Do NOT remove Harness / Command Gateway substrate.
- Do NOT change SQLite schema semantics without fixture/snapshot evidence.
- Do NOT introduce ui -> app, service -> ui, service -> app, core -> upstream, or service/core -> obsidian imports.
- Do NOT create a god component, god hook, EverythingPort, AppPort, HostServices, RuntimeBag, or raw app/plugin bag.
- Do NOT mechanically merge two design systems just because both have Button/Pill. Preserve visual behavior.
- Do NOT edit Codex investigation HTML reports.

Preflight phase, bounded:
Before editing code, spend at most 30 minutes producing a concise candidate matrix in your own response/log:
- Track
- Candidate files
- Current physical lines
- Expected product LOC delta
- Risk
- Verification command
- Skip rule

Then continue implementation in the same session unless a hard blocker appears.

Hard blockers:
- The expected product LOC delta cannot plausibly reach 4,000 without deleting protected features.
- A required track conflicts with protected scope.
- Current worktree has user changes in the same files that make safe editing impossible.

If hard-blocked, stop with a read-only blocker report. Otherwise implement.

Track 1 — Copilot panel second-pass consolidation

Starting point:
- `src/ui/view/copilot/components/CopilotPanelShell.tsx`
- `src/ui/view/copilot/components/DiffBodyParts.tsx`
- `src/ui/view/copilot/components/FindingsBodyParts.tsx`
- `src/ui/view/copilot/components/SuggestionBodyParts.tsx`
- `src/ui/view/copilot/panels/**`

Current panel pool is still ~3,317 physical lines.

Required outcome:
- Consolidate at least 8 additional panels or prove with evidence why fewer are safe.
- Net product LOC reduction from Copilot area should be >= 600, target >= 1,000.
- Do not change action ids, panel bindings, apply/copy/open/dismiss behavior, or user-visible action labels unless needed to remove fake UI.

Priority candidates:
- Task/checklist family:
  - `CheckTaskListPanel.tsx`
  - `ExtractTodosPanel.tsx`
  - `FindAndSolveTasksPanel.tsx`
  - Consider `TaskBodyParts` / `ChecklistBodyParts`.
- Split/planning family:
  - `SplitPanel.tsx`
  - `WritingPlanPanel.tsx`
  - Consider a small `PlanStepsBody` helper if it removes real duplication.
- Vault health / tabbed findings:
  - `VaultHealthPanel.tsx`
  - Add `TabbedPanelShell` only if it is narrow and has a second real consumer.
- Large residual panels:
  - `TagSuggestionPanel.tsx`
  - `ReviewPanel.tsx`
  - `CorrectContentPanel.tsx`
  - `SmartConnectionsPanel.tsx`
  - Re-check T11T wrappers that remain >120 LOC and reduce them if repeated body parts exist.

Rules:
- Thin wrapper owns domain mapping and callbacks.
- Shared parts own repeated chrome/list/card/tab/empty/action shapes.
- If a new shared helper has more nullable props than real consumers, do not introduce it.
- Add/keep tests that verify every built-in action has icon + result panel binding.

Track 2 — Settings shell consolidation

Starting point:
- `src/ui/view/settings/tabs/KnowledgeIndexTab.tsx` (~1,201 lines)
- `src/ui/view/settings/tabs/AdvancedTab.tsx` (~496)
- `src/ui/view/settings/tabs/OverviewTab.tsx` (~498)
- `src/ui/view/settings/tabs/AISetupTab.tsx` (~379)
- `src/ui/view/settings/ProfilesTab.tsx` (~328)
- `src/ui/view/settings/settingsStrings.ts` (~692)
- `src/ui/view/settings/components/**`

Required outcome:
- Net product LOC reduction from Settings area should be >= 900, target >= 1,500.
- Preserve settings behavior and all persisted settings.
- Do not redesign IA. This is structural consolidation, not product redesign.

Candidate abstractions:
- `SettingsSection`
- `SettingsCard`
- `SettingsActionRow`
- `SettingsToggleRow`
- `SettingsNumberRow`
- `SettingsTextareaRow`
- `SettingsPathRow`
- shared `SectionHeader` / `HelpText` / `StatusPill`

Specific cleanup:
- Remove or consolidate PR-D legacy stub copy in `settingsStrings.ts` only if scans prove no live surface reads it.
- Convert repeated section blocks in `KnowledgeIndexTab` first.
- Then apply the same narrow primitives to `AdvancedTab`, `OverviewTab`, `AISetupTab`.
- Keep feature-local components under `src/ui/view/settings/components`.

Verification:
- Build must pass.
- Add source/structural guard if a legacy settings string namespace or old section helper is retired.
- Report changed settings keys. If no settings key semantics changed, say so explicitly.

Track 3 — Usage Dashboard shell consolidation

Starting point:
- `src/ui/view/usage-dashboard/UsageDashboard.tsx` (~789)
- `src/ui/view/usage-dashboard/screens/BudgetAlerts.tsx` (~505)
- `src/ui/view/usage-dashboard/screens/Overview.tsx` (~482)
- `src/ui/view/usage-dashboard/screens/Optimization.tsx` (~298)
- `src/ui/view/usage-dashboard/screens/OutcomeValue.tsx` (~226)
- `src/ui/view/usage-dashboard/screens/ProviderModel.tsx` (~209)
- `src/ui/view/usage-dashboard/screens/History.tsx` (~170)
- `src/ui/view/usage-dashboard/components/charts/**`

Required outcome:
- Net product LOC reduction from Usage Dashboard area should be >= 700, target >= 1,200.
- Preserve all screens.
- Preserve Usage Dashboard as a feature.

Candidate abstractions:
- `DashboardShell`
- `DashboardScreen`
- `DashboardCard`
- `DashboardSection`
- `MetricGrid`
- `MetricCard`
- `EmptyStateBlock`
- shared formatters for cost/tokens/percent/provider labels

Specific cleanup:
- `ExplainerPanel.tsx` and `BrandAvatar.tsx` alias wrappers may be removed only if import scan proves no real need.
- `WhatWasThisAbout.tsx` still documents stubbed surfaces. Either make the surface mapping real or hide/remove fake affordances; do not leave console-only/fake buttons.
- `UsageDashboard.tsx` comment says screens render placeholders; fix or remove stale comments if the screens are real.

Verification:
- Preserve screen exports and navigation.
- Report every deleted dashboard component and why it was unused or replaced.

Track 4 — Quick Search V2/session/report consolidation

Starting point:
- `src/ui/view/quick-search/**` is ~9,390 physical lines.
- Large files:
  - `SearchModal.tsx` (~723)
  - `searchSessionStore.ts` (~772)
  - `useSearchSession.ts` (~460)
  - `V2ReportView.tsx` (~422)
  - `RecentAIAnalysis.tsx` (~359)
  - `V2InlinePlanReview.tsx` (~344)
  - `useVaultSearch.ts` (~337)
  - `V2Footer.tsx` (~291)
  - `tab-VaultSearch.tsx` (~267)
  - `ResultSaveDialog.tsx` (~236)
  - `save-ai-analyze-to-md.ts` (~235)

Required outcome:
- Net product LOC reduction from Quick Search area should be >= 900, target >= 1,800.
- Preserve Quick Search, Vault Analysis, AI Graph, saved analysis, background sessions, and report view.

Candidate consolidation:
- V2 report shell:
  - repeated status/header/footer/section chrome across `V2ReportView`, `V2RoundBlock`, `V2ProcessView`, `V2SourcesView`, `V2InlinePlanReview`.
- Session store split:
  - reduce large `searchSessionStore.ts` by extracting pure reducers/selectors only if it reduces duplication and improves readability.
  - Do not create a second source of truth.
- Recent analysis:
  - consolidate repeated card/list row handling in `RecentAIAnalysis`, `RecentAnalysisList`, `ResultSaveDialog`.
- Inspector placeholders:
  - `InspectorSidePanel.tsx` still says section contents are placeholders. Either wire real components if already available or remove stale placeholder comments/false affordances.
- Console/debug cleanup:
  - remove console-only UI interactions if they are not developer-only.

Rules:
- No feature deletion.
- No new UI -> app imports.
- No new raw app/plugin exposure.
- Prefer helper extraction only when it reduces real duplication. Do not add abstractions that increase LOC.

Track 5 — Shared UI ownership cleanup

Starting point:
- `src/ui/component/**` and `src/ui/components/**` are both active.
- Current physical line signal together is ~7,922.
- `src/ui/component` should shrink; `src/ui/components` should become the clearer home for shared primitives/shared feature-neutral components.

Required outcome:
- Net product LOC reduction from shared UI ownership should be >= 400, target >= 900.
- Complete at least two concrete ownership migrations or retirements.
- Add source guard for retired old import paths.

Candidate migrations:
- `src/ui/component/prompt-input/**`
  - Move to `src/ui/components/shared/prompt-input/**` if safe, or leave in place if it is still effectively chat-specific and document why.
- `src/ui/component/mine/StreamdownIsolated.tsx` and `src/ui/component/mine/streamdown/**`
  - Move to `src/ui/components/shared/streamdown/**` if safe.
- `src/ui/component/mine/multi-lens-graph/**`
  - Move to `src/ui/components/shared/multi-lens-graph/**` if safe.
- Icons:
  - `src/ui/component/icon/**` can move to `src/ui/components/icons/**` if imports are simple.
- Dead wrappers:
  - `AnimatedSparkles`, `HoverButton`, `IntelligenceFrame`, input helpers, and typewriter hook should be re-scanned for duplicate implementations and real importers.

Rules:
- Feature-local components stay under `src/ui/view/<feature>/components`.
- Primitives stay under `src/ui/components/primitives`.
- Obsidian-native shadcn wrappers may stay under a clearly named shared location, but do not keep two confusing parallel roots if a safe migration is possible.
- Do not mechanically merge `shared-ui/button` and `primitives/Button`; they are visually different surfaces unless you verify parity.

Track 6 — Stub / fake / half-wired surface cleanup

Required scan:
Run a scan similar to:

```bash
rg -n "data-disabled=\"true\"|Coming soon|console\\.log|console\\.info|TODO|stub|placeholder|Not implemented|no-op|noop" \
  src/ui/view/chat-view src/ui/view/usage-dashboard src/ui/view/settings src/ui/view/quick-search src/ui/view/copilot \
  -g '*.tsx' -g '*.ts'
```

Candidates already visible after T11T:
- `ComposerRetained.tsx` disabled coming-soon rows.
- `ToolsTab.tsx` web-access coming-soon.
- `PickerReadinessAdapters.tsx` / `CopilotPickerContent.tsx` system diagnostics stubs.
- `WhatWasThisAbout.tsx` stubbed surfaces.
- `UsageDashboard.tsx` stale placeholder comment.
- `InspectorSidePanel.tsx` placeholder comment.
- chat/quick-search console logs in runtime hooks/components.

Required outcome:
- Net product LOC reduction from this track should be >= 200, target >= 500.
- Remove fake user-facing affordances or make them real.
- Developer-only logs may remain only if they are intentionally guarded or clearly not user-facing.
- Do not delete roadmap comments that protect real future work unless they are stale/misleading.

Track 7 — Regression guards and verification

Must preserve:
- `npm run audit:boundary` => 0 findings.
- no `@/app/**` import from `src/ui/**`, static or dynamic.
- no `obsidian` imports in service/core.
- no service/core module-level mutable runtime singleton.
- no banned god-port/hook names.

Add or update focused guards for:
- retired old paths from T11U.
- old `src/ui/component/...` paths that are migrated.
- no `ContextBuilder` resurrection.
- no `getAgentBridge()` resurrection.
- no `_currentSetPhase` resurrection.
- Copilot action ids/panel bindings still intact.
- If Settings strings namespace is deleted, guard that removed key path is gone.

Verification commands, run serially:

```bash
cloc src styles.css --quiet --json --timeout 120
npm run build
npm run audit:boundary
npm run test -- test/t11r-zero-obsidian-boundary-regression.test.ts
npm run test -- test/copilot-action-surface-registry.test.ts
npm run test -- test/copilot-action-runtime-ports.test.ts
```

Also run any new focused tests you add.

Do not run this repo's tests in parallel; `run-test.js` uses shared temp bundle names and parallel runs can confuse output.

Implementation note requirements:
Create:

```text
docs/superpowers/refactor-ops/t11u-code-slimming-target-wave-implementation-note.md
```

The note must include:
- Chinese summary.
- Commit hash.
- Before/after `cloc src styles.css` table.
- Per-track LOC delta table.
- Required tracks delivered/missed.
- Whether T11U met Hard / Target / Stretch.
- Changed files grouped by track.
- Deleted/moved/renamed paths.
- Protected features verified.
- Boundary audit result.
- Test results.
- Code reading guide.
- Mermaid dependency/module diagrams for the new shared shells.
- Skipped candidates with evidence and why they are T11V/T11W material.

Commit rule:
- If Hard minimum >= 4,000 product LOC reduction is met and verification passes, commit with an English message:
  `refactor(t11u): code slimming target wave`
- If Hard minimum is not met but useful safe work landed, either stop before commit for Codex review or commit as:
  `refactor(t11u): partial code slimming progress`
  and clearly state it is not accepted as the T11U target wave.
- Never claim target/stretches that were not met.
```

## 2. Codex Notes For Owner

Why this T11U prompt is harder than T11T:

- T11T hard minimum was 2,500 and landed at 2,523, only 23 LOC above the line.
- T11U raises the hard minimum to 4,000 and forces at least five large pools into one execution DAG.
- It prevents "one tiny family" Copilot-only work from counting as enough.
- It keeps Usage Dashboard / Chat / Vault X-Ray / Quick Search protected, so slimming must come from structure, not feature deletion.
- It requires per-track LOC deltas so we can see where the reduction actually came from.

Suggested acceptance standard:

| Result | Accept? | Label |
|---|---|---|
| `< 4,000` LOC reduction | No, unless explicitly owner-approved | partial progress |
| `>= 4,000` and all required tracks touched | Yes | T11U hard met |
| `>= 7,000` | Strong yes | target met |
| `>= 10,000` | Great | stretch met |

After Claude returns, Codex should review:

1. Did `cloc src styles.css` really move by the claimed amount?
2. Did boundary audit stay 0?
3. Did it delete features or only consolidate implementations?
4. Did it add god shells or actually reduce duplication?
5. Are skipped tracks evidence-backed?
6. Is there a readable owner implementation note with diagrams and reading guide?
