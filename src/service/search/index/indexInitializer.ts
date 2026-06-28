import type { AppHandle as App } from '@/core/ports/AppHandle';
// T11R Phase 2: type-only obsidian import removed; AppHandle covers the
// duck-typed `app.vault.adapter` / `app.metadataCache` access points.
import type { SearchSettings } from '@/core/config/settingsTypes';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { DocumentType } from '@/core/document/types';
import { IndexProgressTracker } from '../support/progress-tracker';
import {
	getDefaultProgressReporter,
	type ProgressReporterPort,
} from '@/service/ports/ProgressReporterPort';
import {
	defaultIndexDocumentOptions,
	IndexService,
	type IndexDocumentOptions,
	type IndexDocumentReason,
} from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { INDEX_CHECK_BATCH_SIZE, VAULT_DB_FILENAME } from '@/core/constant';
import { formatLlmEnrichmentProgressLine } from '@/service/search/support/llm-progress-format';
// T11R Phase 2: inline file-size lookup via the vault adapter (duck-typed)
// so this module no longer imports `getFileSize` from the relocated
// `obsidian-utils` helper.
async function readFileSize(app: { vault: { adapter: { stat?: (p: string) => Promise<{ size?: number } | null> } } }, filePath: string): Promise<number> {
	try {
		const stat = await app.vault.adapter.stat?.(filePath);
		return stat?.size ?? 0;
	} catch {
		return 0;
	}
}
import type { IndexLevel } from './types';
import { defaultIndexDocumentOptionsForLevel } from './types';

export type IndexErrorAction = 'continue' | 'retry' | 'cancel';
export type IndexErrorHandler = (error: {
	step: string;
	failedCount: number;
	error: Error;
}) => Promise<IndexErrorAction>;

const PHASE_LABELS: Record<string, string> = {
	semantic_pagerank_edges: 'semantic PR edges',
	semantic_pagerank_persist: 'semantic PR persist',
};

function maintenanceProgressMsg(prefix: string, ev: { phase: string; tenant: string; progressTextSuffix?: string }): string {
	if (ev.phase === 'semantic_related') return `${prefix}: semantic edges · ${ev.tenant} · ${ev.progressTextSuffix ?? ''}`;
	return `${prefix}: ${ev.tenant} · ${PHASE_LABELS[ev.phase] ?? ev.phase} · ${ev.progressTextSuffix ?? ''}`;
}

export class IndexInitializer {
	private readonly reporter: ProgressReporterPort;

	constructor(
		private readonly app: App,
		private readonly settings: SearchSettings,
		private readonly storageFolder: string,
		reporter?: ProgressReporterPort,
	) {
		this.reporter = reporter ?? getDefaultProgressReporter();
	}

	private async runMobiusMaintenanceIfDue(): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) return;
		if (!(await IndexService.getInstance().isMobiusMaintenanceRecommended())) return;
		const ui = this.reporter.show('Mobius: running graph maintenance…', 0);
		try {
			await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
				onProgress: (ev) => ui.setMessage(maintenanceProgressMsg('Mobius', ev)),
			});
			ui.hide();
			this.reporter.show('Mobius graph maintenance completed.', 4000);
		} catch (e) {
			ui.hide();
			console.error('[IndexInitializer] Mobius maintenance failed:', e);
			this.reporter.show('Mobius graph maintenance failed. See console.', 5000);
		}
	}

	/** Check index status and perform incremental indexing for new/modified files. */
	async checkAndUpdateIndex(): Promise<void> {
		try {
			const indexStatus = await IndexService.getInstance().getIndexStatus();
			const hasIndex = indexStatus.isReady && indexStatus.indexBuiltAt !== null;

			if (!hasIndex) {
				// No index exists - need initial indexing
				if (this.settings.autoIndex) {
					// Auto index enabled: show notification and index automatically
					this.reporter.show('Building search index...', 3000);
					await this.performFullIndexing(true);
				} else {
					// Auto index disabled: notify user they can enable it or run a manual build
					// from Settings → Advanced → Maintenance → Index.
					this.reporter.show(
						'Search index not found. Enable "Auto Index" in settings, or run "Update index" from Settings → Advanced → Maintenance.',
						6000,
					);
				}
				return;
			}

			// Index exists - check for changes
			this.reporter.show('Scanning for index changes...', 5000);
			const { filesToIndex } = await this.scanForIndexChanges();
			this.reporter.show(`Scanning for index changes completed. files to index: ${filesToIndex.length}`, 3000);

			if (filesToIndex.length > 0) {
				if (this.settings.autoIndex) {
					// Auto index enabled: show notification and index automatically
					const fileCount = filesToIndex.length;
					this.reporter.show(
						`Updating search index: ${fileCount} file${fileCount === 1 ? '' : 's'} changed.`,
						3000,
					);
					await this.performIncrementalIndexing(filesToIndex);
				} else {
					// Auto index disabled: notify user to manually trigger indexing
					const fileCount = filesToIndex.length;
					this.reporter.show(
						`Search index has ${fileCount} file${fileCount === 1 ? '' : 's'} to update. Run "Update index" from Settings → Advanced → Maintenance, or enable "Auto Index" in settings.`,
						8000,
					);
				}
			} else {
				await this.runMobiusMaintenanceIfDue();
			}
		} catch (e) {
			console.error('Index check/update failed:', e);
		}

		// S6: Init hub regen service and drain any stale queue from previous session
		try {
			const { HubRegenService } = await import('./helper/hub/hubRegenService');
			HubRegenService.getInstance().init(() => this.settings);
			if (sqliteStoreManager.isInitialized()) {
				const pendingCount = await sqliteStoreManager.getHubConstituentRepo().pendingCount();
				if (pendingCount > 0) {
					console.log(`[IndexInitializer] ${pendingCount} stale hub(s) queued — processing in background`);
					void HubRegenService.getInstance().processQueueNow();
				}
			}
		} catch (e) {
			console.warn('[IndexInitializer] Hub regen service init failed:', e);
		}
	}

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

	/** Full pipeline: FTS → vector embeddings → LLM tags/summaries → Mobius maintenance. */
	async performStagedFullIndexing(
		showNotification: boolean = true,
		level: IndexLevel = 'full',
		onError?: IndexErrorHandler,
	): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) {
			this.reporter.show('Search index is not ready. Open the vault and wait for the plugin to load.', 6000);
			return;
		}

		IndexService.resetCancellation();

		const filesToIndex = await this.collectAllIndexableFilePaths();

		const progressTracker = new IndexProgressTracker(filesToIndex.length, this.reporter);
		let indexedCount = 0;
		try {
			progressTracker.showStart('Peak: Step 1/4 — Full-text (FTS), no embeddings…');

			let lastProgressUpdate = Date.now();
			const PROGRESS_INTERVAL_MS = 2000;

			for (const path of filesToIndex) {
				if (IndexService.isCancelled() || progressTracker.isCancelled()) {
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
			this.reporter.show(`Peak: Step 1/4 failed — ${(e as Error).message}`, 8000);
			return;
		}

		const dbFilePath = this.storageFolder
			? `${this.storageFolder.trim().replace(/^\/+/, '').replace(/\/+$/, '')}/${VAULT_DB_FILENAME}`
			: VAULT_DB_FILENAME;
		const storageSize = await readFileSize(this.app, dbFilePath);

		progressTracker.dismiss();
		if (showNotification) {
			const mb = storageSize > 0 ? (storageSize / 1024 / 1024).toFixed(2) : '0';
			this.reporter.show(`Peak: Step 1/4 done — FTS indexed ${indexedCount} file(s). DB ~${mb} MB.`, 5000);
		}

		if (level === 'semantic' || level === 'full') {
			const pipelineUi = this.reporter.show('Peak: Step 2/4 — Vector embeddings…', 0);
			try {
				await IndexService.runPendingVectorIndexEnrichment(this.settings, {
					onProgress: ({ processed, total, path }) => {
						const short = path.length > 48 ? `${path.slice(0, 45)}…` : path;
						pipelineUi.setMessage(`Peak: Step 2/4 — Vector ${processed}/${total}\n${short}`);
					},
				});
			} catch (e) {
				if (onError) {
					const action = await onError({ step: 'Embedding generation', failedCount: 0, error: e as Error });
					if (action === 'cancel') {
						pipelineUi.hide();
						return;
					}
					if (action === 'retry') {
						try {
							await IndexService.runPendingVectorIndexEnrichment(this.settings, {
								onProgress: ({ processed, total, path }) => {
									const short = path.length > 48 ? `${path.slice(0, 45)}…` : path;
									pipelineUi.setMessage(`Peak: Step 2/4 — Vector (retry) ${processed}/${total}\n${short}`);
								},
							});
						} catch (retryErr) {
							pipelineUi.hide();
							console.error('[IndexInitializer] Step 2 retry failed:', retryErr);
						}
					}
					// 'continue' → proceed to next step
				} else {
					pipelineUi.hide();
					console.error('[IndexInitializer] Step 2 failed:', e);
					this.reporter.show(`Peak: Step 2/4 failed — ${(e as Error).message}`, 8000);
				}
			}

			if (level === 'full') {
				pipelineUi.setMessage('Peak: Step 3/4 — LLM tags & summaries…');
				try {
					await IndexService.runPendingLlmIndexEnrichment(this.settings, {
						onProgress: (ev) => {
							const short = ev.path.length > 48 ? `${ev.path.slice(0, 45)}…` : ev.path;
							pipelineUi.setMessage(
								`Peak: Step 3/4 — LLM ${ev.processed}/${ev.total}\n${formatLlmEnrichmentProgressLine(ev)}\n${short}`,
							);
						},
					});
				} catch (e) {
					if (onError) {
						const action = await onError({ step: 'LLM enrichment', failedCount: 0, error: e as Error });
						if (action === 'cancel') {
							pipelineUi.hide();
							return;
						}
						if (action === 'retry') {
							try {
								await IndexService.runPendingLlmIndexEnrichment(this.settings, {
									onProgress: (ev) => {
										const short = ev.path.length > 48 ? `${ev.path.slice(0, 45)}…` : ev.path;
										pipelineUi.setMessage(
											`Peak: Step 3/4 — LLM (retry) ${ev.processed}/${ev.total}\n${formatLlmEnrichmentProgressLine(ev)}\n${short}`,
										);
									},
								});
							} catch (retryErr) {
								console.error('[IndexInitializer] Step 3 retry failed:', retryErr);
							}
						}
						// 'continue' → proceed to next step
					} else {
						console.error('[IndexInitializer] Step 3 failed:', e);
					}
				}
			}

			pipelineUi.setMessage('Peak: Step 4/4 — Graph maintenance…');
			try {
				await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
					onProgress: (ev) => pipelineUi.setMessage(maintenanceProgressMsg('Peak: Step 4/4', ev)),
				});
			} catch (e) {
				console.error('[IndexInitializer] Step 4 (maintenance) failed:', e);
			}
			pipelineUi.hide();
			if (showNotification) {
				this.reporter.show(
					'Peak: Full pipeline finished (FTS → vector → LLM → maintenance).',
					8000,
				);
			}
		} else {
			// level === 'fast': only FTS done, run maintenance step
			const pipelineUi = this.reporter.show('Peak: Step 2/2 — Graph maintenance…', 0);
			try {
				await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat'], {
					onProgress: (ev) => pipelineUi.setMessage(maintenanceProgressMsg('Peak: Step 2/2', ev)),
				});
			} catch (e) {
				console.error('[IndexInitializer] Graph maintenance failed:', e);
			}
			pipelineUi.hide();
			if (showNotification) {
				this.reporter.show('Peak: Fast indexing finished (FTS + graph maintenance).', 5000);
			}
		}
	}

	async performFullIndexing(showNotification: boolean): Promise<void> {
		IndexService.resetCancellation();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		await this.indexNewAndModifiedFiles(filesToIndex);
		await IndexService.getInstance().runMobiusGlobalMaintenance(['vault', 'chat']);
	}

	/** Incremental indexing: check for new/modified files and index them. */
	async performIncrementalIndexing(filesToIndexPaths?: string[]): Promise<void> {
		try {
			IndexService.resetCancellation();
			filesToIndexPaths = await this.resolveFilesToIndex(filesToIndexPaths);
			const level: IndexLevel = this.settings.indexLevel ?? 'fast';
			const opts = defaultIndexDocumentOptionsForLevel(level);
			await Promise.all([
				this.checkAndDeleteRemovedFiles(),
				this.indexDocumentPaths(filesToIndexPaths, 'Indexing', opts),
			]);
			await this.runMobiusMaintenanceIfDue();
		} catch (e) {
			console.error('Incremental indexing failed:', e);
		}
	}

	/** Full vault pass: core FTS + chunks only (`listener_fast`). Defers vectors and LLM via pending flags. */
	async performFastCoreFullIndexing(_showNotification: boolean): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) {
			this.reporter.show('Search index is not ready. Open the vault and wait for the plugin to load.', 6000);
			return;
		}
		IndexService.resetCancellation();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		await this.indexDocumentPaths(filesToIndex, 'Peak: Fast index (FTS)…', 'listener_fast');
	}

	/** Incremental fast core indexing: `listener_fast` only, no automatic maintenance. */
	async performFastCoreIncrementalIndexing(filesToIndexPaths?: string[]): Promise<void> {
		try {
			IndexService.resetCancellation();
			filesToIndexPaths = await this.resolveFilesToIndex(filesToIndexPaths);
			await Promise.all([
				this.checkAndDeleteRemovedFiles(),
				this.indexDocumentPaths(filesToIndexPaths, 'Peak: Fast index (FTS)…', 'listener_fast'),
			]);
		} catch (e) {
			console.error('Fast core incremental indexing failed:', e);
		}
	}

	/** If paths not provided, scan vault and show progress notices. */
	private async resolveFilesToIndex(paths?: string[]): Promise<string[]> {
		if (paths) return paths;
		this.reporter.show('Scanning for index changes...', 5000);
		const { filesToIndex } = await this.scanForIndexChanges();
		this.reporter.show(`Scanning for index changes completed. files to index: ${filesToIndex.length}`, 3000);
		return filesToIndex;
	}

	/** Check for deleted files and remove them from index (batch checking). */
	private async checkAndDeleteRemovedFiles(): Promise<void> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();

		const vaultFiles = new Set<string>();
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: INDEX_CHECK_BATCH_SIZE })) {
			for (const docItem of docBatch) {
				if (loaderManager.shouldIndexDocument({ type: docItem.type, sourceFileInfo: { path: docItem.path } } as any)) {
					vaultFiles.add(docItem.path);
				}
			}
		}

		const deletedPaths: string[] = [];
		for (let offset = 0; ; offset += INDEX_CHECK_BATCH_SIZE) {
			const indexedBatch = await indexedDocumentRepo.getIndexedPathsBatch(offset, INDEX_CHECK_BATCH_SIZE);
			if (indexedBatch.length === 0) break;
			for (const item of indexedBatch) {
				if (!vaultFiles.has(item.path)) deletedPaths.push(item.path);
			}
		}

		if (deletedPaths.length > 0) {
			await IndexService.getInstance().deleteDocuments(deletedPaths);
		}
	}

	private async indexDocumentPaths(
		filesToIndexPaths: string[],
		progressStartLabel: string,
		reasonOrOpts: IndexDocumentReason | IndexDocumentOptions,
	): Promise<void> {
		if (filesToIndexPaths.length === 0) {
			return;
		}

		const progressTracker = new IndexProgressTracker(filesToIndexPaths.length, this.reporter);
		progressTracker.showStart(progressStartLabel);

		let indexedCount = 0;
		let lastProgressUpdate = Date.now();
		const PROGRESS_INTERVAL_MS = 2000;
		const opts = typeof reasonOrOpts === 'string' ? defaultIndexDocumentOptions(reasonOrOpts) : reasonOrOpts;

		for (const path of filesToIndexPaths) {
			if (IndexService.isCancelled() || progressTracker?.isCancelled()) {
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
		const storageSize = await readFileSize(this.app, dbFilePath);

		progressTracker.showComplete({
			totalIndexed: indexedCount,
			storageSize,
		});
	}

	private async indexNewAndModifiedFiles(filesToIndexPaths: string[]): Promise<void> {
		await this.indexDocumentPaths(filesToIndexPaths, 'Indexing', 'manual_full');
	}

	private async scanForIndexChanges(): Promise<{ filesToIndex: string[] }> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const filesToIndex: string[] = [];
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: INDEX_CHECK_BATCH_SIZE })) {
			const indexable = docBatch.filter(d =>
				loaderManager.shouldIndexDocument({ type: d.type, sourceFileInfo: { path: d.path } } as any),
			);
			filesToIndex.push(...await this.checkAndCollectModifiedFiles(indexable));
		}
		return { filesToIndex };
	}

	private async checkAndCollectModifiedFiles(
		currentBatch: Array<{ path: string; mtime: number; type: DocumentType }>,
	): Promise<string[]> {
		if (currentBatch.length === 0) return [];

		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const indexedMap = await indexedDocumentRepo.batchCheckIndexed(currentBatch.map(d => d.path));
		const maybeIndex = currentBatch.filter(d => {
			const info = indexedMap.get(d.path);
			return info === undefined || info.mtime !== d.mtime;
		});
		if (maybeIndex.length === 0) return [];
		return this.processMaybeIndexBatch(maybeIndex);
	}

	/** Content-hash check: only files whose hash is genuinely new need re-indexing. */
	private async processMaybeIndexBatch(
		maybeIndexArray: Array<{ path: string; mtime: number; type: DocumentType }>,
	): Promise<string[]> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const pathToHash = new Map<string, string>();
		const filesWithoutHash: string[] = [];

		for (const docItem of maybeIndexArray) {
			const doc = await loaderManager.readByPath(docItem.path, false, { includeLlmTags: false, includeLlmSummary: false });
			if (doc?.contentHash) pathToHash.set(docItem.path, doc.contentHash);
			else filesWithoutHash.push(docItem.path);
		}

		const filesToIndex = [...filesWithoutHash];
		if (pathToHash.size > 0) {
			const existingHashes = await indexedDocumentRepo.batchGetByContentHashes([...pathToHash.values()]);
			for (const [path, hash] of pathToHash) {
				if (!existingHashes.has(hash)) filesToIndex.push(path);
			}
		}
		return filesToIndex;
	}


}
