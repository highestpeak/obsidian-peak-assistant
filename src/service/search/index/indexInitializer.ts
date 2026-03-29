import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { SearchSettings } from '@/app/settings/types';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { DocumentType } from '@/core/document/types';
import { IndexProgressTracker } from '../support/progress-tracker';
import {
	defaultIndexDocumentOptions,
	IndexService,
	type IndexDocumentReason,
} from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { INDEX_CHECK_BATCH_SIZE, VAULT_DB_FILENAME } from '@/core/constant';
import { formatLlmEnrichmentProgressLine } from '@/service/search/support/llm-progress-format';
import { getFileSize } from '@/core/utils/obsidian-utils';

/**
 * Utility functions for index initialization.
 */
export class IndexInitializer {

	constructor(
		private readonly app: App,
		private readonly settings: SearchSettings,
		private readonly storageFolder: string,
	) {
	}

	/**
	 * When maintenance debt crosses threshold, runs full Mobius maintenance (aggregates + PageRank + semantic edges).
	 */
	private async runMobiusMaintenanceIfDue(): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) return;
		if (!(await IndexService.getInstance().isMobiusMaintenanceRecommended())) return;
		let n = new Notice('Mobius: running graph maintenance…', 0);
		const setMsg = (text: string) => {
			const nn = n as Notice & { setMessage?: (m: string) => void };
			if (typeof nn.setMessage === 'function') nn.setMessage(text);
			else {
				n.hide();
				n = new Notice(text, 0);
			}
		};
		try {
			await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
				onProgress: (ev) => {
					if (ev.phase === 'semantic_related') {
						setMsg(`Mobius: semantic edges · ${ev.tenant} · ${ev.progressTextSuffix ?? ''}`);
						return;
					}
					const phaseLabel =
						ev.phase === 'semantic_pagerank_edges'
							? 'semantic PR edges'
							: ev.phase === 'semantic_pagerank_persist'
								? 'semantic PR persist'
								: ev.phase;
					setMsg(`Mobius: ${ev.tenant} · ${phaseLabel} · ${ev.progressTextSuffix ?? ''}`);
				},
			});
			n.hide();
			new Notice('Mobius graph maintenance completed.', 4000);
		} catch (e) {
			n.hide();
			console.error('[IndexInitializer] Mobius maintenance failed:', e);
			new Notice('Mobius graph maintenance failed. See console.', 5000);
		}
	}

	/**
	 * Check index status and perform incremental indexing for new/modified files.
	 *
	 * This is necessary because:
	 * - Files may be modified outside Obsidian (git sync, external editors, etc.)
	 * - When Obsidian opens, these changes won't be detected by file watchers
	 * - Without incremental indexing, modified files won't be searchable
	 *
	 * Behavior:
	 * - If autoIndex is enabled: automatically index files and show notification
	 * - If autoIndex is disabled: check for changes and notify user to manually trigger indexing
	 */
	async checkAndUpdateIndex(): Promise<void> {
		try {
			const indexStatus = await IndexService.getInstance().getIndexStatus();
			const hasIndex = indexStatus.isReady && indexStatus.indexBuiltAt !== null;

			if (!hasIndex) {
				// No index exists - need initial indexing
				if (this.settings.autoIndex) {
					// Auto index enabled: show notification and index automatically
					new Notice('Building search index...', 3000);
					await this.performFullIndexing(true);
				} else {
					// Auto index disabled: notify user they can enable it or use command
					new Notice(
						'Search index not found. Enable "Auto Index" in settings or use command "Search: fast index documents (FTS)" to build it.',
						6000,
					);
				}
				return;
			}

			// Index exists - check for changes
			new Notice('Scanning for index changes...', 5000);
			const { filesToIndex } = await this.scanForIndexChanges();
			new Notice(`Scanning for index changes completed. files to index: ${filesToIndex.length}`, 3000);

			if (filesToIndex.length > 0) {
				if (this.settings.autoIndex) {
					// Auto index enabled: show notification and index automatically
					const fileCount = filesToIndex.length;
					new Notice(
						`Updating search index: ${fileCount} file${fileCount === 1 ? '' : 's'} changed.`,
						3000,
					);
					await this.performIncrementalIndexing(filesToIndex);
				} else {
					// Auto index disabled: notify user to manually trigger indexing
					const fileCount = filesToIndex.length;
					new Notice(
						`Search index has ${fileCount} file${fileCount === 1 ? '' : 's'} to update. Use command "Search: fast index documents (FTS)" to update. Enable "Auto Index" in settings to update automatically.`,
						8000,
					);
				}
			} else {
				await this.runMobiusMaintenanceIfDue();
			}
		} catch (e) {
			console.error('Index check/update failed:', e);
		}
	}

	/**
	 * Collect all vault paths that loaders consider indexable (respects ignore rules).
	 */
	private async collectAllIndexableFilePaths(): Promise<string[]> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const filesToIndex: string[] = [];
		for await (const batch of loaderManager.scanDocuments()) {
			for (const docMeta of batch) {
				const partialDoc = {
					type: docMeta.type,
					sourceFileInfo: { path: docMeta.path },
				} as any;
				if (loaderManager.shouldIndexDocument(partialDoc)) {
					filesToIndex.push(docMeta.path);
				}
			}
		}
		return filesToIndex;
	}

	/**
	 * Persistent bottom notice with updatable message (Obsidian 1.5+ `setMessage` when available).
	 */
	private openPipelineNotice(initial: string): { setMessage: (text: string) => void; hide: () => void } {
		let n = new Notice(initial, 0);
		const setMessage = (text: string) => {
			const nn = n as Notice & { setMessage?: (m: string) => void };
			if (typeof nn.setMessage === 'function') {
				nn.setMessage(text);
			} else {
				n.hide();
				n = new Notice(text, 0);
			}
		};
		return {
			setMessage,
			hide: () => n.hide(),
		};
	}

	/**
	 * Full pipeline in order: FTS (fast core) → vector embeddings → LLM tags/summaries → Mobius maintenance.
	 * Use when you want deferred enrichment explicitly instead of one-shot `manual_full` per file.
	 */
	async performStagedFullIndexing(showNotification: boolean): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) {
			new Notice('Search index is not ready. Open the vault and wait for the plugin to load.', 6000);
			return;
		}

		console.log('[IndexInitializer] Starting staged full pipeline (FTS → vector → LLM → maintenance)');
		IndexService.resetCancellation();

		const countStartTime = performance.now();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		console.log(
			`[IndexInitializer] Staged pipeline: ${filesToIndex.length} files (counted in ${(performance.now() - countStartTime).toFixed(2)}ms)`,
		);

		const progressTracker = new IndexProgressTracker(this.app, filesToIndex.length);
		let indexedCount = 0;
		try {
			progressTracker.showStart('Peak: Step 1/4 — Full-text (FTS), no embeddings…');

			let lastProgressUpdate = Date.now();
			const PROGRESS_INTERVAL_MS = 2000;

			for (const path of filesToIndex) {
				if (IndexService.isCancelled() || progressTracker.isCancelled()) {
					console.log(`[IndexInitializer] Staged pipeline cancelled at ${path}`);
					progressTracker.dismiss();
					return;
				}
				await IndexService.getInstance().indexDocument(
					path,
					this.settings,
					defaultIndexDocumentOptions('listener_fast'),
				);
				indexedCount++;
				if (Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS) {
					progressTracker.updateProgress(indexedCount);
					lastProgressUpdate = Date.now();
				}
			}
		} catch (e) {
			progressTracker.dismiss();
			console.error('[IndexInitializer] Staged pipeline failed at FTS step:', e);
			new Notice(`Peak: Step 1/4 failed — ${(e as Error).message}`, 8000);
			return;
		}

		const dbFilePath = this.storageFolder
			? `${this.storageFolder.trim().replace(/^\/+/, '').replace(/\/+$/, '')}/${VAULT_DB_FILENAME}`
			: VAULT_DB_FILENAME;
		const storageSize = await getFileSize(this.app, dbFilePath);

		progressTracker.dismiss();
		if (showNotification) {
			const mb = storageSize > 0 ? (storageSize / 1024 / 1024).toFixed(2) : '0';
			new Notice(`Peak: Step 1/4 done — FTS indexed ${indexedCount} file(s). DB ~${mb} MB.`, 5000);
		}

		const pipelineUi = this.openPipelineNotice('Peak: Step 2/4 — Vector embeddings…');
		try {
			await IndexService.runPendingVectorIndexEnrichment(this.settings, {
				onProgress: ({ processed, total, path }) => {
					const short = path.length > 48 ? `${path.slice(0, 45)}…` : path;
					pipelineUi.setMessage(`Peak: Step 2/4 — Vector ${processed}/${total}\n${short}`);
				},
			});
			pipelineUi.setMessage('Peak: Step 3/4 — LLM tags & summaries…');
			await IndexService.runPendingLlmIndexEnrichment(this.settings, {
				onProgress: (ev) => {
					const short = ev.path.length > 48 ? `${ev.path.slice(0, 45)}…` : ev.path;
					pipelineUi.setMessage(
						`Peak: Step 3/4 — LLM ${ev.processed}/${ev.total}\n${formatLlmEnrichmentProgressLine(ev)}\n${short}`,
					);
				},
			});
			pipelineUi.setMessage('Peak: Step 4/4 — Graph maintenance…');
			await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
				onProgress: (ev) => {
					if (ev.phase === 'semantic_related') {
						pipelineUi.setMessage(
							`Peak: Step 4/4 — ${ev.tenant} semantic edges · ${ev.progressTextSuffix ?? ''}`,
						);
						return;
					}
					const phaseLabel =
						ev.phase === 'semantic_pagerank_edges'
							? 'semantic PR edges'
							: ev.phase === 'semantic_pagerank_persist'
								? 'semantic PR persist'
								: ev.phase;
					pipelineUi.setMessage(
						`Peak: Step 4/4 — ${ev.tenant} · ${phaseLabel} · ${ev.progressTextSuffix ?? ''}`,
					);
				},
			});
			pipelineUi.hide();
			if (showNotification) {
				new Notice('Peak: Full pipeline finished (FTS → vector → LLM → maintenance).', 8000);
			}
		} catch (e) {
			pipelineUi.hide();
			console.error('[IndexInitializer] Staged pipeline failed:', e);
			new Notice(`Peak pipeline failed: ${(e as Error).message}`, 8000);
		}
	}

	/**
	 * Perform full indexing of all documents with progress tracking.
	 */
	async performFullIndexing(showNotification: boolean): Promise<void> {
		console.log('[IndexInitializer] Starting full indexing');

		// Reset cancellation flag
		IndexService.resetCancellation();

		const countStartTime = performance.now();
		console.log('[IndexInitializer] Counting total files...');
		const filesToIndex = await this.collectAllIndexableFilePaths();
		console.log(
			`[IndexInitializer] Total files to index: ${filesToIndex.length} (counted in ${(performance.now() - countStartTime).toFixed(2)}ms)`,
		);

		await this.indexNewAndModifiedFiles(filesToIndex);
		await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat']);
	}

	/**
	 * Perform incremental indexing: check for new/modified files and index them.
	 * Shows notification when files are indexed.
	 *
	 * This handles cases where files were modified outside Obsidian:
	 * - Git sync operations
	 * - External text editors
	 * - File system operations
	 * - When Obsidian opens, file watchers won't detect these changes
	 */
	async performIncrementalIndexing(filesToIndexPaths?: string[]): Promise<void> {
		try {
			// Reset cancellation flag
			IndexService.resetCancellation();

			// Scan for files that need indexing (only if not already provided)
			if (!filesToIndexPaths) {
				new Notice('Scanning for index changes...', 5000);
				const scanResult = await this.scanForIndexChanges();
				filesToIndexPaths = scanResult.filesToIndex;
				new Notice(`Scanning for index changes completed. files to index: ${filesToIndexPaths.length}`, 3000);
			}

			const pathsToIndex = filesToIndexPaths;
			// Execute indexing and deletion check in parallel
			await Promise.all([
				this.checkAndDeleteRemovedFiles(),
				this.indexNewAndModifiedFiles(pathsToIndex),
			]);
			console.log(`[IndexInitializer] Incremental indexing completed: ${pathsToIndex.length} files processed`);
			await this.runMobiusMaintenanceIfDue();
		} catch (e) {
			console.error('Incremental indexing failed:', e);
		}
	}

	/**
	 * Full vault pass: core FTS + chunks only (`listener_fast`). Defers vectors and LLM via pending flags.
	 * Does not run graph maintenance; use the palette command "Search: run global maintenance" or the full pipeline.
	 */
	async performFastCoreFullIndexing(_showNotification: boolean): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) {
			new Notice('Search index is not ready. Open the vault and wait for the plugin to load.', 6000);
			return;
		}
		console.log('[IndexInitializer] Starting fast core (FTS) full indexing');
		IndexService.resetCancellation();
		const countStartTime = performance.now();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		console.log(
			`[IndexInitializer] Fast core full: ${filesToIndex.length} files (counted in ${(performance.now() - countStartTime).toFixed(2)}ms)`,
		);
		await this.indexDocumentPaths(filesToIndex, 'Peak: Fast index (FTS)…', 'listener_fast');
	}

	/**
	 * Incremental fast core indexing: same semantics as {@link performIncrementalIndexing} but `listener_fast` only and no automatic maintenance.
	 */
	async performFastCoreIncrementalIndexing(filesToIndexPaths?: string[]): Promise<void> {
		try {
			IndexService.resetCancellation();
			if (!filesToIndexPaths) {
				new Notice('Scanning for index changes...', 5000);
				const scanResult = await this.scanForIndexChanges();
				filesToIndexPaths = scanResult.filesToIndex;
				new Notice(`Scanning for index changes completed. files to index: ${filesToIndexPaths.length}`, 3000);
			}
			const pathsToIndex = filesToIndexPaths;
			await Promise.all([
				this.checkAndDeleteRemovedFiles(),
				this.indexDocumentPaths(pathsToIndex, 'Peak: Fast index (FTS)…', 'listener_fast'),
			]);
			console.log(`[IndexInitializer] Fast core incremental completed: ${pathsToIndex.length} files processed`);
		} catch (e) {
			console.error('Fast core incremental indexing failed:', e);
		}
	}

	/**
	 * Check for deleted files and remove them from index.
	 * Uses batch checking to avoid loading all indexed paths at once.
	 * 
	 * Performance characteristics for vault file collection:
	 * - ~100 files: ~10-50ms (Obsidian API overhead dominates)
	 * - ~1,000 files: ~50-200ms (linear scaling with file count)
	 * - ~10,000 files: ~200ms-1s (linear scaling, Obsidian API is efficient)
	 * - ~100,000 files: ~1-5s (linear scaling, may have minor overhead)
	 * 
	 * The collection process is O(n) where n is the number of markdown files.
	 * Main operations:
	 * 1. app.vault.getMarkdownFiles() - Obsidian internal file tree traversal (O(n))
	 * 2. Batch iteration - minimal overhead, just object creation
	 * 3. Set.add() - O(1) average case per file
	 * 
	 * The bottleneck is typically Obsidian's getMarkdownFiles() API call,
	 * which internally scans the vault file tree.
	 */
	private async checkAndDeleteRemovedFiles(): Promise<void> {
		console.debug('[IndexInitializer] Checking and deleting removed files');
		const loaderManager = DocumentLoaderManager.getInstance();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();

		// First, scan vault to collect all current file paths
		// Performance: O(n) where n = number of markdown files
		// Expected time: ~0.1-0.5ms per file (includes Obsidian API overhead)
		// 
		// Performance benchmarks (estimated):
		// - ~100 files: ~10-50ms
		// - ~1,000 files: ~50-200ms
		// - ~10,000 files: ~200ms-1s
		// - ~100,000 files: ~1-5s
		const vaultFiles = new Set<string>();
		const collectionStartTime = performance.now();

		for await (const docBatch of loaderManager.scanDocuments({ batchSize: INDEX_CHECK_BATCH_SIZE })) {
			for (const docItem of docBatch) {
				const partialDoc = {
					type: docItem.type,
					sourceFileInfo: { path: docItem.path }
				} as any;
				if (loaderManager.shouldIndexDocument(partialDoc)) {
					vaultFiles.add(docItem.path);
				}
			}
		}

		const collectionTime = performance.now() - collectionStartTime;
		if (collectionTime > 100) {
			// Log if collection takes more than 100ms
			console.log(`[IndexInitializer] Vault file collection: ${vaultFiles.size} files in ${collectionTime.toFixed(2)}ms (${(collectionTime / vaultFiles.size).toFixed(3)}ms per file)`);
		}

		// Batch check indexed paths against vault files
		const deletedPaths: string[] = [];
		let offset = 0;
		const batchSize = INDEX_CHECK_BATCH_SIZE;

		while (true) {
			const indexedBatch = await indexedDocumentRepo.getIndexedPathsBatch(offset, batchSize);
			if (indexedBatch.length === 0) {
				break;
			}

			for (const indexedItem of indexedBatch) {
				if (!vaultFiles.has(indexedItem.path)) {
					deletedPaths.push(indexedItem.path);
				}
			}

			offset += batchSize;
		}

		// Remove deleted files from index
		if (deletedPaths.length > 0) {
			await IndexService.getInstance().deleteDocuments(deletedPaths);
		}
		console.log(`[IndexInitializer] Deleted ${deletedPaths.length} files from index`);
	}

	/**
	 * Index paths with a fixed {@link IndexDocumentReason} preset (progress UI + completion stats).
	 */
	private async indexDocumentPaths(
		filesToIndexPaths: string[],
		progressStartLabel: string,
		reason: IndexDocumentReason,
	): Promise<void> {
		if (filesToIndexPaths.length === 0) {
			return;
		}

		const progressTracker = new IndexProgressTracker(this.app, filesToIndexPaths.length);
		progressTracker.showStart(progressStartLabel);

		let indexedCount = 0;
		let lastProgressUpdate = Date.now();
		const PROGRESS_INTERVAL_MS = 2000;
		const opts = defaultIndexDocumentOptions(reason);

		console.debug(`[IndexInitializer] Indexing started: ${filesToIndexPaths.length} files (${reason})`);
		for (const path of filesToIndexPaths) {
			if (IndexService.isCancelled() || progressTracker?.isCancelled()) {
				console.log(`[IndexInitializer] Indexing cancelled at ${path}`);
				break;
			}

			await IndexService.getInstance().indexDocument(path, this.settings, opts);
			indexedCount += 1;

			if (Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS) {
				progressTracker.updateProgress(indexedCount);
				lastProgressUpdate = Date.now();
			}
		}

		const dbFilePath = this.storageFolder
			? `${this.storageFolder.trim().replace(/^\/+/, '').replace(/\/+$/, '')}/${VAULT_DB_FILENAME}`
			: VAULT_DB_FILENAME;
		const storageSize = await getFileSize(this.app, dbFilePath);

		progressTracker.showComplete({
			totalIndexed: indexedCount,
			storageSize,
		});
	}

	/**
	 * Index new and modified files (`manual_full`: FTS + vectors + LLM in one pass).
	 */
	private async indexNewAndModifiedFiles(filesToIndexPaths: string[]): Promise<void> {
		await this.indexDocumentPaths(filesToIndexPaths, 'Indexing', 'manual_full');
	}

	/**
	 * Scan vault for files that need indexing.
	 * 
	 * This method uses lightweight scanning (without loading content) and batch checking
	 * to efficiently identify files that need indexing. It avoids loading all indexed paths
	 * upfront by checking indexed status in batches as vault files are scanned.
	 * 
	 * Indexed status is determined by an indexed document row on `mobius_node` (queried via IndexedDocumentRepo):
	 * - Written when indexing completes (see IndexService.indexDocument).
	 * - Removed when documents are deleted from the index (see IndexService.deleteDocuments).
	 * 
	 * @returns filesToIndex: list of document paths that need indexing
	 */
	private async scanForIndexChanges(): Promise<{
		filesToIndex: string[];
	}> {
		console.debug('[IndexInitializer] Scanning for index changes');
		const loaderManager = DocumentLoaderManager.getInstance();
		const filesToIndex: string[] = [];

		// Scan vault files without loading content
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: INDEX_CHECK_BATCH_SIZE })) {
			const batchFilesToIndex = await this.checkAndCollectModifiedFiles(
				docBatch.filter(docItem => {
					const partialDoc = {
						type: docItem.type,
						sourceFileInfo: { path: docItem.path }
					} as any;
					return loaderManager.shouldIndexDocument(partialDoc);
				})
			);
			filesToIndex.push(...batchFilesToIndex);
		}

		console.debug('[IndexInitializer] Scanning for index changes completed. files to index:', filesToIndex.length);
		return { filesToIndex };
	}

	/**
	 * Check current batch of files against indexed status and collect modified files.
	 * Files that are new or have modified mtime are checked for content hash.
	 * 
	 * @param currentBatch - Current batch of document metadata to check
	 * @returns Array of file paths that need indexing
	 */
	private async checkAndCollectModifiedFiles(
		currentBatch: Array<{ path: string; mtime: number; type: DocumentType }>,
	): Promise<string[]> {
		if (currentBatch.length === 0) return [];

		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const pathsToCheck = currentBatch.map(d => d.path);
		const indexedMap = await indexedDocumentRepo.batchCheckIndexed(pathsToCheck);
		const maybeIndexArray: Array<{ path: string; mtime: number; type: DocumentType }> = [];

		for (const docItem of currentBatch) {
			const indexedInfo = indexedMap.get(docItem.path);
			// File is new or modified (mtime changed) - add to maybeIndexArray for content hash check
			if (indexedInfo === undefined || indexedInfo.mtime !== docItem.mtime) {
				maybeIndexArray.push(docItem);
			}
		}

		// Process maybeIndexArray immediately if it has no items
		if (maybeIndexArray.length <= 0) {
			return [];
		}
		return await this.processMaybeIndexBatch(maybeIndexArray);

	}

	/**
	 * Process batch of files that need content hash checking.
	 * Loads documents, calculates content hashes, and checks if a matching hash exists among indexed documents (Mobius).
	 * Only files without matching content hash are returned.
	 * 
	 * @param maybeIndexArray - Array of document metadata that need content hash checking
	 * @returns Array of file paths that need indexing
	 */
	private async processMaybeIndexBatch(
		maybeIndexArray: Array<{ path: string; mtime: number; type: DocumentType }>,
	): Promise<string[]> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const filesToIndex: string[] = [];

		// Load documents and calculate content hashes
		const pathToHash = new Map<string, string>();
		const filesWithoutHash: string[] = [];

		for (const docItem of maybeIndexArray) {
			const doc = await loaderManager.readByPath(docItem.path, false, {
				includeLlmTags: false,
				includeLlmSummary: false,
			});
			if (doc && doc.contentHash) {
				pathToHash.set(docItem.path, doc.contentHash);
			} else {
				// If document couldn't be loaded or has no hash, add to index anyway
				// (will be indexed and hash will be calculated during indexing)
				filesWithoutHash.push(docItem.path);
			}
		}

		// Batch check if content hashes exist for any indexed document (Mobius-backed IndexedDocumentRepo)
		if (pathToHash.size > 0) {
			const contentHashes = Array.from(pathToHash.values());
			const existingHashes = await indexedDocumentRepo.batchGetByContentHashes(contentHashes);

			// Only add files whose content hash does not exist
			for (const [path, contentHash] of pathToHash.entries()) {
				if (!existingHashes.has(contentHash)) {
					filesToIndex.push(path);
				}
			}
		}

		// Add files without hash (need to be indexed)
		filesToIndex.push(...filesWithoutHash);

		return filesToIndex;
	}



}

