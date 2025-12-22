import type { App, TAbstractFile, EventRef } from 'obsidian';
import { TFile } from 'obsidian';
import { DocumentLoaderManager } from '@/service/search/index/document/DocumentLoaderManager';
import { documentToIndexable } from '@/service/search/index/document/types';
import type { IndexableDocument } from '@/service/search/_deprecated/worker/types-rpc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { DocMetaRepo } from '@/core/storage/sqlite/repositories/DocMetaRepo';
import type { DocStatisticsRepo } from '@/core/storage/sqlite/repositories/DocStatisticsRepo';
import { IndexService } from '@/service/search/index/indexService';
import { generateUuidWithoutHyphens } from '@/service/chat/utils';

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
	private docMetaRepo: DocMetaRepo | null = null;
	private docStatisticsRepo: DocStatisticsRepo | null = null;
	constructor(
		private readonly app: App,
		private readonly debounceMs: number = 800
	) {
		this.loaderManager = DocumentLoaderManager.getInstance();
		this.initializeRepos();
	}

	/**
	 * Initialize repositories from global database connection.
	 */
	private initializeRepos(): void {
		if (!sqliteStoreManager.isInitialized()) {
			// Store not initialized yet, will retry when needed
			return;
		}
		try {
			this.docMetaRepo = sqliteStoreManager.getDocMetaRepo();
			this.docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();
		} catch (e) {
			// Store not initialized yet, will retry when needed
			console.debug('Failed to initialize repos, will retry later:', e);
		}
	}

	/**
	 * Start listening to vault changes and file open events.
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
		
		// Try to initialize repos if not already initialized
		if (!this.docStatisticsRepo || !this.docMetaRepo) {
			this.initializeRepos();
		}
		
		if (!this.docStatisticsRepo || !this.docMetaRepo) {
			// SearchClient not initialized yet, skip
			return;
		}
		
		try {
			// Get doc_id from path
			const meta = await this.docMetaRepo.getByPath(file.path);
			if (!meta) {
				// Document not indexed yet, skip
				return;
			}
			const tsNum = Date.now();
			await this.docStatisticsRepo.recordOpen(meta.id, tsNum);
		} catch (e) {
			// Silently ignore errors (file might not be indexed yet)
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

			// todo 可以并行执行好像
			// todo 对 upsert 拆分一个方法
			if (deletePaths.length) {
				await IndexService.getInstance().deleteDocuments(deletePaths);
			}
			if (upsertPaths.length) {
				const indexableDocs: IndexableDocument[] = [];
				for (const p of upsertPaths) {
					const doc = await this.loaderManager.readByPath(p);
					if (doc) {
						const indexable = documentToIndexable(doc);
						// Convert to IndexableDocument format expected by SearchClient
						// Ensure path matches the file path (not document id)
						const rpcIndexable: IndexableDocument = {
							path: p,
							title: indexable.title,
							type: indexable.type as string, // DocumentType is compatible with string
							content: indexable.content,
							mtime: indexable.mtime,
							embedding: indexable.embedding,
							chunkId: indexable.chunkId,
							chunkIndex: indexable.chunkIndex,
							totalChunks: indexable.totalChunks,
						};
						indexableDocs.push(rpcIndexable);
					}
				}
				if (indexableDocs.length) {
					indexableDocs.forEach(doc => {
						IndexService.getInstance().indexDocument(doc);
					});
				}
			}

		} catch (e) {
			console.error('Search update flush failed:', e);
		} finally {
			console.log('flush end processing. flush id: ', uuid, 'duration: ', Date.now() - startTime, 'ms');
		}
	}
}


