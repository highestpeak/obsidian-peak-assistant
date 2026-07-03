import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { SearchSettings } from '@/core/config/settingsTypes';

/**
 * App-composed callback that materializes one hub doc. When registered via
 * {@link HubRegenService.init}, the service delegates to this instead of the
 * legacy `HubDocService.regenerateSingleHub` warning stub. See
 * docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 8.
 */
export type HubRegenerateFn = (hubNodeId: string, hubPath: string) => Promise<void>;

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
 *   3. LLM fills the skeleton
 *   4. Re-indexes with embeddings (hub_maintenance options)
 *   5. Replaces hub_constituent rows
 *   6. Clears hub_stale_since on mobius_node
 */
export class HubRegenService {
    private static _instance: HubRegenService | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private processing = false;
    private getSearchSettings: (() => SearchSettings) | null = null;
    private regenerateFn: HubRegenerateFn | null = null;

    static getInstance(): HubRegenService {
        if (!HubRegenService._instance) {
            HubRegenService._instance = new HubRegenService();
        }
        return HubRegenService._instance;
    }

    /**
     * Must be called before scheduleRegenSweep or processQueueNow.
     * The optional `regenerateFn` is composed at the app layer and delegates
     * to `HubMaterializationAgent`. When omitted, the service falls back to
     * the legacy `HubDocService.regenerateSingleHub` stub (no LLM).
     */
    init(getSearchSettings: () => SearchSettings, regenerateFn?: HubRegenerateFn): void {
        this.getSearchSettings = getSearchSettings;
        // Only overwrite when a fn is provided; boot ordering is:
        //   1) IndexInitializer.init(getSettings)  ← no fn (legacy caller)
        //   2) composeHubGenerationRuntime(getSettings, fn) ← installs fn
        // We do not want (1) or a later settings refresh to clobber the fn from (2).
        if (regenerateFn !== undefined) {
            this.regenerateFn = regenerateFn;
        }
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
        if (this.regenerateFn) {
            await this.regenerateFn(hubNodeId, hubPath);
            return;
        }
        // Fallback: legacy stub warning. App layer should always inject a real fn.
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
