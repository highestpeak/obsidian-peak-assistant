# Intent Hub / Auto-Orchestration Review

Date: 2026-05-14

Status: design correction after re-reading the original screenshot annotations. Product/design only; no implementation has started.

## What Was Still Misread

The previous corrections focused too much on surfaces:

- narrow side panel,
- pop-out command panel,
- review/apply panel.

Those surfaces are still useful, but they are not the core idea in the original annotations.

The deeper original request is:

> Clicking a high-level entry like `Copilot` or `Vault Intelligence` should let the system automatically decide which underlying capabilities to call, instead of asking the user to manually pick from a large action grid.

So the product should not be primarily an action catalog. It should be an intent hub with an auto-orchestrator.

## Evidence From The Original Annotations

The hand-drawn architecture points to:

- one unified command panel, similar to IntelliJ command search,
- top-level entries like `copilot`, `knowledge`, and `manage / misc / settings`,
- automatic recommendations for document workflows such as split, tags, links, and writing,
- manual triggers as a fallback, not the center,
- a run stage with search/read/identify steps,
- a final review stage with steps, summary, diff, and apply output back to the document.

The later annotated screenshots reinforce the same direction:

- `Suggest Links` and `Suggest Links (Graph)` should merge.
- A link workflow can use agent, semantic search, graph, and other strategies internally.
- The final output should not be a text paragraph; it should become concrete actions and diffs.
- The user wants Copilot to automatically recommend actions.
- Each action should still be manually selectable if the user wants control.
- Some actions should disappear unless context makes them relevant, such as `Translate` or `Rewrite Selection`.
- Document, Vault, Writing, and Knowledge categories are currently confusing because actions overlap across them.

## Correct Product Model

The product should have two layers:

### 1. Intent Hubs

Intent hubs are what the user clicks.

Examples:

- `Copilot`
- `Vault Intelligence`
- `Manage System`

An intent hub is not a static tab. It is a workflow entry that first analyzes context, then proposes or runs a bundle of capabilities.

`Knowledge Analysis`, `Research / Synthesize`, and `Maintain Vault` should not remain as competing top-level hubs. They should become modes inside `Vault Intelligence`:

- `Analyze`: related notes, knowledge gaps, graph signals, vault summary.
- `Synthesize`: topic synthesis, cited draft, source-backed report.
- `Maintain`: vault health, duplicates, filing, batch tags, stale notes, task review.

### 2. Capabilities

Capabilities are what the system calls.

Examples:

- suggest tags,
- connect related notes,
- add evidence,
- review/fix content,
- suggest split,
- summarize,
- detect tasks,
- find knowledge gaps,
- synthesize topic,
- vault health,
- deduplicate scan,
- detect and file,
- suggest diagram / image / example.

Capabilities should not all be equally visible as top-level buttons. They are tools available to the orchestrator.

## Copilot Hub

`Copilot` should mean:

> Analyze the current note or selection and decide what would most help this document now.

Default behavior:

1. Read current note context:
   - selection,
   - cursor/heading,
   - note length,
   - tag/link density,
   - claims without evidence,
   - structure quality,
   - tasks,
   - visual/diagram opportunities.
2. Produce an action plan:
   - recommended now,
   - optional,
   - not relevant,
   - blocked / needs index or selection.
3. Run safe discovery steps automatically when appropriate:
   - find related notes,
   - find evidence candidates,
   - inspect tags,
   - detect candidate splits,
   - identify tasks.
4. Present reviewable results:
   - link proposals,
   - tag proposals,
   - evidence candidates,
   - issue/fix cards,
   - visual/diagram suggestions,
   - diff previews.
5. Never auto-apply document mutations by default.

`Copilot` should not simply open a grid of document actions.

## Vault Intelligence Hub

`Vault Intelligence` should mean:

> Analyze, synthesize, or maintain the current note neighborhood, folder, topic, or vault area.

Default behavior:

1. Determine scope:
   - current note neighborhood,
   - current folder/project,
   - selected topic,
   - full vault only when explicitly requested.
2. Choose the mode:
   - Analyze,
   - Synthesize,
   - Maintain.
3. Choose relevant capabilities:
   - related notes / smart connections,
   - knowledge gaps,
   - topic synthesis,
   - vault summary,
   - hub / structural hole signals,
   - stale or orphan notes,
   - task extraction,
   - duplicate detection when maintenance is intended.
4. Return a digest, artifact, or review queue:
   - insights first,
   - source notes and provenance,
   - suggested next actions,
   - save-as-note or create-task options,
   - drilldown into raw scans only when needed.

`Vault Intelligence` should not ask the user to choose between `Knowledge Gaps`, `Synthesize Topic`, `Smart Connections`, `Vault Summary`, `Vault Health`, and `Deduplicate Scan` before it has understood scope and intent.

## Action Planning Model

Every intent hub should produce an action plan before running risky or expensive work.

Each planned capability has:

- capability id,
- user-facing label,
- reason,
- scope,
- expected output,
- cost/runtime estimate,
- mutation risk,
- run mode,
- review surface.

Run modes:

| Mode | Meaning |
| --- | --- |
| Auto-discover | Safe scan/search/read may run automatically. |
| Ask first | Needs user confirmation before running. |
| Manual only | User explicitly chooses it from the catalog. |
| Auto-apply never | Any mutation requires preview/apply. |

This resolves the current ambiguity between automatic recommendations and manual actions.

## UI Implication

The UI should lead with intent hubs, not the full action catalog.

### Docked Panel

Shows:

- current context,
- `Run Copilot scan`,
- top 2-3 recommended actions generated by the latest scan,
- pending review queue.

### Pop-Out Command Panel

Shows:

- top tabs like the existing Search view: `Document`, `Vault`, `Setting`,
- a command search input visible in every tab,
- active tab styling from the Search reference: purple underline, soft gray inactive tab background, large rounded command field,
- `Document` mapped to Copilot,
- `Vault` mapped to Vault Intelligence,
- `Setting` mapped to Manage System,
- an `Auto` primary action in every tab that starts the agent planner immediately,
- an auto-generated plan after selecting a hub,
- scoped command results as secondary/manual controls,
- advanced capability catalog only after search or explicit expansion.

### Review / Apply Panel

Shows:

- result artifacts from multiple capabilities,
- grouped by user decision:
  - apply to note,
  - save as note,
  - create task,
  - ignore,
  - inspect sources.

## What The Current Catalog Should Become

The existing action grid should become a capability registry, not the primary product face.

Examples:

| Current card | New role |
| --- | --- |
| Suggest Tags | Capability used by Copilot note scan and manual command. |
| Suggest Links / Suggest Links (Graph) | One `Connect Related Notes` capability with multiple internal signals. |
| Review Article / Correct Content / Polish Document / Format Polish | One `Improve Current Note` capability family with issue categories. |
| Extract Todos / Check Task List / Find & Solve Tasks | One `Task Review` capability family. |
| Knowledge Gaps / Vault Summary / graph signals | Capabilities inside `Vault Intelligence / Analyze`. |
| Synthesize Topic / source-backed report | Capabilities inside `Vault Intelligence / Synthesize`. |
| Vault Health / Deduplicate Scan / Detect & File | Capabilities inside `Vault Intelligence / Maintain`. |
| Prompt Audit / Run Workflow | Advanced/manage capabilities, not daily Copilot defaults. |
| Suggest Image / Diagram / Example | Important document-enrichment capabilities; should be considered by Copilot scan. |

## New Product Principle

Old framing:

> Show the user many actions in a better panel.

Correct framing:

> Let the user click an intent hub, then have Peak Assistant decide which capabilities are relevant, run safe discovery, and present reviewable actions.

The user should still be able to manually search any capability, but manual selection is the fallback path, not the main path.
