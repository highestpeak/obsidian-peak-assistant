# Copilot / Command Center User-Centered Redesign

Date: 2026-05-14

Status: Product spec, not yet implemented.

Related analysis:

- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`
- `docs/copilot-command-center-screenshot-review-2026-05-14.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/README.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/panel-first-revision.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/multi-panel-surface-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/intent-hub-auto-orchestration-review.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-system-prompt.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/imagegen-panel-flow-prompt.md`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/search-like-tabs-auto-agent-codex-imagegen.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/assets/obsidian-panel-flow-codex-imagegen.png`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/obsidian-panel-flow-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/intent-hub-orchestration-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/full-document-rendered-diff-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/popout-command-panel-prototype.html`
- `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/command-center-prototype.html` — archived exploratory direction, too page-like for the selected product boundary.

## Current Synthesis

The current source of truth is `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report.md`.

For visual review, use `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`. The selected visual baselines are `assets/search-like-tabs-auto-agent-codex-imagegen.png` and `assets/obsidian-panel-flow-codex-imagegen.png`.

Short version:

- Peak Assistant should not evolve into a prettier action grid.
- `Copilot` and `Vault Intelligence` are intent hubs that auto-plan capabilities.
- `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` should merge into `Vault Intelligence` as Analyze/Synthesize/Maintain modes.
- The pop-out command panel should expose these through top tabs: `Document`, `Vault`, and `Setting`, with a command search input available in every tab.
- The tab style should follow the provided Search reference: active purple underline, soft inactive tab background, large rounded command input, and a visible `Auto` primary action in each tab.
- The panel system is the UI carrier, not the product model.
- Manual capability search remains secondary.
- Safe discovery can run automatically; mutations require review/apply.

## 2026-05-14 Direction Correction

The first design pass over-expanded Command Center into a standalone workbench. User feedback clarified that the actual product capability should live mostly in an Obsidian panel and be quickly callable while writing.

Corrected direction, v1:

- The active note remains the primary workspace.
- Peak Assistant's daily home is a compact Obsidian side panel.
- Command Center is a routing model, not necessarily a full page.
- Actions can be invoked from the panel, selected text, command palette, editor context menu, toolbar, or existing Obsidian commands.
- Complex work unfolds through multiple states rather than one large page: recommendation -> scoped action -> running summary -> result review -> preview/apply.

Follow-up feedback clarified that v1 was too narrow if interpreted as side-panel-only. The product also needs larger pop-out panels, similar to the referenced Copilot action panel, for clearer operation across many actions.

Corrected direction, v2:

- Docked side panel: ambient context, recommendations, pending review.
- Pop-out command panel: larger bounded overlay for action browsing, search, categories, and configuration.
- Review/apply panel: focused result surface for candidates, provenance, diff, and mutation approval.
- Quick invoke: command palette, selection menu, toolbar/ribbon, and shortcuts that route into the right panel size.

Re-reading the original annotations clarified a deeper correction: the panels are not the product model. `Copilot` and vault-level work should be intent hubs that automatically plan which capabilities to run. The action catalog is secondary and manual.

Corrected direction, v3:

- `Copilot` analyzes the current note/selection and creates an action plan across tags, links, evidence, review/fix, split, summary, tasks, and visual suggestions.
- `Vault Intelligence` analyzes note/folder/topic/vault context and creates an action plan across related notes, knowledge gaps, synthesis, vault summary, health, tasks, and maintenance.
- `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` are not competing top-level entries; they become Analyze, Synthesize, and Maintain modes inside `Vault Intelligence`.
- Low-level actions are capabilities in a registry, not all equal top-level choices.
- Safe discovery can run automatically; document/vault mutations require preview/apply.
- Manual capability search remains available, but it is the fallback path.

## Problem Statement

Copilot and Command Center already contain many high-value capabilities, but the current user experience still feels like a feature inventory. Users see action cards, agent traces, raw markdown, scan counts, and one-off modals. They do not consistently see what the system recommends, why it recommends it, what it will change, and how to safely approve it.

The first-principles problem is not lack of AI power. It is cognitive load and trust.

Peak Assistant should reduce the cost and risk of maintaining an Obsidian knowledge base. It should not ask the user to understand internal implementation differences such as semantic search vs graph search vs agent exploration before they can make progress.

## Product Principle

Peak Assistant should behave like an Obsidian-native knowledge steward:

- It observes the current note and vault state.
- It recommends a small number of useful next actions.
- It stays close to the current note instead of asking the user to switch into a separate app surface.
- It pops out more room when the user needs to operate many capabilities or configure a workflow.
- It can auto-plan which capabilities are relevant after the user clicks an intent hub.
- It turns AI work into reviewable artifacts.
- It shows provenance before asking for trust.
- It previews every document mutation.
- It makes apply/reject/undo safer than manual copy-paste.

Short form:

> Do not show the user a drawer of AI tools. Show the user the next safe improvement to their note or vault.

## Jobs To Be Done

### Current Note Improvement

When I am writing or reviewing one note, I want the assistant to identify improvements, missing evidence, weak structure, missing tags, and useful links, so that the note becomes clearer and better connected without me manually searching the whole vault.

### Knowledge Connection

When a note has weak links or isolated claims, I want the assistant to propose concrete wiki-link insertions and related notes with reasons, so that I can build a more navigable knowledge graph.

### Vault Intelligence: Maintenance

When my vault has stale notes, duplicates, orphan notes, inconsistent tags, or unresolved tasks, I want a guided review queue, not raw scan output, so that I can safely clean it up over time.

### Vault Intelligence: Research And Synthesis

When I want to understand a topic from my vault, I want a cited summary, knowledge gaps, source notes, and next writing actions, so that generated content becomes a reusable knowledge artifact.

### System Management

When the system depends on index, model, provider, skills, and prompts, I want diagnostics and settings grouped away from daily writing actions, so that maintenance controls do not distract from knowledge work.

## Design Principles

1. Intent over implementation.

   The top-level UI should reflect user goals, not code modules. Strategy labels such as semantic, graph, agent, MD5, or PPR belong in provenance badges and advanced controls.

2. Artifact over transcript.

   A completed agent run should produce evidence cards, link proposals, task cards, health issue cards, review issues, diffs, or Markdown previews. Raw markdown, raw JSON, and step logs are secondary.

3. Previewable mutation.

   Any action that changes a note must show what will change before it changes. Tags, links, evidence insertion, summaries, rewrites, corrections, translations, task edits, and formatting all need preview/apply semantics.

4. Provenance by default.

   The user should be able to see source note, excerpt, signal type, confidence, affected location, and reason. This is the trust layer that differentiates Peak Assistant from generic chat.

5. Context before catalog.

   The default Command Center view should show recommended actions based on current note, selection, folder, vault health, graph signals, and index state. The full catalog remains searchable.

6. Quiet power.

   Ambient suggestions are useful only when they are low-interruption and never auto-apply. High-risk operations require explicit approval, preview, and recovery.

7. Intent hub before action grid.

   The product model is `Copilot`, `Vault Intelligence`, and `Manage System`, but the pop-out UI should present them as `Document`, `Vault`, and `Setting` tabs. These entries plan and orchestrate capabilities. The old action grid becomes the manual/advanced capability catalog.

## Proposed Information Architecture

Command Center becomes an intent-hub orchestrator inside Obsidian. The primary daily surface is the docked Peak Assistant panel; a larger pop-out command panel appears when the user needs to inspect the plan, browse manual capabilities, or configure a workflow; focused review/apply panels appear when a chosen workflow needs result inspection.

### Intent Hubs

| Hub | Pop-out tab | What the user expects | System behavior |
| --- | --- | --- | --- |
| Copilot | Document | Help this note now | Scan note/selection and plan document capabilities |
| Vault Intelligence | Vault | Understand, synthesize, or maintain this vault context | Resolve scope, choose Analyze/Synthesize/Maintain mode, and plan vault-level capabilities |
| Manage System | Setting | Maintain assistant infrastructure | Surface index/model/skills/prompts/usage/diagnostics |

### Vault Intelligence Modes

| Mode | What the user expects | Example capabilities |
| --- | --- | --- |
| Analyze | Understand a topic/folder/vault area | Related notes, knowledge gaps, graph signals, vault summary |
| Synthesize | Produce a cited knowledge artifact | Topic synthesis, source-backed draft, save-as-note |
| Maintain | Clean and organize safely | Vault health, duplicates, stale notes, batch tags, filing, task review |

### Surface Layers

| Surface | User intent | Example entry points | Typical content |
| --- | --- | --- | --- |
| Quick Invoke | Call one relevant action without browsing | command palette, selected text menu, slash/action search, toolbar, panel shortcut | fuzzy action search, inferred scope |
| Docked Assistant Panel | Stay aware of current-note recommendations | right sidebar panel, Ambient Push handoff, recent/pending review queue | current note, 2-3 suggestions, pending review |
| Pop-Out Command Panel | Inspect intent plan and browse/configure capabilities | Open Copilot, Vault Intelligence, Command Center command, side panel expand, command palette | top tabs, command search, auto plan, scoped manual capabilities, scope/risk badges |
| Review / Apply Panel | Safely inspect and apply results | after action completes | candidates, provenance, confidence, diff, apply/ignore/undo |
| Advanced / Manage | Configure infrastructure | search-only settings entry, Manage System area, diagnostics | index, models, skills, prompts, usage |

### Action Families

| Area | User intent | Example actions |
| --- | --- | --- |
| Current Note | Improve the note I am looking at | Review quality, add evidence, summarize, split, improve structure |
| Connect Knowledge | Strengthen graph/context around this note | Suggest links, tags, related notes, concepts, missing evidence |
| Vault Intelligence / Analyze | Understand knowledge context | Related notes, knowledge gaps, graph signals, vault summary |
| Vault Intelligence / Synthesize | Turn vault material into outputs | Topic synthesis, cited draft, save-as-note report |
| Vault Intelligence / Maintain | Clean and organize the knowledge base | Vault health, duplicates, orphan notes, stale notes, batch tags, filing |
| Manage System | Configure assistant infrastructure | Index, models, skills, prompts, usage, diagnostics |

### Default Panel Layout

The docked side panel is for awareness, not the whole catalog.

- Header: Peak Assistant, status, compact action search.
- Current context: current note, selected text state, folder/project, index/graph health.
- Recommended now: 2-3 context-aware actions with explanations.
- Action groups: compact entry points for Improve, Connect, Evidence, Tasks, Maintain.
- Pending review: small queue of completed runs needing apply/save/ignore.
- Advanced tools: search-only or visually separated behind Manage System.

### Pop-Out Command Panel Layout

The pop-out command panel is the right surface for the intent plan and richer manual capability catalog.

- Opens as a bounded overlay above Obsidian, not a full route.
- Keeps current note title/path and selection state visible in the header.
- Includes a prominent action search.
- Uses top tabs: `Document`, `Vault`, `Setting`.
- Keeps a command search input visible in every tab.
- `Document` maps to Copilot/current-note work.
- `Vault` maps to Vault Intelligence with Analyze/Synthesize/Maintain modes.
- `Setting` maps to Manage System.
- Each tab includes an `Auto` primary action that starts the agent planner immediately.
- The `Auto` action inspects context, chooses relevant capabilities, runs safe discovery, and returns reviewable artifacts. It should not reveal a static grid first.
- Shows an auto-generated action plan after selecting a hub.
- Shows recommended capabilities first with reasons.
- Shows grouped action cards with scope badges and mutation/risk badges.
- Includes a selected-action detail/configuration area when useful.
- Routes mutating or multi-result actions into the review/apply panel.

The full action catalog should be discoverable here, not crammed into the docked side panel.

## Action Taxonomy Changes

The current action taxonomy should become a capability registry consumed by intent hubs.

| Current exposed choices | Proposed user-facing workflow | Notes |
| --- | --- | --- |
| Suggest Links, Suggest Links (Graph), Find Related, Smart Connections | Connect Related Notes | Internal signals become badges: semantic, graph, backlink, agent, co-citation |
| Extract Todos, Check Task List, Find & Solve Tasks | Task Review | Modes: scan, review, solve, create follow-up |
| Polish Document, Format Polish, Correct Content, Review Article | Improve Current Note | Issue categories: structure, facts, style, formatting, citations |
| Vault Health, Deduplicate Scan, Batch Tag Suggestions, Detect & File | Vault Intelligence / Maintain | Issue cards with severity, confidence, review/apply/ignore |
| Knowledge Gaps, Vault Summary, graph/hub signals | Vault Intelligence / Analyze | Source-backed digest, scope drilldown, suggested next actions |
| Synthesize Topic, research draft, source-backed article | Vault Intelligence / Synthesize | Source-cited artifacts, save-as-note flow, refinement controls |
| Prompt Audit, Run Workflow | Advanced / Manage System | Hidden from normal daily actions unless advanced mode is enabled |
| Translate | Contextual action only | Show when selection/language mismatch makes it relevant |

## Intent Orchestration Requirements

Every intent hub should run through a shared planning model.

### Plan Inputs

- Current note text and metadata.
- Selection/cursor/heading state.
- Folder/project/topic scope.
- Existing links/tags/tasks.
- Index and graph readiness.
- Recent vault health signals.
- User preferences and dismissed recommendations.

### Plan Output

Each planned capability includes:

- capability id,
- user-facing label,
- reason,
- scope,
- expected output,
- estimated runtime/cost when useful,
- mutation risk,
- run mode,
- review surface.

Run modes:

| Mode | Meaning |
| --- | --- |
| Auto-discover | Safe scan/search/read can run automatically. |
| Ask first | Needs confirmation before running. |
| Manual only | Hidden from the auto plan unless searched or explicitly chosen. |
| Auto-apply never | Mutations require preview/apply. |

Examples:

- Copilot may auto-discover related links and evidence candidates, but cannot insert them without review.
- Vault Intelligence may auto-run a scoped Analyze/Synthesize scan, but should ask before full-vault expensive scans.
- Translate remains manual/contextual unless language mismatch is detected.
- Prompt Audit remains Manage/System, not daily Copilot.

## Capability Visual Storyboards

Each hub and capability should have one visual storyboard card so the team can discuss behavior without collapsing back into a raw action grid.

Storyboard fields:

- trigger: where the feature starts,
- system work: what the planner/capability does automatically,
- output: what the user receives,
- review artifact: the actual decision surface,
- mode: auto-discover, ask-first, or manual,
- safety tags: scope, preview/diff, provenance, and no-auto-apply rules.

The initial gallery is persisted at `docs/gstack/copilot-command-center-redesign-2026-05-14/prototypes/capability-visual-gallery.html`.

## Shared Copilot Lifecycle

All Copilot actions should use the same state model:

1. Configuring
2. Running
3. Result ready
4. Previewing change
5. Applied
6. Skipped
7. Failed

### Shell Requirements

- One stable back affordance.
- Stable title/icon/scope/status layout.
- Running-state cancel only while running.
- Completed-state primary actions relevant to result: Apply, Insert, Save, Copy, Review.
- Trace defaults collapsed as `Inspect run details`.
- Error and empty states explain what was checked and what to try next.
- Shell variants should share primitives across docked panel, pop-out command panel, and review/apply panel.
- Pop-out panels must preserve Obsidian context and close/return predictably.

## Workflow Requirements

### Connect Related Notes

Result should be link proposals, not a paragraph.

Each proposal includes:

- Source sentence or paragraph.
- Proposed anchor text.
- Target note.
- Suggested insertion position.
- Signal badges.
- Confidence.
- Reason.
- Diff preview.
- Actions: apply selected, open targets, ignore, save suggestions.

### Add Evidence

Result should be evidence candidates.

Each candidate includes:

- Source note link.
- Quote or excerpt.
- Relevance reason.
- Confidence.
- Suggested insertion text.
- Target location.
- Actions: insert selected evidence, copy evidence block, open sources, refine.

### Improve Current Note

Result should be issue cards and fix previews.

Each issue includes:

- Issue type.
- Severity.
- Affected section.
- Recommendation.
- Generated fix when available.
- Diff preview.
- State: warning, fix ready, fixed, skipped, manual review.
- Actions: generate fix, accept, reject, regenerate, undo.

### Full-Document Rendered Diff

Any whole-document, multi-heading, or multi-paragraph mutation should use a full document review surface, not a tiny side-panel diff.

This applies to:

- polish,
- format polish,
- correction batches,
- review article fixes,
- rewrite or expand current note,
- summary insertion when it changes document structure,
- source-backed synthesis insertion.

Requirements:

- Show current rendered Markdown on the left.
- Show proposed rendered Markdown on the right.
- Preserve document context around every changed block.
- Highlight changed blocks inside the rendered Markdown view.
- Use explicit red deletion rails and green addition rails, plus `-` / `+` labels or equivalent markers, so the user can distinguish removed and added content without relying only on background color.
- Scroll the panes together when possible.
- Allow per-block accept/reject.
- Provide apply selected, reject all, and undo affordances.
- Keep raw Markdown/source diff behind an `Inspect source` or advanced control, not as the default review surface.

### Vault Intelligence / Maintain Queue

Result should be a maintenance dashboard, not raw counts.

Each issue card includes:

- Issue type.
- Affected notes.
- Why it matters.
- Confidence.
- Risk level.
- Suggested action.
- Backup/recovery note for destructive operations.
- Actions: review, open, ignore, apply with preview.

### Vault Intelligence / Synthesize

Result should be a saved-note-ready artifact.

Each artifact includes:

- Rendered Markdown preview.
- Source notes grouped by claim/theme.
- Excluded/skipped notes when useful.
- Suggested next actions.
- Save target path and duplicate warning.
- Refinement chips: shorter, project-grouped, decisions only, include tasks.

## Recommendation Engine Requirements

Recommended actions should explain their trigger.

Examples:

- `Recommended because this note has no tags.`
- `Recommended because 9 related notes exist but no outgoing wiki-links.`
- `Recommended because this paragraph makes a claim without evidence.`
- `Recommended because the note is long enough to split.`
- `Recommended because vault health found duplicate groups.`

Inputs:

- Current note metadata.
- Selection state.
- Cursor/heading location.
- Folder/project.
- Tag/link density.
- Search/index readiness.
- Graph signals.
- Recent vault health findings.
- User-dismissed recommendations.

## Non-Goals

- Do not make a standalone full-page Command Center the primary user experience.
- Do not require users to leave the active note before invoking normal Copilot actions.
- Do not force every catalog/configuration/review surface into the narrow docked side panel.
- Do not add more top-level action cards before merging duplicates.
- Do not expose raw agent traces as the primary result.
- Do not auto-apply document mutations.
- Do not require the user to choose between semantic, graph, and agent strategies.
- Do not make Prompt Audit and workflow automation normal daily-user actions.
- Do not redesign unrelated Chat UI in this phase.

## Success Criteria

- A user can open the Peak Assistant panel beside the current note and understand the top 2-3 recommended actions without knowing internal implementation terms.
- A user can click `Copilot` and receive an auto-generated plan of relevant capabilities for the current note.
- A user can click `Vault Intelligence` and receive a scoped plan across Analyze, Synthesize, and Maintain modes.
- A user can trigger a recommended capability from the panel or quick invoke path without navigating a full page.
- A user can pop out a larger command panel to browse and configure many actions without losing the active-note context.
- All document-changing actions provide a preview or diff before applying.
- Completed agent runs show result artifacts first and trace second.
- Link/tag/evidence/task/correction results share a recognizable review pattern.
- Empty and low-confidence states explain why nothing happened.
- Phase W and AE manual validation can be run against the new interaction model.

## Open Questions

- Which quick invoke surfaces should ship first: command palette, selection context menu, panel shortcuts, toolbar, or slash-style action search?
- What exact trigger opens the pop-out command panel: ribbon icon, side-panel expand button, command palette command, or all of them?
- Should the pop-out command panel first show intent hubs, the latest auto plan, or manual action search?
- When does a panel action need an expanded drilldown, and when should it stay entirely inside the panel?
- What is the minimum viable planner: rule-based triggers first, LLM planner, or hybrid rules + LLM explanation?
- Which actions should support quiet ambient suggestions in the editor gutter/sidebar?
- What is the minimum undo/recovery layer for tag/link/frontmatter changes before destructive vault maintenance is allowed?
- Should advanced actions be hidden behind settings, a mode switch, or search-only discovery?
