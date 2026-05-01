# 竞品差异化功能 — 并行 Spec 调研 Session Prompts

> 生成日期：2026-05-01
> 使用方法：开 7 个 Claude Code session，每个粘贴对应 prompt。产出 spec 文件在 `docs/superpowers/specs/` 下。

---

## Session 1: S1 Ambient Push（建议用 Opus）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "Ambient Push" 功能的技术 spec。

## 背景

Ambient Push 是 Peak 的核心差异化功能：用户写作时，系统主动推送相关知识库内容，并解释为什么这些内容相关。这是与 Smart Connections（只显示相关笔记，不解释原因）的关键差异点。

## 必读文件

1. `docs/progress.md` — 读 Next → S1 部分了解功能定义和现有基础
2. vault 研究文档（学术论文引用和竞品分析）：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §2.1 学术支撑 + §3.1 竞品对比
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-差异化定位与护城河分析-2026-04.md` — §1.2 现状 + §7 brainstorm
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-Copilot.md` — ambient 相关描述
3. 现有代码（了解可复用的基础设施）：
   - `src/service/search/index/indexUpdater.ts` — vault event listener
   - `src/service/search/index/indexService.ts` — 索引更新流程
   - `src/service/search/query/queryService.ts` — 搜索管道
   - `src/service/search/query/reranker.ts` — 重排序
   - `src/service/context/PatternDiscoveryTrigger.ts` — 事件触发模式参考
   - `src/core/storage/graph/` — 图存储
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-ambient-push-design.md`，包含：

1. **Problem Statement** — 用户痛点 + 竞品空白
2. **Academic Foundation** — 引用研究文档中的学术论文（Koskela 2018, Brain Cache CHI 2025）
3. **Architecture Design** — 事件触发模型：
   - 触发条件（编辑事件、光标停留、文档切换等）
   - 上下文提取（当前段落、最近编辑内容、文档主题）
   - 相关内容检索（复用现有搜索管道 + 图遍历）
   - 排序与过滤（避免信息过载）
   - 推送策略（节流、去重、渐进式披露）
4. **Data Model** — 推送记录、用户反馈、相关性评分
5. **UI Design** — 推送面板/sidebar：内容卡片 + 相关原因标签 + 操作按钮（插入链接、打开笔记、忽略）
6. **Integration Points** — 与现有搜索/图/hub 系统的对接
7. **Performance Constraints** — 不能阻塞编辑体验，延迟预算
8. **Implementation Phases** — 建议分阶段实现的路线

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 2: S2 Vault Lint / Health Check（建议用 Opus）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "Vault Lint / Health Check" 功能的技术 spec。

## 背景

Vault Lint 是 Karpathy LLM Wiki 验证的核心操作之一，竞品完全空白（★★★★★ gap）。目标是为用户提供知识库健康体检报告，类似代码 lint 但面向知识管理。

## 必读文件

1. `docs/progress.md` — 读 Next → S2 部分了解功能定义和现有基础
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §4.3 Lint as independent operation
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-差异化定位与护城河分析-2026-04.md` — §9.3 Vault X-Ray 设计概念（健康分数、hub 列表、orphan 岛、bridge notes、potential links、community map、decaying notes）
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb3-tech-articles/F-工具系列/Y-2-PersonalCMS/H-PeakAssistant/H-Lint检测.md` — Lint 检测想法
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb3-tech-articles/F-工具系列/Y-2-PersonalCMS/H-PeakAssistant/A-2-UI-Enhance.md` — UI 增强想法
3. 现有代码：
   - `src/service/tools/search-graph-inspector/find-orphans.ts` — 孤立笔记检测
   - `src/service/search/index/helper/hub/hubDiscover.ts` — hub 发现 + `HubDiscoverCoverageGap`
   - `src/service/search/index/helper/backbone/documentPageRank.ts` — 全局 PageRank
   - `src/service/search/index/helper/semanticRelatedEdges.ts` — 语义边
   - `docs/HUB_DOC_PIPELINE.md` — Hub 文档管线
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-vault-lint-design.md`，包含：

1. **Problem Statement** — 知识库"腐烂"问题 + Karpathy Lint 理念
2. **Lint Signals** — 多信号健康检测模型：
   - 结构性：orphan notes、broken links、missing backlinks、循环引用
   - 内容性：空文件、stub notes、过长文档（应拆分）、重复内容
   - 时效性：stale notes（长期未更新但高 PageRank）、decaying hubs
   - 语义性：主题盲区（coverage gaps）、矛盾检测、低内聚 cluster
   - 标签性：未标签笔记、标签孤岛、标签冗余
3. **Health Score Model** — 如何计算 0-100 分 + 各维度权重
4. **Vault X-Ray Dashboard UI** — 参考差异化分析 §9.3 的设计：
   - 总分 + 趋势图
   - 各维度得分卡片
   - 可操作项列表（一键修复 / 建议修复）
5. **Fix Actions** — 每种 lint signal 对应的自动/半自动修复
6. **Incremental vs Full Scan** — 全量扫描 vs 增量更新策略
7. **Data Model** — lint 结果存储、历史对比
8. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 3: S3 级联关系更新（建议用 Opus）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "级联关系更新" 功能的技术 spec。

## 背景

当前 indexDocument() 只做单文档原子更新——修改笔记 A 时，A 的 neighbors、hub summaries、semantic edges 全部不感知变化。Karpathy LLM Wiki 的 Ingest 操作是多页级联更新（修改一页 → 10-15 页联动更新）。这是 Peak 知识图谱"活"起来的关键。

## 必读文件

1. `docs/progress.md` — 读 Next → S3 部分
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §4.4a 级联更新 + §2.2 HippoRAG 增量 PPR
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-差异化定位与护城河分析-2026-04.md`
3. 现有代码（核心——仔细读）：
   - `src/service/search/index/indexService.ts` — 索引服务主体
   - `src/service/search/index/indexUpdater.ts` — vault event listener + debounce
   - `src/service/search/index/helper/semanticRelatedEdges.ts` — 语义边构建（当前只批量重建）
   - `src/service/search/index/helper/hub/hubDiscover.ts` — hub 发现（当前只批量）
   - `src/service/search/index/helper/hub/hubDocServices.ts` — hub doc 生成
   - `src/service/search/index/helper/backbone/documentPageRank.ts` — PageRank（当前只全量重算）
   - `src/core/storage/sqlite/SqliteStoreManager.ts` — 数据库管理
   - `docs/The Unified SQLite Knowledge Engine (USKE).md` — 存储架构
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-cascade-update-design.md`，包含：

1. **Problem Statement** — 当前"死图谱"问题 + Karpathy Ingest 对标
2. **Cascade Model** — 当笔记 A 修改时：
   - 哪些实体需要更新？（A 的 outgoing links targets、backlink sources、同 cluster 笔记、所属 hub）
   - 更新什么？（semantic edges、PageRank 增量、hub summary 失效标记、coverage gap 重算）
   - 更新深度？（1-hop? 2-hop? 基于语义变化量动态决定？）
3. **Trigger Strategy** — 即时 vs 延迟 vs 批量三种模式的 tradeoff：
   - 即时：编辑保存后立即级联（低延迟但高成本）
   - 延迟：积累 debt → 空闲时级联（平衡方案）
   - 批量：定时全量维护（现有模式）
4. **Incremental Algorithms** — 增量语义边更新、增量 PageRank（推荐参考 HippoRAG 增量 PPR）
5. **Hub Invalidation** — hub summary 失效条件 + 后台重生成策略
6. **Performance Budget** — 级联更新不能阻塞编辑体验
7. **Data Model** — cascade debt 表、invalidation 标记
8. **Integration Points** — 与 S1 Ambient Push 的关系（级联更新是 push 的数据源）
9. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 4: S4 Structural Hole / Hub 检测可视化（建议用 Sonnet）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "Structural Hole / Hub 检测可视化" 功能的技术 spec。

## 背景

目标是达到 InfraNodus 级别的 gap analysis 体验，但完全 Obsidian-native、本地运行。当前有 hub discovery + bridge 角色分类的后端基础，但缺少面向用户的可视化 UI 和真正的 betweenness centrality 算法。

## 必读文件

1. `docs/progress.md` — 读 Next → S4 部分
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §2.3 Burt 2004 + §3.2 竞品矩阵
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-差异化定位与护城河分析-2026-04.md` — §1.2 现状评估
3. 现有代码：
   - `src/service/search/index/helper/hub/hubDiscover.ts` — hub 发现 + bridge/authority 角色
   - `src/service/search/index/helper/hub/localGraphAssembler.ts` — 局部图组装
   - `src/service/tools/search-graph-inspector/find-path.ts` — betweennessCentrality 计算（per-path，非全局）
   - `src/service/tools/search-graph-inspector/find-key-nodes.ts` — 关键节点发现
   - `src/ui/component/mine/multi-lens-graph/` — 图可视化组件
   - `src/ui/component/mine/graph-viz/` — 图渲染基础
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-structural-hole-design.md`，包含：

1. **Problem Statement** — 知识盲区不可见问题
2. **Algorithm Design** — 全 vault betweenness centrality + Burt's structural constraint coefficient
3. **Gap Detection** — 如何识别 structural holes（topic communities 间的断裂带）
4. **Visualization** — Gap Analysis UI 面板：
   - Community 地图（聚类着色）
   - Bridge nodes 高亮
   - Structural holes 标注（社区间缺失连接）
   - 建议操作：创建连接笔记、添加链接
5. **Integration** — 与现有 MultiLensGraph、hub discovery 的集成
6. **Data Model** — betweenness scores 存储 + 增量更新
7. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 5: S5 KG + PPR 搜索（建议用 Sonnet）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "Personalized PageRank (PPR) 搜索" 功能的技术 spec。

## 背景

当前搜索使用 FTS5 + 向量 KNN + 全局 PageRank 静态 boost。HippoRAG (NeurIPS 2024) 证明 PPR 比纯向量 RAG 高 20%。Peak 已有完整的全局 PageRank 实现和语义边图，只需要加 query-time PPR。

## 必读文件

1. `docs/progress.md` — 读 Next → S5 部分
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §2.2 HippoRAG 引用 + PPR 可行性分析
3. 现有代码：
   - `src/service/search/index/helper/backbone/documentPageRank.ts` — 全局 PageRank + semantic PageRank 算法（power iteration）
   - `src/service/search/index/helper/semanticRelatedEdges.ts` — 语义边（KNN-based）
   - `src/service/search/query/queryService.ts` — 搜索管道
   - `src/service/search/query/reranker.ts` — 重排序（当前用全局 PageRank 作为静态 boost）
   - `src/core/storage/sqlite/` — SQLite 存储（mobius_node / mobius_edge）
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-ppr-search-design.md`，包含：

1. **Problem Statement** — 全局 PageRank 的局限性 + PPR 的优势
2. **PPR Algorithm** — 从 query-matched seed nodes 出发的 biased random walk：
   - Seed selection（FTS5/向量匹配 top-K 作为 seed）
   - Teleport probability（α = 0.15 standard）
   - Convergence criteria
   - Sparse implementation（只遍历可达子图，不全局计算）
3. **Integration into Search Pipeline** — PPR scores 如何与现有 RRF（FTS5 + vector + metadata）融合
4. **Performance** — 对 <50K 节点图的实时 PPR 可行性分析 + benchmark 目标
5. **Incremental PPR** — 当图更新时如何增量更新（与 S3 级联更新的关系）
6. **Data Model** — 是否缓存 PPR 结果？还是纯实时计算？
7. **A/B Testing** — 如何对比 PPR vs 当前全局 PageRank boost 的搜索质量
8. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 6: S6 预编译知识层（建议用 Sonnet）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "预编译知识层" 功能增强的技术 spec。

## 背景

Karpathy LLM Wiki 的核心理念是三层架构（Raw Sources / Wiki / Schema），其中 Wiki 层是预编译的知识摘要。Peak 已有 Hub Doc pipeline（LLM 生成摘要存为 vault Markdown），但缺少增量触发和预嵌入。目标是让 hub docs 成为真正的"编译式知识"——自动维护、可查询、随源笔记变化而更新。

## 必读文件

1. `docs/progress.md` — 读 Next → S6 部分
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — §4 Karpathy LLM Wiki 全分析 + §4.4c 预编译知识层建议
3. 现有代码（核心——仔细读）：
   - `src/service/search/index/helper/hub/hubDocServices.ts` — hub doc 生成（LLM fill）
   - `src/service/search/index/helper/hub/hubDiscover.ts` — hub 候选发现
   - `src/service/search/index/helper/hub/localGraphAssembler.ts` — 局部图组装
   - `src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts` — hub doc markdown 格式
   - `docs/HUB_DOC_PIPELINE.md` — 现有管线文档
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-precompiled-knowledge-design.md`，包含：

1. **Problem Statement** — "RAG 重推导" vs "编译式知识" 的 tradeoff
2. **Current State** — Hub Doc pipeline 已有什么、缺什么
3. **Incremental Trigger Mechanism** — 当 constituent note 修改时：
   - 如何检测哪些 hub docs 需要失效（constituent membership tracking）
   - 失效策略（立即重生成 vs 标记 stale + 后台队列）
   - 重生成范围（全量重写 vs 增量 patch）
4. **Pre-embedding Strategy** — hub docs 是否应预嵌入到向量库？如何在搜索时优先使用？
5. **Layered Knowledge Model** — Raw notes → Hub summaries → Cluster digests → Vault overview 的层级
6. **Query-time Integration** — 搜索时如何利用预编译知识（hub docs 作为 context injection? 优先返回?）
7. **Freshness Guarantee** — 如何确保预编译知识不过时
8. **Data Model** — constituent membership 表、staleness 标记、generation queue
9. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```

---

## Session 7: S7 Auto-tag 建议（建议用 Sonnet）

```
你的任务是为 Peak Assistant（Obsidian 插件）设计 "Auto-tag 建议" 功能的技术 spec。

## 背景

竞品空白（vs Mem.ai ★★★★★）。设计红线：必须是建议模式（Generation Effect），不能静默执行——用户主动选择接受/拒绝标签。现有 indexDocument 有 includeLlmTags 选项但只在 manual_full 索引时触发。

## 必读文件

1. `docs/progress.md` — 读 Next → S7 部分
2. vault 研究文档：
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-竞品分析与学术验证.md` — 竞品矩阵中 auto-tag 行 + "Generation Effect" 设计红线
   - `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/kb2-learn-prd/B-2-创意和想法管理/B-All Requirements/AI-peakAssistant-Copilot.md` — "自动建议 tag 建议反向链接"
3. 现有代码：
   - `src/service/search/index/indexService.ts` — indexDocument 的 includeLlmTags 选项
   - `src/service/copilot/copilot-schemas.ts` — Copilot 功能 schemas（polish/review/links/split，不含 tags）
   - `src/service/copilot/copilot-commands.ts` — Copilot 命令注册
   - `src/core/storage/sqlite/` — tag 相关存储
   - `src/service/search/index/helper/backbone/tagDisplayRank.ts` — 标签排名（抑制噪声标签）
4. 项目约定：`CLAUDE.md`

## 产出

写一个 spec 文件到 `docs/superpowers/specs/2026-05-01-auto-tag-design.md`，包含：

1. **Problem Statement** — 手动打标签的痛点 + Generation Effect 学术依据
2. **Design Principles** — 建议模式（非静默）、可解释（为什么建议这个标签）、可学习（用户反馈改善建议）
3. **Tag Suggestion Engine** —
   - 基于内容：LLM 分析文档内容提取候选标签
   - 基于图谱：neighbor notes 的标签传播
   - 基于历史：用户标签习惯学习
   - 标签规范化：与现有标签体系对齐（避免近义标签爆炸）
4. **Trigger Modes** —
   - 单文档模式：打开/保存文档时在 sidebar 显示建议
   - 批量模式：选择文件夹 → 批量扫描 → 建议列表
   - Ambient 模式（与 S1 结合）：写作时 sidebar 实时建议
5. **UI Design** — 建议面板：标签卡片 + 原因说明 + 接受/拒绝/修改按钮 + 批量操作
6. **Data Model** — 建议记录、用户反馈、标签置信度
7. **Integration** — 与现有 tagDisplayRank、indexService、Copilot 命令系统的集成
8. **Implementation Phases**

不要写实现代码，只写设计。用英文写 spec 正文，中文写注释说明。
```
