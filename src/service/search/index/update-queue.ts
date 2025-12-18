import type { App, TAbstractFile, EventRef } from 'obsidian';
import { TFile } from 'obsidian';
import type { SearchClient } from '@/service/search/SearchClient';
import { DocumentLoaderManager } from '@/service/search/document/DocumentLoaderManager';

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
	private readonly refs: EventRef[] = [];

	constructor(
		private readonly app: App,
		private readonly client: SearchClient,
		private readonly debounceMs: number = 800
	) {
		this.loaderManager = new DocumentLoaderManager(app);
	}

	/**
	 * Start listening to vault changes.
	 */
	start(): void {
		this.refs.push(
			this.app.vault.on('modify', (file: TAbstractFile) => this.enqueueUpsert(file)),
			this.app.vault.on('create', (file: TAbstractFile) => this.enqueueUpsert(file)),
			this.app.vault.on('delete', (file: TAbstractFile) => this.enqueueDelete(file)),
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.enqueueRename(file, oldPath)),
		);
	}

	/**
	 * Stop listening and flush pending updates.
	 */
	async dispose(): Promise<void> {
		for (const ref of this.refs) {
			this.app.vault.offref(ref);
		}
		this.refs.length = 0;
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

		try {
			if (deletePaths.length) {
				await this.client.deleteDocuments(deletePaths);
			}
			if (upsertPaths.length) {
				const docs = [];
				for (const p of upsertPaths) {
					const doc = await this.loaderManager.readByPath(p);
					if (doc) docs.push(doc);
				}
				if (docs.length) {
					await this.client.indexDocuments(docs);
				}
			}
		} catch (e) {
			console.error('Search update flush failed:', e);
		}
	}
}


