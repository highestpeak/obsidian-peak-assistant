# AI Search Report Workspace — Production Implementation Plan

Date: 2026-07-30

## Outcome

Turn the current AI Search V2 flow into one coherent evidence-to-report
workspace:

`question -> agent activity -> editable report plan -> streaming report -> sources`

The implementation must reuse the production Result Browser, Vault graph,
MultiLens AI graph, Streamdown renderer, report orchestrator and simulator
sidecar. The review HTML remains a design reference, not a second UI runtime.

## Product contract

### Landing

- Unfinished background analyses appear first under `Continue analysis`,
  including plans ready for review.
- Recent query shortcuts remain distinct from saved analysis history: a recent
  query starts that question again, while a saved analysis reopens its result.
- Saved analysis history is compact on first render and expands only on demand.
- Context-derived starters use sentence case and the label
  `Suggested from current context`.
- Keep the existing Web on/off icon and behavior.
- The Analyze control uses the same pill geometry as the input.

### Activity and report plan

- `Activity` is the complete agent run: reasoning milestones, real tool calls,
  outputs, durations and evidence collection remain inspectable.
- Summary metrics are derived from real tool outputs. Unknown values render as
  `—`; a known zero remains `0`.
- `Report plan` is query-driven. The existing first-principles, dimension scan,
  SCQA/McKinsey and mission-role vocabulary remain planning quality methods, but
  no role or report heading is universally required.
- The user can edit, reorder, remove and add sections before generation.
- The only primary action below the plan is `Generate report`.

### Report

- Approving the plan immediately activates `Report`; section streams appear in
  their final positions while parallel generation continues.
- Footer order is `Activity / Report / TOC / Sources`.
- The canonical body is Markdown rendered through Streamdown. Tables, Mermaid,
  links, wikilinks, callouts, code and images remain typed Markdown artifacts;
  arbitrary model-generated HTML is not canonical.
- Every completed section supports:
  - `Ask`: grounded, non-destructive section Q&A;
  - `Revise`: regenerate and retain version history;
  - `Copy`.
- The report tail supports an overall follow-up composer. A new analysis round
  appends to the existing report; it does not erase the previous round.
- `Synthesize` is available only after two or more rounds.

### Sources

- List / Tree / Graph and Compact / Detailed come from the shared Result
  Browser used by Vault Search and File Atlas.
- Compact / Detailed stays at the far right of the primary toolbar.
- When Graph is active, `Vault graph / AI relationship map` appears immediately
  after the List / Tree / Graph control.
- Vault graph owns deterministic graph scope, layout and semantic-edge
  controls.
- AI relationship map never shows Vault scope/layout/semantic controls.
- Before generation it shows an editable data resolver (query + selected
  sources). After generation it renders only the lenses actually returned by
  the production graph data:
  `Topology / Thinking Tree / Bridges / Timeline / Gaps`.

### Simulator

- `instant` remains the automation profile.
- `normal` becomes review-realistic; a normal run must not collapse every
  model step into a few tenths of a second.
- Tool-derived metrics must reflect the real Vault fixture rather than fixed
  zeros.
- Planned sections and generated section bodies are meaningfully different.
- The happy-path report fixture covers long-form prose, a Markdown table,
  Mermaid, wikilinks/external links and actionable structure.

## Implementation slices

1. Landing cleanup and copy/geometry correction.
2. Pure activity-metric derivation and Activity presentation.
3. Planner prompt contract plus flat, editable Report Plan UI.
4. Immediate Report activation and removal of duplicate generation progress
   from Activity.
5. V2 section/overall follow-up state, streaming UI and JSON-record
   persistence.
6. Shared Result Browser adapter plus Vault graph expansion.
7. AI relationship-map resolver and real lens rendering.
8. Simulator timing/content contract.
9. Focused tests, full tests, production build, then real Obsidian CDP and
   visible screenshot acceptance.

## Acceptance

- `Continue analysis` stays above recent-query shortcuts and saved analysis
  history; the two history semantics remain visibly distinct.
- No `Suggested for you`, `Report Outline` or `Process` label remains on the V2
  workspace surfaces.
- Generate switches to Report before the first section completes.
- Activity remains reachable during and after generation.
- A section Ask answer is visible without mutating the section body and survives
  JSON-record save/restore.
- Overall follow-up appends a round and leaves prior report content visible.
- Sources List/Tree/Graph use shared Result Browser components.
- AI map exposes no Vault graph controls and no invented/future lens names.
- Happy-path simulator sections are distinct and include table + Mermaid +
  links; normal timing is review-realistic, instant timing stays test-fast.
- Focused contract tests, full `npm run test`, `npm run build`, and real Obsidian
  DOM/interaction checks pass. If CDP is unavailable, the final handoff must
  mark the exact interaction evidence as `INTERACTION NOT VERIFIED`.
