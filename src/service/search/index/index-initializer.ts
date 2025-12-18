import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { SearchClient } from '@/service/search/SearchClient';
import type { SearchSettings } from '@/app/settings/types';
import type { IndexableDocument } from '@/service/search/document/types';
import type { StoragePersistenceScheduler } from '@/service/storage/StoragePersistenceScheduler';
import { DocumentLoaderManager } from '@/service/search/document/DocumentLoaderManager';
import { IndexProgressTracker } from './progress-tracker';

/**
 * Utility functions for index initialization.
 */
export class IndexInitializer {
	constructor(
		private readonly app: App,
		private readonly searchClient: SearchClient,
		private readonly settings: SearchSettings,
		private readonly storageFolder: string,
		private readonly storagePersistence?: StoragePersistenceScheduler,
	) {}

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
			const indexStatus = await this.searchClient.getIndexStatus();
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
	 * Check for files that need indexing (new or modified).
	 * Returns summary of changes without actually indexing.
	 */
	async checkForIndexChanges(): Promise<{ needsIndexing: boolean; newFiles: number; modifiedFiles: number }> {
		try {
			const { indexedMap, filesToIndex } = await this.scanForIndexChanges(false);
			
			let newFiles = 0;
			let modifiedFiles = 0;
			for (const doc of filesToIndex) {
				const indexedMtime = indexedMap.get(doc.path);
				if (indexedMtime === undefined) {
					newFiles++;
				} else {
					modifiedFiles++;
				}
			}

			return {
				needsIndexing: filesToIndex.length > 0,
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
	 * Returns indexed map and list of documents that need indexing.
	 * 
	 * @param includeDocuments - If true, returns full document objects. If false, only collects paths.
	 */
	private async scanForIndexChanges(includeDocuments: boolean): Promise<{
		indexedMap: Map<string, number>;
		filesToIndex: IndexableDocument[];
		vaultFiles: Set<string>;
	}> {
		// Get all indexed files with their modification times
		const indexedPaths = await this.searchClient.getIndexedPaths();
		const indexedMap = new Map<string, number>();
		for (const item of indexedPaths) {
			indexedMap.set(item.path, item.mtime);
		}

		// Get all files from vault that should be indexed
		const loaderManager = new DocumentLoaderManager(this.app);
		const filesToIndex: IndexableDocument[] = [];
		const vaultFiles = new Set<string>();

		// Single pass: collect files to index and track all vault files
		for await (const batch of loaderManager.loadAllDocuments({ batchSize: 100 })) {
			for (const doc of batch) {
				// Filter by settings: only check enabled document types
				if (!this.shouldIndexDocument(doc)) continue;

				vaultFiles.add(doc.path);

				const indexedMtime = indexedMap.get(doc.path);
				// File is new or modified (mtime changed)
				if (indexedMtime === undefined || indexedMtime !== doc.mtime) {
					if (includeDocuments) {
						filesToIndex.push(doc);
					} else {
						// For check-only mode, we still need to track which files need indexing
						// but we can use a lightweight approach
						filesToIndex.push(doc); // Still push for counting, but won't be used for actual indexing
					}
				}
			}
		}

		return { indexedMap, filesToIndex, vaultFiles };
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

			const loaderManager = new DocumentLoaderManager(this.app);
			let totalIndexed = 0;
			let lastProgressUpdate = Date.now();
			const PROGRESS_UPDATE_INTERVAL = 3000; // Update every 3 seconds

			for await (const batch of loaderManager.loadAllDocuments({ batchSize: 25 })) {
				// Filter by settings: only index enabled document types
				const filteredBatch = this.filterDocumentsBySettings(batch);

				if (filteredBatch.length > 0) {
					await this.searchClient.indexDocuments(filteredBatch);
					totalIndexed += filteredBatch.length;

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

			// Schedule save when user is idle (major change: full index completion)
			if (this.storagePersistence) {
				this.storagePersistence.flushWhenIdle();
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
			const { indexedMap, filesToIndex, vaultFiles } = await this.scanForIndexChanges(true);

			// Check for deleted files (in index but not in vault)
			const deletedPaths: string[] = [];
			for (const [path] of indexedMap) {
				if (!vaultFiles.has(path)) {
					deletedPaths.push(path);
				}
			}

			// Remove deleted files from index
			if (deletedPaths.length > 0) {
				await this.searchClient.deleteDocuments(deletedPaths);
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
					await this.searchClient.indexDocuments(batch);
					indexedCount += batch.length;

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

			// Schedule save when user is idle (major change: incremental index completion)
			if (this.storagePersistence && filesToIndex.length > 0) {
				this.storagePersistence.flushWhenIdle();
			}
		} catch (e) {
			console.error('Incremental indexing failed:', e);
		}
	}

	/**
	 * Filter documents based on settings.
	 */
	private filterDocumentsBySettings(docs: IndexableDocument[]): IndexableDocument[] {
		return docs.filter((doc) => this.shouldIndexDocument(doc));
	}

	/**
	 * Check if a document should be indexed based on settings.
	 */
	private shouldIndexDocument(doc: IndexableDocument): boolean {
		const type = doc.type;
		return (
			(type === 'markdown' && this.settings.includeDocumentTypes.markdown) ||
			(type === 'pdf' && this.settings.includeDocumentTypes.pdf) ||
			(type === 'image' && this.settings.includeDocumentTypes.image)
		);
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
				'search-metadata.sqlite',
				'search-orama.json',
				'search-graph.json',
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

