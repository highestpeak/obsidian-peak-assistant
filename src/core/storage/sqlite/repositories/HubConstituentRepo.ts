import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

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
	trigger_paths: string; // JSON array
	priority: number;
	status: string;
	last_attempt: number | null;
	fail_count: number;
	error_message: string | null;
}

/**
 * Repository for hub_constituent and hub_regen_queue tables (vault.sqlite).
 *
 * Tracks which member paths belong to each hub node and manages a
 * regeneration queue for stale hubs.
 *
 * Both tables are outside the Kysely type schema, so table names are cast
 * through `as any`.
 */
export class HubConstituentRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ── Constituent membership ──────────────────────────────────────────

	/**
	 * Replace all constituent rows for a hub.  Deletes existing rows then
	 * batch-inserts new ones in chunks of 100.
	 */
	async replaceForHub(hubNodeId: string, rows: HubConstituentRow[]): Promise<void> {
		await (this.db as any)
			.deleteFrom('hub_constituent')
			.where('hub_node_id', '=', hubNodeId)
			.execute();

		for (let i = 0; i < rows.length; i += 100) {
			const chunk = rows.slice(i, i + 100);
			await (this.db as any)
				.insertInto('hub_constituent')
				.values(chunk)
				.execute();
		}
	}

	/**
	 * Delete all constituent rows.
	 */
	async clearAll(): Promise<void> {
		await (this.db as any)
			.deleteFrom('hub_constituent')
			.execute();
	}

	/**
	 * Find all distinct hubs that contain any of the given member paths.
	 */
	async findHubsForMembers(memberPaths: string[]): Promise<Pick<HubConstituentRow, 'hub_node_id' | 'hub_path'>[]> {
		if (memberPaths.length === 0) return [];
		return (this.db as any)
			.selectFrom('hub_constituent')
			.select(['hub_node_id', 'hub_path'])
			.where('member_path', 'in', memberPaths)
			.groupBy(['hub_node_id', 'hub_path'])
			.execute();
	}

	/**
	 * Get all constituent rows for a hub.
	 */
	async getMembersForHub(hubNodeId: string): Promise<HubConstituentRow[]> {
		return (this.db as any)
			.selectFrom('hub_constituent')
			.selectAll()
			.where('hub_node_id', '=', hubNodeId)
			.execute();
	}

	// ── Regeneration queue ──────────────────────────────────────────────

	/**
	 * Enqueue a hub for regeneration.  If the hub is already queued, merge
	 * trigger_paths (JSON array union) and take the higher priority.
	 * If the existing row has status='failed', reset to 'pending'.
	 */
	async enqueue(hubNodeId: string, hubPath: string, triggerPaths: string[], priority: number = 0): Promise<void> {
		const now = Date.now();

		// Check for existing row first
		const existing: HubRegenQueueRow[] = await (this.db as any)
			.selectFrom('hub_regen_queue')
			.selectAll()
			.where('hub_node_id', '=', hubNodeId)
			.execute();

		if (existing.length > 0) {
			const row = existing[0];
			const existingPaths: string[] = JSON.parse(row.trigger_paths);
			const merged = [...new Set([...existingPaths, ...triggerPaths])];
			const newStatus = row.status === 'failed' ? 'pending' : row.status;
			await (this.db as any)
				.updateTable('hub_regen_queue')
				.set({
					trigger_paths: JSON.stringify(merged),
					priority: Math.max(row.priority, priority),
					status: newStatus,
				})
				.where('hub_node_id', '=', hubNodeId)
				.execute();
		} else {
			await (this.db as any)
				.insertInto('hub_regen_queue')
				.values({
					hub_node_id: hubNodeId,
					hub_path: hubPath,
					queued_at: now,
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

	/**
	 * Dequeue the highest-priority pending item.  Atomically sets its status
	 * to 'in_progress' and returns it, or `null` if the queue is empty.
	 */
	async dequeuePending(): Promise<HubRegenQueueRow | null> {
		const rows: HubRegenQueueRow[] = await (this.db as any)
			.selectFrom('hub_regen_queue')
			.selectAll()
			.where('status', '=', 'pending')
			.orderBy('priority', 'desc')
			.orderBy('queued_at', 'asc')
			.limit(1)
			.execute();

		if (rows.length === 0) return null;

		const row = rows[0];
		await (this.db as any)
			.updateTable('hub_regen_queue')
			.set({ status: 'in_progress', last_attempt: Date.now() })
			.where('hub_node_id', '=', row.hub_node_id)
			.where('status', '=', 'pending')
			.execute();

		return { ...row, status: 'in_progress', last_attempt: Date.now() };
	}

	/**
	 * Remove a completed hub from the queue.
	 */
	async markCompleted(hubNodeId: string): Promise<void> {
		await (this.db as any)
			.deleteFrom('hub_regen_queue')
			.where('hub_node_id', '=', hubNodeId)
			.execute();
	}

	/**
	 * Mark a hub regeneration as failed, incrementing fail_count.
	 */
	async markFailed(hubNodeId: string, errorMessage: string): Promise<void> {
		await (this.db as any)
			.updateTable('hub_regen_queue')
			.set({
				status: 'failed',
				fail_count: sql`fail_count + 1`,
				error_message: errorMessage,
				last_attempt: Date.now(),
			})
			.where('hub_node_id', '=', hubNodeId)
			.execute();
	}

	/**
	 * Reset retryable failures back to pending.
	 */
	async resetRetryableFailures(maxRetries: number = 3): Promise<void> {
		await (this.db as any)
			.updateTable('hub_regen_queue')
			.set({ status: 'pending' })
			.where('status', '=', 'failed')
			.where('fail_count', '<', maxRetries)
			.execute();
	}

	/**
	 * Count of pending items in the queue.
	 */
	async pendingCount(): Promise<number> {
		const result = await sql<{ cnt: number }>`
			SELECT COUNT(*) as cnt FROM hub_regen_queue WHERE status = 'pending'
		`.execute(this.db);
		return result.rows[0]?.cnt ?? 0;
	}

	/**
	 * Clear all items from the regeneration queue.
	 */
	async clearQueue(): Promise<void> {
		await (this.db as any)
			.deleteFrom('hub_regen_queue')
			.execute();
	}
}
