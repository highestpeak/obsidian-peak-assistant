# Hub Generation Agent — Spec

Date: 2026-07-03
Parent research: `docs/research/2026-07-03-hub-generation-agent-design/README.md`
Backlog node: `docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md` §C-HUB2

> **2026-08-02 ownership update:** 本文记录已实现的 Curator + Materializer pipeline，仍是当前代码行为依据；其中“每个 Hub 都写回 Markdown”的目标不再是长期存储方向。新目标是 Hub manifest / events 为 canonical truth、SQLite 为 virtual Hub projection、Markdown 仅在用户要求编辑、链接或进入原生 Obsidian Graph 时物化。见 [生成产物注册表](../../conventions/generated-artifact-registry.md) 与 [存储治理实现设计](./2026-08-02-generated-artifact-storage-governance-implementation-design.md)。在新 runtime 完成前，不得据此删除现有 Hub Markdown 或绕过当前生产 reader。

## Goal

替换 `HubDocService.regenerateHubByNodeId` 的 stub 实现，让 hub doc 从"stub warning 输出"变成"agent 决定生成什么、生成给谁看、并写回 vault"。整体拆成两个 agent 串联：

1. **HubCuratorAgent** — 决定 "这个 vault 现在该有哪些 hub、要不要合并 / 淘汰"，输出 `HubCurationPlan`
2. **HubMaterializationAgent** — 对 plan 里每个 `create` / `keep-stale` 决策，独立生成 hub markdown 并写回 vault

不新造图算法、不重写 hub 生命周期，只把"决策"和"落地"这两块交给 LLM agent，其余照旧复用。

## Non-Goals

- 不重算 PageRank / Louvain / betweenness — 已有基建保持不变（见研究报告 §2.1）
- 不改 `hub_stale_since` / `hub_regen_queue` / `HubRegenService` 的调度骨架 — 只补 handler body
- 不做 hub 决策的 UI 面板 — 留给 Phase 5，本 spec 只定 command 入口
- 不做"跨语言 vault 效果对比"评测 — 留给上线后观察
- 不做多模态 hub（图片 / 音频摘要）— hub 只输出 markdown

## Baseline: 现有代码状态

| 组件 | 位置 | 现状 | 本 spec 是否触碰 |
|---|---|---|---|
| PageRank / Semantic PageRank / PPR / Brandes / Louvain | `src/service/search/index/helper/*` | ✅ 齐 | 否 |
| SQL 复合 hub score (`hub_graph_score` 等) | `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts:1161-1275` | ✅ 齐 | 否，作为 Curator prep 输入 |
| `hub_stale_since` / `hub_constituent` / `hub_regen_queue` | `MobiusNodeRepo.ts` + `HubConstituentRepo.ts` | ✅ 齐 | 否 |
| `HubStalenessDetector` + `HubRegenService` 队列驱动 | `service/search/index/helper/hub/*` | ✅ 齐 | 否 |
| `CascadeWorker.hub_regen` handler | `cascade/CascadeWorker.ts:195-199` | ❌ no-op placeholder | ✅ 补 body |
| `HubDocService.regenerateHubByNodeId` | `hub/hubDocServices.ts:19` | ❌ stub warning | ✅ 改为调 Materializer |
| `HubCuratorAgent` | — | ❌ 不存在 | ✅ 新建 |
| `HubMaterializationAgent` | — | ❌ 不存在 | ✅ 新建 |
| Hub skeleton / prompt 模板 | `templates/` | ❌ 只有 discovery 阶段模板 | ✅ 新增 5 份 |
| `hub_curation_plan` 表 | — | ❌ 不存在 | ✅ 新建 |
| `peak_user_owned` frontmatter guard | — | ❌ 不存在 | ✅ 新建端口 + adapter |

## Design Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Trigger                                                          │
│  ├─ Command: "Curate Hubs Now"       → HubCuratorAgent            │
│  ├─ 定时（可关，默认每 7 天）          → HubCuratorAgent            │
│  └─ Constituent changed → hubStalenessDetector → hub_regen_queue │
│     └─ CascadeWorker.hub_regen → HubMaterializationAgent(one)    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  HubCuratorAgent                                                  │
│  ─────────────                                                    │
│  Prep (deterministic):                                            │
│  ├─ SQL top-K hub candidates (per §Prep-K)                        │
│  ├─ community_metadata snapshot                                   │
│  ├─ existing (non-stale) hubs snapshot                            │
│  └─ Render `HubCurationWorldSnapshot` markdown                    │
│                                                                   │
│  Recon loop (1..N iterations, N=计算见 §Budget):                   │
│  ├─ Plan step:   queryWithProfile(system=HubCurationPlanPrompt,   │
│  │                  tools=6 existing graph-inspector tools)       │
│  └─ Submit step: queryStructured(schema=hubCurationSubmitSchema)  │
│                                                                   │
│  Output: persist HubCurationPlan → `hub_curation_plan` table      │
│          emit CurationExecutorEvent for each decision             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  HubCurationExecutor (thin dispatcher)                            │
│  ─────────────                                                    │
│  For each decision d:                                             │
│  ├─ action='create': call HubMaterializationAgent(d)              │
│  ├─ action='keep' + stale: call HubMaterializationAgent(d)        │
│  ├─ action='keep' + fresh: no-op                                  │
│  ├─ action='merge': mergeHubs(d.mergeSourceHubs, d.hubPath)       │
│  │                   → then HubMaterializationAgent(d)            │
│  └─ action='retire': archive to `_archive/hub/<orig-path>`        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  HubMaterializationAgent (per hub)                                │
│  ─────────────                                                    │
│  Prep:                                                            │
│  ├─ read memberNodeIds from decision                              │
│  ├─ classify: core (top-K by pagerank+betweenness), fringe        │
│  ├─ aggregate top tags / semantic keywords                        │
│  └─ Render `HubDocSkeleton` markdown                              │
│                                                                   │
│  Materialize loop (1..M, M=计算见 §Budget):                        │
│  ├─ Draft:      queryStructured(schema=hubDraftSchema)            │
│  ├─ Critique:   SubAgent uses localSearchWholeVaultTool +         │
│  │              inspectNoteContextTool to find missing refs       │
│  │              → returns { retryDraft: bool, gaps: [...] }       │
│  └─ Loop until retryDraft=false OR M exceeded                     │
│                                                                   │
│  Finalize:                                                        │
│  ├─ Read existing file (if any) — check `peak_user_owned` fm     │
│  │  └─ true → skip write, log 'user-owned'                        │
│  ├─ Merge with user-preserved sections (marked <!-- USER --> ... )│
│  ├─ Write via VaultHubDocWritePort                                │
│  └─ MobiusNodeRepo.clearHubStale(nodeId)                          │
└──────────────────────────────────────────────────────────────────┘
```

## Component 1 · `hub_curation_plan` 表

### 1.1 Schema

新增 DDL（`src/core/storage/sqlite/ddl.ts`，migration V+1）：

```sql
CREATE TABLE IF NOT EXISTS hub_curation_plan (
  plan_id           TEXT PRIMARY KEY,      -- uuid
  curated_at        INTEGER NOT NULL,      -- ms since epoch
  trigger           TEXT NOT NULL,         -- 'manual' | 'scheduled'
  coverage_pct      REAL NOT NULL,         -- curator self-assessed [0,1]
  confidence        REAL NOT NULL,         -- curator self-assessed [0,1]
  iterations        INTEGER NOT NULL,      -- how many recon iters ran
  total_hubs        INTEGER NOT NULL,      -- number of decisions in this plan
  decisions_json    TEXT NOT NULL,         -- serialized HubCurationDecision[]
  world_summary     TEXT,                  -- prep snapshot summary (debug)
  executor_status   TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  executor_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_hub_curation_plan_curated_at
  ON hub_curation_plan(curated_at DESC);
```

### 1.2 Retention

保留最近 20 份 plan，超出按 `curated_at ASC` 删除。目的是让用户能 diff 相邻两次 curation 决策（"上次 curator 建议合并 A+B，这次没合，为什么"）。

### 1.3 Repo API

新文件 `src/core/storage/sqlite/repositories/HubCurationPlanRepo.ts`：

```ts
export interface HubCurationPlanRow {
  planId: string;
  curatedAt: number;
  trigger: 'manual' | 'scheduled';
  coveragePct: number;
  confidence: number;
  iterations: number;
  totalHubs: number;
  decisions: HubCurationDecision[];  // parsed from decisions_json
  worldSummary: string | null;
  executorStatus: 'pending' | 'running' | 'completed' | 'failed';
  executorError: string | null;
}

export class HubCurationPlanRepo {
  insert(row: Omit<HubCurationPlanRow, 'executorStatus' | 'executorError'>): Promise<void>;
  updateExecutorStatus(planId, status, error?): Promise<void>;
  getById(planId): Promise<HubCurationPlanRow | null>;
  listRecent(limit = 20): Promise<HubCurationPlanRow[]>;
  pruneOlderThan(keepCount = 20): Promise<void>;
}
```

## Component 2 · Zod Schemas

新文件 `src/core/schemas/agents/hubCuration.ts`：

```ts
import { z } from 'zod/v3';

export const hubCurationScopeSchema = z.object({
  communityIds: z.array(z.string()).max(3),
  memberNodeIds: z.array(z.string()).max(60),
});

export const hubCurationDecisionSchema = z.object({
  nodeId: z.string(),
  hubPath: z.string(),          // vault-relative
  action: z.enum(['create', 'keep', 'merge', 'retire']),
  scope: hubCurationScopeSchema,
  reason: z.string(),
  mergeSourceHubs: z.array(z.string()).optional(), // only when action='merge'
});

export const hubCurationCoverageSchema = z.object({
  totalMembers: z.number(),
  coveredMembers: z.number(),
  uncoveredHighValue: z.array(z.string()).max(20),
});

export const hubCurationSubmitSchema = z.object({
  hubs: z.array(hubCurationDecisionSchema).max(30),
  coverage: hubCurationCoverageSchema,
  confidence: z.number().min(0).max(1),
  should_stop: z.boolean(),
});

export type HubCurationDecision = z.infer<typeof hubCurationDecisionSchema>;
export type HubCurationSubmit = z.infer<typeof hubCurationSubmitSchema>;
```

新文件 `src/core/schemas/agents/hubMaterialization.ts`：

```ts
export const hubDraftSchema = z.object({
  title: z.string(),
  summary: z.string(),        // 1-2 paragraphs, plain markdown
  coreConceptSection: z.string(),
  structureSection: z.string(),   // 主脉络 / 分支关系
  evolutionSection: z.string(),   // 时间演化 / 里程碑
  openQuestionsSection: z.string(),
  entryPointsSection: z.string(), // 建议入口
  referencedMemberIds: z.array(z.string()).max(60), // 用于 self-critique 核对
});

export const hubCritiqueSchema = z.object({
  retryDraft: z.boolean(),
  gaps: z.array(z.object({
    memberId: z.string(),
    kind: z.enum(['missing-reference', 'missing-quote', 'missing-role']),
    hint: z.string(),
  })).max(15),
  overallCoverage: z.number().min(0).max(1),
});
```

## Component 3 · 5 份新模板

注册到 `TemplateRegistry`（`IndexingTemplateId` + `PromptId`）：

| id | 路径 | 类型 |
|---|---|---|
| `PromptId.HubCurationPlan` | `templates/prompts/hub-curation-plan.md` | System prompt for Curator plan step |
| `PromptId.HubCurationSubmit` | `templates/prompts/hub-curation-submit.md` | Structured-output prompt for submit step |
| `PromptId.HubMaterializationDraft` | `templates/prompts/hub-materialization-draft.md` | System prompt for Materializer draft |
| `PromptId.HubMaterializationCritique` | `templates/prompts/hub-materialization-critique.md` | System prompt for critique subagent |
| `IndexingTemplateId.HubDocSkeleton` | `templates/indexing/hub-doc-skeleton.md` | Handlebars skeleton written to vault |

### 3.1 `hub-doc-skeleton.md`（输出结构）

```handlebars
---
title: "{{title}}"
type: hub_doc
peak_user_owned: false
peak_hub_node_id: "{{nodeId}}"
peak_hub_generated_at: "{{generatedAtIso}}"
peak_hub_plan_id: "{{planId}}"
---

# {{title}}

{{summary}}

## 核心概念
{{coreConceptSection}}

## 结构脉络
{{structureSection}}

## 演化时间线
{{evolutionSection}}

## 未解问题
{{openQuestionsSection}}

## 入口
{{entryPointsSection}}

<!-- USER_SECTIONS_BELOW -->
{{userPreservedContent}}
```

`<!-- USER_SECTIONS_BELOW -->` marker 之下是用户手写区，Materializer 每次都保留。

## Component 4 · `HubCuratorAgent`

### 4.1 文件布局

复刻 `KnowledgeIntuitionAgent` 的三段式：

```
src/service/agents/
├── HubCuratorAgent.ts                  — 入口 class（构造 + streamRun）
└── hub-curation-helper/
    ├── hubCurationPrep.ts              — SQL prep：候选 + community_metadata + 现有 hubs → world snapshot markdown
    ├── hubCurationRecon.ts             — recon loop
    ├── hubCurationMemory.ts            — 增量合并 submit 结果到 memory
    └── types.ts                        — HubCurationPrepContext, HubCurationMemory
```

### 4.2 Prep

`hubCurationPrep.ts` 输出：

```ts
export interface HubCurationPrepContext {
  vaultName: string;
  currentDateLabel: string;
  candidates: Array<{  // SQL top-K, sorted by hub_graph_score DESC
    nodeId: string;
    path: string;
    hubGraphScore: number;
    hubPhysicalAuthorityScore: number;
    hubOrganizationalScore: number;
    hubSemanticCentralityScore: number;
    communityId: string | null;
  }>;
  communityMeta: Array<{
    communityId: string;
    memberCount: number;
    modularityContribution: number;
    representativeNodeIds: string[];  // top 3 by pagerank in community
  }>;
  existingHubs: Array<{
    nodeId: string;
    path: string;
    lastGeneratedAt: number;
    isStale: boolean;
    userOwned: boolean;
  }>;
  worldSnapshotMarkdown: string;  // rendered from templates/indexing/hub-curation-world-snapshot.md
  budget: {
    maxIterations: number;
    candidateLimit: number;
  };
}
```

**Prep-K**（候选数量）：

```
K = clamp(
  ceil(sqrt(documentNodeCount) * 1.5),
  min = 12,
  max = 60
)
```

例如 300 doc → K=26；3000 doc → K=82，被 clamp 到 60。

### 4.3 Recon loop

复刻 `intuition.recon.ts` 的 plan → submit → memory-merge 结构，替换：

| 层 | intuition | hub curator |
|---|---|---|
| system prompt | `PromptId.KnowledgeIntuitionPlan` | `PromptId.HubCurationPlan` |
| submit schema | `knowledgeIntuitionSubmitSchema` | `hubCurationSubmitSchema` |
| tools | 6 个 graph-inspector tool | **同一套 6 个 tool** — 无需新加 |
| stop | `should_stop` 或 iter 上限 | 同 |

**关键差异**：submit 里 `coverage.uncoveredHighValue: string[]` 让 LLM 明确点出"我知道有 X/Y/Z 这些高分节点还没进任何 hub 的覆盖范围"，下一轮 plan 有针对性 explore。

### 4.4 Budget

```
maxIterations = clamp(
  ceil(log2(K)),   // K = candidateLimit
  min = 1,
  max = 4
)
```

K=26 → 5 → clamp=4；K=12 → 4 → clamp=4；K=60 → 6 → clamp=4。实际上大 vault 直接吃满 4 iter，小 vault 也一样。

### 4.5 输出

```ts
async streamRun(options): AsyncGenerator<LLMStreamEvent, HubCurationPlanRow>
```

Curator finish 时：
1. 组装 `HubCurationPlanRow`
2. `HubCurationPlanRepo.insert(row)`
3. `HubCurationPlanRepo.pruneOlderThan(20)`
4. return row（executor 层立即读它派发）

## Component 5 · `HubCurationExecutor`

新文件 `src/service/agents/hub-curation-helper/HubCurationExecutor.ts`：

```ts
export interface HubCurationExecutorDeps {
  materializationAgent: HubMaterializationAgent;
  hubConstituentRepo: HubConstituentRepo;
  mobiusNodeRepo: MobiusNodeRepo;
  planRepo: HubCurationPlanRepo;
  vaultWritePort: VaultHubDocWritePort;
  archivePort: VaultHubArchivePort;
}

export class HubCurationExecutor {
  async execute(plan: HubCurationPlanRow, deps: HubCurationExecutorDeps): Promise<HubCurationExecutorResult>;
}
```

`execute` 遍历 `plan.decisions`：

| action | 行为 |
|---|---|
| `create` | 分派给 `HubMaterializationAgent.streamRun(decision)` |
| `keep` + `hub_stale_since != null` | 同 create |
| `keep` + `hub_stale_since == null` | no-op（记录 skipped） |
| `merge` | `mergeHubs(decision.mergeSourceHubs, decision.hubPath)`，然后分派 Materializer |
| `retire` | `archivePort.archive(oldPath)` → 移到 `_archive/hub/<orig-path>` |

**merge 冲突处理**：如果 `mergeSourceHubs` 中任意一个的现有文件 `peak_user_owned=true`，**中止 merge**，记 `executor_error = 'merge blocked: user-owned source'`，跳过该 decision，其余继续。这是为了不静默丢失用户手写内容。

## Component 6 · `HubMaterializationAgent`

### 6.1 文件布局

```
src/service/agents/
├── HubMaterializationAgent.ts
└── hub-materialization-helper/
    ├── hubMaterializationPrep.ts
    ├── hubMaterializationRecon.ts     — draft → critique loop
    └── types.ts
```

### 6.2 Prep

```ts
export interface HubMaterializationPrepContext {
  hubNodeId: string;
  hubPath: string;
  planId: string;
  members: Array<{
    nodeId: string;
    path: string;
    title: string;
    pagerank: number;
    betweenness: number;
    excerpt: string;  // 首 400 字符
    tags: string[];
    role: 'core' | 'fringe';  // top-K by (0.6*pagerank + 0.4*betweenness) → core
  }>;
  aggregatedTags: Array<{ tag: string; count: number }>;
  aggregatedSemanticKeywords: string[];  // top-10 semantic centroid tokens
  existingUserContent: string | null;    // 从现有文件 <!-- USER_SECTIONS_BELOW --> 之下抽出
  isUserOwned: boolean;                  // 若 true, 直接抛错跳过
  skeletonMarkdown: string;              // 已 render 好的 hub-doc-skeleton 骨架
  budget: {
    maxCritiqueIterations: number;       // 默认 2
  };
}
```

**Core / fringe 划分**：

```
coreCount = clamp(
  ceil(sqrt(memberCount)),
  min = 3,
  max = 12
)
```

30 成员 → 6 core；100 成员 → 10 core（clamp）。

### 6.3 Draft → Critique loop

```
iter = 1
draft = null
while iter <= budget.maxCritiqueIterations:
  draft = queryStructured({
    promptId: HubMaterializationDraft,
    schema: hubDraftSchema,
    variables: { prep, previousGaps: iter > 1 ? critique.gaps : [] },
  })
  critique = queryStructured({
    promptId: HubMaterializationCritique,
    schema: hubCritiqueSchema,
    variables: { prep, draft, tools: [localSearchWholeVaultTool, inspectNoteContextTool] },
    isSubAgent: true,     // 走 SubAgentDispatcher，独立 budget
  })
  if !critique.retryDraft: break
  iter += 1
return { draft, critique }
```

Critique 用 subagent 是为了：（1）独立 token 预算不吃 draft 的头；（2）critique 显式用工具核实"draft 里说的 X 是否真的在 vault 里"，避免只做 self-consistency check。

### 6.4 Finalize（vault write）

```ts
async finalize(draft, critique, prep, ports): Promise<void> {
  if (prep.isUserOwned) {
    log('user-owned, skipped'); return;
  }
  const markdown = renderHubDocFromDraft({
    draft,
    skeletonId: IndexingTemplateId.HubDocSkeleton,
    userPreservedContent: prep.existingUserContent ?? '',
    frontmatter: {
      title: draft.title,
      type: 'hub_doc',
      peak_user_owned: false,
      peak_hub_node_id: prep.hubNodeId,
      peak_hub_generated_at: new Date().toISOString(),
      peak_hub_plan_id: prep.planId,
      peak_hub_coverage: critique.overallCoverage,
    },
  });
  await ports.vaultWritePort.writeHubDoc(prep.hubPath, markdown);
  await ports.mobiusNodeRepo.clearHubStale(prep.hubNodeId);
}
```

## Component 7 · 新 Port + Adapter

### 7.1 `VaultHubDocWritePort`

`src/core/ports/VaultHubDocPorts.ts`：

```ts
export interface VaultHubDocWritePort {
  /** Read existing file; return null if not present. Returns raw markdown incl. frontmatter. */
  read(path: string): Promise<string | null>;

  /** Parse frontmatter to check user-owned flag. */
  readPeakUserOwned(path: string): Promise<boolean>;

  /** Extract content below <!-- USER_SECTIONS_BELOW --> marker (empty string if marker absent). */
  extractUserPreservedContent(path: string): Promise<string>;

  /** Write markdown to path (create dirs as needed). Overwrites existing. */
  writeHubDoc(path: string, markdown: string): Promise<void>;
}

export interface VaultHubArchivePort {
  /** Move `srcPath` under `_archive/hub/<sanitized-orig-path>`. Preserves file content. */
  archive(srcPath: string): Promise<string>;  // returns new archive path
}
```

### 7.2 Adapter

`src/app/hub/ObsidianVaultHubDocAdapter.ts` — 用 Obsidian `Vault` API 实现两个 port。放在 `app/hub/` 而不是 `app/lint/` 是因为 hub 已经是独立的产品概念。

Composition point：`main.ts` 或新 `HubGenerationRuntime` (owned by `AppContext`)：

```ts
const vaultHubDocPort = new ObsidianVaultHubDocAdapter(app.vault);
const vaultHubArchivePort = new ObsidianVaultHubArchiveAdapter(app.vault);

const hubMaterializationAgent = new HubMaterializationAgent(
  aiServiceManager,
  { app, vault: app.vault, pluginId, ... },
  { vaultWritePort: vaultHubDocPort },
);

const hubCurator = new HubCuratorAgent(
  aiServiceManager,
  { app, vault: app.vault, pluginId, ... },
);

const hubCurationExecutor = new HubCurationExecutor({
  materializationAgent: hubMaterializationAgent,
  hubConstituentRepo,
  mobiusNodeRepo,
  planRepo: hubCurationPlanRepo,
  vaultWritePort: vaultHubDocPort,
  archivePort: vaultHubArchivePort,
});
```

## Component 8 · Rewire 现有 stub / placeholder

### 8.1 `HubDocService.regenerateHubByNodeId`

改造为 thin adapter：

```ts
export class HubDocService {
  constructor(
    private readonly searchSettings: SearchSettings,
    private readonly materializationAgent: HubMaterializationAgent,
    private readonly planRepo: HubCurationPlanRepo,
  ) {}

  async regenerateHubByNodeId(hubNodeId: string, hubPath: string): Promise<void> {
    // Find the latest plan that mentioned this hub; if none, use synthesized single-hub decision
    // (single-hub fallback lets stale-triggered regen work even without a recent curator run).
    const decision = await this.findDecisionForNode(hubNodeId, hubPath);
    const stream = this.materializationAgent.streamRun({ decision });
    // consume to completion; errors bubble up so HubRegenService can mark retry
    for await (const _ of stream) { /* drain */ }
  }
}
```

**Single-hub fallback**：`findDecisionForNode` 找不到 plan 时，用 SQL 排出该 node 的社区成员并合成一个 `action='keep'` 决策。这样 stale-triggered regen 不必等 Curator 跑完就能自愈。

### 8.2 `CascadeWorker.hub_regen`

从 `case 'hub_regen': return;` 改成：

```ts
case 'hub_regen': {
  const queueRow = await this.hubConstituentRepo.dequeuePendingRegen();
  if (!queueRow) return;
  try {
    await HubDocService.regenerateSingleHub(
      queueRow.hub_node_id,
      queueRow.hub_path,
      this.searchSettings,
    );
    await this.hubConstituentRepo.markCompleted(queueRow.id);
  } catch (err) {
    await this.hubConstituentRepo.markFailed(queueRow.id, String(err));
  }
  return;
}
```

`HubDocService.regenerateSingleHub` 已经存在（`hubDocServices.ts:29-36`），只需注入 materializationAgent + planRepo。

## Component 9 · Commands

新增 3 个 `PeakCommandActions` 命令：

| Command id | Label | Action |
|---|---|---|
| `peak-hub-curate-now` | Curate Hubs Now | 手动跑 `HubCuratorAgent.streamRun({ trigger: 'manual' })` → 完了自动执行 Executor |
| `peak-hub-materialize-current-community` | Materialize Hub for Active Community | 从 activeFile 的 `community_id` 找社区代表节点，跑 Materializer（跳过 Curator）|
| `peak-hub-show-latest-plan` | Show Latest Hub Curation Plan | 打开 `HubCurationPlanRepo.listRecent(1)[0]` 的 debug view |

## Component 10 · 定时 trigger

`src/service/hub/HubCurationScheduler.ts`：

```ts
export class HubCurationScheduler {
  constructor(
    private readonly curator: HubCuratorAgent,
    private readonly executor: HubCurationExecutor,
    private readonly settings: SearchSettings,
  ) {}

  init(): void {
    if (!this.settings.hubCurationSchedulerEnabled) return;
    const intervalMs = (this.settings.hubCurationIntervalDays ?? 7) * 24 * 3600 * 1000;
    this.timer = setInterval(() => this.run('scheduled'), intervalMs);
  }

  async run(trigger: 'manual' | 'scheduled'): Promise<void>;
}
```

`SearchSettings` 新增两个字段：

- `hubCurationSchedulerEnabled: boolean` — 默认 `false`（用户 opt-in）
- `hubCurationIntervalDays: number` — 默认 `7`

## RunEnvelope 集成

两个 agent 都用 `runHarnessAgent` wrapper（`src/service/agents/harness/HarnessAgentRun.ts`）：

| capability id | source |
|---|---|
| `hub.curation.plan` | HubCuratorAgent |
| `hub.curation.execute` | HubCurationExecutor |
| `hub.materialization.run` | HubMaterializationAgent |

Artifact refs：

- Curator finish → `{ kind: 'hub-curation-plan', planId }`
- Materializer finish → `{ kind: 'hub-doc-written', hubPath, coverage }`
- Executor per-decision → `{ kind: 'hub-decision-processed', nodeId, action, outcome }`

## 验证策略

### 单测

| 测试文件 | 覆盖 |
|---|---|
| `test/hub-curation-plan-repo.test.ts` | insert / getById / listRecent / pruneOlderThan |
| `test/hub-curation-prep.test.ts` | Prep-K 公式、community meta 汇总、existing hubs snapshot |
| `test/hub-materialization-prep.test.ts` | core/fringe 划分公式、userPreservedContent 抽取 |
| `test/hub-curation-executor.test.ts` | 各 action 分派、merge 冲突拦截、retire 归档 |
| `test/hub-doc-skeleton-render.test.ts` | Handlebars skeleton + userPreserved 拼接、frontmatter 序列化 |

**LLM 层单测**：mock `AIServiceManager.queryStructured` 返回固定 payload，验证 agent 编排逻辑（不测 prompt 质量本身）。

### 集成 smoke

`docs/recurring-pitfalls.md` 记录，观察点：

- Curator 跑完后 `hub_curation_plan` 有一行
- Executor 分派后每个 create/keep-stale 产生一份 vault 文件
- 文件带正确 frontmatter（`peak_hub_node_id`, `peak_hub_plan_id`）
- `peak_user_owned=true` 的文件从不被覆盖

## Phase 顺序

按"能独立交付一段价值"划分（不是工时安排）：

**Phase 1 · Materializer MVP**
- Zod schemas（`hubDraftSchema` + `hubCritiqueSchema`）
- 2 份 prompt 模板 + 1 份 skeleton
- `VaultHubDocWritePort` + Obsidian adapter
- `HubMaterializationAgent`（单次 draft，无 critique loop）
- `HubDocService.regenerateHubByNodeId` 改成调 agent（带 single-hub fallback）
- `CascadeWorker.hub_regen` handler 补 body
- **能落地**：手动触发 "Refresh Hub Summaries" 命令能生成一份 hub 综述

**Phase 2 · Materializer critique loop**
- `hubMaterializationRecon.ts` 加 draft → critique 循环
- SubAgent 走 `SubAgentDispatcher`，独立 budget
- Critique tool 调用 `localSearchWholeVaultTool` + `inspectNoteContextTool`

**Phase 3 · Curator MVP**
- `hub_curation_plan` 表 + migration
- `HubCurationPlanRepo`
- Zod schemas（`hubCurationSubmitSchema`）
- 2 份 curator prompt 模板 + 1 份 world snapshot 模板
- `HubCuratorAgent` + `hubCurationPrep` + `hubCurationRecon`
- Command "Curate Hubs Now"
- **能落地**：命令跑完后 plan 写入表，可用命令 "Show Latest Hub Curation Plan" 看决策

**Phase 4 · Executor + 定时 trigger + Archive**
- `HubCurationExecutor` 遍历 plan.decisions
- `VaultHubArchivePort` + adapter（`_archive/hub/` 归档）
- `mergeHubs()` helper + user-owned 冲突拦截
- `HubCurationScheduler`
- SearchSettings 新增 2 字段
- **能落地**：curator 决策自动分派给 materializer；merge/retire 落地；用户可 opt-in 定时

**Phase 5 · UI 面板**
- Lint panel 里加 "Hub Curation" tab
- 展示最近 plan 的 coverage / confidence / 每 decision 状态
- 允许用户 "Approve" 或 "Undo" 单个 decision

## Open Questions（承接自 research §7）

留 spec 后决策，不阻塞 Phase 1：

1. **Curator 触发频率默认值**：建议 opt-in + 手动，先观察 3 个月再决定默认开
2. **Retire 是否物理删除**：建议 archive 到 `_archive/hub/`，永不 delete（避免用户手改被吞）
3. **Merge 时的 user-owned 冲突**：本 spec 已定 → 拦截整个 merge，其余继续，记 `executor_error`
4. **Multi-language vault**：不做特殊处理，观察 3 次 curation 后 review
5. **成本上限**：由 harness budget 层管，不再单独加一层

## Acceptance Criteria

### Phase 1

- [ ] `HubMaterializationAgent` 存在并跑通单次 draft
- [ ] `HubDocService.regenerateHubByNodeId` 不再输出 warning，实际写文件
- [ ] `CascadeWorker.hub_regen` handler 处理 queue 项
- [ ] `peak_user_owned=true` 文件不被覆盖（单测 + 手工验证）
- [ ] 生成的 markdown 带完整 frontmatter
- [ ] `npm run test` + `npm run build` 绿

### Phase 2

- [ ] Materializer 有 draft → critique 循环
- [ ] Critique 用 subagent + 工具核实
- [ ] Critique 返回 `retryDraft=true` 时会重新 draft
- [ ] budget 上限有效（不会无限循环）

### Phase 3

- [ ] `hub_curation_plan` 表存在并可写
- [ ] "Curate Hubs Now" 命令跑完后表里有一行
- [ ] Plan 里 `total_hubs > 0`，`coverage_pct > 0`
- [ ] "Show Latest Hub Curation Plan" 命令能打开 debug view

### Phase 4

- [ ] Executor 遍历所有 decision 并分派
- [ ] Retire decision 把文件移到 `_archive/hub/`
- [ ] Merge decision 若含 user-owned 源 → 拦截并 log
- [ ] Scheduler opt-in 后按周期跑

### Phase 5

- [ ] Lint panel 有 Hub Curation tab
- [ ] Tab 显示最近 plan
- [ ] Approve / Undo 单 decision 可用

## Dependencies

无阻塞前置。所有依赖组件已 landed：

- Wave 1 (RunEnvelope) ✅ — 提供 `runHarnessAgent`
- Wave 2 (Lint Detector) ✅ — 提供 port 模式参考
- Wave 3 (UI store) ✅ — 提供 RunEnvelopeStore feature scope 模式
- `KnowledgeIntuitionAgent` ✅ — 提供架子

## Follow-ups (not this spec)

- Hub curation 结果的自然语言 diff（"上次 vs 这次"）
- 用户对 hub 的 pin / hide / archive 操作与 curation 决策的联动
- Hub 综述里嵌入 mermaid 结构图（依赖 D3.mermaid）
- 多模态 hub 封面图（依赖 D4）
