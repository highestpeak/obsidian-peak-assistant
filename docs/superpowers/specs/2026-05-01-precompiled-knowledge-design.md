# Precompiled Knowledge Layer — Technical Design Spec

> **Date:** 2026-05-01
> **Status:** Draft
> **Relates to:** progress.md S6 (Precompiled Knowledge Layer), S3 (Cascading Relation Updates)
> **Academic grounding:** Karpathy LLM Wiki (2026-04), Microsoft GraphRAG (2024), HippoRAG (NeurIPS 2024)

---

## 1. Problem Statement

### RAG "Re-derivation" vs Compiled Knowledge

Every time a user queries their vault, the current pipeline re-derives knowledge from scratch: chunk retrieval → LLM synthesis → answer. This is Karpathy's core critique — "RAG has no memory; it rediscovers the same patterns on every query."

**Current cost per query:** ~3-8 vault notes read + LLM synthesis = 2-5s latency + token cost.

**Compiled knowledge alternative:** Pre-generate structured summaries (hub docs) that capture the synthesized understanding of a topic cluster. At query time, return the pre-compiled summary directly or use it as high-quality context — trading offline LLM compute for query-time speed and consistency.

**The tradeoff is clear:**

| Dimension | RAG Re-derivation | Compiled Knowledge |
|-----------|-------------------|-------------------|
| Query latency | High (retrieval + synthesis) | Low (direct lookup or context injection) |
| Consistency | Varies per query (different chunks selected) | Stable (same summary until invalidated) |
| Freshness | Always current (reads live data) | Stale risk (must track source changes) |
| Offline compute | None | LLM cost for generation + re-generation |
| Coverage | Limited by context window | Can synthesize across many notes |

Peak already has the foundation for compiled knowledge (hub doc pipeline), but it is incomplete: no incremental trigger, no staleness tracking, no pre-embedding, and **materialization is currently disabled** (`HUB_MAINTENANCE_MATERIALIZE_DOCS = false` in `src/core/constant.ts:148`).

---

## 2. Current State

### What Exists (60-70% infrastructure)

**Hub Discovery Pipeline** (`src/service/search/index/helper/hub/hubDiscover.ts` — ~2700 lines):
- Multi-source candidate discovery: folder hubs, document hubs (PageRank + link degree + semantic centrality), cluster hubs (semantic neighbor affinity + cohesion gating), manual hubs
- Multi-round greedy coverage selection with bitset-based document coverage tracking
- LLM semantic merge for overlapping candidates
- Navigation hub groups (10-18 topic-level groups) vs long-tail partition
- Assembly hints: anchor tags, topology shape, child hub boundaries

**Hub Doc Materialization** (`src/service/search/index/helper/hub/hubDocServices.ts`):
- `HubDocService.generateAndIndexHubDocsForMaintenance()` — full pipeline: discover → materialize → LLM fill → index
- `HubMarkdownService.buildHubDocMarkdown()` — structured skeleton: Short Summary, Full Summary, Core Facts, Tag/Topic Distribution, Time Dimension, Mermaid, Query Anchors, Hub Metadata JSON
- `fillHubDocWithLLMSummary()` — fills skeleton via `PromptId.HubDocSummary` + `hubDocSummaryLlmSchema` structured output
- User-owned / auto-off frontmatter guards (`peak_auto_hub`, `peak_user_owned`, `hub_fill_status`)
- Concurrent materialization with `mapWithConcurrency` (cap: `HUB_MATERIALIZE_CONCURRENCY = 4`)

**Local Graph Assembly** (`src/service/search/index/helper/hub/localGraphAssembler.ts`):
- BFS expansion with depth/node/edge caps, anti-explosion (novelty ratio), child hub frontier boundaries
- Per-node scoring: folder cohesion, tag alignment, PageRank blend, bridge penalty
- Cross-folder edge penalty for hub-local relevance

**Hub Doc Format** (`src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts`):
- Schema definition (`HUB_DOC_SCHEMA`): 9 ordered sections
- `applyHubDocLlmPayloadToMarkdown()` — merges LLM output into skeleton sections
- `hubDocMarkdownBodyForLlm()` — strips Hub Metadata JSON for prompt size control

**Indexing Integration:**
- Hub docs indexed as `mobius_node.type = 'hub_doc'` in the vault SQLite tenant
- `GraphNodeType.HubDoc` treated as a document-like type (included in PageRank vertex set, node path resolution)
- Hub-Summaries folder excluded from listener indexing (`SearchUpdateListener.shouldSkipListenerIndexing()` in `indexUpdater.ts:118-125`)

**Vault File Listener** (`src/service/search/index/indexUpdater.ts`):
- `SearchUpdateListener` watches modify/create/delete/rename with 5s debounce
- Calls `IndexService.indexDocument()` for each changed file (listener_fast mode — no LLM, no embeddings)
- File-open event records access time to `mobius_node`

### What's Missing

1. **Materialization disabled** — `HUB_MAINTENANCE_MATERIALIZE_DOCS = false`; hub discovery runs but no `.md` files are written
2. **No constituent membership tracking** — no persistent record of which source notes belong to which hub doc; the membership is computed ephemerally during discovery and discarded
3. **No incremental trigger** — when a constituent note changes, nothing detects that its parent hub doc(s) need updating
4. **No staleness model** — hub docs have `generated_at` timestamp but no mechanism to detect or flag that content is outdated
5. **No pre-embedding** — hub docs are indexed for FTS but not embedded into the vector store for semantic search
6. **No query-time integration** — hub docs are not surfaced in search results or used as context injection; the search pipeline (`queryService.ts`, `reranker.ts`) has zero hub-doc-specific logic
7. **No layered knowledge model** — no hierarchy above hub docs (cluster digests, vault overview); only flat hub docs per topic

---

## 3. Incremental Trigger Mechanism

### 3.1 Constituent Membership Tracking

**Core insight:** The `hub_cluster_members` field in Hub Metadata JSON already lists constituent note paths (see `buildHubDocBodyMetadataRecord()` at `hubDocServices.ts:209-211`). But this is ephemeral — computed during discovery, written to the `.md` file, then forgotten by the system.

**Proposed data model:** A new SQLite table `hub_constituent` in the vault tenant:

```sql
CREATE TABLE IF NOT EXISTS hub_constituent (
    hub_node_id   TEXT NOT NULL,     -- mobius_node.node_id of the hub_doc
    hub_path      TEXT NOT NULL,     -- vault path of the Hub-*.md file
    member_path   TEXT NOT NULL,     -- vault path of a constituent note
    member_node_id TEXT,             -- mobius_node.node_id of the constituent (nullable for unindexed)
    source_kind   TEXT NOT NULL,     -- 'cluster_member' | 'local_graph' | 'folder_child' | 'manual'
    added_at      INTEGER NOT NULL,  -- epoch ms when membership was recorded
    PRIMARY KEY (hub_node_id, member_path)
);
CREATE INDEX IF NOT EXISTS idx_hub_constituent_member ON hub_constituent(member_path);
```

<!-- 注释：member_path 上的索引是关键——当一个笔记被修改时，我们需要快速查出它属于哪些 hub -->

**Population:** During `materializeHubDocFromCandidate()`, after writing the hub doc file, persist all constituent paths:
- Cluster members from `candidate.clusterMemberPaths`
- Local graph document nodes from `assembly.localHubGraph.nodes` (type = Document)
- Folder children from `assembly.memberPathsSample` (for folder hubs)
- Manual hub source paths from frontmatter `hub_source_paths`

**Maintenance:** On full hub rediscovery, clear and rebuild the entire `hub_constituent` table (idempotent). On incremental regeneration of a single hub, replace only rows for that `hub_node_id`.

### 3.2 Change Detection

**Hook point:** `SearchUpdateListener.flush()` at `indexUpdater.ts:206`. After indexing upserted paths, query `hub_constituent` to find affected hubs:

```
SELECT DISTINCT hub_node_id, hub_path
FROM hub_constituent
WHERE member_path IN (... upserted paths ...)
```

<!-- 注释：这个查询走 idx_hub_constituent_member 索引，O(log n) per path，不会成为瓶颈 -->

**Scope:** Only files that actually changed content (not just metadata) should trigger invalidation. Use `content_hash` from `mobius_node` — if the hash after re-index equals the previous hash, skip invalidation.

### 3.3 Invalidation Strategy

**Recommended: Mark stale + background queue** (not immediate regeneration).

Rationale:
- Hub doc regeneration requires LLM calls (~$0.02-0.10 per hub, 3-10s each)
- Users often edit multiple related notes in a session — batching avoids redundant regeneration
- Immediate regeneration would block the index listener and create LLM API pressure

**Staleness flag:** New column on `mobius_node` for hub_doc rows:

```sql
ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER;
-- NULL = fresh; epoch ms = when first constituent change was detected
```

<!-- 注释：用 hub_stale_since 而不是 boolean，因为我们需要知道过时了多久来决定优先级 -->

**Regeneration queue:** A new table `hub_regen_queue`:

```sql
CREATE TABLE IF NOT EXISTS hub_regen_queue (
    hub_node_id    TEXT PRIMARY KEY,
    hub_path       TEXT NOT NULL,
    queued_at      INTEGER NOT NULL,
    trigger_paths  TEXT NOT NULL,     -- JSON array of paths that triggered invalidation
    priority       INTEGER NOT NULL DEFAULT 0,  -- higher = more urgent
    status         TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'in_progress' | 'failed'
);
```

**Priority scoring:**
- Navigation hub (high coverage, frequently accessed) → priority +10
- Multiple constituents changed → priority + count
- Recently accessed hub (last_open_ts within 7 days) → priority +5
- Time since stale → priority increases over time (prevent indefinite staleness)

### 3.4 Regeneration Scope

**Full rewrite** (not incremental patch).

Rationale: Hub doc sections (Short Summary, Full Summary, Core Facts, etc.) are semantically intertwined — a change in one constituent can affect the summary, facts, tag distribution, and mermaid diagram simultaneously. Partial patching would require the LLM to understand which sections are affected, adding complexity without saving meaningful LLM tokens (the entire hub doc is typically 1000-2000 tokens of output).

**Process:**
1. Re-run `resolveHubDocAssembly()` for the hub candidate (rebuilds local graph, member paths)
2. Re-run `buildHubDocMarkdown()` to generate fresh skeleton
3. Re-run `fillHubDocWithLLMSummary()` for LLM fill
4. Preserve `peak_user_owned` / `peak_auto_hub` guards (skip user-owned hubs)
5. Re-index the updated hub doc
6. Update `hub_constituent` table with new membership
7. Clear `hub_stale_since` and remove from `hub_regen_queue`

**Batch processing:** Use `AdaptiveConcurrencyPool` (already exists for LLM pending enrichment) with initial concurrency 2 for regeneration. Process queue on:
- Plugin startup (if stale hubs exist)
- After `SearchUpdateListener` flush detects stale hubs (debounced to 30s after last change)
- Explicit user action ("Refresh hub summaries" command)

---

## 4. Pre-embedding Strategy

### 4.1 Should Hub Docs Be Pre-embedded?

**Yes.** Hub docs are high-density summaries covering multiple source notes. They are ideal vector search targets because:
- Each hub doc encapsulates the semantic essence of 5-50 source notes into a single coherent document
- Their Query Anchors section is explicitly designed for retrieval ("high-recall phrases")
- They reduce the "semantic collapse" problem (DeepMind 2025) — instead of 50 similar notes competing for top-k slots, one hub doc represents the cluster

### 4.2 Embedding Pipeline

Hub docs should go through the same embedding pipeline as regular documents:
1. During materialization (`materializeHubDocFromCandidate`), index with `includeEmbeddings: true`
2. The existing `IndexService.indexDocument()` with `defaultIndexDocumentOptions('hub_maintenance')` already calls the full pipeline — but currently uses `listener_fast` options which skip embeddings

**Change required:** Modify `defaultIndexDocumentOptions('hub_maintenance')` to include `includeEmbeddings: true`:

```typescript
// src/service/search/index/indexService.ts — in defaultIndexDocumentOptions()
case 'hub_maintenance':
    return { includeEmbeddings: true, includeCoreSearchIndex: true, ... };
```

<!-- 注释：hub doc 的 chunk 数量很少（通常 2-4 chunks），embedding 成本可忽略 -->

### 4.3 Chunk Strategy for Hub Docs

Hub docs have a well-defined section structure. Instead of generic chunking, use section-aware chunking:
- Each H1 section becomes one chunk (Short Summary, Full Summary, Core Facts, etc.)
- Hub Metadata JSON section is excluded from embedding (machine-readable, not semantic)
- Query Anchors section gets its own chunk with boosted weight

This aligns with the existing `HUB_DOC_SCHEMA` section definition in `HubDocLlmMarkdown.ts:17-29`.

### 4.4 Search-time Priority

Hub doc embeddings should receive a retrieval boost in `reranker.ts`:
- When a query matches a hub doc embedding, boost score by a configurable factor (e.g., 1.3x)
- Rationale: hub docs are pre-synthesized expert summaries; they provide higher information density per token than raw notes
- The boost should be tunable via `SearchSettings` to let users control how much they trust compiled knowledge vs raw sources

---

## 5. Layered Knowledge Model

### Karpathy's Three Layers Mapped to Peak

| Karpathy Layer | Peak Equivalent | Status |
|---------------|-----------------|--------|
| Raw Sources | Vault notes (`mobius_node.type = 'document'`) | Exists |
| Wiki Pages | Hub docs (`mobius_node.type = 'hub_doc'`) | Exists (disabled) |
| Schema | `CLAUDE.md` + `TemplateRegistry` + `PromptId` configs | Exists |

### Extended Hierarchy (Beyond Karpathy)

Peak can go further with a 4-level knowledge pyramid:

```
Level 3: Vault Overview (1 doc)
    "What is this vault about? Key themes, structure, statistics."
    Generated: Once per full maintenance cycle
    Invalidated: When navigation hub set changes significantly

Level 2: Cluster Digests (10-18 docs, = navigation hub groups)
    "What is this topic cluster about? How do its sub-hubs relate?"
    Generated: Per navigation hub group from its member hub docs
    Invalidated: When any member hub doc is regenerated

Level 1: Hub Docs (30-100 docs, = all hub candidates)
    "What is this topic node about? Core facts, connections, patterns."
    Generated: Per hub candidate from constituent source notes
    Invalidated: When constituent notes change

Level 0: Raw Notes (100-5000+ docs)
    User-authored vault content. Never modified by the system.
```

<!-- 注释：Level 2-3 是未来方向，本 spec 的实现重点在 Level 1（Hub Docs）的完善 -->

**Phase 1 scope:** Focus entirely on Level 1 (Hub Docs) — enable materialization, add incremental triggers, add pre-embedding. Levels 2-3 are future work gated on Level 1 proving value.

### 5.1 Vault Overview (Level 3) — Future

A single vault-level overview document synthesized from all navigation hub groups. Content:
- Top-level topic map with cross-references
- Vault statistics (note count, topic distribution, temporal activity)
- Key structural holes and knowledge gaps

Useful for: cold-start queries ("what do I know about X?"), onboarding new vault users, the Vault Health Check feature (progress.md S2).

### 5.2 Cluster Digests (Level 2) — Future

One digest per navigation hub group (10-18 groups). Each digest synthesizes:
- How member hub docs relate to each other
- Cross-cutting themes within the cluster
- External connections to other clusters

Useful for: broad queries that span multiple hub docs within a topic, navigation suggestions, discovery of unexpected connections.

---

## 6. Query-time Integration

### 6.1 Hub Doc as Context Injection

When the search agent (`VaultSearchAgentSDK`) retrieves results, hub docs can serve as pre-compiled context:

**Strategy A — Hub Doc Augmentation (recommended for Phase 1):**
1. After initial retrieval (FTS + vector), check if any result paths are constituents of a hub doc (query `hub_constituent`)
2. If yes, include the hub doc's Short Summary + Core Facts as additional context alongside the raw results
3. The LLM synthesizer sees both raw notes and pre-compiled summaries, producing more informed answers

**Strategy B — Hub Doc as Primary Result (Phase 2):**
1. Hub docs appear directly in search results alongside regular notes
2. When a hub doc matches the query (via FTS or vector), it is returned with a visual indicator ("Compiled Summary")
3. Users can click through to see constituent source notes

**Strategy C — Hub Doc as Answer Cache (Phase 3):**
1. For queries that closely match a hub doc's Query Anchors, return the hub doc summary directly without LLM synthesis
2. This is the full "compiled knowledge" vision — zero LLM cost at query time for known topics

### 6.2 Reranker Integration

In `src/service/search/query/reranker.ts`:
- Add `hubDocBoost` to `RankingSignals` — retrieved from `mobius_node` where `type = 'hub_doc'`
- In `applyRankingBoosts()`, multiply hub doc scores by a configurable factor
- Factor stored in `SearchSettings.hubDocBoostFactor` (default: 1.3)

### 6.3 Inspector Integration

In the Vault Search Inspector side panel (`InspectorSidePanel`):
- When a result is a constituent of a hub doc, show a "Part of Hub: {hub title}" link in the Connected Section
- Clicking the link navigates to the hub doc
- This provides the "compiled knowledge" view alongside raw search results

---

## 7. Freshness Guarantee

### 7.1 Staleness Detection

A hub doc is considered stale when:
1. **Any constituent note was modified** after the hub doc's `generated_at` timestamp (detected via `hub_constituent` + `SearchUpdateListener`)
2. **Hub discovery yields different candidates** — the hub's constituent set changed (detected during full rediscovery)
3. **Time-based decay** — hub docs older than a configurable threshold (default: 30 days) are marked for refresh regardless of source changes

### 7.2 Staleness Visibility

**Frontmatter flag:** `hub_stale_since` in the hub doc's YAML frontmatter (written when staleness is detected, cleared on regeneration).

**UI indicator:** When a hub doc appears in search results or the inspector, show a visual indicator if `hub_stale_since` is set:
- Within 24h: subtle "updating..." indicator
- 1-7 days: yellow "stale" badge
- 7+ days: red "outdated" badge with "Refresh" action

### 7.3 Freshness SLA

| Trigger | Target Freshness | Mechanism |
|---------|-----------------|-----------|
| Note edit | Hub marked stale within 5s (debounce) | `SearchUpdateListener` flush → `hub_constituent` query |
| Hub regeneration | Within 5 minutes of marking stale | Background queue with priority scoring |
| Full rediscovery | On explicit "Index Search" command | Existing pipeline step 5/5 |
| Time decay | 30 days max age | Startup check + periodic timer |

### 7.4 Consistency Model

**Eventual consistency:** Hub docs are not transactionally consistent with source notes. There is a window (seconds to minutes) where a hub doc may reflect old content. This is acceptable because:
- Hub docs are summaries, not authoritative sources — users always have access to raw notes
- The staleness indicator makes the inconsistency visible
- Immediate consistency would require synchronous LLM calls on every note save, which is untenable

---

## 8. Data Model

### 8.1 New Tables (vault.sqlite)

```sql
-- Constituent membership: which source notes belong to which hub doc
CREATE TABLE IF NOT EXISTS hub_constituent (
    hub_node_id    TEXT NOT NULL,
    hub_path       TEXT NOT NULL,
    member_path    TEXT NOT NULL,
    member_node_id TEXT,
    source_kind    TEXT NOT NULL,  -- 'cluster_member' | 'local_graph' | 'folder_child' | 'manual'
    added_at       INTEGER NOT NULL,
    PRIMARY KEY (hub_node_id, member_path)
);
CREATE INDEX IF NOT EXISTS idx_hub_constituent_member ON hub_constituent(member_path);
CREATE INDEX IF NOT EXISTS idx_hub_constituent_hub ON hub_constituent(hub_node_id);

-- Regeneration queue: pending hub doc regenerations
CREATE TABLE IF NOT EXISTS hub_regen_queue (
    hub_node_id    TEXT PRIMARY KEY,
    hub_path       TEXT NOT NULL,
    queued_at      INTEGER NOT NULL,
    trigger_paths  TEXT NOT NULL,       -- JSON array
    priority       INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'pending',
    last_attempt   INTEGER,
    fail_count     INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT
);
CREATE INDEX IF NOT EXISTS idx_hub_regen_queue_status ON hub_regen_queue(status, priority DESC);
```

### 8.2 Modified Columns (mobius_node)

```sql
ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER;
-- NULL = fresh; epoch ms when staleness was first detected
-- Only meaningful for type = 'hub_doc'
```

### 8.3 New index_state Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `hub.last_full_discovery_at` | epoch ms | When full hub discovery last ran |
| `hub.last_regen_sweep_at` | epoch ms | When background regeneration last processed the queue |
| `hub.stale_count` | integer | Count of stale hub docs (cached for quick UI display) |
| `hub.total_count` | integer | Total materialized hub docs |

### 8.4 Settings Extension

```typescript
// In SearchSettings or a new HubSettings section
hubDocBoostFactor: number;           // Reranker boost for hub docs (default: 1.3)
hubRegenMaxAge: number;              // Max age in ms before time-decay staleness (default: 30 days)
hubRegenBatchSize: number;           // Max hubs to regenerate per background sweep (default: 10)
hubRegenEnabled: boolean;            // Master switch for background regeneration (default: true)
```

---

## 9. Implementation Phases

### Phase 1: Enable Materialization + Constituent Tracking (Foundation)

**Goal:** Hub docs are written to vault and their constituent membership is persisted.

1. Set `HUB_MAINTENANCE_MATERIALIZE_DOCS = true` in `src/core/constant.ts:148`
2. Add `hub_constituent` table DDL to `src/core/storage/sqlite/ddl.ts`
3. Create `HubConstituentRepo` in `src/core/storage/sqlite/repositories/` — CRUD for membership
4. After `materializeHubDocFromCandidate()` succeeds, persist constituent paths to `hub_constituent`
5. Validate with manual "Index Search" (step 5/5) — hub docs appear in vault, constituents are tracked

**Anchors:**
- `src/core/constant.ts:148` — flip the flag
- `src/core/storage/sqlite/ddl.ts:556` — add table after `mobius_node`
- `src/service/search/index/helper/hub/hubDocServices.ts:472` — insert after `indexService.indexDocument(fullPath, ...)`

### Phase 2: Incremental Staleness Detection

**Goal:** When a constituent note is modified, the parent hub doc is flagged stale.

1. Add `hub_stale_since` column to `mobius_node` (migration in `ddl.ts`)
2. Add `hub_regen_queue` table DDL
3. In `SearchUpdateListener.flush()`, after indexing upserts, query `hub_constituent` for affected hubs
4. For each affected hub: set `hub_stale_since` on `mobius_node`, insert/update `hub_regen_queue`
5. Content-hash guard: only invalidate if `content_hash` actually changed (avoid metadata-only edits triggering regeneration)

**Anchors:**
- `src/service/search/index/indexUpdater.ts:206` — hook after flush
- `src/core/storage/sqlite/ddl.ts:624` — migration for new column
- New file: `src/service/search/index/helper/hub/hubStalenessDetector.ts`

### Phase 3: Background Regeneration Queue

**Goal:** Stale hub docs are automatically regenerated in the background.

1. Create `HubRegenService` — singleton, processes `hub_regen_queue` with adaptive concurrency
2. Priority scoring: navigation status, constituent change count, access recency, time-since-stale
3. Trigger points: (a) after `SearchUpdateListener` flush detects stale hubs (30s debounce), (b) plugin startup, (c) explicit command
4. Regeneration reuses existing `materializeHubDocFromCandidate()` — re-discovers assembly, re-fills LLM, re-writes file, re-indexes, clears staleness
5. Error handling: retry with exponential backoff (max 3 attempts), then mark failed
6. Progress: emit events for Active Sessions UI (reuse `BackgroundSessionManager` pattern)

**Anchors:**
- New file: `src/service/search/index/helper/hub/hubRegenService.ts`
- `src/service/search/index/indexUpdater.ts` — trigger after flush
- `main.ts` — startup trigger

### Phase 4: Pre-embedding + Query-time Integration

**Goal:** Hub docs are searchable via vector search and boost search quality.

1. Change `defaultIndexDocumentOptions('hub_maintenance')` to include `includeEmbeddings: true`
2. Add section-aware chunking for hub docs in `DocumentLoaderManager` (one chunk per H1 section, exclude Hub Metadata)
3. Add `hubDocBoostFactor` to `SearchSettings`
4. In `reranker.ts`, apply boost when result `type = 'hub_doc'`
5. In search agent context building, check if result constituents have a hub doc → inject hub Short Summary as additional context

**Anchors:**
- `src/service/search/index/indexService.ts` — `defaultIndexDocumentOptions`
- `src/service/search/query/reranker.ts` — `applyRankingBoosts`
- `src/service/agents/VaultSearchAgentSDK.ts` — context augmentation

### Phase 5: Freshness UI + Inspector Integration

**Goal:** Users can see hub doc freshness and navigate the compiled knowledge layer.

1. Staleness badges in search results (when a hub doc appears or when a result is a constituent)
2. Inspector side panel: "Part of Hub: {title}" link in Connected Section
3. Hub doc list view: show all hub docs with staleness status, regeneration queue status
4. "Refresh hub summaries" command — triggers full rediscovery + queue processing
5. Settings: `hubRegenEnabled`, `hubRegenMaxAge`, `hubDocBoostFactor` controls

**Anchors:**
- `src/ui/view/quick-search/` — search result rendering
- `src/ui/view/quick-search/components/InspectorSidePanel/` — Connected Section
- New command in `src/app/commands/`

---

## Appendix: Key File Reference

| File | Role |
|------|------|
| `src/core/constant.ts:148` | `HUB_MAINTENANCE_MATERIALIZE_DOCS` flag |
| `src/core/constant.ts:73-82` | `HUB_FRONTMATTER_KEYS` |
| `src/core/storage/sqlite/ddl.ts:556-623` | `mobius_node` / `mobius_edge` DDL |
| `src/core/storage/vault/hub-docs/HubDocLlmMarkdown.ts` | Hub doc markdown schema + LLM fill |
| `src/core/po/graph.po.ts:15` | `GraphNodeType.HubDoc = 'hub_doc'` |
| `src/service/search/index/helper/hub/hubDocServices.ts` | Hub doc orchestration (discovery → materialize → index) |
| `src/service/search/index/helper/hub/hubDiscover.ts` | Hub candidate discovery (~2700 lines) |
| `src/service/search/index/helper/hub/localGraphAssembler.ts` | Local graph BFS + scoring |
| `src/service/search/index/helper/hub/types.ts` | All hub types (HubCandidate, LocalHubGraph, etc.) |
| `src/service/search/index/indexUpdater.ts` | `SearchUpdateListener` — vault change hook |
| `src/service/search/index/indexInitializer.ts:272-278` | Hub maintenance in staged pipeline (step 5/5) |
| `src/service/search/query/reranker.ts` | Search result reranking |
| `src/service/search/query/queryService.ts` | FTS + vector search execution |
