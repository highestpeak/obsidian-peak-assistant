# Copilot / Command Center User-Centered Redesign Plan

Date: 2026-05-14

Status: Product and design planning corrected after user feedback; implementation not started.

Spec: `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`

Design artifacts:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/README.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/brief.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/panel-first-revision.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/multi-panel-surface-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/intent-hub-auto-orchestration-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-system-prompt.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-flow-prompt.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/search-like-tabs-auto-agent-codex-imagegen.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/obsidian-panel-flow-codex-imagegen.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/requirements-flow.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/obsidian-panel-flow-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/intent-hub-orchestration-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/full-document-rendered-diff-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/popout-command-panel-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/command-center-prototype.html` — archived exploratory direction, not selected.

## Goal

Turn Copilot and Command Center from a feature catalog into an intent-first, context-aware, safe-to-apply Obsidian intent hub and multi-panel workflow.

This plan deliberately starts with UX foundations before action-specific polish. The repeated screenshot issues mostly come from missing shared interaction primitives and too much feature-surface exposure, not isolated styling defects.

## Phase 0 — Product Decisions

- [x] Consolidate screenshot findings into a user-centered product direction.
- [x] Write durable Superpowers spec.
- [x] Create design-flow brief and persistent prototype package.
- [x] Record user correction that the first full-page workbench direction is too complex.
- [x] Pivot selected direction to Obsidian panel-first, quick-invocation, multi-state workflows.
- [x] Add panel-first HTML prototype and corrected imagegen prompt.
- [x] Generate corrected Codex imagegen bitmap prototype and copy it into the design package.
- [x] Record follow-up correction that side-panel-only is too narrow; larger pop-out panels are required for clear operation.
- [x] Add pop-out command panel prototype and multi-panel surface review.
- [x] Re-read original annotations and record the deeper correction: `Copilot` / vault-level intent should auto-plan capabilities rather than expose a static card grid.
- [x] Add intent hub orchestration prototype and review document.
- [x] Add a visual gallery with one storyboard card per intent hub/capability.
- [x] Synthesize the design evolution into `evolution-report.md` and mark it as the source of truth.
- [x] Merge `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` into one `Vault Intelligence` hub with Analyze/Synthesize/Maintain modes.
- [x] Rebuild `evolution-report-rendered.html` as a visual UX flow board with evidence images, bitmap mockups, prototype iframes, IA merge, and screen transitions.
- [x] Record that side-panel diffs are insufficient for substantial document edits; add a full-document rendered Markdown diff prototype.
- [x] Update pop-out command panel direction to use top tabs like the Search view: `Document`, `Vault`, `Setting`, with command search in every tab.
- [x] Record imagegen-first prototype workflow and tab `Auto` behavior: clicking Auto starts the agent planner instead of opening a static action grid.
- [x] Mark only two current visual baselines as conforming: Search-like tab Auto panel and Obsidian panel flow.
- [ ] Confirm first quick-invoke surface:
  - command palette,
  - selected text context menu,
  - panel shortcuts,
  - toolbar/ribbon,
  - slash-style action search.
- [ ] Confirm which action groups should be hidden behind advanced mode.

Recommended decision: high-level intent hubs (`Copilot`, `Vault Intelligence`, `Manage System`) generate an action plan; docked side panel shows daily context; pop-out command panel exposes them as top tabs (`Document`, `Vault`, `Setting`) with command search; review/apply panel handles candidates/diffs/artifacts.

## Phase 1 — Intent Planner, Shared Panel Shell System, And Lifecycle

Purpose: define how high-level hubs choose capabilities, then fix recurring state/header/result problems once across docked, pop-out, and review panel variants inside the Obsidian boundary.

Tasks:

- [ ] Define `IntentHub`: Copilot, Vault Intelligence, Manage System.
- [ ] Define `VaultIntelligenceMode`: Analyze, Synthesize, Maintain.
- [ ] Define `CapabilityRegistry` fields:
  - id,
  - label,
  - hub eligibility,
  - scope support,
  - trigger signals,
  - run mode,
  - expected artifact type,
  - mutation risk,
  - review surface.
- [ ] Define first-pass planner:
  - rules for obvious context triggers,
  - optional LLM explanation for reasons,
  - no auto-apply mutations.
- [ ] Define `CopilotActionState`: configuring, running, resultReady, previewingChange, applied, skipped, failed.
- [ ] Define shared panel variants:
  - `AssistantDockPanel`: right sidebar, compact recommendations.
  - `CommandPopoutPanel`: bounded overlay for action browsing/configuration.
  - `ActionReviewPanel`: focused candidates/diff/apply surface.
- [ ] Replace ad hoc header layout with a shared panel/drilldown shell:
  - one back affordance,
  - stable icon/title/scope/status slots,
  - file/path metadata slot,
  - no duplicated `Back`.
- [ ] Make `Cancel` visible only during running state.
- [ ] Make completed runs show primary result actions instead of cancel.
- [ ] Default agent trace to collapsed `Inspect run details`.
- [ ] Add standardized empty/low-confidence state component.
- [ ] Add predictable panel transitions:
  - docked -> pop-out,
  - quick invoke -> pop-out or direct review,
  - pop-out -> running/review,
  - review -> applied/undo -> docked or pop-out.

Verification:

- [ ] Smoke test Article Review, Summary, Add Evidence, Tag Suggestions, Suggest Links.
- [ ] Confirm no completed modal still shows running-only controls.
- [ ] Visual check normal Obsidian side-panel width, pop-out command panel width, and expanded review drilldown.

## Phase 2 — Panel IA, Pop-Out Catalog, And Quick Invocation

Purpose: replace raw action inventory with intent hubs, compact daily panel, larger pop-out plan/catalog panel, quick invoke paths, and intent routing.

Tasks:

- [ ] Introduce compact action families:
  - Improve,
  - Connect,
  - Evidence,
  - Tasks,
  - Maintain,
  - Manage System.
- [ ] Add panel context block:
  - current note,
  - selected text status,
  - folder,
  - model,
  - index/graph status.
- [ ] Add `Recommended now` panel lane with 2-3 reasoned actions.
- [ ] Make `Run Copilot scan` and `Vault Intelligence` first-class entries.
- [ ] Keep `All tools` out of the docked panel; put manual capabilities in the pop-out command panel with search and categories.
- [ ] Implement pop-out command panel IA:
  - current note context strip,
  - search,
  - top tabs: Document, Vault, Setting,
  - command input available in every tab,
  - active tab uses the Search reference style: purple underline, soft inactive background, large rounded command input,
  - Document maps to Copilot/current note,
  - Vault maps to Vault Intelligence,
  - Setting maps to Manage System,
  - each tab has an Auto primary action that runs the planner immediately,
  - generated action plan,
  - manual capability categories,
  - selected-action detail/configuration side area,
  - scope/risk badges on every action.
- [ ] Add scope chips: Selection, Current note, Folder, Vault, Admin.
- [ ] Move advanced/system actions away from daily Copilot actions.
- [ ] Route command palette / selected text invocation into the same action lifecycle.

Verification:

- [ ] Compare against screenshot review pain points 01, 05, 10, 13, 16.
- [ ] Manual test command search and keyboard navigation.
- [ ] Confirm invalid actions are disabled or transformed with reason text.

## Phase 3 — Merge Duplicate Workflows

Purpose: reduce user choice burden, expose strategies as provenance, and make merged workflows available to the planner.

Tasks:

- [ ] Merge `Suggest Links`, `Suggest Links (Graph)`, `Find Related`, and `Smart Connections` into `Connect Related Notes`.
- [ ] Merge `Extract Todos`, `Check Task List`, and `Find & Solve Tasks` into `Task Review`.
- [ ] Merge `Polish Document`, `Format Polish`, `Correct Content`, and review/fix portions of `Review Article` into `Improve Current Note`.
- [ ] Fold `Deduplicate Scan`, `Batch Tag Suggestions`, and `Detect & File` into `Vault Intelligence / Maintain`.
- [ ] Move `Prompt Audit` and `Run Workflow` to Manage System / Advanced.
- [ ] Make `Translate` contextual instead of always visible.

Verification:

- [ ] Ensure old commands either route to the merged workflow or remain discoverable through search aliases.
- [ ] Confirm no capability disappears without an alias or migration path.

## Phase 4 — Result Review Surfaces

Purpose: turn AI output into reviewable product artifacts.

Tasks:

- [ ] Build reusable `SuggestionReviewPanel`:
  - suggestion rows/cards,
  - confidence,
  - rationale/evidence,
  - accept/reject/edit,
  - batch actions,
  - apply preview.
- [ ] Build `FullDocumentRenderedDiffPanel` for document-level mutations:
  - current rendered Markdown pane,
  - proposed rendered Markdown pane,
  - changed block highlighting,
  - explicit red deletion rails and green addition rails,
  - `-` / `+` labels or equivalent visual markers,
  - synchronized scrolling where practical,
  - per-block accept/reject,
  - apply selected / reject all / undo,
  - raw Markdown/source diff behind an inspect control.
- [ ] Link proposals:
  - anchor text,
  - target note,
  - insertion location,
  - signal badges,
  - diff preview.
- [ ] Evidence candidates:
  - quote/excerpt,
  - source note,
  - relevance reason,
  - insertion preview.
- [ ] Document quality issues:
  - issue cards,
  - generated fix preview,
  - full-document rendered diff for multi-paragraph or structural changes,
  - fixed/skipped/manual-review states,
  - undo/view applied diff.
- [ ] Vault maintenance issues:
  - severity,
  - confidence,
  - reason,
  - safe review/apply/ignore.
- [ ] Summary/synthesis:
  - rendered Markdown preview,
  - source citations,
  - save target and duplicate warning.

Verification:

- [ ] Targeted tests for pure transforms where available.
- [ ] Manual validation against `docs/manual-testing-checklist.md` Phase W and AE sections.
- [ ] Visual QA for dense result lists, empty states, and full-document rendered diff at desktop and narrow Obsidian panel widths.

## Phase 5 — Context-Aware Recommendations

Purpose: make the product feel like it understands the current note.

Tasks:

- [ ] Define recommendation triggers:
  - no tags,
  - weak link density,
  - long note,
  - selected text,
  - claim-like paragraph,
  - stale/duplicate/orphan vault signals,
  - index not ready.
- [ ] Add recommendation reasons to cards.
- [ ] Record dismiss/ignore feedback.
- [ ] Support automation modes:
  - Manual only,
  - Suggest quietly,
  - Auto-run on save,
  - Auto-apply never.
- [ ] Add first pass of document-enrichment actions:
  - Suggest Visual,
  - Suggest Diagram,
  - Suggest Example,
  - Suggest Table/Chart.

Verification:

- [ ] Use a fixture vault with notes covering each trigger.
- [ ] Confirm recommendations do not block normal writing.
- [ ] Confirm high-risk actions never auto-apply.

## Implementation Notes

- Preserve existing action registry concepts where possible, but change top-level grouping and rendering.
- Use shared result components before rewriting every action.
- Prefer adapters that map old action results into the new review surfaces.
- Keep existing commands/search aliases stable during migration.
- Treat any full-page Command Center as optional advanced expansion, not the first implementation target.
- Do not interpret panel-first as side-panel-only; large bounded pop-out panels are part of the intended design.
- Do not run repo-wide `tsc --noEmit` as the primary gate unless this phase touches global types; use targeted tests and `npm run build`.

## Risk Management

- Risk: merging actions hides useful power.
  - Mitigation: keep aliases and show signal badges/advanced modes.

- Risk: result review components become too generic.
  - Mitigation: make the shared shell generic, but keep workflow-specific artifact cards.

- Risk: preview/apply adds friction.
  - Mitigation: quick actions may have one-click apply only after a clear preview summary; destructive changes require review.

- Risk: UI redesign grows beyond Copilot.
  - Mitigation: limit first implementation to Command Center, Copilot result modal, and the representative workflows.

## Suggested First Implementation Slice

1. Minimal `Copilot` intent planner for the current note/selection.
2. Capability registry entries for Connect Related Notes, Add Evidence, Improve Current Note, Suggest Tags, Suggest Diagram, Translate as contextual/manual.
3. Peak Assistant docked panel home with context block, `Run Copilot scan`, and generated recommendations.
4. Pop-out command panel showing the generated action plan plus manual capability search.
5. Quick invoke route from selection or command palette into the same planner.
6. `Connect Related Notes` result surface inside review/apply panel.
7. Preview/apply selected link proposals with applied diff and undo affordance.

This slice validates the real product promise: stay in Obsidian, click Copilot once, let the system decide which capabilities matter, review concrete changes, and apply safely.
