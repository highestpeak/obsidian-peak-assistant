import type { App, EventRef, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { SearchSettings } from '@/app/settings/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexService, getIndexTenantForPath } from '@/service/search/index/indexService';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { EventBus } from '@/core/eventBus';
import type MyPlugin from 'main';

/**
 * Debounced update queue for incremental indexing.
 *
 * This lives on the main thread:
 * - listens to vault events
 * - reads file contents via Obsidian API
 * - batches updates and forwards plain docs to the Search Worker
 */
export class SearchUpdateListener {
	private readonly loaderManager: DocumentLoaderManager;
	private readonly upsertPaths = new Set<string>();
	private readonly deletePaths = new Set<string>();
	/** Pending vault renames: process before deletes/upserts so stable doc id is preserved. */
	private readonly pendingRenames: Array<{ oldPath: string; newPath: string }> = [];
	private timer: number | null = null;
	private settingsUnsubscribe: (() => void) | null = null;
	/** Set on dispose so late timer callback or flush skips work and does not touch DB after unload. */
	private disposed = false;
	/** In-flight flush promise; disposed waits for it so we close DB after flush settles and avoid OperationalError. */
	private lastFlushPromise: Promise<void> | null = null;
	/** Refs for vault/workspace listeners; used by restartWithNewInterval to offref before re-registering. */
	private vaultRefs: EventRef[] = [];
	private workspaceRefs: EventRef[] = [];
	constructor(
		private readonly app: App,
		private readonly plugin: MyPlugin,
		private readonly settings: SearchSettings,
		// five seconds debounce to avoid too many updates
		private readonly debounceMs: number = 5000
	) {
		this.loaderManager = DocumentLoaderManager.getInstance();
	}

	/**
	 * Start listening to vault changes, file open events, and settings updates.
	 * Uses plugin.registerEvent so listeners are auto-removed on plugin unload.
	 */
	start(): void {
		const rModify = this.app.vault.on('modify', (file: TAbstractFile) => this.enqueueUpsert(file));
		const rCreate = this.app.vault.on('create', (file: TAbstractFile) => this.enqueueUpsert(file));
		const rDelete = this.app.vault.on('delete', (file: TAbstractFile) => this.enqueueDelete(file));
		const rRename = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.enqueueRename(file, oldPath));
		this.vaultRefs.push(rModify, rCreate, rDelete, rRename);
		this.plugin.registerEvent(rModify);
		this.plugin.registerEvent(rCreate);
		this.plugin.registerEvent(rDelete);
		this.plugin.registerEvent(rRename);

		const rFileOpen = this.app.workspace.on('file-open', (file: TFile | null) => {
			void this.handleFileOpen(file);
		});
		this.workspaceRefs.push(rFileOpen);
		this.plugin.registerEvent(rFileOpen);

		// Listen for settings updates to restart if indexRefreshInterval changed
		const eventBus = EventBus.getInstance(this.app);
		this.settingsUnsubscribe = eventBus.on('peak:settings-updated', () => {
			if (this.debounceMs !== this.plugin.settings.search.indexRefreshInterval) {
				console.log('Index refresh interval changed, restarting search update listener');
				this.restartWithNewInterval();
			}
		});
	}

	/**
	 * Stop listening, wait for in-flight flush to settle (then close DB safely), then clear pending.
	 * Await this before closing SQLite so no flush rejects with OperationalError and retains bundle.
	 */
	async dispose(): Promise<void> {
		this.disposed = true;
		for (const ref of this.vaultRefs) this.app.vault.offref(ref);
		for (const ref of this.workspaceRefs) this.app.workspace.offref(ref);
		this.vaultRefs.length = 0;
		this.workspaceRefs.length = 0;

		if (this.settingsUnsubscribe) {
			this.settingsUnsubscribe();
			this.settingsUnsubscribe = null;
		}

		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.upsertPaths.clear();
		this.deletePaths.clear();
		this.pendingRenames.length = 0;

		// Wait for in-flight flush to finish so we never close DB while it runs (avoids OperationalError retention)
		if (this.lastFlushPromise) {
			await this.lastFlushPromise;
			this.lastFlushPromise = null;
		}
	}

	private enqueueUpsert(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		// Check if we have a loader for this file type
		if (!this.loaderManager.getLoaderForFile(file)) return;
		this.upsertPaths.add(file.path);
		this.schedule();
	}

	private enqueueDelete(file: TAbstractFile): void {
		const path = (file as any)?.path as string | undefined;
		if (!path) return;
		this.deletePaths.add(path);
		// If a file is deleted, remove any pending upsert.
		this.upsertPaths.delete(path);
		this.schedule();
	}

	private enqueueRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile)) return;
		if (!this.loaderManager.getLoaderForFile(file)) return;
		if (oldPath) {
			this.pendingRenames.push({ oldPath, newPath: file.path });
			this.deletePaths.delete(oldPath);
		}
		this.upsertPaths.delete(oldPath);
		this.enqueueUpsert(file);
	}

	/**
	 * Handle file open event to record access time.
	 */
	private async handleFileOpen(file: TFile | null): Promise<void> {
		if (!file || !(file instanceof TFile)) return;
		if (this.disposed) return;
		if (!sqliteStoreManager.isInitialized()) {
			// Store not initialized yet, skip
			console.warn('sqliteStoreManager not initialized, skipping file open:', file.path);
			return;
		}

		try {
			const tenant = getIndexTenantForPath(file.path);
			const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

			// Get doc_id from path
			const meta = await indexedDocumentRepo.getByPath(file.path);
			if (!meta) {
				// Document not indexed yet, skip
				return;
			}
			const ts = Date.now();
			await mobiusNodeRepo.recordOpen(meta.id, ts);
		} catch (e) {
			// Silently ignore errors (file might not be indexed yet or store not initialized)
			console.debug('Failed to record file open:', file.path, e);
		}
	}

	private schedule(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			if (this.disposed) return;
			void this.flush();
		}, this.debounceMs);
	}

	private async flush(): Promise<void> {
		if (this.disposed) return;
		if (!sqliteStoreManager.isInitialized()) return;
		const renameBatch = this.pendingRenames.splice(0, this.pendingRenames.length);
		const deletePaths = Array.from(this.deletePaths);
		const upsertPaths = Array.from(this.upsertPaths);
		this.deletePaths.clear();
		this.upsertPaths.clear();

		const uuid = generateUuidWithoutHyphens();
		const startTime = Date.now();
		try {
			console.log('flush start processing. flush id: ', uuid);

			const work = (async () => {
				for (const { oldPath, newPath } of renameBatch) {
					try {
						await IndexService.getInstance().renameDocumentPath(oldPath, newPath);
					} catch (e) {
						console.warn('[SearchUpdateListener] renameDocumentPath failed:', oldPath, newPath, e);
					}
				}
				await Promise.all([
					deletePaths.length > 0
						? IndexService.getInstance().deleteDocuments(deletePaths)
						: Promise.resolve(),
					upsertPaths.length > 0
						? this.indexDocuments(upsertPaths)
						: Promise.resolve(),
				]);
			})()
				.then(() => {
					console.log(
						`[SearchUpdateListener] Flush completed: renamed ${renameBatch.length}, deleted ${deletePaths.length} files, indexed ${upsertPaths.length} files`,
					);
				})
				.catch((e) => {
					console.error('Search update operations failed:', e);
				})
				.finally(() => {
					this.lastFlushPromise = null;
					console.log('flush end processing. flush id: ', uuid, 'duration: ', Date.now() - startTime, 'ms');
				});
			this.lastFlushPromise = work;
		} catch (e) {
			console.error('Search update flush failed:', e);
		}
	}

	/**
	 * Index multiple documents by their paths.
	 */
	private async indexDocuments(paths: string[]): Promise<void> {
		for (const p of paths) {
			await IndexService.getInstance().indexDocument(p, this.settings);
		}
	}

	/**
	 * Restart the listener with new interval from current settings.
	 * This method is called when indexRefreshInterval setting changes.
	 */
	private restartWithNewInterval(): void {
		// Dispose current listeners and timers
		for (const ref of this.vaultRefs) {
			this.app.vault.offref(ref);
		}
		for (const ref of this.workspaceRefs) {
			this.app.workspace.offref(ref);
		}
		this.vaultRefs.length = 0;
		this.workspaceRefs.length = 0;

		if (this.settingsUnsubscribe) {
			this.settingsUnsubscribe();
			this.settingsUnsubscribe = null;
		}

		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}

		// Clear pending operations
		this.upsertPaths.clear();
		this.deletePaths.clear();
		this.pendingRenames.length = 0;

		// Update debounceMs with new value
		(this as any).debounceMs = this.plugin.settings.search.indexRefreshInterval;

		// Restart with new settings
		this.start();
	}
}


