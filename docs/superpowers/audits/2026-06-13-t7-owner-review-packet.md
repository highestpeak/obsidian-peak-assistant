# Owner Review Packet: T7 Vault Lint Foundation Completion Wave

Claude Code commits:

- `32fde24b refactor(lint): add VaultLintDetectorContextPort and wire Obsidian/sqlite adapter (T7 part 1)`
- `216dd431 refactor(lint): rewrite detectors against VaultLintDetectorContextPort, restore health-score test, add source guards (T7 part 2)`

Codex verdict:

- Accepted

Owner decision:

- 接受 T7。Vault Lint 的 foundation closure 到这里可以封顶。
- 不要继续在 Vault Lint 上做小粒度 polish，除非发现 bug。
- 下一步应该切到第二个 capability，做更大粒度的 T8。推荐目标：Ambient Push foundation readiness / runtime boundary wave。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / rewritten for readability | T7 的验收记录、代码阅读入口、粒度判断、下一步建议。 |
| [`t7-vault-lint-foundation-completion-wave-handoff.md`](../refactor-ops/t7-vault-lint-foundation-completion-wave-handoff.md) | Previous handoff | Claude Code 执行 T7 时拿到的任务边界和验收标准。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T7 分数已经加入 ledger：Overall `79 -> 84`。 |
| [`README.md`](../refactor-ops/README.md) | Updated | 当前 refactor loop 状态已经从 T7 推进到 T8。 |
| [`../../progress.md`](../../progress.md) | Updated | 项目进度里已记录 T7 接受和下一步 T8 方向。 |

## 中文摘要

T7 做到了：

- 新增 `VaultLintDetectorContextPort`，专门给 detector 读取 vault / metadata / graph / semantic neighbors。
- 新增 `src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`，把 Obsidian、sqlite、graph inspector 这些真实环境依赖集中到 app 层。
- `VaultLintService.runFullScan()` 把 `detectorContext` 放进 `LintScanContext`。
- 三个 detector 文件改成只读 `context.detectorContext`：
  - `signals/content.ts`
  - `signals/tags.ts`
  - `signals/structural.ts`
- detector 层不再直接调用：
  - `AppContext.getInstance()`
  - `sqliteStoreManager`
  - `getSemanticNeighbors`
  - `isIndexedNoteNodeType`
  - Obsidian `metadataCache` / `vault`
- 新增 fake-port detector tests，可以不启动 Obsidian、不连 sqlite，直接测 detector 行为。
- 新增 source guard，防止以后又把 `@/app`、`@/ui`、sqlite、Obsidian import 偷偷带回 `src/service/lint`。
- 边界扫描从 `418 -> 415`，主要下降来自 Vault Lint detector 旧依赖被拔掉。

一句话：

> T7 不是功能开发，也不是 UI 改造；它是把 Vault Lint detector 从“自己到处找环境”改成“只通过一个可 fake 的上下文读环境”。

## 代码路径图

T7 前，detector 自己越界：

```text
VaultLintService
  -> signals/content.ts      -> AppContext.app.vault
  -> signals/tags.ts         -> AppContext.app.metadataCache
  -> signals/structural.ts   -> AppContext + sqliteStoreManager + getSemanticNeighbors
```

T7 后，detector 只看一个 port：

```text
main.ts
  -> composeVaultLintRuntime()
  -> new ObsidianVaultLintDetectorContextAdapter()
  -> new VaultLintService({ detectorContext, ...otherPorts })
  -> runFullScan()
  -> LintScanContext.detectorContext
  -> signals/*.ts
```

真正接触 Obsidian/sqlite 的地方变成：

```text
src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts
```

这就是 T7 的核心。

## Code Reading Guide

Read in this order:

1. `src/service/lint/ports/VaultLintPorts.ts`
   - 看 `VaultLintDetectorContextPort`。
   - 这是 detector 现在允许读取外部世界的唯一形状。
   - 你只需要确认这些方法名是不是业务语义：`listMarkdownFiles`、`readMarkdownFile`、`getTags`、`getHardOrphans`、`getSemanticNeighbors`。

2. `src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`
   - 看这个 adapter 如何实现上面的 port。
   - 重点看它如何把 Obsidian `TFile`、metadata cache、sqlite node、semantic neighbor 转成普通对象。
   - 这是唯一允许碰真实 app/sqlite/search helper 的新增文件。

3. `src/app/lint/composeVaultLintRuntime.ts`
   - 看 `detectorContext: new ObsidianVaultLintDetectorContextAdapter()`。
   - 这里回答：“真实 runtime 到底在哪里组装？”

4. `src/service/lint/VaultLintService.ts`
   - 看 `detectorContext: this.ports.detectorContext`。
   - 这里回答：“service 有没有自己摸 AppContext/sqlite？”
   - 结论：没有。它只把 port 放进 `LintScanContext`。

5. `src/service/lint/signals/content.ts`
   - 看 `const dc = context.detectorContext`。
   - 看 `dc.listMarkdownFiles()` 和 `dc.readMarkdownFile(...)`。
   - 这说明 content detector 不再知道 Obsidian vault。

6. `src/service/lint/signals/tags.ts`
   - 看 `dc.getTags(file.path)`。
   - 这说明 tags detector 不再知道 Obsidian metadata cache。

7. `src/service/lint/signals/structural.ts`
   - 看 `dc.getUnresolvedLinks()`、`dc.getHardOrphans(...)`、`dc.getNodesByIds(...)`、`dc.getSemanticNeighbors(...)`。
   - 这说明 structural detector 不再知道 sqlite repo 和 graph inspector helper。

8. `test/vault-lint-detectors.test.ts`
   - 看 `makeFakeContext()`。
   - 这是最重要的测试阅读点：它证明 detector 现在可以用 fake context 独立运行。

9. `test/vault-lint-source-guard.test.ts`
   - 看 `noAppOrUiOrSqliteImportsAnywhere` 和 `noServiceLocatorUsageInLiveCode`。
   - 这是防回退护栏：以后有人把 `AppContext` 或 sqlite 重新 import 回 service/lint，会直接测试失败。

Debug first file:

- detector 结果不对：先看 `src/service/lint/signals/*.ts`。
- 真实 Obsidian 读取不对：先看 `src/app/lint/ObsidianVaultLintDetectorContextAdapter.ts`。
- runtime 没把 adapter 接进去：先看 `src/app/lint/composeVaultLintRuntime.ts`。
- 以后边界退化：先看 `test/vault-lint-source-guard.test.ts`。

## Size Judgment

你的感觉是对的：T7 仍然不是特别大的重构波。

真实实现规模：

| Scope | Size |
| --- | ---: |
| Implementation commits | 2 |
| Production/test files touched | 14 |
| Approx implementation delta | about 1.1k lines |
| Boundary findings | `418 -> 415` |

所以它不是 T1-T4 那种很小的 adapter slice，但也不是你期望的 30-80 文件级大任务。

为什么仍然接受：

- 它关掉的是 Vault Lint foundation 的最后一块关键旧路径。
- 它不是只加新抽象，而是把 detector 旧依赖实际拔掉。
- 它加了 fake tests 和 source guards，不只是文档承诺。

为什么下一步要变大：

- Vault Lint 现在继续做只会变成局部 polish。
- 真正的大收益在第二个 capability，把同一套纪律推广出去。
- 下一轮 handoff 应该一次给 Claude 更大的 coherent package，减少你来回粘贴小 delta。

## Verification

Codex reran:

```text
npm run build
npm run test -- test/vault-lint-detectors.test.ts
npm run test -- test/vault-lint-source-guard.test.ts
npm run test -- test/lint-health-score.test.ts
npm run test -- test/vault-lint-service-ports.test.ts
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
npm run test -- test/vault-lint-defaults.test.ts
npm run test -- test/app-runtime-registry.test.ts
npm run test -- test/run-envelope-core.test.ts
node scripts/audit/boundary-baseline.mjs --out /tmp/t7-codex-boundary-baseline.md
npx tsc --noEmit 2>&1 | rg -n "src/(service/lint|app/lint)" || true
```

Results:

| Check | Result |
| --- | --- |
| Build | Pass |
| Vault Lint detector tests | 15/15 pass |
| Vault Lint source guards | 5/5 pass |
| Health score tests | 6/6 pass |
| Vault Lint service/ports tests | 11/11 pass |
| Vault Lint runner tests | 16/16 pass |
| Vault Lint contract tests | 5/5 pass |
| Vault Lint structural tests | 2/2 pass |
| Vault Lint repo tests | 3/3 pass |
| Vault Lint defaults tests | 9/9 pass |
| App runtime registry tests | 7/7 pass |
| RunEnvelope core tests | 27/27 pass |
| Boundary audit | 415 findings |
| T7 files in `tsc` output | no `src/service/lint` or `src/app/lint` errors |

Additional source checks:

```text
rg -n "from ['\"]@/app/|from ['\"]@/ui/" src/service/lint
rg -n "search-graph-inspector|from ['\"]obsidian|from ['\"]@/core/storage" src/service/lint/signals
rg -n "AppContext\s*\.\s*getInstance\s*\(|sqliteStoreManager\s*\." src/service/lint --glob '*.ts'
```

Result:

- no app/ui imports under `src/service/lint`;
- no Obsidian/sqlite/graph-inspector imports under `src/service/lint/signals`;
- remaining `AppContext` / `sqliteStoreManager` hits are comments or `VaultLintContract.ts` inventory strings, not live runtime calls.

## Boundary Delta

Codex boundary scan:

```text
Files scanned: 837 under src/
Total flagged cross-layer / side-effect edges: 415
```

Delta against T6R owner review:

| Metric | T6R | T7 | Delta |
| --- | ---: | ---: | ---: |
| Total flagged edges | 418 | 415 | -3 |
| service -> app shell | 73 | 70 | -3 |
| service AppContext references | 90 | 87 | -3 |
| service -> ui | 55 | 55 | 0 |
| service/core -> Obsidian side-effect surface | 20 | 20 | 0 |

Note:

- Claude note reported `Files scanned: 841`; Codex rerun reported `837`.
- The meaningful acceptance metric is not that file-count number. The meaningful metric is that total findings are `415` and Vault Lint detector-side service-to-app leaks are gone.

## Caveats

T7 intentionally does not change:

- UI behavior.
- SQLite schema.
- Ambient Push.
- Chat.
- Command Gateway.
- The underlying `getSemanticNeighbors` algorithm.
- RunEnvelope persistence / subscription.
- The product name `Vault Lint`.

Remaining old architecture is mostly outside Vault Lint:

- `service -> ui` still has 55 flagged edges, especially Quick Search, Ambient, Copilot, and chat stores.
- `service -> app shell` still has 70 flagged edges outside this capability.
- `core -> service/app/ui` still has 78 flagged edges.
- Other major capabilities still have not gone through the `Contract -> RunEnvelope -> Ports -> Adapter -> Trace` pattern.

## Architecture Score

| Group | T6R | T7 | Why |
| --- | ---: | ---: | --- |
| Control | 80 | 84 | The read path is now runtime -> service -> detector context -> app adapter. |
| Boundary | 73 | 79 | Detector-side app/sqlite/tool imports were removed and guarded. |
| Runtime truth | 83 | 85 | One Vault Lint runtime path remains; detector side effects no longer bypass runtime ports. |
| Verification | 84 | 89 | Fake detector context tests and source guards prove the boundary. |
| Overall | 79 | 84 | Accepted as Vault Lint foundation completion. |

Confidence:

- High. Backed by code inspection, build, focused tests, source searches, and boundary scan.

## Verdict

T7 should be accepted.

It earns acceptance because:

- detector files no longer reach into app/sqlite/tool helpers directly;
- Obsidian/sqlite/search side effects are centralized in one app adapter;
- fake-port tests prove detector behavior without Obsidian/sqlite;
- source guards prevent future boundary regression;
- Vault Lint now has a complete enough foundation path to stop polishing it.

## Next

Move to:

```text
T8 Ambient Push Foundation Readiness / Runtime Boundary Wave
```

T8 should be larger than T7.

Suggested T8 shape:

- audit Ambient Push current runtime and store ownership;
- identify old entry points and state truth;
- create/update capability contract and dependency inventory;
- extract first meaningful ports/adapters;
- close at least one old service -> ui store write/read path;
- add fake tests and source guards;
- allow multiple small commits inside one Claude session;
- include a Chinese implementation note and code reading guide.

T8 should not:

- add new Ambient product features;
- redesign Ambient UI;
- touch Chat;
- touch Command Gateway;
- create a second Ambient runtime path.

## Owner Teach-Back

After reading T7, you should be able to say:

1. Vault Lint detectors now read through `VaultLintDetectorContextPort`.
2. `ObsidianVaultLintDetectorContextAdapter` is the only new file that owns detector-side Obsidian/sqlite/search reads.
3. `VaultLintService` only threads `detectorContext` into `LintScanContext`; it does not call app/sqlite itself.
4. `test/vault-lint-detectors.test.ts` proves detector behavior with a fake context.
5. `test/vault-lint-source-guard.test.ts` prevents direct app/ui/sqlite imports from coming back.
6. T7 closes Vault Lint foundation work; the next real value is a larger wave on a second capability.
