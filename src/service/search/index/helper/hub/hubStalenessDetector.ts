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
                const priority = Math.min(pathsToCheck.length, 20);
                await constituentRepo.enqueue(hub.hub_node_id, hub.hub_path, pathsToCheck, priority);
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
