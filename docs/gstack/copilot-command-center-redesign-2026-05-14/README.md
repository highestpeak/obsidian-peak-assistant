# Copilot / Command Center Redesign Artifacts

Date: 2026-05-14

Purpose: persistent design package for the user-centered Copilot / Command Center redesign.

This directory uses the project `docs/gstack/` convention for design-work artifacts, but bitmap prototype generation for this pass should use Codex's built-in `imagegen` skill rather than gstack image generation.

## 2026-05-14 Direction Corrections

User feedback rejected the first full-page workbench direction as too complex.

Corrected direction: Peak Assistant's Copilot / Command Center capability should primarily live in an Obsidian side panel, be quickly callable from the editor, command palette, context menu, or panel shortcuts, and unfold through multiple small workflow states. It should not start as a standalone page.

Follow-up feedback clarified that "panel-first" cannot mean narrow-side-panel-only. Peak Assistant also needs pop-out panels like the referenced Copilot action panel: larger bounded overlays inside Obsidian for action browsing, workflow configuration, and richer review.

Latest selected direction: a multi-panel system inside Obsidian:

- Docked side panel for ambient context and recommendations.
- Pop-out command panel for action catalog, grouped operations, and workflow setup.
- Review/apply panel for results, provenance, diffs, and safe mutation.
- Quick invoke layer for command-palette/selection/context-menu entry.

Final correction from re-reading the original annotations: the panels are only the surface system. The product model should be intent hubs plus auto-orchestration. `Copilot` and `Vault Intelligence` are high-level entries that analyze context and choose relevant capabilities; the action catalog is secondary/manual.

Latest IA correction: `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` should merge into one vault-level hub: `Vault Intelligence`. It has three internal modes: `Analyze`, `Synthesize`, and `Maintain`.

Source analysis:

- `evolution-report.md`
- `docs/copilot-command-center-screenshot-review-2026-05-14.md`
- `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/superpowers/plans/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `panel-first-revision.md`
- `multi-panel-surface-review.md`
- `intent-hub-auto-orchestration-review.md`

## Files

- `evolution-report.md` — synthesis report and current source of truth for the product direction; includes the `Vault Intelligence` merge, Mermaid mind map, flow diagrams, and evidence references.
- `evolution-report-rendered.html` — browser-readable visual board with embedded evidence images, Codex imagegen mockups, prototype iframes, screen flow, IA merge, full-document rendered diff mock, and rationale.
- `brief.md` — corrected gstack design brief for panel-first visual exploration.
- `panel-first-revision.md` — first-principles correction after user feedback.
- `multi-panel-surface-review.md` — second correction: docked panel plus pop-out command/review panels.
- `intent-hub-auto-orchestration-review.md` — third correction: `Copilot` / vault intent hubs as auto-orchestrating entries, not static tabs.
- `imagegen-panel-system-prompt.md` — Codex built-in imagegen prompt for the multi-panel system direction.
- `imagegen-panel-flow-prompt.md` — Codex built-in imagegen prompt for the corrected panel storyboard.
- `imagegen-prompt.md` — superseded first prompt for the rejected full workbench direction.
- `prototypes/requirements-flow.md` — requirement diagrams for panel-first IA and action lifecycle.
- `prototypes/capability-visual-gallery.html` — exploratory visual inventory; useful for capability coverage, but not the primary product direction because it can recreate the feature-catalog problem.
- `prototypes/obsidian-panel-flow-prototype.html` — selected lightweight HTML prototype for the corrected direction.
- `prototypes/intent-hub-orchestration-prototype.html` — selected prototype for auto-planning from high-level intent hubs.
- `prototypes/full-document-rendered-diff-prototype.html` — selected prototype for VSCode-like full-document rendered Markdown review/apply.
- `prototypes/popout-command-panel-prototype.html` — secondary prototype for the larger pop-out action/configuration panel; superseded as the primary design by the intent-hub prototype.
- `prototypes/command-center-prototype.html` — archived exploratory HTML prototype; too page-like for the actual product boundary.
- `assets/search-like-tabs-auto-agent-codex-imagegen.png` — selected Codex imagegen visual baseline for the Search-like tab command panel and Auto agent entry.
- `assets/obsidian-panel-flow-codex-imagegen.png` — corrected Codex imagegen storyboard for the panel-first direction.
- `assets/command-center-codex-imagegen.png` — archived first bitmap direction; too page-like.

## Design Direction

The selected direction is an Obsidian-native intent hub and multi-panel workflow:

- The note/editor remains the primary workspace.
- `Copilot` means "analyze the current note/selection and plan relevant document actions."
- `Vault Intelligence` means "analyze, synthesize, or maintain a scoped vault context."
- `Manage System` means "configure and diagnose the assistant infrastructure."
- In the pop-out command panel, these should appear as top tabs: `Document`, `Vault`, and `Setting`, similar to the existing Search view.
- The tab visual style should follow the provided Search reference: large rounded panel, two/three top tabs, active purple underline, soft gray tab background, oversized rounded command input.
- Each top tab should expose an `Auto` primary action. Clicking `Auto` starts the agent planner immediately: it inspects context, decides which capabilities are relevant, runs safe discovery, and presents reviewable artifacts.
- Bottom-level actions are capabilities available to the planner, not all equal front-door buttons.
- The two conforming visual baselines are `assets/search-like-tabs-auto-agent-codex-imagegen.png` and `assets/obsidian-panel-flow-codex-imagegen.png`.
- Each hub/capability has an exploratory storyboard in `prototypes/capability-visual-gallery.html`, but it is not a visual baseline.
- A compact right-side Peak Assistant panel shows current context, quick search, and 2-3 recommendations.
- A larger pop-out command panel can open above Obsidian when the user needs command search, tab switching, or workflow configuration.
- A focused review/apply panel handles result artifacts, provenance, diffs, and mutation approval.
- Whole-document or multi-paragraph changes should use a VSCode-like full-document diff where both sides are rendered Markdown; tiny side-panel diffs are only for lightweight suggestions.
- The user can invoke actions from the panel, command palette, selected text, context menu, toolbar, or pop-out panel.
- A workflow unfolds across states: high-level intent -> scope/mode choice -> auto action plan -> safe discovery -> result review -> preview/apply.
- Review artifacts, provenance, and diffs matter more than agent traces.
- Mutations always use preview/apply semantics.

The selected bitmap prototypes are:

- `assets/search-like-tabs-auto-agent-codex-imagegen.png`
- `assets/obsidian-panel-flow-codex-imagegen.png`

The first generated bitmap prototype, `assets/command-center-codex-imagegen.png`, is retained as an exploratory artifact but is not a selected direction because it over-emphasized a standalone workbench.

## Artifact Status

| Artifact | Status | Reason |
| --- | --- | --- |
| `evolution-report.md` | Canonical | Synthesizes original annotations and later corrections. |
| `evolution-report-rendered.html` | Canonical visual report | Shows evidence images, bitmap mockups, prototype iframes, IA merge, screen flow, full-document rendered diff, and rationale in a browser. |
| `assets/search-like-tabs-auto-agent-codex-imagegen.png` | Selected visual baseline | Defines the tab/search/Auto agent command panel style. |
| `assets/obsidian-panel-flow-codex-imagegen.png` | Selected visual baseline | Defines the in-Obsidian side panel, quick action, review, apply, and undo flow. |
| `intent-hub-auto-orchestration-review.md` | Supporting | Explains the core product model. |
| `prototypes/intent-hub-orchestration-prototype.html` | Supporting prototype | Shows the intended intent hub planning flow. |
| `prototypes/full-document-rendered-diff-prototype.html` | Supporting prototype | Shows the intended full-document rendered Markdown diff for substantial note mutations. |
| `prototypes/popout-command-panel-prototype.html` | Archived/supporting | Useful as interaction notes, but the current visual baseline is the imagegen tab/Auto mockup. |
| `prototypes/capability-visual-gallery.html` | Exploratory inventory | Helps check coverage, but recreates the feature-catalog problem if treated as primary. |
| `prototypes/obsidian-panel-flow-prototype.html` | Supporting surface prototype | Useful for docked panel / review flow. |
| `prototypes/command-center-prototype.html` | Archived | Too full-page and workbench-like. |

## Design Workflow Notes

This package follows the design-flow path for a major UI redesign:

1. Capture product intent and first-principles constraints.
2. Generate design variants or wireframes.
3. Persist the brief and selected direction.
4. Use the artifact as source of truth for later implementation and visual QA.

For future visual iterations, prefer Codex built-in `imagegen` bitmap mockups over hand-authored HTML prototypes. HTML can remain useful for documentation wrappers or when interaction mechanics must be inspected, but new visual prototype passes should start from imagegen and store the resulting bitmap under `assets/`.
