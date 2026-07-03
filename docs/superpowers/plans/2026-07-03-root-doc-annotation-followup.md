# Root Docs Annotation Follow-up

This plan consolidates the browser annotations from the root documentation pass.
The annotations are not all the same kind of work: some are doc presentation bugs,
some are code/default-setting mismatches, and some are product roadmap decisions.

## P0 · Code Truth Must Match The Directory Mental Model

Status: patched in the current Codex pass.

- Default plugin-owned folders should live under one user-visible root by default.
- The default root remains `ChatFolder`.
- Default derived folders:
  - `ChatFolder/Prompts`
  - `ChatFolder/Prompts/Custom`
  - `ChatFolder/Skills`
  - `ChatFolder/Inbox`
  - `ChatFolder/AI-Analysis`
  - `ChatFolder/DataStore`
- Advanced settings may still override individual folders.
- Do not support legacy default folders. Persisted old defaults should normalize to the new defaults; only explicit non-legacy Advanced overrides remain valid.

Touched surfaces:

- `src/core/config/folderPaths.ts`
- `src/core/config/settingsTypes.ts`
- `src/app/settings/PluginSettingsLoader.ts`
- `src/ui/view/settings/tabs/AdvancedTab.tsx`
- `src/app/copilot/actions/composeCopilotActionRuntime.ts`
- `src/ui/view/copilot/panels/WritingPlanPanel.tsx`
- `src/service/skills/SkillRegistry.ts`
- `docs/04-configuration-and-user-views.html`

Follow-up:

- Remove legacy fallback code for `_prompts`, `_skills`, `_inbox`, and `A-control/PeakAssistant/DataStore`.
- Do not build a migration assistant for the old default folders; the product logic should use the new layout only.

## P0 · Root Docs Are Final-State Manuals, Not Work Logs

Status: patched in the current Codex docs pass for the root docs touched by the annotation batch.

Root docs should not say `已落地`, `已发货`, `规划中`, task IDs, dates, branch names, or historical exception cleanup unless the historical fact is essential to understanding the final system.

What to keep:

- Current architecture and source-of-truth boundaries.
- Current runtime responsibilities.
- Current user/product behavior.
- Stable caveats that affect maintainers.

What to move out:

- Branch/date/task progress notes.
- "已在代码中确认" proof badges.
- Process narratives like "T13 + 2026-07-02 tail".
- Roadmap wording inside final-state feature docs.

Codex docs pass applied:

- `15-feature-command-gateway.html`: removed planned/status language and dated shipped note; reframed as stable boundary +接入清单.
- `16-feature-document-copilot.html`: replaced status/footer validation wording with reading context.
- `17-feature-usage-dashboard.html`: replaced status/footer process wording with durable behavior and background links.
- `18-feature-provider-model-mcp-skills.html`: corrected five concepts, removed shipped/planned provider labels, replaced `_skills/` with `ChatFolder/Skills/`, removed phase footer.
- `21-infra-agent-harness.html`: replaced draft/footer validation wording and removed "old spec as implemented" phrasing.
- `22-infra-context-pipeline.html`: rewrote process/status sections into final-state context ownership and shared-primitives boundary.
- `23-infra-search-index.html`: changed default DataStore docs to `ChatFolder/DataStore/`; legacy `A-control/` compatibility should be removed from code.

Follow-up:

- Update the doc-writing workflow/skill only after a deliberate skill-edit task, because the skill is shared and should receive generalized wording rather than project-specific patches.
- Keep running the root-doc grep checklist before future doc batches.

Roadmap exception:

- `roadmap.html` is allowed to contain statuses, dates, and planned/shipped vocabulary because its job is status tracking. It still needs its own readability pass, but it should not be judged by the same final-state rule as feature/infra docs.

## P0 · Product Planning Items Hidden In The Annotations

Status: not implemented by Codex; code/product handoff prepared at `docs/superpowers/plans/2026-07-03-code-handoff-from-doc-annotations.md`.

- Retire or reduce Cloud Agent SDK exposure.
  - Decide whether `claude-agent-sdk` remains a supported backend; if not, remove it rather than keeping a legacy bridge.
  - Update Settings, Agent Harness docs, and runtime routing after the product decision.
- Collapse visible `Chat / Agent / Plan` mode choice.
  - Direction: user expresses intent; system chooses strategy.
  - Needs an intent-router design and UI copy pass.
- Add context compaction with recoverable references.
  - Compaction should summarize what was compressed and retain retrievable anchors.
  - Agent should be able to re-fetch compressed material through Search, resource tools, or context tools.
  - Research how Codex-style compact flows expose summaries and retrieval.
- Add AI query parser for Hyper Search.
  - Natural language query should compile into existing query syntax, filters, and weights.
  - This is not the same as AI Analysis/report generation.
- Make AI Analysis cross-linkable from both Search and Vault Intelligence.
  - Search doc should distinguish Hyper Search from agent-driven AI Analysis.
  - Vault Intelligence can reference AI Analysis as a vault-level insight workflow.
- Add Setup Wizard application of budget/settings defaults.
  - Budget values like `monthlyUsd` should be settable during onboarding, not only in Advanced/Usage.
- Provider/model/MCP/skill product cleanup.
  - Decide the durable user-facing nouns for Provider/Profile/Role/MCP/Skill.
  - Remove provider-page process status labels like shipped/planned from the main reading path.
  - Align Skill docs with `ChatFolder/Skills/`, marketplace direction, and custom prompt separation.
  - Reconcile Cloud Agent SDK retirement with Provider/Profile/Role UI and Agent Harness routing.

## P1 · Formula-Driven Features Need Worked Examples

Status: partially patched in docs; deeper examples still needed.

The user repeatedly pointed out the same pattern: formulas, weights, and trigger rules are easier to understand when they are shown as formulas plus one concrete worked example.

Apply this pattern to:

- Search ranking:
  - RRF
  - PPR
  - ranking boost
  - highlight weighting
  - rerank
  - bad cases where intuitive title matches rank too low
- Vault Intelligence:
  - dimension weights
  - signal weights
  - severity multiplier
  - affected ratio
  - score synthesis
  - individual signal formulas such as duplicate similarity and title Jaccard
- Ambient Push:
  - trigger conditions
  - cooldown logic
  - candidate scoring
  - signal strength
  - pattern boost
  - recency boost

Required shape:

- State the formula.
- Show a realistic input.
- Walk through intermediate scores.
- Show the final ranking/health/trigger result.
- Add two or three bad cases and explain how to tune or debug them.

## P1 · Presentation Rules For Dense Technical Docs

Status: partially patched in docs/CSS; should become a durable doc-authoring rule.

Recurring annotation themes:

- Dense tables with 4+ prose-heavy columns are hard to read.
- Columns like `为什么`, `详细文档`, `关键证据`, `开始前确认`, `第 1 处` do not carry enough meaning.
- Long full paths should be shortened in the reading path and exposed through copy affordances.
- Path trees are often better than path tables.
- Lists or stacked sections are often better than cramped tables.
- Mermaid nodes should not end in `...`; if detail does not fit, show category in the node and details below.
- Mermaid must render; syntax errors are not acceptable in root docs.
- `field-list`/definition-list layouts need column width guards so labels do not crush content.
- Recipe cards should not be squeezed into multi-column layouts when each recipe is text-heavy.

Follow-up:

- Convert this into a presentation checklist for root HTML docs.
- Consider adding a repo-local `docs/conventions/root-docs.md` section instead of editing the global technical-doc skill immediately.
- Add a root-doc grep checklist that scans every `docs/*.html`, not just the pages touched in a given annotation batch.

Minimum grep set:

- Process/status vocabulary: `Status:`, `current draft`, `2026-`, `planned`, `landed`, `shipped`, `spec-only`.
- Forbidden folder defaults: `_prompts`, `_skills`, `_inbox`, `A-control/PeakAssistant/DataStore`.
- Low-signal table headers: `为什么`, `详细文档`, `关键证据`, `开始前确认`.
- Broken render markers: `Syntax error`.

Any hit is not automatically wrong, but it must be classified as:

- allowed status doc (`roadmap.html`, `progress.md`);
- durable background reference;
- stale process log that should move out;
- stale product/code fact that must be fixed.

## P1 · Search Doc Product Scope

Status: partially patched in `12-feature-search.html`; needs follow-up design/spec.

Search is not one feature:

- Hyper Search: fast local retrieval/ranking/highlighting.
- AI Analysis: agent-driven analysis/report workflow.

Needed tasks:

- Add a clear cross-link from Hyper Search to AI Analysis.
- Add a dedicated AI Analysis section or doc if the workflow is large enough.
- Add natural-language-to-query parser design.
- Add search bad-case catalogue:
  - no result
  - title-intuitive result ranks too low
  - semantic match too broad
  - graph/PPR over-boost
  - reranker unavailable
  - highlight misleading

## P1 · Vault Intelligence Product Scope

Status: partially patched in `13-feature-vault-intelligence.html`; needs deeper signal work.

Needed tasks:

- Replace status labels like `spec-only` with either a real final-state behavior or a clearly separate product-plan item.
- Move signal details closer to the five-category overview.
- Give each signal a readable explanation, formula/threshold, example, and failure mode.
- Fill the Semantic signal list; do not leave it less detailed than other dimensions.
- Keep category diagrams readable: category nodes above, signal details below.
- Keep recipe cards one per row unless they are very short.

## P1 · Ambient Push Product Shape

Status: partially patched in `14-feature-ambient-push.html`; product direction still needs code/spec follow-through.

Product direction from annotations:

- No recurring Morning Briefing card as the main product.
- Avoid status-bar blinking as the main surface.
- Prefer a fixed Related Notes/Ambient panel that can live in a stable location.
- Optional line-start `?` prompt is acceptable only when it is sparse and explainable.
- The trigger/scoring rules are the core of the feature and need formula-level documentation.

Needed tasks:

- Decide the canonical surface: right-side view, dockable panel, or editor-adjacent panel.
- Update code/UI if current runtime still opens status-bar or briefing-first surfaces.
- Add trigger and scoring examples.
- Fix field-list layout across the doc style system, not only page 14.

## P2 · Configuration And Onboarding Follow-up

Status: code defaults patched; onboarding not patched.

Needed tasks:

- Setup Wizard should apply folder, budget, model, provider, and index defaults coherently.
- Advanced settings should expose folder overrides without making overrides look like the normal path.
- Directory copy affordances should let readers copy the full path while reading a short label.
- The Settings doc should avoid over-heavy lifecycle jargon unless it changes how a maintainer edits settings.

## P2 · Context System Follow-up

Status: partially patched in `11-feature-chat-context.html`; product design still open.

Needed tasks:

- Replace "mode selection" with automatic strategy selection.
- Clarify relation between context stack and enabled slots.
- Consider a visual stack diagram instead of a generic flowchart.
- Design recoverable compaction:
  - compact summary
  - lost/kept inventory
  - retrievable anchors
  - agent re-fetch path

## P2 · Use Case Playbook Follow-up

Status: partially patched in `05-use-case-playbook.html`.

Needed tasks:

- Create a case index with anchor links to cases lower on the page.
- Avoid tables whose only job is to repeat links.
- Remove proof/status pills unless they help a real reader decide what to do.
- Keep each case user-intent-first, then UI entry, then underlying capability.

## Verification Expectations

For follow-up implementation:

- Run keyword scans for banned process-log wording in root docs.
- Render Mermaid and fail on syntax errors.
- Use Playwright or equivalent for pages with layout risk.
- Run focused tests for settings normalization and runtime default folders.
- For product-scope changes, create a spec or owner decision packet before coding UI/runtime changes.
