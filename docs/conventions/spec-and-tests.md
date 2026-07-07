# Spec + Tests Live In One Document

## TL;DR

`docs/superpowers/specs/*` 是 spec 唯一入口。**Acceptance criteria、要新增或扩展的 test 文件清单、bad-case 复现说明、验证 gate 都作为 spec 的 section 内嵌进去**——不要拆到独立的 `test-plan.md` / `verification.md` / `qa.md`。

## Why

- 读者只需要打开一份文档就能拿到"要做什么 + 怎么验证 + 期望的 gate"。跳来跳去成本高，而且容易漏掉某一份。
- Spec 和 test-plan 拆开时几乎必然 drift：某一份改了另一份没跟上，之后无人能判断哪份是权威。
- 未来的 coding agent（无论有没有 memory）只会读 `docs/superpowers/specs/<slug>.md`，需要在同一份文档里看到实施 + 验证 + 通过条件。
- 已经存在的 spec（例如 `docs/superpowers/specs/2026-07-07-search-highlight-vault-first.md`）已经把 Acceptance Criteria、test file list、bad-case 表格全嵌进主 spec；本规则把这套做法固化成通用规矩。

## Do

在 spec 主文档里保留这些 section（顺序可调，但都要在同一份 md）：

### Implementation Plan

按 phase 列出要动的模块、方法名、文件路径。不写工时估算（见 [`../conventions` 的相关规则 / MEMORY.md 里的 no-time-estimates`]）。

### Acceptance Criteria

- 用户视角可观察的判定条件（例："搜索 `编辑` 时 snippet 不含 `编 辑` 分词空格"）。
- 已存在或需新增的 test 文件路径清单，例：
  - `test/highlight-source-resolver.test.ts` — 覆盖 Vault-first / timeout fallback / hint offset。
  - `test/highlight-engine.test.ts` — 扩展 hintOffset 早/晚窗口 case。
- 明确"通过 = 什么"：`npm run test` 全绿 + 新增 case pass。

### Bad-case Repro

如果 spec 起因于用户看到的具体 bad case，把复现步骤 + 触发数据 + 期望输出 一起写在 spec 里。方便 coding agent 判断"我改完，怎么手工验证不再复发"。

### Risks / Tradeoffs

一列到底：可能的 regression + 缓解手段。

### Non-Goals

明确不改动的边界，避免过度实现。

### Open Questions

需要 human decision 的点集中列。

## Don't

- **不要**开新文件 `<slug>-test-plan.md`。哪怕 acceptance criteria 长，也留在主 spec 里做一个 `## Acceptance Criteria` section。
- **不要**在 spec 里只写"跑 `test/foo.test.ts` 全绿"这种薄一句就了事——把具体 case 场景（输入、期望、边界）也写清楚，coding agent 才能判断测试是否漏 case。
- **不要**把已有 spec 里的测试段拆出去。见到 `docs/superpowers/specs/<slug>-verification.md` 这类文件 → 合并回主 spec，主 spec 未合并前先不动，但在 review 里指出。
- **不要**把测试信息只写在 PR description / commit message。它们不进 spec，未来的 coding agent 拉不到。

## Checklist

Review spec 时逐条过：

- [ ] 主 spec 里有独立 `Acceptance Criteria` section？
- [ ] 每条 acceptance criterion 都有可观察的判定条件？
- [ ] 需要新增/扩展的 test 文件路径全部列在 spec 里？
- [ ] 覆盖 case 描述到"输入 + 期望 + 边界"级别，不是"跑 foo.test.ts 全绿"？
- [ ] Bad-case repro 步骤在 spec 里？
- [ ] 没有拆出去的 test-plan / verification / qa 独立文档？
- [ ] Spec 里没有"预计 X 天"这类工时估算？

## Exemplar

`docs/superpowers/specs/2026-07-07-search-highlight-vault-first.md` — 单文档同时承载：Summary、Reader And Goal、Current Facts、Problem、Goals、Non-Goals、Proposed Design、User-Facing Behavior、Implementation Plan（Phase 1–3）、Acceptance Criteria（含 3 个 test 文件路径 + gate）、Risks、Open Questions、Code Reading Order。coding agent 只读这一份就能实施 + 验证。
