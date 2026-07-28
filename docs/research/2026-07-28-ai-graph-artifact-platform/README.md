# AI Graph Artifact Platform：现状审计与外部研究

日期：2026-07-28  
状态：**Source-first research / design input**  
生产状态：**Current AI Graph exists, target platform is not implemented**  
配套方案：[正式设计](../../superpowers/specs/2026-07-28-ai-graph-artifact-platform.md) · [可交互产品原型](../../gstack/ai-graph-artifact-platform-2026-07-28/index.html) · [Roadmap](../../roadmap.html)

## 1. 结论先行

Peak 当前的 `AI Graph` 不是一个独立、可持续演进的 graph artifact。它是 AI Analysis 的一个运行模式：先从 Vault 搜出文件，再把本地 link / semantic edge 转成 `LensGraphData`，最后把图 JSON 嵌进 analysis snapshot。

下一版需要把它升级为一等 artifact：

- 一张图拥有稳定 `graphId`、不可变版本、标题、状态和来源。
- 节点不再只等于 Vault 文件；概念、词汇、人物、组织、事件、主张和网页都可以成为节点。
- 关系不是一条无出处的 AI 结论；每条关系保存 qualifier、evidence、confidence、生成方式和 review 状态。
- Vault、Web、用户粘贴文本和已有 Graph 都是 source。
- AI Analysis、Composer / File Atlas、Vault Search 和 Chat 看到的是同一个 Graph Library，不是各自的临时 store。
- JSON artifact 是事实源，SQLite 是可重建索引，Markdown 只用于用户显式导出。

这不是“给现有 `LensGraphData.path` 加几个 optional 字段”。现有类型把 node identity、Vault path 和 renderer data 混在一起，必须新增独立 domain contract，再由 adapter 投影到各 renderer。

## 2. 当前生产事实

### 2.1 入口与运行链路

| 位置 | 当前行为 | 证据 |
| --- | --- | --- |
| AI Analysis preset | `vaultFull` 与 `aiGraph` 两种模式；desktop 才显示 AI Graph | `src/ui/view/quick-search/SearchModal.tsx` |
| AI Graph run | 搜索 Vault `topK: 30`，再构建 graph | `src/service/agents/AIGraphAgent.ts` |
| 基础关系 | `buildSourcesGraphWithDiscoveredEdges` 产生 wikilink / semantic edge | `src/service/agents/ai-graph/build-graph-data.ts` |
| 真正 LLM 推断 | 目前集中在按需生成 Thinking Tree；基础 topology 并不做 entity / relation extraction | `src/service/agents/ai-graph/infer-thinking-tree.ts` |
| 显示 | `MultiLensGraph` 用 React Flow 显示 Topology / Thinking Tree / Bridges / Timeline / Gaps | `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` |
| Search inspector | 只找最近 20 条 analysis 中 query 关键词重叠的一个 AI Graph | `src/service/AIAnalysisHistoryService.ts` |
| Composer / File Atlas | 当前只有 deterministic local / two-hop neighborhood graph | `src/ui/view/file-atlas/components/FileAtlasGraph.tsx` |

因此，当前命名会造成误解：

- `AI Graph` 的入口存在。
- graph 基础数据主要仍是文件关系。
- “词汇之间、主张之间、Web 实体之间的 AI 关系”没有进入 domain model。

### 2.2 当前保存确实存在，但不是独立持久化

AI Analysis 自动保存已经从 Markdown 迁到：

```text
<AI root>/DataStore/ai-analysis/<timestamp-title>.json
```

`CompletedAnalysisSnapshot.v2GraphJson` 会保存 graph JSON，历史表 `ai_analysis_record` 保存列表 metadata。恢复 history 时，graph JSON 会重新灌回 `useGraphAgentStore` 和 `useAIGraphStore`。

现有缺口：

- graph 没有稳定 `graphId`；
- 没有 graph version；
- graph 生命周期绑定 analysis record；
- `v2GraphJson` 是字符串，不是 schema-versioned artifact ref；
- `graph_nodes_count` / `graph_edges_count` 在新保存链路中固定写成 `0`；
- Recent UI 混合显示 report 与 graph，没有 All AI Graphs；
- `findRelatedAIGraph` 只在最近 20 条里做简单 query token overlap；
- `useAIGraphStore` 仍是页面运行状态，不是可共享 repository；
- “Save Graph to Vault” 会额外生成嵌 JSON 的 Markdown，属于 export，不应成为 canonical persistence。

### 2.3 当前 schema 是 file graph

`LensNodeData` 的核心字段是 `path`，`GraphOutput` 的 node identity 也使用 Vault path。当前 edge enum 主要描述文件之间的关系：

- `link`；
- `semantic`；
- `derives`；
- `temporal`；
- `cross-domain`；
- `builds_on`；
- `contrasts`；
- `complements`；
- `applies`；
- `references`。

它无法自然表达：

- “GraphRAG”是一个概念；
- “GraphRAG”比“RAG”更具体；
- 某篇网页定义了一个术语；
- 某个主张支持或反驳另一个主张；
- 某关系只在某段时间、地区或条件下成立；
- 同一个人、产品或术语在多个网页和 Vault 笔记中出现。

## 3. 外部研究

### 3.1 RDF：关系是 assertion，不是画布连线

[W3C RDF 1.2 Concepts](https://www.w3.org/TR/rdf12-concepts/) 把知识表达为 subject–predicate–object triple，并用 named graph 组织多组 graph。RDF 1.2 还允许 triple term，使“对一条关系再附加信息”成为一等表达。

对 Peak 的启发：

- edge 应被建模成可引用的 relationship assertion；
- graph version 是 assertion 集合的一个命名快照；
- relation 需要自己的 ID，不能只靠 source / target 拼出一条 UI edge。

本方案不要求 Peak 实现 RDF、SPARQL 或 JSON-LD runtime。采用的是同样的 assertion 思路，以及更适合 TypeScript / local JSON 的 property-graph serialization。

### 3.2 SKOS：词汇关系至少要区分层级与关联

[W3C SKOS Reference](https://www.w3.org/TR/skos-reference/) 明确区分：

- `broader` / `narrower`：直接上下位概念；
- `related`：非层级的语义关联；
- transitive closure：由系统推导，不作为用户直接断言。

对 Peak 的启发：

- Concept / Glossary Graph 需要 first-class `concept` node；
- “更广 / 更窄 / 相关 / 定义 / 别名”不能都压成 `semantic`；
- direct edge 与推导关系要视觉和数据分离。

[Schema.org DefinedTerm](https://schema.org/DefinedTerm) 也将 word、name、acronym、phrase 视为可拥有 definition、term code 和 term set 的对象，支持词汇节点不依赖任何文件存在。

### 3.3 Wikidata：关系需要 qualifier、reference 和 rank

[Wikidata Data Model](https://www.wikidata.org/wiki/Help:Data_model) 的 statement 由 subject、property、value 构成，并可带 qualifier、reference 与 rank。例如 `employer` 关系可被 `start time` / `end time` 限定。

对 Peak 的启发：

- “A causes B”不能只有 label；可能需要 time、scope、condition 等 qualifiers；
- Web relation 必须保存 reference；
- 冲突来源可以并存，通过 confidence / review status 表达，不应该静默合并成唯一真相。

### 3.4 W3C Web Annotation：证据要指向原文片段

[Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) 定义了 URL / resource target，以及 Text Quote、Text Position、Fragment、Time State 等 selector。它还考虑网页会变化，需要记录用于恢复当时表示的 state。

对 Peak 的启发：

- Vault evidence 保存 file path、content hash、heading/block/line selector 和 exact quote；
- Web evidence 保存 canonical URL、fetchedAt、content hash 和 exact quote；
- 只保存最小必要证据片段，不默认复制整篇网页；
- source 变化后标记 `stale`，刷新产生新 graph version，不原地篡改旧版本。

### 3.5 PROV：生成关系也需要来源

[W3C PROV-O](https://www.w3.org/TR/prov-o/) 以 Entity、Activity、Agent 表达来源与生成过程，并允许按领域裁剪。

对 Peak 的启发：

- graph version 指向生成它的 run；
- relation 记录由哪个 model / tool / import 产生；
- user edit、AI extraction、deterministic link 和 external import 必须可区分；
- 不需要把完整 PROV ontology 引入运行时，只需保留最小 provenance fields。

### 3.6 GraphRAG：entity / relationship / claim 必须回到 text unit

[Microsoft GraphRAG Overview](https://microsoft.github.io/graphrag/index/overview/) 的标准 pipeline 从 unstructured text 抽取 entities、relationships 与 optional claims，再做 community detection / summary。其 [outputs](https://microsoft.github.io/graphrag/index/outputs/) 将 entity / relationship 映射回 `text_unit_ids`。

这证明 graph 与 source text 不能分离。对 Peak 最有价值的不是“换成 GraphRAG 框架”，而是三点：

- source unit 是 extraction 的最小证据单元；
- entity resolution 是独立阶段；
- graph 是可以被本地 / 全局 query 复用的结构化 artifact。

[GraphRAG 方法说明](https://microsoft.github.io/graphrag/index/methods/) 同时指出高质量 entity / relationship extraction 成本显著高于 noun-phrase co-occurrence。Peak 必须在 run 前显示来源数量、Web 开关与成本级别，不应在打开 Graph 时自动全量重建。

### 3.7 Schema-guided 与自由探索应并存

[Neo4j GraphRAG KG Builder](https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_kg_builder.html) 支持：

- 指定 node / relationship types 和允许的连接 pattern；
- 自动抽取 schema；
- free-form extraction；
- entity resolution；
- lexical graph；
- JSON writer 等非 Neo4j writer。

对 Peak 的启发：

- Guided template 适合 Concept、Evidence、Causal、Timeline 等明确任务；
- Free Explore 允许模型提出 custom type，但必须归入可显示的 relation family；
- entity resolution 必须能显示 merge 依据，并允许用户拆分；
- 不需要因此引入 Neo4j，当前规模可先用 JSON artifact + SQLite projection。

## 4. 设计判决

### 4.1 采用

- 一等 `AIGraphArtifact` + immutable versions。
- typed heterogeneous nodes。
- relationship assertion + qualifiers + evidence + confidence。
- Vault / Web / manual / graph source。
- schema-guided presets + free explore。
- All AI Graphs Library。
- app-owned shared capability runtime。
- JSON canonical artifact + SQLite rebuildable projection。

### 4.2 不采用

- 不把 `LensGraphData` 继续扩成 domain database。
- 不把 Markdown graph note 作为事实源。
- 不让 search result snippet 单独成为 relationship evidence。
- 不默认保存完整网页。
- 不因“知识图谱”名义直接引入 Neo4j / RDF store。
- 不把 local / two-hop deterministic neighborhood graph 政名为 AI Graph。
- 不让 Composer、AI Analysis、Search 各建一套 graph agent 和 history。

## 5. 实现前必须验证

| 验证项 | 要回答的问题 | 通过标准 |
| --- | --- | --- |
| Legacy replay | 现有 `v2GraphJson` 能否稳定迁移成 version 1？ | 至少 current graph nodes / edges / lens 可无损导入，无法映射字段显式记录 |
| Web evidence | Web tool 能否返回 canonical URL、正文片段与 fetchedAt，而不只返回 snippet？ | 每条 Web relation 至少一个可打开 evidence locator |
| Entity resolution | 中英别名、缩写、同名实体如何合并？ | merge 可解释、可撤销；不只按 lower-case label |
| Artifact scale | 单图 100 / 500 / 2,000 nodes 的 JSON、SQLite projection 和 renderer 成本 | Library 与 detail 不阻塞；超限自动分层或聚类 |
| Incremental update | 新增 source 后如何只重跑受影响部分？ | 新 version 可追踪 reused / added / removed assertions |
| Source drift | Vault rename、content change、网页更新后怎么显示？ | 不破坏旧 version；UI 明确 fresh / changed / unavailable |

## 6. 推荐阅读顺序

1. 先读本文 §1–4，确认为什么当前 AI Graph 不是目标 artifact。
2. 再读[正式设计](../../superpowers/specs/2026-07-28-ai-graph-artifact-platform.md)的 artifact schema、Graph Library 和 runtime boundary。
3. 最后打开[可交互产品原型](../../gstack/ai-graph-artifact-platform-2026-07-28/index.html)，实际操作三个关键 screen 与核心 workflow。
