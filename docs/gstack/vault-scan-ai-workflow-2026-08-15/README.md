# Vault Scan AI workflow

This package now contains only the focused process companion for Vault Scan. The interaction itself lives in the broader Vault Intelligence V2 mock so there is one continuous workspace and one Scan implementation to review.

## Open the artifacts

- [Interactive Scan inside Vault Intelligence V2](../vault-intelligence-workspace-2026-08-12-v2/index.html?screen=setup) — Setup, live AI usage, grouped stop controls, Completed, and Work queue follow-up.
- [Readable Scan and follow-up flow](./scan-flow.html) — the larger-text companion diagram for user, local runtime, AI, receipts, proposal, Apply, and Verify.

The older standalone [`index.html`](./index.html) now redirects to the V2 workspace so reviewers cannot accidentally evaluate two competing Scan mocks. The existing screenshots remain historical evidence only.

## Product contract represented here

- Scan is a continuous `Setup → Progress → Completed → follow-up` flow, not a permanent Runs workspace.
- Changed files are the trigger set. Analysis also uses affected context and the complete current graph.
- Local facts run independently from optional AI operations.
- Every AI operation declares its provider/model, scope, estimated tokens, estimated cost, and cap before the run.
- Progress shows actual and projected token/cost totals plus a receipt for every AI operation.
- A queued AI operation can be skipped; a running operation can stop remaining calls. Completed local and AI results are retained.
- Reaching the budget cap stops new AI calls without discarding local results.
- Peak-owned machine knowledge may be updated inside the approved run. User files are never changed without a guarded proposal and explicit Apply.
- Completed shows what changed, what was skipped or partial, and what still needs user attention.
- Work queue receives durable Vault-maintenance follow-up, not every skipped AI operation or every unfinished Peak task.

## Mock boundaries

All file counts, model IDs, token totals, prices, timing, and findings are illustrative. The mock demonstrates the interaction and accounting contract only. It does not prove provider usage reporting, production persistence, proposal application, or real Obsidian behavior.
