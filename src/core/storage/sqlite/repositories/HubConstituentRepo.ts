import type { Kysely } from 'kysely';
import type { Database } from '../ddl';

export interface HubConstituentRow {
    hub_node_id: string;
    hub_path: string;
    member_path: string;
    member_node_id: string | null;
    source_kind: 'cluster_member' | 'local_graph' | 'folder_child' | 'manual' | 'reference_edge';
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

    /**
     * S3-compat: Replace hub members from reference-edge node IDs.
     * Resolves member paths from mobius_node (requires node IDs to have path set).
     */
    async replaceHubMembers(
        hubNodeId: string,
        hubPath: string,
        members: Array<{ nodeId: string; path: string | null }>,
    ): Promise<void> {
        const now = Date.now();
        const rows: Omit<HubConstituentRow, 'hub_node_id'>[] = members
            .filter((m) => m.path != null)
            .map((m) => ({
                hub_path: hubPath,
                member_path: m.path!,
                member_node_id: m.nodeId,
                source_kind: 'reference_edge' as const,
                added_at: now,
            }));
        await this.replaceForHub(hubNodeId, rows);
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

    /**
     * S3-compat: Returns hub node ids that contain the given doc (by node ID) as a constituent.
     * Used by CascadeWorker hub_invalidate: "when doc A changes, which hubs are affected?"
     */
    async getHubsForMemberDoc(memberNodeId: string): Promise<string[]> {
        const rows = await this.db
            .selectFrom('hub_constituent')
            .select('hub_node_id')
            .where('member_node_id', '=', memberNodeId)
            .distinct()
            .execute();
        return rows.map((r) => r.hub_node_id);
    }

    /** Get all constituent rows for a hub. */
    async getMembersForHub(hubNodeId: string): Promise<HubConstituentRow[]> {
        return this.db
            .selectFrom('hub_constituent')
            .selectAll()
            .where('hub_node_id', '=', hubNodeId)
            .execute() as Promise<HubConstituentRow[]>;
    }

    /** Remove all constituent rows for a hub (when hub doc is deleted). */
    async deleteByHub(hubNodeId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('hub_node_id', '=', hubNodeId).execute();
    }

    /** Remove all constituent rows where this doc is a member (by node ID; when constituent doc is deleted). */
    async deleteByMember(memberNodeId: string): Promise<void> {
        await this.db.deleteFrom('hub_constituent').where('member_node_id', '=', memberNodeId).execute();
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
