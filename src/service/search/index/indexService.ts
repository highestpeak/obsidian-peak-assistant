import { normalizePath, TFile } from 'obsidian';
import { emptyUsage, type LLMUsage } from '@/core/providers/types';
import {
	LlmEnrichmentProgressTracker,
	type PendingLlmEnrichmentProgress,
} from '@/service/search/support/llm-enrichment-progress-tracker';
import {
	type Chunk,
	defaultIndexDocumentOptions,
	type IndexDocumentOptions,
	type LlmIndexingCompleteEvent,
} from './types';
import type { DocumentLoaderReadOptions } from '@/core/document/loader/types';
import { AppContext } from '@/app/context/AppContext';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { IndexedDocumentRecord } from '@/core/storage/sqlite/ddl';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { MobiusEdgeRepo } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
import { normalizeUsageTokens } from '@/service/search/support/llm-cost-utils';
import { normalizeTextForFts } from '../support/segmenter';
import { getAIHubSummaryFolder, type SearchSettings } from '@/app/settings/types';
import type { Document, DocumentReference } from '@/core/document/types';
import {
	INDEX_FRONTMATTER_KEYS,
	INDEX_LONG_RANGE_LCA_MAX_DEPTH,
	INDEX_STATE_KEYS,
	MOBIUS_MAINTENANCE_DEBT_INDEX_DOC,
	MOBIUS_MAINTENANCE_DEBT_PER_DELETE,
	MOBIUS_MAINTENANCE_DEBT_RENAME,
	MOBIUS_MAINTENANCE_DIRTY_THRESHOLD,
	MOBIUS_MAINTENANCE_STATE_KEYS,
	LLM_PENDING_ENRICH_CONCURRENCY,
	PAGERANK_ALGORITHM_VERSION,
	PAGERANK_EDGE_BATCH_SIZE,
	SEMANTIC_PAGERANK_ALGORITHM_VERSION,
	FOLDER_HUB_STATS_DOC_PAGE_SIZE,
} from '@/core/constant';
import {
	accumulateSemanticOutgoingWeightSums,
	computeSemanticPageRankStreaming,
	computeVaultPageRankStreaming,
} from '@/service/search/index/helper/documentPageRank';
import { enforceChunkLengthWithOverlap } from '@/service/search/index/helper/safeChunking';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import {
	generateDocIdFromPath,
	generateUuidWithoutHyphens,
	stableDocumentNodeIdTimeFallback,
	stableMobiusFolderNodeId,
} from '@/core/utils/id-utils';
import { AIServiceManager } from '@/service/chat/service-manager';
import { parseLooseTimestampToMs } from '@/core/utils/date-utils';
import { mapWithConcurrency } from '@/core/utils/concurrent-utils';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { getFileNameFromPath } from '@/core/utils/file-utils';
import {
	GraphEdgeType,
	GraphNodeType,
	GRAPH_DOCUMENT_LIKE_NODE_TYPES,
	GRAPH_TAG_NODE_TYPES,
	isIndexedNoteNodeType,
} from '@/core/po/graph.po';
import {
	SemanticRelatedEdgesRebuildService,
	type RebuildSemanticEdgesBatchResult,
} from '@/service/search/index/helper/semanticRelatedEdges';
import { crossesTopLevelFolder, pathLcaDepth, pathSegments } from '@/core/utils/vault-path-utils';
import {
	decodeIndexedTagsBlob,
	encodeIndexedTagsBlob,
	filterValidFunctionalTagEntries,
	graphKeywordTagsForMobius,
	mergeIndexedTagsBlobForFastIndex,
} from '@/core/document/helper/TagService';
import {
	stableContextTagNodeId,
	stableFunctionalTagNodeId,
	stableKeywordTagNodeId,
	stableTopicTagNodeId,
	upsertDocumentTagEdges,
} from '@/service/search/index/helper/mobiusTagEdges';
import { isVaultPathUnderPrefix } from '@/core/utils/hub-path-utils';
import { HubDocService } from '@/service/search/index/helper/hub';
import { emptyMap } from '@/core/utils/collection-utils';
export type StorageType = 'sqlite' | 'graph';

export type { IndexDocumentOptions, IndexDocumentReason } from './types';
export { defaultIndexDocumentOptions } from './types';

/** Batch-loaded path → indexed id + title for outgoing refs that omit `docId`. */
type PathIndexedDocInfo = { id: string; title: string | null };

/**
 * Resolve index tenant from path.
 * Hub summary subtree is indexed in vault DB even when physically under chat rootFolder.
 */
export function getIndexTenantForPath(path: string): IndexTenant {
	const ctx = AppContext.getInstance();
	const hubFolder = getAIHubSummaryFolder();
	if (hubFolder && isVaultPathUnderPrefix(path, hubFolder)) {
		return 'vault';
	}
	const rootFolder = ctx.settings.ai.rootFolder.trim();
	const normalized = path.replace(/^\/+/, '');
	const prefix = rootFolder.endsWith('/') ? rootFolder.replace(/\/+$/, '') : rootFolder;
	return (normalized === prefix || normalized.startsWith(prefix + '/')) ? 'chat' : 'vault';
}

export interface GetIndexStatusResponse {
	indexBuiltAt: number | null;
	indexedDocs: number | null;
	isReady: boolean;
}

/** Batch size for Mobius aggregate keyset pagination inside {@link IndexService.runMobiusGlobalMaintenance}. */
export const DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE = 200;

/** Phases that use {@link MobiusGlobalMaintenanceProgress.batchIndex} / `idsInBatch`. */
export type MobiusGlobalMaintenanceBatchPhase =
	| 'tag_doc_count'
	| 'document_degrees'
	| 'pagerank_edges'
	| 'pagerank_persist'
	| 'semantic_pagerank_edges'
	| 'semantic_pagerank_persist'
	| 'folder_hub_stats'
	| 'hub_discovery'
	| 'hub_materialize'
	| 'hub_index';

/** All maintenance progress phases (batch-style or `semantic_related`). */
export type MobiusGlobalMaintenancePhase = MobiusGlobalMaintenanceBatchPhase | 'semantic_related';

/**
 * Progress events for {@link IndexService.runMobiusGlobalMaintenance}.
 * Fields by phase: batch phases set `batchIndex` + `idsInBatch`; `semantic_related` sets `processed` + `total`.
 */
export type MobiusGlobalMaintenanceProgress = {
	tenant: IndexTenant;
	phase: MobiusGlobalMaintenancePhase;
	batchIndex?: number;
	idsInBatch?: number;
	processed?: number;
	total?: number;
};

/** Options for {@link IndexService.runMobiusGlobalMaintenance}. */
export interface MobiusGlobalMaintenanceOptions {
	onProgress?: (ev: MobiusGlobalMaintenanceProgress) => void;
}

/** Yields so the UI can stay responsive during long aggregate passes. */
async function yieldForLargePass(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Index lifecycle: delete, clear, rename, status, and maintenance debt bookkeeping.
 */
class IndexCrudService {
	/**
	 * Delete documents by paths. Removes chunks, embeddings, indexed document rows on Mobius, and document graph nodes/edges for those ids.
	 *
	 * Notes:
	 * - Does not delete tag/hub nodes shared by other documents (only edges from removed docs are cleared via node delete scope).
	 * - Runs in a per-tenant transaction.
	 */
	async deleteDocuments(
		paths: string[],
		onAfterMutation?: (types: StorageType[]) => void,
	): Promise<void> {
		if (!paths.length) return;

		const byTenant = new Map<IndexTenant, string[]>();
		for (const p of paths) {
			const t = getIndexTenantForPath(p);
			const list = byTenant.get(t) ?? [];
			list.push(p);
			byTenant.set(t, list);
		}

		for (const [tenant, tenantPaths] of byTenant) {
			const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
			const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
			const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
			const kdb = sqliteStoreManager.getIndexContext(tenant);

			const metaMap = await indexedDocumentRepo.getByPaths(tenantPaths);
			const docIds = Array.from(metaMap.values()).map((m) => m.id);

			await kdb.transaction().execute(async () => {
				docChunkRepo.deleteFtsByDocIds(docIds);
				docChunkRepo.deleteMetaFtsByDocIds(docIds);
				await docChunkRepo.deleteByDocIds(docIds);
				await embeddingRepo.deleteByDocIds(docIds);
				await mobiusNodeRepo.deleteDocumentStatisticsByDocIds(docIds);
				await mobiusEdgeRepo.deleteByNodeIds(docIds);
				await indexedDocumentRepo.deleteByPaths(tenantPaths);
				await mobiusNodeRepo.deleteByIds(docIds);
			});
			if (docIds.length > 0) {
				await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_PER_DELETE * docIds.length);
			}
		}

		onAfterMutation?.(['sqlite', 'graph']);
	}

	/**
	 * Clear all index data: chunks, embeddings, Mobius nodes/edges (via repos), and index_state.
	 * Destructive and cannot be undone.
	 */
	async clearAllIndexData(onAfterMutation?: (types: StorageType[]) => void): Promise<void> {
		const tenants: IndexTenant[] = ['vault', 'chat'];
		for (const tenant of tenants) {
			const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
			const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
			const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
			const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);

			docChunkRepo.deleteAllFts();
			docChunkRepo.deleteAllMetaFts();
			await docChunkRepo.deleteAll();
			await embeddingRepo.deleteAll();
			await mobiusNodeRepo.clearAllDocumentStatistics();
			await mobiusEdgeRepo.deleteAll();
			await indexedDocumentRepo.deleteAll();
			await mobiusNodeRepo.deleteAll();
			await indexStateRepo.clearAll();
		}

		onAfterMutation?.(['sqlite', 'graph']);
	}

	/**
	 * Clean up orphan FTS/chunk/embedding rows and stray document nodes on Mobius when no indexed document remains for that path set.
	 */
	async cleanupOrphanedSearchIndexData(): Promise<{
		metaFts: number;
		fts: number;
		chunks: number;
		embeddings: number;
		stats: number;
		graphNodes: number;
	}> {
		const tenants: IndexTenant[] = ['vault', 'chat'];
		let metaFts = 0;
		let fts = 0;
		let chunks = 0;
		let embeddings = 0;
		let stats = 0;
		let graphNodes = 0;

		for (const tenant of tenants) {
			const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
			const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
			const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
			const kdb = sqliteStoreManager.getIndexContext(tenant);

			await kdb.transaction().execute(async () => {
				metaFts += docChunkRepo.cleanupOrphanMetaFts();
				fts += docChunkRepo.cleanupOrphanFts();
				chunks += await docChunkRepo.cleanupOrphanChunks();
				embeddings += await embeddingRepo.cleanupOrphanEmbeddings();
				stats += await mobiusNodeRepo.cleanupOrphanStats();

				const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
				const paths = Array.from(pathMap.keys());
				const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
				const validDocIds = new Set(idRows.map((r) => r.id));

				const orphanDocNodes: string[] = [];
				for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
					const nodes = await mobiusNodeRepo.getByType(t);
					orphanDocNodes.push(...nodes.filter((n) => !validDocIds.has(n.id)).map((n) => n.id));
				}

				if (orphanDocNodes.length > 0) {
					await mobiusEdgeRepo.deleteByNodeIds(orphanDocNodes);
					await mobiusNodeRepo.deleteByIds(orphanDocNodes);
					graphNodes += orphanDocNodes.length;
				}
			});
		}

		return { metaFts, fts, chunks, embeddings, stats, graphNodes };
	}

	/** Index build timestamp and document count (vault tenant). */
	async getIndexStatus(): Promise<GetIndexStatusResponse> {
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo('vault');
		const builtAtRaw = await indexStateRepo.get(INDEX_STATE_KEYS.builtAt);
		const indexedRaw = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
		const indexBuiltAt = builtAtRaw != null ? Number(builtAtRaw) : null;
		const indexedDocs = indexedRaw != null ? Number(indexedRaw) : null;
		return {
			indexBuiltAt: Number.isFinite(indexBuiltAt as any) ? indexBuiltAt : null,
			indexedDocs: Number.isFinite(indexedDocs as any) ? indexedDocs : null,
			isReady: Boolean(builtAtRaw),
		};
	}

	/**
	 * Updates path on the indexed document (Mobius + FTS + graph node attributes) without changing node id.
	 * @returns true if a row was updated under oldPath.
	 */
	async renameDocumentPath(oldPath: string, newPath: string): Promise<boolean> {
		const tenantOld = getIndexTenantForPath(oldPath);
		const tenantNew = getIndexTenantForPath(newPath);
		if (tenantOld !== tenantNew) return false;
		const tenant = tenantOld;
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const meta = await indexedDocumentRepo.getByPath(oldPath);
		if (!meta) return false;
		const docId = meta.id;
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const kdb = sqliteStoreManager.getIndexContext(tenant);
		const title = meta.title ?? getFileNameFromPath(newPath);
		const normTitle = normalizeTextForFts(title);
		const ts = Date.now();

		await kdb.transaction().execute(async () => {
			await indexedDocumentRepo.updatePathById(docId, newPath);
			docChunkRepo.replaceMetaFts({ doc_id: docId, path: newPath, title: normTitle });
			const gn = await mobiusNodeRepo.getById(docId);
			if (gn) {
				let attrs: Record<string, unknown> = {};
				try {
					attrs = JSON.parse(gn.attributes) as Record<string, unknown>;
				} catch {
					attrs = {};
				}
				attrs.path = newPath;
				await mobiusNodeRepo.updateById(docId, {
					label: title,
					attributes: JSON.stringify(attrs),
					updated_at: ts,
				});
			}
		});
		await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_RENAME);
		return true;
	}

	/** True when maintenance debt reached the threshold in vault or chat DB. */
	async isMobiusMaintenanceRecommended(): Promise<boolean> {
		for (const tenant of ['vault', 'chat'] as const) {
			const v = await sqliteStoreManager.getIndexStateRepo(tenant).get(MOBIUS_MAINTENANCE_STATE_KEYS.needed);
			if (v === '1') return true;
		}
		return false;
	}

	/** Accumulate maintenance debt after successful incremental graph/search writes. */
	async addMaintenanceDebt(tenant: IndexTenant, delta: number): Promise<void> {
		if (delta <= 0) return;
		if (!sqliteStoreManager.isInitialized()) return;
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
		const raw = await indexStateRepo.get(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore);
		const prev = Number(raw ?? 0);
		const base = Number.isFinite(prev) && prev >= 0 ? prev : 0;
		const next = base + delta;
		await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, String(next));
		if (next >= MOBIUS_MAINTENANCE_DIRTY_THRESHOLD) {
			await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, '1');
		}
	}
}

/**
 * Single-document indexing: load, chunk, embeddings, Mobius + FTS persist.
 */
class IndexSingleService {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly crud: IndexCrudService,
	) { }

	/**
	 * Index a document by path with chunking strategy applied.
	 * Pass {@link IndexDocumentOptions} to control LLM tags/summary vs fast core index.
	 */
	async indexDocument(
		docPath: string,
		settings: SearchSettings,
		indexOptions?: IndexDocumentOptions,
		preloadedDocument?: Document,
	): Promise<void> {
		const opts = indexOptions ?? defaultIndexDocumentOptions('manual_full');
		const sw = new Stopwatch(`[IndexService] Indexing: ${docPath}`);

		console.debug(`[IndexService] Index document: ${docPath}`, opts.reason);
		try {
			const loaderManager = DocumentLoaderManager.getInstance();

			const partialDoc = {
				type: loaderManager.getTypeForPath(docPath) ?? 'unknown',
				sourceFileInfo: { path: docPath },
			} as any;
			if (!loaderManager.shouldIndexDocument(partialDoc)) {
				console.warn(
					`[IndexService] Skipping indexing for path: ${docPath}, type: ${partialDoc.type} (should not be indexed or has no loader)`,
				);
				return;
			}

			const readOpts: DocumentLoaderReadOptions = {
				includeLlmTags: opts.includeLlmTags,
				includeLlmSummary: opts.includeLlmSummary,
				...(opts.onLlmIndexingComplete ? { onLlmIndexingComplete: opts.onLlmIndexingComplete } : {}),
			};

			sw.start('Read document');
			const preload = preloadedDocument;
			let rawDoc: Document | null = null;
			if (preload) {
				const want = normalizePath(docPath);
				const got = normalizePath(preload.sourceFileInfo?.path ?? '');
				if (want !== got) {
					console.warn(
						`[IndexService] preloadedDocument path mismatch (expected ${want}, got ${got}); reloading from vault.`,
					);
					rawDoc = await loaderManager.readByPath(docPath, true, readOpts);
				} else {
					rawDoc = preload;
				}
			} else {
				rawDoc = await loaderManager.readByPath(docPath, true, readOpts);
			}
			sw.stop();
			if (!rawDoc) {
				console.warn(`[IndexService] Failed to load document: ${docPath}`);
				return;
			}

			const tenant = getIndexTenantForPath(rawDoc.sourceFileInfo.path);
			rawDoc.id = await this.resolveDocumentNodeId(rawDoc.sourceFileInfo.path, tenant);

			if (IndexService.isCancelled()) {
				console.log(`[IndexService] Indexing cancelled for ${rawDoc.sourceFileInfo.path}`);
				return;
			}

			const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const existing = await indexedDocumentRepo.getByPath(rawDoc.sourceFileInfo.path);
			const doc = this.applyDocumentMergeForIndex(rawDoc, existing, opts);

			const loader = loaderManager.getLoaderForDocumentType(doc.type);
			if (!loader) {
				console.warn(`No loader found for document type: ${doc.type}`);
				return;
			}

			let chunks: Chunk[] = [];
			if (opts.includeCoreSearchIndex) {
				sw.start('Chunk content');
				chunks = await loader.chunkContent(doc, settings.chunking);
				chunks = enforceChunkLengthWithOverlap(chunks, settings.chunking);
				sw.stop();
			} else if (opts.includeEmbeddings) {
				sw.start('Load chunks for vector enrichment');
				chunks = await this.loadPersistedChunksForEmbedding(doc.id, tenant);
				sw.stop();
			}

			const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();
			const embeddingModel = settings.chunking.embeddingModel;
			const embeddingModelName = embeddingModel ? `${embeddingModel.provider}:${embeddingModel.modelId}` : undefined;
			const canGenerateEmbeddings = opts.includeEmbeddings && embeddingModel != null && vectorSearchAvailable;
			let vectorCompleted = false;
			if (canGenerateEmbeddings) {
				sw.start('Generate embeddings');
				await this.generateAndFillEmbeddings(chunks, embeddingModel);
				sw.stop();
				vectorCompleted = true;
			} else if (!opts.includeEmbeddings) {
				console.debug(`[IndexService] Skipping embeddings by index options for ${doc.sourceFileInfo.path}`);
			} else {
				console.debug(
					`[IndexService] Skipping embedding generation for ${doc.sourceFileInfo.path}. ` +
					'Vector search may not be available (sqlite-vec extension not loaded). ',
				);
			}

			sw.start('Persist index (transaction: mobius + FTS + graph + aggregates + index_state)');
			console.debug(`[IndexService] Persist index for: ${docPath} (tenant: ${tenant})`);
			const shouldRefreshGraph = opts.includeCoreSearchIndex || opts.includeLlmTags || opts.includeLlmSummary;
			const sameTenantOutgoing = shouldRefreshGraph
				? this.filterOutgoingRefsForTenant(doc.references.outgoing, tenant)
				: [];
			if (shouldRefreshGraph && sameTenantOutgoing.length < doc.references.outgoing.length) {
				console.debug(
					`[IndexService] Same-tenant outgoing refs: ${sameTenantOutgoing.length}/${doc.references.outgoing.length} (skipped cross-tenant) for ${docPath}`,
				);
			}
			const pathToIndexedDocInfo = shouldRefreshGraph
				? await this.loadPathToIndexedDocInfoMap(tenant, sameTenantOutgoing)
				: emptyMap<string, PathIndexedDocInfo>();
			const indexedByTargetId = shouldRefreshGraph
				? await this.loadIndexedRecordsForOutgoingTargets(
					tenant,
					pathToIndexedDocInfo,
					sameTenantOutgoing,
				)
				: emptyMap<string, IndexedDocumentRecord>();
			const kdb = sqliteStoreManager.getIndexContext(tenant);
			await kdb.transaction().execute(async () => {
				await this.upsertIndexedDocument(doc, tenant, opts, existing);
				if (shouldRefreshGraph) {
					await this.upsertGraphEdgesForDocument(
						doc,
						tenant,
						pathToIndexedDocInfo,
						indexedByTargetId,
						sameTenantOutgoing,
						opts.includeLlmTags,
					);
					await this.upsertFolderContainsEdgesForDocument(doc, tenant);
					await this.refreshMobiusAggregatesForIndexedDocument(
						doc,
						tenant,
						pathToIndexedDocInfo,
						sameTenantOutgoing,
					);
				}

				if (opts.includeCoreSearchIndex) {
					await this.saveChunkAndFtsData(
						doc.id,
						doc.sourceFileInfo.path,
						doc.metadata.title,
						chunks,
						tenant,
					);
					if (opts.includeEmbeddings) {
						await this.saveEmbeddingData(doc.id, chunks, embeddingModelName, tenant);
					} else {
						await this.clearEmbeddingsForDoc(doc.id, tenant);
					}
				} else if (opts.includeEmbeddings) {
					await this.saveEmbeddingData(doc.id, chunks, embeddingModelName, tenant);
				}

				await this.persistDeferredStateAfterIndex(doc, tenant, opts, vectorCompleted);

				if (opts.incrementIndexState) {
					await this.updateIndexState(tenant);
				}
			});
			await this.crud.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_INDEX_DOC);
			sw.stop();
		} catch (error) {
			console.error(`[IndexService] Error indexing document:`, {
				docPath,
				message: (error as Error).message ?? undefined,
				stack: (error as Error).stack ?? undefined,
			});
		} finally {
			sw.print();
		}
	}

	/**
	 * When fast index skips LLM, restore prior LLM-derived fields from DB for graph + upsert.
	 */
	private applyDocumentMergeForIndex(
		doc: Document,
		existing: IndexedDocumentRecord | null,
		opts: IndexDocumentOptions,
	): Document {
		if (!existing || !opts.preserveExistingLlmDataWhenSkipped) {
			return doc;
		}
		const merged: Document = {
			...doc,
			metadata: { ...doc.metadata },
		};
		if (!opts.includeLlmSummary) {
			if (existing.summary !== undefined) {
				merged.summary = existing.summary;
			}
			if (existing.full_summary !== undefined) {
				merged.fullSummary = existing.full_summary;
			}
		}
		if (!opts.includeLlmTags && existing.tags) {
			const blob = decodeIndexedTagsBlob(existing.tags);
			merged.metadata.topicTags = blob.topicTags;
			if (blob.topicTagEntries?.length) {
				merged.metadata.topicTagEntries = blob.topicTagEntries;
			} else {
				delete merged.metadata.topicTagEntries;
			}
			merged.metadata.functionalTagEntries = blob.functionalTagEntries;
			merged.metadata.timeTags = blob.timeTags;
			merged.metadata.geoTags = blob.geoTags;
			merged.metadata.personTags = blob.personTags;
			if (existing.infer_created_at != null) {
				merged.metadata.inferCreatedAt = existing.infer_created_at;
			}
		}
		return merged;
	}

	/**
	 * Updates deferred LLM/vector enrichment markers in `attributes_json` after a successful index transaction.
	 */
	private async persistDeferredStateAfterIndex(
		doc: Document,
		tenant: IndexTenant,
		opts: IndexDocumentOptions,
		vectorCompleted: boolean,
	): Promise<void> {
		const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const hash = doc.contentHash ?? null;
		const now = Date.now();
		const functionalCount = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).length;
		const functionalStatus =
			!opts.includeLlmTags
				? ('pending' as const)
				: functionalCount > 0
					? ('success' as const)
					: ('failed' as const);

		const skippedAnyLlm = !opts.includeLlmTags || !opts.includeLlmSummary;
		if (opts.markLlmPendingWhenSkipped && skippedAnyLlm) {
			await repo.mergeDocumentLlmState(doc.id, {
				llm_pending: true,
				llm_pending_reason: opts.reason,
				functional_tags_status: 'pending',
			});
		} else {
			const patch: {
				llm_pending: boolean;
				llm_pending_reason: string | null;
				llm_tags_source_hash?: string | null;
				llm_summary_source_hash?: string | null;
				llm_tags_generated_at?: number | null;
				llm_summary_generated_at?: number | null;
				functional_tags_status?: 'pending' | 'failed' | 'success-empty' | 'success';
			} = {
				llm_pending: false,
				llm_pending_reason: null,
				functional_tags_status: functionalStatus,
			};
			if (opts.includeLlmTags) {
				patch.llm_tags_source_hash = hash;
				patch.llm_tags_generated_at = now;
			}
			if (opts.includeLlmSummary) {
				patch.llm_summary_source_hash = hash;
				patch.llm_summary_generated_at = now;
			}
			if (opts.includeLlmTags || opts.includeLlmSummary) {
				await repo.mergeDocumentLlmState(doc.id, patch);
			}
		}

		if (opts.markVectorPendingWhenSkipped && !opts.includeEmbeddings) {
			await repo.mergeDocumentVectorState(doc.id, {
				vector_pending: true,
				vector_pending_reason: opts.reason,
			});
		} else if (opts.includeEmbeddings && vectorCompleted) {
			await repo.mergeDocumentVectorState(doc.id, {
				vector_pending: false,
				vector_pending_reason: null,
				vector_source_hash: hash,
				vector_generated_at: now,
			});
		} else if (opts.includeEmbeddings) {
			await repo.mergeDocumentVectorState(doc.id, {
				vector_pending: true,
				vector_pending_reason: opts.reason,
			});
		}
	}

	/**
	 * Stable node_id for a vault path: reuse existing indexed document on `mobius_node`, else allocate.
	 * First tries path-stable id; on collision, one fallback using path + timestamp seed.
	 */
	private async resolveDocumentNodeId(path: string, tenant: IndexTenant): Promise<string> {
		const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const existing = await mobiusRepo.getByPath(path);
		if (existing && isIndexedNoteNodeType(existing.type)) {
			return existing.node_id;
		}

		const tryCandidate = async (candidate: string): Promise<string | null> => {
			const row = await mobiusRepo.getByNodeId(candidate);
			if (!row) return candidate;
			if (row.path === path && isIndexedNoteNodeType(row.type)) return candidate;
			return null;
		};

		const primary = generateDocIdFromPath(path);
		const first = await tryCandidate(primary);
		if (first !== null) return first;

		const ts = Date.now();
		const fallback = stableDocumentNodeIdTimeFallback(path, ts);
		const second = await tryCandidate(fallback);
		if (second !== null) return second;

		throw new Error(`[IndexService] Failed to allocate document node id for path: ${path}`);
	}

	/**
	 * Generate embeddings for chunks and fill them into chunk objects.
	 * 
	 * @param chunks - Chunks to generate embeddings for
	 * @param embeddingModel - Embedding model configuration (provider and modelId)
	 */
	private async generateAndFillEmbeddings(
		chunks: Chunk[],
		embeddingModel: { provider: string; modelId: string },
	): Promise<void> {
		if (!chunks.length) return;

		try {
			// Generate embeddings using MultiProviderChatService from AIServiceManager
			const multiProviderChatService = this.aiServiceManager.getMultiChat();
			const embeddings = await multiProviderChatService.generateEmbeddings(
				chunks.map(chunk => chunk.content),
				embeddingModel.modelId,
				embeddingModel.provider,
			);

			// Fill embeddings into chunk.embedding fields
			for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
				chunks[i].embedding = embeddings[i];
			}
		} catch (error) {
			const maxChunk = chunks.reduce<Chunk | null>((acc, chunk) => {
				if (!acc) return chunk;
				return (chunk.content?.length ?? 0) > (acc.content?.length ?? 0) ? chunk : acc;
			}, null);
			console.error(`[IndexService] Failed to generate embeddings:`, {
				error,
				chunkCount: chunks.length,
				maxChunkLen: maxChunk?.content?.length ?? 0,
				maxChunkType: maxChunk?.chunkType ?? 'unknown',
				maxChunkIndex: maxChunk?.chunkIndex ?? -1,
			});
			// Continue without embeddings rather than failing the entire indexing
		}
	}

	/**
	 * Load persisted doc chunks so vector-enrich pass can run without re-chunking.
	 */
	private async loadPersistedChunksForEmbedding(docId: string, tenant: IndexTenant): Promise<Chunk[]> {
		const kdb = sqliteStoreManager.getIndexContext(tenant);
		const rows = await kdb
			.selectFrom('doc_chunk')
			.select(['chunk_id', 'chunk_index', 'chunk_type', 'title', 'content_raw'])
			.where('doc_id', '=', docId)
			.orderBy('chunk_index', 'asc')
			.execute();
		return rows.map((r) => ({
			docId,
			chunkType: r.chunk_type as Chunk['chunkType'],
			content: r.content_raw ?? '',
			chunkId: r.chunk_id,
			chunkIndex: r.chunk_index ?? 0,
			title: r.title ?? undefined,
		}));
	}

	/**
	 * Save chunk and FTS data to database. Embeddings are handled by {@link saveEmbeddingData}.
	 */
	private async saveChunkAndFtsData(
		docId: string,
		path: string,
		title: string,
		chunks: Chunk[],
		tenant: IndexTenant = 'vault',
	): Promise<void> {
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
		const now = Date.now();

		// Delete existing FTS and doc_chunk rows for this doc.
		docChunkRepo.deleteFtsByDocId(docId);
		docChunkRepo.deleteMetaFtsByDocId(docId);
		await docChunkRepo.deleteByDocId(docId);

		// Save meta FTS (title/path) - once per document
		const normTitle = normalizeTextForFts(title ?? '');
		docChunkRepo.insertMetaFts({
			doc_id: docId,
			path: path,
			title: normTitle,
		});

		// Save doc_chunk and FTS.
		for (const chunk of chunks) {
			const chunkId = chunk.chunkId ?? generateUuidWithoutHyphens();
			chunk.chunkId = chunkId;
			const chunkIndex = Number(chunk.chunkIndex ?? 0);
			const normContent = normalizeTextForFts(chunk.content ?? '');
			const metaJson =
				chunk.chunkMeta && Object.keys(chunk.chunkMeta).length > 0
					? JSON.stringify(chunk.chunkMeta)
					: null;

			await docChunkRepo.upsertChunk({
				chunk_id: chunkId,
				doc_id: docId,
				chunk_index: chunkIndex,
				chunk_type: chunk.chunkType,
				chunk_meta_json: metaJson,
				title: chunk.title ?? null,
				mtime: now,
				content_raw: chunk.content ?? null,
				content_fts_norm: normContent,
			});

			docChunkRepo.insertFts({
				chunk_id: chunkId,
				doc_id: docId,
				content: normContent,
			});
		}
	}

	/**
	 * Save embeddings only. Existing rows for the doc are replaced to avoid stale vectors.
	 */
	private async saveEmbeddingData(
		docId: string,
		chunks: Chunk[],
		embeddingModel?: string,
		tenant: IndexTenant = 'vault',
	): Promise<void> {
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
		const now = Date.now();
		await embeddingRepo.deleteByDocIds([docId]);
		for (const chunk of chunks) {
			if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0 || !chunk.chunkId) continue;
			await embeddingRepo.upsert({
				id: chunk.chunkId,
				doc_id: docId,
				chunk_id: chunk.chunkId,
				chunk_index: Number(chunk.chunkIndex ?? 0),
				chunk_type: chunk.chunkType,
				content_hash: '',
				ctime: now,
				mtime: now,
				embedding: chunk.embedding,
				embedding_model: embeddingModel ?? 'unknown',
				embedding_len: chunk.embedding.length,
			});
		}
	}

	private async clearEmbeddingsForDoc(docId: string, tenant: IndexTenant): Promise<void> {
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
		await embeddingRepo.deleteByDocIds([docId]);
	}

	/**
	 * Computes word/char counts and timestamps for the document row on `mobius_node`.
	 */
	private computeDocumentStatistics(doc: Document): {
		word_count: number | null;
		char_count: number | null;
		last_open_ts: number;
		row_updated_at: number;
	} {
		const content = doc.sourceFileInfo.content ?? '';
		const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
		const charCount = content.length;

		const fm = doc.metadata.frontmatter;
		const fromFmUpdated =
			parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updatedAt]) ??
			parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updated]);
		const updatedAt =
			fromFmUpdated !== undefined
				? fromFmUpdated
				: (doc.sourceFileInfo.ctime ?? doc.sourceFileInfo.mtime ?? Date.now());

		return {
			word_count: wordCount > 0 ? wordCount : null,
			char_count: charCount > 0 ? charCount : null,
			last_open_ts: updatedAt,
			row_updated_at: updatedAt,
		};
	}

	/**
	 * `mobius_node.type` for indexed notes: `hub_doc` for everything under `{root}/Hub-Summaries`
	 * (including auto `Hub-*.md` and user `Manual/*.md`).
	 */
	private resolveMobiusGraphNodeTypeForPath(path: string): GraphNodeType {
		const hub = getAIHubSummaryFolder();
		if (hub && isVaultPathUnderPrefix(path, hub)) return GraphNodeType.HubDoc;
		return GraphNodeType.Document;
	}

	/**
	 * Upserts the indexed document row on `mobius_node` via IndexedDocumentRepo (document or hub_doc; stats columns).
	 * When LLM tags/summary are skipped but preserved, omits those columns so {@link IndexedDocumentRepo.upsert} keeps DB values.
	 */
	private async upsertIndexedDocument(
		doc: Document,
		tenant: IndexTenant,
		opts: IndexDocumentOptions,
		existing: IndexedDocumentRecord | null,
	): Promise<void> {
		const startTime = Date.now();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const stats = this.computeDocumentStatistics(doc);
		const llmInferCreated = doc.metadata.inferCreatedAt;

		const tagsJson = opts.includeLlmTags
			? encodeIndexedTagsBlob({
				topicTags: doc.metadata.topicTags ?? [],
				topicTagEntries: doc.metadata.topicTagEntries,
				functionalTagEntries: doc.metadata.functionalTagEntries ?? [],
				keywordTags: doc.metadata.keywordTags ?? [],
				...(doc.metadata.userKeywordTags !== undefined
					? { userKeywordTags: doc.metadata.userKeywordTags }
					: {}),
				...(doc.metadata.textrankKeywordTerms?.length
					? { textrankKeywordTerms: doc.metadata.textrankKeywordTerms }
					: {}),
				timeTags: doc.metadata.timeTags ?? [],
				geoTags: doc.metadata.geoTags ?? [],
				personTags: doc.metadata.personTags ?? [],
			})
			: encodeIndexedTagsBlob(
				mergeIndexedTagsBlobForFastIndex(existing?.tags ?? null, {
					keywordTags: doc.metadata.keywordTags ?? [],
					userKeywordTags: doc.metadata.userKeywordTags,
					textrankKeywordTerms: doc.metadata.textrankKeywordTerms,
				}),
			);

		const payload: Partial<IndexedDocumentRecord> & {
			id: string;
			path: string;
			mobiusGraphNodeType?: GraphNodeType;
		} = {
			id: doc.id,
			path: doc.sourceFileInfo.path,
			type: doc.type,
			title: doc.metadata.title ?? doc.id,
			mtime: doc.sourceFileInfo.mtime ?? 0,
			size: doc.sourceFileInfo.size ?? null,
			ctime: doc.sourceFileInfo.ctime ?? null,
			content_hash: doc.contentHash ?? null,
			tags: tagsJson,
			word_count: stats.word_count,
			char_count: stats.char_count,
			last_open_ts: stats.last_open_ts,
			row_updated_at: stats.row_updated_at,
			mobiusGraphNodeType: this.resolveMobiusGraphNodeTypeForPath(doc.sourceFileInfo.path),
		};

		if (opts.includeLlmSummary) {
			payload.summary = doc.summary ?? null;
			payload.full_summary = doc.fullSummary ?? null;
		} else if (!opts.preserveExistingLlmDataWhenSkipped || !existing) {
			payload.summary = doc.summary ?? null;
			payload.full_summary = doc.fullSummary ?? null;
		}

		if (typeof llmInferCreated === 'number' && Number.isFinite(llmInferCreated)) {
			payload.infer_created_at = llmInferCreated;
		}

		try {
			await indexedDocumentRepo.upsert(payload as Parameters<typeof indexedDocumentRepo.upsert>[0]);
			const elapsed = Date.now() - startTime;
			if (elapsed > 100) {
				console.warn(`[IndexService] upsertIndexedDocument took ${elapsed}ms for ${doc.sourceFileInfo.path}`);
			}
		} catch (error) {
			console.error(`[IndexService] Error upserting indexed document for ${doc.sourceFileInfo.path}:`, error);
			throw error;
		}
	}

	/**
	 * Update index state (document count and build timestamp).
	 */
	private async updateIndexState(tenant: IndexTenant = 'vault'): Promise<void> {
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
		const now = Date.now();

		const indexedCount = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
		const newCount = Number(indexedCount ?? 0) + 1;
		await indexStateRepo.set(INDEX_STATE_KEYS.indexedDocs, String(newCount));
		await indexStateRepo.set(INDEX_STATE_KEYS.builtAt, String(now));
	}

	/**
	 * Batch-load indexed document id + title for outgoing link targets that omit `docId`, so edges use the same node id as the DB (e.g. after path collision handling / renames).
	 */
	private async loadPathToIndexedDocInfoMap(
		tenant: IndexTenant,
		sameTenantOutgoing: DocumentReference[],
	): Promise<Map<string, PathIndexedDocInfo>> {
		const paths = [...new Set(sameTenantOutgoing.filter((r) => !r.docId).map((r) => r.fullPath))];
		if (paths.length === 0) return new Map();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const byPath = await indexedDocumentRepo.getByPaths(paths);
		const out = new Map<string, PathIndexedDocInfo>();
		for (const p of paths) {
			const row = byPath.get(p);
			if (row) out.set(p, { id: row.id, title: row.title });
		}
		return out;
	}

	/**
	 * Loads indexed rows for all resolved outgoing target node ids (covers refs with `docId` and path-based resolution).
	 */
	private async loadIndexedRecordsForOutgoingTargets(
		tenant: IndexTenant,
		pathMap: Map<string, PathIndexedDocInfo>,
		sameTenantOutgoing: DocumentReference[],
	): Promise<Map<string, IndexedDocumentRecord>> {
		const ids = new Set<string>();
		for (const ref of sameTenantOutgoing) {
			ids.add(this.resolveOutgoingTargetNodeId(ref, pathMap));
		}
		if (ids.size === 0) return new Map();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const rows = await indexedDocumentRepo.getByIds([...ids]);
		return new Map(rows.map((r) => [r.id, r]));
	}

	/** Resolves Mobius document node id for an outgoing reference (parser id, indexed row, or path-stable fallback). */
	private resolveOutgoingTargetNodeId(ref: DocumentReference, pathMap: Map<string, PathIndexedDocInfo>): string {
		return ref.docId ?? pathMap.get(ref.fullPath)?.id ?? generateDocIdFromPath(ref.fullPath);
	}

	/**
	 * Keeps only refs whose target path is indexed in the same tenant DB as the source document.
	 * Cross-tenant wiki links are ignored (no cross-DB reference edges or placeholder nodes).
	 */
	private filterOutgoingRefsForTenant(outgoing: DocumentReference[], tenant: IndexTenant): DocumentReference[] {
		return outgoing.filter((r) => getIndexTenantForPath(r.fullPath) === tenant);
	}

	/**
	 * Upserts tag nodes (topic / functional / keyword) and ref edges for this document. The document `mobius_node` row is written only by {@link upsertIndexedDocument}.
	 * When `includeLlmTagEdges` is false, only reference edges and keyword tag edges are refreshed (LLM topic/functional/context edges are left as-is).
	 */
	private async upsertGraphEdgesForDocument(
		doc: Document,
		tenant: IndexTenant,
		pathMap: Map<string, PathIndexedDocInfo>,
		indexedByTargetId: Map<string, IndexedDocumentRecord>,
		sameTenantOutgoing: DocumentReference[],
		includeLlmTagEdges: boolean,
	): Promise<void> {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

		const docNodeId = doc.id;
		const lcaMax = INDEX_LONG_RANGE_LCA_MAX_DEPTH;
		const sourcePath = doc.sourceFileInfo.path;

		// Replace all reference edges from this doc so removed links do not linger stale.
		await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, GraphEdgeType.References);

		// Outgoing references (links from this document to other documents in the same tenant DB)
		for (const ref of sameTenantOutgoing) {
			const targetNodeId = this.resolveOutgoingTargetNodeId(ref, pathMap);
			const fallbackLabel = getFileNameFromPath(ref.fullPath);
			const indexed = indexedByTargetId.get(targetNodeId);
			const label = indexed?.title?.trim() ? indexed.title.trim() : fallbackLabel;

			// Ensure target document node exists (it will be created/updated when that document is indexed)
			await mobiusNodeRepo.upsert({
				id: targetNodeId,
				type: GraphNodeType.Document,
				label,
				attributes: JSON.stringify({ path: ref.fullPath }),
			});
			const lcaDepth = pathLcaDepth(sourcePath, ref.fullPath);
			const crosses = crossesTopLevelFolder(sourcePath, ref.fullPath);
			const longRange = crosses && lcaDepth <= lcaMax;
			await mobiusEdgeRepo.upsert({
				id: MobiusEdgeRepo.generateEdgeId(docNodeId, targetNodeId, GraphEdgeType.References),
				from_node_id: docNodeId,
				to_node_id: targetNodeId,
				type: GraphEdgeType.References,
				weight: 1.0,
				attributes: JSON.stringify({ longRange, lcaDepth }),
			});
		}

		if (includeLlmTagEdges) {
			for (const t of [
				GraphEdgeType.TaggedTopic,
				GraphEdgeType.TaggedFunctional,
				GraphEdgeType.TaggedContext,
			]) {
				await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, t);
			}
		}
		await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, GraphEdgeType.TaggedKeyword);

		const functionalSanitized = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []);

		if (includeLlmTagEdges) {
			const topicItems =
				doc.metadata.topicTagEntries?.length
					? doc.metadata.topicTagEntries
					: (doc.metadata.topicTags ?? []).map((id) => ({ id }));
			await upsertDocumentTagEdges(tenant, docNodeId, {
				nodeType: GraphNodeType.TopicTag,
				items: topicItems,
			});

			await upsertDocumentTagEdges(tenant, docNodeId, {
				nodeType: GraphNodeType.FunctionalTag,
				items: functionalSanitized,
			});

			const contextTriples: Array<{ axis: 'time' | 'geo' | 'person'; label: string }> = [
				...(doc.metadata.timeTags ?? []).map((label) => ({ axis: 'time' as const, label })),
				...(doc.metadata.geoTags ?? []).map((label) => ({ axis: 'geo' as const, label })),
				...(doc.metadata.personTags ?? []).map((label) => ({ axis: 'person' as const, label })),
			];
			await upsertDocumentTagEdges(tenant, docNodeId, {
				nodeType: GraphNodeType.ContextTag,
				items: contextTriples,
			});
		}

		await upsertDocumentTagEdges(tenant, docNodeId, {
			nodeType: GraphNodeType.KeywordTag,
			items: graphKeywordTagsForMobius(doc.metadata),
		});
	}

	/**
	 * Adds folder hierarchy `contains` edges (Folder nodes → child folder or document).
	 */
	private async upsertFolderContainsEdgesForDocument(doc: Document, tenant: IndexTenant): Promise<void> {
		const path = doc.sourceFileInfo.path;
		const parts = pathSegments(path);
		if (parts.length < 2) {
			return;
		}

		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const now = Date.now();

		for (let i = 0; i < parts.length - 1; i++) {
			const folderPath = parts.slice(0, i + 1).join('/');
			const folderId = stableMobiusFolderNodeId(tenant, folderPath);
			const label = parts[i] ?? folderPath;
			await mobiusNodeRepo.upsert({
				id: folderId,
				type: GraphNodeType.Folder,
				label,
				attributes: JSON.stringify({ path: folderPath }),
				created_at: now,
				updated_at: now,
			});

			if (i > 0) {
				const parentFolderPath = parts.slice(0, i).join('/');
				const parentId = stableMobiusFolderNodeId(tenant, parentFolderPath);
				await mobiusEdgeRepo.upsert({
					id: MobiusEdgeRepo.generateEdgeId(parentId, folderId, GraphEdgeType.Contains),
					from_node_id: parentId,
					to_node_id: folderId,
					type: GraphEdgeType.Contains,
					weight: 1.0,
					attributes: JSON.stringify({}),
				});
			}
		}

		const lastFolderPath = parts.slice(0, -1).join('/');
		const lastFolderId = stableMobiusFolderNodeId(tenant, lastFolderPath);
		await mobiusEdgeRepo.upsert({
			id: MobiusEdgeRepo.generateEdgeId(lastFolderId, doc.id, GraphEdgeType.Contains),
			from_node_id: lastFolderId,
			to_node_id: doc.id,
			type: GraphEdgeType.Contains,
			weight: 1.0,
			attributes: JSON.stringify({}),
		});
	}

	/**
	 * After edges are written: set this doc's outgoing counts from the parsed graph, recompute incoming for this doc and linked doc nodes, refresh tag_doc_count for touched tags.
	 */
	private async refreshMobiusAggregatesForIndexedDocument(
		doc: Document,
		tenant: IndexTenant,
		pathMap: Map<string, PathIndexedDocInfo>,
		sameTenantOutgoing: DocumentReference[],
	): Promise<void> {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const now = Date.now();

		/**
		 * Outgoing reference and tagged edges, matching {@link upsertGraphEdgesForDocument}.
		 */
		const docOutgoing = sameTenantOutgoing.length;
		const functionalN = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).length;
		const ctxN =
			(doc.metadata.timeTags ?? []).length +
			(doc.metadata.geoTags ?? []).length +
			(doc.metadata.personTags ?? []).length;
		const otherOutgoing =
			(doc.metadata.topicTags ?? []).length + functionalN + (doc.metadata.keywordTags ?? []).length + ctxN;
		const outgoing = { doc_outgoing_cnt: docOutgoing, other_outgoing_cnt: otherOutgoing };
		await mobiusNodeRepo.setDocumentOutgoingDegreeCounts(
			doc.id,
			outgoing.doc_outgoing_cnt,
			outgoing.other_outgoing_cnt,
			now,
		);

		/**
		 * refresh document incoming degrees for this doc and linked doc nodes
		 */
		const docIdsForIncoming = Array.from(
			new Set([
				doc.id,
				...sameTenantOutgoing.map((r) => this.resolveOutgoingTargetNodeId(r, pathMap)),
			]),
		);
		await mobiusNodeRepo.refreshDocumentIncomingDegreesForNodeIds(docIdsForIncoming, now);

		/**
		 * refresh tag_doc_count for touched tags
		 */
		const tagNodeIds = [
			...(doc.metadata.topicTags ?? []).map((t) => stableTopicTagNodeId(t)),
			...filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).map((e) =>
				stableFunctionalTagNodeId(e.id),
			),
			...graphKeywordTagsForMobius(doc.metadata).map((k) => stableKeywordTagNodeId(k)),
			...(doc.metadata.timeTags ?? []).map((label) => stableContextTagNodeId('time', label)),
			...(doc.metadata.geoTags ?? []).map((label) => stableContextTagNodeId('geo', label)),
			...(doc.metadata.personTags ?? []).map((label) => stableContextTagNodeId('person', label)),
		];
		if (tagNodeIds.length) {
			await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(tagNodeIds, now);
		}
	}
}

/**
 * Full Mobius maintenance: aggregates, reference PageRank, semantic edges, semantic PageRank, hub docs.
 */
class GlobalMaintenanceService {
	/** Clears debt after a successful full maintenance pass for the given tenants. */
	private async resetMaintenanceDebtAfterFullMaintenance(tenants: IndexTenant[]): Promise<void> {
		const now = Date.now();
		for (const tenant of tenants) {
			const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
			await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, '0');
			await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, '0');
			await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.lastFullAt, String(now));
		}
	}

	/**
	 * Full Mobius maintenance: aggregate columns, reference-graph PageRank, `semantic_related` rebuild, then weighted semantic PageRank.
	 */
	async runMobiusGlobalMaintenance(
		tenants: IndexTenant[] = ['vault', 'chat'],
		options?: MobiusGlobalMaintenanceOptions,
	): Promise<void> {
		const onProgress = options?.onProgress;
		const sw = new Stopwatch('[IndexService] runMobiusGlobalMaintenance');

		sw.start('mobius_aggregates');
		for (const tenant of tenants) {
			await this.refreshMobiusAggregatesInternal(tenant, onProgress);
		}
		sw.stop();

		sw.start('mobius_pagerank');
		for (const tenant of tenants) {
			await this.computeAndPersistVaultPageRankInternal(tenant, onProgress);
		}
		sw.stop();

		sw.start('semantic_related_edges');
		const semanticRebuildResults: RebuildSemanticEdgesBatchResult[] = [];
		for (const tenant of tenants) {
			const r = await SemanticRelatedEdgesRebuildService.rebuildForTenant(tenant, {
				onProgress: !onProgress ? undefined : (p) =>
					onProgress({
						tenant: p.tenant,
						phase: 'semantic_related',
						processed: p.processed,
						total: p.total,
					})
			});
			semanticRebuildResults.push(r);
			await yieldForLargePass();
		}
		sw.stop();

		sw.start('semantic_pagerank');
		for (let i = 0; i < tenants.length; i++) {
			const tenant = tenants[i]!;
			const rebuild = semanticRebuildResults[i];
			if (rebuild?.skipped) continue;
			await this.computeAndPersistSemanticPageRankInternal(tenant, onProgress);
		}
		sw.stop();

		if (tenants.includes('vault')) {
			sw.start('folder_hub_stats');
			await this.rebuildFolderHubStatsForVaultInternal(onProgress);
			sw.stop();
		}

		if (tenants.includes('vault')) {
			sw.start('hub_docs');
			await this.generateAndIndexHubDocsInternal(onProgress);
			sw.stop();
		}

		sw.print();
		await this.resetMaintenanceDebtAfterFullMaintenance(tenants);
	}

	private async generateAndIndexHubDocsInternal(
		onProgress?: (ev: MobiusGlobalMaintenanceProgress) => void,
	): Promise<void> {
		const ctx = AppContext.getInstance();
		const hub = new HubDocService(() => ctx.settings.search);
		await hub.generateAndIndexHubDocsForMaintenance({
			onProgress: (ev) => {
				onProgress?.({
					tenant: 'vault',
					phase: ev.phase,
					batchIndex: ev.batchIndex,
					idsInBatch: ev.idsInBatch,
				});
			},
		});
	}

	/**
	 * Rebuild tag_doc_count and document degree columns via **paged SQL** (keyset on `node_id`, LIMIT = {@link DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE}).
	 */
	private async refreshMobiusAggregatesInternal(
		tenant: IndexTenant,
		onProgress: ((ev: MobiusGlobalMaintenanceProgress) => void) | undefined,
	): Promise<void> {
		const now = Date.now();
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

		// tag count
		await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
			GRAPH_TAG_NODE_TYPES,
			DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
			async (ids, batchIndex) => {
				await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(ids, now);
				onProgress?.({
					tenant,
					phase: 'tag_doc_count',
					batchIndex,
					idsInBatch: ids.length,
				});
			},
			yieldForLargePass,
		);

		// document degree
		await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
			GRAPH_DOCUMENT_LIKE_NODE_TYPES,
			DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
			async (ids, batchIndex) => {
				await mobiusNodeRepo.refreshDocumentDegreesForNodeIds(ids, now);
				onProgress?.({
					tenant,
					phase: 'document_degrees',
					batchIndex,
					idsInBatch: ids.length,
				});
			},
			yieldForLargePass,
		);
	}

	/**
	 * Runs global PageRank on the directed **references** subgraph (wiki links between document-like nodes)
	 * and writes `pagerank` / `pagerank_updated_at` / `pagerank_version` on `mobius_node` (dedicated columns).
	 *
	 * **Why not load the whole graph into memory?** The math needs many iterations; each iteration
	 * re-scans `mobius_edge` in batches and only keeps O(N) state (ranks + out-degrees), not O(E) adjacency lists.
	 *
	 * **Out-degree source:** `doc_outgoing_cnt` on `mobius_node` — it counts reference edges to other
	 * document-like targets. This run should follow `refreshDocumentDegreesForNodeIds` in full maintenance
	 * so counts match the edges we scan.
	 */
	private async computeAndPersistVaultPageRankInternal(
		tenant: IndexTenant,
		onProgress: ((ev: MobiusGlobalMaintenanceProgress) => void) | undefined,
	): Promise<void> {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

		// One row per PageRank vertex: document / hub_doc, plus cached wiki-reference out-degree.
		const vertices = await mobiusNodeRepo.listDocLikePageRankVertices();
		const nodeIds = vertices.map((v) => v.node_id);
		// Parallel array to nodeIds[i]: used as denominator when spreading rank along outgoing edges.
		const outDeg = new Int32Array(vertices.length);
		for (let i = 0; i < vertices.length; i++) {
			outDeg[i] = vertices[i]!.doc_outgoing_cnt;
		}

		// Inside: repeated power iterations until L1 diff < tolerance (see helper). Each iteration calls
		// the callback below once to stream all reference edges.
		const scores = await computeVaultPageRankStreaming(
			nodeIds,
			outDeg,
			async (visit, iterIndex) => {
				let edgeBatchIndex = 0;
				// Full pass over references edges for this iteration; visit() feeds the PageRank kernel.
				for await (const batch of mobiusEdgeRepo.iterateReferenceEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
					for (const e of batch) {
						visit(e.from_node_id, e.to_node_id);
					}
					// Report edge-scan progress only on the first iteration — same UX as a single “load edges”
					// phase; later iterations would spam identical batch counts.
					if (iterIndex === 0) {
						onProgress?.({
							tenant,
							phase: 'pagerank_edges',
							batchIndex: edgeBatchIndex++,
							idsInBatch: batch.length,
						});
					}
					// Let the UI breathe: each batch can be large and iterations repeat many times.
					await yieldForLargePass();
				}
			},
		);

		const now = Date.now();
		const version = PAGERANK_ALGORITHM_VERSION;
		const persistChunk = 200;
		let n = 0;
		let persistBatchIndex = 0;

		// Persist PageRank scalars on `mobius_node` (not `attributes_json`). Chunk + yield for large vaults.
		for (const id of nodeIds) {
			const score = scores.get(id) ?? 0;
			await mobiusNodeRepo.setPageRankForDocLikeNode(
				id,
				{
					pagerank: score,
					pagerank_updated_at: now,
					pagerank_version: version,
				},
				now,
			);
			n++;
			if (n % persistChunk === 0) {
				onProgress?.({
					tenant,
					phase: 'pagerank_persist',
					batchIndex: persistBatchIndex++,
					idsInBatch: persistChunk,
				});
				await yieldForLargePass();
			}
		}
		// Final partial chunk (e.g. last 37 nodes when N mod 200 !== 0).
		const remainder = n % persistChunk;
		if (remainder > 0) {
			onProgress?.({
				tenant,
				phase: 'pagerank_persist',
				batchIndex: persistBatchIndex++,
				idsInBatch: remainder,
			});
		}
	}

	/**
	 * Weighted PageRank on `semantic_related` (edge weights = similarity). Runs after semantic edge rebuild.
	 */
	private async computeAndPersistSemanticPageRankInternal(
		tenant: IndexTenant,
		onProgress: ((ev: MobiusGlobalMaintenanceProgress) => void) | undefined,
	): Promise<void> {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const nodeIds = await mobiusNodeRepo.listDocLikeSemanticPageRankVertices();
		if (!nodeIds.length) return;

		const outgoingWeightSum = await accumulateSemanticOutgoingWeightSums(nodeIds, async (visit) => {
			for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
				for (const e of batch) {
					visit(e.from_node_id, e.to_node_id, e.weight);
				}
				await yieldForLargePass();
			}
		});

		const scores = await computeSemanticPageRankStreaming(
			nodeIds,
			outgoingWeightSum,
			async (visit, iterIndex) => {
				let edgeBatchIndex = 0;
				for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
					for (const e of batch) {
						visit(e.from_node_id, e.to_node_id, e.weight);
					}
					if (iterIndex === 0) {
						onProgress?.({
							tenant,
							phase: 'semantic_pagerank_edges',
							batchIndex: edgeBatchIndex++,
							idsInBatch: batch.length,
						});
					}
					await yieldForLargePass();
				}
			},
		);

		const now = Date.now();
		const version = SEMANTIC_PAGERANK_ALGORITHM_VERSION;
		const persistChunk = 200;
		let n = 0;
		let persistBatchIndex = 0;
		for (const id of nodeIds) {
			const score = scores.get(id) ?? 0;
			await mobiusNodeRepo.setSemanticPageRankForDocLikeNode(
				id,
				{
					semantic_pagerank: score,
					semantic_pagerank_updated_at: now,
					semantic_pagerank_version: version,
				},
				now,
			);
			n++;
			if (n % persistChunk === 0) {
				onProgress?.({
					tenant,
					phase: 'semantic_pagerank_persist',
					batchIndex: persistBatchIndex++,
					idsInBatch: persistChunk,
				});
				await yieldForLargePass();
			}
		}
		const remainder = n % persistChunk;
		if (remainder > 0) {
			onProgress?.({
				tenant,
				phase: 'semantic_pagerank_persist',
				batchIndex: persistBatchIndex++,
				idsInBatch: remainder,
			});
		}
	}

	/**
	 * Rolls up document PageRank / degrees into materialized columns on `folder` nodes (vault only).
	 * Must run after reference + semantic PageRank are persisted on documents.
	 */
	private async rebuildFolderHubStatsForVaultInternal(
		onProgress: ((ev: MobiusGlobalMaintenanceProgress) => void) | undefined,
	): Promise<void> {
		const tenant: IndexTenant = 'vault';
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const now = Date.now();
		await mobiusNodeRepo.clearFolderHubMaterializedStatsColumns(now);

		const hubFolder = getAIHubSummaryFolder();
		type Agg = { count: number; sumPr: number; sumSpr: number; maxInc: number; maxOut: number };
		const byFolder = new Map<string, Agg>();

		let afterNodeId: string | null = null;
		let docPageIndex = 0;
		for (; ;) {
			const page = await mobiusNodeRepo.listDocumentRowsForFolderHubStatsKeyset(
				afterNodeId,
				FOLDER_HUB_STATS_DOC_PAGE_SIZE,
				hubFolder,
			);
			if (!page.length) break;

			for (const r of page) {
				const path = r.path ?? '';
				if (!path) continue;

				const pr = typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0;
				const spr =
					typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
						? r.semantic_pagerank
						: 0;
				const inc = Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0)));
				const outd = Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)));

				let cur = path;
				for (; ;) {
					const slash = cur.lastIndexOf('/');
					if (slash <= 0) break;
					const folder = cur.slice(0, slash);
					if (hubFolder && isVaultPathUnderPrefix(folder, hubFolder)) break;

					let agg = byFolder.get(folder);
					if (!agg) {
						agg = { count: 0, sumPr: 0, sumSpr: 0, maxInc: 0, maxOut: 0 };
						byFolder.set(folder, agg);
					}
					agg.count += 1;
					agg.sumPr += pr;
					agg.sumSpr += spr;
					agg.maxInc = Math.max(agg.maxInc, inc);
					agg.maxOut = Math.max(agg.maxOut, outd);
					cur = folder;
				}
			}

			afterNodeId = page[page.length - 1]!.node_id;
			onProgress?.({
				tenant,
				phase: 'folder_hub_stats',
				batchIndex: docPageIndex++,
				idsInBatch: page.length,
			});
			await yieldForLargePass();
		}

		const writeAt = Date.now();
		let folderWriteIndex = 0;
		for (const [folderPath, agg] of byFolder) {
			const nodeId = stableMobiusFolderNodeId(tenant, folderPath);
			const n = agg.count;
			const avgPr = agg.sumPr / Math.max(1, n);
			const avgSpr = agg.sumSpr / Math.max(1, n);
			await mobiusNodeRepo.updateFolderNodeHubMaterializedStats(
				nodeId,
				{
					tagDocCount: n,
					avgPagerank: avgPr,
					avgSemanticPagerank: avgSpr,
					maxDocIncoming: agg.maxInc,
					maxDocOutgoing: agg.maxOut,
				},
				writeAt,
			);
			folderWriteIndex++;
			if (folderWriteIndex % 150 === 0) {
				await yieldForLargePass();
			}
		}
	}
}

/** Batched deferred enrichment: LLM tags/summary after fast index (`llm_pending`). */
export type LlmIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
};

/** Batched deferred enrichment: vector embeddings after fast index (`vector_pending`). */
export type VectorIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
};

/** Progress for pending vector enrichment loops. */
export type PendingEnrichmentProgress = {
	processed: number;
	total: number;
	path: string;
};

export type { PendingLlmEnrichmentProgress } from '@/service/search/support/llm-enrichment-progress-tracker';

/**
 * Public facade: single entry for indexing, CRUD, and global Mobius maintenance.
 * Delegates to {@link IndexSingleService}, {@link IndexCrudService}, {@link GlobalMaintenanceService}.
 */
export class IndexService {
	private static instance: IndexService | null = null;
	private static isIndexingCancelled = false;
	private aiServiceManager: AIServiceManager | undefined;
	private readonly crud = new IndexCrudService();
	private single: IndexSingleService | null = null;
	private readonly globalMaintenance = new GlobalMaintenanceService();

	private constructor() {
		// Private constructor to prevent direct instantiation.
	}

	private ensureSingle(): IndexSingleService {
		if (!this.aiServiceManager) {
			throw new Error('[IndexService] init(AIServiceManager) must be called before indexing');
		}
		if (!this.single) {
			this.single = new IndexSingleService(this.aiServiceManager, this.crud);
		}
		return this.single;
	}

	static getInstance(): IndexService {
		if (!IndexService.instance) {
			IndexService.instance = new IndexService();
		}
		return IndexService.instance;
	}

	/**
	 * Clear the global singleton instance.
	 * Call from plugin onunload to release memory.
	 */
	static clearInstance(): void {
		IndexService.instance = null;
	}

	/**
	 * Initialize IndexService with AIServiceManager for embedding generation.
	 * This should be called once during plugin initialization in main.ts.
	 * Can also be called when settings are updated to refresh the service instance.
	 */
	init(aiServiceManager: AIServiceManager): void {
		this.aiServiceManager = aiServiceManager;
		this.single = new IndexSingleService(aiServiceManager, this.crud);
	}

	/** Cancel ongoing indexing operations. */
	static cancelIndexing(): void {
		IndexService.isIndexingCancelled = true;
	}

	/** Reset the cancellation flag. */
	static resetCancellation(): void {
		IndexService.isIndexingCancelled = false;
	}

	/** Check if indexing has been cancelled. */
	static isCancelled(): boolean {
		return IndexService.isIndexingCancelled;
	}

	async indexDocument(
		docPath: string,
		settings: SearchSettings,
		indexOptions?: IndexDocumentOptions,
		/**
		 * When set, skip loader read; must be the same vault path as the indexed `docPath` (normalized).
		 * Avoids repeated read + duplicate LLM work when the caller already loaded the document.
		 */
		preloadedDocument?: Document,
	): Promise<void> {
		return this.ensureSingle().indexDocument(docPath, settings, indexOptions, preloadedDocument);
	}

	async deleteDocuments(
		paths: string[],
		onAfterMutation?: (types: StorageType[]) => void,
	): Promise<void> {
		return this.crud.deleteDocuments(paths, onAfterMutation);
	}

	async clearAllIndexData(onAfterMutation?: (types: StorageType[]) => void): Promise<void> {
		return this.crud.clearAllIndexData(onAfterMutation);
	}

	async cleanupOrphanedSearchIndexData(): Promise<{
		metaFts: number;
		fts: number;
		chunks: number;
		embeddings: number;
		stats: number;
		graphNodes: number;
	}> {
		return this.crud.cleanupOrphanedSearchIndexData();
	}

	async getIndexStatus(): Promise<GetIndexStatusResponse> {
		return this.crud.getIndexStatus();
	}

	async renameDocumentPath(oldPath: string, newPath: string): Promise<boolean> {
		return this.crud.renameDocumentPath(oldPath, newPath);
	}

	async isMobiusMaintenanceRecommended(): Promise<boolean> {
		return this.crud.isMobiusMaintenanceRecommended();
	}

	async runMobiusGlobalMaintenance(
		tenants: IndexTenant[] = ['vault', 'chat'],
		options?: MobiusGlobalMaintenanceOptions,
	): Promise<void> {
		return this.globalMaintenance.runMobiusGlobalMaintenance(tenants, options);
	}

	/**
	 * LLM tags + summary for documents marked `llm_pending` (fast index deferred enrichment).
	 * Does not bump global index_state; does not re-chunk unless options change.
	 */
	static async runPendingLlmIndexEnrichment(
		settings: SearchSettings,
		options?: { onProgress?: (ev: PendingLlmEnrichmentProgress) => void },
	): Promise<LlmIndexEnrichmentResult> {
		if (!sqliteStoreManager.isInitialized()) {
			return {
				processed: 0,
				skippedWrongTenant: 0,
				errors: [{ path: '', message: 'SQLite not initialized' }],
			};
		}

		const indexSvc = IndexService.getInstance();
		const baseOpts = defaultIndexDocumentOptions('llm_enrich_only');
		const tenants: IndexTenant[] = ['vault', 'chat'];
		let processed = 0;
		let skippedWrongTenant = 0;
		const errors: Array<{ path: string; message: string }> = [];

		const pendingPaths: string[] = [];
		for (const tenant of tenants) {
			const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const paths = await repo.listPathsWithPendingLlm();
			for (const path of paths) {
				if (getIndexTenantForPath(path) !== tenant) {
					skippedWrongTenant++;
					continue;
				}
				pendingPaths.push(path);
			}
		}
		const total = pendingPaths.length;
		let done = 0;
		const batchStartMs = Date.now();
		const ai = AppContext.getInstance().manager;
		const tracker = new LlmEnrichmentProgressTracker(settings, ai);
		const loaderMgr = DocumentLoaderManager.getInstance();

		const readMarkdownContentChars = async (path: string): Promise<number> => {
			const app = AppContext.getApp();
			const f = app.vault.getAbstractFileByPath(path);
			if (!f || !(f instanceof TFile)) return 0;
			const ext = f.extension.toLowerCase();
			if (ext !== 'md' && ext !== 'markdown') return 0;
			const content = await app.vault.cachedRead(f);
			return content.length;
		};

		/**
		 * After each path finishes: read indexed row from SQLite and log full summary/tags text (DevTools).
		 * Logs can be very large for long notes.
		 */
		const logPendingLlmEnrichmentDocComplete = async (params: {
			path: string;
			docType: string | null;
			status: 'success' | 'error';
			wallMs: number;
			usage: LLMUsage;
			costUsd: number;
			done: number;
			total: number;
			error?: unknown;
		}): Promise<void> => {
			const tenant = getIndexTenantForPath(params.path);
			const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const indexed = await repo.getByPath(params.path);
			const tok = normalizeUsageTokens(params.usage);
			console.debug('[IndexService] pending LLM enrichment doc complete', {
				path: params.path,
				docType: params.docType,
				tenant,
				status: params.status,
				done: params.done,
				total: params.total,
				wallMs: params.wallMs,
				inputTokens: tok.input,
				outputTokens: tok.output,
				totalTokens: tok.total,
				costUsd: params.costUsd,
				summary: indexed?.summary ?? null,
				fullSummary: indexed?.full_summary ?? null,
				tagsJson: JSON.parse(indexed?.tags ?? '{}') ?? null,
				inferCreatedAt: indexed?.infer_created_at ?? null,
				lastProcessedAt: indexed?.last_processed_at ?? null,
				error:
					params.error instanceof Error
						? params.error.message
						: params.error != null
							? String(params.error)
							: undefined,
			});
		};

		await mapWithConcurrency(pendingPaths, LLM_PENDING_ENRICH_CONCURRENCY, async (path) => {
			const docType = loaderMgr.getTypeForPath(path);
			let plan = tracker.emptyPlan();
			if (docType === 'markdown') {
				const chars = await readMarkdownContentChars(path);
				plan = await tracker.planForMarkdownDoc(chars);
			}

			/** Per-path ref so concurrent workers do not share telemetry state. */
			const llmTelemetry: { snapshot: { usage: LLMUsage; costUsd: number } | null } = {
				snapshot: null,
			};
			const onLlmIndexingComplete = (ev: LlmIndexingCompleteEvent) => {
				llmTelemetry.snapshot = { usage: ev.usage, costUsd: ev.costUsd };
			};

			const t0 = Date.now();
			try {
				await indexSvc.indexDocument(path, settings, {
					...baseOpts,
					onLlmIndexingComplete,
				});
				processed++;
				done++;
				const wallMs = Date.now() - t0;
				const snap = llmTelemetry.snapshot;
				const actual = {
					durationMs: wallMs,
					usage: snap?.usage ?? emptyUsage(),
					costUsd: snap?.costUsd ?? 0,
				};
				tracker.recordDocComplete(plan, actual);
				await logPendingLlmEnrichmentDocComplete({
					path,
					docType,
					status: 'success',
					wallMs,
					usage: actual.usage,
					costUsd: actual.costUsd,
					done,
					total,
				});
				options?.onProgress?.(
					tracker.snapshot({
						path,
						processed: done,
						total,
						batchStartMs,
						lastPlan: plan,
						lastActual: actual,
					}),
				);
			} catch (e) {
				errors.push({ path, message: (e as Error).message ?? String(e) });
				done++;
				const wallMs = Date.now() - t0;
				const snap = llmTelemetry.snapshot;
				const actual = {
					durationMs: wallMs,
					usage: snap?.usage ?? emptyUsage(),
					costUsd: snap?.costUsd ?? 0,
				};
				tracker.recordDocComplete(plan, actual);
				await logPendingLlmEnrichmentDocComplete({
					path,
					docType,
					status: 'error',
					wallMs,
					usage: actual.usage,
					costUsd: actual.costUsd,
					done,
					total,
					error: e,
				});
				options?.onProgress?.(
					tracker.snapshot({
						path,
						processed: done,
						total,
						batchStartMs,
						lastPlan: plan,
						lastActual: actual,
					}),
				);
			}
		});

		return { processed, skippedWrongTenant, errors };
	}

	/**
	 * Vector embeddings for documents marked `vector_pending`; uses persisted chunks, no core FTS re-pass.
	 */
	static async runPendingVectorIndexEnrichment(
		settings: SearchSettings,
		options?: { onProgress?: (ev: PendingEnrichmentProgress) => void },
	): Promise<VectorIndexEnrichmentResult> {
		if (!sqliteStoreManager.isInitialized()) {
			return {
				processed: 0,
				skippedWrongTenant: 0,
				errors: [{ path: '', message: 'SQLite not initialized' }],
			};
		}

		const index = IndexService.getInstance();
		const opts = defaultIndexDocumentOptions('vector_enrich_only');
		const tenants: IndexTenant[] = ['vault', 'chat'];
		let processed = 0;
		let skippedWrongTenant = 0;
		const errors: Array<{ path: string; message: string }> = [];

		const pendingPaths: string[] = [];
		for (const tenant of tenants) {
			const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
			const paths = await repo.listPathsWithPendingVector();
			for (const path of paths) {
				if (getIndexTenantForPath(path) !== tenant) {
					skippedWrongTenant++;
					continue;
				}
				pendingPaths.push(path);
			}
		}
		const total = pendingPaths.length;
		let done = 0;
		for (const path of pendingPaths) {
			try {
				await index.indexDocument(path, settings, opts);
				processed++;
				done++;
				options?.onProgress?.({ processed: done, total, path });
			} catch (e) {
				errors.push({ path, message: (e as Error).message ?? String(e) });
				done++;
				options?.onProgress?.({ processed: done, total, path });
			}
		}

		return { processed, skippedWrongTenant, errors };
	}
}
