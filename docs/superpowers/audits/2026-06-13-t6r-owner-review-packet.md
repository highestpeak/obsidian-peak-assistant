# Owner Review Packet: T6R Runtime Ownership + Config Defaults

Claude Code commit:
- `abb968d9 refactor(lint): move Vault Lint runtime ownership to app layer and extract config defaults (T6R)`

Codex verdict:
- Accepted

Owner decision:
- 接受 T6R。
- 先不要发送旧的 T7 小包；下一步应基于 T6R 结果重写一个更大粒度的 Vault Lint closure wave。

Global position:
- T6 已把 `VaultLintService` 改成 ports + plain class。
- T6R 修正 T6 后 owner 指出的两个治理问题：runtime binding 不能停在 service 层 module singleton，配置默认值不能藏在 engine 文件里。
- 这轮不是新功能；用户可见行为基本不变。

## Review Entry Points

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final | T6R 的验收记录、代码阅读入口、下一步判断。 |
| [`t6-review-fix-runtime-ownership-config-defaults-handoff.md`](../refactor-ops/t6-review-fix-runtime-ownership-config-defaults-handoff.md) | Source contract | T6R 允许 Claude Code 做什么。 |
| [`2026-06-13-t6-review-fix-owner-note.md`](./2026-06-13-t6-review-fix-owner-note.md) | Owner note | 为什么 T6 后必须先修 runtime/config 两条。 |
| [`config-defaults-governance.md`](../refactor-ops/config-defaults-governance.md) | Rule doc | 配置默认值归档规则。 |
| [`architecture-scorecard.md`](../refactor-ops/architecture-scorecard.md) | Updated | T6R 分数和下一步目标。 |

## 中文摘要

T6R 做到了两件关键事：

1. `src/service/lint/VaultLintRuntime.ts` 不再保存 `let currentRuntime`。
   - 新 owner 是 `src/app/runtime/AppRuntimeRegistry.ts`。
   - `AppContext` 持有 `runtimeRegistry`，并提供 thin delegator。
   - `VaultLintRun.ts` 不再自己查 runtime；调用方必须显式传 `runtime` 或测试用 `scan`。

2. `DEFAULT_VAULT_LINT_CONFIG` 不再放在 `VaultLintService.ts`。
   - 新位置是 `src/service/lint/config/VaultLintDefaults.ts`。
   - editable source 仍是 `templates/config/vault-lint-config.json`。
   - 新测试 `test/vault-lint-defaults.test.ts` 做 template/fallback drift guard。

这轮没有降低 boundary audit 数字：

- Total flagged edges: `418 -> 418`
- Service -> app: `73 -> 73`
- Service -> UI: `55 -> 55`

但这不等于没进展。T6R 的目标是 ownership cleanup，不是 detector closure。真正会降低 `service -> app` 的是下一步清 `src/service/lint/signals/*` 的 AppContext/sqlite 依赖。

## Code Reading Guide

Read in this order:

| Order | File | What to inspect | Why it matters |
| ---: | --- | --- | --- |
| 1 | `src/app/runtime/AppRuntimeRegistry.ts` | `set/get/tryGet/clearVaultLintRuntime` | runtime binding 新 owner。 |
| 2 | `src/app/context/AppContext.ts` | `runtimeRegistry` + static delegators | app 层如何暴露 runtime。 |
| 3 | `src/service/lint/VaultLintRuntime.ts` | interface only | service 层 runtime 文件已无状态。 |
| 4 | `src/service/lint/VaultLintRun.ts` | `VaultLintRunOptions.runtime` + no fallback lookup | runner 不再做 service locator。 |
| 5 | `src/service/lint/config/VaultLintDefaults.ts` | `DEFAULT_VAULT_LINT_CONFIG` + `mergeVaultLintConfig` | 配置默认值新家。 |
| 6 | `src/service/lint/VaultLintService.ts` | `mergeVaultLintConfig(loaded)` | engine 只执行行为，不收藏配置表。 |
| 7 | `src/ui/context/ServiceContext.tsx` and `src/ui/view/vault-lint/hooks/useVaultLintRunState.ts` | `vaultLintRuntime` threading | UI 显式传 runtime 给 runner。 |
| 8 | `test/app-runtime-registry.test.ts` and `test/vault-lint-defaults.test.ts` | source guards + drift guards | 防止坏模式回来。 |

Debug first file:

- Runtime 未绑定 / double bind：先看 `src/app/runtime/AppRuntimeRegistry.ts`。
- UI Scan Now 报 runtime not ready：先看 `main.ts` sqlite init 是否完成，再看 `ServiceContext.tsx`。
- 配置值不生效：先看 `templates/config/vault-lint-config.json` 和 `VaultLintDefaults.ts`。

## Runtime Ownership Check

| Runtime | Owner before | Owner after | App-level composition point | Service-layer singleton? | Accepted? |
| --- | --- | --- | --- | --- | --- |
| Vault Lint | `src/service/lint/VaultLintRuntime.ts` module variable | `AppContext.runtimeRegistry: AppRuntimeRegistry` | `main.ts` calls `AppContext.setVaultLintRuntime(composeVaultLintRuntime())` after sqlite init | No | Yes |

Evidence:

- `src/service/lint/VaultLintRuntime.ts` is now a pure interface file.
- `runVaultLintManualScan()` throws if neither `runtime` nor test `scan` is supplied.
- `VaultDigestService` no longer imports runtime binding; `VaultReviewSession` resolves from `AppContext` and passes `vaultLintRuntime` explicitly.
- Source guard tests cover registry semantics and pure service-layer runtime file.

Residual risk:

- If Vault X-Ray view somehow mounts before sqlite/runtime is ready, `ServiceContext` can capture `null`; the hook surfaces a friendly error. Normal desktop boot binds runtime before ViewManager/commands register, so this is an edge case rather than a normal path.

## Config Defaults Ownership Check

| Config | Editable source | Compiled fallback | Loader / adapter | Inline in service engine? | Drift guard |
| --- | --- | --- | --- | --- | --- |
| Vault Lint config | `templates/config/vault-lint-config.json` | `src/service/lint/config/VaultLintDefaults.ts` | `src/app/lint/ObsidianVaultLintConfigAdapter.ts` | No | `test/vault-lint-defaults.test.ts` |

Evidence:

- `VaultLintService.ts` no longer defines `DEFAULT_VAULT_LINT_CONFIG`.
- `VaultLintDefaults.ts` documents editable source, compiled fallback, loader, and drift guard.
- Tests compare fallback values against JSON template for `dimensionWeights`, `thresholds`, and `scan`.

Residual note:

- The JSON template may contain extra future detector keys. The test intentionally enforces "compiled subset matches JSON", not exact equality.

## What Did Not Change

- Detector files still import `AppContext`:
  - `src/service/lint/signals/content.ts`
  - `src/service/lint/signals/structural.ts`
  - `src/service/lint/signals/tags.ts`
- `structural.ts` still uses sqlite/graph environment directly.
- Boundary audit stayed flat.
- No SQLite schema change.
- No Vault X-Ray visual redesign.
- No Chat / Quick Search / Ambient / Command Gateway work.

Important correction to the implementation note:

- The broad `rg "from '@/app/context/AppContext' src/service/lint"` still reports detector hits. That is expected and reserved for the next closure wave. T6R only removed the runtime lookup/config-defaults problems.

## Verification

Codex reran:

```text
npm run build
npm run test -- test/app-runtime-registry.test.ts
npm run test -- test/vault-lint-defaults.test.ts
npm run test -- test/vault-lint-service-ports.test.ts
npm run test -- test/vault-lint-runner.test.ts
npm run test -- test/vault-lint-contract.test.ts
npm run test -- test/vault-lint-structural.test.ts
npm run test -- test/vault-lint-repo.test.ts
npm run test -- test/run-envelope-core.test.ts
node scripts/audit/boundary-baseline.mjs --out /tmp/t6r-codex-boundary-baseline.md
```

Results:

| Check | Result |
| --- | --- |
| Build | Pass |
| `app-runtime-registry` | 7/7 pass |
| `vault-lint-defaults` | 9/9 pass |
| `vault-lint-service-ports` | 11/11 pass |
| `vault-lint-runner` | 16/16 pass |
| `vault-lint-contract` | 5/5 pass |
| `vault-lint-structural` | 2/2 pass |
| `vault-lint-repo` | 3/3 pass |
| `run-envelope-core` | 27/27 pass |
| Boundary audit | 418 findings |

Warnings:

- Build still emits the pre-existing Browserslist warning.
- `vault-lint-service-ports` intentionally logs a detector failure in its fake detector test.

## Elegance Score

| Dimension | Code | Before | After | Delta | Confidence | Reason / evidence |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Architecture clarity | AC | 82 | 84 | +2 | High | runtime owner and config owner now named explicitly. |
| Capability semantics | CS | 78 | 80 | +2 | High | `VaultLintRuntime` is now a pure capability surface. |
| Dependency direction | DD | 68 | 68 | 0 | High | boundary counts flat; detectors still import app. |
| Modularity / cohesion | MC | 68 | 76 | +8 | High | runtime registry and defaults file separate ownership from engine. |
| Side-effect isolation | SI | 70 | 72 | +2 | Medium | runtime binding moved to app; detector side effects remain. |
| Single runtime path | SR | 78 | 84 | +6 | High | no service-layer runtime module singleton remains. |
| State ownership clarity | SO | 78 | 84 | +6 | High | AppRuntimeRegistry owns runtime binding; repo owns persistence. |
| Observability / trace | OT | 74 | 74 | 0 | High | no new trace feature; existing RunEnvelope preserved. |
| Testability / fake-port readiness | TF | 82 | 88 | +6 | High | new registry/defaults tests and runner injection guard. |
| Old-path deletion | OD | 76 | 80 | +4 | High | removed `currentRuntime` path and inline config owner. |
| Change radius | CR | 72 | 74 | +2 | Medium | runtime/config ownership clearer; import counts unchanged. |
| Owner comprehension | OC | 82 | 83 | +1 | Medium | reading guide is good; a few code comments remain stale. |
| Overall elegance | Overall | 77 | 79 | +2 | High | governance improved without boundary-count improvement. |

Grouped indices:

| Group | Before | After | Delta | Reason |
| --- | ---: | ---: | ---: | --- |
| Control Index | 79 | 80 | +1 | clearer runtime/config owners. |
| Boundary Index | 70 | 73 | +3 | no count reduction, but ownership moved out of engine. |
| Runtime Truth Index | 78 | 83 | +5 | runtime binding now app-owned. |
| Verification Index | 79 | 84 | +5 | new guard tests for both rules. |

## Follow-Up Notes

Non-blocking code comment tails:

- `src/service/lint/VaultLintRun.ts` still says "production callers pass nothing" in the option docs; after T6R production callers must pass `runtime`.
- `src/app/lint/composeVaultLintRuntime.ts` top comment still mentions `setVaultLintRuntime` / `getVaultLintRuntime` without saying they are now AppContext/app-owned delegators.

These do not affect behavior and can be cleaned in the next doc/comment hygiene pass or next Vault Lint closure wave.

## Next Task

Recommended:

- Do not send the old small T7 as-is.
- Design the next Vault Lint closure wave after this accepted T6R packet.
- It should include detector context closure, stale comment cleanup, and probably a broader Vault Lint source-guard sweep in one larger package.

Do not do next:

- Do not start Chat, Ambient Push, or Command Gateway yet.
- Do not start a second capability until Vault Lint is a complete worked example.

## Review Verdict

Verdict:
- Accepted

Reason:
- T6R directly fixes the two owner-raised governance issues.
- Runtime ownership is app-level.
- Config defaults are discoverable and guarded.
- Build/tests/boundary audit pass.

Required follow-up before next task:
- Rewrite the next handoff at a larger useful scope. The old T7 draft is too small for the direction the owner wants.
