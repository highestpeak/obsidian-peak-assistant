import type { AppHandle as App } from '@/core/ports/AppHandle';
// T11R Phase 2: type-only obsidian import removed; AppHandle covers the
// duck-typed `app.vault.adapter` / `app.metadataCache` access points.
import type { SearchSettings } from '@/core/config/settingsTypes';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import type { DocumentType } from '@/core/document/types';
import { hashString } from '@/core/utils/hash-utils';
import { IndexProgressTracker } from '../support/progress-tracker';
import type { ProgressReporterPort } from '@/core/ports/ProgressReporterPort';
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
async function readFileSize(app: App, filePath: string): Promise<number> {
	try {
		const adapter = app.vault.adapter as { stat?: (p: string) => Promise<{ size?: number } | null> };
		const stat = await adapter.stat?.(filePath);
		return stat?.size ?? 0;
	} catch {
		return 0;
	}
}
import type { IndexLevel } from '@/core/search/indexTypes';
import { defaultIndexDocumentOptionsForLevel } from '@/core/search/indexTypes';
import type { IndexRunResult } from '@/core/ports/IndexRunCoordinatorPort';

export class IndexRunControl {
	private cancelled = false;
	private paused = false;
	private readonly waiters: Array<() => void> = [];

	cancel(): void { this.cancelled = true; this.resume(); }
	pause(): void { this.paused = true; }
	resume(): void { this.paused = false; for (const resolve of this.waiters.splice(0)) resolve(); }
	isCancelled(): boolean { return this.cancelled; }
	async waitIfPaused(): Promise<void> {
		if (!this.paused) return;
		await new Promise<void>((resolve) => this.waiters.push(resolve));
	}
}

export type IndexErrorAction = 'continue' | 'retry' | 'cancel';
export interface IndexDocumentProgress {
	processed: number;
	total: number;
	path: string | null;
	failed: number;
	/** Result for `path`, not the cumulative batch result. */
	succeeded?: boolean;
}
export type IndexErrorHandler = (error: {
	step: string;
	failedCount: number;
	error: Error;
}) => Promise<IndexErrorAction>;

export interface StagedIndexOutputs {
	includeEmbeddings: boolean;
	includeLlmTags: boolean;
	includeLlmSummary: boolean;
	includeGraphMaintenance: boolean;
}

const PHASE_LABELS: Record<string, string> = {
	semantic_pagerank_edges: 'semantic PR edges',
	semantic_pagerank_persist: 'semantic PR persist',
};

function maintenanceProgressMsg(prefix: string, ev: { phase: string; tenant: string; progressTextSuffix?: string }): string {
	if (ev.phase === 'semantic_related') return `${prefix}: semantic edges · ${ev.tenant} · ${ev.progressTextSuffix ?? ''}`;
	return `${prefix}: ${ev.tenant} · ${PHASE_LABELS[ev.phase] ?? ev.phase} · ${ev.progressTextSuffix ?? ''}`;
}

/**
 * Guard: run the heavy whole-graph work (Mobius global maintenance — PageRank +
 * Louvain structural analysis + semantic edges — and the pending hub-regen queue
 * drain) automatically at startup?
 *
 * OFF by default. On large vaults these load the entire graph into the renderer's
 * JS/cppgc heap and run iterative algorithms, which OOM-aborts the Electron
 * renderer during plugin load (white-screen crash loop). They are NOT needed for
 * search or the File Atlas graph, which read already-computed edges from the
 * index. Both remain available on demand: the "Run Mobius maintenance" command
 * and manual hub regeneration. Flip to `true` only once the maintenance sweep is
 * memory-bounded (streamed instead of loaded whole).
 */
const AUTO_STARTUP_GRAPH_MAINTENANCE = false;

export class IndexInitializer {
	constructor(
		private readonly app: App,
		private readonly settings: SearchSettings,
		private readonly storageFolder: string,
		private readonly reporter: ProgressReporterPort,
		// T13: IndexService via constructor DI so this file no longer imports
		// @/app/AppContext to reach the singleton.
		private readonly indexService: IndexService,
	) {}

	private async runMobiusMaintenanceIfDue(): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) return;
		if (!(await this.indexService.isMobiusMaintenanceRecommended())) return;
		const ui = this.reporter.show('Mobius: running graph maintenance…', 0);
		try {
			await this.indexService.runMobiusGlobalMaintenance(['vault', 'chat'], {
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
			if (this.settings.maintenance.onStartup === 'nothing') return;
			if (this.settings.maintenance.onStartup === 'prompt') {
				this.reporter.show('Peak did not scan for changed files. Run an index update when you are ready.', 5000);
				return;
			}
			const indexStatus = await this.indexService.getIndexStatus();
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
			} else if (AUTO_STARTUP_GRAPH_MAINTENANCE) {
				await this.runMobiusMaintenanceIfDue();
			}
		} catch (e) {
			console.error('Index check/update failed:', e);
		}

		// S6: Init hub regen service and drain any stale queue from previous session
		try {
			const { HubRegenService } = await import('./helper/hub/hubRegenService');
			HubRegenService.getInstance().init(() => this.settings);
			if (AUTO_STARTUP_GRAPH_MAINTENANCE && sqliteStoreManager.isInitialized()) {
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
		for await (const batch of loaderManager.scanDocuments({ batchSize: this.settings.maintenance.batchSize })) {
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
		return filesToIndex.sort((a, b) => a.localeCompare(b));
	}

	/** Full pipeline: FTS → vector embeddings → LLM tags/summaries → Mobius maintenance. */
	async performStagedFullIndexing(
		showNotification: boolean = true,
		level: IndexLevel = 'full',
		onError?: IndexErrorHandler,
		outputs?: StagedIndexOutputs,
		control?: IndexRunControl,
	): Promise<IndexRunResult> {
		if (!sqliteStoreManager.isInitialized()) {
			const message = 'Search database is not initialized.';
			this.reporter.show(message, 6000);
			return { status: 'failed', indexedCount: 0, failureCount: 1, totalDocuments: 0, message };
		}

		IndexService.resetCancellation();

		const filesToIndex = await this.collectAllIndexableFilePaths();

		const progressTracker = new IndexProgressTracker(this.reporter, filesToIndex.length);
		let indexedCount = 0;
		let failureCount = 0;
		try {
			progressTracker.showStart('Peak: Step 1/4 — Full-text (FTS), no embeddings…');

			let lastProgressUpdate = Date.now();
			const PROGRESS_INTERVAL_MS = 2000;

			for (const path of filesToIndex) {
				if (control) await control.waitIfPaused();
				else await IndexService.waitIfPaused();
				if (control?.isCancelled() || (!control && IndexService.isCancelled()) || progressTracker.isCancelled()) {
					progressTracker.dismiss();
					return { status: 'cancelled', indexedCount, failureCount, totalDocuments: filesToIndex.length, message: 'Indexing cancelled' };
				}
				let indexed = false;
				let lastError: unknown = null;
				for (let attempt = 0; attempt <= this.settings.maintenance.retryAttempts; attempt++) {
					try {
						await this.indexService.indexDocument(
							path,
							this.settings,
							defaultIndexDocumentOptions('listener_fast'),
						);
						indexed = true;
						break;
					} catch (error) {
						lastError = error;
					}
				}
				if (indexed) indexedCount++;
				else {
					failureCount++;
					progressTracker.recordFailure('Full-text indexing', lastError instanceof Error ? lastError.message : String(lastError), path);
				}
				const processedCount = indexedCount + failureCount;
				if (processedCount === 1 || Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS || processedCount === filesToIndex.length) {
					progressTracker.updateProgress(processedCount, path);
					lastProgressUpdate = Date.now();
				}
			}
		} catch (e) {
			progressTracker.dismiss();
			console.error('[IndexInitializer] Staged pipeline failed at FTS step:', e);
			this.reporter.show(`Peak: Step 1/4 failed — ${(e as Error).message}`, 8000);
			return { status: 'failed', indexedCount, failureCount: failureCount + 1, totalDocuments: filesToIndex.length, message: `Full-text indexing failed: ${(e as Error).message}` };
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

		const includeEmbeddings = outputs?.includeEmbeddings ?? (level === 'semantic' || level === 'full');
		const includeLlmTags = outputs?.includeLlmTags ?? level === 'full';
		const includeLlmSummary = outputs?.includeLlmSummary ?? level === 'full';
		const includeGeneratedKnowledge = includeLlmTags || includeLlmSummary;
		const includeGraphMaintenance = outputs?.includeGraphMaintenance ?? (level === 'semantic' || level === 'full');

		if (includeEmbeddings || includeGeneratedKnowledge || includeGraphMaintenance) {
			const pipelineUi = this.reporter.show('Peak: Step 2/4 — Vector embeddings…', 0);
			if (includeEmbeddings) try {
				await this.indexService.runPendingVectorIndexEnrichment(this.settings, {
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
						return { status: 'cancelled', indexedCount, failureCount, totalDocuments: filesToIndex.length, message: 'Indexing cancelled' };
					}
					if (action === 'retry') {
						try {
							await this.indexService.runPendingVectorIndexEnrichment(this.settings, {
								onProgress: ({ processed, total, path }) => {
									const short = path.length > 48 ? `${path.slice(0, 45)}…` : path;
									pipelineUi.setMessage(`Peak: Step 2/4 — Vector (retry) ${processed}/${total}\n${short}`);
								},
							});
						} catch (retryErr) {
							pipelineUi.hide();
							console.error('[IndexInitializer] Step 2 retry failed:', retryErr);
							failureCount++;
							this.reporter.recordFailure?.({ stage: 'Embedding generation', message: retryErr instanceof Error ? retryErr.message : String(retryErr) });
						}
					} else {
						failureCount++;
						this.reporter.recordFailure?.({ stage: 'Embedding generation', message: e instanceof Error ? e.message : String(e) });
					}
					// 'continue' → proceed to next step
				} else {
					pipelineUi.hide();
					console.error('[IndexInitializer] Step 2 failed:', e);
					failureCount++;
					this.reporter.recordFailure?.({ stage: 'Embedding generation', message: e instanceof Error ? e.message : String(e) });
					this.reporter.show(`Peak: Step 2/4 failed — ${(e as Error).message}`, 8000);
				}
			}

			if (includeGeneratedKnowledge) {
				pipelineUi.setMessage('Peak: Step 3/4 — LLM tags & summaries…');
				try {
					await this.indexService.runPendingLlmIndexEnrichment(this.settings, {
						includeTags: includeLlmTags,
						includeSummary: includeLlmSummary,
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
							return { status: 'cancelled', indexedCount, failureCount, totalDocuments: filesToIndex.length, message: 'Indexing cancelled' };
						}
						if (action === 'retry') {
							try {
								await this.indexService.runPendingLlmIndexEnrichment(this.settings, {
									includeTags: includeLlmTags,
									includeSummary: includeLlmSummary,
									onProgress: (ev) => {
										const short = ev.path.length > 48 ? `${ev.path.slice(0, 45)}…` : ev.path;
										pipelineUi.setMessage(
											`Peak: Step 3/4 — LLM (retry) ${ev.processed}/${ev.total}\n${formatLlmEnrichmentProgressLine(ev)}\n${short}`,
										);
									},
								});
							} catch (retryErr) {
								console.error('[IndexInitializer] Step 3 retry failed:', retryErr);
								failureCount++;
								this.reporter.recordFailure?.({ stage: 'Generated knowledge', message: retryErr instanceof Error ? retryErr.message : String(retryErr) });
							}
						} else {
							failureCount++;
							this.reporter.recordFailure?.({ stage: 'Generated knowledge', message: e instanceof Error ? e.message : String(e) });
						}
						// 'continue' → proceed to next step
					} else {
						console.error('[IndexInitializer] Step 3 failed:', e);
						failureCount++;
						this.reporter.recordFailure?.({ stage: 'Generated knowledge', message: e instanceof Error ? e.message : String(e) });
					}
				}
			}

			if (includeGraphMaintenance) {
				pipelineUi.setMessage('Peak: Step 4/4 — Graph maintenance…');
				try {
					await this.indexService.runMobiusGlobalMaintenance(['vault', 'chat'], {
						onProgress: (ev) => pipelineUi.setMessage(maintenanceProgressMsg('Peak: Step 4/4', ev)),
					});
				} catch (e) {
					console.error('[IndexInitializer] Step 4 (maintenance) failed:', e);
					failureCount++;
					this.reporter.recordFailure?.({ stage: 'Graph maintenance', message: e instanceof Error ? e.message : String(e) });
				}
			}
			pipelineUi.hide();
			if (showNotification) {
				this.reporter.show(failureCount > 0
					? `Indexing completed with ${failureCount} failure(s). Open the Index Workspace for details.`
					: 'Indexing complete! Full text, vectors, generated knowledge and maintenance are ready.', 8000);
			}
		} else {
			// First-use fast mode deliberately stops after local full-text search.
			// Graph maintenance is a later run output, not a hidden onboarding cost.
			if (showNotification) {
				this.reporter.show(failureCount > 0
					? `Indexing completed with ${failureCount} failure(s). Open the Index Workspace for details.`
					: 'Indexing complete! Full-text search is ready.', 5000);
			}
		}
		return {
			status: 'complete',
			indexedCount,
			failureCount,
			totalDocuments: filesToIndex.length,
			message: failureCount > 0 ? `Full-text index is ready with ${failureCount} document failure(s).` : 'Full-text index is ready.',
		};
	}

	async performFullIndexing(showNotification: boolean): Promise<void> {
		IndexService.resetCancellation();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		await this.indexNewAndModifiedFiles(filesToIndex);
		await this.indexService.runMobiusGlobalMaintenance(['vault', 'chat']);
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
	async performFastCoreFullIndexing(_showNotification: boolean, onProgress?: (progress: IndexDocumentProgress) => void, shouldContinue?: () => boolean): Promise<void> {
		if (!sqliteStoreManager.isInitialized()) {
			this.reporter.show('Search index is not ready. Open the vault and wait for the plugin to load.', 6000);
			return;
		}
		IndexService.resetCancellation();
		const filesToIndex = await this.collectAllIndexableFilePaths();
		await this.indexDocumentPaths(filesToIndex, 'Peak: Fast index (FTS)…', 'listener_fast', onProgress, shouldContinue);
	}

	/** Incremental fast core indexing: `listener_fast` only, no automatic maintenance. */
	async performFastCoreIncrementalIndexing(filesToIndexPaths?: string[], onProgress?: (progress: IndexDocumentProgress) => void, shouldContinue?: () => boolean): Promise<void> {
		try {
			IndexService.resetCancellation();
			filesToIndexPaths = await this.resolveFilesToIndex(filesToIndexPaths);
			await Promise.all([
				this.checkAndDeleteRemovedFiles(),
				this.indexDocumentPaths(filesToIndexPaths, 'Peak: Fast index (FTS)…', 'listener_fast', onProgress, shouldContinue),
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
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: this.settings.maintenance.batchSize })) {
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
			await this.indexService.deleteDocuments(deletedPaths);
		}
	}

	private async indexDocumentPaths(
		filesToIndexPaths: string[],
		progressStartLabel: string,
		reasonOrOpts: IndexDocumentReason | IndexDocumentOptions,
		onProgress?: (progress: IndexDocumentProgress) => void,
		shouldContinue?: () => boolean,
	): Promise<void> {
		if (filesToIndexPaths.length === 0) {
			onProgress?.({ processed: 0, total: 0, path: null, failed: 0 });
			return;
		}

		const progressTracker = new IndexProgressTracker(this.reporter, filesToIndexPaths.length);
		progressTracker.showStart(progressStartLabel);

		let indexedCount = 0;
		let lastProgressUpdate = Date.now();
		const PROGRESS_INTERVAL_MS = 2000;
		const opts = typeof reasonOrOpts === 'string' ? defaultIndexDocumentOptions(reasonOrOpts) : reasonOrOpts;

		let failureCount = 0;
		for (const path of filesToIndexPaths) {
			if (shouldContinue && !shouldContinue()) break;
			await IndexService.waitIfPaused();
			if (IndexService.isCancelled() || progressTracker?.isCancelled()) {
				break;
			}

			let indexed = false;
			let lastError: unknown = null;
			for (let attempt = 0; attempt <= this.settings.maintenance.retryAttempts; attempt++) {
				try {
					await this.indexService.indexDocument(path, this.settings, opts);
					indexed = true;
					break;
				} catch (error) {
					lastError = error;
				}
			}
			if (indexed) indexedCount += 1;
			else {
				failureCount += 1;
				progressTracker.recordFailure('Document indexing', lastError instanceof Error ? lastError.message : String(lastError), path);
			}

			const processedCount = indexedCount + failureCount;
			onProgress?.({ processed: processedCount, total: filesToIndexPaths.length, path, failed: failureCount, succeeded: indexed });
			if (processedCount === 1 || Date.now() - lastProgressUpdate >= PROGRESS_INTERVAL_MS || processedCount === filesToIndexPaths.length) {
				progressTracker.updateProgress(processedCount, path);
				lastProgressUpdate = Date.now();
			}
		}

		const dbFilePath = this.storageFolder
			? `${this.storageFolder.trim().replace(/^\/+/, '').replace(/\/+$/, '')}/${VAULT_DB_FILENAME}`
			: VAULT_DB_FILENAME;
		const storageSize = await readFileSize(this.app, dbFilePath);

		if (failureCount > 0) {
			progressTracker.dismiss();
			this.reporter.show(`Indexing completed with ${failureCount} failure(s). Open the Index Workspace for details.`, 8000);
		} else {
			progressTracker.showComplete({
				totalIndexed: indexedCount,
				storageSize,
			});
		}
	}

	private async indexNewAndModifiedFiles(filesToIndexPaths: string[]): Promise<void> {
		await this.indexDocumentPaths(filesToIndexPaths, 'Indexing', 'manual_full');
	}

	private async scanForIndexChanges(): Promise<{ filesToIndex: string[] }> {
		// Diagnostic accumulators — one summary line at the end so we can
		// binary-search which phase dominates when the scan feels slow.
		// Grep for "[scan-diag]" in the console after a reload.
		const diag = {
			batches: 0,
			totalScanned: 0,
			totalIndexable: 0,
			totalMtimeMismatch: 0,
			totalReads: 0,
			totalReadsFast: 0, // markdown/txt hashed via lightweight readText path
			totalReadsSlow: 0, // fallback readByPath (parse + TextRank + …)
			totalActuallyDirty: 0,
			msScanDocuments: 0, // vault walk (fs.readdir + stat)
			msFilterIndexable: 0, // shouldIndexDocument
			msSqliteMtimeCheck: 0, // batchCheckIndexed
			msFileReadHash: 0, // read + hash total (fast + slow paths)
			msFileReadHashFast: 0, // fast path only
			msFileReadHashSlow: 0, // slow path only
			msSqliteHashCheck: 0, // batchGetByContentHashes
			// Top-10 slowest per-file read+hash — helps spot outliers (huge files,
			// iCloud materialize, canvas/PDF that fell to slow path).
			slowestFiles: [] as Array<{ path: string; ms: number; type: DocumentType; via: 'fast' | 'slow' }>,
		};

		const scanStart = performance.now();
		const loaderManager = DocumentLoaderManager.getInstance();
		const filesToIndex: string[] = [];

		let batchLoopMark = performance.now();
		for await (const docBatch of loaderManager.scanDocuments({ batchSize: this.settings.maintenance.batchSize })) {
			diag.msScanDocuments += performance.now() - batchLoopMark;

			diag.batches += 1;
			diag.totalScanned += docBatch.length;

			const filterMark = performance.now();
			const indexable = docBatch.filter(d =>
				loaderManager.shouldIndexDocument({ type: d.type, sourceFileInfo: { path: d.path } } as any),
			);
			diag.msFilterIndexable += performance.now() - filterMark;
			diag.totalIndexable += indexable.length;

			filesToIndex.push(...await this.checkAndCollectModifiedFiles(indexable, diag));

			batchLoopMark = performance.now();
		}

		const totalMs = performance.now() - scanStart;
		const other = Math.max(
			0,
			totalMs
				- diag.msScanDocuments
				- diag.msFilterIndexable
				- diag.msSqliteMtimeCheck
				- diag.msFileReadHash
				- diag.msSqliteHashCheck,
		);
		const avgFast = diag.totalReadsFast > 0
			? (diag.msFileReadHashFast / diag.totalReadsFast).toFixed(1)
			: '-';
		const avgSlow = diag.totalReadsSlow > 0
			? (diag.msFileReadHashSlow / diag.totalReadsSlow).toFixed(1)
			: '-';
		console.log(
			`[scan-diag] total ${totalMs.toFixed(0)}ms in ${diag.batches} batch(es) — ` +
			`scanned=${diag.totalScanned} indexable=${diag.totalIndexable} ` +
			`mtimeMismatch=${diag.totalMtimeMismatch} reads=${diag.totalReads} ` +
			`(fast=${diag.totalReadsFast} slow=${diag.totalReadsSlow}) ` +
			`actuallyDirty=${diag.totalActuallyDirty} | phases: ` +
			`scanDocs=${diag.msScanDocuments.toFixed(0)}ms ` +
			`filterIndexable=${diag.msFilterIndexable.toFixed(0)}ms ` +
			`sqliteMtimeCheck=${diag.msSqliteMtimeCheck.toFixed(0)}ms ` +
			`fileReadHash=${diag.msFileReadHash.toFixed(0)}ms (fast=${diag.msFileReadHashFast.toFixed(0)}ms avg=${avgFast}ms/file, slow=${diag.msFileReadHashSlow.toFixed(0)}ms avg=${avgSlow}ms/file) ` +
			`sqliteHashCheck=${diag.msSqliteHashCheck.toFixed(0)}ms ` +
			`other=${other.toFixed(0)}ms`,
		);
		if (diag.slowestFiles.length > 0) {
			const top = [...diag.slowestFiles].sort((a, b) => b.ms - a.ms).slice(0, 10);
			console.log(
				'[scan-diag] top-10 slowest read+hash:\n' +
				top.map(f => `  ${f.ms.toFixed(0)}ms (${f.via}, ${f.type}) ${f.path}`).join('\n'),
			);
		}

		return { filesToIndex };
	}

	private async checkAndCollectModifiedFiles(
		currentBatch: Array<{ path: string; mtime: number; type: DocumentType }>,
		diag?: {
			totalMtimeMismatch: number;
			totalReads: number;
			totalReadsFast: number;
			totalReadsSlow: number;
			totalActuallyDirty: number;
			msSqliteMtimeCheck: number;
			msFileReadHash: number;
			msFileReadHashFast: number;
			msFileReadHashSlow: number;
			msSqliteHashCheck: number;
			slowestFiles: Array<{ path: string; ms: number; type: DocumentType; via: 'fast' | 'slow' }>;
		},
	): Promise<string[]> {
		if (currentBatch.length === 0) return [];

		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const mtimeMark = performance.now();
		const indexedMap = await indexedDocumentRepo.batchCheckIndexed(currentBatch.map(d => d.path));
		if (diag) diag.msSqliteMtimeCheck += performance.now() - mtimeMark;

		const maybeIndex = currentBatch.filter(d => {
			const info = indexedMap.get(d.path);
			return info === undefined || info.mtime !== d.mtime;
		});
		if (diag) diag.totalMtimeMismatch += maybeIndex.length;
		if (maybeIndex.length === 0) return [];
		return this.processMaybeIndexBatch(maybeIndex, diag);
	}

	/** Content-hash check: only files whose hash is genuinely new need re-indexing.
	 *
	 * Fast path (markdown / txt): the loader's `contentHash` is just
	 * `hashString(readText(file), 8)` — same as what we can compute directly
	 * here without triggering `readByPath`'s parse + TextRank pipeline. Uses
	 * ~1-2ms/file instead of ~40ms/file, which is the difference between a
	 * <2s scan and a 60s scan on a 1k+ dirty vault.
	 *
	 * Slow path (canvas / PDF / DOCX / etc.): the loader's `contentHash` is
	 * derived from extracted content, so we still delegate to `readByPath`
	 * for those. Fine because binary formats are rare in a note vault.
	 */
	private async processMaybeIndexBatch(
		maybeIndexArray: Array<{ path: string; mtime: number; type: DocumentType }>,
		diag?: {
			totalReads: number;
			totalReadsFast: number;
			totalReadsSlow: number;
			totalActuallyDirty: number;
			msFileReadHash: number;
			msFileReadHashFast: number;
			msFileReadHashSlow: number;
			msSqliteHashCheck: number;
			slowestFiles: Array<{ path: string; ms: number; type: DocumentType; via: 'fast' | 'slow' }>;
		},
	): Promise<string[]> {
		const loaderManager = DocumentLoaderManager.getInstance();
		const vault = loaderManager.getVaultReader();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const pathToHash = new Map<string, string>();
		const filesWithoutHash: string[] = [];

		const readMark = performance.now();
		for (const docItem of maybeIndexArray) {
			const fileMark = diag ? performance.now() : 0;
			const isFastType = docItem.type === 'markdown' || docItem.type === 'txt';
			let via: 'fast' | 'slow' = 'slow';
			if (isFastType) {
				const file = vault.getFile(docItem.path);
				if (file) {
					try {
						const content = await vault.readText(file);
						pathToHash.set(docItem.path, hashString(content, 8));
						via = 'fast';
					} catch {
						filesWithoutHash.push(docItem.path);
					}
				} else {
					filesWithoutHash.push(docItem.path);
				}
			} else {
				const doc = await loaderManager.readByPath(docItem.path, false, { includeLlmTags: false, includeLlmSummary: false });
				if (doc?.contentHash) pathToHash.set(docItem.path, doc.contentHash);
				else filesWithoutHash.push(docItem.path);
			}
			if (diag) {
				const dt = performance.now() - fileMark;
				if (via === 'fast') { diag.totalReadsFast += 1; diag.msFileReadHashFast += dt; }
				else { diag.totalReadsSlow += 1; diag.msFileReadHashSlow += dt; }
				// Track top slowest — keep a bounded heap-ish list.
				if (diag.slowestFiles.length < 10 || dt > diag.slowestFiles[diag.slowestFiles.length - 1].ms) {
					diag.slowestFiles.push({ path: docItem.path, ms: dt, type: docItem.type, via });
					if (diag.slowestFiles.length > 20) {
						diag.slowestFiles.sort((a, b) => b.ms - a.ms);
						diag.slowestFiles.length = 10;
					}
				}
			}
		}
		if (diag) {
			diag.msFileReadHash += performance.now() - readMark;
			diag.totalReads += maybeIndexArray.length;
		}

		const filesToIndex = [...filesWithoutHash];
		if (pathToHash.size > 0) {
			const hashMark = performance.now();
			const existingHashes = await indexedDocumentRepo.batchGetByContentHashes([...pathToHash.values()]);
			if (diag) diag.msSqliteHashCheck += performance.now() - hashMark;
			for (const [path, hash] of pathToHash) {
				if (!existingHashes.has(hash)) filesToIndex.push(path);
			}
		}
		if (diag) diag.totalActuallyDirty += filesToIndex.length;
		return filesToIndex;
	}


}
