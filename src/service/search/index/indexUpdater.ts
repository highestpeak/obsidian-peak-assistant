import type { App, TAbstractFile, EventRef } from 'obsidian';
import { TFile } from 'obsidian';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { SearchSettings } from '@/app/settings/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { IndexService } from '@/service/search/index/indexService';
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
	private timer: number | null = null;
	private readonly vaultRefs: EventRef[] = [];
	private readonly workspaceRefs: EventRef[] = [];
	private settingsUnsubscribe: (() => void) | null = null;
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
	 */
	start(): void {
		this.vaultRefs.push(
			this.app.vault.on('modify', (file: TAbstractFile) => this.enqueueUpsert(file)),
			this.app.vault.on('create', (file: TAbstractFile) => this.enqueueUpsert(file)),
			this.app.vault.on('delete', (file: TAbstractFile) => this.enqueueDelete(file)),
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.enqueueRename(file, oldPath)),
		);
		this.workspaceRefs.push(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				// Record file open asynchronously (best-effort, don't block)
				void this.handleFileOpen(file);
			}),
		);

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
	 * Stop listening and flush pending updates.
	 */
	async dispose(): Promise<void> {
		for (const ref of this.vaultRefs) {
			this.app.vault.offref(ref);
		}
		for (const ref of this.workspaceRefs) {
			this.app.workspace.offref(ref);
		}
		this.vaultRefs.length = 0;
		this.workspaceRefs.length = 0;

		// Remove settings update listener
		if (this.settingsUnsubscribe) {
			this.settingsUnsubscribe();
			this.settingsUnsubscribe = null;
		}

		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		await this.flush();
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
		if (oldPath) this.deletePaths.add(oldPath);
		this.upsertPaths.delete(oldPath);
		this.enqueueUpsert(file);
	}

	/**
	 * Handle file open event to record access time.
	 */
	private async handleFileOpen(file: TFile | null): Promise<void> {
		if (!file || !(file instanceof TFile)) return;
		
		if (!sqliteStoreManager.isInitialized()) {
			// Store not initialized yet, skip
			console.warn('sqliteStoreManager not initialized, skipping file open:', file.path);
			return;
		}
		
		try {
			const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
			const docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();
			
			// Get doc_id from path
			const meta = await docMetaRepo.getByPath(file.path);
			if (!meta) {
				// Document not indexed yet, skip
				return;
			}
			await docStatisticsRepo.recordOpen(meta.id, Date.now());
		} catch (e) {
			// Silently ignore errors (file might not be indexed yet or store not initialized)
			console.debug('Failed to record file open:', file.path, e);
		}
	}

	private schedule(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, this.debounceMs);
	}

	private async flush(): Promise<void> {
		const deletePaths = Array.from(this.deletePaths);
		const upsertPaths = Array.from(this.upsertPaths);
		this.deletePaths.clear();
		this.upsertPaths.clear();

		const uuid = generateUuidWithoutHyphens();
		const startTime = Date.now();
		try {
			console.log('flush start processing. flush id: ', uuid);

			// Execute delete and upsert operations in parallel
			Promise.all([
				deletePaths.length > 0
					? IndexService.getInstance().deleteDocuments(deletePaths)
					: Promise.resolve(),
				upsertPaths.length > 0
					? this.indexDocuments(upsertPaths)
					: Promise.resolve(),
			]).then(() => {
				console.log(`[SearchUpdateListener] Flush completed: deleted ${deletePaths.length} files, indexed ${upsertPaths.length} files`);
			}).catch((e) => {
				console.error('Search update operations failed:', e);
			});

		} catch (e) {
			console.error('Search update flush failed:', e);
		} finally {
			console.log('flush end processing. flush id: ', uuid, 'duration: ', Date.now() - startTime, 'ms');
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

		// Update debounceMs with new value
		(this as any).debounceMs = this.plugin.settings.search.indexRefreshInterval;

		// Restart with new settings
		this.start();
	}
}


