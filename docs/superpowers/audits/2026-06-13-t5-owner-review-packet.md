# Owner Review Packet: T5 Vault Lint Runtime Closure Wave

Claude Code commit:
- `eb45195 refactor(lint): close Vault Lint runtime to RunEnvelope single truth (T5)`

Codex verdict:
- Accepted

Owner decision:
- 接受 T5。它不是全局大迁移，但它已经完成一个真实 closure wave：Vault Lint UI runtime state 不再由 service 写 UI store，而是从 `RunEnvelope` trace 投影。
- 下一步继续加大在同一个 capability 内的后端架构粒度：`T6 Vault Lint Ports Extraction + Service-as-Plain-Class`。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / short | T5 的验收记录、代码阅读入口、下一步判断。 |
| [`t5-vault-lint-runtime-closure-wave-handoff.md`](../refactor-ops/t5-vault-lint-runtime-closure-wave-handoff.md) | Previous handoff | T5 的任务边界和验收标准。 |
| [`t6-vault-lint-ports-service-plain-class-handoff.md`](../refactor-ops/t6-vault-lint-ports-service-plain-class-handoff.md) | Next handoff | 下一步更大粒度后端 closure wave。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T5 分数和 T6 目标。 |

## 中文摘要

T5 做到了：

- 删除 `src/ui/store/vaultLintStore.ts`。
- `VaultLintService.ts` 不再 import `@/ui/store/vaultLintStore`。
- `VaultLintService.runFullScan()` 不再调用 `setScanProgress` / `setScanResult`。
- 新增 `useVaultLintRunState()`，让 UI 从 `RunEvent` trace 派生 `isScanning`、`progress`、`currentScan`、`error`。
- `InMemoryRunRecorder` 增加 per-instance `onEvent` sink，没有引入全局 event bus。
- `service -> ui` 从 `56 -> 55`，总 flagged edges 从 `420 -> 419`。

这次终于不是 adapter-only：

- T4 是“新路径打通”。
- T5 是“旧路径关闭”。
- 删除 store + 删除 service->UI 写入，说明 runtime truth 真的变了。

## Code Reading Guide

Read in this order:

1. `src/service/run-envelope/InMemoryRunRecorder.ts`
   - 看 `InMemoryRunRecorderOptions.onEvent` 和 `appendAndEmit()`。
   - 重点确认 sink 是 per-instance、同步、防御性 clone、listener throw 被隔离。

2. `src/service/lint/VaultLintRun.ts`
   - 看 `VaultLintRunOptions.onEvent` 和 `runVaultLintManualScan()`。
   - 重点看 runner 如何把 recorder events 转成 UI 可消费的 snapshot。

3. `src/ui/view/vault-lint/hooks/useVaultLintRunState.ts`
   - 这是 T5 的 UI truth。
   - 看 `setEvents(snapshot)`、`deriveLatestStatus()`、`deriveLatestProgress()`、`scanTokenRef`。

4. `src/service/lint/VaultLintService.ts`
   - 看 `runFullScan(callbacks?)`。
   - 重点确认它只做 scan engine：读 vault、跑 detectors、存 repo、发 callbacks，不再写 UI store。

5. `src/ui/view/vault-lint/VaultXRayPanel.tsx`
   - 看 panel 如何消费 `useVaultLintRunState()`。
   - 注意新增 `Scan failed` 错误块。

6. `test/vault-lint-runner.test.ts`
   - 看 closure guards：service/panel/components 不再引用 `useVaultLintStore`，store file deleted。

Debug first file:

- UI 不更新：先看 `src/ui/view/vault-lint/hooks/useVaultLintRunState.ts`。
- 事件没发出来：先看 `src/service/run-envelope/InMemoryRunRecorder.ts`。
- scan engine 异常：先看 `src/service/lint/VaultLintService.ts`。

## Verification

Codex reran:

```text
npm run test -- test/run-envelope-core.test.ts
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
npm run build
node scripts/audit/boundary-baseline.mjs --out /tmp/t5-codex-boundary-baseline.md
```

Results:

| Check | Result |
| --- | --- |
| RunEnvelope tests | 27/27 pass |
| Vault Lint runner tests | 14/14 pass |
| Vault Lint contract tests | 5/5 pass |
| Vault Lint structural tests | 2/2 pass |
| Vault Lint repo tests | 3/3 pass |
| Build | Pass |
| Boundary audit | 419 findings |

Additional guard checks:

```text
rg "from ['\"]@/ui/|@/ui/store" src/service/lint
find src/ui/store -name 'vaultLintStore*' -print
```

Result:

- `src/service/lint` has no UI import.
- `vaultLintStore.ts` is deleted.

## Caveats

T5 intentionally keeps these old paths:

- `VaultLintService.getInstance()` remains.
- `AppContext.getInstance()` remains inside `VaultLintService`.
- `sqliteStoreManager.getVaultLintRepo()` remains inside `VaultLintService`.
- `SignalRegistry.getInstance()` remains.
- `VaultDigestService` still initializes lint registry and reads cached scan.

Important behavior note:

- Vault X-Ray UI state is now per panel mount. A freshly mounted panel starts empty until a scan runs. Persistence still exists in `VaultLintRepo`, but this panel does not yet load latest scan on mount.
- This is acceptable for T5 because previous T5 scope was runtime truth closure, not latest-scan hydration. T6 may add a read port if owner wants latest scan to hydrate the panel.

## Verdict

T5 should be accepted.

It earns acceptance because:

- It deletes old UI store truth.
- It removes a real `service -> ui` reverse dependency.
- It adds tests that prevent the old path from coming back.
- It keeps the change scoped to Vault Lint instead of spreading to unrelated capability surfaces.

But this is not the end of Vault Lint modernization:

- The service is still not a plain class.
- Side effects are still resolved internally.
- Ports are not extracted yet.
- `SignalRegistry` is still a global registry.

## Next

Move to:

```text
T6 Vault Lint Ports Extraction + Service-as-Plain-Class
```

T6 acceptance rule:

> `VaultLintService.runFullScan()` should not call `AppContext.getInstance()`, `sqliteStoreManager.getVaultLintRepo()`, or `SignalRegistry.getInstance()` directly. Those should move behind narrow ports/adapters and a runtime composition point.
