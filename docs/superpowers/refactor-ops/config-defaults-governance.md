# Configuration Defaults Governance

## 中文摘要

Peak Assistant 里有大量阈值、权重、标签、颜色、文案、模式列表、时间间隔和 provider 默认值。它们不是普通实现细节，而是产品和领域配置。

核心规则：

> service 负责执行行为，不负责长期收藏配置表。

如果配置散落在 engine/service 文件里，后面会出现三个问题：

- owner 找不到该调哪个旋钮；
- AI 改代码时容易把业务逻辑和配置一起改坏；
- 同一类默认值会在模板、fallback、测试里慢慢漂移。

所以后续每个 capability 都要能回答：

- 可编辑配置在哪里？
- 编译期 fallback 在哪里？
- 哪个测试防止两边漂移？
- owner 不读 engine 文件时，能不能找到这些配置？

## Why This Exists

Peak Assistant has many thresholds, weights, labels, pattern lists, color maps, and timing defaults. If these are scattered across service files, the code becomes hard to tune and hard to understand.

The rule:

> Services should execute behavior. They should not be the long-term home for product/domain configuration tables.

## Default Locations

按这个顺序放置默认值：

1. `templates/config/*.json`
   - 首选位置。
   - 用于非工程用户未来可能调整的产品/领域配置。
   - 例子：labels、thresholds、weights、UI strings、model catalogs、dashboard copy。

2. A domain-specific compiled fallback module
   - 当代码需要 typed fallback，或者 TemplateManager 不可用时使用。
   - 文件名要清楚，例如 `src/service/lint/config/VaultLintDefaults.ts`。
   - 文件顶部要说明它镜像哪个 `templates/config/*.json`。

3. `src/core/constant.ts`
   - 只放小型、跨领域、真正不可运行时调节的常量。
   - 不要把大型领域配置表都倒进这里。

## Config Inventory Pattern

当一个 capability 新增配置时，在对应的 task / owner packet 中记录一行配置索引。格式建议：

| Capability | Editable source | Compiled fallback | Loader / adapter | Drift guard |
| --- | --- | --- | --- | --- |
| Vault Lint | `templates/config/vault-lint-config.json` | `src/service/lint/config/VaultLintDefaults.ts` | `ObsidianVaultLintConfigAdapter` | shape-compatible test |

这个索引不一定要集中塞进一个巨大表；但每个 capability 必须有明确的“可编辑源 + fallback + 防漂移测试”。如果某类配置会被多个 capability 共享，再升级成专门的 registry 或 `docs/superpowers/refactor-ops/*-inventory.md`。

当前已存在的 editable config 文件：

- `templates/config/chat.json`
- `templates/config/community-colors.json`
- `templates/config/curator-catalog.json`
- `templates/config/dashboard.json`
- `templates/config/onboarding.json`
- `templates/config/settings.json`
- `templates/config/time-within-normalize.json`
- `templates/config/vault-lint-config.json`

## Forbidden Pattern

Do not put large product/domain config directly inside an engine file:

```ts
// Bad
export const DEFAULT_SOMETHING_CONFIG = {
  thresholds: { ... },
  weights: { ... },
};

export class SomethingService {
  // engine logic
}
```

This mixes execution logic with configuration ownership.

## Required Pattern

For a configurable capability:

```text
templates/config/<capability>.json
src/service/<capability>/config/<Capability>Defaults.ts
src/service/<capability>/<Capability>Service.ts
```

The service imports the fallback, but the fallback file owns the table.

Tests should verify:

- the service file does not define the large default object inline;
- the compiled fallback and template JSON remain shape-compatible;
- missing or invalid template falls back safely.

## Current Vault Lint Case

Editable template:

- `templates/config/vault-lint-config.json`

Current problem:

- `DEFAULT_VAULT_LINT_CONFIG` is defined inside `src/service/lint/VaultLintService.ts`.

Desired T6R outcome:

- move the compiled fallback to a dedicated file such as `src/service/lint/config/VaultLintDefaults.ts`;
- document that it mirrors `templates/config/vault-lint-config.json`;
- add a test that compares keys/shape with the template JSON;
- keep `VaultLintService.ts` focused on scan execution.

This is not only a Vault Lint cleanup. It is the first concrete application of the project-wide config governance rule.

## Review Checklist

Before accepting a future capability:

- Where is the editable config?
- Where is the compiled fallback?
- Does the service own behavior only?
- Is there a test preventing inline config drift?
- Can the owner find the knobs without reading the engine?
