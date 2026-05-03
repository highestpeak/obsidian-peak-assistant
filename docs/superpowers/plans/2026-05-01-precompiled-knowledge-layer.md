# Precompiled Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable hub doc materialization with constituent membership tracking, incremental staleness detection, background regeneration, and reranker boost — making hub docs a live, queryable "compiled knowledge" layer.

**Architecture:** Flip the existing `HUB_MAINTENANCE_MATERIALIZE_DOCS` flag, add a `hub_constituent` table to track which source notes belong to each hub doc, hook into `SearchUpdateListener.flush()` to detect stale hubs when constituents change, process a regeneration queue in the background, and boost hub_doc results in the reranker.

**Tech Stack:** SQLite (Kysely query builder), existing hub discovery pipeline (`hubDocServices.ts`), `SearchUpdateListener` event hook, `IndexService` for re-indexing.

---

### Task 1: Add DDL for hub_constituent, hub_regen_queue tables + hub_stale_since column

**Files:**
- Modify: `src/core/storage/sqlite/ddl.ts:623` — add new tables after mobius_operation block
- Modify: `src/core/storage/sqlite/ddl.ts:625` — add ALTER TABLE migration for hub_stale_since

- [ ] **Step 1: Add hub_constituent and hub_regen_queue CREATE TABLE statements**

In `ddl.ts`, after the `mobius_operation` indexes (line 622), before the structural_metrics block (line 625), add:

```typescript
	// ── Precompiled knowledge layer: hub constituent tracking + regeneration queue ──
	tryExec(`
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
		CREATE INDEX IF NOT EXISTS idx_hub_constituent_hub ON hub_constituent(hub_node_id);
	`);
	tryExec(`
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

- [ ] **Step 2: Add hub_stale_since column migration**

After the new tables, add an ALTER TABLE migration:

```typescript
	tryExec(`ALTER TABLE mobius_node ADD COLUMN hub_stale_since INTEGER`);
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds (DDL changes are pure SQL strings, no type errors).

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/sqlite/ddl.ts
git commit -m "feat(hub): add hub_constituent, hub_regen_queue tables + hub_stale_since column"
```

---

### Task 2: Create HubConstituentRepo

**Files:**
- Create: `src/core/storage/sqlite/repositories/HubConstituentRepo.ts`

- [ ] **Step 1: Create the repository**

```typescript
import type { Kysely } from 'kysely';
import type { DbSchema } from '../ddl';

export interface HubConstituentRow {
	hub_node_id: string;
	hub_path: string;
	member_path: string;
	member_node_id: string | null;
	source_kind: string;
	added_at: number;
}

export interface HubRegenQueueRow {
	hub_node_id: string;
	hub_path: string;
	queued_at: number;
	trigger_paths: string;
	priority: number;
	status: string;
	last_attempt: number | null;
	fail_count: number;
	error_message: string | null;
}

export class HubConstituentRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ── Constituent membership ──

	/** Replace all constituents for a single hub (idempotent). */
	async replaceForHub(hubNodeId: string, rows: Omit<HubConstituentRow, 'hub_node_id'>[]): Promise<void> {
		await this.db.deleteFrom('hub_constituent' as any).where('hub_node_id', '=', hubNodeId).execute();
		if (!rows.length) return;
		const insertRows = rows.map((r) => ({ ...r, hub_node_id: hubNodeId }));
		// Batch insert in chunks of 100
		for (let i = 0; i < insertRows.length; i += 100) {
			const batch = insertRows.slice(i, i + 100);
			await (this.db.insertInto('hub_constituent' as any) as any).values(batch).execute();
		}
	}

	/** Clear all constituent rows (used during full rediscovery). */
	async clearAll(): Promise<void> {
		await this.db.deleteFrom('hub_constituent' as any).execute();
	}

	/** Find all hub docs affected by the given member paths. */
	async findHubsForMembers(memberPaths: string[]): Promise<Array<{ hub_node_id: string; hub_path: string }>> {
		if (!memberPaths.length) return [];
		const rows = await (this.db.selectFrom('hub_constituent' as any) as any)
			.select(['hub_node_id', 'hub_path'])
			.where('member_path', 'in', memberPaths)
			.execute();
		// Deduplicate by hub_node_id
		const seen = new Set<string>();
		const result: Array<{ hub_node_id: string; hub_path: string }> = [];
		for (const row of rows) {
			if (!seen.has(row.hub_node_id)) {
				seen.add(row.hub_node_id);
				result.push({ hub_node_id: row.hub_node_id, hub_path: row.hub_path });
			}
		}
		return result;
	}

	/** Get all constituent paths for a specific hub. */
	async getMembersForHub(hubNodeId: string): Promise<HubConstituentRow[]> {
		return (this.db.selectFrom('hub_constituent' as any) as any)
			.selectAll()
			.where('hub_node_id', '=', hubNodeId)
			.execute();
	}

	// ── Regeneration queue ──

	/** Upsert a hub into the regen queue. If already queued, merge trigger_paths and bump priority. */
	async enqueue(hubNodeId: string, hubPath: string, triggerPaths: string[], priority: number): Promise<void> {
		const existing = await (this.db.selectFrom('hub_regen_queue' as any) as any)
			.selectAll()
			.where('hub_node_id', '=', hubNodeId)
			.executeTakeFirst();

		if (existing) {
			const existingTriggers: string[] = JSON.parse(existing.trigger_paths || '[]');
			const merged = [...new Set([...existingTriggers, ...triggerPaths])];
			await (this.db.updateTable('hub_regen_queue' as any) as any)
				.set({
					trigger_paths: JSON.stringify(merged),
					priority: Math.max(existing.priority, priority),
					status: existing.status === 'failed' ? 'pending' : existing.status,
				})
				.where('hub_node_id', '=', hubNodeId)
				.execute();
		} else {
			await (this.db.insertInto('hub_regen_queue' as any) as any)
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
				})
				.execute();
		}
	}

	/** Dequeue the highest-priority pending item. Returns null if queue is empty. */
	async dequeuePending(): Promise<HubRegenQueueRow | null> {
		const row = await (this.db.selectFrom('hub_regen_queue' as any) as any)
			.selectAll()
			.where('status', '=', 'pending')
			.orderBy('priority', 'desc')
			.orderBy('queued_at', 'asc')
			.limit(1)
			.executeTakeFirst();
		if (!row) return null;
		await (this.db.updateTable('hub_regen_queue' as any) as any)
			.set({ status: 'in_progress', last_attempt: Date.now() })
			.where('hub_node_id', '=', row.hub_node_id)
			.execute();
		return row as HubRegenQueueRow;
	}

	/** Mark a queue item as completed (removes it). */
	async markCompleted(hubNodeId: string): Promise<void> {
		await this.db.deleteFrom('hub_regen_queue' as any).where('hub_node_id', '=', hubNodeId).execute();
	}

	/** Mark a queue item as failed with error info. */
	async markFailed(hubNodeId: string, errorMessage: string): Promise<void> {
		await (this.db.updateTable('hub_regen_queue' as any) as any)
			.set({
				status: 'failed',
				fail_count: (this.db as any).raw(`fail_count + 1`),
				error_message: errorMessage,
			})
			.where('hub_node_id', '=', hubNodeId)
			.execute();
	}

	/** Reset failed items with fail_count < maxRetries back to pending. */
	async resetRetryableFailures(maxRetries: number = 3): Promise<number> {
		const result = await (this.db.updateTable('hub_regen_queue' as any) as any)
			.set({ status: 'pending' })
			.where('status', '=', 'failed')
			.where('fail_count', '<', maxRetries)
			.execute();
		return (result as any[])?.[0]?.numUpdatedRows ?? 0;
	}

	/** Get count of pending items. */
	async pendingCount(): Promise<number> {
		const row = await (this.db.selectFrom('hub_regen_queue' as any) as any)
			.select([(this.db as any).fn.count('hub_node_id').as('cnt')])
			.where('status', '=', 'pending')
			.executeTakeFirst();
		return Number(row?.cnt ?? 0);
	}

	/** Clear completed/failed entries older than given timestamp. */
	async clearQueue(): Promise<void> {
		await this.db.deleteFrom('hub_regen_queue' as any).execute();
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/sqlite/repositories/HubConstituentRepo.ts
git commit -m "feat(hub): create HubConstituentRepo with constituent + regen queue CRUD"
```

---

### Task 3: Register HubConstituentRepo in SqliteStoreManager

**Files:**
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:61-90` — add private field
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:200-203` — initialize after graphRepo
- Modify: `src/core/storage/sqlite/SqliteStoreManager.ts:328-333` — add getter

- [ ] **Step 1: Add private field**

After `private userProfileProcessedHashRepo` (line 67), add:

```typescript
	private hubConstituentRepo: HubConstituentRepo | null = null;
```

And add the import at the top:

```typescript
import { HubConstituentRepo } from './repositories/HubConstituentRepo';
```

- [ ] **Step 2: Initialize in init()**

After `this.userProfileProcessedHashRepo = new UserProfileProcessedHashRepo(searchKdb);` (line 203), add:

```typescript
		this.hubConstituentRepo = new HubConstituentRepo(searchKdb);
```

- [ ] **Step 3: Add getter method**

After `getUserProfileProcessedHashRepo()` getter, add:

```typescript
	getHubConstituentRepo(): HubConstituentRepo {
		if (this.closing || !this.hubConstituentRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.hubConstituentRepo;
	}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/sqlite/SqliteStoreManager.ts
git commit -m "feat(hub): register HubConstituentRepo in SqliteStoreManager"
```

---

### Task 4: Persist constituent paths after materialization

**Files:**
- Modify: `src/service/search/index/helper/hub/hubDocServices.ts:412-474` — add constituent persistence after vault write + index
- Modify: `src/core/constant.ts:148` — flip HUB_MAINTENANCE_MATERIALIZE_DOCS to true

- [ ] **Step 1: Add constituent persistence in materializeHubDocFromCandidate()**

After the `indexService.indexDocument(fullPath, ...)` call at line 472, before the return at line 473, add:

```typescript
	// Persist constituent membership for incremental staleness tracking
	try {
		const constituentRepo = sqliteStoreManager.getHubConstituentRepo();
		const nodeId = candidate.nodeId;
		const now = Date.now();
		const memberRows: Array<Omit<import('@/core/storage/sqlite/repositories/HubConstituentRepo').HubConstituentRow, 'hub_node_id'>> = [];

		// Cluster members
		const clusterMembers = assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths;
		if (clusterMembers?.length) {
			for (const mp of clusterMembers) {
				memberRows.push({ hub_path: fullPath, member_path: mp, member_node_id: null, source_kind: 'cluster_member', added_at: now });
			}
		}

		// Local graph document nodes
		if (assembly?.localHubGraph?.nodes) {
			for (const node of assembly.localHubGraph.nodes) {
				if (node.type === 'document' && node.path && !memberRows.some((r) => r.member_path === node.path)) {
					memberRows.push({ hub_path: fullPath, member_path: node.path, member_node_id: node.id, source_kind: 'local_graph', added_at: now });
				}
			}
		}

		// Folder children (memberPathsSample)
		if (assembly?.memberPathsSample) {
			for (const mp of assembly.memberPathsSample) {
				if (!memberRows.some((r) => r.member_path === mp)) {
					memberRows.push({ hub_path: fullPath, member_path: mp, member_node_id: null, source_kind: 'folder_child', added_at: now });
				}
			}
		}

		await constituentRepo.replaceForHub(nodeId, memberRows);
	} catch (e) {
		console.warn('[HubDoc] Failed to persist constituent membership:', e);
	}
```

Also add the import at the top of the file:

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
```

- [ ] **Step 2: Flip the materialization flag**

In `src/core/constant.ts:148`, change:

```typescript
export const HUB_MAINTENANCE_MATERIALIZE_DOCS = false;
```

to:

```typescript
export const HUB_MAINTENANCE_MATERIALIZE_DOCS = true;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/helper/hub/hubDocServices.ts src/core/constant.ts
git commit -m "feat(hub): persist constituent paths after materialization + enable hub doc generation"
```

---

### Task 5: Create HubStalenessDetector service

**Files:**
- Create: `src/service/search/index/helper/hub/hubStalenessDetector.ts`

- [ ] **Step 1: Create the staleness detector**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Detects which hub docs are stale after constituent notes change.
 * Called from SearchUpdateListener.flush() after indexing upserts.
 */
export class HubStalenessDetector {
	/**
	 * Given a list of paths that were just indexed (upserted), find affected hub docs
	 * and mark them stale + enqueue for regeneration.
	 *
	 * @param upsertedPaths - paths that were just re-indexed by the listener
	 * @param contentHashChanged - optional set of paths whose content_hash actually changed.
	 *   If provided, only these paths trigger invalidation (avoids false triggers from metadata-only edits).
	 *   If not provided, all upsertedPaths are assumed to have changed.
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
			const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();

			for (const hub of affectedHubs) {
				// Mark hub_stale_since on mobius_node (only if not already stale)
				await nodeRepo.updateByNodeId(hub.hub_node_id, { hub_stale_since: now } as any);

				// Compute priority: more trigger paths = higher priority
				const triggerPaths = pathsToCheck.filter((p) =>
					affectedHubs.some((h) => h.hub_node_id === hub.hub_node_id),
				);
				const priority = Math.min(triggerPaths.length, 20);

				await constituentRepo.enqueue(hub.hub_node_id, hub.hub_path, triggerPaths, priority);
			}

			console.log(`[HubStalenessDetector] Marked ${affectedHubs.length} hub(s) stale from ${pathsToCheck.length} changed path(s)`);
			return { staleHubCount: affectedHubs.length };
		} catch (e) {
			console.warn('[HubStalenessDetector] Failed to detect staleness:', e);
			return { staleHubCount: 0 };
		}
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/search/index/helper/hub/hubStalenessDetector.ts
git commit -m "feat(hub): create HubStalenessDetector for post-flush staleness detection"
```

---

### Task 6: Hook HubStalenessDetector into SearchUpdateListener.flush()

**Files:**
- Modify: `src/service/search/index/indexUpdater.ts:206-253` — call detector after indexing upserts

- [ ] **Step 1: Add detector call in flush()**

Add import at top of `indexUpdater.ts`:

```typescript
import { HubStalenessDetector } from './helper/hub/hubStalenessDetector';
```

Add a private field on `SearchUpdateListener` (near line 25):

```typescript
	private readonly stalenessDetector = new HubStalenessDetector();
```

In the `flush()` method, inside the `.then()` callback at line 237, after the console.log, add the staleness detection call:

```typescript
					// Detect stale hub docs from constituent changes
					if (upsertPaths.length > 0) {
						this.stalenessDetector.detectAndMarkStale(upsertPaths).catch((e) => {
							console.warn('[SearchUpdateListener] Hub staleness detection failed:', e);
						});
					}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/search/index/indexUpdater.ts
git commit -m "feat(hub): hook staleness detection into SearchUpdateListener flush"
```

---

### Task 7: Create HubRegenService for background regeneration

**Files:**
- Create: `src/service/search/index/helper/hub/hubRegenService.ts`

- [ ] **Step 1: Create the regeneration service**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexService } from '../../indexService';
import { materializeHubDocFromCandidate } from './hubDocServices';
import { HubCandidateDiscoveryService } from './hubDiscover';
import type { HubCandidate } from './types';
import type { SearchSettings } from '@/app/settings/types';

const HUB_REGEN_DEBOUNCE_MS = 30_000; // 30s debounce after flush
const HUB_REGEN_BATCH_SIZE = 10;
const HUB_REGEN_MAX_RETRIES = 3;

/**
 * Background service that processes the hub regeneration queue.
 * Stale hub docs are regenerated with fresh LLM summaries.
 */
export class HubRegenService {
	private static instance: HubRegenService | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private processing = false;
	private getSearchSettings: (() => SearchSettings) | null = null;

	static getInstance(): HubRegenService {
		if (!HubRegenService.instance) {
			HubRegenService.instance = new HubRegenService();
		}
		return HubRegenService.instance;
	}

	init(getSearchSettings: () => SearchSettings): void {
		this.getSearchSettings = getSearchSettings;
	}

	/** Schedule a regeneration sweep after debounce delay. */
	scheduleRegenSweep(): void {
		if (this.timer) return; // already scheduled
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.processQueue();
		}, HUB_REGEN_DEBOUNCE_MS);
	}

	/** Trigger immediate processing (e.g., on startup or explicit command). */
	async processQueueNow(): Promise<{ processed: number; failed: number }> {
		return this.processQueue();
	}

	/** Process pending items in the regen queue. */
	private async processQueue(): Promise<{ processed: number; failed: number }> {
		if (this.processing) return { processed: 0, failed: 0 };
		if (!sqliteStoreManager.isInitialized()) return { processed: 0, failed: 0 };
		if (!this.getSearchSettings) return { processed: 0, failed: 0 };

		this.processing = true;
		let processed = 0;
		let failed = 0;

		try {
			const repo = sqliteStoreManager.getHubConstituentRepo();

			// Reset retryable failures
			await repo.resetRetryableFailures(HUB_REGEN_MAX_RETRIES);

			for (let i = 0; i < HUB_REGEN_BATCH_SIZE; i++) {
				const item = await repo.dequeuePending();
				if (!item) break;

				try {
					await this.regenerateHub(item.hub_node_id, item.hub_path);
					await repo.markCompleted(item.hub_node_id);

					// Clear staleness flag
					const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
					await nodeRepo.updateByNodeId(item.hub_node_id, { hub_stale_since: null } as any);

					processed++;
					console.log(`[HubRegenService] Regenerated hub: ${item.hub_path}`);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					await repo.markFailed(item.hub_node_id, msg);
					failed++;
					console.warn(`[HubRegenService] Failed to regenerate ${item.hub_path}:`, e);
				}
			}
		} finally {
			this.processing = false;
		}

		if (processed > 0 || failed > 0) {
			console.log(`[HubRegenService] Queue sweep: ${processed} regenerated, ${failed} failed`);
		}
		return { processed, failed };
	}

	/** Regenerate a single hub doc by re-running the materialization pipeline. */
	private async regenerateHub(hubNodeId: string, hubPath: string): Promise<void> {
		const searchSettings = this.getSearchSettings!();
		const indexService = IndexService.getInstance();

		// We need the HubCandidate to regenerate. Look up the hub node to find its source path.
		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const hubNode = await nodeRepo.getByNodeId(hubNodeId);
		if (!hubNode) {
			throw new Error(`Hub node ${hubNodeId} not found in mobius_node`);
		}

		// Re-discover the hub candidate from the source path using discoverFromSeed
		const { discoverFromSeed } = await import('./hubDocServices');
		const candidates = await discoverFromSeed(hubNode.path ?? hubPath, { maxCandidates: 5 });
		const candidate = candidates.find((c) => c.nodeId === hubNodeId || c.stableKey === hubNodeId);

		if (!candidate) {
			// If the hub is no longer discoverable, it may have been obsoleted. Remove from queue.
			console.log(`[HubRegenService] Hub ${hubNodeId} no longer discoverable, skipping`);
			return;
		}

		// Build the hub node ID set for assembly context
		const allHubNodeIds = new Set(candidates.map((c) => c.nodeId));

		// Get the hub summaries folder path (derive from hubPath: remove filename)
		const hubFolder = hubPath.substring(0, hubPath.lastIndexOf('/'));

		await materializeHubDocFromCandidate(candidate, {
			hubPath: hubFolder,
			hubNodeIdSet: allHubNodeIds,
			searchSettings,
			indexService,
		});
	}

	dispose(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		HubRegenService.instance = null;
	}
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/service/search/index/helper/hub/hubRegenService.ts
git commit -m "feat(hub): create HubRegenService for background regeneration queue processing"
```

---

### Task 8: Wire HubRegenService triggers (post-flush + startup)

**Files:**
- Modify: `src/service/search/index/indexUpdater.ts` — schedule regen after staleness detection
- Modify: `src/service/search/index/helper/hub/hubStalenessDetector.ts` — trigger regen schedule after marking stale
- Modify: `src/service/search/index/indexInitializer.ts:272-278` — init regen service + process on startup

- [ ] **Step 1: Trigger regen schedule from HubStalenessDetector**

In `hubStalenessDetector.ts`, add import:

```typescript
import { HubRegenService } from './hubRegenService';
```

At the end of `detectAndMarkStale()`, after the console.log and before `return`, add:

```typescript
			// Schedule background regeneration sweep
			HubRegenService.getInstance().scheduleRegenSweep();
```

- [ ] **Step 2: Init and trigger HubRegenService at startup**

In `indexInitializer.ts`, add import:

```typescript
import { HubRegenService } from './helper/hub/hubRegenService';
```

After the hub maintenance step 5/5 block (around line 278), add:

```typescript
		// Initialize hub regen service and process any stale hubs from previous sessions
		HubRegenService.getInstance().init(() => this.settings);
		const constituentRepo = sqliteStoreManager.getHubConstituentRepo();
		const pendingCount = await constituentRepo.pendingCount();
		if (pendingCount > 0) {
			console.log(`[IndexInitializer] ${pendingCount} stale hub(s) pending regeneration, processing...`);
			void HubRegenService.getInstance().processQueueNow();
		}
```

Add import for `sqliteStoreManager`:

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
```

(Check if already imported — if so, skip.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/service/search/index/helper/hub/hubStalenessDetector.ts src/service/search/index/indexInitializer.ts
git commit -m "feat(hub): wire HubRegenService triggers from staleness detector + startup"
```

---

### Task 9: Add hub_doc type boost in reranker

**Files:**
- Modify: `src/service/search/query/reranker.ts:306-358` — add hub_doc type boost
- Modify: `src/core/constant.ts` — add HUB_DOC_BOOST constant

- [ ] **Step 1: Add constant**

In `src/core/constant.ts`, near the existing `INDEX_SEARCH_HUB_INCOMING_BOOST` (line 533), add:

```typescript
/** Additive score boost for hub_doc type results (compiled knowledge summaries). */
export const INDEX_SEARCH_HUB_DOC_TYPE_BOOST = 0.12;
```

- [ ] **Step 2: Add hub_doc boost in applyRankingBoosts()**

In `reranker.ts`, add the import:

```typescript
import {
	INDEX_HUB_TIER_THRESHOLDS,
	INDEX_SEARCH_HUB_INCOMING_BOOST,
	INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
	INDEX_SEARCH_HUB_DOC_TYPE_BOOST,
} from '@/core/constant';
```

In the `applyRankingBoosts()` method, after the `anchorBoost` calculation (around line 356), before the final score assignment at line 358, add:

```typescript
				// Hub doc type boost: prefer compiled knowledge summaries
				const hubDocBoost = s.mobiusNodeType === 'hub_doc' ? INDEX_SEARCH_HUB_DOC_TYPE_BOOST : 0;
```

Update the final score line from:

```typescript
				item.finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost;
```

to:

```typescript
				item.finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + hubDocBoost;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/core/constant.ts src/service/search/query/reranker.ts
git commit -m "feat(hub): add hub_doc type boost in search reranker"
```

---

### Task 10: Add "Refresh Hub Summaries" command

**Files:**
- Modify: `src/app/commands/Register.ts` — add command that triggers full hub regen

- [ ] **Step 1: Add the command**

Find the existing commands array in `Register.ts`. Add a new command:

```typescript
	{
		id: 'peak-refresh-hub-summaries',
		name: 'Peak: Refresh Hub Summaries',
		callback: async () => {
			const { HubRegenService } = await import('@/service/search/index/helper/hub/hubRegenService');
			const service = HubRegenService.getInstance();
			new Notice('Hub summary refresh started...');
			const result = await service.processQueueNow();
			new Notice(`Hub refresh: ${result.processed} regenerated, ${result.failed} failed`);
		},
	},
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(hub): add 'Refresh Hub Summaries' command"
```
