# Owner Review Packet: T3A RunEnvelope Core

Claude Code commits:
- `3626e29 feat(run-envelope): add T3A RunEnvelope core foundation`
- `bf42673 fix(run-envelope): clone events and nested artifacts on read (T3A review fix)`

Codex verdict:
- Accepted

Owner decision:
- 接受 T3A。现在不要继续做 T3 小修小补，下一步进入 `T4 Vault Lint RunEnvelope Vertical Slice`。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / short | T3A 的简版验收记录。 |
| [`t3-run-envelope-core-handoff.md`](../refactor-ops/t3-run-envelope-core-handoff.md) | Source contract | T3A 的任务边界。 |
| [`t4-vault-lint-run-envelope-vertical-slice-handoff.md`](../refactor-ops/t4-vault-lint-run-envelope-vertical-slice-handoff.md) | Next handoff | 下一步的大包任务。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T3A 分数和进度。 |

## Code Reading Guide

Read in this order:

1. `src/service/run-envelope/types.ts`
   - 看 `RunSession`、`RunEvent`、`ArtifactRef`。
   - 注意 T3A 明确不加 `ports`，不加订阅 API。

2. `src/service/run-envelope/InMemoryRunRecorder.ts`
   - 看 `start`、`recordProgress`、`recordArtifact`、`finish`、`getEvents`。
   - 重点看 review fix：`snapshotEvent` 和 `snapshotArtifact`。

3. `test/run-envelope-core.test.ts`
   - 看 deterministic trace 测试。
   - 看 mutation guard：外部改 `getEvents()` / `recordArtifact()` 返回值不会污染 recorder 内部 trace。

## Verdict

T3A 是一个合格地基：

- 没接真实业务，所以用户行为不变。
- `src/service/run-envelope/` 目录依赖很轻。
- 没有 `AppContext`、UI、Obsidian、SQLite、React、Zustand 依赖。
- 没有 singleton registry。
- 没有新增 `let defaultX` 这类 mutable global。
- review fix 补上了 trace snapshot 防护。

接受时带一个 caveat：

- 现在还没有任何真实 capability 使用 `RunEnvelope`。T3A 只是地基，不是架构收益的终点。

## Verification

Codex 复核：

```text
npm run build
npm run test -- test/run-envelope-core.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/progress-tracker-port.test.ts
node scripts/audit/boundary-baseline.mjs --out /tmp/t3a-review-fix-codex-boundary-baseline.md
```

Results:

| Check | Result |
| --- | --- |
| Build | Pass |
| RunEnvelope tests | 23/23 pass |
| VaultLint contract tests | 5/5 pass |
| ProgressReporterPort tests | 14/14 pass |
| Boundary audit | 420 findings, unchanged from T2C/T3A |

## Remaining Old Paths

- `ProgressReporterPort.defaultReporter` remains.
- `VaultLintService` still writes `useVaultLintStore` directly.
- `VaultLintService` still resolves `AppContext`.
- No real capability uses `RunEnvelope` yet.
- Chat, Search, Copilot, Ambient, Quick Search still use old runtime paths.

## Next

Do not keep polishing T3A. Move to:

```text
T4 Vault Lint RunEnvelope Vertical Slice
```

This should be a medium-size capability package, not another tiny file cleanup.
