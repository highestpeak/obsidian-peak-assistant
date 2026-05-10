# Cascade Relationship Update — Phase 2 Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cascade infrastructure (CascadeWorker, CascadeScheduler, CascadeDebtRepo, CascadeChangeDetector) is already wired and running. This plan completes the two unfinished stub handlers — `hub_invalidate` (replace the current path-heuristic approach with `hub_constituent` table) and `folder_stats` (currently `break; // deferred`) — and adds the `hub_regen` debt type trigger. The result is a fully live graph where hub staleness is accurately tracked and folder stats stay fresh without a full maintenance run.

**Branch:** `feat/cascade-update`

**Architecture:** The debt pipeline is end-to-end operational. Three targeted additions:
1. A `hub_constituent` table populated at hub-doc materialization time, enabling O(1) membership lookup instead of path-prefix heuristics.
2. A `HubConstituentRepo` wrapped in `SqliteStoreManager`, replacing the inline Kysely query in `CascadeWorker.processDebtItem('hub_invalidate')`.
3. A `folder_stats` handler that incrementally refreshes only the ancestor folder chain of the changed document, avoiding the full keyset-scan rebuild used by `rebuildFolderHubStatsForVaultInternal`.

**S6 Boundary:** `CascadeWorker` owns detection and invalidation (`hub_stale_since` marking, `hub_regen` debt enqueueing). S6 Precompiled Knowledge owns regeneration logic — `CascadeWorker.processDebtItem('hub_regen')` will remain a stub until S6 lands. This plan does NOT implement LLM-based hub doc rewriting.

**Spec:** `docs/superpowers/specs/2026-05-01-cascade-update-design.md` (§5 Hub Invalidation, §7.2 Hub Constituent Table, Phase 3-5)

---

## File Structure

### Modified Files

| File | Change Summary |
|------|----------------|
| `src/core/storage/sqlite/ddl.ts` | Add `hub_constituent` table DDL + Kysely schema type |
| `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts` | Add `markHubStale()`, `getStaleHubs()`, `clearHubStale()` methods |
| `src/core/storage/sqlite/SqliteStoreManager.ts` | Expose `getHubConstituentRepo()` accessor |
| `src/core/constant.ts` | Add `CASCADE_DEBT_HUB_INVALIDATE_PRIORITY`, `CASCADE_DEBT_HUB_REGEN_PRIORITY`, `CASCADE_DEBT_FOLDER_STATS_PRIORITY` (already exists), `MOBIUS_MAINTENANCE_STATE_KEYS` extension |
| `src/service/search/index/cascade/types.ts` | Add `'hub_regen'` to `CascadeDebtType` union |
| `src/service/search/index/cascade/CascadeWorker.ts` | Replace `hub_invalidate` stub with constituent-table lookup; implement `folder_stats` handler; add `hub_regen` no-op stub with comment |
| `src/service/search/index/indexService.ts` | Emit `hub_invalidate` debt in `writeCascadeDebt()`; emit `folder_stats` debt for changed doc's folder ancestry |

### New Files

| File | Responsibility |
|------|----------------|
| `src/core/storage/sqlite/repositories/HubConstituentRepo.ts` | CRUD for `hub_constituent` table: insert members, lookup hubs by member doc id, delete by hub |
| `test/hub-constituent-repo.test.ts` | Unit tests: insert + lookup + dedup behaviour |

---

## Task 1: DDL + Kysely Schema — `hub_constituent` Table

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts`

- [ ] **Step 1: Add Kysely schema type for `hub_constituent`**

In `ddl.ts`, add the interface entry to the `Database` type after the `cascade_debt` block:

```typescript
/** Hub membership tracking: which notes belong to which hub doc. */
hub_constituent: {
    hub_node_id: string;   // FK to mobius_node (the hub_doc node)
    member_doc_id: string; // FK to mobius_node (a constituent document note)
    role: string;          // 'core' | 'peripheral'
    added_at: number;      // epoch ms
};
```

- [ ] **Step 2: Add CREATE TABLE SQL in `initializeVaultDb()`**

In the vault DB initialization block (after the `cascade_debt` block, around line 775), add:

```sql
-- Hub constituent membership tracking
db.exec(`
    CREATE TABLE IF NOT EXISTS hub_constituent (
        hub_node_id   TEXT NOT NULL,
        member_doc_id TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'core',
        added_at      INTEGER NOT NULL,
        PRIMARY KEY (hub_node_id, member_doc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_hub_constituent_member ON hub_constituent(member_doc_id);
    CREATE INDEX IF NOT EXISTS idx_hub_constituent_hub ON hub_constituent(hub_node_id);
`);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Compiles with no type errors. No runtime changes yet.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts
git commit -m "feat(cascade): add hub_constituent DDL and Kysely schema type"
```

---

## Task 2: `HubConstituentRepo` — New Repository

**Files:**
- Create: `src/core/storage/sqlite/repositories/HubConstituentRepo.ts`

- [ ] **Step 1: Create the repo file**

```typescript
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

export interface HubConstituentRecord {
    hubNodeId: string;
    memberDocId: string;
    role: 'core' | 'peripheral';
    addedAt: number;
}

export class HubConstituentRepo {
    constructor(private readonly db: Kysely<DbSchema>) {}

    /** Upsert members for a hub (replaces all existing members for that hub). */
    async replaceHubMembers(hubNodeId: string, members: Array<{ docId: string; role: 'core' | 'peripheral' }>): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('hub_node_id', '=', hubNodeId).execute();
        if (!members.length) return;
        const now = Date.now();
        await this.db.insertInto('hub_constituent').values(
            members.map((m) => ({
                hub_node_id: hubNodeId,
                member_doc_id: m.docId,
                role: m.role,
                added_at: now,
            }))
        ).execute();
    }

    /**
     * Returns hub node ids that contain the given doc as a constituent.
     * Used by cascade: "when doc A changes, which hubs are affected?"
     */
    async getHubsForMemberDoc(memberDocId: string): Promise<string[]> {
        const rows = await this.db
            .selectFrom('hub_constituent')
            .select('hub_node_id')
            .where('member_doc_id', '=', memberDocId)
            .execute();
        return rows.map((r) => r.hub_node_id);
    }

    /** Returns all members (doc ids + roles) for the given hub. */
    async getMembersForHub(hubNodeId: string): Promise<HubConstituentRecord[]> {
        const rows = await this.db
            .selectFrom('hub_constituent')
            .selectAll()
            .where('hub_node_id', '=', hubNodeId)
            .execute();
        return rows.map((r) => ({
            hubNodeId: r.hub_node_id,
            memberDocId: r.member_doc_id,
            role: r.role as 'core' | 'peripheral',
            addedAt: r.added_at,
        }));
    }

    /** Remove all constituent rows for a hub (when hub doc is deleted). */
    async deleteByHub(hubNodeId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('hub_node_id', '=', hubNodeId).execute();
    }

    /** Remove all constituent rows where this doc is a member (when constituent doc is deleted). */
    async deleteByMember(memberDocId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('member_doc_id', '=', memberDocId).execute();
    }

    /** Count members for a hub (used to decide incremental patch vs full regen). */
    async countMembersForHub(hubNodeId: string): Promise<number> {
        const r = await this.db
            .selectFrom('hub_constituent')
            .select((eb) => eb.fn.countAll<number>().as('cnt'))
            .where('hub_node_id', '=', hubNodeId)
            .executeTakeFirstOrThrow();
        return r.cnt;
    }
}
```

- [ ] **Step 2: Write unit tests**

Create `test/hub-constituent-repo.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Use in-memory better-sqlite3 + Kysely for isolation
// Insert two hubs, share one member, assert getHubsForMemberDoc returns both
// Assert replaceHubMembers is idempotent
// Assert deleteByHub clears membership
```

- [ ] **Step 3: Verify build + tests**

```bash
npm run build
npm run test -- test/hub-constituent-repo.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/repositories/HubConstituentRepo.ts test/hub-constituent-repo.test.ts
git commit -m "feat(cascade): add HubConstituentRepo for hub membership tracking"
```

---

## Task 3: Wire `HubConstituentRepo` into `SqliteStoreManager` + Add `MobiusNodeRepo` Hub Helpers

**Files:**
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts`
- Modify: `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts`

- [ ] **Step 1: Add `getHubConstituentRepo()` to `SqliteStoreManager`**

In `SqliteStoreManager.ts`, import `HubConstituentRepo` and add a vault-only repo field + accessor (hub constituent only applies to vault, not chat):

```typescript
import { HubConstituentRepo } from './repositories/HubConstituentRepo';

// Inside SqliteStoreManager class, add field:
private hubConstituentRepo: HubConstituentRepo | null = null;

// Add accessor (vault DB only):
getHubConstituentRepo(): HubConstituentRepo {
    if (!this.hubConstituentRepo) {
        this.hubConstituentRepo = new HubConstituentRepo(this.getIndexContext('vault'));
    }
    return this.hubConstituentRepo;
}
```

- [ ] **Step 2: Add hub staleness helpers to `MobiusNodeRepo`**

In `MobiusNodeRepo.ts`, add three methods after `updateFolderNodeHubMaterializedStats()`:

```typescript
/** Mark a hub doc node as stale (set hub_stale_since if currently null). */
async markHubStale(hubNodeId: string, now: number = Date.now()): Promise<void> {
    await this.db
        .updateTable('mobius_node')
        .set({ hub_stale_since: now, updated_at: now })
        .where('node_id', '=', hubNodeId)
        .where('hub_stale_since', 'is', null)  // only mark if not already stale
        .execute();
}

/** Clear staleness flag after regeneration completes. */
async clearHubStale(hubNodeId: string, now: number = Date.now()): Promise<void> {
    await this.db
        .updateTable('mobius_node')
        .set({ hub_stale_since: null, updated_at: now })
        .where('node_id', '=', hubNodeId)
        .execute();
}

/** Load stale hub docs ordered by pagerank descending (highest priority first). */
async getStaleHubs(limit: number): Promise<Array<{ node_id: string; hub_stale_since: number; pagerank: number | null }>> {
    const rows = await this.db
        .selectFrom('mobius_node')
        .select(['node_id', 'hub_stale_since', 'pagerank'])
        .where('hub_stale_since', 'is not', null)
        .where('type', '=', GraphNodeType.HubDoc)
        .orderBy('pagerank', 'desc')
        .limit(limit)
        .execute();
    return rows as Array<{ node_id: string; hub_stale_since: number; pagerank: number | null }>;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/SqliteStoreManager.ts src/core/storage/sqlite/repositories/MobiusNodeRepo.ts
git commit -m "feat(cascade): wire HubConstituentRepo into StoreManager, add MobiusNodeRepo hub stale helpers"
```

---

## Task 4: Update Constants + `types.ts` — Add `hub_regen` and Priority Constants

**Files:**
- Modify: `src/core/constant.ts`
- Modify: `src/service/search/index/cascade/types.ts`

- [ ] **Step 1: Add missing priority constants to `constant.ts`**

In `src/core/constant.ts`, after the existing cascade priority constants (lines 91-94), add:

```typescript
/** Priority for hub_invalidate debt items (must run after degree_refresh). */
export const CASCADE_DEBT_HUB_INVALIDATE_PRIORITY = 3;
/** Priority for hub_regen debt items (lowest; runs last in window). */
export const CASCADE_DEBT_HUB_REGEN_PRIORITY = 5;
// CASCADE_DEBT_FOLDER_STATS_PRIORITY = 4 already exists
```

Also extend `MOBIUS_MAINTENANCE_STATE_KEYS`:

```typescript
export const MOBIUS_MAINTENANCE_STATE_KEYS = {
    dirtyScore: 'mobius_maintenance_dirty_score',
    needed: 'mobius_maintenance_needed',
    lastFullAt: 'mobius_maintenance_last_full_at',
    // Cascade tracking
    cascadePendingCount: 'cascade_pending_count',
    lastCascadeAt: 'last_cascade_at',
    cascadeTotalProcessed: 'cascade_total_processed',
} as const;
```

- [ ] **Step 2: Add `'hub_regen'` to `CascadeDebtType`**

In `src/service/search/index/cascade/types.ts`:

```typescript
export type CascadeDebtType =
    | 'semantic_edge'
    | 'degree_refresh'
    | 'mermaid_overlay'
    | 'hub_invalidate'
    | 'hub_regen'        // <-- add this
    | 'folder_stats';
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/constant.ts src/service/search/index/cascade/types.ts
git commit -m "feat(cascade): add hub_regen debt type and priority constants"
```

---

## Task 5: Emit `hub_invalidate` + `folder_stats` Debt in `writeCascadeDebt()`

**Files:**
- Modify: `src/service/search/index/indexService.ts`

- [ ] **Step 1: Import new constants**

At the top of `indexService.ts`, in the constant imports, add:

```typescript
import {
    CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY,
    CASCADE_DEBT_DEGREE_REFRESH_PRIORITY,
    CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY,
    CASCADE_DEBT_HUB_INVALIDATE_PRIORITY,  // new
    CASCADE_DEBT_FOLDER_STATS_PRIORITY,     // already in constant.ts
} from '@/core/constant';
```

- [ ] **Step 2: Extend `writeCascadeDebt()` to emit `hub_invalidate` and `folder_stats` debts**

The current `writeCascadeDebt()` method (line ~1449) only emits `semantic_edge`, `mermaid_overlay`, and `degree_refresh`. Add two new sections:

```typescript
private async writeCascadeDebt(tenant: IndexTenant, change: CascadeChangeInfo): Promise<void> {
    const cascadeRepo = sqliteStoreManager.getCascadeDebtRepo(tenant);
    const now = Date.now();

    // --- existing: semantic_edge + mermaid_overlay (unchanged) ---
    if (change.embeddingChanged || change.contentHashChanged) {
        await cascadeRepo.insertOrUpdatePriority({
            tenant, sourcePath: change.docPath, targetId: change.docNodeId,
            debtType: 'semantic_edge', priority: CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY,
            changeMagnitude: change.changeMagnitude, createdAt: now,
        });
        await cascadeRepo.insertOrUpdatePriority({
            tenant, sourcePath: change.docPath, targetId: change.docNodeId,
            debtType: 'mermaid_overlay', priority: CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY,
            changeMagnitude: change.changeMagnitude, createdAt: now,
        });
    }

    // --- existing: degree_refresh for link targets (unchanged) ---
    if (change.outgoingLinksChanged) {
        const allAffectedIds = new Set([...change.oldOutgoingTargetIds, ...change.newOutgoingTargetIds]);
        for (const targetId of allAffectedIds) {
            await cascadeRepo.insertOrUpdatePriority({
                tenant, sourcePath: change.docPath, targetId,
                debtType: 'degree_refresh', priority: CASCADE_DEBT_DEGREE_REFRESH_PRIORITY,
                changeMagnitude: null, createdAt: now,
            });
        }
    }

    // --- NEW: hub_invalidate — changed doc may belong to a hub ---
    // targetId = the changed doc; CascadeWorker will do the hub lookup
    await cascadeRepo.insertOrUpdatePriority({
        tenant, sourcePath: change.docPath, targetId: change.docNodeId,
        debtType: 'hub_invalidate', priority: CASCADE_DEBT_HUB_INVALIDATE_PRIORITY,
        changeMagnitude: change.changeMagnitude, createdAt: now,
    });

    // --- NEW: folder_stats — changed doc's ancestor folders need stat refresh ---
    // targetId = docNodeId; CascadeWorker resolves the folder path ancestry
    await cascadeRepo.insertOrUpdatePriority({
        tenant, sourcePath: change.docPath, targetId: change.docNodeId,
        debtType: 'folder_stats', priority: CASCADE_DEBT_FOLDER_STATS_PRIORITY,
        changeMagnitude: null, createdAt: now,
    });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/indexService.ts
git commit -m "feat(cascade): emit hub_invalidate and folder_stats debts in writeCascadeDebt"
```

---

## Task 6: Implement `hub_invalidate` Handler in `CascadeWorker`

**Files:**
- Modify: `src/service/search/index/cascade/CascadeWorker.ts`

The current `hub_invalidate` handler (lines 95-123) uses a path-prefix heuristic to find hub docs. Replace it with the `hub_constituent` table lookup via `HubConstituentRepo`, and enqueue `hub_regen` debt for each stale hub found.

- [ ] **Step 1: Update imports in `CascadeWorker.ts`**

```typescript
import { CASCADE_DEBT_HUB_REGEN_PRIORITY } from '@/core/constant';
```

- [ ] **Step 2: Replace the `hub_invalidate` case**

Replace the entire `case 'hub_invalidate'` block with:

```typescript
case 'hub_invalidate': {
    // item.targetId = the changed document node id
    const hubConstituentRepo = storeManager.getHubConstituentRepo();
    const mobiusNodeRepo = storeManager.getMobiusNodeRepo('vault');
    const hubNodeIds = await hubConstituentRepo.getHubsForMemberDoc(item.targetId);

    if (hubNodeIds.length === 0) break;

    const now = Date.now();
    const cascadeRepo = storeManager.getCascadeDebtRepo('vault');

    for (const hubNodeId of hubNodeIds) {
        // Mark hub stale (no-op if already stale)
        await mobiusNodeRepo.markHubStale(hubNodeId, now);

        // Enqueue hub_regen debt so S6 / future handler can regenerate it
        await cascadeRepo.insertOrUpdatePriority({
            tenant: 'vault',
            sourcePath: item.sourcePath,
            targetId: hubNodeId,
            debtType: 'hub_regen',
            priority: CASCADE_DEBT_HUB_REGEN_PRIORITY,
            changeMagnitude: item.changeMagnitude,
            createdAt: now,
        });
    }
    break;
}
```

- [ ] **Step 3: Add `hub_regen` stub case (S6 boundary)**

After the `hub_invalidate` case, add:

```typescript
case 'hub_regen':
    // Stub: hub regeneration is implemented by S6 Precompiled Knowledge.
    // This no-op ensures the debt record is consumed and marked processed
    // so the queue does not grow indefinitely. S6 will replace this with
    // the actual LLM-based hub doc rewrite / incremental patch logic.
    break;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/index/cascade/CascadeWorker.ts
git commit -m "feat(cascade): replace hub_invalidate path heuristic with hub_constituent lookup, add hub_regen stub"
```

---

## Task 7: Implement `folder_stats` Handler in `CascadeWorker`

**Files:**
- Modify: `src/service/search/index/cascade/CascadeWorker.ts`

The `folder_stats` handler is currently `break; // deferred`. Implement an incremental folder ancestor refresh that updates only the changed document's ancestor folder chain, not the full vault keyset scan.

- [ ] **Step 1: Add `getAIHubSummaryFolder` import**

`CascadeWorker` needs the hub summary folder path to exclude from stats. Import via the same helper used by `indexService.ts`:

```typescript
import { getAIHubSummaryFolder } from '@/app/settings/types';  // or wherever it's exported
```

(Check the actual export location with Grep if needed — it's used in `rebuildFolderHubStatsForVaultInternal`.)

- [ ] **Step 2: Replace the `folder_stats` case**

```typescript
case 'folder_stats': {
    // item.targetId = the changed document's node id
    // Resolve the doc's vault path, then walk ancestor folders up the tree
    const mobiusNodeRepo = storeManager.getMobiusNodeRepo('vault');
    const docRow = await mobiusNodeRepo.getByNodeId(item.targetId);
    if (!docRow?.path) break;

    const hubSummaryFolder = getAIHubSummaryFolder();
    const docPath = docRow.path;
    const ancestorFolders: string[] = [];

    // Walk path upward: "a/b/c.md" → ["a/b", "a"]
    let cur = docPath;
    for (;;) {
        const slash = cur.lastIndexOf('/');
        if (slash <= 0) break;
        const folder = cur.slice(0, slash);
        if (hubSummaryFolder && folder.startsWith(hubSummaryFolder)) break;
        ancestorFolders.push(folder);
        cur = folder;
    }
    if (!ancestorFolders.length) break;

    const now = Date.now();
    // For each ancestor folder, recompute the materialized stats
    // by querying current document children and summing their PageRank/degree columns.
    for (const folderPath of ancestorFolders) {
        await this.refreshFolderStats(folderPath, mobiusNodeRepo, now);
    }
    break;
}
```

- [ ] **Step 3: Add `refreshFolderStats()` private helper to `CascadeWorker`**

```typescript
/**
 * Incrementally refreshes materialized hub stats for a single folder node.
 * Queries child document rows directly — O(docs in folder), not O(all vault docs).
 */
private async refreshFolderStats(folderPath: string, mobiusNodeRepo: MobiusNodeRepo, now: number): Promise<void> {
    const storeManager = SqliteStoreManager.getInstance();
    const db = storeManager.getIndexContext('vault');

    // Query documents directly under this folder (non-recursive: children one level down)
    // and also documents anywhere under this folder prefix for aggregate stats
    const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

    const childRows = await db
        .selectFrom('mobius_node' as any)
        .select(['node_id', 'path', 'pagerank', 'semantic_pagerank', 'doc_incoming_cnt', 'doc_outgoing_cnt', 'other_incoming_cnt', 'other_outgoing_cnt', 'tags_json'] as any)
        .where('type' as any, '=', 'document')
        .where('path' as any, 'like', `${prefix}%`)
        .execute() as Array<{
            node_id: string;
            path: string | null;
            pagerank: number | null;
            semantic_pagerank: number | null;
            doc_incoming_cnt: number | null;
            doc_outgoing_cnt: number | null;
            other_incoming_cnt: number | null;
            other_outgoing_cnt: number | null;
            tags_json: string | null;
        }>;

    if (!childRows.length) return;

    let sumPr = 0, sumSpr = 0, docIn = 0, docOut = 0, otherIn = 0, otherOut = 0;
    for (const r of childRows) {
        sumPr += r.pagerank ?? 0;
        sumSpr += r.semantic_pagerank ?? 0;
        docIn += r.doc_incoming_cnt ?? 0;
        docOut += r.doc_outgoing_cnt ?? 0;
        otherIn += r.other_incoming_cnt ?? 0;
        otherOut += r.other_outgoing_cnt ?? 0;
    }
    const count = childRows.length;

    // Look up the folder node_id for this path
    const folderRow = await db
        .selectFrom('mobius_node' as any)
        .select('node_id' as any)
        .where('type' as any, '=', 'folder')
        .where('path' as any, '=', folderPath)
        .executeTakeFirst() as { node_id: string } | undefined;

    if (!folderRow) return;

    await mobiusNodeRepo.updateFolderNodeHubMaterializedStats(folderRow.node_id, {
        tagDocCount: count,
        avgPagerank: count > 0 ? sumPr / count : 0,
        avgSemanticPagerank: count > 0 ? sumSpr / count : 0,
        folderCohesionScore: null, // cohesion requires embedding computation; defer to full maintenance
        docIncoming: docIn,
        docOutgoing: docOut,
        otherIncoming: otherIn,
        otherOutgoing: otherOut,
    }, now);
}
```

Note: Import `MobiusNodeRepo` type at the top of `CascadeWorker.ts` if not already imported.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/index/cascade/CascadeWorker.ts
git commit -m "feat(cascade): implement folder_stats incremental folder ancestor refresh"
```

---

## Task 8: Populate `hub_constituent` at Hub Doc Materialization

**Files:**
- Modify: `src/service/search/index/indexService.ts` (or wherever hub doc materialization happens)

The `hub_constituent` table is only useful if it's populated when hub docs are generated. Locate `HubDocService.materializeHubDocFromCandidate()` (or the equivalent call site in `indexService.ts`) and wire `HubConstituentRepo.replaceHubMembers()`.

- [ ] **Step 1: Locate materialization call site**

Run:
```bash
grep -n "materialize\|HubDoc\|hub_doc_generation\|hubDocId\|hub_summary" src/service/search/index/indexService.ts | head -40
```

Identify the function that writes hub doc nodes to `mobius_node` after LLM generation. It will have access to both the hub doc's node id and the list of constituent note paths/ids.

- [ ] **Step 2: Wire `replaceHubMembers()` after hub doc upsert**

In the hub doc generation function, after the hub doc node is upserted into `mobius_node`, add:

```typescript
const hubConstituentRepo = SqliteStoreManager.getInstance().getHubConstituentRepo();
await hubConstituentRepo.replaceHubMembers(hubDocNodeId, constituentDocIds.map((id) => ({
    docId: id,
    role: 'core' as const,
})));
```

Where `constituentDocIds` is the array of document node ids that compose this hub doc (these are already known at hub generation time — they come from `HubCandidateDiscoveryService.discoverAllHubCandidates()` results).

- [ ] **Step 3: Wire `deleteByHub()` on hub doc deletion**

When a hub doc file is deleted from the vault and its `mobius_node` is removed, also delete its constituent rows:

```typescript
const hubConstituentRepo = SqliteStoreManager.getInstance().getHubConstituentRepo();
await hubConstituentRepo.deleteByHub(hubDocNodeId);
```

Locate the hub doc deletion path (likely in `SearchUpdateListener` or `indexService.deleteDocument()`) and add the call.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/index/indexService.ts
git commit -m "feat(cascade): populate hub_constituent on hub doc materialization and deletion"
```

---

## Summary of What Each Task Delivers

| Task | Deliverable | Status After |
|------|-------------|--------------|
| T1 | `hub_constituent` DDL in SQLite | Table exists on next vault open |
| T2 | `HubConstituentRepo` with full CRUD | Repo usable, tests passing |
| T3 | `SqliteStoreManager.getHubConstituentRepo()` + `MobiusNodeRepo` hub helpers | Accessible from CascadeWorker |
| T4 | `hub_regen` type + priority constants | Type-safe debt enqueue |
| T5 | `writeCascadeDebt()` emits hub_invalidate + folder_stats | Debts accumulate correctly on every edit |
| T6 | `hub_invalidate` uses constituent table; enqueues `hub_regen` | Accurate hub staleness without path heuristic |
| T7 | `folder_stats` refreshes ancestor folder chain incrementally | Folder hub scores stay fresh between maintenance runs |
| T8 | `hub_constituent` populated at hub doc generation | T6 lookups return real data instead of empty |

## S6 Boundary Reference

`CascadeWorker.processDebtItem('hub_regen')` is intentionally a no-op stub. S6 Precompiled Knowledge will replace it with:
- Priority queue by hub PageRank (using `MobiusNodeRepo.getStaleHubs()`)
- Rate limiting (max `MAX_HUB_REGEN_PER_CYCLE` per cascade window)
- LLM-based hub doc rewrite or incremental patch for single-constituent changes
- `MobiusNodeRepo.clearHubStale()` call after successful regeneration

The shared data structures (`hub_constituent`, `hub_stale_since`, `hub_regen` debt type, `MobiusNodeRepo.markHubStale/clearHubStale/getStaleHubs`) are all defined in this plan and owned by S3. S6 only needs to implement the processing logic.
