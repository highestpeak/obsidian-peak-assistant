# Peak Assistant Modernization Handoff: T11D Code Volume Deletion Wave 1

Branch:
`codex/peak-modernization-refactor`

Source-of-truth docs:

- `docs/superpowers/specs/2026-06-01-peak-system-architecture-modernization-handbook.html`
- `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html`
- `docs/superpowers/specs/2026-06-03-obsidian-plugin-command-gateway-capstone-review.html`
- `docs/superpowers/audits/2026-06-25-t11c-code-volume-deletion-map.md`

Current operating rules:

- Codex owns architecture reports, deletion maps, handoff prompts, review packets, diagrams, and scorecards.
- Claude Code owns implementation only.
- Owner-facing explanations should be Chinese-first. Keep code symbols, commands, test names, and commit messages in English.
- Do not introduce a second runtime path.
- Do not start Current Work State, Chat rewrite, or Command Gateway.
- This is a deletion wave, not a feature wave.

Claude Code may start implementation after a short read-only confirmation in the same session. Do not wait for a second approval unless a stop condition is hit.

## 中文摘要

T11D 是第一轮真正的 **code volume deletion wave**。

T0-T11B 已经把多个 capability 的 runtime ownership 和 dependency boundary 做干净了，但 source code 体积还没有下降：从 `pre-large-refactor-2026-06-11` 到现在，`src/` 净增约 `4,855` 行。T11C 的结论是：下一步不要继续加新架构，也不要跳 T12，而是先删除确认无生产入口的临时/孤儿代码。

这轮允许 Claude Code 删除代码，但只允许删 **T11C 已标出的低风险候选**。有产品含义或未来语义的代码必须保守处理：

- Prompt Templates：先确认是保留并加入口，还是删除。不能继续 orphan。
- `CopilotAutoPlanner.ts`：test-only。先确认是否是未来产品能力，不要默默删。
- `sdkProfile.ts`：test-only。若删除，必须同步 settings type / tests。
- `AmbientContract.ts`：目前是 descriptive inventory。不要在 T11D 里删，除非 Codex 另开任务把 inventory 迁到 docs。

目标不是“删最多”，而是建立可信删除节奏：删掉明显旧包袱，保留不确定产品语义，给下一轮 Wave 2 边界清理让路。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This T11D handoff | Ready to send | 当前建议发给 Claude Code 的实现任务。 |
| [`2026-06-25-t11c-code-volume-deletion-map.md`](../audits/2026-06-25-t11c-code-volume-deletion-map.md) | Required background | T11C 代码体积审计和删除地图。 |
| [`2026-06-15-t11b-review-fix-owner-review-packet.md`](../audits/2026-06-15-t11b-review-fix-owner-review-packet.md) | Previous accepted packet | T11B-R 接受结论。 |
| [`architecture-scorecard.md`](./architecture-scorecard.md) | Score ledger | T11D 完成后由 Codex 更新分数和趋势。 |
| [`docs/progress.md`](../../progress.md) | Current phase tracker | 确认 active section 下一步是 Code Volume Audit / Deletion Map。 |

## Goal

Remove clearly retired temporary/orphan code and report exact source LOC reduction, without changing active product behavior.

## Scope

Allowed:

- Delete temporary debug code from Chat Conversation Index preview if confirmed unused outside command registration.
- Delete static-unreachable UI/service/core leftovers that have no production references after `rg` confirmation.
- Remove or update tests only when the tested production code is intentionally deleted.
- Remove stale comments that point to deleted files.
- Update command registration when deleting a command target.
- Produce exact deletion evidence, LOC delta, and fresh boundary audit.

Not allowed:

- Do not implement Current Work State.
- Do not implement Command Gateway.
- Do not rewrite Chat, Quick Search, Copilot, Usage Dashboard, Search Index, or SQLite repos wholesale.
- Do not delete active runtime/adapters added in T6-T11B.
- Do not delete a registered Obsidian view just because it has low static imports.
- Do not delete `OnboardingModal.tsx`; it is dynamically required from `main.ts`.
- Do not delete `GraphFullscreenView.tsx`; it is registered by `ViewManager` and opened dynamically from `V2SourcesView`.
- Do not delete `AmbientContract.ts` in this wave.
- Do not leave `openPromptTemplates()` / `src/ui/view/prompt-template/*` half-orphaned. Either preserve by adding a real command, or delete both, but only after confirmation.
- Do not add service-layer module runtime singletons.
- Do not add product/domain config defaults in service engine files.

## Architecture Intent

This task should improve:

- Old-path deletion: remove temporary/orphan files rather than adding another abstraction layer.
- Change radius: reduce files future agents must inspect.
- Owner comprehension: make the next deletion/boundary wave easier to reason about.
- Boundary hygiene: deleted files should not increase `audit:boundary` findings.

This task is not expected to materially improve:

- Runtime truth for active capabilities.
- RunEnvelope adoption.
- Product capability semantics.

## Read-only Investigation Required First

Before editing, report briefly:

```md
## Read-only confirmation

Files inspected:
- ...

Confirmed deletion set:
- ...

Deferred / not safe to delete:
- ...

Command surfaces checked:
- ...

Test-only candidates checked:
- ...

Static reference commands used:
- ...

Stop conditions hit:
- none / ...
```

Use these checks at minimum:

```bash
rg -n "DebugCommandActions|loadMockConversationForIndexPreview|peak-debug-load-mock-conversation" src main.ts test
rg -n "QuickNoteModal|InlineFollowupChat|SearchGraph|ModeSelector|MessageRoleAvatar|useTokenUsage|useSurfaceReadiness|SettingCard" src main.ts test
rg -n "addLinkAction|createBridgeNoteAction|graph\\.po|embedding\\.po|document-meta\\.po|doc-statistics\\.po" src main.ts test
rg -n "CopilotAutoPlanner|planCopilotAutoRun" src main.ts test
rg -n "sdkProfile|toAgentSdkEnv|DEFAULT_SDK_PROFILE|readProfileFromSettings" src main.ts test
rg -n "openPromptTemplates|PromptTemplateModal|PromptTemplateList|prompt-template" src main.ts test
```

## Primary Deletion Candidates

### Group A: temporary debug command

Delete if confirmed only used by command registration:

- `src/app/commands/DebugCommandActions.ts`
- the `[Debug] Load mock conversation for index preview` entry in `src/app/commands/Register.ts`

Expected source reduction: about `663` LOC plus registration lines.

### Group B: 0-production-import UI/component leftovers

Delete only after `rg` confirms no active production references:

- `src/ui/view/modals/QuickNoteModal.ts`
- `src/ui/component/mine/InlineFollowupChat.tsx`
- `src/ui/component/mine/search-graph/SearchGraph.tsx`
- `src/ui/component/mine/search-graph/types.ts`
- `src/ui/component/prompt-input/ModeSelector.tsx`
- `src/ui/view/chat-view/components/MessageRoleAvatar.tsx`
- `src/ui/view/chat-view/hooks/useTokenUsage.ts`
- `src/ui/view/settings/hooks/useSurfaceReadiness.ts`
- `src/ui/view/settings/components/SettingCard.tsx`
- `src/ui/component/shared-ui/badge.tsx`
- `src/ui/component/shared-ui/scroll-area.tsx`

If a file is referenced only by another deletion candidate, delete the small cluster together.

### Group C: 0-production-import service/core leftovers

Delete only after `rg` confirms no active production references:

- `src/service/actions/addLinkAction.ts`
- `src/service/actions/createBridgeNoteAction.ts`
- `src/core/po/embedding.po.ts`
- `src/core/po/document-meta.po.ts`
- `src/core/po/doc-statistics.po.ts`
- `src/service/workflow/index.ts`
- `src/ui/view/chat-view/integration/index.ts`
- `src/service/chat/context/profiles/index.ts`

For `src/service/chat/context/profiles/index.ts`, delete child files only if the whole profile barrel is proven dead.

## Candidates That Need Conservative Handling

### Prompt Templates

Evidence from T11C:

- `openPromptTemplates()` exists in `src/app/commands/PeakCommandActions.ts`.
- `buildCoreCommands()` does not expose a palette command for it.
- `src/ui/view/prompt-template/*` appears connected only through that orphan function.

Rule:

- If it is still intended as a product surface, add a real command entry and keep the files.
- If it is not intended, delete `openPromptTemplates()` and `src/ui/view/prompt-template/*`.
- If uncertain, leave it untouched and list as deferred.

### CopilotAutoPlanner

Evidence from T11C:

- `src/service/copilot/CopilotAutoPlanner.ts` is imported by `test/copilot-auto-planner.test.ts`.
- No production import was found.

Rule:

- Delete only if you can state it is not a future product path.
- If deleting, delete/update the test and report why.
- If uncertain, leave it untouched.

### SDK Profile

Evidence from T11C:

- `src/service/agents/vault-sdk/sdkProfile.ts` is imported by `test/sdk-profile.test.ts`.
- No production import was found.
- Settings types still mention `sdkProfile`.

Rule:

- Do not delete this unless you also clean the settings type surface safely.
- If uncertain, leave it untouched.

### AmbientContract

Rule:

- Do not delete `src/service/ambient/AmbientContract.ts` in T11D.
- It is descriptive architecture inventory. Moving it from `src/` to docs can be a later Codex-designed cleanup.

## Protected Files

Do not delete:

- `src/ui/view/modals/OnboardingModal.tsx`
- `src/ui/view/graph-fullscreen/GraphFullscreenView.tsx`
- `src/ui/view/vault-lint/VaultXRayPanel.tsx`
- `src/core/po/graph.po.ts`
- `src/ui/view/chat-view/integration/messageReceiptSlot.ts`
- `src/app/runtime/AppRuntimeRegistry.ts`
- `src/app/lint/*`
- `src/app/ambient/*`
- `src/app/quick-search/background/*`
- `src/app/copilot/actions/*`
- `src/app/copilot/vault/*`
- `src/service/lint/runtime/*`
- `src/service/run-envelope/*`
- `src/service/search/background/*`
- `src/service/copilot/actions/CopilotActionRuntime*`
- `src/service/copilot/vault/VaultReviewRuntime*`

## Expected Outcome

The expected result is modest but real:

- `src/` LOC should decrease.
- command palette should not expose a broken debug command.
- build should pass.
- boundary audit should not get worse.
- any ambiguous product surfaces should be listed as deferred, not guessed.

If the deletion result is less than 1,000 LOC, that is acceptable as long as it is safe and well-evidenced. The larger reductions will come later from Chat/Quick Search/Copilot/Usage product decisions.

## Required Verification

Run:

```bash
npm run build
npm run audit:boundary
```

Run focused tests as relevant:

```bash
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/sdk-profile.test.ts
npm run test -- test/vault-lint-runner.test.ts
```

If a candidate/test is deleted, explain why that test no longer applies.

Also run:

```bash
git diff --stat
git diff --name-status
find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print | xargs wc -l | tail -1
node scripts/audit/boundary-baseline.mjs --out /tmp/t11d-boundary-baseline.md
```

## Implementation Note Required From Claude Code

After implementation and commit, report:

```md
## Implementation note

中文摘要:
- 本轮在全局架构里的位置:
- 为什么做这个:
- 用户可见行为是否变化:
- 删除了哪些旧路径:
- 哪些候选故意没删:
- 下一步建议:

Commit:
- <hash and message>

Changed files grouped by purpose:
- Deleted temporary/debug code:
- Deleted orphan UI/component code:
- Deleted orphan service/core code:
- Preserved/deferred candidates:
- Tests:
- Docs:

Deletion evidence:
- Source files deleted:
- Source LOC removed:
- Tests deleted/updated:
- `git diff --stat` summary:

Code reading guide:
- Read first:
- Then read:
- Optional / only if debugging:
- Files intentionally not changed:

Boundary audit delta:
- total flagged:
- service -> ui:
- core -> upstream:
- service/core -> Obsidian side-effect:
- service AppContext count:

Verification:
- npm run build:
- npm run audit:boundary:
- focused tests:
- rg checks:

Known remaining old paths:
- ...

Suggested next task:
- ...
```

## Stop Conditions

Stop and ask before proceeding if:

- A candidate has any production reference outside another deletion candidate.
- Deleting a file requires rewriting a product surface.
- The task starts touching Chat, Quick Search, Copilot UI, Usage Dashboard, Search Index, or SQLite repo architecture broadly.
- Prompt Templates cannot be resolved cleanly as keep-with-command or delete-as-orphan.
- Build failure requires unrelated refactor to fix.
- Boundary audit increases and the cause is not obvious.
