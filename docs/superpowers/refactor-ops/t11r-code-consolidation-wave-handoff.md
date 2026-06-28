# T11R Code Consolidation Wave Handoff

> Send this file to Claude Code for T11R. The older T11R files are background/audit material only.

## 中文 Owner Summary

这轮不是删功能，也不是继续刷 boundary number。

目标是让 11 万行代码变得更容易理解、更模块化、更少重复：

- 保留用户可见功能。
- 保护 Usage Dashboard。
- 保护 Chat 的 Obsidian 左/中/右三栏 view 注册。
- Shared UI/CSS 作为重点：统一 `component` / `components` / feature-local `components` 的组织。
- Copilot 不砍 action 覆盖，而是把重复 action/panel 实现收敛成 factory + generic panels。
- Vault X-Ray 不能直接当死代码删；当前代码里有 command palette 注册，是否退役需要 owner 明确确认。

## Source Docs

Read first:

- `AGENTS.md`
- `docs/progress.md`
- `docs/superpowers/refactor-ops/t11r-specific-deletion-candidate-audit.md`
- `docs/superpowers/refactor-ops/t11r-code-distribution-deletion-map.md`

Do not use `docs/superpowers/refactor-ops/t11r-prelaunch-code-retirement-investigation.md` as the execution source. It is background only.

## Impact Contract

This task counts as T11R only if the contract below is met.

Primary metric target:

- Reduce `src + source CSS` by at least **10,000 LOC**.
- Stretch: **20,000 LOC**.
- If this cannot be reached without deleting user-facing functionality, stop and report the remaining duplicate families. Do not delete features to hit the number.

Required tracks:

1. Shared UI/CSS organization consolidation.
2. Copilot action/panel consolidation.
3. Safe shims/dead/debug cleanup.
4. Quick Search compatibility-tail cleanup.
5. Morning Briefing implementation consolidation.
6. Chat three-pane protection + internal cleanup.
7. Vault X-Ray entry verification report.

Forbidden scope:

- Do not delete Usage Dashboard command/view/screens/tracking/outcome/config.
- Do not remove `ChatView`, `ProjectListView`, or `ConversationOutlineView` registration.
- Do not make Chat Studio the only chat entry.
- Do not delete Copilot actions merely to reduce LOC.
- Do not delete Vault X-Ray unless owner explicitly approves after command-entry verification.
- Do not delete user vault notes, sqlite data, settings, or analysis docs.
- Do not add new compatibility facades.

Minimum acceptable delta:

- At least one duplicate implementation family consolidated.
- At least one old import/shim family migrated and removed.
- Shared UI/CSS organization must materially improve, even if the LOC target is missed.

Stop / commit rule:

- If safe work meets the minimum acceptable delta, commit and write an implementation note.
- If the work is correct but below the T11R target, classify it as partial progress, not a completed major wave.
- If feature deletion appears necessary to hit the target, stop before commit and return a blocker report.

## Required First Step

Before editing, refresh metrics:

```bash
cloc src styles.css --quiet --timeout 120
npm run audit:boundary -- --out /tmp/t11r-before-boundary.md
rg -n "legacy|backward compat|compatibility|deprecated|re-export shim|Retained|V1" src --glob '*.{ts,tsx}'
```

Then build a candidate matrix with:

- candidate path;
- current LOC;
- current imports/callers;
- feature it supports;
- whether it is primitive/shared/domain/feature-local/shim/dead/debug;
- deletion/consolidation plan;
- user-visible behavior risk;
- verification command.

## Execution Tracks

### Track 1: Shared UI/CSS Organization

Current problem:

- `src/ui/component/**`
- `src/ui/components/primitives/**`
- `src/ui/view/settings/component/**`
- `src/ui/view/settings/components/**`

These folders overlap in naming and responsibility. Build an import matrix first.

Target structure:

```text
src/ui/components/primitives/      # cross-product primitive components
src/ui/components/shared/          # reusable composite UI
src/ui/components/domain/          # optional shared domain UI
src/ui/view/<feature>/components/  # feature-local UI
```

Allowed:

- remove `.DS_Store`;
- delete zero-reference components with proof;
- migrate old imports to canonical paths;
- consolidate duplicated primitives such as Button, IconButton, Pill, Modal, Row, Chip, Segmented when behavior matches;
- keep usage-dashboard chart components feature-local unless intentionally generalized.

Not allowed:

- guessing unused components by filename only;
- breaking Usage Dashboard, Settings, Chat, Quick Search, or Copilot visuals.

### Track 2: Copilot Action/Panel Consolidation

Preserve action coverage. Do not shrink the product by deleting actions just for LOC.

Consolidate repeated shapes:

- writing transform actions -> shared writing action factory + result panel;
- review/finding actions -> shared findings panel;
- link/semantic connection actions -> shared connection-list panel;
- long-form agent output actions -> shared text/stream result panel;
- vault maintenance actions -> shared maintenance result renderer.

### Track 3: Safe Shims / Dead / Debug Cleanup

Candidates to verify before deleting:

- `src/ui/view/quick-search/store/v2SessionTypes.ts`
- `src/service/chat/context/profiles/AiAnalysisProfile.ts`
- `src/service/chat/context/profiles/CopilotProfile.ts`
- `src/service/chat/context/profiles/FollowupProfile.ts`
- `src/service/chat/context/profiles/AmbientProfile.ts`
- `src/ui/view/shared/view-utils.ts`
- `src/service/tools/search-graph-inspector/find-structural-holes.ts`
- layout debug logs in `src/app/view/ViewSwitchConsistentHandler.ts`

### Track 4: Quick Search Compatibility Tail

Preserve current V2 behavior and owner data.

Allowed:

- remove no-op V1 reset code;
- migrate old import surfaces;
- remove obsolete replay branches only after confirming saved analyses still open or have a safe fallback.

### Track 5: Morning Briefing Implementation Consolidation

Preserve Morning Briefing capability.

Allowed:

- fix stale modal import paths;
- share card/list/projection primitives with Ambient / Current Work State direction;
- remove standalone shell only after equivalent projection exists and owner approves.

### Track 6: Chat Three-Pane Protection

Protect:

- `src/app/view/ChatView.ts`
- `src/app/view/ProjectListView.ts`
- `src/app/view/ConversationOutlineView.ts`
- their registration in `ViewManager`
- ribbon path that opens the three-pane layout

Allowed:

- remove debug diagnostics;
- reduce duplicate branches;
- rename `*Retained*` components after imports are migrated;
- ensure Studio and three-pane views share content components.

### Track 7: Vault X-Ray Verification

Current code evidence says the command exists:

- `src/app/commands/Register.ts` registers `peak-vault-xray` / `Open Vault X-Ray`.
- `src/app/commands/PeakCommandActions.ts` calls `openVaultXRay`.
- `src/app/view/ViewManager.ts` has `activateVaultXRayView`.
- `src/app/view/VaultXRayView.ts` loads `VaultXRayPanel`.

Do not delete it in this wave. Instead:

- verify whether the command appears and opens in Obsidian after build/reload;
- if it does not appear, find why;
- report whether it should be kept, folded into Usage Dashboard/Settings/Copilot Vault, or proposed for owner-approved retirement.

## Verification

Run:

```bash
npm run build
npm run audit:boundary
cloc src styles.css --quiet --timeout 120
```

Run focused tests for touched areas:

```bash
npm run test -- test/t11p-remaining-ui-app-tail-regression.test.ts
npm run test -- test/t11q-service-app-tail-regression.test.ts
npm run test -- test/chat-runtime-state-port.test.ts
npm run test -- test/copilot-action-runtime-ports.test.ts
npm run test -- test/copilot-action-surface-registry.test.ts
npm run test -- test/usage-outcome-service.test.ts
npm run test -- test/usage-log-repo.test.ts
```

Also run targeted `rg` checks for deleted old paths.

## Implementation Note Required

Start with Chinese.

Include:

- before/after LOC by island;
- before/after boundary audit;
- feature coverage preserved table;
- files deleted/consolidated grouped by reason;
- Shared UI/CSS new organization map;
- Chat three-pane protection confirmation;
- Usage Dashboard protection confirmation;
- Vault X-Ray command verification result;
- skipped candidates and why;
- code reading guide;
- verification commands and results.
