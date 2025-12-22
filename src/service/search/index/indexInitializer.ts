import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { SearchSettings } from '@/app/settings/types';
import type { IndexableDocument } from '@/service/search/index/document/types';
import { DocumentLoaderManager } from '@/service/search/index/document/DocumentLoaderManager';
import { chunkDocument } from '@/service/search/index/chunk/chunking';
import { documentToIndexable, chunkToIndexable } from '@/service/search/index/document/types';
import type { Document as CoreDocument, DocumentType } from '@/core/document/types';
import { IndexProgressTracker } from '../support/progress-tracker';
import { IndexService } from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { generateContentHash } from '@/core/utils/markdown-utils';
import { INDEX_CHECK_BATCH_SIZE } from '@/core/constant';

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
						'Search index not found. Enable "Auto Index" in settings or use command "Index Search" to build it.',
						6000,
					);
				}
				return;
			}

			// Index exists - check for changes
			const changes = await this.checkForIndexChanges();

			if (changes.needsIndexing) {
				if (this.settings.autoIndex) {
					// Auto index enabled: show notification and index automatically
					const fileCount = changes.newFiles + changes.modifiedFiles;
					new Notice(
						`Updating search index: ${fileCount} file${fileCount === 1 ? '' : 's'} changed.`,
						3000,
					);
					await this.performIncrementalIndexing();
				} else {
					// Auto index disabled: notify user to manually trigger indexing
					const fileCount = changes.newFiles + changes.modifiedFiles;
					new Notice(
						`Search index has ${fileCount} file${fileCount === 1 ? '' : 's'} to update. Use command "Index Search" to update. Enable "Auto Index" in settings to update automatically.`,
						8000,
					);
				}
			}
		} catch (e) {
			console.error('Index check/update failed:', e);
		}
	}

	/**
	 * Perform full indexing of all documents with progress tracking.
	 */
	async performFullIndexing(showNotification: boolean): Promise<void> {
		const progressTracker = showNotification ? new IndexProgressTracker(this.app) : null;
		const startTime = Date.now();
		const startMemory = this.getMemoryUsage();

		try {
			if (progressTracker) {
				progressTracker.showStart();
			}

			const loaderManager = DocumentLoaderManager.getInstance();
			let totalIndexed = 0;
			let lastProgressUpdate = Date.now();
			const PROGRESS_UPDATE_INTERVAL = 3000; // Update every 3 seconds

			for await (const batch of loaderManager.loadAllDocuments({ batchSize: 25 })) {
				// Documents are already filtered by settings in loadAllDocuments
				const filteredBatch = batch.filter((doc) => loaderManager.shouldIndexDocument(doc));

				if (filteredBatch.length > 0) {
					// Apply chunking strategy if enabled (converts Document -> IndexableDocument)
					// todo chunk only should be called from indexdocunent method
					const documentsToIndex = await this.applyChunkingStrategy(filteredBatch);
					documentsToIndex.forEach(doc => {
						IndexService.getInstance().indexDocument(doc);
					});
					totalIndexed += documentsToIndex.length;

					// Update progress periodically
					if (progressTracker && Date.now() - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
						progressTracker.updateProgress(totalIndexed);
						lastProgressUpdate = Date.now();
					}
				}
			}

			if (progressTracker) {
				const endTime = Date.now();
				const endMemory = this.getMemoryUsage();
				const duration = endTime - startTime;
				const memoryDelta = endMemory - startMemory;
				const storageSize = await this.getStorageSize();

				progressTracker.showComplete({
					totalIndexed,
					duration,
					memoryDelta,
					storageSize,
				});
			}

		} catch (e) {
			console.error('Full indexing failed:', e);
			if (progressTracker) {
				progressTracker.showError(e instanceof Error ? e.message : 'Unknown error');
			}
		}
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
	async performIncrementalIndexing(): Promise<void> {
		try {
			// Scan for files that need indexing
			// todo 可以接收一个参数的 如果之前获取过不用重复获取一次 例如 checkAndUpdateIndex 的调用
			const { filesToIndex: filesToIndexPaths } = await this.scanForIndexChanges();

			// Check for deleted files (in index but not in vault)
			// Get all indexed paths and scan vault to find deleted files
			const allIndexedPaths = await IndexService.getInstance().getIndexedPaths();
			const indexedPathSet = new Set(allIndexedPaths.map(item => item.path));

			// Scan vault to get all current files
			const loaderManager = DocumentLoaderManager.getInstance();
			const vaultFiles = new Set<string>();
			for await (const docBatch of loaderManager.scanDocuments()) {
				for (const docItem of docBatch) {
					if (loaderManager.shouldIndexDocument({ type: docItem.type } as CoreDocument)) {
						vaultFiles.add(docItem.path);
					}
				}
			}

			// todo del 也不该去一开始load all 而是需要在这里batch sql check
			const deletedPaths: string[] = [];
			for (const indexedPath of indexedPathSet) {
				if (!vaultFiles.has(indexedPath)) {
					deletedPaths.push(indexedPath);
				}
			}
			// Remove deleted files from index
			if (deletedPaths.length > 0) {
				await IndexService.getInstance().deleteDocuments(deletedPaths);
			}

			// todo manual rewrite these code
			// Load documents for indexing (only load content when actually needed)
			const filesToIndex: CoreDocument[] = [];
			for (const path of filesToIndexPaths) {
				const doc = await loaderManager.readByPath(path);
				if (doc) {
					filesToIndex.push(doc);
				}
			}
			// Index new/modified files in batches
			if (filesToIndex.length > 0) {
				const progressTracker = new IndexProgressTracker(this.app, filesToIndex.length);
				const startTime = Date.now();
				const startMemory = this.getMemoryUsage();

				progressTracker.showStart('Incremental indexing');

				const batchSize = 25;
				let indexedCount = 0;
				let lastProgressUpdate = Date.now();
				const PROGRESS_UPDATE_INTERVAL = 2000; // Update every 2 seconds for incremental

				for (let i = 0; i < filesToIndex.length; i += batchSize) {
					const batch = filesToIndex.slice(i, i + batchSize);
					// Apply chunking strategy if enabled (converts Document -> IndexableDocument)
					const documentsToIndex = await this.applyChunkingStrategy(batch);
					documentsToIndex.forEach(doc => {
						IndexService.getInstance().indexDocument(doc);
					});
					indexedCount += documentsToIndex.length;

					// Update progress periodically
					if (Date.now() - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
						progressTracker.updateProgress(indexedCount);
						lastProgressUpdate = Date.now();
					}
				}

				const endTime = Date.now();
				const endMemory = this.getMemoryUsage();
				const duration = endTime - startTime;
				const memoryDelta = endMemory - startMemory;
				const storageSize = await this.getStorageSize();

				progressTracker.showComplete({
					totalIndexed: indexedCount,
					duration,
					memoryDelta,
					storageSize,
				});
			}

		} catch (e) {
			console.error('Incremental indexing failed:', e);
		}
	}

	/**
	 * Check for files that need indexing (new or modified).
	 * Returns summary of changes without actually indexing.
	 */
	private async checkForIndexChanges(): Promise<{ needsIndexing: boolean; newFiles: number; modifiedFiles: number }> {
		try {
			const { filesToIndex } = await this.scanForIndexChanges();

			if (filesToIndex.length === 0) {
				return { needsIndexing: false, newFiles: 0, modifiedFiles: 0 };
			}

			// Batch check indexed status to distinguish new vs modified files
			const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
			const indexedMap = await docMetaRepo.batchCheckIndexed(filesToIndex);

			let newFiles = 0;
			let modifiedFiles = 0;
			for (const path of filesToIndex) {
				const indexedInfo = indexedMap.get(path);
				if (indexedInfo === undefined) {
					newFiles++;
				} else {
					modifiedFiles++;
				}
			}

			return {
				needsIndexing: true,
				newFiles,
				modifiedFiles,
			};
		} catch (e) {
			console.error('Failed to check for index changes:', e);
			return { needsIndexing: false, newFiles: 0, modifiedFiles: 0 };
		}
	}

	/**
	 * Scan vault for files that need indexing.
	 * 
	 * This method uses lightweight scanning (without loading content) and batch checking
	 * to efficiently identify files that need indexing. It avoids loading all indexed paths
	 * upfront by checking indexed status in batches as vault files are scanned.
	 * 
	 * Why doc_meta represents indexed status:
	 * - Documents are only written to doc_meta table after successful indexing completion
	 *   (see IndexService.indexDocumentGroup)
	 * - When documents are deleted, they are removed from doc_meta (see IndexService.deleteDocuments)
	 * - Therefore, presence in doc_meta reliably indicates a document is indexed
	 * 
	 * @returns filesToIndex: list of document paths that need indexing
	 */
	private async scanForIndexChanges(): Promise<{
		filesToIndex: string[];
	}> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const filesToIndex: string[] = [];

		// Scan vault files without loading content
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: INDEX_CHECK_BATCH_SIZE })) {
			const batchFilesToIndex = await this.checkAndCollectModifiedFiles(
				docBatch.filter(docItem =>
					loaderManager.shouldIndexDocument({ type: docItem.type } as CoreDocument)
				)
			);
			filesToIndex.push(...batchFilesToIndex);
		}

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

		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const pathsToCheck = currentBatch.map(d => d.path);
		const indexedMap = await docMetaRepo.batchCheckIndexed(pathsToCheck);
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
	 * Loads documents, calculates content hashes, and checks if they already exist in doc_meta.
	 * Only files without matching content hash are returned.
	 * 
	 * @param maybeIndexArray - Array of document metadata that need content hash checking
	 * @returns Array of file paths that need indexing
	 */
	private async processMaybeIndexBatch(
		maybeIndexArray: Array<{ path: string; mtime: number; type: DocumentType }>,
	): Promise<string[]> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const filesToIndex: string[] = [];

		// Load documents and calculate content hashes
		const pathToHash = new Map<string, string>();
		const filesWithoutHash: string[] = [];

		for (const docItem of maybeIndexArray) {
			const doc = await loaderManager.readByPath(docItem.path);
			if (doc && doc.contentHash) {
				pathToHash.set(docItem.path, doc.contentHash);
			} else {
				// If document couldn't be loaded or has no hash, add to index anyway
				// (will be indexed and hash will be calculated during indexing)
				filesWithoutHash.push(docItem.path);
			}
		}

		// Batch check if content hashes exist in doc_meta
		if (pathToHash.size > 0) {
			const contentHashes = Array.from(pathToHash.values());
			const existingHashes = await docMetaRepo.batchGetByContentHashes(contentHashes);

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

	/**
	 * Apply chunking strategy to documents if enabled.
	 * Converts core Documents to IndexableDocuments, applying chunking if needed.
	 */
	private async applyChunkingStrategy(docs: CoreDocument[]): Promise<IndexableDocument[]> {
		const indexableDocs: IndexableDocument[] = [];

		for (const doc of docs) {
			// Check if chunking is enabled and document is large enough
			const shouldChunk = this.settings.chunking?.enabled &&
				doc.sourceFileInfo.content.length > (this.settings.chunking.minDocumentSizeForChunking ?? 1500);

			if (shouldChunk) {
				// Chunk the document using LangChain strategy
				const chunks = await chunkDocument(doc, {
					maxChunkSize: this.settings.chunking.maxChunkSize,
					chunkOverlap: this.settings.chunking.chunkOverlap,
					minDocumentSize: this.settings.chunking.minDocumentSizeForChunking,
					strategy: 'recursive',
				});

				// Convert chunks to IndexableDocuments
				for (const chunk of chunks) {
					indexableDocs.push(chunkToIndexable(chunk, doc));
				}
			} else {
				// Convert document to IndexableDocument without chunking
				indexableDocs.push(documentToIndexable(doc));
			}
		}

		return indexableDocs;
	}

	/**
	 * Get current memory usage in MB (best effort, may not be available in all environments).
	 */
	private getMemoryUsage(): number {
		try {
			// Browser environment (Chrome/Edge)
			if ((performance as any).memory) {
				return (performance as any).memory.usedJSHeapSize / (1024 * 1024);
			}
			// Node.js environment
			if (typeof process !== 'undefined' && process.memoryUsage) {
				return process.memoryUsage().heapUsed / (1024 * 1024);
			}
		} catch {
			// Ignore errors
		}
		return 0;
	}

	/**
	 * Get storage size of index files in bytes.
	 */
	private async getStorageSize(): Promise<number> {
		try {
			const files = [
				'search.sqlite',
			];

			let totalSize = 0;
			for (const filename of files) {
				try {
					// Build full path using the same logic as VaultFileStore
					const baseDir = this.storageFolder?.trim() || (this.app.vault.adapter as any)?.basePath;
					const fullPath = `${baseDir}/${filename}`;

					// Try to get file from vault
					const file = this.app.vault.getAbstractFileByPath(fullPath);
					if (file && 'stat' in file) {
						totalSize += (file as any).stat.size || 0;
					} else {
						// Fallback: try to read file and get its size
						try {
							const content = await this.app.vault.adapter.read(fullPath);
							totalSize += new Blob([content]).size;
						} catch {
							// File may not exist yet or is binary
							try {
								const binary = await (this.app.vault.adapter as any).readBinary(fullPath);
								totalSize += binary.byteLength || 0;
							} catch {
								// File doesn't exist
							}
						}
					}
				} catch {
					// File may not exist yet
				}
			}
			return totalSize;
		} catch {
			return 0;
		}
	}
}

