# Vault Auto Review · 综合设计文档

> Status: design — 还未实施。给设计师 + 后续 spec 拆分用。
> Date: 2026-05-20
> Author: design session
> Related: docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md（doc-scope Auto Review 的 spec）

---

## 1. 背景

`Copilot Picker` 顶部有三个 tab：**Document / Vault / Setting**，分别对应：

- **Document = Copilot** — 站在「当前 doc」视角看 vault（doc 在 vault 里怎么用、引哪些笔记、长什么样）
- **Vault = Vault Intelligence** — 站在「整个 vault」视角看自身（vault 健康、结构演化、缺口、簇）
- **Setting = System** — 元配置

当前的 Vault tab 进 Auto Review 后跑的是和 Document 一模一样的流程：基于 active editor 的 ctx.file，输出针对那一篇 doc 的 changes diff。Vault 语义被吞掉了。

本文档定义 Vault tab 自己的 Auto Review：**对整个知识库做一次 AI 全局诊断，产出可归档的 Vault Health Report，支持增量重跑。**

---

## 2. 问题陈述

**现状错配**

| 维度 | 现状 Vault Auto | 应有 Vault Auto |
|---|---|---|
| Subject | 当前打开的 doc | 整个 vault，没有 active doc 概念 |
| Pre-flight | doc 字数 / tag / 链接 | vault 统计 + cluster 分布 + lint 信号 |
| 输出 | 逐 block diff | vault 层 insights + gaps + restructure 建议 |
| 产物 | 一次性 modal，关掉就没 | 落盘 Markdown 报告，可归档可对比 |
| 重跑 | 每次重新跑 | fingerprint 检测，无变化不重跑 |
| 信号源 | 单 doc | IndexService / VaultLintService / community_metadata 已有数据 |

**用户视角**

用户从 Vault tab 进来时想要的问题，是「**告诉我我的知识库现在怎么样？什么在长大、什么在死、什么应该做？**」。当前实现回答的是「这一篇 doc 怎么改」——完全不在同一频道。

---

## 3. 价值定位

项目北极星：**Obsidian-native ambient knowledge graph intelligence** — 让 vault 不只可检索，更可被动感知、主动优化、自动演化。

三大支柱（progress.md §S1-S6）：

- **S1 Ambient Push** — 写作时推送相关笔记（激活层）
- **S2 Vault Lint** — 静态健康检查 5 维信号（维护层）
- **S3-S6 自演化层** — Cascade / Structural Hole / Auto-tag / Precompiled（演化层）

Vault Auto Review 的坐标：

> **把 S2 + S3-S6 的静态信号，用 AI agent 编织成叙事性诊断报告。**
> 从「机器算分」升级到「AI 给出可读的判断和行动建议」。

它**不是新功能**，是已有能力的**叙事化封装 + 可归档产物化**。本质上是一个 agent 编排层 + 报告生成器，复用已有 90% 的分析基础设施。

---

## 4. 主要使用场景（Personas / Use Cases）

设计需考虑这四种典型使用时机：

1. **季度复盘**（最高频价值）：每 1-3 个月看一次「这段时间我的 vault 长成什么样了」
2. **写作前热身**：开新主题前快速扫一眼「我的 vault 里这块覆盖到哪了，还缺什么」
3. **结构清理**：感觉 vault 乱了，想知道「该重构哪里」
4. **离开一段时间后回归**：度假回来 / 换季节后想知道「我之前在做什么、哪些是 stale 的」

**反例**（不是使用场景）：
- 不是问答（用 Vault QA）
- 不是搜索（用 search）
- 不是单 doc 改写（用 Document Auto Review）

---

## 5. 已有能力盘点（关键发现：90% 基础设施已存在）

调研明确证实，Vault Auto Review 应该是**编排层**而非**新分析引擎**。下表是 Phase 1 可直接消费的现有能力：

| 已实现 | 用作 |
|---|---|
| Louvain 社区发现（`louvainCommunity.ts`）| Cluster 来源 |
| PageRank / Betweenness / Burt constraint（`documentPageRank.ts`, `buildAnalysisGraph.ts`）| Hub 与桥接节点识别 |
| sqlite-vec embedding + `semantic_related` 边（`IndexService`）| 语义距离判断 |
| `HubRegenService` | Hub 自维护、"hub 衰减" 信号 |
| `VaultLintService` 5 维信号 | 直接喂给 Auto 作 pre-flight digest |
| `gapDetection.ts` | Structural hole 候选输入 |
| `CascadeChangeDetector`（per-doc）| Vault-level fingerprint 的基础 |
| `community_metadata` 表（StructuralAnalysisRepo）| 持久化 cluster 名 / dominant_topics / top_nodes |

**结论**：Vault Auto 的 pre-flight digest 几乎可以一次查询拿全。Agent 拿到 digest 后做的是「读、想、写报告」，**不需要重做任何计算**。

---

## 6. 竞品 + 学界核心借鉴

详见 `docs/superpowers/research/`（如要独立归档）。核心结论：

### 可借鉴

- **InfraNodus 路线**（最对标）：Louvain community + structural hole detection + 桥接问题生成。这是 Vault Auto 的灵魂算法。
- **NotebookLM 的产物化**：把分析变成 mind map / briefing / audio 等多形态可消费 artifact。我们用 Markdown 报告对应。
- **Smart Connections 的增量**：本地 embedding 增量索引、监听文件事件、不全量重跑。

### 避坑（来自竞品用户吐槽）

1. **"AI 不知道我是谁，建议都是泛泛的"** → 必须基于用户的 cluster 名、tag、写作风格 grounding
2. **"另一个 chat 我不需要"** → 不能做成 chat。要 Markdown 报告，可归档可对比
3. **"AI edit vault = a faster way to make a mess"** → 任何 restructure 必须 dry-run + 逐条 approve
4. **Vault QA 幻觉**（Copilot Issue #1161）→ 任何 vault-level 断言必须可点击溯源到笔记
5. **Graph View 大家都说没用** → 输出必须分层（先 5 cluster 名 → 再 drill down），不要一次给全图
6. **重跑慢/费 token** → 增量是底线

### 学界关键概念

- **Louvain / Leiden**：modularity 优化的社区发现，Leiden 是改进版
- **Betweenness centrality**：识别桥接节点
- **Structural holes（Burt 1992）**：管理学经典，"结构洞 = 创新机会"，InfraNodus gap detection 直接源自此
- **Semantic Zoom（CHI 经典）**：vault → cluster → note 三级 drill 的理论支撑
- **Information Foraging Theory**：用户按"信息气味"决定探索，弱气味 → 信息流失

---

## 7. 设计原则

### 继承（已沉淀的 5 条，必须遵守）

来源：`research_doc_network_visualization.md`

1. **Graph 服务于行动，不是欣赏** — 报告以行动收尾，不以图收尾
2. **局部上下文 > 全局俯视** — 5 个 cluster 高亮，不是 hairball
3. **语义结构 > 链接拓扑** — 用 community detection，不只靠 backlinks
4. **AI 主动推送 > 用户被动探索** — Vault Auto 主动跑，结果在 Vault tab 自然出现
5. **过滤 = 聚光灯（dim），不是剪刀（disappear）** — 不活跃 cluster 暗化不隐藏

### 新增（Vault Auto 专属）

6. **报告 > Chat** — 产物是落盘 Markdown，不是一次性对话
7. **断言必须可溯源** — 任何 insight 涉及笔记，必须 `[[wikilink]]` 可点
8. **增量优先** — 默认不重跑，主动告知"何时值得重跑"
9. **Dry-run 默认** — 任何会改 vault 的建议默认 preview，不直接执行

---

## 8. 信息架构

### 8.0 Review Launcher Picker（进入具体 review 前）

顶部 `Document / Vault / Setting` 这个面板不是“能力大全”，而是 **review launcher**：用户在进入具体 agent review 前，先确认当前 scope、当前状态、运行策略和最近历史。

第一屏要回答四个问题：

1. **我现在在哪个 scope？** 当前 note、整个 vault，还是系统环境。
2. **现在值不值得跑？** 是否刚跑过、是否有变化、是否有 warning。
3. **我要怎么跑？** Auto、Fast、Refresh、Run system check，或看上次结果。
4. **如果我不想 Auto，有哪些最相关 intent？** 只展示 2-3 个 suggested intents，其余收进 capability catalog。

#### 8.0.1 区域说明

| 区域 | 用户看到什么 | 设计意图 | 点击 / 交互 |
|---|---|---|---|
| **Top scope tabs** | `Document = Copilot` / `Vault = Vault Intelligence` / `Setting = System` | 建立三种工作域，避免把所有能力混在一个 command center 里 | 切换 scope，同时更新搜索 placeholder、metadata、readiness card 和推荐 intent |
| **Search / Ask 输入框** | 当前 scope 的搜索提示，如 `Search or ask in current document...` | 给“我知道我要什么”的用户快速入口；不是主 CTA | 输入短词时过滤 capability；输入自然语言时作为 initial intent；回车可进入 intent run 或展示匹配项 |
| **Scope metadata line** | 当前 note 路径 / vault 规模 / system environment | 让用户确认 agent 将要看的对象，避免跑错 scope | 一般不可点击；文件路径 / vault stats 可 hover 展开详情 |
| **Readiness card** | 当前 scope 是否 ready、是否刚 review、是否有 warning | 核心决策面，替代大面积能力网格 | 根据状态决定主按钮：Auto / View last report / Run system check |
| **Signal chips** | `few links`、`no past review`、`1 note changed`、`2 warnings` | 解释推荐动作的依据，让 Auto 看起来不是玄学按钮 | 可 hover 查看信号来源；不作为主要操作按钮 |
| **Run strategy controls** | `Auto`、`Fast`、`Refresh`、`Run system check`、`View last report` | 把“怎么跑”从能力列表里提出来，成为主决策 | 直接进入对应 agent run 或打开已有 review artifact |
| **Customize** | 小的次级入口 | 高级用户限制 scope、模型、深度、输出形态；默认用户不用碰 | 打开轻量 sheet：scope、depth、model、output artifacts、是否允许长报告 |
| **Recent / Past reviews** | 最近该 scope 的 review / diagnostics | 告诉用户以前跑过什么，避免重复消费 token | 点击打开历史 review result；`All reviews` 进入全局历史 |
| **Suggested intents** | 2-3 个最相关入口，如 `Connect links`、`Knowledge gaps`、`Prompt audit` | 手动入口只是 initial intent，不是让用户先选一堆工具 | 点击后启动 agent run，并把该 intent 作为开场目标；agent 仍可调用其他工具 |
| **Show all capabilities** | 一行次级入口 | 保留能力目录，但不让它占据第一屏 | 展开完整 capability catalog / command list |

#### 8.0.2 按钮语义

这些按钮不是新增“孤立功能”，而是同一个 review launcher 的不同运行策略：

| 按钮 | 含义 | 适用 scope | 去向 |
|---|---|---|---|
| **Auto** | 让 agent 自己观察 context、选择 tools、产出 review artifacts | Document / Vault | 进入 Auto Review modal；Document 默认产生 Changes + Insights，Vault 默认产生 Overview / Clusters / Gaps / Actions / Trace |
| **Fast** | 低成本、短链路扫描；通常一轮，不做深挖 | Document / Vault | 进入同一个 review modal，但 trace 标注为 fast run，artifact 可能更少 |
| **View last report** | 不重新跑，直接看上次结果 | Vault 优先，Document 有历史时可出现 | 打开最近 review artifact / 落盘 Markdown |
| **Refresh** | 用户明确要求重新计算 / 重跑 | Vault | 重新 fingerprint + digest；若变化显著则进入 Auto run，否则可提示“仍可查看旧报告” |
| **Run system check** | 检查运行环境，不分析内容 | Setting | 进入 System diagnostics run：providers / index / skills / prompts / recent failures |
| **View diagnostics** | 查看上次系统检查 | Setting | 打开 diagnostics artifact，不启动新 agent |
| **Customize** | 改运行约束 | 全部 scope | 打开配置 sheet，确认后回到 Auto / Fast / Refresh |

#### 8.0.3 三个 tab 的差异

| Tab | 用户问题 | Readiness card 应该讲什么 | 主按钮逻辑 | Suggested intents |
|---|---|---|---|---|
| **Document** | “这篇 note 现在要不要改 / 补 / 连接？” | 当前 note 的长度、链接、tag、任务、历史 review、选区状态 | 没跑过或信号明显时突出 `Auto`；短 note 可突出 `Fast` | `Connect links`、`Improve note`、`Add evidence`、`Check task list` |
| **Vault** | “整个 vault 现在怎么样？值得重跑吗？” | fingerprint delta、notes / words、上次 review、变化规模、缓存是否可用 | 没变或微变时突出 `View last report`；显著变化 / 久未跑时突出 `Auto` 或 `Refresh` | `Knowledge gaps`、`Vault health`、`Smart connections`、`Find related` |
| **Setting** | “我的 agent 运行环境是否健康？” | index 状态、model/profile warning、skills/prompts 变化、最近失败 | 有 warning 时突出 `Run system check`；刚检查过时突出 `View diagnostics` | `Prompt audit`、`Model profiles`、`Index health`、`Run workflow` |

#### 8.0.4 设计边界

- **不要把第一屏做成 capability grid**。工具很多不是问题，但用户不该先承担分类成本。
- **Suggested intents 不是 tool whitelist**。点了 `Connect links` 也只是告诉 agent 初始目标；agent 仍可调用 evidence、review、task check 等辅助 tools。
- **Auto 不等于黑箱**。Readiness card + signal chips 解释为什么现在推荐 Auto / Refresh / View last report。
- **Setting 不是普通设置页**。它是 system-scope review launcher，关注运行健康、诊断和修复建议。
- **Search 是旁路，不是主路径**。默认主路径应该是 readiness card 的 CTA，而不是要求用户先搜索命令。

### 8.1 入口（Vault tab）

进入 Vault tab 时根据 vault fingerprint vs 上一次 review 的状态决定显示什么：

```
┌──────────────────────────────────────────────┐
│  Document | [Vault] | Setting                │
├──────────────────────────────────────────────┤
│  Search across vault... (# in-file, @ folder)│
│  12,847 notes · 4.2M words                   │   ← vault 元数据（替代 active doc 路径）
├──────────────────────────────────────────────┤
│  [当前状态卡] — 见 8.2 五种状态              │
├──────────────────────────────────────────────┤
│  PAST VAULT REVIEWS                          │   ← 独立列表，仅 vault-scope
│  - 2026-05-20  · {headline}                  │
│  - 2026-04-15  · {headline}                  │
├──────────────────────────────────────────────┤
│  RECOMMENDED NOW (other vault capabilities)  │
│  Smart Connections · Find Related ...        │
└──────────────────────────────────────────────┘
```

**和 Document tab 的差异**：
- 没有 "kb1-life-notes/.../xxx.md · current note · 6250 words" 这一行
- 没有 Past reviews of this note，改成 Past **vault** reviews
- 状态卡（"上次 review 已过期"等）是 vault tab 独有

### 8.2 五种 fingerprint 状态（状态卡设计交给设计师）

| 状态 | 触发条件 | 状态卡内容 | 主按钮 | 次按钮 |
|---|---|---|---|---|
| **A. 从未跑过** | 无 vault-scope review | "Run your first vault review · estimated ~30s on a vault this size" | Auto（突出）| Fast |
| **B. 完全没变化** | fingerprint 完全相同 | "Vault unchanged since {time}" + 上次 headline | View last report（突出）| Force refresh（暗化）|
| **C. 微小变化** | ≤5 文件变 且 字数 delta ≤2% | "Last reviewed {time} · 3 notes changed since" | View last report（突出）| Refresh |
| **D. 显著变化** | >5 文件 或 >2% 字数 | "37 notes changed · 4 new · 1 deleted since {time}" | Auto（突出）| View last report |
| **E. 长时间未跑** | 任何 delta，但 >30 天 | "Last reviewed {30+ days ago} · worth a fresh look" | Auto（突出）| View last report |

**用户视角的判断**：每次进 Vault tab，2 秒之内能看出"现在该不该重跑"。

### 8.3 Modal 结构（运行中 + 结果展示）

**Phase 1 modal tabs（修正版）**：

```
┌────────────────────────────────────────────────────────────┐
│ Vault Review · 2026-05-20                            [X]   │
│ 12,847 notes · 4.2M words · 37 changed notes · saved       │
├────────────────────────────────────────────────────────────┤
│ [Overview] [Clusters] [Gaps] [Actions] [Trace]  2m 14s     │
├────────────────────────────────────────────────────────────┤
│ Overview: 5 秒摘要 + Snapshot + 最重要的 1-2 个判断        │
│ Clusters: 知识簇活动、休眠簇、增长簇、关键 hub             │
│ Gaps: structural holes / dangling refs / stale hubs        │
│ Actions: 建议动作，Phase 1 是文字，Phase 2 才 dry-run      │
│ Trace: agent 执行轨迹、调用了什么 tool、为什么这么判断     │
└────────────────────────────────────────────────────────────┘
```

Modal 不是一篇长 Markdown 的 preview，也不是 Document Auto Review 的 `Changes / Insights / Sources` 复刻。它是 **vault review 的结构化阅读与操作面**：用户先看 Overview，再按需要进入 Clusters / Gaps / Actions，最后才看 Trace 调试 agent 过程。

**Sources / provenance 不做顶层 tab**：
- 每个 insight、gap、cluster row、action card 自己带 source chips / evidence count
- 点击 "View evidence" 展开右侧 drawer 或 inline evidence，展示引用笔记、片段、指标来源
- `Trace` 解释 agent 怎么跑；`Evidence` 解释某个结论凭什么成立；两者不是同一个信息层
- 落盘 Markdown 末尾仍可保留 `Sources` appendix，作为归档和向后兼容，不进入 modal 顶层导航

> **决策**：Phase 1 已经需要 Overview / Clusters / Gaps / Actions / Trace 五个结果 tab，因为这不是单篇文档 diff，而是 vault-level 体检报告。交互复杂度不来自 tab 数，而来自能否把每个 tab 做成清晰的任务面：看摘要、看簇、看问题、看建议、看执行轨迹。

**Phase 2 增强**（不在本期范围）：
- Clusters 从静态列表升级为 Louvain drill-down（cluster 列表、成员、metric、打开相关笔记）
- Actions 从文字建议升级为跨文件 dry-run + 逐条 approve
- 增加 Temporal diff：本次 vault review vs 上次 vault review

### 8.4 历史列表（独立 vault scope）

Vault tab 的 "Past vault reviews" 仅列 `originScope=vault` 的 record（现有 `originScope` 字段已支持过滤）。

全局 "All reviews" 入口跨看所有 scope，按 origin 分组：
- Vault reviews（vault-wide）
- Document reviews（per-note）

---

## 9. Vault Health Report 产物结构

**落盘路径**：`peak-system/vault-reviews/{ISO-date}-{short-hash}.md`

**为什么落盘**：
- 用户可对比历次报告
- 报告本身就是 vault 的一员，可以被搜索 / 引用 / 浮现在 Ambient Push
- 关掉 modal 内容不丢，避免 chat-style 一次性消费

### 9.1 完整结构示例

```markdown
---
type: peak-vault-review
version: 1
fingerprint: a7f9c3e2...
fileCount: 12847
totalWordCount: 4234567
clusterCount: 5
hubCount: 23
orphanCount: 142
startedAt: 2026-05-20T10:00:00Z
completedAt: 2026-05-20T10:01:32Z
status: completed
mode: complete
headline: "AI Engineering 簇正在快速壮大，Travel notes 簇进入休眠"
---

# Vault Review · 2026-05-20

**{1-2 句 AI 写的整体判断}**
本月 vault 整体活跃度提升 14%，主要由 "AI Engineering" 簇驱动；"Travel notes" 簇连续 5 个月无新增，建议归档或拆解。

## Snapshot

- **12,847 notes** · 4.2M words · last reviewed 14 天前
- Fingerprint changed: 37 notes touched · 4 new · 1 deleted
- **5 active clusters** · 23 hubs · 142 orphans
- Health score: **7.4 / 10** (▲ from 7.1)

## Cluster Activity

| Cluster | Size | Change | Status |
|---|---|---|---|
| AI Engineering | 47 | ▲ 12 this month | 🔥 central |
| Search Architecture | 33 | ▲ 4 | stable |
| Personal | 31 | ± 0 | stable |
| Product Design | 29 | ▲ 2 | stable |
| Travel notes | 28 | ⏸ no activity 5mo | 💤 dying |

## Insights

### Cluster "AI Engineering" 正在成为核心
本月新增 12 篇，centrality 上升 14%。代表笔记 [[claude-code-sdk-deep-dive]]、[[meta-agent-redesign]]、[[copilot-output-collector]]。这个簇正吸收来自其他簇的 link，预示着该主题在你的关注体系里上升。

### Cluster "Travel notes" 在死亡
5 个月没有新内容，3 个 hub 节点（[[2024-japan-trip]]、[[2024-iceland-prep]]、[[travel-checklist]]）超过 6 个月未更新。这个簇有保留价值但已脱离当前工作流。

### 抽象层级混乱：Search Architecture 簇
该簇下混杂着 5 篇 <200 字的 fleeting note 和 8 篇 >2000 字的 evergreen 文章。fleeting notes 可考虑合并入相关 evergreen 或独立成 MOC。
低层级笔记：[[chunk-strategy-quick-note]]、[[search-bug-temp]]、[[query-test-1]]、[[query-test-2]]、[[reranker-thought]]

## Gaps

### Structural Hole: AI Engineering ↔ Product Design
两个簇共享 8 个 wikilink 目标，但簇间直接连接只有 2 条边。这是结构洞——你的工程视角和产品视角缺少桥接。

候选桥接问题：「AI 能力的产品化路径」「Agent UX 如何区别于传统软件」

候选桥接笔记：
- [[ai-product-pattern]]（在 Product Design 中提及 agent）
- [[copilot-ux-thoughts]]（在 AI Engineering 中提及 UX）

### Dangling References (12)
被频繁 wikilink 但没有专属笔记的概念：

- [[Context Engineering]] — 在 7 篇笔记中被引用，但无独立笔记
- [[Provider Tier]] — 在 5 篇中被引用，无独立笔记
- ...（剩余 10 条）

### Stale Hubs
即使未被编辑，但仍是知识网络枢纽——可能需要重审：

- [[Vault Architecture Overview]] — 6 个月未更新，被 14 篇笔记引用
- [[Knowledge Management Principles]] — 4 个月未更新，被 9 篇引用

## Recommended Actions

> Phase 2 会让这些 action 变成可点击的 dry-run；Phase 1 先以建议清单形式给出。

- 把 [[chunk-strategy-quick-note]] 等 5 篇短笔记并入 [[Search Architecture MOC]]
- 给 [[Travel notes]] 簇下 28 篇加 `#archive/travel` tag 并迁至 `/archive/travel/`
- 新建 `[[Context Engineering]]` 笔记承接 7 处引用
- 重写 [[Vault Architecture Overview]] 为 living document

## Sources

报告中引用的所有笔记。正文里的每个判断已经内联 wikilink / evidence chip；这一段只作为落盘归档 appendix 和向后兼容，不对应 modal 里的顶层 Sources tab。
```

### 9.2 报告设计要点

- **整体判断段**（标题下 1-2 句）必须存在，是给用户的"如果只读 5 秒就走"摘要
- **Snapshot** 只放可量化的数字，不放判断
- **Cluster Activity** 用 markdown 表格，含 trend（▲▼⏸）和 status emoji
- **Insights** 是 LLM 写的叙事段，每段一个判断，必须引用 ≥2 篇笔记
- **Evidence / Sources** 跟随具体判断展示：每个 insight / gap / action 需要能展开它引用了哪些笔记、哪些指标、哪些 agent trace 事件
- **Gaps** 分三类：structural hole / dangling ref / stale hub
- **Recommended Actions** 是行动清单，Phase 1 纯文字 bullet，Phase 2 可点击

### 9.3 报告作为 vault 一员

落盘后这个文件就是 vault 里的一篇 markdown：

- 可被搜索（IndexService 会 index）
- 可被 Ambient Push 引用
- 用户可手动编辑（添加私人备注）
- 不应该被下一次 Vault Review 当作 subject 分析（在 frontmatter `type` 字段过滤掉）

---

## 10. 增量机制

### 10.1 Fingerprint 计算

复用现有 `CascadeChangeDetector` 的 per-doc `contentHash`，新增 vault-level fingerprint service：

```ts
interface VaultFingerprint {
  fingerprint: string;        // sha1(sorted(`${path}:${contentHash}`))
  fileCount: number;
  totalWordCount: number;
  lastMaxMtime: number;
  computedAt: number;
}
```

计算开销：vault 1 万篇 ≈ 50ms（已有 contentHash 缓存，只做一次 sha1 over sorted list）。

### 10.2 Fingerprint 比对 → UX 状态

进入 Vault tab 时（≤100ms）算当前 fingerprint，对比上一次 vault-scope review 的 frontmatter。映射到 8.2 节五状态：

```
当前 fingerprint == 上次 fingerprint   → 状态 B
files_changed ≤ 5  AND  word_delta ≤ 2%  → 状态 C
files_changed > 20 OR  word_delta > 5%   → 状态 D
last review > 30 days ago               → 状态 E（覆盖 B/C）
无 vault-scope review                    → 状态 A
```

### 10.3 重跑 vs 缓存

| 状态 | 默认行为 | 用户可覆盖 |
|---|---|---|
| A | 没缓存可看，直接跑 | — |
| B | 显示上次报告，**不跑** | "Force refresh" |
| C | 显示上次报告，提示"轻微变化" | "Refresh" |
| D | 引导用户跑新的，但允许"View last report" | — |
| E | 引导用户跑新的，"View last report" | — |

**关键决策**：状态 B 时**完全不消耗 LLM token**。点 Vault tab 不应该是个"敢不敢按 Auto"的赌博。

### 10.4 Phase 2 真增量

Phase 2 可以做 partial recompute：

- 缓存上次 community 划分
- 只对 changed/new 文件重算其所属簇
- 老簇沿用 `community_metadata`
- LLM 只看 diff 不看全 vault

不在 Phase 1 范围。

---

## 11. 差异化机会（vs 竞品）

竞品调研明确指出三个空白方向：

### 11.1 时间维度 review（temporal diff）

所有竞品都是 snapshot，没人做 "上次到现在 vault 演化了什么"。
- 已有：每次 review 落盘 → 历史 record
- Phase 1 已支持：状态 D 显示 delta（"37 notes touched · 4 new · 1 deleted"）
- Phase 2 可做：报告里加 "vs last review" 段——簇尺寸变化、新出现的桥接、消失的 hub

### 11.2 抽象层级混乱检测

同一簇里 fleeting note 和 evergreen note 混杂。
- 信号：簇内 wordCount 分布、wikilink 入度分布、最近编辑时间分布
- 全是现有数据
- Phase 1 在 Insights 段可写，Phase 2 可专门一段

### 11.3 可执行 restructure

Obsidian 插件独有优势：可以直接改 vault。
- Phase 1：报告里以 bullet 形式给建议
- Phase 2：dry-run preview + 逐条 approve + 实际执行

---

## 12. Anti-patterns（明确禁止）

来自竞品用户吐槽汇总：

1. **❌ 不要做成 chat 形式** — 必须是 Markdown 报告
2. **❌ 不要给泛泛建议** — 必须引用具体笔记 / cluster id / 数据
3. **❌ 不要全量重跑** — fingerprint 不变就不跑
4. **❌ 不要 auto-apply restructure** — 任何 vault 变更必须 dry-run + approve
5. **❌ 不要 graph hairball** — 不画 force-directed 全局图
6. **❌ 不要把 vault-review.md 也放进下一次分析的 subject** — frontmatter `type` 过滤
7. **❌ 不要把孤儿笔记当 gap** — Sparse-area filtering，避免噪声当洞（arxiv 2410.00134 警告）
8. **❌ 不要把 vault QA 风格的回答塞进来** — 那是搜索，不是 review

---

## 13. 与现有系统的关系

### 13.1 与 VaultLintService 关系

VaultLintService 是**静态计算 5 维分数**，输出原始信号。Vault Auto Review 是**消费 lint 信号 + community + structural 等多种 source，让 AI 写叙事**。

| | VaultLintService | Vault Auto Review |
|---|---|---|
| 形式 | 数字分数 + 笔记列表 | Markdown 报告 |
| 触发 | 自动后台 | 用户点 Auto |
| 输出 | 5 维信号（structural/content/temporal/semantic/tags）| 叙事性 insights + gaps + actions |
| 关系 | Lint 信号 →（作为 pre-flight）→ Auto Review 输入 | Auto Review 消费 Lint |

Lint 是"传感器"，Auto Review 是"医生"。

### 13.2 与 Document Auto Review 关系

代码层共享：
- `CopilotMetaAgentStream`（meta-agent 编排）
- `CopilotOutputCollector`（propose 收集器）
- `CopilotReviewSession`（多轮编排）
- `CopilotReviewHistoryService`（持久化）

差异层：
- `runVaultReview(mode)` vs `runDocumentReview(ctx, mode)`：不同入口函数
- Pre-flight：`VaultDigest` vs `DocumentSignalReport`
- System prompt：vault scope 鼓励 cluster 引用 / 全局判断
- Tools：vault scope 没有 `propose_change`，改用 `propose_insight` 与新增的 vault-only proposers（Phase 2）
- 输出渲染：vault-scope 是结构化 review tabs + 落盘 Markdown；document-scope 是 change/insight artifact panels

历史记录：
- `originScope: 'document' | 'vault'`（字段已存在）
- Vault tab 历史列表过滤 `scope='vault'`
- Document tab 历史列表过滤 `scope='document'` 且 `subjectPath == current`

### 13.3 与 Ambient Push 关系

Vault Review 落盘后的 Markdown，自动进入 vault → 被 IndexService 索引 → 在写作时可被 Ambient Push 推送（"你 3 天前的 vault review 提到这个 cluster 在死亡，要不要看看？"）。

这创造了一个 **feedback loop**：用户行为 → vault 状态 → review → push → 用户行为。

---

## 14. 分阶段交付

### Phase 1（本期范围 — 给设计师出图）

**目标**：把 Vault tab 的 Auto 流程从"和 Document 一样"修复为"vault 级语义 + 落盘报告 + 增量提示"。

交付物：

0. **Review Launcher Picker 统一信息架构**
   - 三个 tab 共用同一套 launcher 语言：scope tabs + search/ask + metadata + readiness card + recent history + suggested intents
   - Document / Vault / Setting 只改变 scope 语义和主按钮策略，不另造三套视觉系统
   - 第一屏不做 capability grid；完整能力入口收进 `Show all capabilities`
   - Suggested intents 只是 initial intent，不限制 agent 后续可调用的 tools

1. **Vault tab 入口改造**
   - 替换 active doc 路径行为 vault 元数据（file count / word count / last reviewed）
   - 五状态卡（A-E）
   - Past vault reviews 列表（独立 scope）

2. **VaultDigest service**
   - 一次性查询出：counts / clusters / hubs / orphans / lint score / 30d activity
   - 不调 LLM，纯本地

3. **runVaultReview** agent flow
   - 复用 `CopilotMetaAgentStream`，新 prompt 包装
   - Pre-flight 是 VaultDigest 不是 SignalReport
   - 工具集：`propose_insight` + `propose_source` + `note_finding` + `submit_review`
   - 没有 `propose_change`（vault 层不直接产 diff）

4. **VaultFingerprint service**
   - sha1 over sorted `${path}:${contentHash}`
   - 缓存 + invalidate on file event

5. **Vault Health Report 落盘**
   - 路径：`peak-system/vault-reviews/{ISO-date}-{short-hash}.md`
   - Frontmatter schema：见 §9.1
   - Markdown 结构：见 §9.1

6. **Modal 改造**
   - Vault scope 时 tabs = Overview + Clusters + Gaps + Actions + Trace
   - 不显示 document-scope 的 Changes，也不设置顶层 Sources tab
   - Sources / provenance 作为每个结论的 inline evidence / drawer 展示
   - 可从 footer 或 header 打开落盘 markdown report（StreamdownIsolated / Obsidian note）
   - 标题改 "Vault Review" 不是 "Auto Review"

### Phase 2（不在本期）

- **Clusters 交互增强**：在 Clusters tab 内 drill-down Louvain 输出、成员、metric、相关笔记
- **Actions / Restructure 增强**：在 Actions tab 内支持 dry-run + 逐条 approve + 跨文件批量操作
- **Temporal diff**：与上次 review 对比
- **抽象层级混乱专属段**
- 新工具：`propose_cluster_observation` / `propose_gap` / `propose_restructure`

### Phase 3（不在本期）

- **真增量**：community partial recompute
- **定时自动跑**（cron-like）：每周自动跑 vault review，结果直接出现在 Vault tab

---

## 15. 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 报告形式 | Markdown 落盘 | 可归档、可搜索、不被 chat 模型一次消费完 |
| Tab 数（Phase 1）| Overview + Clusters + Gaps + Actions + Trace | Modal 是结构化 review surface，不是一篇长 report preview；用户需要按任务查看摘要、簇、问题、建议和执行轨迹 |
| Sources 表达 | Inline evidence / drawer，不做顶层 tab | 来源服务于具体结论；单独 Sources tab 会让用户离开当前判断，增加理解成本 |
| Restructure 命名 | Restructure（Phase 2 action type）| InfraNodus / Burt 经典用法，比 "Proposed Edits" 准；入口归在 Actions tab 内 |
| 历史列表分割 | Vault tab 只看 vault-scope | 已有 `originScope` 字段，过滤即可 |
| 增量门槛 | ≤5 files 且 ≤2% words = 不重跑 | 用户反复点 Vault tab 不应该烧钱 |
| Fingerprint 算法 | sha1(sorted(path:contentHash)) | 复用现有 contentHash，50ms 内可算完 |
| Tools（Phase 1）| 无 propose_change | Vault 层不应产 doc-level diff |
| 报告位置 | peak-system/vault-reviews/ | 沿用现有 peak-system 约定 |

---

## 16. 未解决问题（送给后续 spec / 评审）

### 16.1 Modal 与落盘报告的 wikilink 渲染

Modal 的 Overview / Clusters / Gaps / Actions 都需要点击 wikilink；落盘 Markdown report 也需要正常打开引用笔记。两种方案：

- **方案 A**：用 Obsidian native renderer（保留 wikilink 行为）
- **方案 B**：用 StreamdownIsolated 渲染，手动 patch wikilink click → `getLeaf('tab').openFile`

倾向 B（一致性），但 wikilink 需要 alias / shortest-path 解析，Obsidian native 处理得更好。**送评审**。

### 16.2 Vault digest 中 cluster 命名怎么来

Louvain 给出 community_id 是数字。报告里写 "AI Engineering 簇" 这种名字怎么来？

- 现有 `community_metadata.dominant_topics` 已存关键词
- 由 LLM 在 agent 流程内基于 top_nodes 起一个语义名（每次 review 可能命名漂移）
- 或：persist 一次 LLM 命名结果，下次 review 沿用

**送评审**。

### 16.3 大 vault 的 LLM context 限制

10 万篇 vault 的 digest 可能塞不进 context。需要：

- VaultDigest 限制：top-K 簇（按 size）、top-K hubs、top-K orphans 抽样
- Agent 用 vault_grep / vault_read_note 按需深挖

具体抽样阈值需基准测试。

### 16.4 Vault scope 用哪个模型

Document Fast 模式已支持 Haiku override。Vault 跑得久、token 多，是否也应该有便宜模型挡？

- 默认走 active agent profile（贵）
- 加 setting：Vault Review default model
- 或：用 Fast/Auto 区分（Fast=Haiku，Auto=Sonnet）

**送评审**。

### 16.5 Phase 1 是否给"上次报告对比"段

§11.1 提到 temporal diff 是差异化。Phase 1 是否最低限度做一个 "vs 上次 report" 的简单段（"new clusters: 0, dying: 1, hub changes: 2"）？还是完全留 Phase 2？

**送评审**。倾向 Phase 1 仅在状态 D/E 时显示极简 delta（"37 notes changed since"），完整 temporal diff 留 Phase 2。

---

## 17. 给设计师的关键指引

（视觉留给设计师，下面是必须遵守的功能性约束）

- **Vault tab 头部必须显示 vault 元数据**，不能再显示某个 doc 路径
- **Picker 是 Review Launcher，不是能力大全**；能力目录只能作为 `Show all capabilities` 的次级路径
- **三个 tab 保持同一设计语言**：Document / Vault / Setting 都有 metadata、readiness card、run controls、history、suggested intents
- **按钮表达运行策略，不表达孤立功能**：Auto/Fast/Refresh/System check 是 agent run 的模式，Suggested intents 是开场目标
- **状态卡（A-E）是核心交互单元**，让用户 2 秒判断"该不该重跑"
- **Overview 是默认消费界面**，5 秒内给出结论；Clusters / Gaps / Actions 承接深入查看和下一步操作
- **Sources 不做顶层 tab**，每个结论以 source chips / evidence drawer 解释来源
- **Trace tab 沿用 doc-scope 现有视觉**
- **所有 wikilink 必须 hover 可见、点击新 tab 打开**
- **历史 review 列表与 doc-scope 列表视觉一致**（已实现 hover + 完整 stats）
- **运行中状态需要进度感**（agent 跑 vault 比跑 doc 长，2-5 分钟级别）

---

## 18. 附录：参考资料

- **Codebase**:
  - `src/service/lint/VaultLintService.ts`（5 维信号）
  - `src/service/search/index/helper/structural/louvainCommunity.ts`（社区发现）
  - `src/service/search/index/cascade/CascadeChangeDetector.ts`（per-doc 变化检测）
  - `src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts`（community_metadata）
  - `src/service/copilot/CopilotMetaAgentStream.ts`（meta-agent）
  - `src/service/copilot/CopilotReviewSession.ts`（多轮编排）
  - `src/service/copilot/CopilotReviewHistoryService.ts`（持久化）

- **既有研究文档**:
  - `docs/research/research_doc_network_visualization.md`（5 条设计原则、竞品基础）
  - `docs/ui-review-research-report.md`（IFT、Progressive Disclosure、信息气味）
  - `docs/superpowers/specs/2026-05-17-copilot-meta-agent-redesign.md`（doc-scope spec）

- **学术 / 外部**:
  - Paranyushkin, *InfraNodus*, WWW'19
  - Burt, *Structural Holes*, 1992
  - Smart Connections (Obsidian plugin)
  - NotebookLM Mind Maps / Audio Overviews
  - arxiv 2410.00134 — Sparse-area filtering for topic modeling

---

*文档完。等待评审反馈，之后拆分为可执行 spec / 任务。*
