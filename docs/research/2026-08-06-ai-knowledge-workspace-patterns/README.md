# AI knowledge-workspace pattern study

**Date:** 2026-08-06
**Scope:** Marketing and product-design research only. No production implementation is authorized by this note.

## Goal

Study several successful Obsidian AI products to understand the user mental models that already work, then translate those patterns into Peak Assistant's own product language and architecture.

This is not a visual-copy exercise. Peak must not reproduce another product's layout, copy, colors, screenshots, iconography, or proprietary naming. Public Peak marketing should describe the capability category—Copilot, smart connections, graph, agent workspace—without comparison tables or competitor call-outs.

## Primary sources reviewed

- [Copilot for Obsidian documentation](https://www.obsidiancopilot.com/en/docs)
  - [Chat Mode](https://www.obsidiancopilot.com/en/docs/chat-mode)
  - [Custom Prompts](https://www.obsidiancopilot.com/en/docs/custom-prompts)
  - [Projects Mode](https://www.obsidiancopilot.com/en/docs/projects)
  - [Composer](https://www.obsidiancopilot.com/en/docs/composer)
- [Smart Connections repository](https://github.com/brianpetro/obsidian-smart-connections)
  - [Connections view guide](https://smartconnections.app/smart-connections/list-feature/)
  - [Smart Graph guide](https://smartconnections.app/smart-graph/)
- [Claudian repository and product overview](https://github.com/YishenTu/claudian)

Sources were reviewed for capability grouping, interaction hierarchy, and screenshots. No third-party asset is copied into the Peak site.

## Patterns worth learning

### 1. The current work is the default anchor

The strongest products do not begin with an empty universal prompt. They start from the current note, selection, project, or visible source set. Context is visible as a small, removable scope rather than hidden prompt assembly.

**Peak translation**

- Composer selection, block, document, Table, Base, Canvas, and Excalidraw scope.
- Composer Intelligence related material anchored to the focused block or current document.
- Search query, File Atlas neighbourhood, or selected Graph region as an explicit source set.
- Chat Studio project/resources and run snapshot as durable task context.

### 2. A suggestion becomes valuable only when it can change the work

Related-result lists are useful when the user can preview a result, decide whether the relationship is meaningful, and move a selected source into the next workflow. AI edits are useful when the user can inspect, accept, reject, or revert them.

**Peak translation**

- Related Materials preview and inspector instead of a score-only list.
- Open in File Atlas, inspect in Graph, ask Copilot, or continue in Chat.
- Candidate, receipt, History, and source-preserving review for AI changes.
- Treat similarity score as a ranking clue, never proof of a relationship.

### 3. Smart connections follow the work but can be frozen

A live current-note anchor reduces search effort. The user still needs a way to keep a useful scope stable while opening or comparing other material.

**Peak translation**

- Current document/focused block is the default anchor.
- Search sessions, saved reports, AI Graph versions, and Chat project context provide stable scopes.
- Future related-material refinement should support explicit keep/remove/reorder before a set becomes AI context.

### 4. Graph is a decision surface, not decoration

The useful graph workflow is `landscape -> region -> source set -> action`. Nodes must remain real notes or evidence-bearing artifacts that can be opened, inspected, selected, or passed forward.

**Peak translation**

- Search Result Graph for the evidence landscape.
- File Atlas Graph for local and two-hop neighbourhoods.
- Vault Intelligence Graph for hubs, gaps, structural holes, bridges, abandoned clusters, and drift.
- Immutable AI Graph artifacts for reviewed, versioned knowledge structures.
- From any graph: inspect source, focus neighbourhood, continue to Search/Composer/Chat, or create a reviewable context set.

### 5. Agent work needs an observable run surface

Agent products are understandable when the UI exposes file/resource context, plan or instruction mode, tool activity, proposed edits, approvals, session history, and runtime choice without dumping raw protocol events onto the user.

**Peak translation**

- Chat Studio owns projects, conversations, assistants, resources, artifacts, variants, branching, and media.
- Peak Harness owns tools, permissions, budgets, cancellation, trace, and recovery.
- MCP, Skills, and reviewed external plugin commands extend the task surface.
- AI Control Center should govern action-level model, tool, approval, budget, output, and receipt policy across all AI consumers—not create another Chat-only runtime.

## Marketing structure adopted for Peak

Public copy now groups Peak into three familiar modes:

1. **A Copilot inside the document** — exact scope, source-aware action, reviewable change.
2. **Smart connections around the work** — related material, semantic lookup, Graph, hubs, gaps, and context handoff.
3. **An agent workspace across the task** — projects, tools, permissions, multi-step runs, artifacts, and recovery.

Peak's differentiated claim is the shared evidence layer beneath all three, plus the broader Search, File Atlas, Graph, Vault Intelligence, media, multi-provider, operations, and Peak Sheet product universe.

## Explicit non-copy rules

- Do not copy third-party screenshots into Peak marketing.
- Do not reuse another product's exact hero structure, annotated callout style, feature order, color system, or input layout.
- Do not use competitor names in public comparison copy unless a future legal/marketing review explicitly approves it.
- Do not imply compatibility, endorsement, migration, or feature parity based on this research.
- Do not claim an interaction is shipped merely because the same category exists elsewhere or a Peak design mock exists.

## Status boundaries

- Current Peak source contains substantial Search, Graph, Vault Intelligence, Chat Studio, multi-provider, Harness, MCP, Skills, media, and operations foundations.
- Peak Composer, File Atlas, Command Center, related-material/Intelligence data paths, and some media routes retain explicit QA or provider-validation boundaries.
- AI Control Center/My Content and Provider Capability Gateway remain closure work, not finished public claims.
- Peak Sheet and advanced Graph modes remain design/research directions.
