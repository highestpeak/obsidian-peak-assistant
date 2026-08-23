# Vault Intelligence Scan / Work Queue / Result parity closure

Date: 2026-08-23

Reference: `docs/gstack/vault-intelligence-workspace-2026-08-12-v2/index.html`

Protected surfaces: Overview, Vault Map, Vault Contents, Activity, and the top-level IA were not part of this implementation.

## Why the earlier implementation stayed far from the Mock

The earlier production page retained two competing implementations:

- Run Progress mounted the old `Scanning the Vault` hero, generic overall facts, rectangular stage tabs, and an inset generic stage panel. New workbench content was inserted inside that old hierarchy.
- Result dialogs mounted a new task-specific summary above the old generic decision matrix. CSS then tried to make both trees coexist.
- The development harness loaded generated `styles.css`; source changes in `src/styles/peak-components.css` were invisible until the CSS pipeline ran.
- The visual fixture represented a different state from the reference: Index was complete while AI was running, whereas the reference shows Index and AI concurrently live.
- Runtime receipts, checkpoint state, suggestion refresh, and fresh verification were incomplete, so the UI could not truthfully render the Mock state even when its labels existed.

The fix therefore replaced the live render trees and runtime contracts instead of continuing to style the retired subtree.

## Mock to production mapping

| Mock subtree | Production subtree |
| --- | --- |
| Progress hero + progress band | `RunProgress` / `.pk-vi-run-overview` |
| Connected four-stage track | `.pk-vi-run-stage-tabs` with runtime-derived concurrent live stages |
| Discover panel | `DiscoverRunWorkspace` |
| Build Index document workbench | `IndexRunWorkspace` |
| Plan / per-document enrichment / Vault-wide lifecycle | `AiRunWorkspace` + `RunOperation` |
| Runtime evidence stream | `.pk-vi-operation-live` using bounded `liveEvidence` |
| Work Queue | `WorkSurface` with receipt-backed suggestion refresh |
| File property result | `PropertyReviewCollection` |
| Note split result | `NoteSplitCollection` |
| Other nine result families | one canonical `.pk-vi-review-table.is-<kind>` projection with kind-specific columns, choices, evidence, and empty geometry |
| Proposal / Apply / re-index / Verify | `ProposalWorkspace`, `TaskWorkflowProgress`, and `VaultIntelligenceRuntime` lifecycle states |

## Closed P0/P1 root causes

- **STATE_MISMATCH**: live stage selection now follows runtime truth; inspecting a prior stage is separate and `Follow live` restores the live stage; completed runs route once into Completed.
- **STATE_MISMATCH**: pause retains a per-document durable cursor; resume excludes completed Core Search paths; stop prevents the next document and blocks late terminal events.
- **STATE_MISMATCH**: partial/skipped/failed are not inserted into `completedStages`; 100% comes from a frozen work-unit ledger.
- **DATA_CONTRACT_MISMATCH**: selected profile/model routes reach Plan, per-document enrichment, and Vault Review calls; planned and actual routes remain in attempt receipts.
- **DATA_CONTRACT_MISMATCH**: receipt-less provider work is not presented as successful AI completion; shared Vault Review rows retain a stable execution ID and shared receipt.
- **DATA_CONTRACT_MISMATCH**: Vault Review findings enter canonical maintenance atoms with stable semantic identity and provenance.
- **DATA_CONTRACT_MISMATCH**: `Update suggestions` performs a real configured-model call, stores usage/route/status, and never overwrites the owner choice.
- **DATA_CONTRACT_MISMATCH**: Apply is source-hash guarded; re-indexing and fresh verification are distinct observable states; unresolved fresh evidence enters Recovery.
- **STRUCTURE_MISMATCH**: the retired `TaskSpecificWorkspace` and its result-card CSS were deleted. Result dialogs mount one reference-compatible subtree, not stacked old and new workspaces.
- **STRUCTURE_MISMATCH**: Run Progress now uses the Mock hierarchy and stage-specific workbenches; the generic hero, rectangular stage tabs, and generic stage progress bar are gone.
- **HOST_ENVIRONMENT_MISMATCH**: active-run button, breadcrumb, grid, typography, and fixed marker geometry are scoped under `.peak-vault-intelligence-view .pk-vi-run-page`; source CSS is verified only after the production CSS pipeline.

## Honest data-dependent deltas

The QA fixture has two or three real atomic items for several result families while the Mock examples contain five to forty-three rows. Production keeps the same table/modal geometry and renders only the available atoms; it does not fabricate rows or distributions. Consequently the following screenshot heights differ by row count, not by a hidden or alternate subtree:

- properties, broken links, community membership, knowledge connections;
- note split;
- unreadable files.

Related notes, Community structure, Community indexes, content lifecycle, and unusual notes are within approximately 1-17 CSS pixels of the reference modal height at the fixed fixture.

## Verification

- Focused tests: `vault-intelligence-rendered-parity`, `vault-intelligence-runtime`, and `vault-intelligence-standalone-contract` pass.
- Production build, bundle syntax checks, disposable-worker boundary, and simulator boundary pass.
- Harness viewport: 1512 x 982 CSS pixels, DPR 1.
- Harness interaction assertions pass for concurrent live stage selection, stable-prefix evidence, actual route, all 11 result kinds, filtering, owner choice, Escape, outside click, and focus restoration.
- Visual evidence directories:
  - `.dev/harness/shots/vault-intelligence-scan-work-result-20260823/`
  - `.dev/harness/shots/vault-intelligence-results-20260823/`

## Unverified boundary

No Obsidian CDP listener was available. Therefore real-host computed geometry, host font metrics, focus-visible, pointer corridor, plugin-only reload, and visible Obsidian screenshots remain:

- `INTERACTION NOT VERIFIED`
- `VISUAL NOT VERIFIED`

Harness evidence is characterization and comparison evidence only; it is not promoted to real-Obsidian acceptance.

## Commit boundary

The starting worktree already contained overlapping modifications in the runtime, workspace, types, templates, tests, generated CSS, and build outputs. A task-owned commit cannot be separated safely without including earlier/user-owned changes. No commit was created.
