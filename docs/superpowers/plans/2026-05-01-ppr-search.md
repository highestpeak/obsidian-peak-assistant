# PPR Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add query-time Personalized PageRank (PPR) to the search pipeline, surfacing graph-connected results that keyword/vector search misses.

**Architecture:** Forward Push PPR algorithm computes sparse scores from seed nodes (top RRF results) across a multi-layer graph (references + semantic + tag edges). PPR scores enter as an additional RRF fusion source before reranking. Feature-flagged, zero-risk fallback.

**Tech Stack:** TypeScript, SQLite (mobius_node/mobius_edge), existing MobiusEdgeRepo batch queries, Stopwatch instrumentation.

**Spec:** `docs/superpowers/specs/2026-05-01-ppr-search-design.md`

---

### Task 1: Add PPR Constants

**Files:**
- Modify: `src/core/constant.ts:649` (after existing RRF constants)

- [ ] **Step 1: Add PPR constants to constant.ts**

Add after the existing `RRF_CONTENT_VS_META_WEIGHT` constant (line ~654):

```typescript
// --- PPR (Personalized PageRank) Search ---
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
export const PPR_MAX_EXPANSION_RESULTS = 20;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/constant.ts
git commit -m "feat(ppr): add PPR search constants"
```

---

### Task 2: Write PPR Algorithm Tests

**Files:**
- Create: `test/personalized-pagerank.test.ts`

- [ ] **Step 1: Write test file with deterministic graph fixtures**

```typescript
import {
  computePPR,
  type PPRSeed,
  type PPRConfig,
  type MultiLayerEdge,
} from '@/service/search/query/personalizedPageRank';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertApprox(actual: number, expected: number, tol: number, msg: string) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${msg}: expected ~${expected}, got ${actual}`);
  }
}

// ---- Fixture: simple chain A → B → C ----
// Seeds: [A] with weight 1.0
// Expected: A gets highest score (teleport), B gets second (1-hop), C gets least (2-hop)

function chainGraph(): Map<string, MultiLayerEdge[]> {
  return new Map([
    ['A', [{ to: 'B', weight: 1.0 }]],
    ['B', [{ to: 'C', weight: 1.0 }]],
    ['C', []],
  ]);
}

// ---- Fixture: diamond A → B, A → C, B → D, C → D ----
// Seeds: [A] with weight 1.0
// Expected: D gets high score (two paths converge), B ≈ C

function diamondGraph(): Map<string, MultiLayerEdge[]> {
  return new Map([
    ['A', [{ to: 'B', weight: 1.0 }, { to: 'C', weight: 1.0 }]],
    ['B', [{ to: 'D', weight: 1.0 }]],
    ['C', [{ to: 'D', weight: 1.0 }]],
    ['D', []],
  ]);
}

// ---- Fixture: weighted edges A →(0.9) B, A →(0.1) C ----
// Seeds: [A]. Expected: B >> C

function weightedGraph(): Map<string, MultiLayerEdge[]> {
  return new Map([
    ['A', [{ to: 'B', weight: 0.9 }, { to: 'C', weight: 0.1 }]],
    ['B', []],
    ['C', []],
  ]);
}

const DEFAULT_CONFIG: PPRConfig = {
  alpha: 0.15,
  epsilon: 1e-6,
  maxPushOps: 50_000,
  maxMs: 5000,
};

// --- Tests ---

// Test 1: Chain graph — score ordering A > B > C
{
  const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1.0 }];
  const adj = chainGraph();
  const result = computePPR(seeds, (nodeId) => adj.get(nodeId) ?? [], DEFAULT_CONFIG);

  const sA = result.scores.get('A') ?? 0;
  const sB = result.scores.get('B') ?? 0;
  const sC = result.scores.get('C') ?? 0;

  assert(sA > sB, `Chain: A (${sA}) should > B (${sB})`);
  assert(sB > sC, `Chain: B (${sB}) should > C (${sC})`);
  assert(sA > 0, 'Chain: A score must be positive');
  assert(!result.truncated, 'Chain: should not truncate');
  console.log(`✓ Chain graph: A=${sA.toFixed(4)} B=${sB.toFixed(4)} C=${sC.toFixed(4)} ops=${result.pushOps}`);
}

// Test 2: Diamond graph — D accumulates from two paths, B ≈ C
{
  const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1.0 }];
  const adj = diamondGraph();
  const result = computePPR(seeds, (nodeId) => adj.get(nodeId) ?? [], DEFAULT_CONFIG);

  const sA = result.scores.get('A') ?? 0;
  const sB = result.scores.get('B') ?? 0;
  const sC = result.scores.get('C') ?? 0;
  const sD = result.scores.get('D') ?? 0;

  assert(sA > sD, `Diamond: A (${sA}) should > D (${sD}) due to teleport`);
  assert(sD > sB || sD > sC, `Diamond: D (${sD}) should > at least one of B (${sB}), C (${sC})`);
  assertApprox(sB, sC, 0.001, 'Diamond: B ≈ C (symmetric)');
  console.log(`✓ Diamond graph: A=${sA.toFixed(4)} B=${sB.toFixed(4)} C=${sC.toFixed(4)} D=${sD.toFixed(4)}`);
}

// Test 3: Weighted edges — B >> C when A→B has weight 0.9 vs A→C weight 0.1
{
  const seeds: PPRSeed[] = [{ nodeId: 'A', weight: 1.0 }];
  const adj = weightedGraph();
  const result = computePPR(seeds, (nodeId) => adj.get(nodeId) ?? [], DEFAULT_CONFIG);

  const sB = result.scores.get('B') ?? 0;
  const sC = result.scores.get('C') ?? 0;

  assert(sB > sC * 3, `Weighted: B (${sB}) should >> C (${sC})`);
  console.log(`✓ Weighted graph: B=${sB.toFixed(4)} C=${sC.toFixed(4)}`);
}

// Test 4: Multiple seeds — both get teleport mass
{
  const seeds: PPRSeed[] = [
    { nodeId: 'B', weight: 0.7 },
    { nodeId: 'C', weight: 0.3 },
  ];
  const adj = diamondGraph();
  const result = computePPR(seeds, (nodeId) => adj.get(nodeId) ?? [], DEFAULT_CONFIG);

  const sB = result.scores.get('B') ?? 0;
  const sC = result.scores.get('C') ?? 0;

  assert(sB > sC, `Multi-seed: B (${sB}) should > C (${sC}) due to higher seed weight`);
  console.log(`✓ Multi-seed: B=${sB.toFixed(4)} C=${sC.toFixed(4)}`);
}

// Test 5: Safety cap — maxPushOps triggers truncation on large-ish graph
{
  // Build a 100-node cycle to force many ops
  const adj = new Map<string, MultiLayerEdge[]>();
  for (let i = 0; i < 100; i++) {
    adj.set(`n${i}`, [{ to: `n${(i + 1) % 100}`, weight: 1.0 }]);
  }
  const seeds: PPRSeed[] = [{ nodeId: 'n0', weight: 1.0 }];
  const result = computePPR(seeds, (nodeId) => adj.get(nodeId) ?? [], {
    ...DEFAULT_CONFIG,
    maxPushOps: 50, // very low cap
  });
  assert(result.truncated, 'Should truncate with maxPushOps=50 on 100-node cycle');
  assert(result.pushOps <= 50, `Push ops (${result.pushOps}) should be ≤ 50`);
  console.log(`✓ Safety cap: truncated at ${result.pushOps} ops`);
}

// Test 6: Empty seeds — returns empty scores
{
  const result = computePPR([], () => [], DEFAULT_CONFIG);
  assert(result.scores.size === 0, 'Empty seeds should produce empty scores');
  assert(result.pushOps === 0, 'Empty seeds should produce 0 push ops');
  console.log('✓ Empty seeds: no scores');
}

// Test 7: Isolated node (no edges) — seed gets all mass
{
  const seeds: PPRSeed[] = [{ nodeId: 'X', weight: 1.0 }];
  const result = computePPR(seeds, () => [], DEFAULT_CONFIG);
  const sX = result.scores.get('X') ?? 0;
  assertApprox(sX, 1.0, 0.01, 'Isolated seed should get ~1.0');
  console.log(`✓ Isolated node: X=${sX.toFixed(4)}`);
}

console.log('\nAll PPR tests passed!');
```

- [ ] **Step 2: Run tests — they should fail (module not found)**

Run: `npm run test -- test/personalized-pagerank.test.ts`
Expected: FAIL — cannot find module `@/service/search/query/personalizedPageRank`

- [ ] **Step 3: Commit**

```bash
git add test/personalized-pagerank.test.ts
git commit -m "test(ppr): add PPR algorithm unit tests"
```

---

### Task 3: Implement PPR Algorithm

**Files:**
- Create: `src/service/search/query/personalizedPageRank.ts`

- [ ] **Step 1: Implement the Forward Push PPR algorithm**

```typescript
import {
  PPR_ALPHA,
  PPR_EPSILON,
  PPR_MAX_PUSH_OPS,
  PPR_MAX_MS,
} from '@/core/constant';

/** A single outgoing edge with combined weight. */
export type MultiLayerEdge = { to: string; weight: number };

/** PPR seed node with teleportation weight. */
export type PPRSeed = { nodeId: string; weight: number };

/** PPR computation result. */
export type PPRResult = {
  scores: Map<string, number>;
  pushOps: number;
  nodesExplored: number;
  elapsedMs: number;
  truncated: boolean;
};

/** PPR configuration (all fields optional — defaults from constants). */
export type PPRConfig = {
  alpha?: number;
  epsilon?: number;
  maxPushOps?: number;
  maxMs?: number;
};

/**
 * Forward Push PPR (Andersen, Chung, Lang 2006).
 *
 * Pure function: receives an edge-lookup callback instead of touching SQLite directly.
 * The callback `getOutEdges(nodeId)` returns the combined multi-layer outgoing edges
 * for a given node, with weights already normalized per-layer and combined.
 *
 * @param seeds - Seed nodes with teleportation weights (must sum to 1.0)
 * @param getOutEdges - Callback returning outgoing edges for a node
 * @param config - Algorithm parameters
 * @returns Sparse PPR scores
 */
export function computePPR(
  seeds: PPRSeed[],
  getOutEdges: (nodeId: string) => MultiLayerEdge[],
  config?: PPRConfig,
): PPRResult {
  const alpha = config?.alpha ?? PPR_ALPHA;
  const epsilon = config?.epsilon ?? PPR_EPSILON;
  const maxPushOps = config?.maxPushOps ?? PPR_MAX_PUSH_OPS;
  const maxMs = config?.maxMs ?? PPR_MAX_MS;

  const estimate = new Map<string, number>();  // p[v]
  const residual = new Map<string, number>();  // r[v]
  const edgeCache = new Map<string, MultiLayerEdge[]>();
  const nodesExplored = new Set<string>();

  if (seeds.length === 0) {
    return { scores: estimate, pushOps: 0, nodesExplored: 0, elapsedMs: 0, truncated: false };
  }

  // Initialize residual = seed distribution
  for (const seed of seeds) {
    residual.set(seed.nodeId, (residual.get(seed.nodeId) ?? 0) + seed.weight);
  }

  const startMs = Date.now();
  let pushOps = 0;
  let truncated = false;

  // Build a queue of nodes with high residual
  // We use a simple set-based approach: check all active nodes each round
  const activeNodes = new Set(residual.keys());

  while (activeNodes.size > 0) {
    // Check safety bounds
    if (pushOps >= maxPushOps) { truncated = true; break; }
    if (Date.now() - startMs >= maxMs) { truncated = true; break; }

    // Find node with highest residual/degree ratio
    let bestNode: string | null = null;
    let bestRatio = 0;

    for (const nodeId of activeNodes) {
      const r = residual.get(nodeId) ?? 0;
      if (r <= 0) { activeNodes.delete(nodeId); continue; }

      // Lazy edge fetch + cache
      let edges = edgeCache.get(nodeId);
      if (edges === undefined) {
        edges = getOutEdges(nodeId);
        edgeCache.set(nodeId, edges);
        nodesExplored.add(nodeId);
      }

      const outDeg = Math.max(edges.length, 1); // treat 0-degree as 1 for threshold
      const ratio = r / outDeg;
      if (ratio > epsilon && ratio > bestRatio) {
        bestRatio = ratio;
        bestNode = nodeId;
      }
    }

    if (bestNode === null) break; // All residuals below threshold

    const r = residual.get(bestNode)!;
    const edges = edgeCache.get(bestNode)!;

    // Push step
    // 1. Add α · r[v] to estimate
    estimate.set(bestNode, (estimate.get(bestNode) ?? 0) + alpha * r);

    // 2. Distribute (1-α) · r[v] to neighbors weighted by edge weight
    if (edges.length > 0) {
      const totalWeight = edges.reduce((sum, e) => sum + e.weight, 0);
      if (totalWeight > 0) {
        const spread = (1 - alpha) * r;
        for (const edge of edges) {
          const delta = spread * (edge.weight / totalWeight);
          const newR = (residual.get(edge.to) ?? 0) + delta;
          residual.set(edge.to, newR);
          if (newR > 0) activeNodes.add(edge.to);
        }
      }
    }

    // 3. Reset residual
    residual.set(bestNode, 0);
    activeNodes.delete(bestNode);

    pushOps++;
  }

  // Distribute remaining residual to estimates
  if (truncated) {
    for (const [nodeId, r] of residual) {
      if (r > 0) {
        estimate.set(nodeId, (estimate.get(nodeId) ?? 0) + r);
      }
    }
  }

  return {
    scores: estimate,
    pushOps,
    nodesExplored: nodesExplored.size,
    elapsedMs: Date.now() - startMs,
    truncated,
  };
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- test/personalized-pagerank.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/service/search/query/personalizedPageRank.ts
git commit -m "feat(ppr): implement Forward Push PPR algorithm"
```

---

### Task 4: Multi-Layer Edge Fetcher

**Files:**
- Create: `src/service/search/query/pprEdgeFetcher.ts`

This provides the bridge between PPR's pure `getOutEdges` callback and SQLite.

- [ ] **Step 1: Implement multi-layer edge fetcher**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import {
  PPR_LAYER_WEIGHT_REFERENCE,
  PPR_LAYER_WEIGHT_SEMANTIC,
  PPR_LAYER_WEIGHT_TAG,
} from '@/core/constant';
import {
  GRAPH_WIKI_REFERENCE_EDGE_TYPES,
  GRAPH_SEMANTIC_DOC_EDGE_TYPES,
  GRAPH_TAGGED_EDGE_TYPES,
} from '@/core/po/graph.po';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { MultiLayerEdge } from './personalizedPageRank';

/**
 * Creates a multi-layer edge lookup function for PPR computation.
 *
 * Combines three edge layers (reference, semantic, tag co-occurrence)
 * with configurable weights. Fetches lazily and caches internally.
 *
 * @returns A function `(nodeId: string) => MultiLayerEdge[]`
 */
export function createPPREdgeFetcher(tenant: IndexTenant): (nodeId: string) => MultiLayerEdge[] {
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  const cache = new Map<string, MultiLayerEdge[]>();

  return (nodeId: string): MultiLayerEdge[] => {
    const cached = cache.get(nodeId);
    if (cached !== undefined) return cached;

    // Fetch all three edge types in sequence (synchronous SQLite)
    const combined = new Map<string, { ref: number; sem: number; tag: number }>();

    // Layer 1: Reference edges (references, references_resource)
    const refEdges = edgeRepo.getByFromNodesAndTypesSync(
      [nodeId], [...GRAPH_WIKI_REFERENCE_EDGE_TYPES]
    );
    for (const e of refEdges) {
      const entry = combined.get(e.to_node_id) ?? { ref: 0, sem: 0, tag: 0 };
      entry.ref += 1.0; // unweighted
      combined.set(e.to_node_id, entry);
    }

    // Layer 2: Semantic edges
    const semEdges = edgeRepo.getByFromNodesAndTypesSync(
      [nodeId], [...GRAPH_SEMANTIC_DOC_EDGE_TYPES]
    );
    for (const e of semEdges) {
      const entry = combined.get(e.to_node_id) ?? { ref: 0, sem: 0, tag: 0 };
      entry.sem += (e.weight ?? 0);
      combined.set(e.to_node_id, entry);
    }

    // Layer 3: Tag co-occurrence (virtual 2-hop: node → tag → co-tagged nodes)
    const tagEdges = edgeRepo.getByFromNodesAndTypesSync(
      [nodeId], [...GRAPH_TAGGED_EDGE_TYPES]
    );
    const tagNodeIds = tagEdges.map(e => e.to_node_id);
    if (tagNodeIds.length > 0) {
      const nodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      // For each tag, find co-tagged docs
      const reverseTagEdges = edgeRepo.getByToNodesAndTypesSync(
        tagNodeIds, [...GRAPH_TAGGED_EDGE_TYPES]
      );
      for (const e of reverseTagEdges) {
        if (e.from_node_id === nodeId) continue; // skip self
        // IDF-like weight: 1/sqrt(tag_doc_count)
        // Approximate: use number of reverse edges for this tag as proxy
        const tagDocCount = reverseTagEdges.filter(re => re.to_node_id === e.to_node_id).length;
        const w = 1 / Math.sqrt(Math.max(tagDocCount, 1));
        const entry = combined.get(e.from_node_id) ?? { ref: 0, sem: 0, tag: 0 };
        entry.tag += w;
        combined.set(e.from_node_id, entry);
      }
    }

    // Combine layers with weights, normalize per-layer
    const refTotal = Array.from(combined.values()).reduce((s, e) => s + e.ref, 0);
    const semTotal = Array.from(combined.values()).reduce((s, e) => s + e.sem, 0);
    const tagTotal = Array.from(combined.values()).reduce((s, e) => s + e.tag, 0);

    const edges: MultiLayerEdge[] = [];
    for (const [toId, layers] of combined) {
      let weight = 0;
      if (refTotal > 0) weight += PPR_LAYER_WEIGHT_REFERENCE * (layers.ref / refTotal);
      if (semTotal > 0) weight += PPR_LAYER_WEIGHT_SEMANTIC * (layers.sem / semTotal);
      if (tagTotal > 0) weight += PPR_LAYER_WEIGHT_TAG * (layers.tag / tagTotal);
      if (weight > 0) {
        edges.push({ to: toId, weight });
      }
    }

    cache.set(nodeId, edges);
    return edges;
  };
}
```

- [ ] **Step 2: Check if sync edge query methods exist; if not, add them**

The current `MobiusEdgeRepo` has async methods (`getByFromNodesAndTypes`). PPR runs synchronously for performance. Check whether the repo uses Kysely (which wraps better-sqlite3 synchronously).

If the existing methods are actually synchronous under the hood (better-sqlite3 is sync), we can call them directly. If they return Promises, we need sync wrappers. Inspect `MobiusEdgeRepo.getByFromNodesAndTypes` at `:184` to determine.

If async: add `getByFromNodesAndTypesSync` and `getByToNodesAndTypesSync` methods that call the underlying Kysely `.execute()` synchronously. Kysely over better-sqlite3 supports this via `.executeTakeAll()` which is sync when the dialect is synchronous.

**Alternative approach**: If all methods are Promise-based but the PPR call site can be async, change `computePPR` to accept an async `getOutEdges` and make the function async. This is simpler and avoids touching the repo.

Decision: **Make PPR async** — simpler, less repo changes, PPR is called from an async pipeline anyway.

Update `personalizedPageRank.ts`: change `computePPR` to `async computePPR`, and `getOutEdges` to return `Promise<MultiLayerEdge[]> | MultiLayerEdge[]`. The edge cache inside PPR already prevents redundant fetches.

- [ ] **Step 3: Update PPR to support async edge fetching**

In `personalizedPageRank.ts`, change the signature:

```typescript
export async function computePPR(
  seeds: PPRSeed[],
  getOutEdges: (nodeId: string) => MultiLayerEdge[] | Promise<MultiLayerEdge[]>,
  config?: PPRConfig,
): Promise<PPRResult> {
```

And change the edge fetch line inside the loop:

```typescript
      if (edges === undefined) {
        edges = await getOutEdges(nodeId);
        edgeCache.set(nodeId, edges);
        nodesExplored.add(nodeId);
      }
```

Update tests accordingly (add `await` / wrap in async IIFE or change test structure).

- [ ] **Step 4: Update edge fetcher to use async repo methods**

In `pprEdgeFetcher.ts`, change the return type and make the function async:

```typescript
export function createPPREdgeFetcher(tenant: IndexTenant): (nodeId: string) => Promise<MultiLayerEdge[]> {
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  const cache = new Map<string, MultiLayerEdge[]>();

  return async (nodeId: string): Promise<MultiLayerEdge[]> => {
    const cached = cache.get(nodeId);
    if (cached !== undefined) return cached;
    // ... same logic but with await on repo calls ...
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- test/personalized-pagerank.test.ts`
Expected: All tests pass (tests use sync callbacks, which still satisfy `MultiLayerEdge[] | Promise<MultiLayerEdge[]>`).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/service/search/query/pprEdgeFetcher.ts src/service/search/query/personalizedPageRank.ts test/personalized-pagerank.test.ts
git commit -m "feat(ppr): add multi-layer edge fetcher + async PPR support"
```

---

### Task 5: Integrate PPR into QueryService

**Files:**
- Modify: `src/service/search/query/queryService.ts:137-148` (between RRF merge and reranker)
- Modify: `src/service/search/types.ts` (add `enablePPR` to SearchQuery)

- [ ] **Step 1: Add `enablePPR` flag to SearchQuery type**

In `src/service/search/types.ts`, find the `SearchQuery` interface and add:

```typescript
  /** Enable Personalized PageRank graph-based reranking (default: true when available). */
  enablePPR?: boolean;
```

- [ ] **Step 2: Add PPR stage to textSearch()**

In `queryService.ts`, after `mergeContentAndMetaWithRRF()` (line ~142) and before `this.reranker.rerank()` (line ~147), insert PPR computation:

```typescript
    // PPR graph-based reranking (between RRF merge and reranker)
    let pprEnriched = resultItems;
    const enablePPR = query.enablePPR !== false; // default on
    if (enablePPR && resultItems.length > 0) {
      sw.start('ppr_computation');
      try {
        pprEnriched = await this.applyPPR(resultItems, tenant);
      } catch (error) {
        console.error('[QueryService] PPR computation failed, using original results:', error);
      }
      sw.stop();
    }
```

Then change the reranker call to use `pprEnriched`:

```typescript
    const ranked = await this.reranker.rerank(pprEnriched, termRaw, scopeValue, enableLLMRerank, tenant);
```

- [ ] **Step 3: Implement `applyPPR` private method on QueryService**

Add to `QueryService` class:

```typescript
  /**
   * Apply Personalized PageRank to enrich search results with graph-connected documents.
   * Seeds = top RRF results → PPR spreads activation through the knowledge graph →
   * PPR scores are fused with existing RRF scores via weighted combination.
   */
  private async applyPPR(
    items: Array<{ path: string; score: number; docId?: string }>,
    tenant: IndexTenant,
  ): Promise<Array<{ path: string; score: number; docId?: string }>> {
    const { computePPR } = await import('./personalizedPageRank');
    const { createPPREdgeFetcher } = await import('./pprEdgeFetcher');
    const {
      PPR_SEED_K, PPR_RRF_WEIGHT, PPR_CM_RRF_WEIGHT, PPR_MAX_EXPANSION_RESULTS,
    } = await import('@/core/constant');

    // 1. Select seeds: top-K items with docId (graph node reference)
    const seedItems = items
      .filter(i => i.docId)
      .slice(0, PPR_SEED_K);

    if (seedItems.length === 0) return items;

    // Normalize seed weights from RRF scores
    const totalScore = seedItems.reduce((s, i) => s + (i.score ?? 0), 0);
    const seeds = seedItems.map(i => ({
      nodeId: i.docId!,
      weight: totalScore > 0 ? (i.score ?? 0) / totalScore : 1 / seedItems.length,
    }));

    // 2. Compute PPR
    const getOutEdges = createPPREdgeFetcher(tenant);
    const pprResult = await computePPR(seeds, getOutEdges);

    if (pprResult.scores.size === 0) return items;

    // 3. Build PPR-ranked list
    const pprRanked = Array.from(pprResult.scores.entries())
      .sort((a, b) => b[1] - a[1]);

    // Create nodeId → PPR rank mapping
    const pprRankMap = new Map<string, number>();
    pprRanked.forEach(([nodeId], idx) => pprRankMap.set(nodeId, idx + 1));

    // 4. RRF fusion: CM rank + PPR rank
    const RRF_K_LOCAL = 60;
    const existingDocIds = new Set(items.map(i => i.docId).filter(Boolean));

    // Score existing items with PPR fusion
    const fusedItems = items.map((item, idx) => {
      const cmRank = idx + 1;
      const cmRrf = PPR_CM_RRF_WEIGHT / (RRF_K_LOCAL + cmRank);

      let pprRrf = 0;
      if (item.docId) {
        const pRank = pprRankMap.get(item.docId);
        if (pRank !== undefined) {
          pprRrf = PPR_RRF_WEIGHT / (RRF_K_LOCAL + pRank);
        }
      }

      return { ...item, score: cmRrf + pprRrf };
    });

    // 5. Add PPR-discovered documents (not in original results)
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    let expansionCount = 0;

    for (const [nodeId, pprScore] of pprRanked) {
      if (expansionCount >= PPR_MAX_EXPANSION_RESULTS) break;
      if (existingDocIds.has(nodeId)) continue;

      // Look up document path from node
      const node = await mobiusNodeRepo.getByNodeId(nodeId);
      if (!node?.path) continue;

      const pRank = pprRankMap.get(nodeId)!;
      const pprRrf = PPR_RRF_WEIGHT / (RRF_K_LOCAL + pRank);

      fusedItems.push({
        path: node.path,
        score: pprRrf, // PPR-only score (no CM component)
        docId: nodeId,
      } as any);
      expansionCount++;
    }

    // Sort by fused score
    fusedItems.sort((a, b) => b.score - a.score);

    console.debug(`[QueryService] PPR: ${pprResult.nodesExplored} nodes explored, ${pprResult.pushOps} ops, ${pprResult.elapsedMs}ms, ${expansionCount} expanded`);

    return fusedItems;
  }
```

Add required imports at top of `queryService.ts`:

```typescript
import type { IndexTenant } from '@/core/storage/sqlite/types';
```

(Check if already imported — it's used in `reranker.rerank()` call but may not be directly imported in queryService.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/query/queryService.ts src/service/search/types.ts
git commit -m "feat(ppr): integrate PPR into search pipeline with RRF fusion"
```

---

### Task 6: Dampen Global PageRank Boost When PPR Active

**Files:**
- Modify: `src/service/search/query/reranker.ts:46-51` (rerank method signature)
- Modify: `src/service/search/query/reranker.ts:306-358` (applyRankingBoosts)
- Modify: `src/service/search/query/queryService.ts:147` (pass pprActive flag)

- [ ] **Step 1: Add `pprActive` parameter to `rerank()` and `applyRankingBoosts()`**

In `reranker.ts`, update the `rerank` method signature (line ~46):

```typescript
  async rerank(
    items: Array<{ path: string; score?: number }>,
    query: string,
    scopeValue?: SearchScopeValue,
    enableLLMRerank: boolean = false,
    indexTenant: IndexTenant = 'vault',
    pprActive: boolean = false,
  ): Promise<SearchResultItem[]> {
```

Pass it through to `applyRankingBoosts` (line ~69):

```typescript
    const boostedItems = this.applyRankingBoosts({
      items: itemsWithScore,
      signals,
      relatedPaths: related,
      pprActive,
    });
```

- [ ] **Step 2: Dampen hub boost in `applyRankingBoosts`**

Add `pprActive` to the params type (line ~306):

```typescript
  applyRankingBoosts(params: {
    items: SearchResultItem[];
    signals: RankingSignals;
    relatedPaths: Set<string>;
    nowTs?: number;
    pprActive?: boolean;
  }): SearchResultItem[] {
```

After the anchor boost calculation (after line ~356), add dampening:

```typescript
        // Dampen global PR boost when PPR provides query-specific graph signal
        if (params.pprActive) {
          anchorBoost *= PPR_GLOBAL_PR_DAMPENING;
        }
```

Import the constant:

```typescript
import {
  INDEX_HUB_TIER_THRESHOLDS,
  INDEX_SEARCH_HUB_INCOMING_BOOST,
  INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
  PPR_GLOBAL_PR_DAMPENING,
} from '@/core/constant';
```

- [ ] **Step 3: Pass pprActive from QueryService**

In `queryService.ts`, update the reranker call:

```typescript
    const pprActive = enablePPR && pprEnriched !== resultItems;
    const ranked = await this.reranker.rerank(pprEnriched, termRaw, scopeValue, enableLLMRerank, tenant, pprActive);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/query/reranker.ts src/service/search/query/queryService.ts
git commit -m "feat(ppr): dampen global PageRank boost when PPR is active"
```

---

### Task 7: Stopwatch Instrumentation + Debug Logging

**Files:**
- Modify: `src/service/search/query/queryService.ts` (already partially done in Task 5)

- [ ] **Step 1: Verify PPR timing is captured**

The `sw.start('ppr_computation')` / `sw.stop()` added in Task 5 already captures PPR timing via `Stopwatch`. Verify the segment name appears in `sw.print()` output.

No additional changes needed if Task 5 was implemented correctly.

- [ ] **Step 2: Run full build + tests**

Run: `npm run build && npm run test -- test/personalized-pagerank.test.ts`
Expected: Build succeeds, all PPR tests pass.

- [ ] **Step 3: Commit (if any changes)**

Only commit if instrumentation needed adjustments.

---

### Task 8: Integration Test with Real Graph Queries

**Files:**
- Create: `test/ppr-integration.test.ts`

- [ ] **Step 1: Write integration test verifying PPR wiring**

```typescript
import {
  computePPR,
  type PPRSeed,
  type MultiLayerEdge,
} from '@/service/search/query/personalizedPageRank';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Integration test: simulate a realistic vault graph structure
// - Hub note "MOC" connected to many notes
// - Cluster A: notes about "TypeScript" (A1, A2, A3)
// - Cluster B: notes about "Python" (B1, B2, B3)
// - Cross-link: A2 → B1 (bridge)

const graph = new Map<string, MultiLayerEdge[]>([
  // Hub
  ['MOC', [
    { to: 'A1', weight: 0.5 }, { to: 'A2', weight: 0.5 },
    { to: 'A3', weight: 0.5 }, { to: 'B1', weight: 0.5 },
    { to: 'B2', weight: 0.5 }, { to: 'B3', weight: 0.5 },
  ]],
  // Cluster A (TypeScript)
  ['A1', [{ to: 'A2', weight: 0.8 }, { to: 'MOC', weight: 0.3 }]],
  ['A2', [{ to: 'A1', weight: 0.8 }, { to: 'A3', weight: 0.7 }, { to: 'B1', weight: 0.4 }]],
  ['A3', [{ to: 'A2', weight: 0.7 }, { to: 'MOC', weight: 0.3 }]],
  // Cluster B (Python)
  ['B1', [{ to: 'B2', weight: 0.8 }, { to: 'MOC', weight: 0.3 }]],
  ['B2', [{ to: 'B1', weight: 0.8 }, { to: 'B3', weight: 0.7 }]],
  ['B3', [{ to: 'B2', weight: 0.7 }, { to: 'MOC', weight: 0.3 }]],
]);

// Test: Query about TypeScript → seeds in Cluster A → PPR should boost Cluster A
{
  const seeds: PPRSeed[] = [
    { nodeId: 'A1', weight: 0.5 },
    { nodeId: 'A2', weight: 0.3 },
    { nodeId: 'A3', weight: 0.2 },
  ];

  const result = computePPR(seeds, (id) => graph.get(id) ?? []);

  const clusterAScores = ['A1', 'A2', 'A3'].map(id => result.scores.get(id) ?? 0);
  const clusterBScores = ['B1', 'B2', 'B3'].map(id => result.scores.get(id) ?? 0);
  const avgA = clusterAScores.reduce((a, b) => a + b) / 3;
  const avgB = clusterBScores.reduce((a, b) => a + b) / 3;

  assert(avgA > avgB, `Cluster A avg (${avgA.toFixed(4)}) should > Cluster B avg (${avgB.toFixed(4)})`);

  // B1 should get some score via bridge A2 → B1
  const sB1 = result.scores.get('B1') ?? 0;
  const sB3 = result.scores.get('B3') ?? 0;
  assert(sB1 > sB3, `B1 (${sB1.toFixed(4)}) should > B3 (${sB3.toFixed(4)}) due to bridge from A2`);

  // MOC should get score but not dominate (unlike global PageRank)
  const sMOC = result.scores.get('MOC') ?? 0;
  const sA1 = result.scores.get('A1') ?? 0;
  assert(sA1 > sMOC, `Seed A1 (${sA1.toFixed(4)}) should > MOC (${sMOC.toFixed(4)}) — PPR is query-biased`);

  console.log('✓ Cluster-biased PPR: seeds in cluster A boost cluster A over B');
  console.log(`  Cluster A avg: ${avgA.toFixed(4)}, Cluster B avg: ${avgB.toFixed(4)}`);
  console.log(`  MOC: ${sMOC.toFixed(4)} (not dominant, unlike global PR)`);
  console.log(`  Bridge B1: ${sB1.toFixed(4)} > B3: ${sB3.toFixed(4)}`);
}

// Test: Same graph, but seeds in Cluster B → Cluster B should be boosted instead
{
  const seeds: PPRSeed[] = [
    { nodeId: 'B1', weight: 0.5 },
    { nodeId: 'B2', weight: 0.3 },
    { nodeId: 'B3', weight: 0.2 },
  ];

  const result = computePPR(seeds, (id) => graph.get(id) ?? []);

  const avgA = ['A1', 'A2', 'A3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;
  const avgB = ['B1', 'B2', 'B3'].map(id => result.scores.get(id) ?? 0).reduce((a, b) => a + b) / 3;

  assert(avgB > avgA, `Cluster B avg (${avgB.toFixed(4)}) should > Cluster A avg (${avgA.toFixed(4)})`);
  console.log('✓ Reverse seeds: cluster B boosted when seeded from B');
}

console.log('\nAll PPR integration tests passed!');
```

- [ ] **Step 2: Run integration tests**

Run: `npm run test -- test/ppr-integration.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Final full build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add test/ppr-integration.test.ts
git commit -m "test(ppr): add cluster-biased integration tests"
```
