# Precompiled Knowledge Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the hub doc "compiled knowledge" pipeline: enable materialization, persist constituent membership, detect staleness via the full `hub_constituent` path (not just reference edges), run background regeneration, pre-embed hub doc vectors, and boost hub docs in the reranker — turning hub docs from a disabled skeleton into a live, queryable knowledge layer.

**Branch:** `feat/precompiled-knowledge` (git worktree)

**Architecture:** S3 (Cascade Update) has already landed the `hub_stale_since` column on `mobius_node` and the `hub_invalidate` CascadeWorker case, which marks hubs stale via reference-graph edges. S6 builds on top: it adds the `hub_constituent` table (fine-grained constituent tracking by path), the `hub_regen_queue` table (prioritized background regeneration), a `HubConstituentRepo`, a `HubStalenessDetector` hooked into `SearchUpdateListener.flush()`, a `HubRegenService` singleton, and a reranker boost for `hub_doc` typed results. Materialization (`HUB_MAINTENANCE_MATERIALIZE_DOCS`) is flipped to `true` only in Task 2 after the DDL and repo are ready.

**Spec:** `docs/superpowers/specs/2026-05-01-precompiled-knowledge-design.md` (Sections 3, 4, 6, 8, 9)

**Dependency:** Requires S3 (Cascade Update) to be merged first. S3 delivers:
- `hub_stale_since INTEGER` column in `mobius_node` DDL (`ddl.ts:703`)
- `hub_invalidate` case in `CascadeWorker.processDebtItem()` — sets `hub_stale_since` via reference-graph edges
S6 DOES NOT re-implement that column or that case. It adds finer-grained constituent-path tracking and a dedicated regeneration queue on top.

---

## File Structure

### Modified Files

| File | Change Summary |
|------|----------------|
| `src/core/storage/sqlite/ddl.ts` | Add `hub_constituent` + `hub_regen_queue` CREATE TABLE blocks |
| `src/core/storage/sqlite/SqliteStoreManager.ts` | Register `HubConstituentRepo` instance + getter |
| `src/core/constant.ts` | Flip `HUB_MAINTENANCE_MATERIALIZE_DOCS = true`; add `INDEX_SEARCH_HUB_DOC_TYPE_BOOST` constant |
| `src/service/search/index/types.ts` | No change needed — `hub_maintenance` already has `includeEmbeddings: true` |
| `src/service/search/index/indexUpdater.ts` | Import + instantiate `HubStalenessDetector`; call after flush upserts |
| `src/service/search/index/indexInitializer.ts` | Init `HubRegenService` at startup; process queue if pending items exist |
| `src/service/search/query/reranker.ts` | Add `hubDocBoost` signal in `applyRankingBoosts()` |
| `src/app/commands/Register.ts` | Add "Peak: Refresh Hub Summaries" command |

### New Files

| File | Purpose |
|------|---------|
| `src/core/storage/sqlite/repositories/HubConstituentRepo.ts` | CRUD for `hub_constituent` + `hub_regen_queue` tables |
| `src/service/search/index/helper/hub/hubStalenessDetector.ts` | Post-flush staleness detection via `hub_constituent` lookup |
| `src/service/search/index/helper/hub/hubRegenService.ts` | Background singleton that processes `hub_regen_queue` with debounce + retry |

> **Note on `hubDocServices.ts`:** This file lives outside the worktree (it was compiled into the codebase without a src path — check `find . -name "hubDocServices.ts"`). If it resolves to a non-existent path, the constituent persistence logic in Task 2 may need to call `materializeHubDocFromCandidate` through a dynamic import. Verify the actual path before editing.

---

## Task 1: DDL — Add hub_constituent + hub_regen_queue tables

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts`

**Prerequisite check:** `hub_stale_since INTEGER` already appears on `mobius_node` at `ddl.ts:703` (added by S3). Do NOT re-add it.

- [ ] **Step 1: Locate insertion point**

Read `ddl.ts` around line 737 (end of `mobius_operation` index block) to confirm the exact line after the last `CREATE INDEX IF NOT EXISTS idx_mobius_operation` statement and before the next `db.exec` call. That is the insertion point for the new `db.exec` block.

- [ ] **Step 2: Add hub_constituent + hub_regen_queue tables**

After the `mobius_operation` block (immediately before the `// ── Ambient push log ──` comment), insert:

```typescript
    // ── Precompiled knowledge layer: constituent membership + regeneration queue ──
    db.exec(`
        CREATE TABLE IF NOT EXISTS hub_constituent (
            hub_node_id    TEXT NOT NULL,
            hub_path       TEXT NOT NULL,
            member_path    TEXT NOT NULL,
            member_node_id TEXT,
            source_kind    TEXT NOT NULL,
            added_at       INTEGER NOT NULL,
            PRIMARY KEY (hub_node_id, member_path)
        );
        CREATE INDEX IF NOT EXISTS idx_hub_constituent_member ON hub_constituent(member_path);
        CREATE INDEX IF NOT EXISTS idx_hub_constituent_hub    ON hub_constituent(hub_node_id);
        CREATE TABLE IF NOT EXISTS hub_regen_queue (
            hub_node_id    TEXT PRIMARY KEY,
            hub_path       TEXT NOT NULL,
            queued_at      INTEGER NOT NULL,
            trigger_paths  TEXT NOT NULL,
            priority       INTEGER NOT NULL DEFAULT 0,
            status         TEXT NOT NULL DEFAULT 'pending',
            last_attempt   INTEGER,
            fail_count     INTEGER NOT NULL DEFAULT 0,
            error_message  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_hub_regen_queue_status ON hub_regen_queue(status, priority DESC);
    `);
```

Also add the two new table keys to the `Database` interface in `ddl.ts` so Kysely can type them:

```typescript
    hub_constituent: {
        hub_node_id: string;
        hub_path: string;
        member_path: string;
        member_node_id: string | null;
        source_kind: string;
        added_at: number;
    };
    hub_regen_queue: {
        hub_node_id: string;
        hub_path: string;
        queued_at: number;
        trigger_paths: string;
        priority: number;
        status: string;
        last_attempt: number | null;
        fail_count: number;
        error_message: string | null;
    };
```

Insert these after the `mobius_operation` interface entry in the `Database` interface block.

- [ ] **Step 3: Build verify**

```bash
npm run build
```

Expected: No type errors. DDL strings are validated at runtime, not compile time.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts
git commit -m "feat(hub-S6): add hub_constituent + hub_regen_queue DDL"
```

---

## Task 2: HubConstituentRepo + SqliteStoreManager registration

**Files:**
- Create: `src/core/storage/sqlite/repositories/HubConstituentRepo.ts`
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts`

- [ ] **Step 1: Create HubConstituentRepo**

Create `src/core/storage/sqlite/repositories/HubConstituentRepo.ts`:

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '../ddl';

export interface HubConstituentRow {
    hub_node_id: string;
    hub_path: string;
    member_path: string;
    member_node_id: string | null;
    source_kind: 'cluster_member' | 'local_graph' | 'folder_child' | 'manual';
    added_at: number;
}

export interface HubRegenQueueRow {
    hub_node_id: string;
    hub_path: string;
    queued_at: number;
    trigger_paths: string; // JSON array
    priority: number;
    status: 'pending' | 'in_progress' | 'failed';
    last_attempt: number | null;
    fail_count: number;
    error_message: string | null;
}

export class HubConstituentRepo {
    constructor(private readonly db: Kysely<Database>) {}

    // ── Constituent membership ──

    /** Replace all constituents for a hub (delete-then-insert, idempotent). */
    async replaceForHub(hubNodeId: string, rows: Omit<HubConstituentRow, 'hub_node_id'>[]): Promise<void> {
        await this.db
            .deleteFrom('hub_constituent')
            .where('hub_node_id', '=', hubNodeId)
            .execute();
        if (!rows.length) return;
        const insertRows = rows.map((r) => ({ ...r, hub_node_id: hubNodeId }));
        for (let i = 0; i < insertRows.length; i += 100) {
            await this.db
                .insertInto('hub_constituent')
                .values(insertRows.slice(i, i + 100) as any)
                .execute();
        }
    }

    /** Clear all constituents — called before full hub rediscovery. */
    async clearAll(): Promise<void> {
        await this.db.deleteFrom('hub_constituent').execute();
    }

    /**
     * Find hub docs that contain any of the given member paths as constituents.
     * Uses idx_hub_constituent_member — O(log n) per path.
     */
    async findHubsForMembers(memberPaths: string[]): Promise<Array<{ hub_node_id: string; hub_path: string }>> {
        if (!memberPaths.length) return [];
        const rows = await this.db
            .selectFrom('hub_constituent')
            .select(['hub_node_id', 'hub_path'])
            .where('member_path', 'in', memberPaths)
            .distinct()
            .execute();
        return rows as Array<{ hub_node_id: string; hub_path: string }>;
    }

    /** Get all constituent rows for a hub. */
    async getMembersForHub(hubNodeId: string): Promise<HubConstituentRow[]> {
        return this.db
            .selectFrom('hub_constituent')
            .selectAll()
            .where('hub_node_id', '=', hubNodeId)
            .execute() as Promise<HubConstituentRow[]>;
    }

    // ── Regeneration queue ──

    /**
     * Upsert a hub into the regen queue.
     * If already queued: merge trigger_paths + take max priority + reset 'failed' to 'pending'.
     */
    async enqueue(hubNodeId: string, hubPath: string, triggerPaths: string[], priority: number): Promise<void> {
        const existing = await this.db
            .selectFrom('hub_regen_queue')
            .selectAll()
            .where('hub_node_id', '=', hubNodeId)
            .executeTakeFirst() as HubRegenQueueRow | undefined;

        if (existing) {
            const existingTriggers: string[] = JSON.parse(existing.trigger_paths || '[]');
            const merged = [...new Set([...existingTriggers, ...triggerPaths])];
            await this.db
                .updateTable('hub_regen_queue')
                .set({
                    trigger_paths: JSON.stringify(merged),
                    priority: Math.max(existing.priority, priority),
                    ...(existing.status === 'failed' ? { status: 'pending' } : {}),
                } as any)
                .where('hub_node_id', '=', hubNodeId)
                .execute();
        } else {
            await this.db
                .insertInto('hub_regen_queue')
                .values({
                    hub_node_id: hubNodeId,
                    hub_path: hubPath,
                    queued_at: Date.now(),
                    trigger_paths: JSON.stringify(triggerPaths),
                    priority,
                    status: 'pending',
                    last_attempt: null,
                    fail_count: 0,
                    error_message: null,
                } as any)
                .execute();
        }
    }

    /**
     * Atomically dequeue the highest-priority pending item and mark it in_progress.
     * Returns null when queue is empty.
     */
    async dequeuePending(): Promise<HubRegenQueueRow | null> {
        const row = await this.db
            .selectFrom('hub_regen_queue')
            .selectAll()
            .where('status', '=', 'pending')
            .orderBy('priority', 'desc')
            .orderBy('queued_at', 'asc')
            .limit(1)
            .executeTakeFirst() as HubRegenQueueRow | undefined;
        if (!row) return null;
        await this.db
            .updateTable('hub_regen_queue')
            .set({ status: 'in_progress', last_attempt: Date.now() } as any)
            .where('hub_node_id', '=', row.hub_node_id)
            .execute();
        return row;
    }

    /** Remove a completed hub from the queue. */
    async markCompleted(hubNodeId: string): Promise<void> {
        await this.db
            .deleteFrom('hub_regen_queue')
            .where('hub_node_id', '=', hubNodeId)
            .execute();
    }

    /** Mark a queue item failed; increments fail_count. */
    async markFailed(hubNodeId: string, errorMessage: string): Promise<void> {
        // Kysely doesn't support `col + 1` directly; read-modify-write is safe here (single-user SQLite)
        const existing = await this.db
            .selectFrom('hub_regen_queue')
            .select('fail_count')
            .where('hub_node_id', '=', hubNodeId)
            .executeTakeFirst() as { fail_count: number } | undefined;
        const newCount = (existing?.fail_count ?? 0) + 1;
        await this.db
            .updateTable('hub_regen_queue')
            .set({ status: 'failed', fail_count: newCount, error_message: errorMessage } as any)
            .where('hub_node_id', '=', hubNodeId)
            .execute();
    }

    /**
     * Reset 'failed' items with fail_count < maxRetries back to 'pending'.
     * Returns the number of items reset.
     */
    async resetRetryableFailures(maxRetries: number = 3): Promise<number> {
        const rows = await this.db
            .selectFrom('hub_regen_queue')
            .select('hub_node_id')
            .where('status', '=', 'failed')
            .where('fail_count', '<', maxRetries)
            .execute();
        if (!rows.length) return 0;
        await this.db
            .updateTable('hub_regen_queue')
            .set({ status: 'pending' } as any)
            .where('status', '=', 'failed')
            .where('fail_count', '<', maxRetries)
            .execute();
        return rows.length;
    }

    /** Count pending items (for startup check). */
    async pendingCount(): Promise<number> {
        const row = await this.db
            .selectFrom('hub_regen_queue')
            .select((eb) => eb.fn.count<number>('hub_node_id').as('cnt'))
            .where('status', '=', 'pending')
            .executeTakeFirst();
        return Number(row?.cnt ?? 0);
    }

    /** Wipe the entire queue (for testing / reset). */
    async clearQueue(): Promise<void> {
        await this.db.deleteFrom('hub_regen_queue').execute();
    }
}
```

- [ ] **Step 2: Register in SqliteStoreManager**

Read `src/core/storage/sqlite/SqliteStoreManager.ts` around lines 60-90 (private fields) and 195-210 (init block) and 325-340 (getters) to find exact insertion points.

Add import at top:
```typescript
import { HubConstituentRepo } from './repositories/HubConstituentRepo';
```

Add private field after the last `private` field declaration:
```typescript
    private hubConstituentRepo: HubConstituentRepo | null = null;
```

Initialize in `init()` after the last `new …Repo(searchKdb)` call:
```typescript
        this.hubConstituentRepo = new HubConstituentRepo(searchKdb);
```

Add getter after the last getter method:
```typescript
    getHubConstituentRepo(): HubConstituentRepo {
        if (this.closing || !this.hubConstituentRepo) {
            throw new Error('[SqliteStoreManager] HubConstituentRepo not initialized');
        }
        return this.hubConstituentRepo;
    }
```

- [ ] **Step 3: Enable hub doc materialization**

In `src/core/constant.ts` line 148, change:
```typescript
export const HUB_MAINTENANCE_MATERIALIZE_DOCS = false;
```
to:
```typescript
export const HUB_MAINTENANCE_MATERIALIZE_DOCS = true;
```

- [ ] **Step 4: Build verify**

```bash
npm run build
```

Expected: Build succeeds with no type errors. Kysely will infer `hub_constituent` and `hub_regen_queue` from the `Database` interface added in Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/sqlite/repositories/HubConstituentRepo.ts \
        src/core/storage/sqlite/SqliteStoreManager.ts \
        src/core/constant.ts
git commit -m "feat(hub-S6): add HubConstituentRepo, register in StoreManager, enable materialization"
```

---

## Task 3: Persist constituent paths after hub doc materialization

**Files:**
- Modify: `src/service/search/index/helper/hub/hubDocServices.ts` (verify path exists first)

**Pre-step:** Locate the actual file path:
```bash
find . -name "hubDocServices.ts" | head -5
```
If the file does not exist (it may be in a compiled-only state), skip this task and note it in the commit for follow-up.

- [ ] **Step 1: Add import**

At the top of `hubDocServices.ts`, ensure this import exists (add if missing):
```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { HubConstituentRow } from '@/core/storage/sqlite/repositories/HubConstituentRepo';
```

- [ ] **Step 2: Persist constituents inside materializeHubDocFromCandidate()**

Locate the call to `indexService.indexDocument(fullPath, ...)` inside `materializeHubDocFromCandidate()` (spec anchor: line 472). Immediately after that call succeeds (before the function returns), insert:

```typescript
    // Persist constituent membership for incremental staleness tracking (S6)
    try {
        const constituentRepo = sqliteStoreManager.getHubConstituentRepo();
        const now = Date.now();
        const memberRows: Omit<HubConstituentRow, 'hub_node_id'>[] = [];

        // 1. Cluster members
        for (const mp of (assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths ?? [])) {
            memberRows.push({ hub_path: fullPath, member_path: mp, member_node_id: null, source_kind: 'cluster_member', added_at: now });
        }

        // 2. Local graph document nodes (not yet in cluster members)
        for (const node of (assembly?.localHubGraph?.nodes ?? [])) {
            if (node.type === 'document' && node.path && !memberRows.some((r) => r.member_path === node.path)) {
                memberRows.push({ hub_path: fullPath, member_path: node.path, member_node_id: node.id ?? null, source_kind: 'local_graph', added_at: now });
            }
        }

        // 3. Folder children sample (for folder hubs)
        for (const mp of (assembly?.memberPathsSample ?? [])) {
            if (!memberRows.some((r) => r.member_path === mp)) {
                memberRows.push({ hub_path: fullPath, member_path: mp, member_node_id: null, source_kind: 'folder_child', added_at: now });
            }
        }

        // hub_node_id is the mobius_node node_id for the hub doc row (assigned during indexDocument)
        const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
        const hubNode = await nodeRepo.getByPath(fullPath);
        if (hubNode?.node_id) {
            await constituentRepo.replaceForHub(hubNode.node_id, memberRows);
        }
    } catch (err) {
        console.warn('[HubDoc] Failed to persist constituent membership:', err);
    }
```

**Important:** The constituent persistence is fire-and-forget with a catch — it must never throw and abort hub doc generation.

- [ ] **Step 3: Clear hub_constituent during full rediscovery**

Locate `generateAndIndexHubDocsForMaintenance()` (the top-level hub pipeline). Before the discovery loop begins (before `mapWithConcurrency`), add:

```typescript
    // Clear stale constituent rows before full rediscovery (will be rebuilt per hub)
    try {
        await sqliteStoreManager.getHubConstituentRepo().clearAll();
    } catch (err) {
        console.warn('[HubDoc] Failed to clear hub_constituent before rediscovery:', err);
    }
```

- [ ] **Step 4: Build verify**

```bash
npm run build
```

Expected: Build succeeds. If `hubDocServices.ts` types for `assembly` and `candidate` are unclear, use `(assembly as any)?.clusterMemberPaths` guards.

- [ ] **Step 5: Commit**

```bash
git add src/service/search/index/helper/hub/hubDocServices.ts
git commit -m "feat(hub-S6): persist constituent paths to hub_constituent after materialization"
```

---

## Task 4: HubStalenessDetector — post-flush staleness detection

**Files:**
- Create: `src/service/search/index/helper/hub/hubStalenessDetector.ts`
- Modify: `src/service/search/index/indexUpdater.ts`

**Architecture note:** The existing `hub_invalidate` CascadeWorker case (S3) detects staleness via *reference edges* — it marks hubs stale when a document that is *linked to* by a hub changes. The `HubStalenessDetector` provides *finer-grained path-level* detection: when a constituent note is directly modified (even if it has no reference edge to the hub), the hub is still marked stale. The two mechanisms are complementary, not duplicative.

- [ ] **Step 1: Create HubStalenessDetector**

Create `src/service/search/index/helper/hub/hubStalenessDetector.ts`:

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Detects which hub docs are stale after constituent notes change.
 *
 * Called from SearchUpdateListener.flush() after indexing upserts.
 * Complements the CascadeWorker hub_invalidate case (S3) by providing
 * finer-grained constituent-path detection rather than reference-edge detection.
 *
 * Staleness priority scoring:
 *   - Base: number of changed constituent paths (capped at 20)
 *   - Access recency and navigation hub status will be added in a future iteration
 */
export class HubStalenessDetector {
    /**
     * For each upserted path, find affected hub docs via hub_constituent,
     * set hub_stale_since on their mobius_node rows (if not already stale),
     * and enqueue them for background regeneration.
     *
     * @param upsertedPaths - paths re-indexed by the listener in this flush
     * @param contentHashChanged - optional set; when provided, only paths in this set
     *   trigger invalidation (avoids false triggers from metadata-only edits)
     */
    async detectAndMarkStale(
        upsertedPaths: string[],
        contentHashChanged?: Set<string>,
    ): Promise<{ staleHubCount: number }> {
        if (!upsertedPaths.length) return { staleHubCount: 0 };
        if (!sqliteStoreManager.isInitialized()) return { staleHubCount: 0 };

        const pathsToCheck = contentHashChanged
            ? upsertedPaths.filter((p) => contentHashChanged.has(p))
            : upsertedPaths;
        if (!pathsToCheck.length) return { staleHubCount: 0 };

        try {
            const constituentRepo = sqliteStoreManager.getHubConstituentRepo();
            const affectedHubs = await constituentRepo.findHubsForMembers(pathsToCheck);
            if (!affectedHubs.length) return { staleHubCount: 0 };

            const now = Date.now();
            const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
            const db = sqliteStoreManager.getIndexContext('vault');

            for (const hub of affectedHubs) {
                // Only set hub_stale_since if not already stale (don't overwrite earlier timestamp)
                const existing = await db
                    .selectFrom('mobius_node' as any)
                    .select(['hub_stale_since'] as any)
                    .where('node_id' as any, '=', hub.hub_node_id)
                    .executeTakeFirst() as { hub_stale_since: number | null } | undefined;

                if (existing && existing.hub_stale_since == null) {
                    await db
                        .updateTable('mobius_node' as any)
                        .set({ hub_stale_since: now } as any)
                        .where('node_id' as any, '=', hub.hub_node_id)
                        .execute();
                }

                // Compute priority: more trigger paths = higher priority (cap 20)
                const triggerPaths = pathsToCheck; // all changed paths that affected any hub
                const priority = Math.min(triggerPaths.length, 20);
                await constituentRepo.enqueue(hub.hub_node_id, hub.hub_path, triggerPaths, priority);
            }

            console.log(
                `[HubStalenessDetector] Marked ${affectedHubs.length} hub(s) stale from ${pathsToCheck.length} changed path(s)`,
            );
            return { staleHubCount: affectedHubs.length };
        } catch (err) {
            console.warn('[HubStalenessDetector] Failed:', err);
            return { staleHubCount: 0 };
        }
    }
}
```

- [ ] **Step 2: Hook into SearchUpdateListener.flush()**

In `src/service/search/index/indexUpdater.ts`:

Add import near the top (after existing imports):
```typescript
import { HubStalenessDetector } from './helper/hub/hubStalenessDetector';
```

Add private field on `SearchUpdateListener` class (near line 25):
```typescript
    private readonly stalenessDetector = new HubStalenessDetector();
```

In the `flush()` method, inside the `work` async IIFE, after the `await Promise.all([...])` call that handles deletes and upserts (around line 221), add:

```typescript
                    // Detect and queue stale hub docs from constituent changes (S6)
                    if (upsertPaths.length > 0) {
                        // Fire-and-forget; errors are caught inside detectAndMarkStale
                        void this.stalenessDetector.detectAndMarkStale(upsertPaths).then(({ staleHubCount }) => {
                            if (staleHubCount > 0) {
                                // Trigger regeneration sweep after 30s debounce
                                import('@/service/search/index/helper/hub/hubRegenService').then(({ HubRegenService }) => {
                                    HubRegenService.getInstance().scheduleRegenSweep();
                                });
                            }
                        });
                    }
```

**Note:** The dynamic import of `HubRegenService` avoids a circular dependency since `indexUpdater.ts` → `hubStalenessDetector.ts` → `hubRegenService.ts` would create an import loop if all were static.

- [ ] **Step 3: Build verify**

```bash
npm run build
```

Expected: Build succeeds. Confirm no circular dependency warnings in esbuild output.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/helper/hub/hubStalenessDetector.ts \
        src/service/search/index/indexUpdater.ts
git commit -m "feat(hub-S6): add HubStalenessDetector + hook into SearchUpdateListener flush"
```

---

## Task 5: HubRegenService — background regeneration queue processor

**Files:**
- Create: `src/service/search/index/helper/hub/hubRegenService.ts`
- Modify: `src/service/search/index/indexInitializer.ts`
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Create HubRegenService**

Create `src/service/search/index/helper/hub/hubRegenService.ts`:

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { SearchSettings } from '@/app/settings/types';

const HUB_REGEN_DEBOUNCE_MS = 30_000; // 30s after last stale detection
const HUB_REGEN_BATCH_SIZE = 10;       // max hubs per sweep
const HUB_REGEN_MAX_RETRIES = 3;       // max attempts before giving up

/**
 * Background singleton that processes the hub_regen_queue.
 *
 * Trigger points:
 *   - Scheduled by HubStalenessDetector after flush (30s debounce)
 *   - On plugin startup if stale hubs remain from a previous session
 *   - Explicit "Peak: Refresh Hub Summaries" command
 *
 * Each regeneration re-runs materializeHubDocFromCandidate(), which:
 *   1. Re-discovers the hub's local graph assembly
 *   2. Re-generates hub markdown skeleton
 *   3. LLM fills the skeleton (PromptId.HubDocSummary)
 *   4. Re-indexes with embeddings (hub_maintenance options)
 *   5. Replaces hub_constituent rows
 *   6. Clears hub_stale_since on mobius_node
 */
export class HubRegenService {
    private static _instance: HubRegenService | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private processing = false;
    private getSearchSettings: (() => SearchSettings) | null = null;

    static getInstance(): HubRegenService {
        if (!HubRegenService._instance) {
            HubRegenService._instance = new HubRegenService();
        }
        return HubRegenService._instance;
    }

    /** Must be called before scheduleRegenSweep or processQueueNow. */
    init(getSearchSettings: () => SearchSettings): void {
        this.getSearchSettings = getSearchSettings;
    }

    /** Schedule a regen sweep after the debounce window (idempotent — multiple calls collapse). */
    scheduleRegenSweep(): void {
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.processQueue();
        }, HUB_REGEN_DEBOUNCE_MS);
    }

    /** Trigger an immediate processing pass (startup / explicit command). */
    async processQueueNow(): Promise<{ processed: number; failed: number }> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        return this.processQueue();
    }

    private async processQueue(): Promise<{ processed: number; failed: number }> {
        if (this.processing) return { processed: 0, failed: 0 };
        if (!sqliteStoreManager.isInitialized()) return { processed: 0, failed: 0 };
        if (!this.getSearchSettings) {
            console.warn('[HubRegenService] Not initialized — call init() first');
            return { processed: 0, failed: 0 };
        }

        this.processing = true;
        let processed = 0;
        let failed = 0;

        try {
            const repo = sqliteStoreManager.getHubConstituentRepo();
            const db = sqliteStoreManager.getIndexContext('vault');

            // Retry previously failed items that haven't exceeded max retries
            await repo.resetRetryableFailures(HUB_REGEN_MAX_RETRIES);

            for (let i = 0; i < HUB_REGEN_BATCH_SIZE; i++) {
                const item = await repo.dequeuePending();
                if (!item) break;

                try {
                    await this.regenerateHub(item.hub_node_id, item.hub_path);

                    // Clear staleness flag
                    await db
                        .updateTable('mobius_node' as any)
                        .set({ hub_stale_since: null } as any)
                        .where('node_id' as any, '=', item.hub_node_id)
                        .execute();

                    await repo.markCompleted(item.hub_node_id);
                    processed++;
                    console.log(`[HubRegenService] Regenerated: ${item.hub_path}`);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    await repo.markFailed(item.hub_node_id, msg);
                    failed++;
                    console.warn(`[HubRegenService] Failed to regenerate ${item.hub_path}:`, err);
                }
            }
        } finally {
            this.processing = false;
        }

        if (processed > 0 || failed > 0) {
            console.log(`[HubRegenService] Sweep done — ${processed} regenerated, ${failed} failed`);
        }
        return { processed, failed };
    }

    /**
     * Regenerate a single hub doc by re-running the materialization pipeline.
     *
     * Steps:
     *   1. Look up hub node path from mobius_node
     *   2. Find the HubCandidate via HubDocService discovery
     *   3. Call materializeHubDocFromCandidate() — this also updates hub_constituent
     */
    private async regenerateHub(hubNodeId: string, hubPath: string): Promise<void> {
        // Dynamic import to avoid circular deps (hubDocServices imports sqliteStoreManager)
        const { HubDocService } = await import('./hubDocServices');
        const searchSettings = this.getSearchSettings!();

        await HubDocService.regenerateSingleHub(hubNodeId, hubPath, searchSettings);
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        HubRegenService._instance = null;
    }
}
```

**Note:** `HubDocService.regenerateSingleHub()` is a new static method to add to `hubDocServices.ts`. See Step 2.

- [ ] **Step 2: Add regenerateSingleHub() to hubDocServices.ts**

In `hubDocServices.ts`, add a new static/exported function `regenerateSingleHub`:

```typescript
/**
 * Re-run the full hub doc pipeline for a single hub identified by its mobius_node ID and vault path.
 * Used by HubRegenService for background regeneration of stale hubs.
 *
 * Guards: skips user-owned hubs (peak_user_owned = true in frontmatter).
 */
export async function regenerateSingleHub(
    hubNodeId: string,
    hubPath: string,
    searchSettings: SearchSettings,
): Promise<void> {
    // Skip user-owned hubs — they should not be overwritten by automation
    const vault = AppContext.getInstance().app.vault;
    const file = vault.getFileByPath(hubPath);
    if (file) {
        const meta = vault.metadataCache.getFileCache(file)?.frontmatter;
        if (meta?.peak_user_owned === true) {
            console.log(`[HubDoc] Skipping user-owned hub: ${hubPath}`);
            return;
        }
    }

    // Re-discover the hub candidate from its node ID
    // HubCandidateDiscoveryService has a byNodeId method or we re-run discovery and filter
    const hubService = new HubDocService(searchSettings);
    await hubService.regenerateHubByNodeId(hubNodeId, hubPath);
}
```

The exact implementation depends on what `HubDocService` and `HubCandidateDiscoveryService` expose. If a `byNodeId` lookup is unavailable, fall back to running a partial discovery pass filtered by hub path. Use whatever assembly methods already exist in `hubDocServices.ts` — the key contract is: re-run `materializeHubDocFromCandidate()` with fresh assembly.

- [ ] **Step 3: Wire startup trigger in indexInitializer.ts**

Read `src/service/search/index/indexInitializer.ts` around line 272 (step 5/5 hub maintenance block). After the hub maintenance step completes, add:

```typescript
        // S6: Init hub regen service and drain any stale queue from previous session
        const { HubRegenService } = await import('./helper/hub/hubRegenService');
        HubRegenService.getInstance().init(() => this.settings);
        if (sqliteStoreManager.isInitialized()) {
            const pendingCount = await sqliteStoreManager.getHubConstituentRepo().pendingCount();
            if (pendingCount > 0) {
                console.log(`[IndexInitializer] ${pendingCount} stale hub(s) queued — processing in background`);
                void HubRegenService.getInstance().processQueueNow();
            }
        }
```

- [ ] **Step 4: Add "Peak: Refresh Hub Summaries" command**

Read `src/app/commands/Register.ts` to find the commands array. Add:

```typescript
    {
        id: 'peak-refresh-hub-summaries',
        name: 'Peak: Refresh Hub Summaries',
        callback: async () => {
            new Notice('Hub summary refresh started...');
            const { HubRegenService } = await import('@/service/search/index/helper/hub/hubRegenService');
            const result = await HubRegenService.getInstance().processQueueNow();
            new Notice(`Hub refresh complete: ${result.processed} regenerated, ${result.failed} failed`);
        },
    },
```

- [ ] **Step 5: Build verify**

```bash
npm run build
```

Expected: Build succeeds. Check esbuild output for any circular dependency warnings — dynamic imports in `hubRegenService.ts` and `indexUpdater.ts` should prevent cycles.

- [ ] **Step 6: Commit**

```bash
git add src/service/search/index/helper/hub/hubRegenService.ts \
        src/service/search/index/helper/hub/hubDocServices.ts \
        src/service/search/index/indexInitializer.ts \
        src/app/commands/Register.ts
git commit -m "feat(hub-S6): add HubRegenService, startup trigger, and refresh command"
```

---

## Task 6: Pre-embedding verification + reranker hub_doc boost

**Files:**
- Verify: `src/service/search/index/types.ts` (confirm `hub_maintenance` already has `includeEmbeddings: true`)
- Modify: `src/core/constant.ts` — add `INDEX_SEARCH_HUB_DOC_TYPE_BOOST`
- Modify: `src/service/search/query/reranker.ts` — add hub_doc type boost in `applyRankingBoosts()`
- Modify: `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts` — ensure `DocRankingSignal` includes `mobiusNodeType`

- [ ] **Step 1: Confirm hub_maintenance already includes embeddings**

Read `src/service/search/index/types.ts:61-90`. Confirm that the `hub_maintenance` case in `defaultIndexDocumentOptions()` returns `includeEmbeddings: true`. According to the current code at lines 77-88, `hub_maintenance` shares the same case as `manual_full` which already returns `includeEmbeddings: true`. No change needed.

If for any reason `hub_maintenance` does NOT return `includeEmbeddings: true`, add it explicitly:
```typescript
        case 'hub_maintenance':
            return {
                includeEmbeddings: true,
                includeLlmTags: true,
                includeLlmSummary: true,
                preserveExistingLlmDataWhenSkipped: false,
                markLlmPendingWhenSkipped: false,
                includeCoreSearchIndex: true,
                markVectorPendingWhenSkipped: false,
                incrementIndexState: true,
                reason,
            };
```

- [ ] **Step 2: Add INDEX_SEARCH_HUB_DOC_TYPE_BOOST constant**

In `src/core/constant.ts`, near the `INDEX_SEARCH_HUB_INCOMING_BOOST` constant, add:

```typescript
/** Additive score boost applied when a search result is a hub_doc type (compiled knowledge summary). */
export const INDEX_SEARCH_HUB_DOC_TYPE_BOOST = 0.12;
```

0.12 is conservative — hub docs are pre-synthesized expert summaries that merit moderate preference over raw notes, without dominating results entirely.

- [ ] **Step 3: Check DocRankingSignal includes node type**

Read `src/core/storage/sqlite/repositories/MobiusNodeRepo.ts` — find the `DocRankingSignal` type definition. Check if it includes a field for `type` or `mobiusNodeType`. If not, add:

```typescript
    mobiusNodeType?: string | null; // 'document' | 'hub_doc' | 'folder' etc.
```

Then ensure the query that populates `DocRankingSignal` (used by `Reranker.getRankingSignals()`) selects the `type` column from `mobius_node`.

- [ ] **Step 4: Add hub_doc boost in applyRankingBoosts()**

In `src/service/search/query/reranker.ts`:

Add import:
```typescript
import {
    INDEX_HUB_TIER_THRESHOLDS,
    INDEX_SEARCH_HUB_INCOMING_BOOST,
    INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
    PPR_GLOBAL_PR_DAMPENING,
    INDEX_SEARCH_HUB_DOC_TYPE_BOOST,
} from '@/core/constant';
```

In `applyRankingBoosts()`, after the `clickBoost` line (line 369) and before `item.finalScore = ...`, add:

```typescript
                // Hub doc type boost: compiled summaries get a modest preference boost
                const hubDocBoost = (s.mobiusNodeType === 'hub_doc') ? INDEX_SEARCH_HUB_DOC_TYPE_BOOST : 0;
```

Update the final score assignment:
```typescript
                item.finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + clickBoost + hubDocBoost;
```

- [ ] **Step 5: Build verify**

```bash
npm run build
```

Expected: Build succeeds. If `DocRankingSignal` type was changed, confirm no downstream type errors in `queryService.ts` or `reranker.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/core/constant.ts \
        src/service/search/query/reranker.ts \
        src/core/storage/sqlite/repositories/MobiusNodeRepo.ts
git commit -m "feat(hub-S6): add hub_doc type boost in reranker + confirm pre-embedding enabled"
```
