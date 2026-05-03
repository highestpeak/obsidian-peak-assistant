# Personalized PageRank (PPR) Search Design

**Date:** 2026-05-01
**Status:** Draft
**Relates to:** S5 in `docs/progress.md`
**Academic basis:** HippoRAG (NeurIPS 2024), PPR Survey (arXiv 2403.05198)

---

## 1. Problem Statement

### 1.1 Global PageRank Is Query-Blind

The current search pipeline uses two global PageRank variants as **static** boosts in `Reranker.applyRankingBoosts()` (`src/service/search/query/reranker.ts:306`):

- **Vault PageRank** on the `references` subgraph — `computeVaultPageRankStreaming()` (`src/service/search/index/helper/documentPageRank.ts:28`)
- **Semantic PageRank** on the `semantic_related` subgraph — `computeSemanticPageRankStreaming()` (`src/service/search/index/helper/documentPageRank.ts:129`)

Both are precomputed during `IndexService` full rebuild and persisted as `mobius_node.pagerank` / `mobius_node.semantic_pagerank` columns. At search time, they influence ranking via hub-tier thresholds (`INDEX_HUB_TIER_THRESHOLDS` in `src/core/constant.ts:613`) which add a fixed additive boost (`INDEX_SEARCH_HUB_INCOMING_BOOST = 0.08`, `INDEX_SEARCH_SECONDARY_INCOMING_BOOST = 0.04`).

The fundamental limitation: **global PageRank ranks all documents identically regardless of the query**. A note with high global centrality (e.g., a frequently-linked MOC page) always gets boosted, even when the query is about a niche topic where that MOC is irrelevant.

### 1.2 PPR Advantage

Personalized PageRank (PPR) biases the random walk teleportation toward **query-relevant seed nodes** instead of distributing it uniformly. This produces a per-query ranking that naturally:

1. **Propagates relevance through graph structure** — a document not directly matching the query but strongly connected to matching documents gets elevated
2. **Captures associative memory** — mirrors how human memory retrieval works via spreading activation (HippoRAG's core insight)
3. **Handles the semantic collapse problem** — when 50+ similar notes cluster in embedding space (documented in DeepMind 2025, arXiv 2508.21038), graph structure disambiguates them by their connectivity patterns

<!-- 
  注：HippoRAG 论文证明 PPR 比纯向量 RAG 高 20%，比 GraphRAG/RAPTOR/LightRAG 快 6-13 倍。
  PPR Survey (2024) 证明在 <50K 节点的稀疏图上实时 PPR 完全可行。
-->

### 1.3 What We Already Have

The codebase provides the complete foundation for PPR:

| Component | Location | What it provides |
|-----------|----------|------------------|
| Global PageRank (reference) | `documentPageRank.ts:28` `computeVaultPageRankStreaming()` | Power iteration kernel with dangling-node redistribution |
| Global PageRank (semantic) | `documentPageRank.ts:129` `computeSemanticPageRankStreaming()` | Weighted power iteration on `semantic_related` edges |
| Semantic edges | `semanticRelatedEdges.ts` `SemanticRelatedEdgesRebuildService` | KNN-based doc-to-doc edges with similarity weights |
| Reference edges | `MobiusEdgeRepo.ts:510` `iterateReferenceEdgeBatches()` | Wiki link edges (`references`, `references_resource`) |
| Tag edges | `graph.po.ts:43` `GRAPH_TAGGED_EDGE_TYPES` | `tagged_topic`, `tagged_functional`, `tagged_keyword`, `tagged_context` |
| Graph storage | `mobius_node` + `mobius_edge` tables (DDL: `ddl.ts:556-608`) | Full adjacency with typed edges and weights |
| Reranker pipeline | `reranker.ts` `applyRankingBoosts()` | Additive boost infrastructure ready for PPR scores |
| Search pipeline | `queryService.ts:54` `textSearch()` | Tri-hybrid RRF merge (FTS5 + vector + meta) with reranker |
| Edge batch traversal | `MobiusEdgeRepo.ts:510,541` | Keyset-paginated async generators for full edge scans |

**Gap:** No query-time PPR algorithm. No mechanism to select seed nodes from search results. No PPR score integration into the reranker.

---

## 2. PPR Algorithm

### 2.1 Overview

PPR computes a stationary distribution of a biased random walk where, at each step, the walker either:
- Follows an outgoing edge from the current node (probability `1 - α`)
- **Teleports back to a seed node** (probability `α`)

Unlike global PageRank where teleportation is uniform over all nodes, PPR teleportation concentrates on query-relevant seed nodes.

### 2.2 Seed Selection

Seeds are the search results from the existing tri-hybrid pipeline (FTS5 + vector + meta), used **before** the reranker.

```
Input: Query Q, tri-hybrid search results R = [(doc_id, rrf_score), ...]
Seeds: Top-K documents from R, where K = min(|R|, PPR_SEED_K)
Seed weights: Normalized RRF scores → teleportation distribution
```

**Parameters:**
- `PPR_SEED_K = 10` — max seed count (top RRF results before reranking)
- Seed weight `s[i] = rrf_score[i] / Σ rrf_score[j]` — proportional to pre-rerank RRF score

<!-- 
  注：用 RRF 分数作为 seed 权重而非均匀分布，让高匹配度的种子获得更多 teleport 概率。
  这比 HippoRAG 的做法（LLM 抽取概念后匹配 KG 节点）简单得多，但对我们的场景够用——
  因为我们的图是文档级的，不是 KG entity 级。
-->

### 2.3 Graph Construction (PPR Subgraph)

PPR operates on a **multi-layer directed graph** combining three edge types:

| Layer | Edge type | Direction | Weight source |
|-------|-----------|-----------|---------------|
| Reference | `references` | A → B (A links to B) | 1.0 (unweighted) |
| Semantic | `semantic_related` | A → B | `mobius_edge.weight` (similarity) |
| Tag co-occurrence | `tagged_*` → shared tag | A → T → B (two hops via tag node) | 1 / sqrt(tag_doc_count) |

**Edge weight normalization per layer:**

For node `u` with outgoing edges in layer `l`:
```
w_normalized(u → v, l) = w_raw(u → v, l) / Σ_j w_raw(u → j, l)
```

Then the combined transition probability:
```
P(u → v) = λ_ref · w_normalized(u→v, ref) 
          + λ_sem · w_normalized(u→v, sem) 
          + λ_tag · w_normalized(u→v, tag)
```

**Layer weights:** `λ_ref = 0.4`, `λ_sem = 0.5`, `λ_tag = 0.1`

<!--
  注：语义边权重最高因为它们直接反映内容相似性。
  Reference 边次之因为它们反映用户的主动关联。
  Tag 共现权重最低因为容易有大量噪声（热门 tag 连接过多文档）。
  使用 1/sqrt(tag_doc_count) 衰减热门 tag 的影响（类似 IDF）。
-->

### 2.4 Sparse PPR via Local Push (Preferred Algorithm)

Full power iteration over all N nodes is wasteful for query-time PPR. We use the **Forward Push** algorithm (Andersen, Chung, Lang 2006) which only touches the reachable subgraph:

```
Algorithm: Forward-Push PPR

Input: 
  seed_distribution s[],  // sparse: only PPR_SEED_K entries
  teleport_alpha α,
  residual_threshold ε

State:
  estimate p[v] = 0 for all v    // PPR estimate
  residual r[v] = s[v] for all v  // initially = seed distribution

Push loop:
  while ∃ v with r[v] / out_degree(v) > ε:
    1. p[v] += α · r[v]
    2. for each neighbor u of v:
       r[u] += (1 - α) · r[v] · w(v→u) / Σ_j w(v→j)
    3. r[v] = 0

Output: p[] — sparse PPR scores
```

**Parameters:**
- `α = 0.15` (teleport probability; standard value, same as existing `DEFAULT_DAMPING = 0.85` inverted)
- `ε = 1e-6` (residual threshold per unit out-degree)
- Max iterations cap: `PPR_MAX_PUSH_OPS = 50_000` (safety bound)

**Why Forward Push over Power Iteration:**
1. **Sparse output** — only nodes reachable from seeds get non-zero scores; no full-graph scan
2. **Bounded work** — total work is O(1/ε) regardless of graph size, typically touching <1% of nodes for a 10K-node graph
3. **No convergence loop** — push operations are guaranteed to terminate when all residuals are below threshold
4. **Existing infrastructure** — `MobiusEdgeRepo.getByFromNodes()` already supports batch neighbor lookups needed for push steps

<!--
  注：Forward Push 是 PPR 的标准高效实现。不需要遍历整个图。
  对 50K 节点图，典型推送操作只会触及 200-500 个节点。
  HippoRAG 用的也是类似的局部 PPR 方法。
-->

### 2.5 Tag Co-occurrence Expansion

Tags bridge documents that share no direct links or semantic similarity. The tag layer is **virtual** — we don't create actual tag-to-tag edges. Instead, during push operations:

When pushing from node `u`:
1. Look up `u`'s tags via `MobiusEdgeRepo.getByFromNodesAndTypes([u], GRAPH_TAGGED_EDGE_TYPES)`
2. For each tag `T`, look up other documents linked to `T` via `MobiusEdgeRepo.getByToNodesAndTypes([T], GRAPH_TAGGED_EDGE_TYPES)` (reverse lookup)
3. Weight the virtual edge `u → v` (via shared tag `T`) as `1 / sqrt(tag_doc_count(T))`

This is computed lazily during push — no precomputation needed.

### 2.6 Convergence and Termination

The algorithm terminates when **all** of:
1. No residual exceeds `ε · out_degree(v)` (convergence)
2. OR total push operations exceed `PPR_MAX_PUSH_OPS` (safety)
3. OR wall-clock time exceeds `PPR_MAX_MS = 200` (latency budget)

On termination, any remaining residual is distributed uniformly to the estimate (`p[v] += r[v]` for all active `v`).

---

## 3. Integration into Search Pipeline

### 3.1 Current Pipeline Flow

```
Query → [FTS5, Vector KNN, Meta FTS5] → mergeContentSources() → mergeContentAndMetaWithRRF()
      → Reranker.rerank() → applyRankingBoosts() → [optional LLM rerank] → Results
```

### 3.2 Proposed Pipeline Flow

```
Query → [FTS5, Vector KNN, Meta FTS5] → mergeContentSources() → mergeContentAndMetaWithRRF()
      → ★ PPR computation (seeds = top RRF results) ★
      → Reranker.rerank() → applyRankingBoosts() (now includes PPR boost) → [optional LLM rerank] → Results
```

### 3.3 PPR Score Integration

PPR scores are injected as an **additional RRF source**, not as an additive boost. This prevents PPR from dominating or being dominated by other signals.

**Three-stage RRF merge (revised):**

```
Stage 1: Content RRF (unchanged)
  content_score = RRF(FTS5_rank, Vector_rank)

Stage 2: Content + Meta RRF (unchanged)  
  cm_score = RRF(content_rank, meta_rank)

Stage 3: CM + PPR RRF (new)
  final_pre_boost = RRF(cm_rank, ppr_rank)
  where:
    ppr_rank = rank of document by PPR score (descending)
    RRF weight for PPR: λ_ppr = 0.3
    RRF weight for CM: λ_cm = 0.7
```

**Implementation in `queryService.ts`:**

After `mergeContentAndMetaWithRRF()` returns `resultItems`, and before calling `this.reranker.rerank()`:

1. Extract seeds from `resultItems` (top `PPR_SEED_K` by RRF score)
2. Compute PPR via `PersonalizedPageRank.compute(seeds, tenant)`
3. Merge PPR-ranked results with `resultItems` via new `mergeWithPPR()` method
4. Pass merged results to reranker

**PPR result expansion:** PPR may surface documents **not** in the original RRF results (graph neighbors of seeds). These are included as new candidates with score derived purely from PPR rank. This is the key advantage — PPR discovers related documents that keyword/vector search missed.

<!--
  注：PPR 作为 RRF 的第四个信号源而非 additive boost，
  原因是 PPR 分数的 scale 与 RRF 分数完全不同（PPR 是概率分布，总和=1），
  直接加减会导致 scale 不匹配。RRF 的排名融合本质上是 scale-invariant 的。
  
  PPR 发现的新文档（不在原始搜索结果中）是功能的核心价值——
  这些是 "graph-discovered" 的结果，关键词和向量搜索都找不到它们。
-->

### 3.4 Reranker Boost Adjustment

`Reranker.applyRankingBoosts()` currently applies a static hub-tier boost based on global PageRank:

```typescript
// Current: reranker.ts:339-355
if (s.hubTier === 'hub') anchorBoost = hubBoostAmt;        // 0.08
else if (s.hubTier === 'secondary') anchorBoost = secBoostAmt; // 0.04
```

When PPR is enabled, this global PageRank boost should be **reduced** to avoid double-counting graph centrality:

```
When PPR is active:
  anchorBoost *= PPR_GLOBAL_PR_DAMPENING   // 0.3 — reduce but don't eliminate global PR
  
When PPR is NOT active (fallback):
  anchorBoost unchanged
```

The global PageRank boost is not eliminated entirely because it captures long-term vault-wide authority that PPR (being query-specific) may miss for tangentially-related hubs.

---

## 4. Performance

### 4.1 Feasibility Analysis for <50K Node Graphs

| Metric | Value | Basis |
|--------|-------|-------|
| Typical Obsidian vault | 1K-10K notes | Community surveys |
| Large vaults | 10K-50K notes | Power users |
| Edges per node (reference) | ~5-15 outgoing | Wikilink density |
| Edges per node (semantic) | ~12 outgoing | `SEMANTIC_VECTOR_TOP_K_PER_DOC = 12` |
| Total edges (10K vault) | ~170K | (5+12) × 10K |
| PPR seed count | 10 | `PPR_SEED_K` |
| Nodes touched by PPR | ~200-500 | Forward Push locality |
| Edge lookups during PPR | ~2K-6K | ~12 edges × 200-500 nodes |

**Estimated latency:**

| Vault size | Edge lookups | SQLite query time | Total PPR time |
|------------|-------------|-------------------|----------------|
| 1K notes | ~500 | ~2ms | ~5ms |
| 10K notes | ~3K | ~10ms | ~20ms |
| 50K notes | ~6K | ~25ms | ~50ms |

All within the `PPR_MAX_MS = 200ms` budget. The existing search pipeline takes 100-500ms total; PPR adds <50ms for typical vaults.

<!--
  注：Forward Push 的关键优势是工作量与图大小无关，只与 seed 数量和 ε 阈值有关。
  50K 节点图和 5K 节点图的 PPR 计算时间差异不大。
  SQLite 查询是主要瓶颈，但 getByFromNodes 的批量查询和 idx_mobius_edge_from_type 索引
  保证了 O(log N + batch_size) 的查询时间。
-->

### 4.2 Optimization Strategies

1. **Batch edge fetching** — Use `MobiusEdgeRepo.getByFromNodesAndTypes()` to fetch all outgoing edges for a batch of nodes in one SQL query (already supports this pattern)
2. **In-memory adjacency cache** — For the PPR computation, build a local adjacency map from fetched edges (avoid repeated SQL queries for the same node across iterations)
3. **Early termination** — Stop when top-K PPR results are stable (no rank changes in last N push ops)
4. **Degree pre-fetch** — `mobius_node.doc_outgoing_cnt` provides degree without loading edges; use for residual threshold calculation

### 4.3 Benchmark Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| PPR compute time (10K vault) | < 30ms | `Stopwatch` segment |
| PPR compute time (50K vault) | < 100ms | `Stopwatch` segment |
| Total search latency increase | < 20% | End-to-end `textSearch()` duration |
| Memory overhead | < 5MB | Sparse PPR vectors + adjacency cache |
| Nodes explored | < 1000 | Counter in PPR loop |

---

## 5. Incremental PPR

### 5.1 PPR Does Not Need Incremental Updates

Unlike global PageRank (which must be recomputed when the graph changes), **PPR is computed fresh at query time**. There is no stored PPR state to invalidate.

The PPR algorithm reads from the same `mobius_node` / `mobius_edge` tables that are already maintained by the existing indexing pipeline. When S3 (Cascading Relationship Updates) lands:

- Note modified → `indexDocument()` updates `mobius_node` + `mobius_edge`
- Semantic edges rebuilt → `SemanticRelatedEdgesRebuildService.rebuildForTenant()`
- Next PPR query automatically uses updated graph — no additional work needed

### 5.2 Relationship to S3 (Cascading Updates)

S3 introduces incremental updates to:
1. Semantic edges for modified documents and their neighbors
2. Hub summary invalidation when constituent notes change

PPR benefits from S3 automatically because it reads live edge data. The only consideration: **S3 may temporarily leave the graph in an inconsistent state** (semantic edges partially updated). PPR is robust to this because:
- Forward Push is a local algorithm — partial edge updates affect only the local neighborhood
- The RRF fusion with keyword/vector results provides redundancy
- Global PageRank (still used as a dampened boost) provides stability

### 5.3 Global PageRank Staleness

The existing global PageRank remains precomputed and may become stale between full rebuilds. This is acceptable because:
- Its influence is dampened when PPR is active (`PPR_GLOBAL_PR_DAMPENING = 0.3`)
- It serves as a prior for long-term vault structure, not query-time relevance
- S3 can trigger partial global PR recomputation for affected subgraphs (future extension)

---

## 6. Data Model

### 6.1 No Persistent PPR Cache

PPR results are **ephemeral** — computed per query, used once, discarded. Rationale:

1. **PPR is query-specific** — caching would require a query → PPR_scores mapping, which is unbounded
2. **Computation is fast** — <50ms for typical vaults (see Section 4)
3. **Graph changes invalidate any cache** — note edits, new links, re-indexing all change the graph
4. **Memory pressure** — Obsidian runs in Electron; persistent caches compete with the vault's own memory

### 6.2 Runtime Data Structures

```typescript
// 新增文件: src/service/search/query/personalizedPageRank.ts

/** PPR seed node with teleportation weight. */
type PPRSeed = { nodeId: string; weight: number };

/** PPR computation result. */
type PPRResult = {
  /** Sparse map: node_id → PPR score. Only nodes with score > 0 are included. */
  scores: Map<string, number>;
  /** Number of push operations performed. */
  pushOps: number;
  /** Number of unique nodes explored. */
  nodesExplored: number;
  /** Wall-clock computation time in ms. */
  elapsedMs: number;
  /** Whether computation was truncated by safety bounds. */
  truncated: boolean;
};

/** Configuration for PPR computation. */
type PPRConfig = {
  alpha: number;          // teleport probability (default 0.15)
  epsilon: number;        // residual threshold (default 1e-6)
  maxPushOps: number;     // safety cap (default 50_000)
  maxMs: number;          // time budget (default 200)
  seedK: number;          // max seeds (default 10)
  layerWeights: {
    reference: number;    // default 0.4
    semantic: number;     // default 0.5
    tag: number;          // default 0.1
  };
};
```

### 6.3 Adjacency Cache (Per-Query, In-Memory)

During PPR computation, an in-memory adjacency map is built incrementally as nodes are explored:

```typescript
/** 
 * Lazily-populated adjacency cache for PPR. 
 * Built during push operations; discarded after PPR completes.
 */
type AdjacencyCache = {
  /** node_id → [(neighbor_id, combined_weight)] */
  outEdges: Map<string, Array<{ to: string; weight: number }>>;
  /** node_id → out_degree (from mobius_node.doc_outgoing_cnt or computed) */
  outDegree: Map<string, number>;
};
```

This cache is populated lazily: only when a node's residual exceeds the push threshold do we fetch its edges from SQLite. Fetched edges are cached for the duration of the PPR computation (a node may be visited multiple times as residual accumulates from neighbors).

### 6.4 Constants Location

All PPR constants go to `src/core/constant.ts` per project convention:

```typescript
// PPR Search Configuration
export const PPR_ALPHA = 0.15;
export const PPR_EPSILON = 1e-6;
export const PPR_MAX_PUSH_OPS = 50_000;
export const PPR_MAX_MS = 200;
export const PPR_SEED_K = 10;
export const PPR_LAYER_WEIGHT_REFERENCE = 0.4;
export const PPR_LAYER_WEIGHT_SEMANTIC = 0.5;
export const PPR_LAYER_WEIGHT_TAG = 0.1;
export const PPR_RRF_WEIGHT = 0.3;
export const PPR_CM_RRF_WEIGHT = 0.7;
export const PPR_GLOBAL_PR_DAMPENING = 0.3;
export const PPR_MAX_EXPANSION_RESULTS = 20;  // max graph-discovered docs to add
```

---

## 7. A/B Testing

### 7.1 Feature Flag

PPR is gated behind a feature flag in `SearchSettings`:

```typescript
// In search settings (app/settings/types.ts)
interface SearchSettings {
  // ... existing fields
  chunking: {
    // ... existing fields
    enablePPR: boolean;  // default: true
  };
}
```

When `enablePPR = false`, the search pipeline skips PPR computation entirely and falls back to the current global-PageRank-only behavior.

### 7.2 Comparison Strategy

Since this is a single-user Obsidian plugin, traditional A/B testing (split traffic) is not applicable. Instead:

**Side-by-side comparison mode:**

1. Add a "Compare search modes" command (`Peak: Compare Search Results`)
2. For a given query, run both:
   - Current pipeline: FTS5 + Vector + Meta + Global PR boost
   - PPR pipeline: FTS5 + Vector + Meta + PPR + dampened Global PR boost
3. Display results side-by-side in a modal with:
   - Rank differences (↑↓ indicators)
   - PPR-discovered documents highlighted (not in original results)
   - PPR score visualization

**Automated quality metrics (logged per search):**

| Metric | Formula | What it measures |
|--------|---------|------------------|
| Rank displacement | `Σ |rank_ppr(d) - rank_baseline(d)|` for shared docs | How much PPR changes ordering |
| Discovery count | # docs in PPR results not in baseline | PPR's graph expansion value |
| Seed coverage | % of seeds in final top-10 | Whether PPR preserves high-quality keyword/vector matches |
| Computation overhead | `ppr_ms / total_search_ms` | Performance cost |

These metrics are logged via `Stopwatch` segments and optionally persisted to `mobius_operation` for long-term analysis.

### 7.3 Rollout Plan

1. **Phase 1:** PPR enabled, `PPR_RRF_WEIGHT = 0.15` (conservative) — PPR influences results but doesn't dominate
2. **Phase 2:** After manual validation, increase to `PPR_RRF_WEIGHT = 0.3`
3. **Phase 3:** Add PPR to AI Analysis (`enableLLMRerank = true` path) as an additional signal

---

## 8. Implementation Phases

### Phase 1: Core PPR Algorithm (~3 tasks)

1. **PPR engine** — `src/service/search/query/personalizedPageRank.ts`
   - Forward Push algorithm with multi-layer edge support
   - Lazy adjacency cache backed by `MobiusEdgeRepo` batch queries
   - Tag co-occurrence virtual edges via `GRAPH_TAGGED_EDGE_TYPES`
   - Constants in `src/core/constant.ts`
   - Unit tests with mock graph data

2. **Edge fetcher abstraction** — method on `MobiusEdgeRepo` or standalone helper
   - `getMultiLayerOutEdges(nodeIds, tenant)`: returns combined reference + semantic + tag edges with layer weights applied
   - Batched for efficiency (single SQL per edge type)

3. **PPR algorithm tests**
   - Deterministic test graph (5-10 nodes) with known PPR scores
   - Convergence verification
   - Safety bound (max ops, max time) verification
   - Tag co-occurrence edge generation test

### Phase 2: Search Pipeline Integration (~3 tasks)

4. **QueryService integration** — `src/service/search/query/queryService.ts`
   - After `mergeContentAndMetaWithRRF()`, invoke PPR with top seeds
   - New `mergeWithPPR()` method for RRF fusion of CM results + PPR results
   - Feature flag check (`searchSettings.chunking.enablePPR`)

5. **Reranker adjustment** — `src/service/search/query/reranker.ts`
   - Dampen global PR boost when PPR is active
   - Add `pprActive` flag to `applyRankingBoosts()` params

6. **Stopwatch instrumentation**
   - Add `ppr_computation` segment to search timing
   - Log PPR stats (nodes explored, push ops, truncated) via console.debug

### Phase 3: Validation & Tuning (~2 tasks)

7. **Side-by-side comparison command**
   - `Peak: Compare Search Results` — runs both pipelines, displays diff
   - Metric logging to `mobius_operation`

8. **Parameter tuning**
   - Real-vault benchmarks (latency, rank displacement)
   - Layer weight sensitivity analysis
   - Adjust `PPR_RRF_WEIGHT` based on observed quality

### Estimated Scope

- **New files:** 1 (`personalizedPageRank.ts`) + 1 test file
- **Modified files:** 3 (`queryService.ts`, `reranker.ts`, `constant.ts`) + settings type
- **Lines added:** ~400 (algorithm + integration)
- **Lines modified:** ~50 (reranker dampen + pipeline wiring)
- **Risk:** Low — PPR is purely additive to the search pipeline; feature-flagged; fallback is current behavior
