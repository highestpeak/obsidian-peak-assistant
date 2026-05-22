# gstack Design Brief — Copilot / Command Center Multi-Panel Redesign

Create a product UI prototype for an Obsidian plugin called Peak Assistant. This is not a standalone web app page and not a large dashboard. The assistant lives inside Obsidian as intent hubs, a docked side panel, a larger pop-out command panel, focused review panels, and quick-invocation entry points.

## Product Goal

Turn Copilot / Command Center from a grid of AI features into a fast Obsidian-native intent hub and panel system.

The user should be able to:

- keep writing in the current note,
- click high-level entries such as `Copilot` or `Vault Intelligence`,
- have the system analyze context and choose relevant capabilities automatically,
- quickly invoke a manual action from the docked panel, selection, command palette, context menu, toolbar, or pop-out command panel,
- see only the most relevant recommendations in the docked panel,
- open a larger bounded pop-out panel when they need to browse many actions or configure a workflow,
- understand why an action is recommended,
- review concrete results with provenance and preview/diff before applying anything.

## Core Principle

The note is the workspace. The assistant is an intent orchestrator shown through layered Obsidian-native panels.

Short form:

> Do not make the user choose among every tool. Let them click an intent hub, auto-plan the relevant capabilities, and pop out more room only when the task needs it.

## Audience

Obsidian users who write, research, review, and maintain a long-lived knowledge base. They want help while staying in flow. They do not want to choose internal AI strategies or navigate an extra product surface before improving a note.

## Surfaces To Represent

### 1. Intent Hub Layer

Show high-level entries first:

- Copilot,
- Vault Intelligence,
- Manage System.

`Vault Intelligence` contains three internal modes:

- Analyze,
- Synthesize,
- Maintain.

The selected hub should produce an auto-plan:

- context/vault scan result,
- recommended capabilities,
- optional capabilities,
- irrelevant/hidden capabilities,
- safe auto-discovery vs ask-first vs manual-only modes.

### 2. Obsidian Side Panel

Show:

- current note context,
- selected text state,
- folder/project,
- index/graph health,
- compact command search,
- 2-3 recommendations with reasons,
- small grouped action entry points,
- recent or pending review items.

The panel should fit a normal Obsidian right sidebar width, roughly 320-420px.

### 3. Quick Invocation Layer

Show one lightweight way to call the assistant without browsing a page:

- command palette row,
- context-menu action from selected text,
- slash-style action search,
- or compact toolbar action.

This layer should route into the panel or a focused review drilldown.

### 4. Pop-Out Command Panel

Show a larger centered panel above the Obsidian workspace, similar to a native modal/panel.

Show:

- current note / selection / folder context,
- search across actions, skills, recent runs, and settings,
- sections such as Intent Hubs, Recommended Plan, Manual Capabilities, Manage,
- auto-generated action plan after the user clicks `Copilot` or `Vault Intelligence`,
- recommended actions with reasons,
- grouped action catalog with scope and risk badges,
- selected action detail/configuration area.

This panel is the correct place for many actions. It should feel like an Obsidian overlay, not a separate web page.

### 5. Result Review Drilldown

Show a selected workflow such as Connect Related Notes or Add Evidence.

Show:

- inferred scope,
- result cards,
- source/provenance badges,
- confidence and reason,
- preview/diff before apply,
- apply selected, open sources, ignore, save,
- collapsed run details.

### 6. Multi-State Flow

Represent the workflow as states rather than one page:

1. high-level intent selected,
2. context/vault scan,
3. auto action plan,
4. safe discovery run,
5. reviewable result,
6. preview/apply,
7. applied record or undo.

## Visual Tone

- Obsidian-native, quiet, utilitarian, professional.
- Dense but readable.
- Compact controls by default, larger pop-out panels when the task needs clearer operation.
- Avoid decorative landing-page style.
- Avoid huge hero sections, gradient orbs, oversized radius, and oversaturated palettes.
- Color should communicate type and risk:
  - blue for current note / information,
  - green for safe apply,
  - amber for review needed,
  - red only for destructive risk,
  - purple only as a restrained accent for AI/provenance.

## Important UX Requirements

- Current conforming visual baselines:
  - `assets/search-like-tabs-auto-agent-codex-imagegen.png`
  - `assets/obsidian-panel-flow-codex-imagegen.png`
- The current note/editor remains visually dominant.
- The docked side panel is the daily home.
- The pop-out command panel is the intent hub planner plus manual capability browser, presented as top tabs like the existing Search view.
- The pop-out tabs are `Document`, `Vault`, and `Setting`; each tab keeps a command search input visible.
- The top tab styling should match the provided Search reference: active purple underline, soft inactive tab area, large rounded command input.
- Each tab includes an `Auto` action; clicking it starts the agent planner immediately, which selects capabilities and runs safe discovery.
- The review/apply panel is the safe mutation surface.
- The action catalog is secondary; `Copilot` and `Vault Intelligence` should auto-plan first.
- `Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` are modes inside `Vault Intelligence`, not competing top-level entries.
- None of these should become a standalone full-page app.
- The completed agent trace is collapsed by default.
- Raw markdown/JSON must not be the main result.
- All document mutation actions require preview or diff.
- Every recommendation needs a reason.
- Strategy names such as semantic, graph, agent, backlink, co-citation should appear as provenance badges, not top-level actions.
- Advanced actions such as Prompt Audit and Run Workflow should be hidden behind search, advanced mode, or Manage System.

## Preferred Direction

Use an Obsidian desktop frame and represent at least two panel sizes:

- Left: faint file explorer.
- Center: the active Markdown note and selected paragraph.
- Right: Peak Assistant docked side panel.
- Overlay: compact command palette or context action.
- Center overlay: pop-out command panel for action browsing/configuration.
- In that overlay: show top tabs `Document`, `Vault`, and `Setting`, plus a command input and visible `Auto` action.
- In the `Document` tab: show `Copilot` creating a recommended action plan that calls capabilities such as Connect Related Notes, Add Evidence, Improve Current Note, Suggest Diagram, while hiding irrelevant actions such as Translate.
- In the `Vault` tab: show `Vault Intelligence` modes for Analyze, Synthesize, and Maintain.
- In the `Setting` tab: show model, index, provider, skill, prompt, and diagnostics commands.
- Focused overlay/drawer: review/apply panel for Connect Related Notes.

Include realistic labels from the current product:

- Connect Related Notes
- Add Evidence
- Improve Selected Paragraph
- Vault Maintenance Queue
- Review Tasks
- Suggest Visual
- Suggest Diagram

## Anti-Goals

- Do not make a standalone Command Center page.
- Do not use a big three-column SaaS workbench as the main direction.
- Do not force the whole action catalog into the narrow docked side panel.
- Do not treat `Copilot` or `Vault Intelligence` as static tabs that only reveal more cards.
- Do not show 25 equal action cards with no hierarchy.
- Do not make agent trace the center of attention.
- Do not imply auto-apply for risky changes.
- Do not require the user to choose between semantic and graph strategies.
