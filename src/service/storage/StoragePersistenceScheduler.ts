import type { BytesStore, JsonStore } from '@/service/storage/types';
import type { ExportStorageResponse, StorageType } from '@/service/search/worker/types-rpc';

/**
 * Persistence scheduler for worker-owned storage (sqlite, orama, graph).
 *
 * Storage Strategy:
 * - Worker cannot write to disk, so we export data and persist on main thread.
 * - Export can be heavy; avoid frequent saves to prevent frame drops.
 * - Only saves in two scenarios:
 *   1. Plugin unload: Always saves all dirty data when plugin closes
 *   2. Major changes + user idle: After significant operations (e.g., index completion),
 *      schedules save when user is idle (no activity for idleTimeoutMs)
 *
 * Idle Detection:
 * - Uses setTimeout to wait for inactivity period (default 5 seconds)
 * - Then uses requestIdleCallback (if available) to execute save during browser idle time
 * - requestIdleCallback ensures save happens when browser has free time, avoiding frame drops
 * - Falls back to setTimeout(0) if requestIdleCallback is not available
 *
 * Supports BytesStore (binary files) and JsonStore (JSON files).
 * JSON stores receive JSON strings directly from worker.
 */
export class StoragePersistenceScheduler {
	private inflight: Promise<void> | null = null;
	private readonly dirty = new Set<StorageType>();
	private rerunAfterInflight: boolean = false;
	private idleTimer: number | null = null;
	private readonly idleTimeoutMs: number;

	constructor(
		private readonly exporter: (types: StorageType[]) => Promise<ExportStorageResponse>,
		private readonly stores: {
			sqlite?: BytesStore;
			orama?: JsonStore;
			graph?: JsonStore;
		},
		/**
		 * Timeout in milliseconds to wait for user inactivity before saving.
		 * After this period of no activity, save will be scheduled during browser idle time.
		 * Default: 5000ms (5 seconds)
		 */
		idleTimeoutMs: number = 5000,
	) {
		this.idleTimeoutMs = idleTimeoutMs;
	}

	/**
	 * Mark storage types as dirty.
	 * 
	 * This method only marks data as needing to be saved, but does NOT trigger actual save.
	 * Actual persistence happens in two scenarios:
	 * 1. Plugin unload: All dirty data is saved when plugin closes
	 * 2. Explicit flush: Call flushWhenIdle() after major changes to save when user is idle
	 * 
	 * This design avoids frequent disk writes that could cause frame drops during normal operation.
	 */
	schedule(types: StorageType[]): void {
		for (const t of types) this.dirty.add(t);
		// Don't auto-save here to avoid frequent disk writes
		// Save will happen on unload or explicit flush
	}

	/**
	 * Schedule a flush when user is idle (after inactivity period).
	 * 
	 * Idle detection mechanism:
	 * 1. Waits for idleTimeoutMs (default 5 seconds) of no activity
	 * 2. Then uses requestIdleCallback to execute save during browser's idle time
	 * 3. requestIdleCallback ensures save happens when browser has free CPU cycles,
	 *    preventing frame drops and UI blocking
	 * 
	 * Use this for major changes like:
	 * - Index completion (full or incremental)
	 * - Large batch operations
	 * - Any operation that significantly modifies storage
	 * 
	 * If called multiple times, resets the timer (only the last call matters).
	 */
	flushWhenIdle(): void {
		// Clear existing timer if one is already scheduled
		if (this.idleTimer) {
			window.clearTimeout(this.idleTimer);
		}
		
		// Schedule flush after inactivity period
		// After idleTimeoutMs, the save will be executed during browser idle time
		this.idleTimer = window.setTimeout(() => {
			this.idleTimer = null;
			// Use requestIdleCallback to save during browser idle time
			this.runWhenIdle(() => void this.flush());
		}, this.idleTimeoutMs);
	}

	/**
	 * Immediately flush all dirty storage to disk.
	 * 
	 * This method:
	 * - Exports data from worker (can be heavy operation)
	 * - Saves to disk (SQLite binary, Orama/Graph JSON)
	 * - Handles concurrent flush requests (queues subsequent calls)
	 * 
	 * Called automatically:
	 * - On plugin unload (always saves)
	 * - After idle timeout when flushWhenIdle() was called
	 */
	async flush(): Promise<void> {
		// If a flush is already in progress, queue this one
		if (this.inflight) {
			this.rerunAfterInflight = true;
			return await this.inflight;
		}
		
		const types = Array.from(this.dirty);
		this.dirty.clear();
		if (!types.length) return; // Nothing to save

		this.inflight = (async () => {
			try {
				// Export data from worker (heavy operation)
				const storage = await this.exporter(types);
				
				// Save to disk in parallel
				await Promise.all([
					storage.sqlite && this.stores.sqlite ? this.stores.sqlite.save(storage.sqlite) : Promise.resolve(),
					storage.orama && this.stores.orama ? this.saveJsonStore(this.stores.orama, storage.orama) : Promise.resolve(),
					storage.graph && this.stores.graph ? this.saveJsonStore(this.stores.graph, storage.graph) : Promise.resolve(),
				]);
			} finally {
				this.inflight = null;
				// If new mutations arrived during inflight, flush again
				if (this.rerunAfterInflight) {
					this.rerunAfterInflight = false;
					await this.flush();
				}
			}
		})();
		return await this.inflight;
	}

	/**
	 * Save JSON store with compact formatting (no extra whitespace).
	 */
	private async saveJsonStore(store: JsonStore, json: string): Promise<void> {
		// Parse and stringify to ensure compact format (no extra whitespace)
		const parsed = JSON.parse(json);
		const compactJson = JSON.stringify(parsed);
		await store.saveJson(compactJson);
	}

	/**
	 * Execute function during browser idle time to avoid blocking UI.
	 * 
	 * Idle detection mechanism:
	 * 1. Uses requestIdleCallback if available (modern browsers)
	 *    - Browser calls callback when it has free CPU cycles
	 *    - timeout option ensures callback runs even if browser is busy
	 * 2. Falls back to setTimeout(0) if requestIdleCallback is not available
	 *    - Executes in next event loop tick (less optimal but still non-blocking)
	 * 
	 * This ensures heavy operations (like disk writes) don't block the main thread
	 * and cause frame drops or UI freezing.
	 */
	private runWhenIdle(fn: () => void): void {
		// Try to use requestIdleCallback (available in modern browsers)
		// This API allows us to run code when the browser has free time
		const ric = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
		if (ric) {
			// timeout: 1200ms ensures callback runs even if browser is busy
			ric(fn, { timeout: 1200 });
			return;
		}
		// Fallback: execute in next event loop tick (less optimal but still non-blocking)
		window.setTimeout(fn, 0);
	}

	/**
	 * Clean up timers and resources.
	 * Should be called when plugin unloads.
	 */
	dispose(): void {
		if (this.idleTimer) {
			window.clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
}


