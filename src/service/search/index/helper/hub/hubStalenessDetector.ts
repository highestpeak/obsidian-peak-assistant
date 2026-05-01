import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Detects which hub docs are stale after constituent notes change.
 * Called from `SearchUpdateListener.flush()` after indexing upserts.
 */
export class HubStalenessDetector {
	/**
	 * Given paths that were just indexed, find affected hub docs
	 * and mark them stale + enqueue for regeneration.
	 */
	async detectAndMarkStale(upsertedPaths: string[]): Promise<{ staleHubCount: number }> {
		if (!upsertedPaths.length) return { staleHubCount: 0 };
		if (!sqliteStoreManager.isInitialized()) return { staleHubCount: 0 };

		try {
			const constituentRepo = sqliteStoreManager.getHubConstituentRepo();
			const affectedHubs = await constituentRepo.findHubsForMembers(upsertedPaths);
			if (!affectedHubs.length) return { staleHubCount: 0 };

			const now = Date.now();
			const db = sqliteStoreManager.getSearchContext();

			for (const hub of affectedHubs) {
				// Mark hub_stale_since on mobius_node (only set if not already stale).
				// hub_stale_since is added via ALTER TABLE and is NOT in the Kysely type schema,
				// so we use `as any` to bypass type checks.
				await db
					.updateTable('mobius_node')
					.set({ hub_stale_since: now } as any)
					.where('node_id', '=', hub.hub_node_id)
					.where('hub_stale_since' as any, 'is', null)
					.execute();

				// Enqueue for regeneration with priority based on trigger count
				const priority = Math.min(upsertedPaths.length, 20);
				await constituentRepo.enqueue(hub.hub_node_id, hub.hub_path, upsertedPaths, priority);
			}

			console.log(
				`[HubStalenessDetector] Marked ${affectedHubs.length} hub(s) stale from ${upsertedPaths.length} changed path(s)`,
			);
			return { staleHubCount: affectedHubs.length };
		} catch (e) {
			console.warn('[HubStalenessDetector] Failed to detect staleness:', e);
			return { staleHubCount: 0 };
		}
	}
}
