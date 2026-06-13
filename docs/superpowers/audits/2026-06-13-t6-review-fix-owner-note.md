# Owner Note: T6 Review Fix Required

## 中文摘要

你指出的两个问题是对的：

1. `VaultLintRuntime.ts` 里还有 `let currentRuntime`，虽然比之前到处找单例更集中，但它仍然是 service 层的隐藏 runtime owner。
2. `DEFAULT_VAULT_LINT_CONFIG` 还在 `VaultLintService.ts`，这会让配置表和扫描 engine 混在一起，不利于长期维护。

结论：T6 可以作为中间态接受，但 T7 先暂停。下一步先做 T6R，把 runtime ownership 和 config defaults 归位。

Status:
- T6 accepted as a backend closure wave.
- Owner raised two valid architecture objections after review.
- These must be fixed before continuing to T7.

## Owner Objections

1. `src/service/lint/VaultLintRuntime.ts` still owns:

```ts
let currentRuntime: VaultLintRuntime | null = null;
```

This is still a module-level runtime singleton. It is centralized and fail-loud, but it is not the final ownership model. If copied to every capability, the codebase would end up with scattered runtime bindings.

2. `DEFAULT_VAULT_LINT_CONFIG` lives inside `VaultLintService.ts`.

The values are domain configuration:

```ts
dimensionWeights
thresholds
scan intervals
```

They should not live inside the scan engine. The project already has `templates/config/vault-lint-config.json`; compiled fallbacks and editable templates need one documented governance pattern.

## Codex Verdict

The owner is right.

T6 remains accepted as an intermediate step, but T7 should pause until a review fix lands:

```text
T6R Runtime Ownership + Config Defaults Governance
```

## Acceptance Rule For T6R

T6R is accepted only if:

- `src/service/lint/VaultLintRuntime.ts` no longer contains a module-level `currentRuntime`.
- runtime ownership moves to app-level composition, preferably `AppContext` or a single app-owned runtime registry.
- service-layer code does not import `AppContext` to get the runtime.
- `DEFAULT_VAULT_LINT_CONFIG` is removed from `VaultLintService.ts`.
- Vault Lint defaults are documented and tied to `templates/config/vault-lint-config.json`.
- tests/source guards prevent these patterns from returning.

## Next

Use:

[`t6-review-fix-runtime-ownership-config-defaults-handoff.md`](../refactor-ops/t6-review-fix-runtime-ownership-config-defaults-handoff.md)
