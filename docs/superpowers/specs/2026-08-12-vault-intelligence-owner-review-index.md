# Vault Intelligence Owner Review Index

> 状态：产品设计、专项文档与 V2 交互 Mock 已完成，等待 owner 逐项审阅。没有修改产品代码；V1 HTML Mock 只用于对照问题。

这份文件是本轮讨论的点击入口。它用短段落汇总你提出的全部修改，列出需要继续设计或实现的事项，并连接产品 Overview、七份专项设计、六条流程图和旧 Mock。

<a id="review-order"></a>

## 1. 建议阅读顺序

| 顺序 | 文档 | 适合检查什么 |
|---:|---|---|
| 1 | [产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md) | 产品是什么、为什么存在、整体页面与用户主循环 |
| 2 | [Overview 与 Vault map](./2026-08-12-vault-intelligence-overview-and-vault-map-design.md) | 第一屏、全局对象、结构信息和对象详情 |
| 2.1 | [Activity 时间可视化调研与设计](./2026-08-12-vault-intelligence-activity-visualization-research.md) | 大量活动如何聚合、缩放、筛选和下钻，以及组件选择 |
| 3 | [Scan Vault 与 Runs](./2026-08-12-vault-intelligence-scan-and-runs-design.md) | 主动作、Preflight、实时进度、完成页和恢复 |
| 4 | [Vault contents、Search 与 AI 状态](./2026-08-12-vault-intelligence-contents-search-and-ai-design.md) | 所有文件类型、索引、Summary、AI Tags 和 vectors |
| 5 | [Work queue 与 Findings](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md) | 完整队列、Priority work、19 个 detector |
| 5.1 | [Follow-up、Work queue 与 maintenance review 共享合同](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) | Canonical atom、多种 projection、分级作用域、owner correction、Apply / Verify，以及 File Property 完整合同 |
| 6 | [AI Review 与 Proposal](./2026-08-12-vault-intelligence-ai-review-and-proposal-design.md) | AI 如何形成 insight，以及如何安全进入修改建议 |
| 7 | [技术产物与交付边界](./2026-08-12-vault-intelligence-technical-and-delivery-reference.md) | current / planned / future、存储、Mock 验收和源码证据 |
| 8 | [V2 交互 Mock](../../gstack/vault-intelligence-workspace-2026-08-12-v2/index.html) | 审阅新 Overview、Vault map、Work queue、Runs、扫描进度、AI Review 与 Proposal |
| 9 | [V1 旧 Mock](../../gstack/vault-intelligence-workspace-2026-08-11/index.html) | 仅用于对照现有问题，不代表新设计 |

<a id="all-corrections"></a>

## 2. 本轮所有修改意见

### 2.1 产品定位

你指出旧设计像一个 Health dashboard，不知道 Vault Intelligence 为什么存在。现在把它定义成整个 Vault 的观察与维护工作区：用户既能查看全局结构，也能发起扫描、理解问题、处理建议并验证结果。

### 2.2 独立 View 与命令入口

Vault Intelligence 使用独立 View，不继续塞在旧的大 Modal 中。Command Palette 只注册稳定的 `Open Vault Intelligence`；Scan、AI Review、重试和 proposal 等动作留在自己的页面中，避免命令爆炸。AI Graph 在文件类型正式交付后拥有自己的 Create / Open 入口，不塞进 Vault Intelligence 的命令范围。

### 2.3 四个顶层页面

顶层只保留 Overview、Vault map、Work queue 和 Runs。Vault map 内只保留 `Vault contents / Activity`；Structure 与 Vault contents 是同一内容模型，不再单列。`Files & index` 也不成为顶层页面。

### 2.4 Overview 第一屏

第一屏同时展示 Vault map preview、Search status、Continue work、What changed 和活动 run strip。删除综合 Health score 与 Maintenance coverage，因为它们把不同分母和不同问题混成一个无法解释的数字。

### 2.5 Vault-wide 对象范围

Files 不只指 Markdown，而是所有被维护的文件类型。Vault map 还包括 Chat、Project、Composer session、AI Graph、Peak Sheet、Review 等 Peak 工作对象，以及它们与文件、source、run 和 proposal 的关系。

### 2.6 什么才算未完成工作

对象数量与待继续数量必须分开。只有 Project blocked、Composer pending review、AI Graph source changed、paused run 或 pending proposal 等明确 durable status 才进入 Continue work；不能根据 inactivity 或标题猜测任务未完成。

### 2.7 单一主动作

顶层只保留一个启动动作，当前建议名称是 `Scan Vault`。根据状态可以显示 `Prepare Vault`、`Resume scan` 或 `View progress`；`Refresh checks` 和 `Enrich files` 不再作为两个并列主按钮。

### 2.8 Preflight 与自动进入进度页

点击主动作后先看到范围、步骤、AI 选项、成本和预计时间。确认后必须自动进入 Active run，不能只改变按钮状态，再让用户无信息地等待。

### 2.9 Active run 的过程信息

运行中持续显示 processed / total、百分比、当前阶段、当前文件或 batch、速度、ETA、剩余量、warning、failure、Pause 和 Stop。总量未知或 ETA 不可靠时显示 discovering / calculating，不伪造进度。

### 2.10 后台运行与恢复

用户切换页面或关闭 View 后，同一次 run 继续存在，并在所有顶层页面显示 persistent strip。重新打开后从同一 run identity 与 checkpoint 恢复，不能创建第二次运行或丢失进度。

### 2.11 Vault Index 不是每次全量重建

Scan Vault 根据文件变化和依赖判断是否运行增量 Index、selected scope 处理或显式 rebuild。基础 Search、vectors、Summary 和 AI Tags 是不同能力，不能因为缺少 AI Summary 就把文件显示为 Search 失败。

### 2.12 所有文件类型与能力差异

Markdown、PDF、Image、Audio、Video、Canvas、Bases、Excalidraw、CSV/XLSX、`.peaksheet` 等都进入 inventory，但读取、索引、分析和写回深度不同。不支持或被策略排除的类型显示 `Not used` 与原因，而不是从界面消失。

### 2.13 AI Graph 是文件类型

AI Graph 不是 Vault Intelligence 内部的一张临时图，也不是另一个全局 dashboard。它应发展成类似 Peak Sheet 的文件原生产物，例如 `.peakaigraph`；Vault Intelligence 只显示其状态与关系，并交给 AI Graph View 打开。

### 2.14 完整 Work queue

Priority work 只是完整 Work queue 的 3–5 个高影响摘要。完整队列同时收录 Peak continuation、Search / enrichment failure、结构问题、内容问题、metadata、runtime failure 和 proposal，并为每项说明 `Why this is here`。

### 2.15 19 个确定性 detector

19 个 non-LLM detector 按 Connections、Content、Tags 和 Aging 四组展示。用户先看到自然语言、影响和证据；detector ID、阈值和原始字段放在详情中。

### 2.16 Detector 之后必须有 AI Review

“Detector 不需要 LLM”只表示发现事实的过程稳定、便宜、可复现，不表示结果不需要 AI。AI Review 必须读取 findings、文件、Vault map 和历史，形成 insight clusters、可能根因、趋势、优先级与 suggested actions。

### 2.17 Semantic detector 是另一种能力

AI Review of findings 与 semantic AI detector 不能混在一起。前者审阅已有确定性事实，是核心理解层；后者由 AI 直接发现 contradiction、coverage gap 等新 finding，目前六个 `M-*` detector 仍是 future / no-op。

### 2.18 AI Review 必须看得见过程和结果

运行中显示 Load findings、Gather evidence、Cluster、Compare history、Synthesize 和 Validate citations。结果页必须区分 Observed facts、AI insights 和 Suggested actions，并展示 evidence、confidence、alternatives 和 What changed。

### 2.19 AI Review 不直接改文件

AI Review 默认只读，也不能覆盖 raw finding。需要修改 frontmatter、tag、link 或 Bridge 时，必须进入 candidate、evidence、逐文件 diff、用户选择、revision guard、Apply、重新索引和 Verify 的 proposal 流程。

### 2.20 文档结构去重

原来的详细大文档先按能力讲一遍，又在“页面级信息架构”重复一遍，阅读成本很高。现在只保留一个产品 Overview，并在第 11 节链接七份专项设计；重复的旧详细参考已经删除。

### 2.21 Structure 与 Vault contents 合并

Structure 不是一个独立用户目标。文件类型、文件、Community、Topic、Hub、Orphan 和 Bridge 都是 Vault contents 的不同观察层，因此完整结构图、图下解释列表和 AI interpretation 只放在 Vault contents；Vault map 的另一个并列视图是 Activity。

### 2.22 Activity 改为可扩展时间探索

旧的四行六列强度表只适合极少主题，也无法承载大量事件。新设计采用长周期密度导航、选中范围内的主题流图、事件簇和证据列表；按可见范围自动使用日、周、月聚合，只有缩放或选择后才展开具体活动。

<a id="change-list"></a>

## 3. 所有需要继续改的条目

以下是产品与 Mock 仍需完成的内容。文档已经整理，不代表这些功能已经实现。

### 3.1 V2 Mock 已交付，等待 owner 审阅

V2 Mock 已覆盖 Overview 第一屏、Vault map、Work queue、Runs、Scan Preflight、Active run、Completed run、Vault contents、对象/结构详情、Work item 详情、AI Review 与 Proposal review。当前只代表产品交互设计，不代表源码已实现；Mock 中的数量、finding、模型和成本均为演示数据。

### 3.2 产品 View 与导航

- 建立独立 Vault Intelligence View；
- 注册 `Open Vault Intelligence`；
- 接通 Overview、Vault map、Work queue 和 Runs；
- 建立二级页面的统一返回与上下文恢复；
- 从 Command Center、Search 或稳定命令进入同一个 View。

### 3.3 Vault map 与全局对象

- 接入全部文件 inventory；
- 接入 Chat、Project、Composer、AI Graph、Peak Sheet 和 Review 节点；
- 建立可解释 typed relations；
- 区分对象数量、结构状态和 continuation state；
- 在 Vault contents 中补全 Community、Hub、Orphan、Gap、Bridge 和 broken reference；
- Activity 接入按日/周/月聚合、topic filter、range selection、event clustering 和 evidence drill-down。

### 3.4 Scan 与 Runs

- 接通 `runVaultLintManualScan` 或等价 app-owned run 入口；
- 统一 Index、Lint、AI Review、enrichment、proposal 和 verification run；
- 建立 live run projection、event stream、Pause / Resume 和 checkpoint；
- 接入真实 per-file / per-stage progress；
- 支持 background continuation、stalled detection 和 failure retry；
- 生成 Completed run delta 与可重开历史。

### 3.5 Vault contents、Search 与 AI 状态

- 建立 per-type capability policy；
- 显示 Discovered、Readable、Search ready；
- 分别显示 vectors、Summary、AI Tags 和 semantic search；
- 显示 Summary、AI Tags 与 frontmatter proposal 的覆盖状态和适用范围；
- 显示 exclusion、failure 和 stale reason；
- 支持 selected scope 的定向处理与重试；
- 把 metadata proposal 与本地可重建 enrichment 分开。

### 3.6 Work queue 与 Findings

- 把 19 个 detector 结果接入完整 finding queue；
- 归一 Peak continuation、readiness、structure、content、runtime 和 proposal source；
- 建立 Work item detail、evidence、next action 和 exit condition；
- 支持 filter、batch selection、dismiss、snooze 和 retry；
- 为 Overview Priority work 提供可解释排序。

### 3.7 AI Review 与 Proposal

- 将 deterministic finding snapshot 接入 AI Review；
- 保存 evidence-linked insight record；
- 显示实时 Review 阶段、token 与 cost；
- 区分 fact、inference 和 action；
- 建立 batch proposal、partial accept、revision conflict 和 Apply receipt；
- 写入后重新索引并验证 finding 是否退出。

### 3.8 Future，不阻塞当前主循环

- 六个 semantic AI detector 的真实执行；
- 自动定时全 Vault 扫描；
- `.peakaigraph` 文件类型正式交付；
- 更深的媒体与专用文件 enrichment。

<a id="screen-inventory"></a>

## 4. 界面清单

### 4.1 四个顶层页面

| 页面 | 主要任务 | 主要入口 | 主要去向 |
|---|---|---|---|
| Overview | 看整个 Vault 当前状态 | 打开 Vault Intelligence | Vault map、Work queue、Active run |
| Vault map | 在 Vault contents 与 Activity 间查看内容结构和时间变化 | Overview preview、顶层 tab | Object detail、evidence、owner surface |
| Work queue | 查看和处理全部事项 | Overview Priority work、顶层 tab | Work item、AI Review、Proposal |
| Runs | 查看活动、暂停、失败与历史运行 | run strip、顶层 tab | Active run、Completed run |

### 4.2 二级页面

| 页面 | 用户在这里完成什么 |
|---|---|
| Scan Preflight | 确认 scope、阶段、AI、预算和预计时间 |
| Active run detail | 实时查看进度、队列、当前 item、事件和控制 |
| Completed run detail | 查看 delta、失败、成本、facts、insights 和下一步 |
| Vault contents | 查看所有文件类型、Community / Topic / Bridge 结构及 Search / AI 状态 |
| Activity | 查看密度、主题流、事件簇和具体活动证据 |
| Object detail | 查看文件或 Peak 工作对象的关系、状态和 owner handoff |
| Work item detail | 查看问题、影响、证据、动作和退出条件 |
| AI Review result | 查看 insight、证据、置信度、趋势和 suggested actions |
| Proposal review | 查看逐文件 diff、冲突、选择性 Apply 与验证 |

<a id="user-flows"></a>

## 5. 六条用户流程

| 用户目标 | 流程图 |
|---|---|
| 浏览整个 Vault | [Overview → Vault map → Object detail](../../assets/vault-intelligence-flows/flow-a-overview.svg) |
| 重新扫描 | [Preflight → Deterministic scan → AI Review → Complete](../../assets/vault-intelligence-flows/flow-b-scan.svg) |
| 处理 Orphan | [Orphan filter → Evidence → Handoff → Verify](../../assets/vault-intelligence-flows/flow-c-orphans.svg) |
| 修复 Search 缺失 | [Reason → Selected update → Verify Search status](../../assets/vault-intelligence-flows/flow-d-search.svg) |
| 让 AI 解释结构 | [Select scope → AI Review → Evidence → Actions](../../assets/vault-intelligence-flows/flow-e-ai-review.svg) |
| 查看 Peak 工作对象 | [Filter objects → Relations → Continue or owner surface](../../assets/vault-intelligence-flows/flow-f-peak-work.svg) |

<a id="open-decisions"></a>

## 6. 仍需 owner 确认

- 主动作最终是否使用 `Scan Vault`；
- 默认扫描 changed files 还是其他范围；
- AI Review 默认自动处理 high-impact findings，还是每次在 Preflight 中确认；
- AI Review batch、模型和预算策略；
- computed Hub 与 Peak Hub 的 UI 区分；
- 第一批 metadata policy 和 proposal 类型；
- Overview 首批展示哪些对象家族；
- `.peakaigraph` 交付前如何显示 AI Graph 当前 artifact 状态；
- Pause / Resume 第一版支持哪些运行阶段。

<a id="truth-status"></a>

## 7. 当前文档与界面状态

| 内容 | 当前状态 |
|---|---|
| 产品 Overview | 已整理，等待 owner review |
| 六份专项设计 | 已整理，等待逐项 review |
| 六条用户流程图 | 已更新并通过 SVG 校验 |
| V2 交互 Mock | 已生成，等待 owner 逐页面 review；自动 `file://` 浏览器验收受当前工具策略限制 |
| 旧 HTML Mock | 可打开，但结构和交互已过时 |
| [旧正式文档](../../13-feature-vault-intelligence.html) | 仍是旧内容，尚未回写新模型 |
| 产品代码 | 本轮未修改 |
| 真实 Obsidian 交互 | `INTERACTION NOT VERIFIED` |

下一步应先完成 owner 对产品 Overview、V2 Mock 页面和开放决定的 review。Mock 方向确认后，再形成实现计划并回写正式 HTML 文档。
