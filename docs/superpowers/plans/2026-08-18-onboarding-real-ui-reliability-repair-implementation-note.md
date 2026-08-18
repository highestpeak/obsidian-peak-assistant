# Onboarding Real-UI Reliability Repair — Implementation Note

## Outcome

Peak Assistant onboarding now uses one recoverable five-step flow:

`Connect AI → Core models → Prepare vault → System check → Try Peak`

The production implementation no longer treats a clicked Provider, a saved model ID, a downloadable SQLite binary, or a visible progress card as proof that the dependency is ready. Each step consumes runtime evidence and preserves enough state to resume safely.

## What changed

### Connections

- A connection is Ready only after authentication, model-catalog loading, and a minimum generation request all succeed.
- Saved connections remain selectable and editable after verification.
- Failed connections keep their own Needs attention state; another verified connection can still unblock Continue.
- Add connection has an explicit Back path and does not publish a tested-but-unsaved profile as ready.
- Provider base URLs are normalized without duplicating `/v1`; Ollama probes its actual local catalog and a discovered installed model.
- Discovered runtime models are merged into the shared model catalog before the model step opens.

### Models

- Onboarding drafts store an explicit `Automatic` or `Fixed` assignment instead of overloading `null`.
- The shared model picker is searchable and grouped by Provider, supports many models per connection, restores focus, and stays open until the user selects or closes it.
- Conversation, knowledge, and Agent roles are checked independently.
- Peak Hermes remains the only Agent runtime. Its model choices require explicit tool-capability evidence.
- Applying core models updates the canonical Settings owner first and mirrors legacy ProfileRegistry role bindings only after the Settings write succeeds.

### Better SQLite and indexing

- Better SQLite repair now verifies the native binary, database integrity, and an actual temporary FTS5 write/read probe.
- Failed native-module download or load no longer falls through as success.
- An app-owned `IndexRunCoordinator` is the single owner for full indexing runs.
- Onboarding and the Knowledge Index workspace now start-or-attach to the same run.
- A ready full-text index is reused; an active run is attached; a failed run can be retried; a missing index starts one Fast run on Continue.
- Closing and reopening onboarding does not create a second in-process full indexing run.

### Flow and interaction

- The modal is singleton-owned, so repeated entry cannot stack duplicate wizards.
- Progress labels are full text, readable, and horizontally safe instead of truncated.
- Provider controls, model triggers, footer actions, and launch cards have explicit hit-target geometry that survives the Obsidian button reset.
- System Check displays sequential checking states for connection, role models, SQLite/FTS, index readiness, and safety.
- Finish later flushes the current draft before closing.
- Try Peak opens real Chat Studio, Vault Search, File Atlas, a recent Markdown note, or Composer; failure leaves the wizard open with a recoverable error.
- Configuration completion and first successful product launch are recorded separately.

## Verification

### Passed

- 14 onboarding/settings/index focused suites: all passed.
- Touched-file TypeScript diagnostic filter: no diagnostics.
- Production build: CSS pipeline, esbuild, bundle syntax checks, disposable document-worker boundary, and simulator boundary all passed.
- Full suite: 499 of 506 passed.
- The six normal baseline failures reproduce in the main checkout and are unrelated to this change: AI Search UI regression, code-block theme settings, Composer tag-candidate styling, generated-output registry, inline prompt policy, and planned-requirements production contract.
- `composer-data-store-hygiene` passes in the main checkout; its isolated-worktree-only failure comes from the linked worktree Git metadata not satisfying the test's `git check-ignore` subprocess.
- Diff whitespace check passed.

### Real Obsidian status

`INTERACTION NOT VERIFIED`

The real Obsidian app was visible, but no CDP listener was available and no DevTools console was already open. Per the repository QA protocol, no coordinate-click recovery, Command Palette reload, Settings-toggle reload, or screenshot-only acceptance was used.

The remaining host gate is therefore limited to runtime interaction evidence, not missing implementation:

- provider edit/test/back and one-ready-one-failed continuation;
- model picker open/close/search/select, Escape, and focus restoration;
- full progress-label geometry at the owner viewport;
- ready-index reuse and active-run attach without duplicate Notice or run;
- close/reopen during indexing;
- sequential System Check animation;
- all five Try Peak launches.

## Delivery

- Design and reliability contract: `docs/superpowers/specs/2026-08-18-onboarding-real-ui-reliability-repair-contract.md`
- Implementation plan and acceptance matrix: `docs/superpowers/plans/2026-08-18-onboarding-real-ui-reliability-repair-plan.md`
- Production implementation commit: `45c63567`
- Merge into the active main workspace branch: `e0da001b`

No unrelated dirty file from the main workspace was staged, modified, or reverted by this delivery.
