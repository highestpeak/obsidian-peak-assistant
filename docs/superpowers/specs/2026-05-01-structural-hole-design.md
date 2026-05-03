# Structural Hole / Hub Detection Visualization — Design

**Date:** 2026-05-01
**Status:** Draft (Revised — code-anchored, algorithm-complete)
**Priority:** S4 (★★★★)
**Scope:** `src/service/search/index/helper/structural/` (new), `src/service/search/index/helper/hub/`, `src/ui/view/gap-analysis/` (new), `src/ui/component/mine/multi-lens-graph/`, `src/core/storage/sqlite/`, `src/core/constant.ts`
**Academic basis:** Burt (2004 AJS) "Structural Holes and Good Ideas"; Brandes (2001) betweenness algorithm; Blondel et al. (2008) Louvain method; HippoRAG (NeurIPS 2024); Microsoft GraphRAG (2024) community detection
**Competitive target:** InfraNodus-level gap analysis, Obsidian-native, fully local, zero cost

---

## 0. Executive Summary

**Problem:** Knowledge blind spots are invisible. Users accumulate thousands of notes but cannot see which topic communities exist, where the bridges are, and — crucially — where connections *should* exist but don't. Obsidian's native graph view is universally acknowledged as beautiful but useless (competitive analysis confirms: "graph-analysis plugin 4 years unmaintained, 28 open issues"). InfraNodus solves this with betweenness centrality + gap detection but requires uploading data to external servers at €19/month.

**Goal:** Deliver an Obsidian-native, fully local gap analysis system that surfaces structural holes in the user's knowledge graph, identifies bridge nodes, detects missing inter-community connections, and recommends concrete actions (create bridging notes, add links). The system operates on the existing `mobius_node` / `mobius_edge` graph with zero new external dependencies.

**Core deliverables:**
1. Global betweenness centrality algorithm (Brandes, O(VE)) with incremental approximation for large vaults
2. Burt's structural constraint coefficient per node
3. Community detection via Louvain modularity optimization (replacing label propagation as SSOT for analysis)
4. Gap detection: identifying missing cross-community edges (structural holes)
5. Gap Analysis UI panel: community map, bridge highlighting, structural hole annotation, action suggestions
6. Integration with existing MultiLensGraph, hub discovery pipeline, and inspector tools

**What this is not:** This is not a replacement for the existing hub discovery pipeline. It augments hub discovery with algorithmic rigor and provides a user-facing lens on vault structure that the current heuristic-based system cannot offer.

---

## 1. Problem Statement

### 1.1 The invisible knowledge blind spot

Users build knowledge bases over months and years. The fundamental failure mode is not "I can't find what I wrote" (search solves that) but "I don't know what I don't know." Specifically:

- **Topic silos**: Notes about distributed systems never connect to notes about organizational theory, even though both discuss consensus mechanisms. The user doesn't see the gap because they never search for both simultaneously.
- **Missing bridges**: A single note connecting two communities carries disproportionate value (Burt 2004: people occupying structural holes produce better ideas, get promoted faster, earn higher compensation). When that note doesn't exist, neither community benefits from the other's knowledge.
- **Orphan islands**: Small clusters of notes that are disconnected from the main graph — not just individual orphan notes (which Obsidian already shows), but entire sub-communities that have internal links but no external connections.
- **Fragile bridges**: Communities connected by only one or two notes. Deleting or significantly modifying those notes would completely disconnect the communities.

<!-- 核心问题：你的知识库里哪些想法"几乎相连但实际没有相连"？这些结构洞正是最高价值的创意节点所在。 -->

### 1.2 Academic foundation

**Burt (2004, AJS Vol. 110 No. 2)** — "Structural Holes and Good Ideas": 673 supply chain managers studied empirically. People occupying structural hole positions (bridging unconnected groups) produce higher-quality ideas, earn higher salaries, and get promoted faster. The mechanism: brokerage positions provide access to diverse, non-redundant information that enables cross-domain synthesis. **Directly maps to knowledge graphs: notes bridging two unconnected communities are structural hole occupants — high-value creative nodes.**

**Microsoft GraphRAG (Edge et al., 2024)** — Leiden/Louvain community detection + pre-generated community summaries. Validates that graph-structural analysis of text corpora improves downstream retrieval and reasoning.

### 1.3 Why existing tools fail

| Tool | What it does | What it misses |
|------|-------------|----------------|
| Obsidian graph view | Renders all nodes and edges | No community detection, no centrality analysis, no gap identification, no actionable suggestions |
| Peak hub discovery (`hubDiscover.ts`) | Finds high-PageRank and high-degree nodes, classifies as bridge/authority via `HubRole` union | Heuristic role classification (degree ratio at `hubDiscover.ts:2317`), not algorithmic betweenness; no community boundary detection; no structural hole identification |
| Peak `find-path.ts:1680-1706` | Per-path-pair "betweenness" (`analyzeHubs()`: `occurrenceCount / paths.length`) | Not global betweenness; only computed for specific start/end pairs; not persisted |
| Peak `find-key-nodes.ts:27` | RRF ranking combining degree + semantic similarity, classifies `hub/authority/bridge/balanced` | Degree centrality only, not betweenness; no community context |
| Peak `community.ts` (`graph-viz/utils/`) | Label propagation for rendering colors (max 20 iterations) | Non-deterministic; no modularity optimization; client-side only, not persisted; used exclusively for visualization coloring |
| InfraNodus | Full betweenness centrality + gap analysis + AI questions | Cloud-only, €19/month, data leaves device |
| graph-analysis plugin | Betweenness centrality + other metrics | Abandoned (4 years, 28 open issues), incompatible with current Obsidian API |

### 1.4 Current codebase gaps — precise anchors

<!-- 注：以下是现有代码中与结构洞分析相关的精确位置和缺失 -->

| What exists | Where | Gap |
|------------|-------|-----|
| Hub candidate scoring formula | `hubDiscover.ts:2317` — `graphScore = physicalAuthority*0.35 + organizational*0.25 + semanticCentrality*0.35 + manualBoost*0.05` | `semanticCentrality` is `semantic_pagerank * 1.2`, NOT betweenness |
| Bridge role inference | `localGraphAssembler.ts:256` `inferRoleHint()` — degree-threshold heuristic (`rh.bridgeMinInc`, `rh.bridgeMinOut`) | Not based on inter-community position |
| Per-query betweenness proxy | `find-path.ts:1700` — `betweennessCentrality: count / paths.length` | Path-pair-local, not vault-global; `HubAnalysis` type at line 128 |
| Key node classification | `find-key-nodes.ts:218-234` — `bridge` if `uniqueCategories >= 2`, `hub`/`authority` by degree ratio | Category count proxy, not true structural analysis |
| Community detection (UI-only) | `graph-viz/utils/community.ts:11` `labelPropagation()` — 20 iterations, undirected | Not persisted, non-deterministic, no quality metric |
| `mobius_node` schema | `ddl.ts:556` — has `pagerank`, `semantic_pagerank`, `folder_cohesion_score` columns | No `betweenness_centrality`, `community_id`, or `structural_constraint` columns |
| `HubCandidate` type | `hub/types.ts:87-165` — `graphScore`, `candidateScore`, `pagerank`, `semanticPagerank` | No betweenness or constraint fields |
| `HubRole` union | `hub/types.ts:16` — `'authority' | 'index' | 'bridge' | 'cluster_center' | 'folder_anchor' | 'manual'` | Bridge role has no algorithmic backing |
| Edge types for graph | `graph.po.ts:23-38` — `References`, `ReferencesResource`, `SemanticRelated`, `Tagged*`, `Contains` | Clear — we select `References` + `ReferencesResource` + `SemanticRelated` for structural analysis |

---

## 2. Algorithm Design

### 2.1 Global Betweenness Centrality (Brandes Algorithm)

<!-- 注：Brandes 2001 是计算全图 betweenness centrality 的标准算法，时间复杂度 O(VE)，空间 O(V+E) -->

**Definition:** Betweenness centrality of node v = fraction of all shortest paths between all pairs (s,t) that pass through v.

```
BC(v) = Σ_{s≠v≠t} σ_st(v) / σ_st
```

Where `σ_st` = number of shortest paths from s to t, `σ_st(v)` = number of those paths passing through v.

**Algorithm:** Brandes (2001) computes exact betweenness in O(VE) time, O(V+E) space — single BFS from each node, accumulating dependency scores on the backward pass.

```
For each source s ∈ V:
  1. BFS from s → record distances d[t], path counts σ[t], predecessors P[t]
  2. Backward pass (nodes in decreasing distance order):
     δ[v] += Σ_w∈successors(v) (σ[v]/σ[w]) * (1 + δ[w])
  3. CB[v] += δ[v]   (for v ≠ s)
Normalize: CB[v] /= ((n-1)(n-2))  for undirected graphs
```

**Feasibility for Obsidian vaults:**
- Typical vault: 500-5,000 document nodes
- Edge count: 3-10x node count (references + semantic_related edges)
- For V=5,000, E=30,000: ~150M operations — completes in 2-5 seconds on modern hardware
- For V=10,000, E=60,000: ~600M operations — 5-15 seconds; acceptable for background computation

**Graph construction for betweenness:**
- Include node types: `document` and `hub_doc` only (from `mobius_node` where `type IN ('document', 'hub_doc')`)
- Exclude node types: `topic_tag`, `functional_tag`, `keyword_tag`, `context_tag`, `resource`, `folder`
- Include edge types: `references`, `references_resource`, `semantic_related` (from `mobius_edge`)
- Exclude edge types: `tagged_*`, `contains` (organizational/hierarchical, not conceptual)
- Edge weighting: `references` = 1.0, `references_resource` = 1.0, `semantic_related` = value from `mobius_edge.weight` column (0-1, inverted for shortest-path: cost = max(0.1, 1 - weight))
- Directionality: treat all edges as undirected (a link from A to B implies conceptual proximity in both directions)

**Approximate mode for large vaults (>10K document nodes):**
Use randomized Brandes: sample k source nodes uniformly at random, run BFS from each, scale result by V/k. For k=500, error ε ≈ O(1/√500) ≈ 0.045 — sufficient for ranking and visualization.

**Output:** `Map<nodeId, number>` normalized to [0, 1] where 1 = highest betweenness in the graph.

### 2.2 Burt's Structural Constraint Coefficient

<!-- 注：Burt (1992) 定义的 constraint 系数衡量节点的邻域冗余度。constraint 低 = 结构洞位置 -->

**Definition:** Constraint measures how much a node's connections are redundant (all neighbors know each other). Low constraint = structural hole position = access to diverse, non-redundant information.

```
C(i) = Σ_j (p_ij + Σ_q p_iq * p_qj)²    for all j ≠ i where j is neighbor of i

where p_ij = w_ij / Σ_k w_ik  (proportion of i's network investment in j)
```

**Interpretation:**
- High constraint (> 0.7): All neighbors are connected to each other — no structural hole, limited information diversity
- Low constraint (< 0.3): Neighbors are in different, disconnected groups — structural hole position, high brokerage potential
- Medium constraint (0.3-0.7): Mixed position

**Complementarity with betweenness:**
- Betweenness = global shortest-path position (macro view)
- Constraint = local neighborhood redundancy (micro view)
- Together they identify the most valuable bridge positions with high confidence

**Output:** `Map<nodeId, number>` with raw constraint values (typical range 0.05-1.0).

### 2.3 Community Detection (Louvain Method)

<!-- 注：Louvain 比现有的 label propagation 好在：有 modularity 优化目标、近确定性、产出层次结构。选 Louvain 而非 Leiden 因为实现更简单且在 <50K 节点规模无质量差异。 -->

**Why Louvain over existing label propagation:**
- Existing `community.ts` uses label propagation: non-deterministic, no quality metric, single-level, client-side only
- Louvain optimizes modularity Q (defined quality objective), is near-deterministic (same-order traversal produces same result), and produces a hierarchy

**Why Louvain over Leiden:**
- Leiden (Traag et al. 2019) guarantees connected communities and converges faster on very large graphs
- For personal knowledge graphs (<50K nodes), Louvain's implementation simplicity wins
- Leiden adds a refinement phase + random neighbor sampling — complexity without measurable quality improvement at this scale
- If community quality proves insufficient, Leiden is a drop-in replacement for the Phase 1 algorithm module

**Modularity Q:**

```
Q = (1/2m) Σ_ij [A_ij - k_i*k_j/(2m)] δ(c_i, c_j)

where A_ij = adjacency weight, k_i = weighted degree of i, m = total edge weight, c_i = community of i
```

**Algorithm phases:**
1. **Phase 1 (local moves):** For each node (traversed in sorted `node_id` order for determinism), compute modularity gain of moving it to each neighbor's community. Move to community with max gain if positive. Repeat until no improvement.
2. **Phase 2 (aggregation):** Build a new network where nodes are communities from Phase 1. Edges between communities = sum of inter-community edges. Self-loops = sum of intra-community edges.
3. Repeat Phase 1 + 2 until Q converges.

**Parameters:**
- Resolution parameter γ = 1.0 (standard). Exposed as a user setting for finer/coarser granularity.
- Minimum community size: 3 nodes. Communities of 1-2 nodes are merged into the nearest community by inter-community edge weight.
- Graph: same document-only, undirected, weighted graph as betweenness computation.

**Output:**
- `Map<nodeId, communityId>` — primary community assignment (communityId is a string, e.g., `"c_0"`, `"c_5"`)
- `Array<CommunityInfo>` — metadata per community (id, member count, top nodes by betweenness, label derived from dominant topic tags via `mobius_edge` `tagged_topic` edges)
- Modularity score Q for the partition

### 2.4 Algorithm Orchestration

All three algorithms run on the same graph snapshot. Computation is orchestrated as a single background pipeline:

```
buildAnalysisGraph()
  → read document nodes from mobius_node (type IN ('document','hub_doc'))
  → read edges from mobius_edge (type IN ('references','references_resource','semantic_related'))
  → build weighted undirected adjacency list
    ↓
runBrandes()             →  betweenness scores (Map<nodeId, number>)
runLouvain()             →  community assignments (Map<nodeId, communityId>)
computeConstraint()      →  constraint coefficients (Map<nodeId, number>)
    ↓
buildCommunityMetadata() →  community labels, member counts, top nodes, centroid embeddings
    ↓
detectStructuralHoles()  →  gap candidates (inter-community density + semantic similarity)
    ↓
persist to SQLite        →  betweenness, community_id, constraint on mobius_node
                            community_metadata table
                            structural_holes table
```

Total expected runtime for 5K-node vault: 3-8 seconds. Runs as a background task via `setTimeout`, not blocking UI.

---

## 3. Gap Detection

### 3.1 Structural hole identification

A structural hole exists between two communities when:

1. **Low inter-community edge density**: The ratio of actual edges between community A and community B to the maximum possible edges is below threshold.

```
density(A, B) = |edges(A,B)| / (|A| × |B|)
threshold: density < 0.01
```

2. **High intra-community density**: Both communities A and B have internal density > 0.05 (they are real clusters, not random collections).

3. **Community size filter**: Both communities have >= 5 members (exclude tiny groups from gap analysis).

4. **Semantic proximity check** (the critical differentiator): At least some nodes in A have semantic similarity > 0.3 to some nodes in B, measured via community centroid embeddings from the existing `embedding` table. This distinguishes meaningful gaps ("machine learning" ↔ "statistics" should be connected) from natural boundaries ("cooking" ↔ "quantum physics" are expectedly separate).

### 3.2 Gap scoring

Each detected gap receives a composite score:

```
gap_score = 0.5 * semantic_bridge_potential
          + 0.2 * size_factor
          + 0.3 * isolation_severity
```

Where:
- `semantic_bridge_potential` = max cosine similarity between any node in A and any node in B (using existing embeddings). Higher = more likely a real gap.
- `size_factor` = log(|A| + |B|) / log(max_community_size). Larger communities = more valuable to bridge.
- `isolation_severity` = 1 - density(A, B). Complete disconnection = 1.0.

### 3.3 Gap types

| Gap Type | Detection | User Action |
|----------|-----------|-------------|
| **Missing bridge** | Two semantically related communities with zero inter-edges | Create a new note bridging the topics |
| **Weak bridge** | Communities connected by a single node (articulation point) | Strengthen by adding parallel connections |
| **Latent connection** | Unlinked mention detected between communities (reuse `unlinkedMentionService`) | Add explicit `[[wikilink]]` |
| **Topic blind spot** | Community with high internal density but near-zero external edges to any other community | Investigate why this topic is isolated |
| **Decaying bridge** | Bridge note has high staleness (last modified > 90 days, high betweenness) | Refresh the bridge note |

### 3.4 Bridge candidate identification

For each structural hole, identify:

1. **Existing weak bridges**: Nodes with edges into both communities A and B. Classified by fragility:
   - `critical`: only bridge between A and B
   - `moderate`: one of 2-3 bridges
   - `stable`: one of 4+ bridges

2. **Potential bridge nodes**: Nodes in A with highest semantic similarity to nodes in B (top-3 pairs per gap), using existing embeddings from `EmbeddingRepo.getEmbeddingForSemanticSearch()`.

3. **Suggested new notes**: When gap_score > 0.7 and no existing bridge exists, suggest creating a new note. Title derived from dominant topics of both communities; body template loaded from `templates/config/bridge-note-template.hbs`.

### 3.5 Output types

```typescript
interface StructuralHole {
  id: string;                          // stable hash of community pair
  communityA: CommunityInfo;
  communityB: CommunityInfo;
  gapScore: number;                    // 0-1, higher = more important gap
  gapType: 'missing_bridge' | 'weak_bridge' | 'latent_connection' | 'topic_blind_spot' | 'decaying_bridge';
  semanticBridgePotential: number;     // max cross-community similarity
  existingBridges: BridgeNode[];       // nodes already connecting A and B
  potentialBridges: PotentialBridge[];  // suggested connections
  explanation?: string;                // AI-generated (lazy, nullable)
}

interface CommunityInfo {
  id: string;
  label: string;           // derived from dominant topic tags
  memberCount: number;
  internalDensity: number;
  topNodes: Array<{        // top 5 by betweenness within community
    path: string;
    label: string;
    betweenness: number;
  }>;
  dominantTopics: string[];
}

interface BridgeNode {
  path: string;
  label: string;
  betweenness: number;
  constraint: number;
  communitiesConnected: string[];  // community IDs
  fragility: 'critical' | 'moderate' | 'stable';
}

interface PotentialBridge {
  sourceNode: { path: string; label: string; community: string };
  targetNode: { path: string; label: string; community: string };
  semanticSimilarity: number;
  suggestedAction: 'add_link' | 'create_note';
  rationale: string;
}
```

---

## 4. Visualization — Gap Analysis UI Panel

### 4.1 Entry points

<!-- 注：三个入口点，主 UI 是独立的 Obsidian ItemView，另外两个是集成点 -->

1. **Command palette**: `Peak: Open Gap Analysis` — opens a dedicated Obsidian `ItemView` in a new leaf
2. **MultiLensGraph lens**: A new `'gap-analysis'` lens type added to the existing `LENS_CONFIG` array in `MultiLensGraph.tsx:30` (alongside topology, thinking-tree, bridge, timeline). Uses `Layers` icon from Lucide.
3. **Future Vault X-Ray integration**: A "Knowledge Gaps" section in the S2 Vault Lint dashboard (out of scope for this spec, but the data model supports it)

### 4.2 Panel layout

```
┌─────────────────────────────────────────────────────────────┐
│  Gap Analysis                                     [Refresh] │
│  Last computed: 2 hours ago  •  12 communities  •  Q=0.47  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────┐  ┌──────────────────┐  │
│  │                                 │  │  Gap Details      │  │
│  │    Community Map                │  │                    │  │
│  │    (force-directed graph        │  │  ▸ Gap #1          │  │
│  │     with community coloring,    │  │    "Systems ↔      │  │
│  │     bridge highlighting,        │  │     Philosophy"    │  │
│  │     gap annotations)            │  │    Score: 0.87     │  │
│  │                                 │  │    3 potential      │  │
│  │    [A] ──── [B] ──── [C]       │  │    bridges found    │  │
│  │     ↑                  ↕        │  │                    │  │
│  │    [D]       ✕        [E]       │  │  ▸ Gap #2          │  │
│  │              ↑                  │  │    "Projects ↔     │  │
│  │        structural               │  │     Research"      │  │
│  │          hole                   │  │                    │  │
│  │                                 │  │  ▸ Gap #3          │  │
│  └─────────────────────────────────┘  └──────────────────┘  │
│                                                             │
│  Bridge Nodes (8)                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [[系统思维]]  BC=0.23  C=0.18  bridges: A↔B, A↔D      │ │
│  │ [[产品方法论]] BC=0.19  C=0.22  bridges: B↔C           │ │
│  │ ...                                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Suggested Actions (5)                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Link [[分布式系统]] → [[组织理论]]  (sim: 0.72)        │ │
│  │   "Both discuss consensus mechanisms in different      │ │
│  │    contexts."                                          │ │
│  │                                        [Add Link]      │ │
│  │                                                        │ │
│  │ Create note bridging "DevOps" ↔ "Management"          │ │
│  │   "These communities share process optimization        │ │
│  │    themes but have no connecting notes."                │ │
│  │                                   [Create Bridge Note] │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Community map visualization

Built on the existing `@xyflow/react` infrastructure (same renderer as `MultiLensGraph.tsx`).

**Node rendering:**
- Size proportional to betweenness centrality (min 24px, max 64px, linear scale)
- Color = community assignment (palette defined in `templates/config/community-colors.json` per CLAUDE.md configurability rule — 12 distinct hues, cycling for communities > 12)
- Border: double-ring for bridge nodes (nodes connecting 2+ communities)
- Opacity: constraint coefficient mapped to opacity (low constraint = full opacity = structural hole position; high constraint = semi-transparent)

**Edge rendering:**
- Intra-community edges: thin (1px), same color as community, low opacity (0.2)
- Inter-community edges: thicker (2px), gradient between the two community colors
- Missing edges (structural holes): dashed red lines between community centroids, with a gap marker

**Layout:**
- Community-aware force-directed: nodes in the same community attract more strongly (charge multiplier 2x for same-community pairs). Communities repel slightly (inter-community repulsion 0.3x base). This naturally produces the cluster-gap-cluster visual pattern.
- Uses the existing `@xyflow/react` layout infrastructure with custom force parameters, following the pattern in `useLensLayout` hook.

**Semantic zoom (two levels):**
1. **Vault-level** (default): Each community rendered as a colored convex hull (reuse `graph-viz/utils/hull.ts` pattern) with a label (top 3 tags or LLM-generated topic name). Hub nodes shown as larger dots within each hull. Bridge nodes highlighted between hulls.
2. **Community-level** (click hull to drill down): Individual notes within the selected community laid out. Edges to other communities shown as fade-out connections at boundary.

### 4.4 Interactions

| Action | Behavior |
|--------|----------|
| Click community hull | Drill down to community-level view, show all member notes |
| Click bridge node | Highlight all communities it connects, show details in sidebar |
| Click structural hole marker | Show gap details + suggested actions in sidebar |
| Hover node | Tooltip: path, betweenness, constraint, community label |
| Click "Add Link" | Insert wikilink at end of source note (in "Related" section if exists, otherwise append). Trigger incremental graph update. |
| Click "Create Bridge Note" | Open new note from `bridge-note-template.hbs` with pre-filled wikilinks to top nodes in both communities |
| Resolution slider (γ) | Adjust Louvain resolution → recompute communities (does NOT rerun Brandes — community reassignment only, ~200ms) |
| [Refresh] button | Force full recomputation of all metrics |
| [↗] expand button | Open in fullscreen pane (reuse `MultiLensGraph` expand pattern from `onExpand` prop) |

### 4.5 Gap details sidebar

When a structural hole is selected, the sidebar shows:

- Community A and B labels, member counts, dominant topics
- Gap score with star rating (★ per 0.2 increments)
- Gap type badge (missing bridge / weak bridge / latent connection / etc.)
- AI-generated explanation (lazy: generated on first view via LLM, cached in `structural_holes.explanation`)
- Potential bridges list with semantic similarity and action buttons
- Existing bridges list with fragility assessment

### 4.6 MultiLensGraph integration (new "Gap Analysis" lens)

Add `'gap-analysis'` to `LensType` union in `src/ui/component/mine/multi-lens-graph/types.ts:3`. Add entry to `LENS_CONFIG` array in `MultiLensGraph.tsx:30`:

```typescript
{ type: 'gap-analysis', icon: Layers, label: 'Gaps' }
```

When active, the `useLensLayout` hook branches to `gap-analysis` layout which:
- Colors nodes by Louvain community (from `mobius_node.community_id`)
- Sizes nodes by betweenness (from `mobius_node.betweenness_centrality`)
- Renders structural hole arcs between community centroids
- Shows gap score as arc thickness

Extend `LensGraphData` interface:

```typescript
// Added to existing LensGraphData in types.ts
gaps?: Array<{
  id: string;
  communityA: string;
  communityB: string;
  score: number;
  suggestedBridges: number;
}>;
communityMetrics?: Array<{
  id: string;
  label: string;
  memberCount: number;
  color: string;
}>;
```

---

## 5. Integration with Existing Systems

### 5.1 Hub discovery pipeline integration

<!-- 注：结构洞分析结果增强 hub discovery 的 bridge 角色分类，但不替换现有流程 -->

Current flow:
```
indexDocument → computePageRank → computeSemanticPageRank → hubDiscover → hubDocServices
```

Enhanced flow:
```
indexDocument → computePageRank → computeSemanticPageRank
                                                         ↘
                                              computeStructuralAnalysis (background)
                                              (betweenness + community + constraint)
                                                         ↙
                                             hubDiscover (reads betweenness from mobius_node)
                                                         ↓
                                             hubDocServices
```

**Integration points:**

1. **Hub candidate scoring** (`hubDiscover.ts:2317`): `candidateScore.semanticCentralityScore` currently = `min(1, semantic_pagerank * 1.2)`. For bridge candidates, enhance:
   ```
   // Current:
   graphScore = physicalAuthority * 0.35 + organizational * 0.25 + semanticCentrality * 0.35
   // Enhanced (bridge candidates only, when betweenness available):
   graphScore = physicalAuthority * 0.30 + organizational * 0.20 + semanticCentrality * 0.25 + betweennessCentrality * 0.25
   ```

2. **Bridge role inference** (`localGraphAssembler.ts:256`, `inferRoleHint()`): Currently uses degree thresholds via `rh.bridgeMinInc`, `rh.bridgeMinOut`. Enhanced: a node with `betweenness > 0.1 AND constraint < 0.4 AND connecting 2+ communities` → `bridge` role with high confidence, bypassing degree heuristics.

3. **Coverage gap** (`HubDiscoverCoverageGap` type in `hub/types.ts`): Currently identifies path prefixes not covered by hubs. Enhanced: communities without any hub representative trigger a coverage gap entry.

4. **`HubCandidate` type** (`hub/types.ts:87`): Add optional fields:
   ```typescript
   betweennessCentrality?: number;
   burtConstraint?: number;
   communityId?: string;
   ```

### 5.2 Inspector tool integration

**Enhance `find-key-nodes.ts`**: When `structural_analysis_version` exists on `mobius_node`, JOIN with betweenness/constraint data and expose in output. New `structuralRole` classification: `'structural_hole_occupant'` when `betweenness > 0.1 AND constraint < 0.3`.

**New tool: `find-structural-holes.ts`** in `src/service/tools/search-graph-inspector/`:
- Queries `structural_holes` table + `community_metadata` table
- Returns gaps with scores, bridge candidates, suggested actions
- Registered in `ToolTemplateId` enum and `TemplateRegistry.ts` (following `find-key-nodes.ts` pattern)
- Handlebars template in `templates/tools/structural-holes.hbs`

**MCP exposure** via `vaultMcpServer.ts`:
- `vault_get_clusters()` → community list with labels and member counts
- `vault_get_bridges()` → top bridge nodes by betweenness
- `vault_find_gaps()` → structural holes with gap score and bridge candidates

### 5.3 Search reranking

Betweenness centrality can serve as a static boost signal in the reranker pipeline, similar to how `pagerank` is currently used. Bridge nodes (high betweenness, low constraint) should be boosted when a query spans multiple topic communities detected by Louvain.

### 5.4 Graph-viz (D3 canvas) integration

The `GraphVisualization` component (`src/ui/component/mine/graph-viz/GraphVisualization.tsx`) already has:
- Community hull rendering (`GraphEffectsCanvas.tsx`, using `utils/hull.ts`)
- Hub highlighting via `hubTopN`, `hubColor` settings in `config.ts`
- Label propagation community detection (`utils/community.ts`)
- D3 force simulation (`hooks/useGraphSimulation.ts`)

**Integration:**
- Pass betweenness through `GraphUINode.attributes.betweenness` (existing extensible attributes field in `types.ts`)
- In canvas renderer, scale node radius by `attributes.betweenness` (in addition to degree-based sizing)
- In `GraphEffectsCanvas.tsx`, read `attributes.communityId` for hull coloring; fall back to label propagation when community_id is not yet computed
- Add `showGapArcs: boolean` toggle in graph settings that triggers gap arc rendering in the effects canvas layer

---

## 6. Data Model

### 6.1 Schema additions to `mobius_node`

```sql
-- Idempotent ALTER TABLE additions (pattern from ddl.ts:625)
ALTER TABLE mobius_node ADD COLUMN betweenness_centrality REAL;
ALTER TABLE mobius_node ADD COLUMN structural_constraint REAL;
ALTER TABLE mobius_node ADD COLUMN community_id TEXT;
ALTER TABLE mobius_node ADD COLUMN structural_analysis_version INTEGER;

-- Index for community-based queries
CREATE INDEX IF NOT EXISTS idx_mobius_node_community_id ON mobius_node(community_id);
```

### 6.2 New table: `structural_analysis_state`

```sql
CREATE TABLE IF NOT EXISTS structural_analysis_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Stores metadata as key-value pairs:
- `last_computed_at`: Unix timestamp of last full analysis
- `analysis_version`: Monotonically increasing version number
- `modularity_q`: Modularity Q score of current partition (e.g., "0.47")
- `community_count`: Number of detected communities
- `node_count_at_computation`: Number of document nodes when analysis was last run

### 6.3 New table: `community_metadata`

```sql
CREATE TABLE IF NOT EXISTS community_metadata (
  community_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  member_count INTEGER NOT NULL,
  dominant_topics_json TEXT NOT NULL,     -- JSON array of topic tag strings
  top_nodes_json TEXT NOT NULL,           -- JSON array of {path, label, betweenness}
  internal_density REAL NOT NULL,
  centroid_embedding BLOB,               -- average embedding (for inter-community similarity)
  analysis_version INTEGER NOT NULL
);
```

### 6.4 New table: `structural_holes`

```sql
CREATE TABLE IF NOT EXISTS structural_holes (
  id TEXT PRIMARY KEY,                    -- stable hash of (community_a, community_b)
  community_a_id TEXT NOT NULL,
  community_b_id TEXT NOT NULL,
  gap_type TEXT NOT NULL,                 -- missing_bridge | weak_bridge | latent_connection | topic_blind_spot | decaying_bridge
  gap_score REAL NOT NULL,
  semantic_bridge_potential REAL NOT NULL,
  inter_density REAL NOT NULL,
  existing_bridge_count INTEGER NOT NULL,
  potential_bridges_json TEXT NOT NULL,    -- JSON array of PotentialBridge
  explanation TEXT,                        -- AI-generated, nullable until LLM pass
  status TEXT NOT NULL DEFAULT 'open',     -- open | addressed | dismissed
  analysis_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_structural_holes_score ON structural_holes(gap_score DESC);
CREATE INDEX IF NOT EXISTS idx_structural_holes_version ON structural_holes(analysis_version);
```

### 6.5 Incremental update strategy

<!-- 注：全量 Brandes O(VE) 对 5K 节点约 3 秒，不需要对每次保存都跑。用脏标记 + 延迟重算。 -->

**Full recomputation triggers:**
- First run (no `structural_analysis_version` on any `mobius_node`)
- Manual trigger via command palette (`Peak: Recompute Gap Analysis`)
- Document node count changed by > 10% since last computation (compare `node_count_at_computation`)
- > 50 documents modified since last computation (count `mobius_node` rows where `updated_at > last_computed_at`)

**Incremental approximation (between full recomputations):**
- When a document is added/modified/deleted: mark that node's `structural_analysis_version = NULL`
- Mark all 1-hop neighbors' `structural_analysis_version = NULL` (propagated invalidation)
- Community: if modified node's edge set changed significantly (>30% edges new or removed), run local Louvain move (single-node community reassignment, O(degree))
- Gap scores: recompute only for gaps involving the modified node's community

**Staleness indicator in UI:**
- Show "Last computed: X ago" and "Y nodes have changed since"
- If > 20% of document nodes have `structural_analysis_version = NULL`, show: "Gap analysis is stale. [Recompute]"

### 6.6 Integration with S3 cascade update

When S3 lands, hook structural metric recomputation into the cascade pipeline:

```
Note modified → S3 cascade trigger → {
  1. Re-embed the note (existing)
  2. Update semantic edges (existing)
  3. Mark structural_analysis_version = NULL for note + 1-hop neighbors (new)
  4. Schedule lazy betweenness recalc in idle window (new)
  5. If community membership changes, re-detect gaps for affected communities (new)
}
```

---

## 7. Implementation Phases

### Phase 1: Core algorithms + data model (1 week)

**New files:**
- `src/service/search/index/helper/structural/buildAnalysisGraph.ts` — extract document-only weighted undirected graph from `mobius_node` + `mobius_edge`
- `src/service/search/index/helper/structural/brandesBetweenness.ts` — Brandes algorithm (exact + k-sample approximate)
- `src/service/search/index/helper/structural/louvainCommunity.ts` — Louvain modularity optimization
- `src/service/search/index/helper/structural/burtConstraint.ts` — Structural constraint coefficient
- `src/service/search/index/helper/structural/gapDetection.ts` — Structural hole identification + scoring + bridge candidate selection
- `src/service/search/index/helper/structural/types.ts` — Shared types (`StructuralHole`, `CommunityInfo`, `BridgeNode`, `PotentialBridge`)
- `src/service/search/index/helper/structural/orchestrator.ts` — Pipeline orchestration: build graph → Brandes → Louvain → constraint → gaps → persist

**Modified files:**
- `src/core/storage/sqlite/ddl.ts` — Add columns to `mobius_node`, create new tables (idempotent ALTERs)
- `src/core/storage/sqlite/SqliteStoreManager.ts` — Register new repos
- `src/core/constant.ts` — Add structural analysis constants (thresholds, weights)

**Tests:**
- Brandes on barbell graph (two 5-cliques connected by single bridge → bridge BC ≈ 1.0)
- Brandes on star graph (center BC = 1.0, leaves BC = 0.0)
- Louvain on planted partition graph (two dense clusters with sparse inter-connection → Q > 0.4)
- Constraint on star (center low, leaves high) vs complete graph (all equal, high)
- Gap detection: two disconnected clusters with high semantic similarity → detected as gap

**Estimated scope:** ~1500 lines algorithm + types + persistence + ~400 lines tests

### Phase 2: Persistence + hub integration + inspector tool (3-5 days)

**New files:**
- `src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts` — CRUD for `structural_analysis_state`, `community_metadata`, `structural_holes`; batch update betweenness/community on `mobius_node`
- `src/service/tools/search-graph-inspector/find-structural-holes.ts` — New inspector tool
- `templates/tools/structural-holes.hbs` — Handlebars output template

**Modified files:**
- `src/service/search/index/helper/hub/types.ts:87` — Add `betweennessCentrality?`, `burtConstraint?`, `communityId?` to `HubCandidate`
- `src/service/search/index/helper/hub/hubDiscover.ts:2317` — Read betweenness for enhanced bridge scoring (optional, read-only)
- `src/service/search/index/helper/hub/localGraphAssembler.ts:256` — Enhanced `inferRoleHint()` using betweenness + constraint when available
- `src/service/tools/search-graph-inspector/find-key-nodes.ts` — Expose betweenness and community in output
- `src/core/template/TemplateRegistry.ts` — Register `ToolTemplateId.FindStructuralHoles`
- `src/service/agents/vault-sdk/vaultMcpServer.ts` — Add MCP tools: `vault_get_clusters`, `vault_get_bridges`, `vault_find_gaps`
- `src/app/context/AppContext.ts` or `Register.ts` — Register `Peak: Recompute Gap Analysis` command

**Estimated scope:** ~600 lines new + ~300 lines modifications

### Phase 3: Gap Analysis UI panel (1 week)

**New files:**
- `src/ui/view/gap-analysis/GapAnalysisView.tsx` — Main panel (Obsidian `ItemView`)
- `src/ui/view/gap-analysis/CommunityMap.tsx` — ReactFlow community visualization
- `src/ui/view/gap-analysis/GapDetailsSidebar.tsx` — Selected gap details + actions
- `src/ui/view/gap-analysis/BridgeNodeList.tsx` — Bridge node table
- `src/ui/view/gap-analysis/SuggestedActions.tsx` — Actionable suggestions
- `src/ui/view/gap-analysis/gapAnalysisStore.ts` — Zustand store
- `src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts` — Layout for gaps lens
- `templates/config/community-colors.json` — 12-hue community palette (CLAUDE.md configurability rule)

**Modified files:**
- `src/ui/component/mine/multi-lens-graph/types.ts:3` — Add `'gap-analysis'` to `LensType`
- `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx:30` — Add gap-analysis to `LENS_CONFIG`
- `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts` — Branch for `'gap-analysis'` layout
- `src/core/constant.ts` — UI constants (node sizing, color palette fallback)

**Estimated scope:** ~1000 lines UI + ~200 lines layout

### Phase 4: Action execution + incremental updates + polish (3-5 days)

**New files:**
- `src/service/actions/addLinkAction.ts` — Insert wikilink into source note
- `src/service/actions/createBridgeNoteAction.ts` — Create note from bridge template
- `templates/config/bridge-note-template.hbs` — Bridge note template

**Modified files:**
- `src/service/search/index/helper/structural/orchestrator.ts` — Incremental update (dirty propagation + local Louvain)
- Integration with vault event listener (`main.ts` or `IndexService`) for staleness tracking

**AI explanations (lazy):**
- `src/service/prompt/PromptId.ts` — Add `GapExplanation` prompt ID
- `src/core/template/TemplateRegistry.ts` — Register gap explanation template
- `templates/prompts/gap-explanation.hbs` — Prompt for LLM gap explanation
- `src/service/search/index/helper/structural/gapDetection.ts` — LLM pass for top N=5 gaps on first view

**Estimated scope:** ~500 lines actions + ~200 lines incremental + ~200 lines LLM integration

### Estimated totals

| Phase | New lines | Modified lines | New files |
|-------|-----------|---------------|-----------|
| 1. Algorithms + data model | ~1900 | ~100 | 8 |
| 2. Persistence + integration | ~600 | ~300 | 3 |
| 3. UI panel | ~1200 | ~100 | 8 |
| 4. Actions + incremental + polish | ~900 | ~150 | 4 |
| **Total** | **~4600** | **~650** | **23** |

### Dependencies

```
Phase 1 ──→ Phase 2 ──┬→ Phase 3
                       └→ Phase 4
```

Phase 3 and Phase 4 can be parallelized after Phase 2 lands.

### Cross-feature synergies

- **S2 Vault Lint**: `structural_holes` table directly feeds "topic blind spot" in Vault Lint without re-computation
- **S3 Cascade Update**: Hook structural metric invalidation into the cascade pipeline for freshness
- **S5 PPR Search**: Brandes traversal shares edge-loading patterns with PPR random walks — unified graph loading
- **S6 Precompiled Knowledge**: Community metadata feeds community-level summaries (GraphRAG pattern)

### Key code anchors (quick reference)

| What | Where |
|------|-------|
| `HubRole` union + `HubCandidate` type | `hub/types.ts:16, 87` |
| Hub scoring formula | `hubDiscover.ts:2317` |
| Bridge role inference | `localGraphAssembler.ts:256` |
| Per-path betweenness proxy | `find-path.ts:1680-1706` |
| Key-node degree classification | `find-key-nodes.ts:218-234` |
| Label propagation (UI layer) | `graph-viz/utils/community.ts:11` |
| `mobius_node` DDL | `ddl.ts:556` |
| Edge type constants | `graph.po.ts:23-38` |
| `LensType` union | `multi-lens-graph/types.ts:3` |
| `LENS_CONFIG` array | `MultiLensGraph.tsx:30` |
| `ToolTemplateId` enum | `TemplateRegistry.ts` |
| MCP tool handlers | `vaultMcpServer.ts` |

---

## Appendix A: Algorithm Pseudocode

### A.1 Brandes betweenness (exact, unweighted)

```
function brandes(G):
  CB = Map<node, 0>
  for s in V(G):
    S = empty stack
    P = Map<node, []>       // predecessors
    σ = Map<node, 0>; σ[s] = 1  // shortest path counts
    d = Map<node, -1>; d[s] = 0  // distances
    Q = queue(s)
    while Q not empty:
      v = dequeue(Q)
      push(S, v)
      for w in neighbors(v):
        if d[w] < 0:
          enqueue(Q, w)
          d[w] = d[v] + 1
        if d[w] == d[v] + 1:
          σ[w] += σ[v]
          P[w].append(v)
    δ = Map<node, 0>
    while S not empty:
      w = pop(S)
      for v in P[w]:
        δ[v] += (σ[v] / σ[w]) * (1 + δ[w])
      if w ≠ s:
        CB[w] += δ[w]
  n = |V(G)|
  for v in V(G):
    CB[v] /= ((n-1) * (n-2))  // undirected normalization
  return CB
```

### A.2 Louvain community detection

```
function louvain(G):
  community = Map<node, node>  // each node starts as own community
  improved = true
  while improved:
    improved = false
    for v in V(G) sorted by node_id:  // deterministic order
      best_community = community[v]
      best_gain = 0
      for c in set(community[w] for w in neighbors(v)):
        gain = modularity_gain(G, v, current=community[v], target=c)
        if gain > best_gain:
          best_gain = gain
          best_community = c
      if best_community ≠ community[v]:
        community[v] = best_community
        improved = true
  // Phase 2: aggregate communities into super-nodes, repeat
  // Stop when no improvement across full iteration
  return community, Q
```

### A.3 Burt constraint

```
function constraint(G, i):
  N_i = neighbors(G, i)
  if |N_i| == 0: return 1.0
  W_i = sum(weight(i,j) for j in N_i)
  C = 0
  for j in N_i:
    p_ij = weight(i,j) / W_i
    indirect = 0
    for q in N_i:
      if q == j: continue
      p_iq = weight(i,q) / W_i
      W_q = sum(weight(q,k) for k in neighbors(G,q))
      p_qj = weight(q,j) / W_q if j in neighbors(G,q) else 0
      indirect += p_iq * p_qj
    C += (p_ij + indirect)²
  return C
```

---

## Appendix B: Design Decisions

### B.1 Brandes exact vs approximate

For vaults up to 10K document nodes, exact Brandes completes in seconds. The implementation simplicity and correctness guarantee outweigh constant-factor speedups. The k-sample approximation path is specified for future-proofing but can be deferred until a user reports >10K documents.

### B.2 Louvain vs Leiden

Leiden guarantees connected communities. At <50K node scale, Louvain's simpler implementation (no refinement phase) produces equivalent quality. If quality proves insufficient, Leiden is a drop-in replacement.

### B.3 Label propagation coexistence

`community.ts` label propagation remains for the D3 canvas graph-viz rendering layer — it runs client-side on the visible subgraph and doesn't need persistence. Louvain results from `mobius_node.community_id` are the SSOT for analysis and gap detection. When Louvain data is available, graph-viz can optionally use it for coloring instead of re-running label propagation.

### B.4 Edge type selection rationale

| Edge type | Included | Why |
|-----------|----------|-----|
| `references` | Yes | Explicit user-created wikilink — strongest intentional signal |
| `references_resource` | Yes | Link to attachment — user intent |
| `semantic_related` | Yes (weighted) | Algorithmically discovered similarity — essential for gap detection |
| `tagged_*` | No | Tag co-occurrence creates implicit community signal; including as edges would over-connect the graph and dilute structural analysis |
| `contains` | No | Folder hierarchy is organizational, not conceptual; would merge folder-siblings into false communities |

### B.5 Performance budget

| Operation | Target | Notes |
|-----------|--------|-------|
| Full analysis (5K nodes) | < 10 seconds | Background task |
| Full analysis (10K nodes) | < 30 seconds | k-sample Brandes |
| Incremental invalidation (1 doc) | < 100ms | Mark dirty only, no recomputation |
| Community-only re-detection | < 1 second | Louvain only, no Brandes |
| UI render (community map) | < 100ms | Pre-computed layout, ReactFlow virtualization |
| Gap explanation (LLM) | < 5s per gap | Lazy, on first view, cached |

### B.6 Separate tables vs columns-only

Betweenness/constraint/community_id are added as columns on `mobius_node` because they are per-node properties that should be accessible via existing `MobiusNodeRepo` queries without JOINs. Community metadata and structural holes are separate tables because they describe relationships between communities, not individual nodes.
