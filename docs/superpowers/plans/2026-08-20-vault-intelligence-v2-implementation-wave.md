# Vault Intelligence V2 implementation wave

## Impact Contract

### Primary outcome

Turn the audited V2 design into a truthful Obsidian workflow: every reachable
Vault Intelligence state must have the correct owner-facing object, action,
write boundary and exit condition before visual parity is claimed.

### Required tracks

- state and route model for `Overview / Vault map / Work queue`, Scan setup,
  progress, completion, Map text and Proposal;
- Scan modes, resolved scope, deterministic checks, frozen plan, receipts,
  pause/stop/recovery and partial-result behavior;
- canonical maintenance atoms with domain-specific owner actions and return
  checkpoints for all eleven task kinds;
- guarded Proposal -> explicit Apply -> receipt -> re-index -> Verify for any
  user-file write;
- Contents/Activity shared selection and shared Cytoscape graph interactions;
- focused automated tests, production build, then real Obsidian QA when CDP is
  available.

### Optional tracks

- richer Chat, Project and Composer activity adapters, only where the existing
  durable records can provide explicit events;
- model-picker UI refinements after the runtime can return real available
  routes and estimates.

### Forbidden scope

- no fourth top-level tab, permanent graph drawer, synthetic counts, fake AI
  results, silent user-file write, second graph renderer or generic
  label-swapped maintenance form;
- no modification to existing roadmap, landing-page or unrelated uncommitted
  files.

### Minimum acceptable delta

- route, state and runtime models can represent every audited screen without
  pretending unavailable data exists;
- every task CTA reaches a domain-correct action or a truthful unavailable
  state, and no file-changing choice can become verified without Proposal,
  source guard, Apply receipt and recheck;
- focused tests and production build pass. Real-host interaction remains
  `INTERACTION NOT VERIFIED` until CDP evidence is captured.

### Stop and commit rule

Commit only task-owned production files, focused tests and this plan after the
implementation and verification gates pass. Do not stage pre-existing dirty
Mock, audit, roadmap, index or landing-page work.

## Execution order

1. Truth model and runtime ports.
2. Scan/Queue/Completed route closure.
3. Contents/Graph/Activity projection closure.
4. Domain owner surfaces plus Proposal/Apply/Verify.
5. Layout and visual convergence only after the above behavior is testable.

## Current implementation checkpoint

- Completed: persisted V2 state now carries guarded proposals and Map text;
  proposal state uses compact patch fragments plus source mtime and SHA-256,
  never a full source-note copy.
- Completed: supported broken-link redirects/removals now follow explicit
  decision -> guarded diff -> owner Apply -> re-index -> recheck -> Verify;
  unsupported task kinds remain visibly unavailable instead of claiming a
  fabricated proposal.
- Completed: selected Scan scope retains concrete paths plus file/folder/
  Community/saved-work selector evidence; Activity reads durable Chat and
  Composer events where timestamps actually exist; graph Communities can load
  members through the existing Review runtime.
- In progress: remaining task-kind workspaces still need their bespoke visual
  and action layouts before a complete mock-parity claim. This checkpoint does
  not claim real-Obsidian interaction acceptance because no CDP endpoint was
  available for this run.
