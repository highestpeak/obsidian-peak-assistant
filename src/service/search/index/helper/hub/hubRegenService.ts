import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { SearchSettings } from '@/app/settings/types';
import { IndexService } from '@/service/search/index/indexService';
import { discoverFromSeed, materializeHubDocFromCandidate } from './hubDocServices';

const HUB_REGEN_DEBOUNCE_MS = 30_000;
const HUB_REGEN_BATCH_SIZE = 10;
const HUB_REGEN_MAX_RETRIES = 3;

/**
 * Singleton service that processes the hub regeneration queue in the background.
 * When hub docs are marked stale by {@link HubStalenessDetector}, they get queued
 * in `hub_regen_queue`. This service dequeues and regenerates them.
 */
export class HubRegenService {
	private static instance: HubRegenService | null = null;

	private getSearchSettings: (() => SearchSettings) | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private processing = false;

	private constructor() {}

	static getInstance(): HubRegenService {
		if (!HubRegenService.instance) {
			HubRegenService.instance = new HubRegenService();
		}
		return HubRegenService.instance;
	}

	/** Called at startup to provide the settings accessor. */
	init(getSearchSettings: () => SearchSettings): void {
		this.getSearchSettings = getSearchSettings;
	}

	/**
	 * Debounced trigger — schedules a regeneration sweep after {@link HUB_REGEN_DEBOUNCE_MS}.
	 * Called after staleness detection to batch multiple rapid changes into one sweep.
	 */
	scheduleRegenSweep(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			void this.processQueue();
		}, HUB_REGEN_DEBOUNCE_MS);
	}

	/** Immediate processing — used at startup or via explicit command. */
	async processQueueNow(): Promise<void> {
		// Cancel any pending debounced sweep since we're processing now
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		await this.processQueue();
	}

	/**
	 * Dequeue up to {@link HUB_REGEN_BATCH_SIZE} items and regenerate each.
	 * Guarded against concurrent execution.
	 */
	private async processQueue(): Promise<void> {
		if (this.processing) return;
		if (!sqliteStoreManager.isInitialized()) return;

		this.processing = true;
		try {
			const repo = sqliteStoreManager.getHubConstituentRepo();

			// Reset retryable failures back to pending before processing
			await repo.resetRetryableFailures(HUB_REGEN_MAX_RETRIES);

			let processed = 0;
			while (processed < HUB_REGEN_BATCH_SIZE) {
				const item = await repo.dequeuePending();
				if (!item) break;

				try {
					await this.regenerateHub(item.hub_node_id, item.hub_path);
					await repo.markCompleted(item.hub_node_id);

					// Clear hub_stale_since on mobius_node
					const db = sqliteStoreManager.getSearchContext();
					await db
						.updateTable('mobius_node')
						.set({ hub_stale_since: null } as any)
						.where('node_id', '=', item.hub_node_id)
						.execute();

					console.log(`[HubRegenService] Regenerated hub ${item.hub_node_id} (${item.hub_path})`);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					console.warn(`[HubRegenService] Failed to regenerate hub ${item.hub_node_id}: ${msg}`);
					await repo.markFailed(item.hub_node_id, msg);
				}

				processed++;
			}

			if (processed > 0) {
				console.log(`[HubRegenService] Processed ${processed} hub(s) from regen queue`);
			}
		} finally {
			this.processing = false;
		}
	}

	/**
	 * Re-run materialization for a single hub.
	 *
	 * 1. Look up the hub node in `mobius_node` to get its path
	 * 2. Call `discoverFromSeed` to re-discover hub candidates near the hub
	 * 3. Find the matching candidate by `nodeId`
	 * 4. Call `materializeHubDocFromCandidate` to rebuild + re-index + re-persist constituents
	 */
	private async regenerateHub(hubNodeId: string, hubPath: string): Promise<void> {
		if (!this.getSearchSettings) {
			throw new Error('HubRegenService not initialized — call init() first');
		}

		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const node = await nodeRepo.getByNodeId(hubNodeId);
		if (!node) {
			// Node no longer exists — skip silently
			return;
		}

		const seedPath = node.path;
		const candidates = await discoverFromSeed(seedPath, { maxCandidates: 5 });

		const candidate = candidates.find((c) => c.nodeId === hubNodeId);
		if (!candidate) {
			// Hub is no longer discoverable — may have been obsoleted; skip silently
			return;
		}

		const hubNodeIdSet = new Set(candidates.map((c) => c.nodeId));
		const folderPath = hubPath.substring(0, hubPath.lastIndexOf('/'));
		const searchSettings = this.getSearchSettings();
		const indexService = IndexService.getInstance();

		await materializeHubDocFromCandidate(candidate, {
			hubPath: folderPath,
			hubNodeIdSet,
			searchSettings,
			indexService,
		});
	}

	/** Cleanup timers and state. */
	dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.getSearchSettings = null;
		this.processing = false;
		HubRegenService.instance = null;
	}
}
