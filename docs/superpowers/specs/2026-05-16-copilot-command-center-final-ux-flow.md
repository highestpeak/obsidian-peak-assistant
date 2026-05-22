# Copilot / Command Center Final UX Flow Spec

Date: 2026-05-16

Status: Final UX spec, not yet implemented end-to-end.

Supersedes / refines:

- `docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`

Visual source of truth:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow-screenshot.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/final-flow/01-copilot-entry-panel.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/final-flow/02-auto-review-resizable-insights.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/final-flow/03-manual-tool-diff-review.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/final-flow/04-readonly-summary-review.png`

## Product Position

Peak Assistant should not expose a directory of AI tools as the primary experience. It should behave like an Obsidian-native intent hub:

- The user stays in the current note or vault context.
- The user opens a compact command surface.
- The user chooses an intent: Auto, search, recommended action, or tab scope.
- The agent decides which capabilities to use.
- The result appears as reviewable artifacts, not as raw tool logs.
- Any document mutation requires user review before apply.

The user should not need to understand whether a result came from semantic search, graph search, backlinks, vault health, or an LLM planner. Those details belong in provenance, trace, and source panels.

## Final UX Model

### Surfaces

| Surface | Purpose | Primary visual |
| --- | --- | --- |
| Entry Panel | Capture intent quickly inside Obsidian | `01-copilot-entry-panel.png` |
| Auto Review | Show a running ReAct agent and generated artifacts | `02-auto-review-resizable-insights.png` |
| Manual Diff Review | Review document-changing proposals from a manual initial intent | `03-manual-tool-diff-review.png` |
| Insight Review | Review analysis/report artifacts and continue the conversation | `04-readonly-summary-review.png` |

### Tabs

The entry panel uses three top tabs:

| Tab | User meaning | Internal hub |
| --- | --- | --- |
| `Document` | Help the current note or selection | `Copilot` |
| `Vault` | Analyze, synthesize, or maintain the vault context | `Vault Intelligence` |
| `Setting` | Diagnose and configure the assistant system | `Manage System` |

Each tab includes:

- a search / ask input,
- a prominent `Auto` button,
- a small recommended section,
- a secondary way to show all capabilities.

The tab is a scope selector, not a hard routing wall. If the agent needs supporting tools from another capability family, it may call them and explain that in trace/provenance.

## Core Interaction Principle

`Auto` is not a choice between Diff and Summary.

`Auto` is a ReAct agent run. One run can produce multiple artifacts:

| Artifact | Meaning | Default surface |
| --- | --- | --- |
| `ChangeArtifact` | Proposed document or vault mutation that requires review/apply | `Changes` tab with rendered diff |
| `InsightArtifact` | Analysis, summary, risk, source reasoning, next steps, follow-up prompts | `Insights` tab or resizable rail |
| `SourceArtifact` | Source notes, excerpts, graph signals, confidence, provenance | `Sources` tab and inline badges |
| `TraceArtifact` | Agent observations, tool calls, retries, failures, skipped tools | Left trace or collapsed run details |

Default behavior:

- If a run has change artifacts, open `Changes` by default.
- If a run has no change artifacts, open `Insights` by default.
- `Insights` is interactive, not static read-only.
- `Create proposal` can turn an insight into a new change artifact.
- Manual tool clicks are initial intents only. They do not prevent the agent from using supporting tools.

## Complete UX Flows

The final flow report uses visual lanes. Each lane follows:

`user trigger -> entry / intent -> agent run -> review surface -> user outcome`

### A. Document Auto

Trigger:

- User is in current note or selection.
- User opens Copilot / Command Center.
- User clicks `Document -> Auto`.

Entry / intent:

- Entry panel opens on `Document`.
- The current note path, selection state, and word count are visible.
- Recommended actions are visible but secondary.

Agent run:

- Agent observes current note/selection.
- Agent may call link discovery, evidence, review, task, polish, graph, or source tools.
- Trace updates live.

Review surface:

- If changes exist, open Auto Review with `Changes` active.
- Rendered diff is primary.
- Insights rail is visible and resizable.
- Source/provenance badges appear inline on changed blocks.

Outcome:

- Apply reviewed changes.
- Apply selected blocks.
- Reject all.
- Continue chat.
- Undo after apply.

### B. Manual Write Intent

Trigger:

- User clicks a recommended write-capable action.
- Or user searches for a write-capable command.

Entry / intent:

- The selected action becomes the initial intent.
- Examples: Connect links, Improve note, Add evidence, Correct content, Format polish.

Agent run:

- Agent may still call helper tools such as search, graph, source reading, and risk checks.
- The trace should show those calls naturally.

Review surface:

- Final output is a unified rendered diff.
- It should not be split into separate tool-specific sections.
- Diff rows or blocks show which capability produced each proposed change.

Outcome:

- Apply selected.
- Apply reviewed changes.
- Reject all.
- Open sources.
- Continue chat.

### C. Insight / No Change

Trigger:

- User asks for summary, gap analysis, vault health, related notes, source review.
- Or Auto decides no document change is currently useful.

Entry / intent:

- Entry can come from `Document`, `Vault`, search, recommended analysis action, or Auto.

Agent run:

- Agent reads current note, vault search results, graph signals, source notes, and previous context.

Review surface:

- Open `Insights` full width by default.
- Show key findings, sources, risks, next steps, and follow-up actions.
- Keep a chat input for follow-up.
- Avoid showing empty diff when no changes exist.

Outcome:

- Ask follow-up.
- Open sources.
- Save summary to note.
- Create proposal, which starts a new change-artifact review.

### D. Vault Intelligence

Trigger:

- User switches to `Vault`.
- User wants analysis across folder/topic/vault, not only the current note.

Entry / intent:

- `Vault` combines Analyze, Synthesize, and Maintain.
- The user should not need to pick Knowledge Analysis vs Research vs Maintain Vault as top-level products.

Agent run:

- Agent resolves scope.
- Agent may call search index, graph neighbors, hub/gap detectors, vault health, duplicates, stale notes, tasks, or batch tag tools.

Review surface:

- Usually opens an insight/report artifact.
- If the run generates batch changes, show a proposal queue or rendered diff review before apply.

Outcome:

- Open affected notes.
- Save vault report.
- Create batch proposal.
- Schedule or re-run follow-up review.

### E. Setting / System

Trigger:

- User switches to `Setting`.
- User wants to inspect models, providers, index, tools, skills, prompts, diagnostics, or failures.

Entry / intent:

- `Setting` is not a content workflow.
- It is the assistant operation and configuration workflow.

Agent run:

- Agent checks provider readiness, index status, tool schema availability, recent failures, usage, and prompt/config health.

Review surface:

- Show diagnostic results as insight/report.
- Only enter proposal/apply if the operation changes configuration or triggers a controlled rebuild.

Outcome:

- Fix config.
- Rebuild index.
- Switch model/profile.
- Re-run the failed workflow.
- Return to Document or Vault flow.

## Review Surface Requirements

### Changes

The `Changes` surface is for user-approved mutations.

Requirements:

- Use rendered Markdown diff by default.
- Show full document context for multi-block changes.
- Use red deletion and green addition treatment with explicit line/block markers.
- Support per-block selection.
- Preserve provenance labels on each proposed change.
- Include `Reject all`, `Apply selected`, and `Apply reviewed changes`.
- Keep raw markdown/source diff behind an advanced toggle.

### Insights

The `Insights` surface is for analysis and reasoning.

Requirements:

- It must be interactive, not a static read-only panel.
- It supports three sizes:
  - docked rail,
  - split view,
  - full width report.
- It includes follow-up chat.
- It includes `Create proposal` for turning insights into changes.
- It can be the default view when there are no changes.

### Sources

The `Sources` surface explains trust.

Requirements:

- Show source note/path.
- Show excerpt or source claim.
- Show signal type: backlink, tag, semantic, graph, co-citation, hub, task, user selection, agent inference.
- Show confidence when available.
- Link inline provenance badges back to source detail.

### Trace

Trace is for transparency, not the main result.

Requirements:

- Show live ReAct events while running.
- Keep completed trace collapsed by default unless the user opens it.
- Show failed/skipped tool calls with recovery text.
- Do not expose raw JSON as the primary view.

## Entry Panel Requirements

The entry panel should remain visually quiet.

Requirements:

- Top tabs match the search-like style: active purple underline, soft inactive tabs.
- `Auto` sits as a clear primary action.
- Search input is available in every tab.
- Recommended section shows 3-4 items maximum.
- All capabilities remain discoverable but secondary.
- Capability cards should not dominate the first viewport.
- The panel should open as an Obsidian pop-out overlay, not a standalone full-page route.

## Safety Requirements

- No auto-apply for document or vault mutations.
- Mutating operations always create change artifacts first.
- Applying changes should be recoverable by undo.
- Destructive vault maintenance requires explicit review and should include affected note counts and recovery notes.
- A failed tool call should not block other useful insight artifacts unless the run cannot continue safely.

## Non-Goals

- Do not build a standalone full-page Command Center as the primary UX.
- Do not make a huge feature gallery the default panel.
- Do not force the user to pick semantic vs graph vs agent.
- Do not expose every tool call as a user-facing section.
- Do not make `Summary` a static read-only dead end.
- Do not redesign unrelated Chat UI in this phase.
- Do not implement every capability rewrite before the unified artifact/review model exists.

## Acceptance Criteria

- Opening Copilot shows the entry panel with `Document / Vault / Setting`, search, Auto, and few recommendations.
- Clicking `Document -> Auto` starts one ReAct run and opens a review shell with trace and artifacts.
- Manual write actions route to the same diff review model as Auto change artifacts.
- Analysis-only actions route to interactive Insights, not empty diff.
- `Insights` can be rail, split, or full width.
- `Create proposal` from Insights produces a new reviewable change artifact.
- `Vault` flows produce vault-level insight reports and can create batch proposals.
- `Setting` flows produce diagnostics and safe configuration actions.
- Every proposed document change is visible in a rendered diff before apply.
- Every applied change has provenance and undo/recovery affordance.
- The visual flow report remains image-first and matches this spec.
