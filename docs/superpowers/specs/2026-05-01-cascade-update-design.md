# Cascade Relationship Update — Technical Spec

> Date: 2026-05-01
> Status: Draft
> Priority: Highest (S3)
> Related: S1 Ambient Push (consumer), S5 PPR Search (incremental PPR), S6 Precompiled Knowledge (hub invalidation)

## 1. Problem Statement

### The "Dead Graph" Problem

Peak's current `indexDocument()` performs **atomic single-document updates**. When note A is modified:

- A's embeddings, chunks, FTS index, and outgoing reference edges are rebuilt
- A's own degree counts and its outgoing targets' in-degree are refreshed

Everything else remains frozen:

| Stale Data | Impact |
|---|---|
| Semantic edges involving A | Neighbors still see A's old embedding similarity |
| PageRank for all docs | A's changed link structure doesn't propagate |
| Hub summaries referencing A | Users read outdated compiled knowledge |
| Neighbors' `semantic_overlay_mermaid` | Graph visualizations show stale topology |
| Coverage gap analysis | Structural holes may have been filled or created |
| Folder hub stats | Aggregate metrics drift from reality |

This is a **dead graph** — it accurately reflects individual documents but fails to capture the evolving relationships between them.

### Karpathy LLM Wiki Benchmark

<!-- Karpathy 的 LLM Wiki 证明了知识应该被编译而非每次重推导 -->

Karpathy's LLM Wiki defines a fundamentally different model via the **Ingest** operation:

> "New material enters → LLM reads → discusses key points → writes summary page → updates index → **updates 10-15 related entity/concept pages** → appends log"

The core claim: *"RAG re-discovers knowledge from scratch on every query with no accumulation. LLM Wiki compiles once, maintains continuously."*

Peak's current behavior is closer to RAG than to LLM Wiki — each `indexDocument()` is isolated, and global maintenance is manual and infrequent. The cascade update system bridges this gap.

### Academic Validation

- **HippoRAG (NeurIPS 2024)** — Xiong et al. demonstrate KG + PPR retrieval outperforms SOTA RAG by 20%, is 6-13x faster and 10-20x cheaper than GraphRAG/RAPTOR/LightRAG. Critically, the PPR Survey (arXiv 2403.05198) confirms PPR on sparse graphs supports **incremental updates** in near-linear time for graphs <50K nodes.
- The cascade update model aligns directly with HippoRAG's incremental PPR: when the graph changes locally, only the affected subgraph needs recomputation.

## 2. Cascade Model

### 2.1 What Triggers a Cascade

A cascade is triggered whenever `indexDocument(A)` completes and **at least one of these conditions** is true:

1. **Content hash changed** — A's text was meaningfully modified (embedding differs)
2. **Outgoing links changed** — A now links to different targets (reference edge set differs)
3. **Tags changed** — A's topic/keyword/context tags differ from stored values
4. **Document deleted** — A was removed from the vault
5. **Document renamed** — A's path changed (affects reference resolution)

<!-- 条件 1 和 2 是最常见的触发场景。条件 3-5 是边缘情况但必须覆盖 -->

The trigger detection happens inside `indexDocument()` by comparing pre/post states:

```
Before indexDocument(A):
  - old_content_hash = mobiusNodeRepo.getByPath(A).content_hash
  - old_outgoing_targets = mobiusEdgeRepo.getByFromNodeId(A_id, References)
  - old_tags = mobiusEdgeRepo.getByFromNodeId(A_id, TaggedTopic|...)

After indexDocument(A):
  - Compare new values; if any differ → emit cascade event
```

### 2.2 Cascade Scope — What Entities Need Updating

When document A changes, the **affected entity set** is:

```
Level 0: Document A itself
    ├── Already handled by indexDocument()
    │
Level 1: Direct neighbors (1-hop)
    ├── Outgoing targets: docs that A links to via [[wikilinks]]
    ├── Backlink sources: docs that link TO A
    ├── Same-cluster siblings: docs sharing semantic_related edges with A
    │
Level 2: Structural aggregates
    ├── Hub(s) that A belongs to (by cluster membership or folder)
    ├── Folder nodes in A's ancestor path
    │
Level 3: Global derived values (deferred)
    ├── PageRank (reference-based)
    ├── Semantic PageRank
    └── Coverage gaps
```

### 2.3 What Gets Updated at Each Level

**Level 1 — Neighbor Updates:**

| Update | What Changes | Cost |
|---|---|---|
| Semantic edges FROM A | A's embedding changed → KNN neighbors differ | O(k) vector queries, k = KNN fan-out |
| Semantic edges TO A | Other docs' KNN may now include/exclude A | O(n) in theory; bounded by dirty-neighbor strategy (see §4) |
| Neighbors' `semantic_overlay_mermaid` | Mermaid graph snippet references stale edge labels | String rebuild per affected node |
| Backlink sources' `doc_incoming_cnt` | A's existence/removal changes their in-degree | O(b) where b = backlink count |

**Level 2 — Aggregate Updates:**

| Update | What Changes | Cost |
|---|---|---|
| Hub invalidation flag | Hub summary may reference A's old content | O(1) per affected hub |
| Folder hub stats | `tag_doc_count`, `avg_pagerank` etc. | O(d) where d = folder depth |

**Level 3 — Global Deferred:**

| Update | What Changes | Cost |
|---|---|---|
| PageRank | A's in/out-degree shift redistributes flow | O(V + E) per iteration |
| Semantic PageRank | Semantic edge changes shift flow | O(V + E_semantic) per iteration |
| Coverage gaps | Community structure may have changed | O(communities) |

### 2.4 Update Depth — Dynamic Decision

<!-- 不是固定 1-hop 或 2-hop，而是根据变化量动态决定 -->

The cascade depth is determined by the **semantic change magnitude**:

```
change_magnitude = cosine_distance(old_embedding_A, new_embedding_A)

if change_magnitude < THRESHOLD_MINOR (0.05):
    depth = 0  // Trivial edit (typo fix) — no cascade
elif change_magnitude < THRESHOLD_MODERATE (0.15):
    depth = 1  // Moderate edit — update direct neighbors only
else:
    depth = 2  // Major rewrite — update neighbors + their neighbors + hub invalidation
```

For **structural changes** (link added/removed, document deleted):
- Always depth >= 1
- If a link connects two previously disconnected communities → depth = 2

This avoids over-propagation for minor edits while ensuring major rewrites cascade appropriately.

## 3. Trigger Strategy

<!-- 三种策略各有优劣，推荐混合方案 -->

### 3.1 Three Modes

| Mode | Mechanism | Latency | Cost | When |
|---|---|---|---|---|
| **Immediate** | Cascade runs inline after `indexDocument()` | <1s | High — blocks editing | Never recommended for Obsidian |
| **Delayed (Debt)** | Accumulate cascade debt → process during idle | 5-30s | Medium — amortized | **Default mode** |
| **Batch** | Full global maintenance on manual trigger | Minutes | Low frequency, high burst | Existing behavior, kept as fallback |

### 3.2 Recommended: Hybrid Debt-Based Strategy

The delayed/debt model is the primary strategy, with batch as fallback:

```
indexDocument(A) completes
    │
    ├── Detect change type + magnitude (§2.1, §2.4)
    ├── Write CascadeDebt record to SQLite (§7)
    ├── Increment maintenance dirty score
    │
    └── Schedule CascadeWorker.processDebt()
            │
            ├── Wait for idle window (no vault events for 5s)
            ├── Drain debt queue ordered by priority:
            │     1. Semantic edge updates for changed docs
            │     2. Neighbor degree refresh
            │     3. Hub invalidation flags
            │     4. Mermaid overlay rebuild
            │
            └── If debt exceeds BATCH_THRESHOLD:
                    → Defer to full maintenance instead
```

### 3.3 Idle Detection

<!-- Obsidian 没有原生 idle API，需要自己实现 -->

Idle detection uses a combined signal:

1. **No vault events** for `IDLE_DELAY_MS` (default: 5000ms, configurable)
2. **No active user typing** — check `workspace.activeEditor?.editor` for recent keystrokes (debounce via `editor-change` event)
3. **Not in active AI streaming** — check `BackgroundSessionManager.hasActiveStreaming()`

When all three are true, the cascade worker drains debt.

### 3.4 Concurrency Control

- Cascade processing is **single-threaded** (one debt item at a time)
- If a new vault event arrives during cascade processing → **pause**, re-accumulate, restart idle timer
- Maximum cascade budget per idle window: `MAX_CASCADE_ITEMS_PER_WINDOW` (default: 20)
- If budget exceeded → remainder stays in debt queue for next idle window

## 4. Incremental Algorithms

### 4.1 Incremental Semantic Edge Update

Current state: `SemanticRelatedEdgesRebuildService.rebuildForTenant()` does a **full wipe + KNN rebuild** for all documents. This is O(n * k * d) where n = docs, k = KNN fan-out, d = embedding dimension.

**Incremental approach:**

```
rebuildForDocIds(changedDocIds: string[], tenant: string):
    1. For each changed doc A:
        a. Delete all semantic_related edges FROM A
        b. Fetch A's new embedding
        c. Run KNN query against vec_embeddings table (top-K)
        d. Insert new semantic_related edges FROM A to KNN results
        e. Record A's new neighbors as potentially-dirty

    2. For each potentially-dirty neighbor B (that had an edge TO any changed doc):
        a. Re-run B's KNN query
        b. If B's neighbor set changed → update edges FROM B
        c. If unchanged → skip (common case)

    3. Rebuild semantic_overlay_mermaid for all affected nodes
```

**Cost**: O(|changedDocs| * K) + O(|dirtyNeighbors| * K) vector queries. For a typical edit (1 doc changed, K=10 neighbors), this is ~20 vector queries vs ~5000 for full rebuild.

**Dirty-neighbor bounding**: To avoid cascading KNN re-queries indefinitely, we limit the "potentially-dirty" check to nodes that had A in their **top-K** neighbor list (stored in edge table). Nodes where A was outside top-K won't be affected.

### 4.2 Incremental PageRank

<!-- 全局 PageRank 本质上不支持真正的增量——但可以用近似方法 -->

Full PageRank is inherently global (O(V+E) per iteration, ~10 iterations to converge). Two incremental strategies:

**Strategy A — Dirty-flag + Deferred Global Recompute:**
- After cascade, set `pagerank_stale = true` on `index_state`
- When maintenance runs (or debt threshold crossed), do a full PageRank recompute
- Simplest, matches current architecture

**Strategy B — Local PageRank Approximation (HippoRAG-inspired):**
- Compute PPR from changed node A as seed (teleport probability α = 0.15)
- Only traverse the reachable subgraph from A (sparse iteration)
- Update `pagerank` for affected nodes only
- Error: bounded by the teleport probability — nodes far from A get near-zero contribution

**Recommendation**: Start with **Strategy A** (defer to batch). Implement Strategy B when S5 PPR Search lands, since the PPR algorithm can be shared.

### 4.3 Incremental Hub Score Update

Hub scores depend on PageRank + degree + bridge metrics. Since PageRank is deferred (§4.2), hub scores are also deferred — but **hub invalidation** is immediate (§5).

## 5. Hub Invalidation

### 5.1 Constituent Membership Tracking

<!-- 需要新表记录每个 hub 的 constituent notes -->

Currently, hub candidates are discovered dynamically via `HubCandidateDiscoveryService.discoverAllHubCandidates()`. There is no persistent record of which documents belong to which hub.

**New table: `hub_constituent`**

```sql
CREATE TABLE hub_constituent (
    hub_node_id   TEXT NOT NULL,     -- FK to mobius_node (the hub doc)
    member_doc_id TEXT NOT NULL,     -- FK to mobius_node (a constituent note)
    role          TEXT NOT NULL,     -- 'core' | 'peripheral'
    added_at      INTEGER NOT NULL,
    PRIMARY KEY (hub_node_id, member_doc_id)
);
CREATE INDEX idx_hub_constituent_member ON hub_constituent(member_doc_id);
```

This is populated when hub docs are generated (`HubDocService.materializeHubDocFromCandidate()`) and enables O(1) lookup: "which hubs does doc A belong to?"

### 5.2 Invalidation Conditions

A hub summary is marked stale when **any** of these occur:

1. A constituent note's content hash changes (the hub summary references old content)
2. A constituent note is deleted (the hub summary references a non-existent doc)
3. A constituent note gains/loses links to other constituents (hub topology changed)
4. The hub's PageRank drops below the hub threshold (hub may no longer qualify)

### 5.3 Staleness Marking

<!-- 不立即重生成，而是标记 stale → 后台队列 -->

```sql
ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER DEFAULT NULL;
-- NULL = fresh, non-NULL = epoch when staleness was detected
```

When a cascade detects that doc A belongs to hub H:
1. Set `hub_stale_since = now()` on H's `mobius_node` row
2. Add a `CascadeDebt` record with `type = 'hub_regen'` and `target = H`

### 5.4 Background Regeneration Strategy

Hub regeneration is expensive (LLM API call per hub). Strategy:

1. **Priority queue**: Hubs with higher PageRank are regenerated first
2. **Debounce**: If multiple constituents change within a short window, only regenerate once
3. **Rate limit**: Maximum `MAX_HUB_REGEN_PER_CYCLE` (default: 3) per cascade cycle
4. **Selective rebuild**: If only 1 constituent changed and hub has >5 constituents, attempt **incremental patch** (append/modify the relevant section in hub doc) instead of full LLM regeneration
5. **Staleness visibility**: UI shows a "stale" badge on hub docs where `hub_stale_since IS NOT NULL`

## 6. Performance Budget

<!-- 核心约束：级联更新不能阻塞编辑体验 -->

### 6.1 Hard Constraints

| Metric | Budget | Rationale |
|---|---|---|
| Editor responsiveness | 0ms impact | Cascade never runs on main thread during typing |
| Time from save to cascade start | >= 5s | Wait for idle (§3.3) |
| Per-cascade-item processing | < 500ms | Single semantic edge rebuild for 1 doc |
| Total cascade budget per idle window | < 10s | 20 items * 500ms |
| Hub regeneration (LLM) | Background only | Never blocks any user interaction |
| Memory overhead | < 50MB | Debt queue + in-progress state |

### 6.2 Computational Cost Estimates

For a typical vault (2000 docs, K=10 KNN, ~8000 reference edges):

| Operation | Cost | Time Estimate |
|---|---|---|
| 1 doc semantic edge rebuild | 10 vector queries + 10 edge writes | ~200ms |
| 10 dirty-neighbor checks | 10 vector queries + ~2 edge rewrites | ~250ms |
| Degree refresh for backlinks | ~5 SQL updates | ~10ms |
| Mermaid overlay rebuild (10 nodes) | 10 string constructions + writes | ~50ms |
| Hub invalidation check | 1 SQL query on hub_constituent | ~5ms |
| **Total typical cascade** | | **~515ms** |

Full PageRank recompute (deferred to maintenance): ~2s for 2000 nodes, 10 iterations.

### 6.3 Scaling Behavior

| Vault Size | Cascade Time (1 doc edit) | Notes |
|---|---|---|
| 500 docs | ~300ms | Fast, all operations trivial |
| 2000 docs | ~500ms | Typical personal vault |
| 5000 docs | ~800ms | Larger vault, still within budget |
| 10000 docs | ~1.5s | May need to reduce KNN fan-out |
| 50000 docs | ~5s | Requires aggressive depth limiting |

## 7. Data Model

### 7.1 Cascade Debt Table

```sql
CREATE TABLE cascade_debt (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant      TEXT NOT NULL DEFAULT 'vault',
    source_path TEXT NOT NULL,           -- the document that triggered the cascade
    target_id   TEXT NOT NULL,           -- the entity that needs updating
    debt_type   TEXT NOT NULL,           -- 'semantic_edge' | 'degree_refresh' | 'mermaid_overlay'
                                        -- | 'hub_invalidate' | 'hub_regen' | 'folder_stats'
    priority    INTEGER NOT NULL DEFAULT 5,  -- 1=highest, 10=lowest
    change_magnitude REAL,               -- cosine distance of embedding change (nullable)
    created_at  INTEGER NOT NULL,
    processed_at INTEGER,                -- NULL until processed
    UNIQUE(tenant, target_id, debt_type) -- dedup: same target+type → update priority
);
CREATE INDEX idx_cascade_debt_pending ON cascade_debt(tenant, processed_at, priority);
```

<!-- UNIQUE 约束确保同一个目标的同类 debt 不会重复积累 -->

### 7.2 Hub Constituent Table

See §5.1 above.

### 7.3 Staleness Columns on `mobius_node`

```sql
-- Hub staleness tracking
ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER DEFAULT NULL;

-- Semantic edge version per-document (enables incremental detection)
-- Already exists as `semantic_edge_rule_version` in attributes JSON;
-- promote to a proper column for query efficiency:
ALTER TABLE mobius_node ADD COLUMN semantic_edges_version INTEGER DEFAULT 0;
```

### 7.4 Index State Extensions

Add to `INDEX_STATE_KEYS`:

```typescript
MOBIUS_MAINTENANCE_STATE_KEYS = {
    ...existing,
    cascadePendingCount: 'cascade_pending_count',    // number of unprocessed debt items
    lastCascadeAt: 'last_cascade_at',                // epoch of last cascade drain
    cascadeTotalProcessed: 'cascade_total_processed', // lifetime counter
};
```

## 8. Integration Points

### 8.1 S1 Ambient Push (Consumer)

Cascade updates are the **data freshness foundation** for Ambient Push:

- When a cascade updates semantic edges near the user's current document, Ambient Push should re-evaluate whether to surface new recommendations
- The `cascade_debt` table serves as an event feed: Ambient Push subscribes to completed cascade items that affect the active document's neighborhood
- Without cascade updates, Ambient Push would serve stale semantic edges and outdated hub scores

**Interface**: Cascade emits `EventBus.emit('peak:cascade-completed', { affectedDocIds })` after each processing cycle. Ambient Push listens and re-evaluates if any affected doc is in the user's current context.

### 8.2 S5 PPR Search (Shared Algorithm)

When S5 implements query-time PPR, the PPR algorithm can be reused for incremental PageRank approximation (§4.2 Strategy B):

- Same sparse iteration code, different seed nodes (cascade: changed doc; search: query-matched docs)
- Cascade can pre-warm PPR scores for recently-changed regions, benefiting subsequent searches

### 8.3 S6 Precompiled Knowledge (Hub Lifecycle)

The hub invalidation mechanism (§5) is shared with S6's incremental trigger design:

- S3 detects **when** a hub becomes stale (cascade trigger)
- S6 decides **how** to regenerate (full rewrite vs incremental patch, pre-embedding strategy)
- The `hub_constituent` table (§5.1) and `hub_stale_since` column are shared data structures

### 8.4 Existing Infrastructure

| System | Integration |
|---|---|
| `SearchUpdateListener` (`indexUpdater.ts`) | Cascade trigger point — emit cascade event after `indexDocument()` |
| `EventBus` | Transport for cascade events + completion notifications |
| `IndexService.addMaintenanceDebt()` | Cascade adds its own debt type alongside existing maintenance debt |
| `BackgroundSessionManager` | Idle detection signal (§3.3) — don't cascade during active AI streaming |
| `SqliteStoreManager` | New repos for `cascade_debt` and `hub_constituent` tables |

## 9. Implementation Phases

### Phase 1: Foundation — Cascade Debt Infrastructure (1 week)

<!-- 先建骨架，不做实际级联 -->

1. Create `cascade_debt` table + `CascadeDebtRepo` (CRUD + drain queue + dedup upsert)
2. Add change detection to `indexDocument()`:
   - Compare pre/post content hash, outgoing links, tags
   - Compute embedding cosine distance for change magnitude
   - Write `CascadeDebt` records for affected entities
3. Create `CascadeWorker` class:
   - Idle detection (§3.3)
   - Debt draining loop with priority ordering
   - Budget enforcement (max items per window)
   - Pause/resume on vault events
4. Wire `CascadeWorker` into plugin lifecycle (start on load, stop on unload)
5. Add `cascadePendingCount` to index state for UI visibility

**Deliverable**: Cascade debt accumulates correctly; worker drains empty stubs. No actual updates yet.

### Phase 2: Semantic Edge Cascade (1 week)

6. Add `rebuildForDocIds()` to `SemanticRelatedEdgesRebuildService`:
   - Delete edges FROM changed docs
   - Re-run KNN for changed docs
   - Identify dirty neighbors (nodes that had changed docs in their top-K)
   - Conditionally re-run KNN for dirty neighbors
7. Rebuild `semantic_overlay_mermaid` for all affected nodes
8. Wire into `CascadeWorker` for `debt_type = 'semantic_edge'`
9. Add `semantic_edges_version` column for incremental version tracking

**Deliverable**: Editing a note updates its semantic edges and neighbors' overlays within ~5s.

### Phase 3: Degree + Hub Invalidation (3 days)

10. Implement backlink source degree refresh in cascade worker
11. Create `hub_constituent` table + populate during hub doc generation
12. Add `hub_stale_since` column to `mobius_node`
13. Implement hub invalidation detection: when a constituent changes, mark hub stale
14. Add staleness badge to hub doc UI display

**Deliverable**: Hub docs show "stale" when constituent notes change. Degree counts stay accurate.

### Phase 4: Hub Background Regeneration (1 week)

15. Implement selective hub regeneration in cascade worker:
    - Priority queue by hub PageRank
    - Rate limiting (max 3 per cycle)
    - Incremental patch for single-constituent changes
16. Wire `hub_regen` debt type
17. Integration with S6 precompiled knowledge layer (if available)

**Deliverable**: Stale hub docs are automatically regenerated in the background.

### Phase 5: PageRank Integration + Polish (3 days)

18. Implement dirty-flag PageRank strategy (§4.2 Strategy A):
    - After cascade, if `cascadePendingCount` was > 0, mark PageRank stale
    - Auto-trigger full PageRank recompute when debt fully drained
19. Add cascade metrics to UI: pending count, last cascade time, items processed
20. Add user settings: enable/disable cascade, idle delay, max items per window
21. Folder hub stats incremental update

**Deliverable**: Complete cascade pipeline. PageRank stays reasonably fresh. User can tune behavior.

### Future: PPR-based Incremental PageRank (deferred to S5)

- Replace Strategy A with Strategy B (§4.2) using shared PPR algorithm
- Enables near-real-time PageRank updates without full recompute
