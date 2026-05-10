# S4 Structural Hole / Hub Detection Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Brandes betweenness centrality, Burt structural constraint, Louvain community detection, and gap analysis — persisted to `vault.sqlite`, integrated into the hub discovery pipeline and `find-key-nodes` inspector tool, and surfaced via a dedicated Gap Analysis `ItemView` + a new `'gap-analysis'` lens in `MultiLensGraph`.

**Branch:** `feat/structural-hole`

**Architecture:** Four-phase pipeline. Phase 1 introduces the algorithm core under `src/service/search/index/helper/structural/` (new directory) and extends the SQLite schema with four new columns on `mobius_node` plus three new tables. Phase 2 adds `StructuralAnalysisRepo`, wires the orchestrator into `runMobiusGlobalMaintenance`, and enhances the inspector toolchain. Phase 3 builds the Gap Analysis UI panel. Phase 4 adds action execution (add link, create bridge note) and incremental staleness tracking.

**Spec:** `docs/superpowers/specs/2026-05-01-structural-hole-design.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/service/search/index/helper/structural/types.ts` | Shared types: `StructuralHole`, `CommunityInfo`, `BridgeNode`, `PotentialBridge`, `AnalysisGraph` |
| `src/service/search/index/helper/structural/buildAnalysisGraph.ts` | Load document+edge data from SQLite into weighted undirected adjacency list |
| `src/service/search/index/helper/structural/brandesBetweenness.ts` | Exact Brandes O(VE) + k-sample approximate for >10K nodes |
| `src/service/search/index/helper/structural/louvainCommunity.ts` | Louvain modularity optimization (deterministic: sorted node_id traversal) |
| `src/service/search/index/helper/structural/burtConstraint.ts` | Burt (1992) structural constraint coefficient |
| `src/service/search/index/helper/structural/gapDetection.ts` | Structural hole identification, gap scoring, bridge candidate selection |
| `src/service/search/index/helper/structural/orchestrator.ts` | Pipeline: buildGraph → Brandes → Louvain → constraint → gaps → persist |
| `src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts` | CRUD for `structural_analysis_state`, `community_metadata`, `structural_holes`; batch update columns on `mobius_node` |
| `src/service/tools/search-graph-inspector/find-structural-holes.ts` | New inspector tool — queries structural tables, returns gaps+bridges |
| `src/ui/view/gap-analysis/GapAnalysisView.tsx` | Obsidian `ItemView` — main panel container |
| `src/ui/view/gap-analysis/CommunityMap.tsx` | ReactFlow community visualization (clusters + gap arcs) |
| `src/ui/view/gap-analysis/GapDetailsSidebar.tsx` | Selected gap details + action buttons |
| `src/ui/view/gap-analysis/BridgeNodeList.tsx` | Bridge node table (BC, constraint, communities connected) |
| `src/ui/view/gap-analysis/SuggestedActions.tsx` | Add link / create bridge note actions |
| `src/ui/view/gap-analysis/gapAnalysisStore.ts` | Zustand store for gap analysis panel state |
| `src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts` | Layout for the `gap-analysis` lens |
| `src/service/actions/addLinkAction.ts` | Insert wikilink into source note's "Related" section |
| `src/service/actions/createBridgeNoteAction.ts` | Create note from bridge template |
| `templates/tools/structural-holes.hbs` | Handlebars output for `find-structural-holes` tool |
| `templates/config/community-colors.json` | 12-hue community color palette (configurability rule) |
| `templates/config/bridge-note-template.hbs` | Bridge note creation template |
| `templates/prompts/gap-explanation.hbs` | LLM prompt for lazy gap explanations |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/core/storage/sqlite/ddl.ts` | Add 4 columns to `mobius_node`; create 3 new tables + indexes (idempotent ALTERs) |
| `src/core/storage/sqlite/SqliteStoreManager.ts` | Register `StructuralAnalysisRepo`, expose via `getStructuralAnalysisRepo()` |
| `src/service/search/index/indexService.ts` | Add `'structural_analysis'` step inside `runMobiusGlobalMaintenance` (~line 1551) |
| `src/service/tools/search-graph-inspector/find-key-nodes.ts` | Expose `betweenness_centrality`, `community_id`, `structural_constraint` in output; add `'structural_hole_occupant'` nodeType |
| `src/core/template/TemplateRegistry.ts` | Add `ToolTemplateId.FindStructuralHoles`; add `ConfigTemplateId.CommunityColors`; register gap-explanation prompt |
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | Add MCP tools: `vault_get_clusters`, `vault_get_bridges`, `vault_find_gaps` |
| `src/ui/component/mine/multi-lens-graph/types.ts` | Add `'gap-analysis'` to `LensType`; add `gaps?` and `communityMetrics?` to `LensGraphData` |
| `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` | Add `gap-analysis` entry to `LENS_CONFIG` (`Layers` icon); add tooltip/empty message entries |
| `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts` | Branch for `'gap-analysis'` layout calling `computeGapAnalysisLayout` |
| `src/service/prompt/PromptId.ts` | Add `GapExplanation` to `PromptId` enum |
| `src/core/constant.ts` | Add structural analysis constants: thresholds, weights, UI sizing |

---

## Task 1: Schema — DDL + Type Additions

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts`
- Modify: `src/core/storage/sqlite/ddl.ts` (Database interface in the same file)

- [ ] **Step 1: Add columns to `mobius_node` (idempotent ALTERs)**

Find the vault-database `exec` block that creates `mobius_node` (around line 670 in ddl.ts). After the `CREATE TABLE IF NOT EXISTS mobius_node` block and its indexes, add a new `exec` block with idempotent column additions:

```typescript
// After the mobius_node CREATE TABLE block:
db.exec(`
  ALTER TABLE mobius_node ADD COLUMN betweenness_centrality REAL;
`);
db.exec(`
  ALTER TABLE mobius_node ADD COLUMN structural_constraint REAL;
`);
db.exec(`
  ALTER TABLE mobius_node ADD COLUMN community_id TEXT;
`);
db.exec(`
  ALTER TABLE mobius_node ADD COLUMN structural_analysis_version INTEGER;
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_mobius_node_community_id ON mobius_node(community_id);
`);
```

Wrap each `ALTER TABLE` in a try/catch so the migration is idempotent (pattern already used elsewhere in ddl.ts for schema evolution).

- [ ] **Step 2: Add three new tables**

In the same vault-database init, after the `mobius_edge` block, add:

```sql
CREATE TABLE IF NOT EXISTS structural_analysis_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_metadata (
  community_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  member_count INTEGER NOT NULL,
  dominant_topics_json TEXT NOT NULL,
  top_nodes_json TEXT NOT NULL,
  internal_density REAL NOT NULL,
  centroid_embedding BLOB,
  analysis_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS structural_holes (
  id TEXT PRIMARY KEY,
  community_a_id TEXT NOT NULL,
  community_b_id TEXT NOT NULL,
  gap_type TEXT NOT NULL,
  gap_score REAL NOT NULL,
  semantic_bridge_potential REAL NOT NULL,
  inter_density REAL NOT NULL,
  existing_bridge_count INTEGER NOT NULL,
  potential_bridges_json TEXT NOT NULL,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  analysis_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_structural_holes_score ON structural_holes(gap_score DESC);
CREATE INDEX IF NOT EXISTS idx_structural_holes_version ON structural_holes(analysis_version);
```

- [ ] **Step 3: Extend the `Database` TypeScript interface**

In the `Database` interface in `ddl.ts`, add the three new table types and extend the `mobius_node` column map with the four new nullable columns:

```typescript
// Add to mobius_node table type in Database interface:
betweenness_centrality: number | null;
structural_constraint: number | null;
community_id: string | null;
structural_analysis_version: number | null;

// New table types:
structural_analysis_state: { key: string; value: string };
community_metadata: {
  community_id: string; label: string; member_count: number;
  dominant_topics_json: string; top_nodes_json: string;
  internal_density: number; centroid_embedding: Buffer | null;
  analysis_version: number;
};
structural_holes: {
  id: string; community_a_id: string; community_b_id: string;
  gap_type: string; gap_score: number; semantic_bridge_potential: number;
  inter_density: number; existing_bridge_count: number;
  potential_bridges_json: string; explanation: string | null;
  status: string; analysis_version: number; created_at: number;
};
```

- [ ] **Step 4: Add constants to `src/core/constant.ts`**

```typescript
// Structural analysis thresholds (Burt + Brandes + Louvain)
export const STRUCTURAL_ANALYSIS_APPROX_THRESHOLD = 10_000; // nodes: above this, use k-sample Brandes
export const STRUCTURAL_ANALYSIS_APPROX_K = 500;            // sample size for approximate Brandes
export const LOUVAIN_RESOLUTION = 1.0;                      // γ parameter
export const LOUVAIN_MIN_COMMUNITY_SIZE = 3;                // merge smaller communities
export const GAP_DENSITY_THRESHOLD = 0.01;                  // max inter-community density to flag gap
export const GAP_INTRA_DENSITY_MIN = 0.05;                  // min intra-density for a real cluster
export const GAP_COMMUNITY_SIZE_MIN = 5;                    // min members to participate in gap analysis
export const GAP_SEMANTIC_THRESHOLD = 0.3;                  // min cross-community similarity to flag gap
export const STRUCTURAL_HOLE_OCCUPANT_BC_MIN = 0.1;         // betweenness threshold
export const STRUCTURAL_HOLE_OCCUPANT_CONSTRAINT_MAX = 0.3; // constraint threshold

// Gap scoring weights (sum to 1.0)
export const GAP_WEIGHT_SEMANTIC = 0.5;
export const GAP_WEIGHT_SIZE = 0.2;
export const GAP_WEIGHT_ISOLATION = 0.3;

// UI constants
export const COMMUNITY_NODE_SIZE_MIN = 24;  // px
export const COMMUNITY_NODE_SIZE_MAX = 64;  // px
export const COMMUNITY_COLORS_FALLBACK = [  // used when community-colors.json not loaded
  '#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7',
  '#fab387', '#94e2d5', '#f38ba8', '#74c7ec',
  '#b4befe', '#eba0ac', '#a6adc8', '#9399b2',
];
```

- [ ] **Step 5: Build verify**

```bash
npm run build
```

Expected: No type errors. New columns appear in Kysely schema.

- [ ] **Step 6: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts src/core/constant.ts
git commit -m "feat(structural-hole): DDL schema — 4 mobius_node columns + 3 new tables + constants"
```

---

## Task 2: Algorithm Core — Types + Graph Builder + Brandes + Louvain + Burt

**Files:**
- New: `src/service/search/index/helper/structural/types.ts`
- New: `src/service/search/index/helper/structural/buildAnalysisGraph.ts`
- New: `src/service/search/index/helper/structural/brandesBetweenness.ts`
- New: `src/service/search/index/helper/structural/louvainCommunity.ts`
- New: `src/service/search/index/helper/structural/burtConstraint.ts`

- [ ] **Step 1: Create `structural/types.ts`**

Define the shared type surface:

```typescript
// src/service/search/index/helper/structural/types.ts

export interface AnalysisNode {
  id: string;       // mobius_node.node_id
  path: string;
}

export interface AnalysisEdge {
  from: string;
  to: string;
  weight: number;   // references=1.0, references_resource=1.0, semantic_related=edge.weight (cost=max(0.1, 1-w))
}

export interface AnalysisGraph {
  nodes: AnalysisNode[];
  /** Weighted undirected adjacency map: nodeId → Map<neighborId, weight> */
  adjacency: Map<string, Map<string, number>>;
  nodeCount: number;
  edgeCount: number;
}

export interface CommunityInfo {
  id: string;               // e.g. "c_0", "c_5"
  label: string;            // derived from dominant topic tags
  memberCount: number;
  internalDensity: number;
  topNodes: Array<{ path: string; label: string; betweenness: number }>;
  dominantTopics: string[];
}

export interface BridgeNode {
  path: string;
  label: string;
  betweenness: number;
  constraint: number;
  communitiesConnected: string[];
  fragility: 'critical' | 'moderate' | 'stable';
}

export interface PotentialBridge {
  sourceNode: { path: string; label: string; community: string };
  targetNode: { path: string; label: string; community: string };
  semanticSimilarity: number;
  suggestedAction: 'add_link' | 'create_note';
  rationale: string;
}

export interface StructuralHole {
  id: string;
  communityA: CommunityInfo;
  communityB: CommunityInfo;
  gapScore: number;
  gapType: 'missing_bridge' | 'weak_bridge' | 'latent_connection' | 'topic_blind_spot' | 'decaying_bridge';
  semanticBridgePotential: number;
  existingBridges: BridgeNode[];
  potentialBridges: PotentialBridge[];
  explanation?: string;
}

export interface StructuralAnalysisResult {
  betweenness: Map<string, number>;         // nodeId → normalized [0,1]
  communities: Map<string, string>;         // nodeId → communityId
  constraint: Map<string, number>;          // nodeId → constraint coefficient
  communityInfos: CommunityInfo[];
  structuralHoles: StructuralHole[];
  modularityQ: number;
  analysisVersion: number;
  computedAt: number;
}
```

- [ ] **Step 2: Create `buildAnalysisGraph.ts`**

Loads document nodes (type `IN ('document', 'hub_doc')`) and edges (type `IN ('references', 'references_resource', 'semantic_related')`) from SQLite into a weighted undirected adjacency map. Uses `sqliteStoreManager.getMobiusNodeRepo()` and `getMobiusEdgeRepo()` directly (pattern from `find-key-nodes.ts:34`). Edge weighting: `references` = 1.0, `references_resource` = 1.0, `semantic_related` = `max(0.1, 1 - edge.weight)` (inverted for path distance). For undirected representation, insert both `A→B` and `B→A` with the same weight.

- [ ] **Step 3: Create `brandesBetweenness.ts`**

Implement Brandes (2001) exact algorithm (spec Appendix A.1). The function signature:

```typescript
export function brandes(graph: AnalysisGraph): Map<string, number>
```

Algorithm (exact, O(VE)):
1. Initialize `CB = Map<nodeId, 0>` for all nodes.
2. For each source `s` in `graph.nodes`:
   - BFS forward pass: compute shortest path counts `σ[t]` and predecessors `P[t]`.
   - Stack `S` collects nodes in non-increasing distance order.
   - Backward pass: for each `w` in `S` (pop order), for each `v ∈ P[w]`: `δ[v] += (σ[v]/σ[w]) * (1 + δ[w])`. Then `CB[w] += δ[w]` if `w ≠ s`.
3. Normalize: `CB[v] /= ((n-1) * (n-2))` (undirected: divide by 2 additional factor for undirected is already accounted for by treating each edge bidirectionally).
4. Return values normalized to `[0, 1]` by dividing by `max(CB)` (or 1 if max is 0).

For vaults > `STRUCTURAL_ANALYSIS_APPROX_THRESHOLD` nodes, use k-sample approximation: sample `STRUCTURAL_ANALYSIS_APPROX_K` source nodes uniformly at random, scale by `n / k`.

- [ ] **Step 4: Create `louvainCommunity.ts`**

Implement Louvain (Blondel et al. 2008) for undirected weighted graphs. Function signature:

```typescript
export function louvain(
  graph: AnalysisGraph,
  resolution: number
): { communities: Map<string, string>; modularityQ: number }
```

Phase 1 (local moves): For each node traversed in sorted `node_id` order (determinism):
- Compute modularity gain `ΔQ` of moving node `v` to each neighbor's community: `ΔQ = [Σ_in + 2 * k_{v,in}] / (2m) - [(Σ_tot + k_v) / (2m)]² - Σ_in/(2m) + (Σ_tot/(2m))² + (k_v/(2m))²` where `Σ_in` = sum of edge weights inside target community, `k_{v,in}` = weights of edges from v to target community, `Σ_tot` = sum of degrees in target community, `k_v` = degree of v, `m` = total edge weight.
- Move to community with max positive `ΔQ`. Repeat until no improvement.

Phase 2 (aggregation): Build super-node graph, repeat Phase 1 until Q converges.

Post-process: communities with fewer than `LOUVAIN_MIN_COMMUNITY_SIZE` members are merged into the nearest community by inter-community edge weight.

Assign community IDs as strings `"c_0"`, `"c_1"`, etc.

- [ ] **Step 5: Create `burtConstraint.ts`**

Implement Burt (1992) constraint coefficient. Function signature:

```typescript
export function computeConstraint(graph: AnalysisGraph): Map<string, number>
```

For each node `i`:
```
C(i) = Σ_j (p_ij + Σ_q p_iq * p_qj)²
where p_ij = w_ij / Σ_k w_ik
```
- `p_ij`: proportion of `i`'s total edge weight invested in neighbor `j`.
- Inner sum `Σ_q p_iq * p_qj`: indirect connection through mutual neighbors (q ∈ neighbors(i), q ≠ j); `p_qj = w_qj / Σ_k w_qk` if `j ∈ neighbors(q)`, else 0.
- Isolated nodes (no neighbors): return constraint = 1.0.

Typical range 0.05–1.0; no normalization needed (raw values are meaningful).

- [ ] **Step 6: Write tests**

In `test/structural-algorithms.test.ts`:

```typescript
// Test 1: Brandes on barbell graph (two 5-cliques + 1 bridge node)
// Expected: bridge node BC ≈ 1.0 (normalized max), clique-interior nodes BC near 0

// Test 2: Brandes on star graph (center + 5 leaves)
// Expected: center BC ≈ 1.0, leaves BC = 0

// Test 3: Louvain on planted partition (two dense groups, sparse inter-edges)
// Expected: detects 2 communities, Q > 0.3

// Test 4: Burt constraint on star (center has low constraint ≈ 0, leaves have high ≈ 1)
// Expected: center constraint < 0.3, leaf constraint > 0.8

// Test 5: Burt constraint on complete graph K4
// Expected: all nodes have equal, high constraint
```

- [ ] **Step 7: Build verify**

```bash
npm run build && npm run test -- test/structural-algorithms.test.ts
```

Expected: All 5 tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/service/search/index/helper/structural/ test/structural-algorithms.test.ts
git commit -m "feat(structural-hole): algorithm core — Brandes betweenness, Louvain community, Burt constraint"
```

---

## Task 3: Gap Detection + Orchestrator

**Files:**
- New: `src/service/search/index/helper/structural/gapDetection.ts`
- New: `src/service/search/index/helper/structural/orchestrator.ts`

- [ ] **Step 1: Create `gapDetection.ts`**

Inputs: `betweenness`, `communities`, `constraint`, graph, and community info (dominant topics from `mobius_edge` `tagged_topic` edges, centroid embeddings from `EmbeddingRepo`).

**Gap detection criteria** (spec §3.1):
1. `density(A, B) = |edges(A,B)| / (|A| × |B|) < GAP_DENSITY_THRESHOLD` (0.01)
2. Both communities have internal density > `GAP_INTRA_DENSITY_MIN` (0.05)
3. Both communities have `>= GAP_COMMUNITY_SIZE_MIN` (5) members
4. Semantic proximity: cross-community cosine similarity of centroid embeddings > `GAP_SEMANTIC_THRESHOLD` (0.3)

**Gap scoring** (spec §3.2):
```typescript
gap_score = GAP_WEIGHT_SEMANTIC * semantic_bridge_potential   // 0.5
          + GAP_WEIGHT_SIZE * size_factor                      // 0.2
          + GAP_WEIGHT_ISOLATION * isolation_severity          // 0.3

// size_factor = log(|A| + |B|) / log(max_community_size)
// isolation_severity = 1 - density(A, B)
// semantic_bridge_potential = max cosine similarity between any embedding in A and any in B
```

**Gap type classification** (spec §3.3):
- `missing_bridge`: zero inter-community edges
- `weak_bridge`: 1 inter-community edge (single articulation point)
- `latent_connection`: unlinked mention detected (skip if `unlinkedMentionService` not yet available — emit `missing_bridge` as fallback)
- `topic_blind_spot`: community with near-zero edges to ALL other communities (internal density > threshold, external density < 0.005)
- `decaying_bridge`: bridge node with `updated_at < (now - 90 days)` and high betweenness

**Bridge candidate identification** (spec §3.4):
- Existing bridges: nodes with edges into both communities A and B; fragility = `critical` (only bridge), `moderate` (1 of 2-3), `stable` (1 of 4+).
- Potential bridges: top-3 cross-community pairs by cosine similarity from `EmbeddingRepo.getEmbeddingForSemanticSearch()`.
- Stable gap ID: `sha256(sorted([communityA.id, communityB.id]).join(':'))`.

- [ ] **Step 2: Create `orchestrator.ts`**

```typescript
// src/service/search/index/helper/structural/orchestrator.ts
export async function runStructuralAnalysis(options?: {
  forceFullRecompute?: boolean;
  louvainResolution?: number;
}): Promise<StructuralAnalysisResult>
```

Pipeline:
1. Check `structural_analysis_state.last_computed_at` and `node_count_at_computation` — skip if fresh and unchanged by < 10%.
2. `buildAnalysisGraph()` — load from vault SQLite.
3. `brandes(graph)` → `betweenness`.
4. `louvain(graph, resolution)` → `{ communities, modularityQ }`.
5. `computeConstraint(graph)` → `constraint`.
6. Build `CommunityInfo` array: for each community, load member paths, compute internal density, fetch top-5 nodes by betweenness, derive label from dominant `tagged_topic` edges.
7. `detectStructuralHoles(...)` → `StructuralHole[]`.
8. Persist via `StructuralAnalysisRepo`: batch-update `betweenness_centrality`, `structural_constraint`, `community_id`, `structural_analysis_version` on `mobius_node`; upsert `community_metadata` rows; upsert `structural_holes` rows; update `structural_analysis_state`.
9. Return `StructuralAnalysisResult`.

Run as background task with `setTimeout(..., 0)` — never blocks UI thread. Log timing via existing `Stopwatch` pattern.

- [ ] **Step 3: Build verify**

```bash
npm run build
```

Expected: No errors in new files.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/helper/structural/gapDetection.ts src/service/search/index/helper/structural/orchestrator.ts
git commit -m "feat(structural-hole): gap detection + analysis orchestrator pipeline"
```

---

## Task 4: Persistence + Hub Integration + Inspector Tool

**Files:**
- New: `src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts`
- New: `src/service/tools/search-graph-inspector/find-structural-holes.ts`
- New: `templates/tools/structural-holes.hbs`
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts`
- Modify: `src/service/search/index/indexService.ts`
- Modify: `src/service/tools/search-graph-inspector/find-key-nodes.ts`
- Modify: `src/core/template/TemplateRegistry.ts`
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts`

- [ ] **Step 1: Create `StructuralAnalysisRepo.ts`**

Constructor takes `Kysely<Database>`. Follow `MobiusNodeRepo` pattern. Key methods:

```typescript
class StructuralAnalysisRepo {
  // mobius_node updates
  async batchUpdateStructuralMetrics(
    rows: Array<{ nodeId: string; betweenness: number; constraint: number; communityId: string; version: number }>
  ): Promise<void>

  async markNodesDirty(nodeIds: string[]): Promise<void>  // sets structural_analysis_version = NULL

  // structural_analysis_state
  async getState(key: string): Promise<string | null>
  async setState(key: string, value: string): Promise<void>

  // community_metadata
  async upsertCommunities(communities: CommunityInfo[], version: number): Promise<void>
  async getCommunities(): Promise<CommunityInfo[]>
  async getCommunityById(communityId: string): Promise<CommunityInfo | null>

  // structural_holes
  async upsertHoles(holes: StructuralHole[], version: number): Promise<void>
  async getTopHoles(limit: number): Promise<StructuralHole[]>
  async getHoleById(id: string): Promise<StructuralHole | null>
  async updateHoleExplanation(id: string, explanation: string): Promise<void>
  async updateHoleStatus(id: string, status: 'open' | 'addressed' | 'dismissed'): Promise<void>

  // bridge queries
  async getTopBridgeNodes(limit: number): Promise<Array<{
    nodeId: string; path: string; label: string;
    betweenness: number; constraint: number; communityId: string;
  }>>
}
```

`batchUpdateStructuralMetrics` uses kysely `insertInto(...).values(...).onConflict(...)` pattern in chunks of 500.

- [ ] **Step 2: Register in `SqliteStoreManager.ts`**

Add private `structuralAnalysisRepo: StructuralAnalysisRepo | null = null` field. Add `getStructuralAnalysisRepo(): StructuralAnalysisRepo` getter following the existing repo getter pattern (init on first call, uses `this.searchStore`).

- [ ] **Step 3: Wire into `runMobiusGlobalMaintenance`**

In `src/service/search/index/indexService.ts`, after the `'semantic_pagerank'` step (~line 1549) and before `'folder_hub_stats'`, add:

```typescript
if (tenants.includes('vault')) {
  sw.start('structural_analysis');
  await runStructuralAnalysis({ louvainResolution: LOUVAIN_RESOLUTION });
  sw.stop();
}
```

Import `runStructuralAnalysis` from `../helper/structural/orchestrator`. This runs structural analysis as part of the existing global maintenance cycle.

- [ ] **Step 4: Enhance `find-key-nodes.ts`**

After the `calculateKeyNoteRRFScores` call in `findKeyNodes`, do a single batch lookup for structural metrics on the candidate node IDs via `sqliteStoreManager.getStructuralAnalysisRepo().batchGetMetrics(candidateNodeIds)`. Extend the `KeyNode` type:

```typescript
type KeyNode = {
  // existing fields...
  betweenness?: number;
  constraint?: number;
  communityId?: string;
  structuralRole?: 'structural_hole_occupant' | undefined;
};
```

Set `structuralRole = 'structural_hole_occupant'` when `betweenness > STRUCTURAL_HOLE_OCCUPANT_BC_MIN && constraint < STRUCTURAL_HOLE_OCCUPANT_CONSTRAINT_MAX` (constants from `constant.ts`). These fields pass through to the existing `buildResponse` / Handlebars template path.

Override `nodeType = 'bridge'` for structural hole occupants (algorithmic override of degree heuristic).

- [ ] **Step 5: Create `find-structural-holes.ts`**

New inspector tool following the `find-key-nodes.ts` pattern:

```typescript
export async function findStructuralHoles(params: FindStructuralHolesParams, templateManager?: TemplateManager) {
  const repo = sqliteStoreManager.getStructuralAnalysisRepo();
  const holes = await repo.getTopHoles(params.limit ?? 10);
  const bridges = await repo.getTopBridgeNodes(params.bridge_limit ?? 8);
  const communities = await repo.getCommunities();
  const data = { holes, bridges, communities };
  return buildResponse(response_format, ToolTemplateId.FindStructuralHoles, data, { templateManager });
}
```

Register input schema in `src/core/schemas/tools/searchGraphInspector.ts`.

- [ ] **Step 6: Register template + add MCP tools**

In `TemplateRegistry.ts`:
- Add `FindStructuralHoles: 'find-structural-holes'` to `ToolTemplateId`.
- Add `CommunityColors: 'config-community-colors'` to `ConfigTemplateId`.
- Add TEMPLATE_METADATA entries for both + the gap-explanation prompt.

In `vaultMcpServer.ts`, add three MCP tool handlers:
- `vault_get_clusters()` — calls `repo.getCommunities()`, returns array of `{ id, label, memberCount, dominantTopics }`.
- `vault_get_bridges()` — calls `repo.getTopBridgeNodes(20)`.
- `vault_find_gaps()` — calls `repo.getTopHoles(10)`, returns gaps with scores and potential bridges.

- [ ] **Step 7: Create Handlebars template `templates/tools/structural-holes.hbs`**

Render gap list with community labels, scores, gap types, existing bridges, and suggested actions. Follow the pattern in existing `templates/tools/find-key-nodes.hbs`.

- [ ] **Step 8: Build verify**

```bash
npm run build
```

Expected: No type errors. `StructuralAnalysisRepo` accessible via `sqliteStoreManager`.

- [ ] **Step 9: Commit**

```bash
git add src/core/storage/sqlite/repositories/StructuralAnalysisRepo.ts \
        src/core/storage/sqlite/SqliteStoreManager.ts \
        src/service/search/index/indexService.ts \
        src/service/tools/search-graph-inspector/find-key-nodes.ts \
        src/service/tools/search-graph-inspector/find-structural-holes.ts \
        src/core/template/TemplateRegistry.ts \
        src/service/agents/vault-sdk/vaultMcpServer.ts \
        templates/tools/structural-holes.hbs
git commit -m "feat(structural-hole): persistence repo + hub integration + find-structural-holes tool + MCP"
```

---

## Task 5: MultiLensGraph — Gap Analysis Lens

**Files:**
- Modify: `src/ui/component/mine/multi-lens-graph/types.ts`
- Modify: `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx`
- Modify: `src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts`
- New: `src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts`
- New: `templates/config/community-colors.json`

- [ ] **Step 1: Extend `types.ts`**

Add `'gap-analysis'` to the `LensType` union:

```typescript
// types.ts line 3
export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline' | 'gap-analysis';
```

Extend `LensGraphData` with optional gap-analysis fields:

```typescript
export interface LensGraphData {
  // existing fields...
  gaps?: Array<{
    id: string;
    communityA: string;
    communityB: string;
    score: number;
    suggestedBridges: number;
    gapType: string;
  }>;
  communityMetrics?: Array<{
    id: string;
    label: string;
    memberCount: number;
    color: string;
  }>;
}
```

Extend `LensNodeData` with optional structural metrics:

```typescript
export interface LensNodeData extends Record<string, unknown> {
  // existing fields...
  betweenness?: number;     // [0,1] — drives node sizing in gap-analysis lens
  constraint?: number;      // Burt coefficient — drives opacity
  communityId?: string;     // Louvain community — drives color
}
```

- [ ] **Step 2: Add entry to `LENS_CONFIG` in `MultiLensGraph.tsx`**

```typescript
import { Network, GitBranch, Waypoints, Clock, Layers } from 'lucide-react';

const LENS_CONFIG = [
  { type: 'topology', icon: Network, label: 'Topology' },
  { type: 'thinking-tree', icon: GitBranch, label: 'Thinking Tree' },
  { type: 'bridge', icon: Waypoints, label: 'Bridges' },
  { type: 'timeline', icon: Clock, label: 'Timeline' },
  { type: 'gap-analysis', icon: Layers, label: 'Gaps' },  // NEW
];
```

Add tooltip and empty message entries for `'gap-analysis'`:

```typescript
const LENS_TOOLTIPS = {
  // existing...
  'gap-analysis': 'Structural holes and knowledge gap analysis across topic communities',
};

const LENS_EMPTY_MESSAGES = {
  // existing...
  'gap-analysis': 'Run gap analysis to detect structural holes. Click Refresh to compute.',
};
```

- [ ] **Step 3: Create `gap-analysis-layout.ts`**

```typescript
// src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts
import type { LensGraphData, LensNode, LensEdge } from '../types';
import { COMMUNITY_NODE_SIZE_MIN, COMMUNITY_NODE_SIZE_MAX, COMMUNITY_COLORS_FALLBACK } from '@/core/constant';

export function computeGapAnalysisLayout(
  data: LensGraphData
): { nodes: LensNode[]; edges: LensEdge[] }
```

- Nodes sized proportionally to `betweenness`: `size = COMMUNITY_NODE_SIZE_MIN + betweenness * (COMMUNITY_NODE_SIZE_MAX - COMMUNITY_NODE_SIZE_MIN)`.
- Nodes colored by `communityId`: load color from `communityMetrics` color field or fallback to `COMMUNITY_COLORS_FALLBACK[hash % 12]`.
- Bridge nodes (those connecting 2+ communities by checking `data.bridges`) get `role = 'bridge'` in `LensNodeData`.
- Community-aware force layout: group nodes by `communityId`, arrange communities on a circle with radius proportional to `sqrt(memberCount)`, then position member nodes in a sub-circle within each community group.
- Returns structural hole arcs as `LensEdge` entries with `kind = 'cross-domain'` and a `data.isGapArc = true` marker for custom rendering (dashed red style in `LensEdgeComponent`).

- [ ] **Step 4: Wire layout into `useLensLayout.ts`**

Import `computeGapAnalysisLayout` and add a branch:

```typescript
import { computeGapAnalysisLayout } from '../layouts/gap-analysis-layout';

// In useLensLayout, add case:
case 'gap-analysis': {
  const { nodes, edges } = computeGapAnalysisLayout(data);
  return { nodes, edges };
}
```

- [ ] **Step 5: Create `templates/config/community-colors.json`**

12-hue palette (CLAUDE.md configurability rule — editable without code changes):

```json
{
  "palette": [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
    "#59a14f", "#edc948", "#b07aa1", "#ff9da7",
    "#9c755f", "#bab0ac", "#d37295", "#fabfd2"
  ],
  "bridgeColor": "#f38ba8",
  "gapArcColor": "#e15759"
}
```

Register as `ConfigTemplateId.CommunityColors` in `TemplateRegistry.ts`.

- [ ] **Step 6: Build verify**

```bash
npm run build
```

Expected: `LensType` union includes `'gap-analysis'`, no type errors in layout files.

- [ ] **Step 7: Commit**

```bash
git add src/ui/component/mine/multi-lens-graph/types.ts \
        src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx \
        src/ui/component/mine/multi-lens-graph/hooks/useLensLayout.ts \
        src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts \
        templates/config/community-colors.json
git commit -m "feat(structural-hole): gap-analysis lens in MultiLensGraph — layout + community coloring + gap arcs"
```

---

## Task 6: Gap Analysis UI Panel (ItemView)

**Files:**
- New: `src/ui/view/gap-analysis/GapAnalysisView.tsx`
- New: `src/ui/view/gap-analysis/CommunityMap.tsx`
- New: `src/ui/view/gap-analysis/GapDetailsSidebar.tsx`
- New: `src/ui/view/gap-analysis/BridgeNodeList.tsx`
- New: `src/ui/view/gap-analysis/SuggestedActions.tsx`
- New: `src/ui/view/gap-analysis/gapAnalysisStore.ts`

- [ ] **Step 1: Create `gapAnalysisStore.ts`**

Zustand store. State:

```typescript
interface GapAnalysisState {
  holes: StructuralHole[];
  bridges: BridgeNode[];
  communities: CommunityInfo[];
  selectedHoleId: string | null;
  modularityQ: number;
  lastComputedAt: number | null;
  staleNodeCount: number;
  isLoading: boolean;
  // Actions
  loadData: () => Promise<void>;
  selectHole: (id: string | null) => void;
  triggerRecompute: () => Promise<void>;
  dismissHole: (id: string) => Promise<void>;
  markHoleAddressed: (id: string) => Promise<void>;
}
```

`loadData()` reads from `StructuralAnalysisRepo` via `sqliteStoreManager.getStructuralAnalysisRepo()`.
`triggerRecompute()` calls `runStructuralAnalysis({ forceFullRecompute: true })` then reloads.

- [ ] **Step 2: Create `GapAnalysisView.tsx`**

Obsidian `ItemView` subclass (pattern from existing views in `src/ui/view/`). Renders a React root mounting the gap analysis panel. Header shows: "Gap Analysis" title + `[Refresh]` Button (Lucide `RefreshCw` icon) + metadata row: "Last computed: X ago · Y communities · Q=0.47".

Layout (horizontal split):
- Left 60%: `<CommunityMap />` — ReactFlow canvas
- Right 40%: `<GapDetailsSidebar />` when `selectedHoleId` set, else gap list

Below the split: `<BridgeNodeList />` + `<SuggestedActions />`

All state via `gapAnalysisStore`. Calls `store.loadData()` on mount.

- [ ] **Step 3: Create `CommunityMap.tsx`**

`@xyflow/react` canvas. Renders nodes and edges from `computeGapAnalysisLayout(lensData)`. Node sizing by betweenness, coloring by community, double-ring border for bridge nodes (`border-double` Tailwind class). Gap arc edges rendered as dashed red (`borderStyle: 'dashed'`, color `#e15759` from community-colors.json). On node click: calls `store.selectHole(null)` and opens Obsidian file. On gap arc click: calls `store.selectHole(gapId)`.

Semantic zoom: two levels. Default (vault-level): convex hull per community using a simplified hull rendering (polygon around outermost nodes). Click hull to filter to community-level view showing only member nodes.

No emojis — use Lucide `Triangle` icon for gap markers.

- [ ] **Step 4: Create `GapDetailsSidebar.tsx`**

When `selectedHoleId` is set, shows:
- Community A and B labels + member counts + dominant topics (as `<span>` tags with Tailwind classes, no `<h*>` or `<p>`)
- Gap score: `score.toFixed(2)` with star rating (`★` characters via text, not emojis — use filled/empty `●○` circles instead)
- Gap type badge: `<span className="pktw-rounded pktw-text-xs pktw-px-2 pktw-py-0.5 pktw-bg-pk-surface-subtle">` with gap type string
- AI explanation (lazy — load on first open via LLM call, show Lucide `Loader2` spinner while loading; cache in `structural_holes.explanation`)
- `<PotentialBridge />` list with semantic similarity and action buttons
- `<ExistingBridge />` list with fragility badge
- `[Dismiss]` + `[Mark Addressed]` Buttons at bottom

- [ ] **Step 5: Create `BridgeNodeList.tsx`**

Table-style list of top bridge nodes. Columns: note label (clickable to open file), BC score, constraint, communities connected (community labels as comma-separated spans). No raw `<button>` — use shadcn `Button`. No `<table>` — use `<div>` grid layout with Tailwind.

- [ ] **Step 6: Create `SuggestedActions.tsx`**

Renders top 5 `PotentialBridge` entries (highest `semanticSimilarity`). Each card:
- Source and target note labels with community badges
- Semantic similarity score
- Rationale text (from `PotentialBridge.rationale`)
- `[Add Link]` Button → calls `addLinkAction` (Task 7)
- `[Create Bridge Note]` Button → calls `createBridgeNoteAction` (Task 7)

Extract each card as a separate component (`SuggestedActionCard`) per the ~8-line extraction rule.

- [ ] **Step 7: Build verify**

```bash
npm run build
```

Expected: No type errors in view files.

- [ ] **Step 8: Commit**

```bash
git add src/ui/view/gap-analysis/
git commit -m "feat(structural-hole): Gap Analysis ItemView — community map, sidebar, bridge list, actions"
```

---

## Task 7: Action Execution + Incremental Updates + Command Registration

**Files:**
- New: `src/service/actions/addLinkAction.ts`
- New: `src/service/actions/createBridgeNoteAction.ts`
- New: `templates/config/bridge-note-template.hbs`
- New: `templates/prompts/gap-explanation.hbs`
- Modify: `src/service/prompt/PromptId.ts`
- Modify: `src/service/search/index/helper/structural/orchestrator.ts` (incremental updates)

- [ ] **Step 1: Create `addLinkAction.ts`**

```typescript
// src/service/actions/addLinkAction.ts
export async function addLinkAction(params: {
  sourcePath: string;
  targetPath: string;
  app: App;
}): Promise<void>
```

Reads source note content. If a `## Related` section exists, append `[[targetPath]]` link inside it. Otherwise append `\n\n## Related\n- [[targetPath]]` at end of file. Uses Obsidian `app.vault.modify()`. After modification, trigger incremental structural update: mark source node dirty via `StructuralAnalysisRepo.markNodesDirty([sourceNodeId])`.

- [ ] **Step 2: Create `createBridgeNoteAction.ts`**

```typescript
export async function createBridgeNoteAction(params: {
  gap: StructuralHole;
  app: App;
}): Promise<TFile>
```

Loads `bridge-note-template.hbs` via `TemplateManager`. Renders with `gap.communityA.label`, `gap.communityB.label`, top nodes from both communities as wikilinks. Creates file in vault root (or user-configured notes folder). Opens the new file in Obsidian. Returns the `TFile`.

- [ ] **Step 3: Create template files**

`templates/config/bridge-note-template.hbs`:
```handlebars
---
tags: [bridge-note, {{communityA.label}}, {{communityB.label}}]
---

# Bridge: {{communityA.label}} ↔ {{communityB.label}}

## Context
This note bridges two knowledge communities in your vault.

## From {{communityA.label}}
{{#each communityA.topNodes}}
- [[{{this.path}}]]
{{/each}}

## From {{communityB.label}}
{{#each communityB.topNodes}}
- [[{{this.path}}]]
{{/each}}

## Connections
<!-- Add your synthesis here -->
```

`templates/prompts/gap-explanation.hbs` — prompt for LLM gap explanation (150 tokens max). Takes `communityA.label`, `communityB.label`, `gapScore`, `potentialBridges` as context. Returns a 1-2 sentence explanation of why connecting these communities would be valuable.

- [ ] **Step 4: Add `GapExplanation` to `PromptId.ts`**

```typescript
export enum PromptId {
  // existing...
  GapExplanation = 'gap-explanation',
}
```

Register in `TemplateRegistry.ts` `TEMPLATE_METADATA` map with `expectsJson: false`, `category: 'prompts'`.

- [ ] **Step 5: Add incremental staleness tracking to `orchestrator.ts`**

Export a secondary function:

```typescript
export async function markStructuralDirty(nodeId: string): Promise<void>
```

Reads 1-hop neighbors of `nodeId` from `mobius_edge`, marks all of them + `nodeId` dirty via `StructuralAnalysisRepo.markNodesDirty(ids)`. Schedule a debounced full recompute if dirty count exceeds 20% of `node_count_at_computation` (check on each call, debounce 30s via a module-level timer).

- [ ] **Step 6: Register command in Obsidian**

In `src/app/context/AppContext.ts` (or wherever commands are registered), add:

```typescript
plugin.addCommand({
  id: 'peak-recompute-gap-analysis',
  name: 'Peak: Recompute Gap Analysis',
  callback: () => runStructuralAnalysis({ forceFullRecompute: true }),
});

plugin.addCommand({
  id: 'peak-open-gap-analysis',
  name: 'Peak: Open Gap Analysis',
  callback: () => viewManager.openGapAnalysisView(),
});
```

- [ ] **Step 7: Build verify (full)**

```bash
npm run build && npm run test
```

Expected: Full build passes, all existing tests pass, structural algorithm tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/service/actions/ \
        templates/config/bridge-note-template.hbs \
        templates/prompts/gap-explanation.hbs \
        src/service/prompt/PromptId.ts \
        src/service/search/index/helper/structural/orchestrator.ts
git commit -m "feat(structural-hole): action execution (add-link, create-bridge-note), incremental updates, commands"
```

---

## Task 8: Polish + Staleness UI + Final Integration

**Files:**
- Modify: `src/ui/view/gap-analysis/GapAnalysisView.tsx`
- Modify: `src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx`

- [ ] **Step 1: Staleness indicator in `GapAnalysisView.tsx`**

Load `staleNodeCount` from store. If `staleNodeCount / totalNodes > 0.2`, show a warning bar below the header:

```tsx
{stale && (
  <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2 pktw-bg-pk-surface-warning pktw-text-sm">
    <AlertTriangle className="pktw-h-4 pktw-w-4" />
    <span>Gap analysis is stale — {staleNodeCount} nodes changed.</span>
    <Button size="sm" variant="outline" onClick={store.triggerRecompute}>Recompute</Button>
  </div>
)}
```

- [ ] **Step 2: Bridge node double-ring style in `LensNodeComponent.tsx`**

When `data.role === 'bridge'` AND `data.communityId` is set (indicating a structural bridge from Louvain, not just the AI-graph bridge), add a double outer ring:

```tsx
style={{
  // existing styles...
  outline: isBridge && data.communityId ? `2px solid ${borderColor}` : undefined,
  outlineOffset: isBridge && data.communityId ? '3px' : undefined,
}}
```

- [ ] **Step 3: Hover tooltip with BC + constraint**

In `LensNodeComponent`, extend the `title` attribute to include structural metrics when present:

```tsx
title={[
  data.path,
  data.betweenness != null ? `BC: ${data.betweenness.toFixed(3)}` : null,
  data.constraint != null ? `C: ${data.constraint.toFixed(3)}` : null,
  data.communityId ? `Community: ${data.communityId}` : null,
].filter(Boolean).join(' · ')}
```

- [ ] **Step 4: Final build + test**

```bash
npm run build && npm run test
```

Expected: Clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/gap-analysis/GapAnalysisView.tsx \
        src/ui/component/mine/multi-lens-graph/nodes/LensNodeComponent.tsx
git commit -m "feat(structural-hole): staleness warning, bridge double-ring, BC/constraint tooltips — polish"
```

---

## Implementation Notes

**Algorithm complexity (expected runtimes):**
- Brandes exact for 5K nodes: ~3-5s (background task, non-blocking)
- Brandes approximate for >10K nodes: k=500 sources, ε ≈ 0.045
- Louvain: typically converges in 3-5 iterations at this scale, <1s
- Burt constraint: O(V × d²) where d is average degree — <500ms for typical vaults

**Graph construction edge type selection (spec Appendix B.4):**
- Include: `references`, `references_resource`, `semantic_related`
- Exclude: `tagged_*` (over-connects via shared tags), `contains` (folder hierarchy, not conceptual)
- `semantic_related` edge weight is inverted for shortest-path cost: `cost = max(0.1, 1 - weight)`

**Louvain determinism guarantee:** traverse nodes in sorted `node_id` order (lexicographic string sort). This ensures the same input produces the same community partition on re-runs, which is required for stable community IDs and gap arc rendering.

**Gap semantic similarity computation:** use centroid embeddings — the average of all document embeddings within a community. Fetch via `EmbeddingRepo.getEmbeddingForSemanticSearch()` on community member node IDs, average the vectors, then compute cosine similarity between community A and B centroids. Fallback to 0.0 if embeddings are unavailable.

**MCP tool exposure:** `vault_find_gaps` returns the top 10 structural holes by `gap_score DESC` with the full `PotentialBridge` array, enabling LLM agents to suggest cross-domain synthesis tasks.

**Cross-feature synergies (out of scope, noted for future):**
- S2 Vault Lint: `structural_holes` table feeds "topic blind spot" checker directly.
- S3 Cascade Update: hook `markStructuralDirty` into cascade pipeline for freshness.
- S5 PPR Search: Brandes graph-loading patterns align with PPR random walk edge loading.
