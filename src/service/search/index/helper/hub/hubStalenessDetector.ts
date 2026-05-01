import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { HubRegenService } from './hubRegenService';

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

				// Per-hub trigger filtering: intersect upserted paths with this hub's members
				const members = await constituentRepo.getMembersForHub(hub.hub_node_id);
				const memberPaths = new Set(members.map((m) => m.member_path));
				const perHubTriggerPaths = upsertedPaths.filter((p) => memberPaths.has(p));

				// Priority based on per-hub trigger count, not total upserted count
				const priority = Math.min(perHubTriggerPaths.length, 20);
				await constituentRepo.enqueue(hub.hub_node_id, hub.hub_path, perHubTriggerPaths, priority);
			}

			console.log(
				`[HubStalenessDetector] Marked ${affectedHubs.length} hub(s) stale from ${upsertedPaths.length} changed path(s)`,
			);

			// Schedule background regeneration sweep
			HubRegenService.getInstance().scheduleRegenSweep();

			return { staleHubCount: affectedHubs.length };
		} catch (e) {
			console.warn('[HubStalenessDetector] Failed to detect staleness:', e);
			return { staleHubCount: 0 };
		}
	}
}
