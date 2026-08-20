# Vault Intelligence：Scan Vault 与 Runs 设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文定义一次 Vault 维护运行从准备到完成的完整体验。关键原则是：**顶层只有一个启动动作；确认后自动进入真实进度工作区；确定性 facts 先交付，AI Review 再形成 insights。**

Completed 中需要 owner 介入的结果继续进入同一份 canonical follow-up set；分组投影、分级覆盖、建议纠正、最终 diff 与 Apply / Verify 边界由上面的共享规则定义。

## 1. 一个主动作，文案随状态变化

| 当前状态 | 主动作 | 点击结果 |
|---|---|---|
| 首次使用，没有可用 projection | `Prepare Vault` | 打开首次运行 preflight |
| 正常空闲 | `Scan Vault` | 检查变化并生成本次运行计划 |
| 已暂停 | `Resume scan` | 从 checkpoint 恢复同一 run |
| 正在运行 | `View progress` | 返回已有 Active run，不创建第二次运行 |

`Refresh checks`、`Enrich files` 和无上下文的 `Run AI Review` 不作为并列顶层按钮。它们是同一次运行中的阶段或明确范围内的后续动作。

## 2. Preflight

Preflight 是 `Runs / New scan` 下的独立页面，不插入 Overview，也不在点击范围后跳回首页。它只让用户决定：

- 范围：changed files、selected scope 或 entire Vault；
- 要回答的检查组：Knowledge structure、Content quality、Tags & metadata、Freshness & aging；
- 是否更新 Summary 或 AI Tags；
- 是否对相关 findings 附加 AI explanation；
- 是否准备可审阅的文件变更 proposal；
- 模型、预计 token / 成本和预算上限；
- 预计对象数和时间范围；
- 明确说明扫描和 AI Review 都不会直接修改用户文件。

Preflight 不显示 `What this run will do` 或完整内部 stage list。Search、Vault map、dependency closure 等由系统根据当前状态生成，开始后在 Active run 里透明展示；它们不是用户需要配置的第二套选项。19 个 detector 可以选择，但第一层只按四组自然语言呈现，detector ID 留在详情和 evidence 中。

默认建议范围是上次成功扫描之后发生变化的对象。Entire Vault 是显式选择，不应成为每次维护的默认成本。

## 3. 运行计划

```text
Discover changes
→ Read and parse eligible objects
→ Update required Search projection
→ Compute Vault map changes
→ Run deterministic detectors
→ Facts ready
→ Review findings with AI（已确认时）
→ Optional Summary / AI Tags / vectors
→ Build work items and final delta
→ Complete
```

系统根据依赖生成计划。用户选择的是目标和范围，不需要理解内部管线名称。

## 4. 什么时候运行 Vault Index

| 情况 | 处理方式 |
|---|---|
| 文件未变化且现有 projection 可用 | 不重复索引 |
| 少量新增、修改、移动或删除 | 增量处理受影响文件和关系 |
| selected scope 请求定向修复 | 只处理明确选择的对象 |
| schema / model / chunk policy 改变 | Preflight 明确说明需要较大范围重建 |
| projection 缺失或损坏 | 提供 rebuild 原因、范围和预计成本 |

结构检查依赖的事实必须新鲜，但这不意味着每次 Scan Vault 都执行完整 embedding 或 LLM enrichment。

## 5. Active run 是运行期间的主工作区

```text
┌──────────────────────────────────────────────────────────────┐
│ Scanning changed objects                         Pause · Stop│
│ 4,133 / 4,860 · 85% · 60 objects/min · ETA 13 min           │
├────────────────────────────────┬─────────────────────────────┤
│ Queue                          │ Current item                │
│ completed / current / waiting  │ 文件或 batch、当前子步骤     │
│ warning / failed               │ 证据、耗时、retry 状态        │
├────────────────────────────────┴─────────────────────────────┤
│ Stage timeline · event stream · throughput / cost            │
└──────────────────────────────────────────────────────────────┘
```

确认运行后直接进入这个页面，不再让用户点击第二次 `View progress`。离开页面后运行继续，Overview、Vault map、Work queue 和 Runs 都显示同一个 persistent run strip。

## 6. 运行中必须显示的真值

| 情况 | 页面显示 | 禁止显示 |
|---|---|---|
| 总量未知 | 当前阶段、已发现数量、正在扫描的 scope | `0%` 或伪造 ETA |
| 总量确定 | processed / total、百分比、剩余量 | 只有 spinner |
| 样本不足 | `Calculating speed and ETA` | 跳动的伪精确 ETA |
| per-file 阶段 | 当前文件、子步骤、队列位置 | 只写 `Scanning` |
| 全局阶段 | detector group、Community 或 batch | 伪造一个当前文件 |
| 部分失败 | 失败计数、原因、继续运行状态 | 完成时才突然报告 |
| 等待 provider | 等待原因、时长、retry / stop 条件 | 看起来仍在处理 |
| stalled | last event time、诊断与 retry | 永久转圈 |
| paused | checkpoint、暂停阶段、Resume | 看起来仍在运行 |

百分比来自真实 work units 或有依据的阶段权重。不同成本的阶段不能简单平均分配百分比。

## 7. Detector 与 AI Review 的阶段关系

确定性 detector 完成后，raw findings 立即可见。AI Review 读取本次 finding snapshot、相关文件、Vault map 和历史结果，再形成：

- insight clusters；
- 可能根因；
- 影响范围和优先级；
- 与上次相比的趋势；
- suggested actions。

AI Review 不可用或失败时，run 仍可完成，状态显示 `Facts ready · AI review pending / failed`。不能把 AI 未执行解释为“没有问题”。

## 8. 完成页：结果、解释和动作在一起

完成页不再使用 `Observed facts / AI insights / Files & enrichment / Run evidence` 四个并列 tab。它首先回答：

- 哪些结果现在需要决定；
- 每个结果的确定性事实、简短 AI 解释、影响、证据数量和下一步是什么；
- 哪些 unresolved 结果已经创建 Work queue item；
- 哪些结果已经产生可直接 review 的 file-change proposal；
- 哪些文件需要 retry 或明确 exclusion；
- Search、Vault map、Summary 和 AI Tags 自动更新了多少。

只有拥有 next action 和 exit condition 的 unresolved result 进入 Work queue；已解决或纯信息结果保留在 run snapshot 中。Proposal 是完成页的一等输出，直接进入 per-file diff review，不要求先打开独立 AI Review 页面。run ID、耗时、模型、token、成本和完整 citations 收进默认折叠的 `Run details and evidence`。

Completed run 绑定本次输入范围和 finding snapshot，保证以后重开时看到的是当时的结果，而不是被最新扫描悄悄替换。

## 9. Runs 页面

Runs 同时展示 active、queued、paused、failed、cancelled 和 completed。它不是只记录过去的 History。

Run 是系统产生的执行记录，不是文件、Project 或用户任务。因此列表中不为 Run 创建人为名称，也不使用一组装饰图标把它们伪装成可管理对象。没有 active run 时显示独立空闲状态，不创建一条假的 Run。

每条 run 显示：

- 开始时间与稳定 run ID；
- operation type 与 trigger；
- scope；
- 当前状态和阶段；
- processed / total；
- 开始、暂停或完成时间；
- warning / failure 数；
- 模型与成本；
- 下一步：View、Resume、Retry failures 或 Review results。

默认列表按开始时间倒序排列，并使用固定列标题。`Vault scan`、`AI review`、`Index retry` 是 operation type，不是用户需要理解或维护的“名字”。

Runs 只收录影响 Vault Intelligence 状态或 work item 的执行。完整 Chat、Composer、AI Graph 和 Peak Sheet 历史仍留在自己的 owner surface。

## 10. 恢复与失败

- 关闭 View 或重启后，从同一 run identity 恢复；
- Pause 保存 checkpoint，不把 run 变成 completed；
- Retry failures 创建关联 attempt，保留原始失败证据；
- 单个 detector 失败产生 partial result，不抹掉其他 findings；
- 用户 Stop 后保留已完成阶段和明确未完成范围；
- source 在运行中变化时，结果标记 stale 或进入 revision conflict，不静默覆盖。

## 11. 仍需确认

- 顶层最终文案是否使用 `Scan Vault`；
- 默认是否仅扫描 changed files；
- AI Review 是默认处理 high-impact findings，还是每次在 Preflight 中确认；
- 大规模 findings 的分批与预算策略；
- Pause / Resume 的第一版支持哪些阶段。
