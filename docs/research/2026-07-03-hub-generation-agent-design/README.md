# Hub Generation Agent — 调研与设计

**Date**: 2026-07-03
**Owner**: Claude / codex-peak-modernization-refactor
**Status**: **已实施**（2026-07-03 commit `6bea87c3`，见下方 §实施记录）
**Blocker upstream**: 无（基建齐备，可直接进 spec）
**Spec**: `docs/superpowers/specs/2026-07-03-hub-generation-agent.md`

## 实施记录（2026-07-03）

按方向 C（Agent-driven curation + materialization）整体落地。**方案里的所有关键选择**都对上了实现：

### 架构选择对应实现

| 报告结论 | 落地方式 |
|---|---|
| 复用 `KnowledgeIntuitionAgent` 骨架（prep → recon loop → structured submit） | `HubCuratorAgent` 逐一镜像其目录结构：`hub-curation-helper/hubCurationPrep.ts` + `hubCurationRecon.ts` + `hubCurationMemory.ts` + `types.ts` |
| SQL 排候选 + Louvain 社区作为 curator prep（不重算图算法） | `MobiusNodeRepo.listCuratorHubCandidates()` 扩展现有 `listTopDocumentNodesForHubDiscovery` 增加 `community_id` + `betweenness_centrality`；`StructuralAnalysisRepo.getCommunities()` 提供社区元数据 |
| 数量 / 合并 / 淘汰全由 LLM 决定 + 自评覆盖率 | `hubCurationSubmitSchema` 内嵌 `coverage.uncoveredHighValue` + `confidence` + `should_stop`；curator budget 用 `clamp(⌈√N × 1.5⌉, 12, 60)` sqrt 缩放 |
| Materializer 独立每 hub 跑 + draft → critique 循环 | `HubMaterializationAgent` + `hubMaterializationRecon.ts`（`hubDraftSchema` / `hubCritiqueSchema`）；核心/边缘划分 `⌈√N⌉ clamped [3,12]` |
| `peak_user_owned` frontmatter guard | `ObsidianVaultHubDocAdapter.readPeakUserOwned()` + Materializer `finalize` 前置检查 |
| Merge 遇 user-owned 源 → 拦截整个 merge | `HubCurationExecutor.detectMergeConflict()` |
| Retire = archive 不删除 | `ObsidianVaultHubArchiveAdapter.archive()` → `_archive/hub/<sanitized-path>` |
| Single-hub fallback（stale-triggered 不必等 curator） | `HubGenerationRuntime.buildRegenerateFn()` 综合社区成员 + 最近 3 份 plan 找 decision |

### 具体交付

- 5 phase 一次性交付（见 spec §Phase 顺序）
- 48 files, +4455 lines
- 5 unit test + build + 158/158 tests green
- 3 命令：`peak-hub-curate-now` / `peak-hub-materialize-active-note` / `peak-hub-show-latest-plan`
- HubCurationPlanModal 简单 debug 面板

### Follow-up（本轮未做）

1. **UI 面板**（Phase 5 只做了 modal，Lint panel 里 Hub Curation tab 未加）
2. **Curator 触发频率**（Scheduler opt-in 默认关，用户体验后再决定是否默认打开）
3. **Cost tracking**（Usage Dashboard 联动 curator+materializer 调用成本）
4. **多语言 vault 效果对比**（观察后调整 prompt）

---

---

## 0. 一句话结论

**用户直觉正确：1-hop 拼接不靠谱。基建已经比想象的完整——PageRank / 语义 PageRank / 中介中心性 / Louvain 社区 / SQL 复合 hub score 全算过，落在 `mobius_node` 列上；甚至 `KnowledgeIntuitionAgent` 已经跑通了 "prep → LLM recon loop with graph tools → structured submit → render markdown" 的完整模式。**

**真正缺的是"per-hub 综述 agent"**：给一个 hub node（社区代表节点）→ 用图工具收集局部上下文 → LLM 起草 hub 综述文档 → 自评覆盖率。而"这个知识库应该有多少 hub、要不要合并"这个决策，可以直接沿用 KnowledgeIntuitionAgent 已有的 "SQL 排出候选 → LLM agent 用工具核实 → 结构化 submit" 双层套路——把 partition/entity/topology 换成 hub selection/scope 就行。

---

## 1. 问题陈述（用户提出）

> "仅仅拼接 1hop 邻居是不靠谱的，我觉得我们可能需要个整体网络图，然后也允许去计算 pagerank 这些，好像现在计算了？然后算出来那些有价值的节点，类别等等，一个知识库里的 hub 到底有多少个也是 LLM 决定的，这一个 agent 流程，他自己在检测覆盖率实用性等等。"

三个核心诉求：

1. **候选集不能靠 1-hop 邻居穷举**——需要利用全图结构（centrality、communities）
2. **候选评分要基于图算法**（PageRank / 中心性 / 社区归属），不能全靠 LLM 硬看内容
3. **数量决策交给 LLM**（不是固定 `topN = 10`），并让它自评覆盖率 / 实用性

---

## 2. 家底盘点（已有基建）

### 2.1 图分析算法层（全部已实现并落库）

| 算法 | 实现位置 | 落库列 |
|---|---|---|
| Vault PageRank（有向 reference 子图） | `src/service/search/index/helper/documentPageRank.ts:28` (`computeVaultPageRankStreaming`) | `mobius_node.pagerank`, `pagerank_updated_at`, `pagerank_version` |
| Semantic PageRank（`semantic_related` 加权子图） | 同文件 `computeSemanticPageRankStreaming` | `mobius_node.semantic_pagerank` (+ 版本) |
| Personalized PageRank（Andersen-Chung-Lang forward push） | `src/service/search/query/personalizedPageRank.ts:44` (`computePPR`) | 查询时计算，用于 rerank |
| Brandes 中介中心性 | `src/service/search/index/helper/structural/brandesBetweenness.ts:88` (`computeBetweenness`) | `mobius_node.betweenness_centrality` |
| Louvain 社区检测 | `src/service/search/index/helper/structural/louvainCommunity.ts:60` (`louvain`) | `mobius_node.community_id` + `community_metadata` 表 |
| 结构分析编排器 | `src/service/search/index/helper/structural/orchestrator.ts:8` | 组合调用上述算法 |

**评价**：不需要新算任何东西。PageRank 有全局和语义两版，Louvain 社区已经把 vault 切成互斥子图。

### 2.2 SQL 层复合 Hub Score（已实现）

`src/core/storage/sqlite/repositories/MobiusNodeRepo.ts:1161-1275`：`listTopDocumentNodesForHubDiscovery()` / `listFolderHubDiscoveryRowsByPaths()` 已经返回 4 个分数：

```
hub_physical_authority_score = min(1.0, pagerank * 2.5 + longDocWeak)
hub_semantic_centrality_score = min(1.0, semantic_pagerank * 1.2)
hub_organizational_score      = SQL heuristic (title tokens, folder depth, ...)
hub_graph_score               = 0.35 * physical + 0.25 * organizational + 0.35 * semantic
                                → 按 hub_graph_score DESC 排序
```

`constant.ts:96-105` 里三分权重已经暴露成常量。

**评价**：**"哪些节点值得成为 hub"是 SQL 已经能便宜地排出来的**。不需要 LLM 从头挑，LLM 只需要从 TOP-N 里精选 + 决定是否合并/拆分。

### 2.3 Hub 生命周期基建（已实现）

| 组件 | 位置 | 状态 |
|---|---|---|
| `hub_stale_since` 列 + 老化检测 | `MobiusNodeRepo.ts:995-1074` + `hubStalenessDetector.ts` | ✅ |
| `hub_constituent` 表（成员追踪） | `HubConstituentRepo.ts` | ✅ |
| `hub_regen_queue` 表（重生成队列） | 同上 | ✅ |
| `HubRegenService`（30s 防抖 + 批 10 + 重试 3） | `service/search/index/helper/hub/hubRegenService.ts:1-136` | ✅ |
| `CascadeWorker.hub_invalidate` | `cascade/CascadeWorker.ts:167-199` | ✅ |
| `CascadeWorker.hub_regen` handler | 同上 :195-199 | ❌ **placeholder** |
| `HubDocService.regenerateHubByNodeId` | `hub/hubDocServices.ts:19` | ❌ **stub** |
| `materializeHubDocFromCandidate()` | — | ❌ **不存在** |
| Hub 骨架模板 | `templates/indexing/` | ❌ **无**（`hub-discovery-*.md` 是发现阶段用的，不是生成阶段） |
| `peak_user_owned` frontmatter 跳过逻辑 | — | ❌ **不存在** |

**评价**：**只缺"用 LLM 把 skeleton 填成 markdown 并写回 vault"这一步**。

### 2.4 LLM Agent 基建（全部已实现）

- `runAgentLoop` (`src/service/agents/harness/loop/AgentLoop.ts:40`)：ReAct while-loop，Vercel AI SDK `generateText` 每步；有 tier controller、budget、hook、trace bus
- `ClaudeAgentSDKBridge` (`src/service/agents/harness-bridge/ClaudeAgentSDKBridge.ts:41`)：harness ↔ SDK 双后端切换
- `runHarnessAgent` (`src/service/agents/harness/HarnessAgentRun.ts:39`)：RunEnvelope 包裹层
- `SubAgentDispatcher`：嵌套子 agent
- `AIServiceManager.queryText/queryStream/queryStructured`：单-turn 快查 / 结构化输出
- `TemplateManager` + `TemplateRegistry` + `PromptService`：id → 磁盘模板 → Handlebars 渲染
- **参考实现**：`KnowledgeIntuitionAgent`（详见 § 2.5）

### 2.5 参考实现：`KnowledgeIntuitionAgent` 已有完整套路

`src/service/agents/KnowledgeIntuitionAgent.ts` + `intuition-helper/intuition.recon.ts` 已经跑通了这个流程：

```
1. prepareIntuitionContext()
   ├─ buildBackboneMap()          — 骨干文件夹结构
   ├─ buildHubWorldSnapshot()     — 全 vault 图快照 + metrics
   ├─ buildDocumentHubShortlist() — SQL 排出的 doc-hub 候选表
   └─ computeHubDiscoverBudgets() — sqrt(nodeCount) 缩放的 explore 预算

2. runKnowledgeIntuitionLoop()（最多 1-6 iterations）
   ├─ Plan step   : LLM 用 6 个 MCP tool 自由 explore
   │                 - exploreFolderTool / findPathTool / grepFileTreeTool
   │                 - graphTraversalTool / inspectNoteContextTool / localSearchWholeVaultTool
   ├─ Submit step : LLM 用 `knowledgeIntuitionSubmitSchema` 提交结构化结果
   │                 (partitions[6] + coreEntities[8] + topology[8] + entryPoints[24])
   └─ Memory merge: 每轮 submit 增量合并到 IntuitionMemory
   ↳ should_stop=true 或 iter 上限时退出

3. renderIntuitionSkeletonMarkdown() → 最终 vault-intuition markdown
```

**关键洞察**：这套模式就是用户想要的 **"agent 自评覆盖率、自决何时停"** 的现实版——只不过它输出的是 *全 vault 的一张地图*，不是 *每个 hub 一份综述*。**Hub 综述完全可以复用这套架子，只需换 prompt/schema/tools 焦点**。

### 2.6 现有图检查工具（可直接复用）

`src/service/tools/search-graph-inspector.ts` 已有 6 个工具，全部 agent-friendly：

| Tool | 作用 | 在 hub agent 里怎么用 |
|---|---|---|
| `findKeyNodesTool` | RRF 排出关键节点 | Discovery agent 用来核实 SQL 候选 |
| `inspectNoteContextTool` | 单笔记深挖（tags、in/out link、语义邻居） | Materialization agent 挖每个成员的细节 |
| `graphTraversalTool` | 从锚点 BFS N 跳 | Discovery agent 拓扑核对；Materialization agent 拉入相关子图 |
| `exploreFolderTool` | 目录浏览 | 组织维度取材 |
| `grepFileTreeTool` | 文件树 grep | 关键词横切 |
| `localSearchWholeVaultTool` | 全 vault 文本+向量搜 | 覆盖率自检 |

---

## 3. 三个设计方向的对比

### 方向 A · 1-hop 邻居拼接（当前 stub 的默认路径 · **否决**）

```
input: hubNodeId
1. SELECT * FROM mobius_edge WHERE from_or_to = hubNodeId  → 邻居列表
2. Prompt: "总结这些文档" + 拼接每个邻居的 title + 首段
3. LLM 输出 → 写入 hubPath
```

**问题**（用户已指出）：
- 邻居不等于同主题成员——1-hop 里混杂"引用了但不重要"的噪声
- 忽略 2-hop 传递结构（用户可能通过中间概念桥接到目标）
- 无中心性权重——所有邻居等价，重要与边缘无区分
- 没有覆盖率自检——LLM 可能漏掉关键分支

**唯一优点**：便宜，1 次 LLM 调用即可。

### 方向 B · SQL centrality shortlist + 模板填充（**部分改进 · 不够**）

```
input: hubNodeId
1. 通过 hubNodeId 反查 community_id
2. SELECT * FROM mobius_node WHERE community_id = X ORDER BY pagerank DESC LIMIT 30
3. 按角色分类（中心节点 top 3、桥梁节点 by betweenness top 3、其余边缘）
4. 渲染 handlebars skeleton → 一次性喂给 LLM 填空
```

**优点**：
- 用上了 PageRank + Louvain（成本 0，已经算过）
- 结构确定性高，输出稳定

**问题**：
- 数量硬编码（top 30）——大知识库欠采样，小知识库过采样
- 单次 LLM 调用无法自检覆盖率——一旦漏了重要子主题，就是漏了
- Community 边界不总是"主题一致"（Louvain 是模块度最大化，可能一个社区里有 2-3 个子主题）——需要 agent 判断是否要拆
- 无法跨社区推断"这两个 hub 可能应该合并"（如果内容强相关）

### 方向 C · Agent-driven hub curation（**推荐**）

**分两个 agent 串联**（可独立测试、独立部署）：

#### C-1 · Hub Curator Agent（"哪些节点该是 hub、多少个"）

复用 `KnowledgeIntuitionAgent` 骨架，替换焦点：

```
Prep (deterministic):
├─ SQL: 排出 top-K 候选（K = sqrt(vault_size) * 1.5，例如 300 doc → K=26）
│      每候选带 4 个分数 + community_id + hub_stale_since
├─ SQL: community_metadata（每社区大小、modularity 贡献、代表节点）
├─ SQL: 现有 hub（未 stale）快照（做 diff：新增 / 保留 / 淘汰）
└─ Render 到 "hub world snapshot" markdown（用现有 buildHubWorldSnapshot 稍加）

Recon loop (1-4 iter):
├─ Plan:  LLM 复用现有 6 个 graph-inspector tool，自由核实：
│         - 打开候选 hub 的 top 邻居看内容是否真的同主题
│         - 检查候选是否跨社区（可能提示合并）
│         - 检查是否有覆盖盲区（用 findKeyNodesTool 反查未上榜的高分节点）
└─ Submit (Zod schema):
   {
     hubs: [{
       nodeId, path, action: 'keep' | 'create' | 'merge' | 'retire',
       scope: { communityIds: [...], memberNodeIds: [...] },
       reason: string
     }],
     coverage: { totalMembers: n, coveredMembers: m, uncoveredHighValue: [...] },
     confidence: number,
     should_stop: boolean
   }
```

**关键**：
- **数量 = LLM 决定**（agent 看着 coverage 数字自己判断"够了"或"还漏"）
- **合并 / 拆分 = LLM 决定**（不是硬套 Louvain）
- **淘汰 = LLM 决定**（老 hub 主题已散，直接 retire）

**产物**：一份 `HubCurationDecision` 列表 → 分派给 C-2

#### C-2 · Hub Materialization Agent（"给一个 hub node，写出它的综述 markdown"）

```
Prep (deterministic):
├─ 从 HubCurationDecision 拿到 memberNodeIds
├─ 按 pagerank + betweenness 排序成员，前 K 个进"核心"，其余"外围"
├─ 拉 tags / semantic_related edges 汇总主题词
└─ Render skeleton markdown（新模板 templates/indexing/hub-doc-skeleton.md）
   sections: 概念定义 · 核心节点 · 结构脉络 · 演化时间线 · 未解问题 · 入口

Materialize loop (1-2 iter):
├─ Draft: LLM 用 skeleton + prep context 起草 markdown
├─ Self-critique (可选 SubAgent):
│  ├─ localSearchWholeVaultTool 搜"应该被引用但没有"的漏点
│  ├─ 对每个成员用 inspectNoteContextTool 验重要 quote / 时间点没漏
│  └─ 返回 { missingReferences, missingQuotes, retryDraft: boolean }
└─ Final: 定稿后写回 vault
        - `peak_user_owned = true` frontmatter 跳过（用户手改的 hub 不覆盖）
        - 增量更新（保留用户手写 section） vs 全量重写（结构化模式）
```

**产物**：markdown 文件写入 vault → `hub_stale_since = null` → `clearHubStale()`

**优点**：
- 覆盖率自检交给 LLM，agent 会持续迭代直到自评通过
- 尊重用户手改（`peak_user_owned` guard）
- 每个 hub 独立 LLM 调用（并行度可控，成本可预算）
- 复用现有 RunEnvelope + Trace 基建，UI 能看到进度

**成本**：
- Curator 每次全 vault 跑：~5-10 LLM 调用（多轮 recon）+ 4-8k input token
- Materializer 每个 hub：~2-4 LLM 调用 + 6-10k input token（skeleton + 成员摘录）
- 假设 vault 有 20 个 hub，每周全量 curator + 增量 materialize（触发 stale 时才跑）：
  - curator: 每周 ~10 次调用
  - materializer: 每周 ~40 次调用（20 hub × 平均 2 次自检）

---

## 4. 推荐设计（细化 · C 方向）

### 4.1 数据流总览

```
┌─────────────────────────────────────────────────────────────────┐
│  Trigger 层                                                      │
├─────────────────────────────────────────────────────────────────┤
│  A. 定时：Curator 每周全跑 1 次（用户可关）                        │
│  B. 用户手动：Command "Recompute Hub Plan"                        │
│  C. 增量：constituent 变化 → hubStalenessDetector →              │
│           HubRegenQueue → 只跑 Materializer（不重跑 Curator）      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Curator Agent（"这个 vault 该有哪些 hub"）                       │
├─────────────────────────────────────────────────────────────────┤
│  Prep: SQL top-K candidates + community_metadata + 现有 hubs     │
│  Loop: LLM plan (graph tools) → submit (HubCurationDecision)     │
│  Output: HubCurationDecision 列表 → 写入 hub_curation_plan 表     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Executor（读 plan → dispatch）                                   │
├─────────────────────────────────────────────────────────────────┤
│  - action='create': 分派给 Materializer                           │
│  - action='keep' + stale: 分派给 Materializer                     │
│  - action='merge': 合并 2+ hub node 为 1 个，dispatch Materializer│
│  - action='retire': archive 老 hub 文件（不删）                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Materializer Agent（"给这个 hub 写综述"）                        │
├─────────────────────────────────────────────────────────────────┤
│  Prep: memberNodeIds → 排序 + 摘要 → skeleton                    │
│  Loop: draft → self-critique → refine → 写回 vault               │
│  Output: markdown 文件 + clearHubStale()                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 新增数据结构

**新表 `hub_curation_plan`**：

| column | type | 说明 |
|---|---|---|
| plan_id | TEXT PK | UUID |
| curated_at | INTEGER | timestamp |
| coverage_pct | REAL | curator 自评 |
| confidence | REAL | curator 自评 |
| total_hubs | INTEGER | 决定的 hub 数量 |
| decisions_json | TEXT | 序列化的 HubCurationDecision[] |

保留最近 N 份历史，可以让用户 diff。

**新 Zod schema**（放 `src/core/schemas/agents/hubCuration.ts`）：

```ts
export const hubCurationDecisionSchema = z.object({
  nodeId: z.string(),
  hubPath: z.string(),
  action: z.enum(['create', 'keep', 'merge', 'retire']),
  scope: z.object({
    communityIds: z.array(z.string()).max(3),
    memberNodeIds: z.array(z.string()).max(50),
  }),
  reason: z.string(),
  mergeSourceHubs: z.array(z.string()).optional(),
});

export const hubCurationSubmitSchema = z.object({
  hubs: z.array(hubCurationDecisionSchema).max(30),
  coverage: z.object({
    totalMembers: z.number(),
    coveredMembers: z.number(),
    uncoveredHighValue: z.array(z.string()).max(20),
  }),
  confidence: z.number().min(0).max(1),
  should_stop: z.boolean(),
});
```

### 4.3 新增 Prompt 模板

| id | 路径 | 用途 |
|---|---|---|
| `HubCurationPlan` | `templates/prompts/hub-curation-plan.md` | Curator plan step 系统提示 |
| `HubCurationSubmit` | `templates/prompts/hub-curation-submit.md` | Curator submit step 结构化 |
| `HubMaterializationDraft` | `templates/prompts/hub-materialization-draft.md` | Materializer draft step |
| `HubMaterializationCritique` | `templates/prompts/hub-materialization-critique.md` | Materializer self-critique |
| `HubDocSkeleton` | `templates/indexing/hub-doc-skeleton.md` | Handlebars markdown 骨架 |

### 4.4 新增 Agent 文件

```
src/service/agents/
├── HubCuratorAgent.ts              — C-1 入口
├── HubMaterializationAgent.ts      — C-2 入口
├── hub-curation-helper/
│   ├── hubCurationPrep.ts          — SQL prep（复用 MobiusNodeRepo 已有查询）
│   ├── hubCurationRecon.ts         — recon loop（复刻 intuition.recon）
│   ├── hubCurationMemory.ts        — 增量合并
│   └── types.ts
└── hub-materialization-helper/
    ├── hubMaterializationPrep.ts
    ├── hubMaterializationRecon.ts
    └── types.ts
```

### 4.5 新增 Ports / Adapters

- `HubMaterializationVaultWritePort`（core/ports）：`writeHubDoc(path, markdown, frontmatter)` + `readPeakUserOwned(path): boolean`
- 对应 Obsidian adapter 在 `app/lint` 或新 `app/hub/` 下

### 4.6 修改现有代码

| 文件 | 改动 |
|---|---|
| `hub/hubDocServices.ts:19` | stub → 调用 `HubMaterializationAgent` |
| `cascade/CascadeWorker.ts:195` | placeholder → 从 hub_regen_queue 取任务 → `HubDocService.regenerateSingleHub` |
| 新 `PeakCommandActions` 命令 | "Curate Hubs Now"（手动触发 Curator） |

---

## 5. 覆盖率 / 实用性判据

Agent 自评的具体指标（写在 submit schema 里，也写在 progress log）：

**Curator 覆盖率**（Louvain-community-based）：
- `coverage_pct = sum(top_pagerank_in_covered_communities) / sum(top_pagerank_in_all_communities)`
- 即：加权覆盖率——用 PageRank 加权，避免"数量都覆盖了但重要节点漏了"

**Curator 冗余度**：
- 两个 hub 的 memberNodeIds 交集 / 并集 > 0.4 → 触发 merge 建议

**Materializer 完整度**：
- 检查每个 memberNodeId 至少被引用 1 次
- 检查关键 tag（top-5 by tf-idf on members）至少被提到
- 检查有明确的"入口"和"未解问题"section

**用户反馈信号**（长期）：
- 用户手改率（`peak_user_owned=true` 转换率）
- 用户 delete 率（该 hub 从未 open）
- 用户 pin 率（挂在 favorites）

---

## 6. 实施阶段

Phase 顺序按"能独立交付一段价值"划分，不是工时安排：

**Phase 1 · Materializer MVP**
- 新建 `HubMaterializationAgent` 骨架（不带 self-critique loop，先单次 draft）
- 新建 `hub-doc-skeleton.md` + `hub-materialization-draft.md` 两模板
- 打通 `HubDocService.regenerateHubByNodeId` → 调 agent
- 打通 `CascadeWorker.hub_regen` handler
- 打通 vault write（含 `peak_user_owned` guard）
- **能落地**：用户手动 "Refresh Hub Summaries" 命令能真的生成一份 hub 综述

**Phase 2 · Materializer self-critique loop**
- 加 SubAgent 自检 draft
- 覆盖率 metric 上报到 RunEnvelope

**Phase 3 · Curator MVP**
- 新建 `HubCuratorAgent`（复刻 IntuitionAgent 结构）
- 新建 `hub_curation_plan` 表 + migration
- 新建 3 个 curation 模板
- 新建 command "Curate Hubs Now"
- **能落地**：用户能看到 curator 决定"新增/保留/合并/淘汰"哪些 hub

**Phase 4 · Executor + 定时 trigger**
- Curator plan → 分派给 Materializer
- 定时器：每周（可配置）跑一次 Curator
- Merge / Retire 动作的实际文件操作

**Phase 5 · UI**
- 在 lint panel 里加 hub curation 结果面板
- 一屏看 "决定 / 覆盖率 / 用户可否 override"

---

## 7. 开放问题

1. **Curator 触发频率**：
   - 每次索引都跑太贵 → 每周？触发条件？
   - Louvain 输出稳定吗？Vault 增长 5% 时 community_id 可能大范围重排 → Curator 每次都会"看着很多变动"
   - **建议**：先手动 + 定时（默认 7 天），观察后再自动化

2. **Retire 是否删文件**：
   - 用户可能对老 hub 有情感依赖 → 建议 archive 到 `_archive/hub/` 而不是删除

3. **Merge 时的用户手改内容**：
   - 两个 hub 都有 `peak_user_owned=true` section → 冲突如何处理？
   - **建议**：Merge 前必须弹窗让用户确认，不自动执行

4. **Curator 决定与用户手动创建的 hub 冲突**：
   - 用户可能自己在某个位置创了 hub 文档（`peak_user_owned=true`）
   - Curator 决定"这里不该有 hub"时不能覆盖用户意图
   - **建议**：`peak_user_owned=true` 的 hub 视为常数，永远 keep

5. **多语言 vault**：
   - Chinese vault 的成员 title 是否影响 LLM 判断主题一致性？
   - 现有 `KnowledgeIntuitionAgent` 在中文 vault 表现如何？（先跑一次做基线）

6. **成本上限**：
   - 需要给 curator + materializer 加 budget 环
   - 单次总调用超过 X 次 → 提前 finish（与 harness budget 联动）

---

## 8. 决策记录

- ✅ **采纳方向 C**（Agent-driven curation + materialization）
- ✅ **复用 KnowledgeIntuitionAgent 架子**（不新造轮子）
- ✅ **SQL centrality shortlist 保留**（作为 curator 的 prep）
- ✅ **Louvain community 保留**（作为 curator 的 hint，但不硬约束）
- ✅ **分 5 phase 交付**（每 phase 独立价值）
- ⏸ **Curator 触发频率**、**Retire 策略**、**Merge 冲突** 留到 spec 阶段决

---

## 9. 后续动作

1. 本调研落库 → `docs/roadmap.html` #researching 段登记（**必做**）
2. 若用户批准 → 起 spec：`docs/superpowers/specs/2026-07-04-hub-generation-agent.md`
3. spec 中包含每个 Phase 的 acceptance criteria + task list
4. 起分支 `codex/hub-materialization-mvp`，先跑 Phase 1

---

## 10. 参考文献 / 内部引用

- 现有全 vault 图 agent：`src/service/agents/KnowledgeIntuitionAgent.ts`
- 现有 recon loop 参考：`src/service/agents/intuition-helper/intuition.recon.ts`
- 现有 graph tool inventory：`src/service/tools/search-graph-inspector.ts`
- 现有 hub SQL scoring：`src/core/storage/sqlite/repositories/MobiusNodeRepo.ts:1161-1275`
- 现有 hub 生命周期：`src/service/search/index/helper/hub/*`
- 相关 backlog 节点：`docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md` C-HUB2
