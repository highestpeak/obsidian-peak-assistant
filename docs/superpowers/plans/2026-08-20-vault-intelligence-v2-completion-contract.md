# Vault Intelligence V2 completion contract

## Delivery boundary

This is the production contract for the V2 workspace, not a second mock or a partial visual pass. The workspace is one state machine with three primary surfaces: `Overview`, `Vault map`, and `Work queue`. Scan setup, progress, completed results, map text, and each maintenance task are routed states inside that workspace.

## Required screen coverage

- Overview: readiness, object entry points, recorded activity, current Scan status, and owner work. It must not introduce a separate routing or Runs information architecture.
- Scan setup: explicit scope; 5 / 4 / 8 / 2 owner-facing tasks backed by 19 deterministic checks; a 14-output Knowledge Index plan; all 10 routed operations; frozen provider/model/cost estimates and an explicit no-write boundary.
- Run progress: discover, Index, AI, and publish stages; operation-level status, actual/shared usage, timestamps, errors, and runtime evidence disclosure.
- Completed: automatic outputs and receipts first, run details second, then only unresolved owner work.
- Vault map: actual file-type evidence; Cytoscape Community/Topic/Hub graph; constrained expansion; map text drafts, history, publish and keep decisions tied to the Index fingerprint.
- Activity: source-labelled timelines, durable work sessions, ranges, and explicitly triggered, cited evidence themes. Empty data must remain empty rather than becoming an inferred story.
- Work queue: only work with an owner action and a verifiable exit condition.
- Maintenance: all 11 task kinds retain dedicated domain evidence, source boundary, item decisions, projections, and their own specialized explanatory frame.
- Proposal review: every source change is concrete, individually selectable, source-hash guarded, applied only after a selection, then re-indexed and verified.

## Runtime and persistence rules

- Scan uses a frozen plan. Scope, selected checks, enabled Index outputs, routes, estimates, and user-file boundary are visible before start.
- Index and review stages can overlap only after Discover has frozen the scope. Shared review operations report one provider receipt, not invented duplicated cost.
- Peak-owned state uses the registered Vault Intelligence JSON/JSONL outputs. User-file changes remain the registered accepted-writeback output and are possible only through the guarded proposal path.
- Map text and activity themes are Peak-owned annotations. Map text records revision status and Index fingerprint; activity themes retain explicit record citations and a source revision.
- The runtime preserves legacy `relationship-review` plans only as a read migration to `relationship-discovery`; new plans use the ten V2 operation identifiers.

## Acceptance gates

1. Targeted model, runtime, standalone-contract, and rendered-parity tests cover the V2 counts, state transitions, source guard, selectable diffs, output disclosure, map-text history, and cited activity themes.
2. Production build succeeds.
3. Full-suite failures must be separated into task-caused versus pre-existing/unrelated evidence; the task may not be declared green by a targeted suite alone.
4. A real Obsidian CDP session is required for final interaction evidence. Without an available renderer debugging port, layout/interactions remain `INTERACTION NOT VERIFIED`; build and static render evidence do not upgrade that status.
