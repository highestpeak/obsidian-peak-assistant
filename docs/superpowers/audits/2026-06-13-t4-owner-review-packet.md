# Owner Review Packet: T4 Vault Lint RunEnvelope Vertical Slice

Claude Code commit:
- `4d68724 feat(lint): run Vault Lint manual scan through RunEnvelope (T4)`

Codex verdict:
- Accepted with scope caveat

Owner decision:
- T4 可以接受，因为它把第一条真实业务路径接进了 `RunEnvelope`。
- 但 T4 的粒度仍偏保守。下一步不再继续做 adapter-only 小步，改成 `T5 Vault Lint Runtime Closure Wave`。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / short | T4 的验收结论和节奏调整。 |
| [`t4-vault-lint-run-envelope-vertical-slice-handoff.md`](../refactor-ops/t4-vault-lint-run-envelope-vertical-slice-handoff.md) | Previous handoff | T4 原任务边界。 |
| [`t5-vault-lint-runtime-closure-wave-handoff.md`](../refactor-ops/t5-vault-lint-runtime-closure-wave-handoff.md) | Next handoff | 下一轮加大粒度的任务包。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T4 分数和节奏 caveat。 |

## 中文摘要

T4 做到了：

- `VaultXRayPanel` 不再直接调用 `VaultLintService.getInstance().runFullScan()`。
- 新增 `runVaultLintManualScan()`，让 manual scan 产生 `RunEvent` trace 和 `ArtifactRef`。
- `VaultLintService.runFullScan()` 多了一组 callbacks，可以同时给旧 UI store 和新 envelope 传进度。
- 测试覆盖了 happy path、failure path、detector warning、runner import boundary、mutable global guard。

T4 没做到：

- 没删除 `useVaultLintStore`。
- 没删除 `VaultLintService` 对 UI store 的写入。
- 没抽掉 `AppContext` / `sqliteStoreManager` / `SignalRegistry.getInstance()`。
- `boundary audit` 仍是 `420 -> 420`，没有真实下降。

所以 T4 是“打通新路径”，不是“关闭旧路径”。

## Code Reading Guide

Read in this order:

1. `src/service/lint/VaultLintRun.ts`
   - 看 `runVaultLintManualScan()`。
   - 重点看 `recorder.start()`、`recordProgress()`、`recordArtifact()`、`finish()` 的顺序。

2. `src/service/lint/VaultLintService.ts`
   - 看 `runFullScan(callbacks?)`。
   - 注意这里仍然 import 并写入 `useVaultLintStore`，这是 T5 必须拆掉的旧路径。

3. `src/ui/view/vault-lint/VaultXRayPanel.tsx`
   - 看 `startScan()`。
   - 它现在调用 `runVaultLintManualScan()`，但 UI state 仍来自 `useVaultLintStore`。

4. `test/vault-lint-runner.test.ts`
   - 看 event trace 断言。
   - 看 source-scan guard：runner 不直接 import UI/AppContext/Obsidian/sqlite。

## Verdict

T4 接受，但不应该作为下一阶段粒度范式。

接受理由：

- 它第一次把真实 capability 接进 `RunEnvelope`。
- 新 runner 的边界干净，没有新增 mutable global。
- UI entry 的 direct service call 被替换掉。
- 测试质量足够，failure/log/artifact 都覆盖到了。

保留 caveat：

- 旧 runtime truth 仍在。
- service 仍写 UI store。
- 代码可理解性提升有限，因为新旧状态系统并存。
- 分数不能大幅提高，尤其是 `Old-path deletion` 和 `State ownership clarity`。

## Verification

Claude Code reported:

```text
npm run build
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/run-envelope-core.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
node scripts/audit/boundary-baseline.mjs --out /tmp/t4-vault-lint-boundary-baseline.md
```

Key result:

| Check | Result |
| --- | --- |
| Build | Pass |
| T4 runner tests | 8/8 pass |
| RunEnvelope tests | 23/23 pass |
| Boundary audit | 420 findings, unchanged |

## Scorecard

T4 should receive only a modest score bump:

- Control improves because there is now a named runner and trace.
- Runtime truth improves slightly because manual scan has a new official entry.
- Verification improves because runner tests are strong.
- Boundary does not improve because `service -> ui` remains.
- Old-path deletion barely improves because the old service call is no longer made by the panel, but the old store truth still owns UI state.

## Next

Move to:

```text
T5 Vault Lint Runtime Closure Wave
```

T5 acceptance rule:

> A T5 implementation that only adds another wrapper is not accepted. It must delete or retire at least one old state/runtime path.
