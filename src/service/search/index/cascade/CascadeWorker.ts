import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { SemanticRelatedEdgesRebuildService } from '../helper/semanticRelatedEdges';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { CascadeDebtRecord } from './types';
import { CASCADE_IDLE_DELAY_MS, CASCADE_MAX_ITEMS_PER_WINDOW, CASCADE_DEBT_HUB_REGEN_PRIORITY } from '@/core/constant';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { CascadeScheduler } from './CascadeScheduler';
import type { App } from 'obsidian';

export { CascadeScheduler } from './CascadeScheduler';

export class CascadeWorker {
    private static instance: CascadeWorker | null = null;
    private scheduler: CascadeScheduler;
    private processing = false;
    private eventRefs: any[] = []; // Obsidian EventRef[]

    static getInstance(): CascadeWorker | null { return CascadeWorker.instance; }

    constructor(private readonly app: App) {
        this.scheduler = new CascadeScheduler({
            idleDelayMs: CASCADE_IDLE_DELAY_MS,
            onIdle: () => void this.drainDebt(),
        });
        CascadeWorker.instance = this;
    }

    start(): void {
        const ref1 = this.app.vault.on('modify', () => this.scheduler.notifyActivity());
        const ref2 = this.app.vault.on('create', () => this.scheduler.notifyActivity());
        this.eventRefs.push(ref1, ref2);
    }

    notifyFlushCompleted(): void {
        this.scheduler.notifyActivity();
    }

    private async drainDebt(): Promise<void> {
        if (this.processing) return;
        const bgm = BackgroundSessionManager.getInstance();
        if (bgm && bgm.getActiveCount() > 0) {
            this.scheduler.notifyActivity(); // retry later
            return;
        }

        this.processing = true;
        try {
            const storeManager = SqliteStoreManager.getInstance();
            const cascadeRepo = storeManager.getCascadeDebtRepo('vault');
            const items = await cascadeRepo.drainPending('vault', CASCADE_MAX_ITEMS_PER_WINDOW);
            if (items.length === 0) return;

            const processedIds: number[] = [];
            const affectedDocIds = new Set<string>();

            for (const item of items) {
                try {
                    await this.processDebtItem(item);
                    if (item.id != null) processedIds.push(item.id);
                    affectedDocIds.add(item.targetId);
                } catch (err) {
                    console.error('[CascadeWorker] Failed:', err);
                    if (item.id != null) processedIds.push(item.id);
                }
            }

            if (processedIds.length > 0) await cascadeRepo.markProcessed(processedIds);

            if (affectedDocIds.size > 0) {
                const eventBus = EventBus.getInstance(this.app);
                eventBus.dispatch({ type: ViewEventType.CASCADE_COMPLETED, affectedDocIds: [...affectedDocIds] } as any);
            }

            const remaining = await cascadeRepo.pendingCount('vault');
            if (remaining > 0) this.scheduler.notifyActivity();

            await cascadeRepo.clearProcessed();
        } finally {
            this.processing = false;
        }
    }

    private async processDebtItem(item: CascadeDebtRecord): Promise<void> {
        const storeManager = SqliteStoreManager.getInstance();
        switch (item.debtType) {
            case 'semantic_edge':
                await SemanticRelatedEdgesRebuildService.rebuildForDocIds([item.targetId], 'vault');
                break;
            case 'degree_refresh':
                await storeManager.getMobiusNodeRepo('vault').refreshDocumentIncomingDegreesForNodeIds([item.targetId]);
                break;
            case 'mermaid_overlay':
                break; // handled by rebuildForDocIds
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
            case 'hub_regen':
                // S6 will implement hub regeneration.
                // This no-op ensures the debt record is consumed and marked processed
                // so the queue does not grow indefinitely. S6 will replace this with
                // the actual LLM-based hub doc rewrite / incremental patch logic.
                break;
            case 'folder_stats': {
                // item.targetId = the changed document's node id
                // Resolve the doc's vault path, then walk ancestor folders up the tree
                const mobiusNodeRepo = storeManager.getMobiusNodeRepo('vault');
                const docRow = await mobiusNodeRepo.getByNodeId(item.targetId);
                if (!docRow?.path) break;

                const hubSummaryFolder = getAIHubSummaryFolder();
                const docPath = docRow.path;
                const ancestorFolders: string[] = [];

                // Walk path upward: "a/b/c.md" -> ["a/b", "a"]
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
                for (const folderPath of ancestorFolders) {
                    await this.refreshFolderStats(folderPath, mobiusNodeRepo, now);
                }
                break;
            }
        }
    }

    /**
     * Incrementally refreshes materialized hub stats for a single folder node.
     * Queries child document rows directly -- O(docs in folder), not O(all vault docs).
     */
    private async refreshFolderStats(folderPath: string, mobiusNodeRepo: MobiusNodeRepo, now: number): Promise<void> {
        const storeManager = SqliteStoreManager.getInstance();
        const db = storeManager.getIndexContext('vault');

        // Query documents anywhere under this folder prefix for aggregate stats
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

    dispose(): void {
        this.scheduler.dispose();
        for (const ref of this.eventRefs) this.app.vault.offref(ref);
        this.eventRefs = [];
        CascadeWorker.instance = null;
    }
}
