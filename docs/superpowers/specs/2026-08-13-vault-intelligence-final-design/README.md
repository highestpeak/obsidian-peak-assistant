# Vault Intelligence 最终设计包

> 日期：2026-08-13  
> 文档状态：Owner review · final design baseline  
> 交付边界：产品与交互设计、现状审计、实施任务；不代表生产实现已经完成。

## 先看什么

| 阅读目标 | 打开 | 读完能回答什么 |
| --- | --- | --- |
| 先建立完整产品心智模型 | [最终产品与交互设计](./01-final-product-and-interaction-design.md) | Vault Intelligence 到底是什么、有哪些页面、用户怎么完成一次维护循环 |
| 看清“现在到底有什么” | [能力 / UI / 功能缺口审计](./02-capability-ui-function-gap-audit.md) | 哪些已经可复用、哪些只有 Mock、哪些 UI 与功能都没有 |
| 决定后续怎么做 | [实施任务计划](./03-implementation-task-plan.md) | 先做什么、依赖什么、每项怎样验收、哪些不进入首轮 |
| 评审 Scan 产生的所有维护事项 | [Follow-up、Work queue 与 maintenance review 共享合同](../2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) | 不同领域如何共用 canonical set、分级作用域、owner correction、Apply / Verify；File Property 的完整合同见第 12 节 |
| 快速点选全部材料 | [可点击总索引](./index.html) | 新设计、现有 Mock、旧文档及它们之间的关系 |

建议阅读顺序：`01 → 02 → 03`。如果只想先做 Owner review，先看 `01` 的第 2、4、6、8 节，再看 `02` 的“UI 与功能都没有”清单。

本设计包继续定义 Vault Intelligence 的产品闭环、能力缺口与实施 DAG；2026-08-15 以后新增的 Scan maintenance review 共享合同专门约束维护结果的对象真值与 owner-review 行为。两者发生冲突时，maintenance review surface 以该共享合同为准。

## 一句话结论

Vault Intelligence 不是一个 Health score 仪表盘，也不是单纯的“扫描器”。它是 Peak 面向整个 Vault 的观察与维护工作区：

1. 展示当前 Vault 与 Peak 工作对象的全局状态；
2. 运行可追踪、可恢复的扫描与智能维护；
3. 将确定性事实交给 AI 聚类、解释并形成可执行结果；
4. 把结果路由为机器状态更新、Work item、文件变更 Proposal 或专属工作区任务；
5. 在应用或处理之后重新验证，形成闭环。

## 本轮锁定的最终信息架构

```text
Vault Intelligence
├─ Overview      当前状态、需要继续的工作、最近变化与优先项
├─ Vault map
│  ├─ Vault contents   文件类型、知识 Community、Topic / Hub、Bridge
│  └─ Activity         原始活动 Heatmap 与可选 AI 主题分析
├─ Work queue    所有明确、持久、可退出的维护任务
└─ Runs          Scan setup、Active run、Completed run、历史与比较
```

顶层只注册一个稳定命令：`Open Vault Intelligence`。`Scan`、`Review`、`Proposal`、`Retry`、`Dismiss` 等动作留在 Vault Intelligence 自己的页面中，不扩散到 Command Palette。

## 本轮明确废弃或合并的设计

| 原设计 | 最终决定 |
| --- | --- |
| Health score 作为首页英雄数字 | 移除；不再用不透明总分代替问题来源 |
| Maintenance coverage | 移除；拆成 Search、Summary、AI Tags、Vectors 等可解释状态 |
| Refresh checks / Enrich files 两个主按钮 | 合并为一个状态化主动作 `Scan Vault` |
| 独立 Files & Index 顶层页 | 取消；Files、Search 与 enrichment 都属于 Vault contents 的投影与维护状态 |
| Overview 放完整 Vault graph | 取消；Overview 聚焦状态与动作，完整结构只在 Vault contents |
| Vault map 的 Structure 与 Vault contents 分开 | 合并；它们描述的是同一个“内容与知识结构”对象 |
| 右侧 Drawer 作为通用详情 | 取消；列表项用行内展开，图节点用图下 Context，必要时用居中 Modal |
| 点击 Community 自动切成另一张图 | 取消；原节点在同一图中展开并显示 Topics / Hubs |
| Completed run 的四个技术 Tab | 取消；一个结果同时展示事实、AI 解释、证据与下一步动作 |
| 独立 AI Review 页面 | 合并进 Completed run 与 Work item；避免重复导航 |
| Activity 默认展示 AI 主题历史 | 取消；默认是真实原始活动，AI 主题必须有生成记录与 provenance |
| AI Graph / Peak Sheet 作为顶层对象 | 取消；两者都是 Files 内的原生文件类型 |

## 现有材料的角色

| 材料 | 角色 | 是否为当前最终真值 |
| --- | --- | --- |
| 本目录三个新文档 | 本次讨论收束后的产品、缺口与实施基线 | 是 |
| [`vault-intelligence-workspace-2026-08-12-v2`](../../../gstack/vault-intelligence-workspace-2026-08-12-v2/index.html) | 可交互设计原型，用来说明部分状态与交互 | 否；包含 Mock-only 能力 |
| [`2026-08-12` 专题文档](../2026-08-12-vault-intelligence-owner-review-index.md) | 研究过程与专题细节 | 支撑材料；冲突时以本目录为准 |
| [`13-feature-vault-intelligence.html`](../../../13-feature-vault-intelligence.html) | 旧正式说明与当前产品背景 | 待重写；不能代表最终 IA |
| 当前生产 `VaultIntelligenceWorkspace.tsx` | 现有可达 UI 事实 | 仅代表 current surface，不代表最终设计 |

## 需要 Owner 最后确认的开放决策

这些问题没有被 Mock 替用户决定：

1. `Scan Vault` 是否为最终按钮名；信息架构已锁定，但文案仍可调整。
2. `My Content` 是只提供入口，还是未来合并为 Vault contents 的一个保存内容视图。当前建议只链接，不吸收整个产品。
3. Activity 的 AI 主题分析是按需生成、随 Scan 生成，还是作为 Knowledge Index 的可选 enrichment。当前建议默认按需，并允许 Scan 选中。
4. `.peakaigraph` 是否作为未来正式原生文件后缀。当前只保留设计位置，不写成已实现。
5. 首轮是否允许用户按四个检查组选择运行范围，还是只提供 `All checks` 与高级折叠项。当前建议默认全选、可在 Advanced 中按组关闭。

## 状态说明

本设计包没有修改生产代码、没有运行生产测试，也没有把 HTML Mock 当作真实 Obsidian 验收。现有 Mock 的交互只能证明设计表达，不能证明产品已实现。
