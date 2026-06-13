# Owner Review Packet: T6 Vault Lint Ports Extraction + Service-as-Plain-Class

Claude Code commit:
- `89e0406 refactor(lint): extract Vault Lint ports and turn service into plain class (T6)`

Codex verdict:
- Accepted

Owner decision:
- 接受 T6。Vault Lint 现在已经有完整的 `Contract -> RunEnvelope -> UI projection -> Ports -> Runtime composition` 闭环。
- 下一步继续清剩余 detector 层 service-locator：`T7 Vault Lint Detector Context Closure`。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / short | T6 的验收记录、代码阅读入口、下一步判断。 |
| [`t6-vault-lint-ports-service-plain-class-handoff.md`](../refactor-ops/t6-vault-lint-ports-service-plain-class-handoff.md) | Previous handoff | T6 的任务边界和验收标准。 |
| [`t7-vault-lint-detector-context-closure-handoff.md`](../refactor-ops/t7-vault-lint-detector-context-closure-handoff.md) | Next handoff | 下一步清 detector 层 AppContext/sqlite 依赖。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T6 分数和 T7 目标。 |

## 中文摘要

T6 做到了：

- `VaultLintService` 从 singleton 改成 `new VaultLintService(ports)`。
- 删除 `VaultLintService.getInstance()`。
- 删除 `src/service/lint/SignalRegistry.ts`。
- `VaultLintService.runFullScan()` 不再调用：
  - `AppContext.getInstance()`
  - `sqliteStoreManager.getVaultLintRepo()`
  - `SignalRegistry.getInstance()`
- 新增 `VaultLintPorts`，把 config / vault / persistence / detector registry / id / clock 全部显式化。
- 新增 app-layer composition：`src/app/lint/composeVaultLintRuntime.ts`。
- `main.ts` 在 sqlite 初始化后绑定 runtime，在 unload 时清掉 runtime。
- `VaultLintRun`、`openVaultXRay`、`VaultDigestService` 都改走 `getVaultLintRuntime()`。
- `service -> app` 从 `74 -> 73`，总 flagged edges 从 `419 -> 418`。

这次是真正的 backend closure wave：

- 不是只加 interface。
- service 本体已经不再自己找环境。
- fake-port tests 可以不 boot Obsidian / AppContext / sqlite 就跑 engine。

## Code Reading Guide

Read in this order:

1. `src/service/lint/ports/VaultLintPorts.ts`
   - 看 6 个 port：config、vault、persistence、detectorRegistry、idFactory、clock。
   - 这是 T6 的依赖形状。

2. `src/service/lint/VaultLintService.ts`
   - 看 constructor 和 `runFullScan(callbacks?)`。
   - 重点确认所有依赖都来自 `this.ports`。

3. `src/service/lint/VaultLintRuntime.ts`
   - 看 `setVaultLintRuntime()` / `getVaultLintRuntime()` / `clearVaultLintRuntimeForTests()`。
   - 这是 T6 唯一新增的 module-level runtime binding。

4. `src/app/lint/composeVaultLintRuntime.ts`
   - 看 app/sqlite/detector adapters 如何组装成 runtime。
   - 这是唯一允许把 app singletons 接进 Vault Lint 的地方。

5. `main.ts`
   - 看 sqlite 初始化后 runtime bind。
   - 看 unload 时 runtime clear。

6. `src/service/lint/VaultLintRun.ts`
   - 看 production default scan 如何从 `getVaultLintRuntime()` 进入 engine。

7. `test/vault-lint-service-ports.test.ts`
   - 看 fake-port engine tests 和 source guards。

Debug first file:

- Engine 行为错：先看 `src/service/lint/VaultLintService.ts`。
- Runtime 未绑定：先看 `src/service/lint/VaultLintRuntime.ts` 和 `main.ts` boot 顺序。
- App/sqlite 适配错：先看 `src/app/lint/composeVaultLintRuntime.ts`。

## Verification

Codex reran:

```text
npm run test -- test/vault-lint-service-ports.test.ts
npm run test -- test/run-envelope-core.test.ts
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
npm run build
node scripts/audit/boundary-baseline.mjs --out /tmp/t6-codex-boundary-baseline.md
```

Results:

| Check | Result |
| --- | --- |
| T6 service/ports tests | 13/13 pass |
| RunEnvelope tests | 27/27 pass |
| Vault Lint runner tests | 14/14 pass |
| Vault Lint contract tests | 5/5 pass |
| Vault Lint structural tests | 2/2 pass |
| Vault Lint repo tests | 3/3 pass |
| Build | Pass |
| Boundary audit | 418 findings |

Additional source checks:

```text
rg "from ['\"]@/app/|from ['\"]@/ui/" src/service/lint
find src/service/lint -name SignalRegistry.ts -print
```

Result:

- `VaultLintService.ts` has no app/ui import.
- `SignalRegistry.ts` is deleted.
- Remaining `AppContext` imports are in `src/service/lint/signals/*`, which T6 intentionally left for T7.

## Caveats

T6 intentionally keeps these old paths:

- `signals/structural.ts` still imports `AppContext` and `sqliteStoreManager`.
- `signals/content.ts` still imports `AppContext`.
- `signals/tags.ts` still imports `AppContext`.
- Detector configuration is still effectively initialized with default config at runtime composition. This matches the old `initRegistry()` behavior closely, but T7 should make detector context/config ownership clearer.
- `VaultDigestService` has a stale comment mentioning `VaultLintService`; runtime code is correct, comment can be cleaned later.
- `currentRuntime` in `VaultLintRuntime.ts` is a centralized module-level mutable binding. It is accepted as a transition because it is one file, fail-loud, boot-set, unload-cleared, and test-reset.

## Verdict

T6 should be accepted.

It earns acceptance because:

- It removes the main service-locator exits from `VaultLintService`.
- It deletes a global detector registry singleton.
- It introduces fakeable ports and proves them in tests.
- It centralizes composition in app layer instead of scattering `AppContext` through service engine code.

Remaining modernization target:

- Detectors are still not pure/fakeable. They must receive vault/metadata/graph context through `LintScanContext` or a detector context port.

## Next

Move to:

```text
T7 Vault Lint Detector Context Closure
```

T7 acceptance rule:

> `src/service/lint/signals/*` should not import `AppContext` or `sqliteStoreManager`. Detector environment access should flow through context/ports supplied by the Vault Lint runtime.
