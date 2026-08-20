# Vault Intelligence：AI Review 与 Proposal 设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文定义 AI 如何审阅确定性结果、产生可追溯 insight，并在可能修改文件时进入独立 proposal review。**AI Review 是理解层，不是事实层，也不是自动写入层。**

Owner 用自然语言纠正 Peak 后，AI 或规则只重算尚未 Apply 的 suggestion；它不能静默覆盖既有 owner choice。Suggestion revision、最终 change set、Apply 和 Verify 的共同边界由上面的共享规则定义。

## 1. 三种能力不能混在一起

| 能力 | 谁发现什么 | 输出 | 当前定位 |
|---|---|---|---|
| Deterministic detectors | 规则发现可验证事实 | raw findings、阈值、证据 | 基础事实层 |
| AI Review of findings | AI 阅读 findings 与上下文 | insight、根因假设、趋势、优先级 | 核心理解层 |
| Semantic AI detectors | AI 直接发现新语义问题 | contradiction、coverage gap 等新 finding | 当前 future / no-op |

即使 semantic detector 尚未实现，AI 仍然需要审阅现有 19 个 detector 的结果。

## 2. 两类入口

### 2.1 扫描结果入口

- Scan Vault 已确认的 AI Review 阶段；
- Completed run 的每条 actionable result 内联 AI explanation；
- Work queue 当前筛选结果或选中的 findings。

扫描完成后不要求用户进入一个独立 AI Review 页面才能找到结论或 Proposal。对于已经在本次 run 中完成的 review，事实、解释、citations 摘要和 next action 直接附着在对应结果上；独立 AI Review 页面只用于用户从 Work queue 对选定范围发起新的分析运行。

### 2.2 对象范围入口

- Community；
- Hub、Gap、Bridge 或 Orphan 集合；
- selected files 或 folder；
- Project、Composer session、AI Graph 或相关对象集合。

全局 Header 不放没有上下文的 `Run AI Review`。

## 3. 运行前

Preflight 显示：

- finding 数、文件数和对象数；
- 将读取的 raw findings、文件证据、Vault map 与历史结果；
- 模型、预计 token、成本和预算上限；
- 输出类型：解释、candidate actions 或 proposal；
- 明确说明不会直接修改文件；
- evidence 缺失或 scope 过大时的分批策略。

## 4. 运行阶段

```text
Load finding snapshot
→ Gather evidence
→ Cluster related findings
→ Compare history
→ Synthesize insights
→ Validate citations
→ Build suggested actions
```

运行中显示当前阶段、正在读取的 finding group / object / file sample、已读 evidence 数、已形成 insight 数、冲突证据数、elapsed、token、cost 和 Stop。

用户不能只看到按钮变成 `Running`。AI provider 等待、partial failure 和 unavailable evidence 都要作为实时事件显示。

## 5. AI 应分析什么

- 多个 findings 是否来自同一 folder、导入批次、Project 或 Community；
- Orphan、missing metadata、stale Hub 和 broken link 是否指向共同根因；
- 哪些是历史趋势，哪些是本次新变化；
- 哪些影响高价值 Hub、活跃 Project 或多个下游对象；
- 哪些可能是 template、archive 或特殊文件类型造成的噪声；
- 哪些事项可以合并成一个维护动作；
- 是否存在证据冲突、反例或需要用户判断的地方。

## 6. 结果呈现

结果至少包含：

1. Executive insight；
2. Insight clusters；
3. 每条 insight 的 evidence；
4. Priority and impact；
5. What changed；
6. Confidence、alternatives 和 conflicting evidence；
7. Suggested actions；
8. 与 finding snapshot 绑定的 Save / history。

### 6.1 三层真值

| 层级 | 示例 | 真值来源 |
|---|---|---|
| Observed facts | 42 个 orphan，其中 31 个来自同一导入目录 | detector finding + evidence |
| AI insights | 更像一次未完成导入，而不是 31 个独立知识缺口 | AI inference + cited facts |
| Suggested actions | 先标记 staging，再审阅剩余 11 个 orphan | candidate action |

数据结构必须保持三层，但扫描完成页不把它们拆成三个大卡片或多层导航。每条 actionable result 以 `事实 → AI 解释 → 建议动作` 的顺序就地呈现，并链接到可检查证据。AI 不能覆盖 detector finding，也不能把推断写成确定事实。

## 7. AI Review record

需要保留：

```text
reviewId / runId / findingSnapshotId
scope / model / provider / promptVersion
startedAt / completedAt / status
evidenceRefs[]
insights[]: title / summary / confidence / evidenceRefs[]
alternatives[] / conflicts[]
suggestedActions[]
tokenUsage / cost
```

重开历史 review 时显示当时的 evidence snapshot。新的扫描不会静默修改旧结论；需要重新分析时创建新版本并关联前一个 review。

## 8. Proposal 流程

AI Review 本身只读。涉及 frontmatter、tag、link、Bridge note 或其他文件修改时进入：

```text
AI insight
→ Candidate proposal
→ Evidence + per-file diff
→ User accepts selected changes
→ Source hash / revision guard
→ Apply
→ Re-index affected files
→ Verify in Vault Intelligence
```

Proposal review 必须支持逐文件 accept / reject、partial apply、source changed conflict 和失败后的安全重试。

当 run 已准备 proposal 时，Completed run 直接显示 `Proposal ready` 和受影响文件数，并提供 `Review proposal`。Proposal 仍是独立安全 surface，但不能隐藏在 AI Review 的下一层。

## 9. 失败与降级

| 情况 | 产品行为 |
|---|---|
| AI provider 不可用 | 保留 facts，显示 AI review pending / unavailable |
| 部分 evidence 读取失败 | 生成 partial result，明确缺失范围 |
| 引用无法验证 | 不发布该 insight，或标记低置信度和 unavailable citation |
| 预算耗尽 | 保留已完成 clusters，显示未处理范围 |
| Proposal source 已变化 | 阻止 Apply，要求重新生成或人工合并 |
| AI 结果为空 | 说明本次没有形成可靠 insight，不能说“Vault 没问题” |

## 10. 仍需确认

- 扫描后 AI Review 的默认触发策略；
- high-impact finding 的阈值；
- 大范围 findings 的 batch 大小；
- 第一批允许生成的 proposal 类型；
- 用户如何选择模型与预算上限。
