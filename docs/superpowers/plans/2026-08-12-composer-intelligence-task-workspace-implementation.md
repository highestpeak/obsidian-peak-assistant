# Composer Intelligence Task Workspace — Implementation Plan

## Tracks

- [x] Extend the app-owned workspace ledger with task upsert/remove/activate
  events and compaction.
- [x] Add a stable task-scoped Copilot session delegate with independent state
  per task and legacy session replay compatibility.
- [x] Replace the sidecar brand/scope UI with scrollable task tabs and the three
  Suggestions / Talk / History views.
- [x] Replace Review All with document-local candidate navigation, decisions,
  task-local file navigation, and an always-available Task Documents entry.
- [x] Implement hover/focus/click Task Documents behavior, pointer corridor,
  non-duplicated Change Set/context rows, aligned stats, create/delete states,
  and add-current-document.
- [x] Use Composer container-width adaptation and an icon-only horizontal width
  affordance without changing the editor body.
- [x] Add runtime, projection, visual-contract, and Obsidian-reset defenses.
- [ ] Verify hover corridor, task switching, responsive drawer, and cross-file
  review in real Obsidian through CDP.

## Verification commands

```bash
npm run test -- test/composer-task-review-navigation.test.ts \
  test/composer-workspace-intelligence.test.ts \
  test/composer-intelligence-session.test.ts \
  test/composer-display-state-contract.test.ts \
  test/composer-owner-feedback-contract.test.ts \
  test/composer-sidecar-visual-contract.test.ts \
  test/shared-button-reset-defense.test.ts
npm run build
```

The final CDP item must not be checked from mock, harness, source inspection, or
a build. It requires the production plugin in a real Obsidian renderer.
