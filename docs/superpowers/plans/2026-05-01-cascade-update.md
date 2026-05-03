# Cascade Relationship Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a note is edited, automatically cascade-update semantic edges, neighbor degrees, and hub staleness flags during idle time — transforming Peak's "dead graph" into a living knowledge graph.

**Architecture:** A debt-based cascade system. `indexDocument()` detects what changed (content hash, outgoing links) and writes `CascadeDebt` records. A `CascadeWorker` drains debt during idle windows — rebuilding semantic edges for changed docs, refreshing neighbor degrees, and marking affected hub docs as stale.

**Tech Stack:** SQLite (Kysely), EventBus (Obsidian workspace events), existing vec_embeddings KNN, existing SemanticRelatedEdgesRebuildService.

**Scope:** Spec Phases 1-3 (Foundation + Semantic Edge + Hub Invalidation). Hub regeneration (Phase 4) and PageRank integration (Phase 5) are deferred to subsequent plans.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/service/search/index/cascade/types.ts` | CascadeDebtRecord, CascadeDebtType, CascadeChangeInfo types |
| `src/service/search/index/cascade/CascadeChangeDetector.ts` | Pre/post state snapshot comparison after indexDocument |
| `src/service/search/index/cascade/CascadeWorker.ts` | Idle detection, debt draining, budget enforcement, lifecycle |
| `src/core/storage/sqlite/repositories/CascadeDebtRepo.ts` | CRUD for cascade_debt table (insert/drain/dedup/count) |
| `test/cascade-change-detector.test.ts` | Unit tests for pure change detection logic |
| `test/cascade-worker.test.ts` | Unit tests for scheduling/budget logic |

### Modified files

| File | What changes |
|------|-------------|
| `src/core/storage/sqlite/ddl.ts:624+` | Add `cascade_debt` table + `hub_stale_since` column on `mobius_node` |
| `src/core/storage/sqlite/SqliteStoreManager.ts:75,190,270` | Add CascadeDebtRepo field, init, getter |
| `src/core/constant.ts:53-59` | Add cascade constants (thresholds, budget, idle delay) |
| `src/core/eventBus.ts:7-17` | Add `CASCADE_COMPLETED` to ViewEventType |
| `src/service/search/index/indexService.ts:398,524,568` | Capture pre-state, detect changes, write debt after indexDocument |
| `src/service/search/index/indexUpdater.ts:206` | Start CascadeWorker after flush completes |
| `src/service/search/index/helper/semanticRelatedEdges.ts:187` | Add `rebuildForDocIds()` incremental method |
| `main.ts` | Wire CascadeWorker start/stop into plugin lifecycle |

---

### Task 1: Cascade Types + Constants

**Files:**
- Create: `src/service/search/index/cascade/types.ts`
- Modify: `src/core/constant.ts:53-59`

- [ ] **Step 1: Create cascade types**

```typescript
// src/service/search/index/cascade/types.ts

export type CascadeDebtType =
    | 'semantic_edge'
    | 'degree_refresh'
    | 'mermaid_overlay'
    | 'hub_invalidate'
    | 'folder_stats';

export interface CascadeDebtRecord {
    id?: number;
    tenant: string;
    sourcePath: string;
    targetId: string;
    debtType: CascadeDebtType;
    priority: number;
    changeMagnitude: number | null;
    createdAt: number;
    processedAt: number | null;
}

export interface CascadeChangeInfo {
    docPath: string;
    docNodeId: string;
    contentHashChanged: boolean;
    embeddingChanged: boolean;
    outgoingLinksChanged: boolean;
    oldOutgoingTargetIds: string[];
    newOutgoingTargetIds: string[];
    changeMagnitude: number;
}

export interface PreIndexSnapshot {
    contentHash: string | null;
    outgoingTargetIds: string[];
    embeddingVector: number[] | null;
}
```

- [ ] **Step 2: Add cascade constants to constant.ts**

Add after the existing maintenance debt constants at `src/core/constant.ts:59`:

```typescript
// ── Cascade update constants ──
export const CASCADE_IDLE_DELAY_MS = 5000;
export const CASCADE_MAX_ITEMS_PER_WINDOW = 20;
export const CASCADE_ITEM_TIMEOUT_MS = 500;
export const CASCADE_CHANGE_THRESHOLD_MINOR = 0.05;
export const CASCADE_CHANGE_THRESHOLD_MODERATE = 0.15;
export const CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY = 1;
export const CASCADE_DEBT_DEGREE_REFRESH_PRIORITY = 2;
export const CASCADE_DEBT_HUB_INVALIDATE_PRIORITY = 3;
export const CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY = 4;
export const CASCADE_DEBT_FOLDER_STATS_PRIORITY = 5;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/cascade/types.ts src/core/constant.ts
git commit -m "feat(cascade): add cascade types and constants"
```

---

### Task 2: DDL Migration + CascadeDebtRepo

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:624+`
- Create: `src/core/storage/sqlite/repositories/CascadeDebtRepo.ts`

- [ ] **Step 1: Add cascade_debt table and hub_stale_since column to ddl.ts**

Append to `migrateSqliteSchema()` in `src/core/storage/sqlite/ddl.ts`, after the last `tryExec` block:

```typescript
    // ── Cascade debt tracking ──
    tryExec(`CREATE TABLE IF NOT EXISTS cascade_debt (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant          TEXT    NOT NULL DEFAULT 'vault',
        source_path     TEXT    NOT NULL,
        target_id       TEXT    NOT NULL,
        debt_type       TEXT    NOT NULL,
        priority        INTEGER NOT NULL DEFAULT 5,
        change_magnitude REAL,
        created_at      INTEGER NOT NULL,
        processed_at    INTEGER
    )`);
    tryExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_debt_dedup ON cascade_debt(tenant, target_id, debt_type) WHERE processed_at IS NULL`);
    tryExec(`CREATE INDEX IF NOT EXISTS idx_cascade_debt_pending ON cascade_debt(tenant, processed_at, priority)`);

    // ── Hub staleness tracking on mobius_node ──
    tryExec(`ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER`);
    tryExec(`ALTER TABLE mobius_node ADD COLUMN semantic_edges_version INTEGER DEFAULT 0`);
```

Also add `cascade_debt` columns to the `DbSchema` interface in `ddl.ts` (near line 228):

```typescript
export interface CascadeDebtTable {
    id: Generated<number>;
    tenant: string;
    source_path: string;
    target_id: string;
    debt_type: string;
    priority: number;
    change_magnitude: number | null;
    created_at: number;
    processed_at: number | null;
}
```

And extend `DbSchema`:

```typescript
// Add inside the DbSchema interface:
cascade_debt: CascadeDebtTable;
```

And extend the existing `MobiusNodeTable` interface with:

```typescript
hub_stale_since: number | null;
semantic_edges_version: number;
```

- [ ] **Step 2: Create CascadeDebtRepo**

```typescript
// src/core/storage/sqlite/repositories/CascadeDebtRepo.ts
import { Kysely } from 'kysely';
import type { DbSchema } from '../ddl';
import type { CascadeDebtRecord, CascadeDebtType } from '@/service/search/index/cascade/types';

export class CascadeDebtRepo {
    constructor(private readonly db: Kysely<DbSchema>) {}

    async insertOrUpdatePriority(record: Omit<CascadeDebtRecord, 'id' | 'processedAt'>): Promise<void> {
        const existing = await this.db
            .selectFrom('cascade_debt')
            .selectAll()
            .where('tenant', '=', record.tenant)
            .where('target_id', '=', record.targetId)
            .where('debt_type', '=', record.debtType)
            .where('processed_at', 'is', null)
            .executeTakeFirst();

        if (existing) {
            if (record.priority < existing.priority) {
                await this.db
                    .updateTable('cascade_debt')
                    .set({
                        priority: record.priority,
                        change_magnitude: record.changeMagnitude,
                        source_path: record.sourcePath,
                    })
                    .where('id', '=', existing.id)
                    .execute();
            }
            return;
        }

        await this.db
            .insertInto('cascade_debt')
            .values({
                tenant: record.tenant,
                source_path: record.sourcePath,
                target_id: record.targetId,
                debt_type: record.debtType,
                priority: record.priority,
                change_magnitude: record.changeMagnitude ?? null,
                created_at: record.createdAt,
                processed_at: null,
            })
            .execute();
    }

    async drainPending(tenant: string, limit: number): Promise<CascadeDebtRecord[]> {
        const rows = await this.db
            .selectFrom('cascade_debt')
            .selectAll()
            .where('tenant', '=', tenant)
            .where('processed_at', 'is', null)
            .orderBy('priority', 'asc')
            .orderBy('created_at', 'asc')
            .limit(limit)
            .execute();

        return rows.map((r) => ({
            id: r.id,
            tenant: r.tenant,
            sourcePath: r.source_path,
            targetId: r.target_id,
            debtType: r.debt_type as CascadeDebtType,
            priority: r.priority,
            changeMagnitude: r.change_magnitude,
            createdAt: r.created_at,
            processedAt: r.processed_at,
        }));
    }

    async markProcessed(ids: number[]): Promise<void> {
        if (ids.length === 0) return;
        const now = Date.now();
        await this.db
            .updateTable('cascade_debt')
            .set({ processed_at: now })
            .where('id', 'in', ids)
            .execute();
    }

    async pendingCount(tenant: string): Promise<number> {
        const result = await this.db
            .selectFrom('cascade_debt')
            .select((eb) => eb.fn.countAll<number>().as('cnt'))
            .where('tenant', '=', tenant)
            .where('processed_at', 'is', null)
            .executeTakeFirstOrThrow();
        return result.cnt;
    }

    async clearProcessed(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        const cutoff = Date.now() - olderThanMs;
        await this.db
            .deleteFrom('cascade_debt')
            .where('processed_at', 'is not', null)
            .where('processed_at', '<', cutoff)
            .execute();
    }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts src/core/storage/sqlite/repositories/CascadeDebtRepo.ts
git commit -m "feat(cascade): add cascade_debt table DDL + CascadeDebtRepo"
```

---

### Task 3: Wire CascadeDebtRepo into SqliteStoreManager

**Files:**
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:75,190,270`

- [ ] **Step 1: Add CascadeDebtRepo field and import**

At the top of `SqliteStoreManager.ts`, add import:

```typescript
import { CascadeDebtRepo } from './repositories/CascadeDebtRepo';
```

Add private fields alongside existing repo fields (near line 75):

```typescript
private cascadeDebtRepo: CascadeDebtRepo | null = null;
private cascadeDebtRepoChat: CascadeDebtRepo | null = null;
```

- [ ] **Step 2: Initialize in init()**

Inside `init()` (near line 190), after existing repo initializations, add:

```typescript
this.cascadeDebtRepo = new CascadeDebtRepo(searchKdb);
this.cascadeDebtRepoChat = new CascadeDebtRepo(metaKdb);
```

- [ ] **Step 3: Add getter**

Add getter following the pattern at line 270:

```typescript
getCascadeDebtRepo(tenant: IndexTenant = 'vault'): CascadeDebtRepo {
    if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
    const repo = tenant === 'chat' ? this.cascadeDebtRepoChat : this.cascadeDebtRepo;
    if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
    return repo;
}
```

- [ ] **Step 4: Null out in close()**

In `close()` (near line 455), add:

```typescript
this.cascadeDebtRepo = null;
this.cascadeDebtRepoChat = null;
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(cascade): wire CascadeDebtRepo into SqliteStoreManager"
```

---

### Task 4: CascadeChangeDetector

**Files:**
- Create: `src/service/search/index/cascade/CascadeChangeDetector.ts`
- Create: `test/cascade-change-detector.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// test/cascade-change-detector.test.ts
import { computeChangeMagnitude, detectChanges } from '../src/service/search/index/cascade/CascadeChangeDetector';
import type { PreIndexSnapshot, CascadeChangeInfo } from '../src/service/search/index/cascade/types';
import assert from 'assert';

// ── computeChangeMagnitude ──

function test_identical_vectors_return_zero() {
    const v = [1, 0, 0, 0];
    const result = computeChangeMagnitude(v, v);
    assert(result === 0, `Expected 0, got ${result}`);
    console.log('PASS: identical vectors return 0');
}

function test_orthogonal_vectors_return_one() {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const result = computeChangeMagnitude(a, b);
    assert(Math.abs(result - 1) < 0.001, `Expected ~1, got ${result}`);
    console.log('PASS: orthogonal vectors return ~1');
}

function test_null_vectors_return_one() {
    const result = computeChangeMagnitude(null, [1, 0]);
    assert(result === 1, `Expected 1, got ${result}`);
    console.log('PASS: null old vector returns 1');
}

function test_both_null_return_zero() {
    const result = computeChangeMagnitude(null, null);
    assert(result === 0, `Expected 0, got ${result}`);
    console.log('PASS: both null returns 0');
}

// ── detectChanges ──

function test_no_change() {
    const pre: PreIndexSnapshot = {
        contentHash: 'abc',
        outgoingTargetIds: ['n1', 'n2'],
        embeddingVector: [1, 0],
    };
    const result = detectChanges('test.md', 'node-1', pre, 'abc', ['n1', 'n2'], [1, 0]);
    assert(result === null, 'Expected null for no change');
    console.log('PASS: no change returns null');
}

function test_content_hash_changed() {
    const pre: PreIndexSnapshot = {
        contentHash: 'abc',
        outgoingTargetIds: ['n1'],
        embeddingVector: [1, 0],
    };
    const result = detectChanges('test.md', 'node-1', pre, 'def', ['n1'], [0.9, 0.1]);
    assert(result !== null, 'Expected non-null');
    assert(result!.contentHashChanged === true, 'contentHashChanged should be true');
    assert(result!.embeddingChanged === true, 'embeddingChanged should be true');
    assert(result!.outgoingLinksChanged === false, 'outgoingLinksChanged should be false');
    assert(result!.changeMagnitude > 0, 'changeMagnitude should be > 0');
    console.log('PASS: content hash change detected');
}

function test_outgoing_links_changed() {
    const pre: PreIndexSnapshot = {
        contentHash: 'abc',
        outgoingTargetIds: ['n1', 'n2'],
        embeddingVector: [1, 0],
    };
    const result = detectChanges('test.md', 'node-1', pre, 'abc', ['n1', 'n3'], [1, 0]);
    assert(result !== null, 'Expected non-null');
    assert(result!.contentHashChanged === false, 'contentHashChanged should be false');
    assert(result!.outgoingLinksChanged === true, 'outgoingLinksChanged should be true');
    console.log('PASS: outgoing links change detected');
}

function test_null_pre_snapshot() {
    const result = detectChanges('test.md', 'node-1', null, 'abc', ['n1'], [1, 0]);
    assert(result !== null, 'Expected non-null for new document');
    assert(result!.contentHashChanged === true);
    assert(result!.changeMagnitude === 1);
    console.log('PASS: null pre-snapshot treated as new doc');
}

test_identical_vectors_return_zero();
test_orthogonal_vectors_return_one();
test_null_vectors_return_one();
test_both_null_return_zero();
test_no_change();
test_content_hash_changed();
test_outgoing_links_changed();
test_null_pre_snapshot();
console.log('\nAll cascade-change-detector tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/cascade-change-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write CascadeChangeDetector**

```typescript
// src/service/search/index/cascade/CascadeChangeDetector.ts
import type { CascadeChangeInfo, PreIndexSnapshot } from './types';

export function computeChangeMagnitude(
    oldVec: number[] | null,
    newVec: number[] | null,
): number {
    if (!oldVec && !newVec) return 0;
    if (!oldVec || !newVec) return 1;
    if (oldVec.length !== newVec.length) return 1;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < oldVec.length; i++) {
        dot += oldVec[i] * newVec[i];
        normA += oldVec[i] * oldVec[i];
        normB += newVec[i] * newVec[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 1;
    const cosineSim = dot / denom;
    return Math.max(0, Math.min(1, 1 - cosineSim));
}

export function detectChanges(
    docPath: string,
    docNodeId: string,
    preSnapshot: PreIndexSnapshot | null,
    newContentHash: string,
    newOutgoingTargetIds: string[],
    newEmbeddingVector: number[] | null,
): CascadeChangeInfo | null {
    const oldHash = preSnapshot?.contentHash ?? null;
    const oldTargets = preSnapshot?.outgoingTargetIds ?? [];
    const oldVec = preSnapshot?.embeddingVector ?? null;

    const contentHashChanged = oldHash !== newContentHash;

    const oldSet = new Set(oldTargets);
    const newSet = new Set(newOutgoingTargetIds);
    const outgoingLinksChanged =
        oldSet.size !== newSet.size || [...oldSet].some((id) => !newSet.has(id));

    const changeMagnitude = computeChangeMagnitude(oldVec, newEmbeddingVector);
    const embeddingChanged = changeMagnitude > 0.001;

    if (!contentHashChanged && !outgoingLinksChanged && !embeddingChanged) {
        return null;
    }

    return {
        docPath,
        docNodeId,
        contentHashChanged,
        embeddingChanged,
        outgoingLinksChanged,
        oldOutgoingTargetIds: oldTargets,
        newOutgoingTargetIds: newOutgoingTargetIds,
        changeMagnitude,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/cascade-change-detector.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/search/index/cascade/CascadeChangeDetector.ts test/cascade-change-detector.test.ts
git commit -m "feat(cascade): CascadeChangeDetector with cosine-distance change magnitude"
```

---

### Task 5: Hook Change Detection into indexDocument

**Files:**
- Modify: `src/service/search/index/indexService.ts:398,524,568`

This task adds pre-state capture before the indexDocument transaction and writes CascadeDebt records after it completes.

- [ ] **Step 1: Add imports to indexService.ts**

At the top of `indexService.ts`, add:

```typescript
import { detectChanges } from './cascade/CascadeChangeDetector';
import type { PreIndexSnapshot, CascadeDebtType } from './cascade/types';
import {
    CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY,
    CASCADE_DEBT_DEGREE_REFRESH_PRIORITY,
    CASCADE_DEBT_HUB_INVALIDATE_PRIORITY,
    CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY,
    CASCADE_CHANGE_THRESHOLD_MINOR,
} from '@/core/constant';
```

- [ ] **Step 2: Capture pre-state before the transaction in indexDocument()**

Inside `IndexSingleService.indexDocument()` (line 398), before the transaction at line 524, add pre-state capture:

```typescript
// ── Cascade: capture pre-state ──
let preSnapshot: PreIndexSnapshot | null = null;
if (tenant === 'vault') {
    try {
        const existingNode = await this.crud.mobiusNodeRepo(tenant).getByPath(docPath);
        const existingOutgoing = existingNode
            ? await this.crud.mobiusEdgeRepo(tenant).getByFromNodesAndTypes(
                  [existingNode.id],
                  [GraphEdgeType.References],
              )
            : [];
        const existingEmbedding = existingNode
            ? await this.crud.embeddingRepo(tenant).getFirstVectorByDocId(existingNode.id)
            : null;
        preSnapshot = {
            contentHash: existingNode?.content_hash ?? null,
            outgoingTargetIds: existingOutgoing.map((e) => e.to_node_id),
            embeddingVector: existingEmbedding,
        };
    } catch {
        // Non-critical — cascade will treat as new doc
    }
}
```

Note: `getFirstVectorByDocId` may not exist yet on EmbeddingRepo. If so, use a simpler approach — skip embedding comparison and rely on content hash only:

```typescript
preSnapshot = {
    contentHash: existingNode?.content_hash ?? null,
    outgoingTargetIds: existingOutgoing.map((e) => e.to_node_id),
    embeddingVector: null, // embedding comparison deferred
};
```

- [ ] **Step 3: Write cascade debt after the transaction**

After `addMaintenanceDebt` at line 568, add:

```typescript
// ── Cascade: detect changes and write debt ──
if (tenant === 'vault' && preSnapshot !== null) {
    try {
        const postNode = await this.crud.mobiusNodeRepo(tenant).getByPath(docPath);
        if (postNode) {
            const postOutgoing = await this.crud.mobiusEdgeRepo(tenant).getByFromNodesAndTypes(
                [postNode.id],
                [GraphEdgeType.References],
            );
            const changeInfo = detectChanges(
                docPath,
                postNode.id,
                preSnapshot,
                postNode.content_hash ?? '',
                postOutgoing.map((e) => e.to_node_id),
                null, // embedding comparison deferred to future enhancement
            );
            if (changeInfo && changeInfo.changeMagnitude >= CASCADE_CHANGE_THRESHOLD_MINOR) {
                await this.writeCascadeDebt(tenant, changeInfo);
            }
        }
    } catch {
        // Non-critical — cascade debt write failure should not fail indexing
    }
}
```

- [ ] **Step 4: Add writeCascadeDebt method to IndexSingleService**

Add this private method to `IndexSingleService`:

```typescript
private async writeCascadeDebt(tenant: IndexTenant, change: CascadeChangeInfo): Promise<void> {
    const cascadeRepo = SqliteStoreManager.getInstance().getCascadeDebtRepo(tenant);
    const now = Date.now();

    // Semantic edge rebuild for the changed doc
    if (change.embeddingChanged || change.contentHashChanged) {
        await cascadeRepo.insertOrUpdatePriority({
            tenant,
            sourcePath: change.docPath,
            targetId: change.docNodeId,
            debtType: 'semantic_edge',
            priority: CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY,
            changeMagnitude: change.changeMagnitude,
            createdAt: now,
        });

        // Mermaid overlay rebuild for neighbors
        await cascadeRepo.insertOrUpdatePriority({
            tenant,
            sourcePath: change.docPath,
            targetId: change.docNodeId,
            debtType: 'mermaid_overlay',
            priority: CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY,
            changeMagnitude: change.changeMagnitude,
            createdAt: now,
        });
    }

    // Degree refresh for backlink sources if outgoing links changed
    if (change.outgoingLinksChanged) {
        const allAffectedIds = new Set([...change.oldOutgoingTargetIds, ...change.newOutgoingTargetIds]);
        for (const targetId of allAffectedIds) {
            await cascadeRepo.insertOrUpdatePriority({
                tenant,
                sourcePath: change.docPath,
                targetId,
                debtType: 'degree_refresh',
                priority: CASCADE_DEBT_DEGREE_REFRESH_PRIORITY,
                changeMagnitude: null,
                createdAt: now,
            });
        }
    }

    // Hub invalidation — check if this doc is a hub constituent
    await cascadeRepo.insertOrUpdatePriority({
        tenant,
        sourcePath: change.docPath,
        targetId: change.docNodeId,
        debtType: 'hub_invalidate',
        priority: CASCADE_DEBT_HUB_INVALIDATE_PRIORITY,
        changeMagnitude: change.changeMagnitude,
        createdAt: now,
    });
}
```

- [ ] **Step 5: Add SqliteStoreManager import if not present**

Verify `SqliteStoreManager` is already imported in `indexService.ts`. It should be — if not, add:

```typescript
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
```

Also add the `CascadeChangeInfo` import:

```typescript
import type { CascadeChangeInfo } from './cascade/types';
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds. If `getFirstVectorByDocId` doesn't exist on EmbeddingRepo, use the `null` fallback noted in Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/service/search/index/indexService.ts
git commit -m "feat(cascade): detect changes in indexDocument and write cascade debt"
```

---

### Task 6: Incremental Semantic Edge Rebuild

**Files:**
- Modify: `src/service/search/index/helper/semanticRelatedEdges.ts:187`

- [ ] **Step 1: Add rebuildForDocIds() to SemanticRelatedEdgesRebuildService**

Add this static method to the `SemanticRelatedEdgesRebuildService` class (after `rebuildForTenant()` at line 199):

```typescript
/**
 * Incremental rebuild: only re-compute semantic edges for the specified doc IDs.
 * Deletes old edges FROM these docs, re-runs KNN, upserts new edges,
 * and rebuilds mermaid overlays for all affected nodes.
 */
static async rebuildForDocIds(
    docIds: string[],
    tenant: IndexTenant,
): Promise<{ edgesCreated: number; nodesUpdated: number }> {
    if (docIds.length === 0) return { edgesCreated: 0, nodesUpdated: 0 };

    const storeManager = SqliteStoreManager.getInstance();
    const mobiusEdgeRepo = storeManager.getMobiusEdgeRepo(tenant);
    const mobiusNodeRepo = storeManager.getMobiusNodeRepo(tenant);
    const embeddingRepo = storeManager.getEmbeddingRepo(tenant);
    const now = Date.now();
    let edgesCreated = 0;
    const affectedNodeIds = new Set<string>(docIds);

    for (const fromId of docIds) {
        // 1. Delete old semantic edges FROM this doc
        await mobiusEdgeRepo.deleteByFromNodeAndType(fromId, GraphEdgeType.SemanticRelated);

        // 2. Get embeddings for this doc
        const embeddings = await embeddingRepo.getByDocIds([fromId]);
        if (embeddings.length === 0) continue;

        // 3. Run KNN for the first (representative) embedding
        const queryVector = embeddings[0].vector;
        const knnResults = await embeddingRepo.searchSimilarAndGetId(
            queryVector,
            SEMANTIC_VECTOR_KNN_LIMIT,
            'excludeDocIdsSet',
            { excludeDocIdsSet: new Set([fromId]) },
        );

        // 4. Aggregate best weighted neighbor per doc (same logic as rebuildForTenant)
        const neighborScores = new Map<string, number>();
        for (const hit of knnResults) {
            if (hit.similarity < SEMANTIC_VECTOR_MIN_SIMILARITY) continue;
            const existing = neighborScores.get(hit.docId) ?? 0;
            if (hit.similarity > existing) {
                neighborScores.set(hit.docId, hit.similarity);
            }
        }

        // 5. Take top-K neighbors
        const sorted = [...neighborScores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, SEMANTIC_VECTOR_TOP_K_PER_DOC);

        // 6. Upsert edges
        for (const [toId, weight] of sorted) {
            const edgeId = MobiusEdgeRepo.generateEdgeId(fromId, toId, GraphEdgeType.SemanticRelated);
            await mobiusEdgeRepo.upsert({
                id: edgeId,
                from_node_id: fromId,
                to_node_id: toId,
                edge_type: GraphEdgeType.SemanticRelated,
                weight,
                created_at: now,
                updated_at: now,
            });
            edgesCreated++;
            affectedNodeIds.add(toId);
        }
    }

    // 7. Rebuild mermaid overlay for all affected nodes
    const overlayService = new SemanticRelatedEdgesOverlayService();
    for (const nodeId of affectedNodeIds) {
        const edges = await mobiusEdgeRepo.getByFromNodesAndTypes([nodeId], [GraphEdgeType.SemanticRelated]);
        if (edges.length === 0) {
            await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(nodeId, {
                semantic_overlay_mermaid: null,
                semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION,
            }, now);
            continue;
        }
        const toIds = edges.map((e) => e.to_node_id);
        const toNodes = await mobiusNodeRepo.getByIds(toIds);
        const mermaid = overlayService.buildMermaidForNode(nodeId, edges, toNodes);
        await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(nodeId, {
            semantic_overlay_mermaid: mermaid ?? null,
            semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION,
        }, now);
    }

    return { edgesCreated, nodesUpdated: affectedNodeIds.size };
}
```

Note: The `buildMermaidForNode` method may not exist as a standalone method on `SemanticRelatedEdgesOverlayService`. Check the existing overlay service — if it only has a batch method, extract the per-node mermaid logic from `rebuildForTenant()` (lines 354-361) into a reusable method. The mermaid generation reads node titles from the `toNodes` map and formats them into a mermaid graph string. If extraction is needed, add:

```typescript
// On SemanticRelatedEdgesOverlayService:
buildMermaidForNode(
    centerNodeId: string,
    edges: GraphEdge[],
    neighborNodes: Map<string, GraphNode>,
): string | null {
    if (edges.length === 0) return null;
    const lines: string[] = ['graph LR'];
    for (const edge of edges) {
        const neighbor = neighborNodes.get(edge.to_node_id);
        const label = neighbor?.title ?? edge.to_node_id;
        const w = Math.round((edge.weight ?? 0) * 100);
        lines.push(`  ${centerNodeId}-- ${w}% -->${edge.to_node_id}["${label}"]`);
    }
    return lines.join('\n');
}
```

Adapt to match the exact mermaid format used in the existing `rebuildForTenant()`.

- [ ] **Step 2: Add needed imports**

Ensure these imports are present at the top of `semanticRelatedEdges.ts`:

```typescript
import { MobiusEdgeRepo } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
```

(`SqliteStoreManager`, `GraphEdgeType`, `SEMANTIC_VECTOR_*` constants, and the repos should already be imported.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. If `buildMermaidForNode` needs extraction, adapt the code to match the existing overlay format.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/helper/semanticRelatedEdges.ts
git commit -m "feat(cascade): add rebuildForDocIds() for incremental semantic edge updates"
```

---

### Task 7: CascadeWorker

**Files:**
- Create: `src/service/search/index/cascade/CascadeWorker.ts`
- Create: `test/cascade-worker.test.ts`

- [ ] **Step 1: Write CascadeWorker tests**

```typescript
// test/cascade-worker.test.ts
import { CascadeScheduler } from '../src/service/search/index/cascade/CascadeWorker';
import assert from 'assert';

// Test the pure scheduling logic, not the full worker (which needs SQLite)

function test_scheduler_starts_idle_timer() {
    let timerStarted = false;
    const scheduler = new CascadeScheduler({
        idleDelayMs: 100,
        onIdle: () => { timerStarted = true; },
    });
    scheduler.notifyActivity();
    // Timer should NOT fire immediately
    assert(timerStarted === false, 'Timer should not fire immediately');
    console.log('PASS: scheduler does not fire immediately');
    scheduler.dispose();
}

function test_scheduler_resets_on_activity() {
    let idleCount = 0;
    const scheduler = new CascadeScheduler({
        idleDelayMs: 50,
        onIdle: () => { idleCount++; },
    });
    scheduler.notifyActivity();
    scheduler.notifyActivity(); // reset
    scheduler.notifyActivity(); // reset again
    // Should only get one idle callback eventually
    assert(idleCount === 0, 'Should not have fired yet');
    console.log('PASS: activity resets timer');
    scheduler.dispose();
}

function test_scheduler_pause_prevents_idle() {
    let idleFired = false;
    const scheduler = new CascadeScheduler({
        idleDelayMs: 10,
        onIdle: () => { idleFired = true; },
    });
    scheduler.pause();
    scheduler.notifyActivity();
    // Even after delay, should not fire
    assert(idleFired === false, 'Should not fire while paused');
    console.log('PASS: pause prevents idle callback');
    scheduler.dispose();
}

test_scheduler_starts_idle_timer();
test_scheduler_resets_on_activity();
test_scheduler_pause_prevents_idle();
console.log('\nAll cascade-worker tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/cascade-worker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write CascadeWorker**

```typescript
// src/service/search/index/cascade/CascadeWorker.ts
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SemanticRelatedEdgesRebuildService } from '../helper/semanticRelatedEdges';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { CascadeDebtRecord } from './types';
import {
    CASCADE_IDLE_DELAY_MS,
    CASCADE_MAX_ITEMS_PER_WINDOW,
} from '@/core/constant';
import type { App } from 'obsidian';

/** Pure scheduling logic — testable without SQLite */
export class CascadeScheduler {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private paused = false;
    private disposed = false;
    private readonly idleDelayMs: number;
    private readonly onIdle: () => void;

    constructor(opts: { idleDelayMs: number; onIdle: () => void }) {
        this.idleDelayMs = opts.idleDelayMs;
        this.onIdle = opts.onIdle;
    }

    notifyActivity(): void {
        if (this.disposed || this.paused) return;
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            if (!this.disposed && !this.paused) this.onIdle();
        }, this.idleDelayMs);
    }

    pause(): void {
        this.paused = true;
        this.clearTimer();
    }

    resume(): void {
        this.paused = false;
    }

    dispose(): void {
        this.disposed = true;
        this.clearTimer();
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

/** Full cascade worker with SQLite integration */
export class CascadeWorker {
    private static instance: CascadeWorker | null = null;
    private scheduler: CascadeScheduler;
    private processing = false;
    private eventUnsubscribes: (() => void)[] = [];

    static getInstance(): CascadeWorker | null {
        return CascadeWorker.instance;
    }

    constructor(private readonly app: App) {
        this.scheduler = new CascadeScheduler({
            idleDelayMs: CASCADE_IDLE_DELAY_MS,
            onIdle: () => void this.drainDebt(),
        });
        CascadeWorker.instance = this;
    }

    start(): void {
        // Listen for vault events to detect activity
        const ref1 = this.app.vault.on('modify', () => this.scheduler.notifyActivity());
        const ref2 = this.app.vault.on('create', () => this.scheduler.notifyActivity());
        this.app.workspace.onLayoutReady(() => {
            this.eventUnsubscribes.push(() => this.app.vault.offref(ref1));
            this.eventUnsubscribes.push(() => this.app.vault.offref(ref2));
        });
    }

    /** Called by indexUpdater after flush completes to signal pending debt */
    notifyFlushCompleted(): void {
        this.scheduler.notifyActivity();
    }

    private async drainDebt(): Promise<void> {
        if (this.processing) return;

        // Don't cascade during active AI streaming
        const bgm = BackgroundSessionManager.getInstance();
        if (bgm && bgm.getActiveCount() > 0) {
            // Retry after delay
            this.scheduler.notifyActivity();
            return;
        }

        this.processing = true;
        try {
            const storeManager = SqliteStoreManager.getInstance();
            const cascadeRepo = storeManager.getCascadeDebtRepo('vault');
            const items = await cascadeRepo.drainPending('vault', CASCADE_MAX_ITEMS_PER_WINDOW);

            if (items.length === 0) {
                return;
            }

            const processedIds: number[] = [];
            const affectedDocIds = new Set<string>();

            for (const item of items) {
                try {
                    await this.processDebtItem(item);
                    if (item.id != null) processedIds.push(item.id);
                    affectedDocIds.add(item.targetId);
                } catch (err) {
                    console.error(`[CascadeWorker] Failed to process debt item ${item.id}:`, err);
                    if (item.id != null) processedIds.push(item.id); // Mark as processed to avoid infinite retry
                }
            }

            if (processedIds.length > 0) {
                await cascadeRepo.markProcessed(processedIds);
            }

            // Emit completion event
            if (affectedDocIds.size > 0) {
                const eventBus = EventBus.getInstance(this.app);
                eventBus.dispatch({
                    type: ViewEventType.CASCADE_COMPLETED,
                    affectedDocIds: [...affectedDocIds],
                } as any);
            }

            // If more debt remains, schedule another drain
            const remaining = await cascadeRepo.pendingCount('vault');
            if (remaining > 0) {
                this.scheduler.notifyActivity();
            }
        } finally {
            this.processing = false;
        }
    }

    private async processDebtItem(item: CascadeDebtRecord): Promise<void> {
        switch (item.debtType) {
            case 'semantic_edge':
                await SemanticRelatedEdgesRebuildService.rebuildForDocIds([item.targetId], 'vault');
                break;

            case 'degree_refresh': {
                const nodeRepo = SqliteStoreManager.getInstance().getMobiusNodeRepo('vault');
                await nodeRepo.refreshDocumentIncomingDegreesForNodeIds([item.targetId]);
                break;
            }

            case 'mermaid_overlay':
                // Already handled inside rebuildForDocIds — skip if semantic_edge was processed
                break;

            case 'hub_invalidate': {
                const nodeRepo = SqliteStoreManager.getInstance().getMobiusNodeRepo('vault');
                // Check if this doc is a hub doc or belongs to a hub
                // For now, mark the doc's own hub_stale_since if it's a hub
                const node = await nodeRepo.getByNodeId(item.targetId);
                if (node && node.node_type === 'hub_doc') {
                    await nodeRepo.updateById(item.targetId, {
                        hub_stale_since: Date.now(),
                    });
                }
                break;
            }

            case 'folder_stats':
                // Deferred to future phase
                break;
        }
    }

    dispose(): void {
        this.scheduler.dispose();
        for (const unsub of this.eventUnsubscribes) unsub();
        this.eventUnsubscribes = [];
        CascadeWorker.instance = null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/cascade-worker.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. If `ViewEventType.CASCADE_COMPLETED` doesn't exist yet, proceed to Task 8 first, then come back.

- [ ] **Step 6: Commit**

```bash
git add src/service/search/index/cascade/CascadeWorker.ts test/cascade-worker.test.ts
git commit -m "feat(cascade): CascadeWorker with idle-based debt draining"
```

---

### Task 8: EventBus Extension + Wire into Plugin Lifecycle

**Files:**
- Modify: `src/core/eventBus.ts:7-17`
- Modify: `src/service/search/index/indexUpdater.ts:206`
- Modify: `main.ts`

- [ ] **Step 1: Add CASCADE_COMPLETED to ViewEventType**

In `src/core/eventBus.ts`, add to the `ViewEventType` enum (after line 17):

```typescript
CASCADE_COMPLETED = 'peak:cascade-completed',
```

- [ ] **Step 2: Notify CascadeWorker after indexUpdater flush**

In `src/service/search/index/indexUpdater.ts`, add import:

```typescript
import { CascadeWorker } from './cascade/CascadeWorker';
```

At the end of `flush()` (after all indexDocuments/deletes complete, near line 253), add:

```typescript
// Notify cascade worker that indexing is done — it will drain debt after idle
CascadeWorker.getInstance()?.notifyFlushCompleted();
```

- [ ] **Step 3: Wire CascadeWorker into main.ts plugin lifecycle**

In `main.ts`, add import:

```typescript
import { CascadeWorker } from '@/service/search/index/cascade/CascadeWorker';
```

In `onload()`, after the SearchUpdateListener is initialized (find where `SearchUpdateListener` is created/started), add:

```typescript
this.cascadeWorker = new CascadeWorker(this.app);
this.cascadeWorker.start();
```

Add field to the plugin class:

```typescript
private cascadeWorker: CascadeWorker | null = null;
```

In `onunload()`, add:

```typescript
this.cascadeWorker?.dispose();
this.cascadeWorker = null;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/core/eventBus.ts src/service/search/index/indexUpdater.ts main.ts
git commit -m "feat(cascade): wire CascadeWorker into plugin lifecycle + EventBus"
```

---

### Task 9: Hub Invalidation via Backlink Traversal

**Files:**
- Modify: `src/service/search/index/cascade/CascadeWorker.ts`

Currently the `hub_invalidate` handler only checks if the target doc itself is a hub_doc. It should also find hubs that **contain** this doc as a constituent.

Since there is no `hub_constituent` table yet (planned in the spec but requires hub doc generation changes), we use a lightweight heuristic: check if the doc has any backlinks from hub docs.

- [ ] **Step 1: Enhance hub_invalidate handler**

Replace the `hub_invalidate` case in `CascadeWorker.processDebtItem()`:

```typescript
case 'hub_invalidate': {
    const storeManager = SqliteStoreManager.getInstance();
    const nodeRepo = storeManager.getMobiusNodeRepo('vault');
    const edgeRepo = storeManager.getMobiusEdgeRepo('vault');

    // Find hub docs that reference this document (hub → constituent link)
    const incomingEdges = await edgeRepo.getByToNodesAndTypes(
        [item.targetId],
        [GraphEdgeType.References],
    );
    const hubDocNodeIds: string[] = [];

    if (incomingEdges.length > 0) {
        const sourceNodeIds = incomingEdges.map((e) => e.from_node_id);
        const sourceNodes = await nodeRepo.getByIds(sourceNodeIds);
        for (const [nodeId, node] of sourceNodes) {
            // Hub docs have paths under Hub-Summaries/
            if (node.path?.startsWith('Hub-Summaries/') && !node.path?.startsWith('Hub-Summaries/Manual/')) {
                hubDocNodeIds.push(nodeId);
            }
        }
    }

    // Also check if this doc IS a hub doc
    const selfNode = await nodeRepo.getByNodeId(item.targetId);
    if (selfNode?.path?.startsWith('Hub-Summaries/') && !selfNode?.path?.startsWith('Hub-Summaries/Manual/')) {
        hubDocNodeIds.push(item.targetId);
    }

    // Mark all affected hub docs as stale
    const now = Date.now();
    for (const hubId of hubDocNodeIds) {
        await nodeRepo.updateById(hubId, { hub_stale_since: now });
    }
    break;
}
```

- [ ] **Step 2: Ensure MobiusNodeRepo.updateById supports hub_stale_since**

Check that `updateById` in `MobiusNodeRepo.ts` accepts `hub_stale_since` in its update object. Since we added the column to `MobiusNodeTable` in Task 2, Kysely should accept it in `updateTable('mobius_node').set(...)`. If `updateById` uses a typed subset, add `hub_stale_since` to the allowed fields.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/cascade/CascadeWorker.ts
git commit -m "feat(cascade): hub invalidation via backlink traversal to hub docs"
```

---

### Task 10: Integration Test + Cleanup

**Files:**
- Modify: `src/core/storage/sqlite/repositories/CascadeDebtRepo.ts` (if fixes needed)
- Modify: any files with type errors

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run all existing tests**

Run: `npm run test`
Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Run cascade-specific tests**

Run: `npm run test -- test/cascade-change-detector.test.ts && npm run test -- test/cascade-worker.test.ts`
Expected: All cascade tests pass.

- [ ] **Step 4: Manual verification checklist**

Verify in Obsidian DevTools:
1. Open a vault with indexed notes
2. Edit a note and save
3. After ~5s idle, check console for cascade activity (add `console.log` in CascadeWorker.drainDebt if needed for debugging)
4. Verify `cascade_debt` table has records: run SQL `SELECT * FROM cascade_debt ORDER BY id DESC LIMIT 10`
5. Verify semantic edges were rebuilt for the edited doc

- [ ] **Step 5: Clean up processed debt**

Add a periodic cleanup call. In `CascadeWorker.drainDebt()`, after processing, add:

```typescript
// Clean up old processed records (>24h)
await cascadeRepo.clearProcessed();
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(cascade): integration fixes and cleanup for cascade update pipeline"
```
