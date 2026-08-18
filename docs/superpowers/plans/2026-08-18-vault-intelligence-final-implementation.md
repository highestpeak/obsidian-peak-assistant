# Vault Intelligence final implementation contract

## Product boundary

Vault Intelligence is the owner workspace for understanding and maintaining the whole Vault. It is not another search mode, a generic health-score dashboard, or a Run-history product.

The global information architecture has exactly three destinations:

- **Overview** — neutral object inventory, current owner work, changes since the latest completed Scan, and raw activity.
- **Vault map** — indexed contents, verified Community structure, references, and file modification history.
- **Work queue** — durable unresolved maintenance with a real owner action and a verifiable exit condition.

Scan setup, progress, completion, and a maintenance task are routes inside this workspace. They are not additional global tabs. Completed Scan details remain receipts; there is no top-level **Runs** destination.

## Scan contract

A Scan follows one causal sequence:

```text
Setup -> Discover -> Build Index -> AI work -> Publish
      -> Completed automatically + owner follow-up
      -> Review / guarded handoff -> Verify
```

Setup freezes:

- scope: changed objects, explicitly selected files, or the entire Vault;
- enabled maintenance task kinds;
- AI and Index operations;
- the resolved provider and model for every operation;
- a scope-scaled planning estimate.

The current model binding is resolved again when the Run starts and is frozen into the Run. An unavailable binding is visible and disabled. Outputs sharing one real execution unit are coupled:

- file summaries and AI Tags share Index LLM enrichment;
- relationship review, Community analysis, file-proposal preparation, and maintenance synthesis share Vault Review.

The progress surface shows the frozen route, live progress, actual token use, and cost. Shared execution records usage once and points dependent outputs at that receipt so totals are never duplicated.

A stop request is checkpoint-safe. Completed stages survive and a reloaded in-flight Run becomes **interrupted**, so it can be resumed. Successful machine work remains in receipts; it does not become fake owner work.

## Maintenance contract

The Work queue covers eleven task kinds:

1. file properties;
2. broken references;
3. Community membership;
4. changed knowledge connections;
5. related or duplicate notes;
6. note splits;
7. Community structure;
8. Community index notes;
9. content lifecycle;
10. isolated or unusual notes;
11. unreadable documents.

Tasks are derived from current open lint evidence and real Index errors. There is one canonical task ID per kind. Batch, target, Community, lifecycle, error, and file views are projections over the same atomic choices; changing projections never duplicates or resets decisions.

Choice precedence is:

```text
current atomic owner choice
  > current owner default
  > current Peak suggestion
  > historical suggestion/evidence
```

Peak-owned choices may be recorded and verified here. A choice that would change Markdown, frontmatter, links, or create a file stays a proposal. Preparing that proposal captures a per-file source revision. If the source changes after the choice, the task enters **Recovery** instead of proceeding with stale evidence.

## Knowledge and persistence boundary

- User Markdown and native files remain user-owned.
- Community membership, typed relationships, lifecycle choices, Scan checkpoints, receipts, and task decisions are Peak-owned machine records.
- SQLite, FTS, vectors, graph aggregates, caches, and telemetry remain rebuildable local projections.
- Knowledge communities render through the shared Cytoscape `AtlasGraphCanvas`; no second graph runtime is introduced.
- Activity is explicitly raw file modification history. AI themes are not inferred without a separately routed, costed, and persisted operation.

Canonical durable records:

- `vault-intelligence.state` -> `records/vault-intelligence/state.json`;
- `vault-intelligence.events` -> `records/vault-intelligence/events.jsonl`.

The JSON snapshot owns the current checkpoint, latest completed receipt, tasks, choices, and recent activity. The JSONL stream owns the append-only audit history. Completed Runs are not persisted as active Runs.

## Entry and composition

- **Open Vault Intelligence** is one stable, owner-approved Command Palette entry routed through Command Gateway.
- Choosing Vault Intelligence from Quick Search closes that modal and opens the standalone owner workspace.
- The runtime is composed and disposed by `AppContext` through `AppRuntimeRegistry`; no service-layer runtime singleton is added.

## Verification contract

Required automated evidence:

- model tests for dynamic task derivation, stable IDs, projection evidence, choice precedence, and revision preservation;
- runtime tests for the four stages, frozen scope, selected task kinds, coupled operations, Apply/Verify, and stale-source Recovery;
- persistence tests for the JSON snapshot and idempotent JSONL events;
- source contracts for the three-tab IA, Quick Search handoff, shared Cytoscape graph, no raw buttons, and no direct user-file writer;
- focused integration tests and a production build.

Real Obsidian interaction acceptance still requires CDP evidence for navigation, Scan controls, graph selection, activity selection, task choices, responsive layout, keyboard focus, stop/resume, and reload recovery. Source inspection, unit tests, and a green build do not upgrade those interactions to verified.
