import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SemanticRelatedEdgesRebuildService } from '../helper/semanticRelatedEdges';
import { BackgroundSessionManager } from '@/service/BackgroundSessionManager';
import { EventBus, ViewEventType } from '@/core/eventBus';
import type { CascadeDebtRecord } from './types';
import { CASCADE_IDLE_DELAY_MS, CASCADE_MAX_ITEMS_PER_WINDOW } from '@/core/constant';
import { GraphEdgeType } from '@/core/po/graph.po';
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
                const edgeRepo = storeManager.getMobiusEdgeRepo('vault');
                // Find docs that link TO this document
                const incomingEdges = await edgeRepo.getByToNodesAndTypes([item.targetId], [GraphEdgeType.References]);
                if (incomingEdges.length === 0) break;

                const sourceIds = incomingEdges.map(e => e.from_node_id);
                // MobiusNodeRepo.getByIds returns GraphNode (graph_nodes schema) which has no path field.
                // Query mobius_node directly to get the path column (a real column on mobius_node).
                const db = storeManager.getSearchContext();
                const rows = await db
                    .selectFrom('mobius_node' as any)
                    .select(['node_id', 'path', 'hub_stale_since'] as any)
                    .where('node_id' as any, 'in', sourceIds)
                    .execute() as Array<{ node_id: string; path: string | null; hub_stale_since: number | null }>;

                const now = Date.now();
                for (const row of rows) {
                    const p = row.path;
                    if (p?.startsWith('Hub-Summaries/') && !p.startsWith('Hub-Summaries/Manual/') && row.hub_stale_since == null) {
                        await db
                            .updateTable('mobius_node' as any)
                            .set({ hub_stale_since: now } as any)
                            .where('node_id' as any, '=', row.node_id)
                            .execute();
                    }
                }
                break;
            }
            case 'folder_stats':
                break; // deferred
        }
    }

    dispose(): void {
        this.scheduler.dispose();
        for (const ref of this.eventRefs) this.app.vault.offref(ref);
        this.eventRefs = [];
        CascadeWorker.instance = null;
    }
}
