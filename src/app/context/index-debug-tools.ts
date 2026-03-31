import { normalizePath } from 'obsidian';
import { GRAPH_TAGGED_EDGE_TYPES } from '@/core/po/graph.po';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import type { DocumentLoaderReadOptions } from '@/core/document/loader/types';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { createUint32Bitset, hasUint32Bit } from '@/core/utils/bit-util';
import type { IndexDocumentReason } from '@/service/search/index/types';
import { defaultIndexDocumentOptions, IndexService, getIndexTenantForPath } from '@/service/search/index/indexService';
import {
	HubCandidateDiscoveryService,
	buildHubDiscoverDocCoverageIndex,
	computeHubDiscoverBudgets,
	estimateCandidateCoverageBits,
} from '@/service/search/index/helper/hub/hubDiscover';
import { buildLocalHubGraphForPath } from '@/service/search/index/helper/hub/localGraphAssembler';
import {
	materializeHubDocFromCandidate,
	type MaterializeHubDocFromCandidateResult,
} from '@/service/search/index/helper/hub/hubDocServices';
import type {
	HubCandidate,
	HubClusterDiscoveryStats,
	HubDiscoverDocCoverageIndex,
	HubDiscoverRoundSummary,
} from '@/service/search/index/helper/hub/types';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import type { SearchSettings } from '@/app/settings/types';

function requireDb(): void {
	if (!sqliteStoreManager.isInitialized()) {
		throw new Error('[index-debug] SQLite is not initialized. Open the vault and wait for the plugin to finish loading.');
	}
}

/** DevTools `debugIndexDocument` mode → {@link IndexDocumentReason} for {@link defaultIndexDocumentOptions}. */
export type DebugIndexDocumentMode = 'core_fast' | 'vector_only' | 'llm_only' | 'manual_full';

const DEBUG_INDEX_MODE_TO_REASON: Record<DebugIndexDocumentMode, IndexDocumentReason> = {
	core_fast: 'listener_fast',
	vector_only: 'vector_enrich_only',
	llm_only: 'llm_enrich_only',
	manual_full: 'manual_full',
};

/**
 * Runs full hub discovery and collects the discovery summary (same pipeline as maintenance hub step).
 */
export async function debugRunHubDiscoverWithReport(options?: {
	tenant?: IndexTenant;
	onRoundComplete?: (summary: HubDiscoverRoundSummary) => void;
}): Promise<{
	candidates: HubCandidate[];
	roundSummaries: HubDiscoverRoundSummary[];
}> {
	const discovery = new HubCandidateDiscoveryService();
	const roundSummaries: HubDiscoverRoundSummary[] = [];
	const candidates = await discovery.discoverAllHubCandidates({
		tenant: options?.tenant ?? 'vault',
		onRoundComplete: (s) => {
			roundSummaries.push(s);
			options?.onRoundComplete?.(s);
		},
	});
	return { candidates, roundSummaries };
}

/**
 * Materialize one {@link HubCandidate} (same pipeline as maintenance: manual re-index, or Hub-*.md + index).
 * Pass `hubCandidatesForHubSet` from {@link debugRunHubDiscoverWithReport} for assembly parity with full maintenance.
 */
export async function debugMaterializeHubCandidate(
	candidate: HubCandidate,
	getSearchSettings: () => SearchSettings,
	options?: {
		hubPath?: string;
		hubNodeIdSet?: Set<string>;
		/** When set, builds `hubNodeIdSet` like maintenance (document + manual hub node ids). */
		hubCandidatesForHubSet?: HubCandidate[];
	},
): Promise<MaterializeHubDocFromCandidateResult> {
	requireDb();
	const searchSettings = getSearchSettings();
	const hubPath = options?.hubPath ?? getAIHubSummaryFolder();
	let hubNodeIdSet = options?.hubNodeIdSet;
	if (!hubNodeIdSet) {
		if (options?.hubCandidatesForHubSet?.length) {
			hubNodeIdSet = new Set(
				options.hubCandidatesForHubSet
					.filter((c) => c.sourceKind === 'document' || c.sourceKind === 'manual')
					.map((c) => c.nodeId),
			);
		} else {
			hubNodeIdSet = new Set(
				candidate.sourceKind === 'document' || candidate.sourceKind === 'manual' ? [candidate.nodeId] : [],
			);
		}
	}
	return materializeHubDocFromCandidate(candidate, {
		hubPath,
		hubNodeIdSet,
		searchSettings,
		indexService: IndexService.getInstance(),
	});
}

/** Precomputes per-candidate coverage bitsets (same semantics as greedy selection). */
async function debugBuildCandidateCoverageBits(
	tenant: IndexTenant,
	candidates: HubCandidate[],
): Promise<{
	docCoverageIndex: HubDiscoverDocCoverageIndex;
	bitsByStableKey: Map<string, Uint32Array>;
}> {
	const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
	const bitsByStableKey = new Map<string, Uint32Array>();
	for (const c of candidates) {
		bitsByStableKey.set(c.stableKey, await estimateCandidateCoverageBits(tenant, c, docCoverageIndex));
	}
	return { docCoverageIndex, bitsByStableKey };
}

/** Union coverage over the final hub candidate set (approximate document reach). */
async function computeUnionCoverageForHubCandidates(
	tenant: IndexTenant,
	candidates: HubCandidate[],
): Promise<{
	coveredNodeIds: Set<string>;
	documentCount: number;
	coveredCount: number;
	coverageRatio: number;
}> {
	const { docCoverageIndex, bitsByStableKey } = await debugBuildCandidateCoverageBits(tenant, candidates);
	const union = createUint32Bitset(docCoverageIndex.docCount);
	for (const bits of bitsByStableKey.values()) {
		for (let wi = 0; wi < union.length; wi++) {
			union[wi] |= bits[wi] ?? 0;
		}
	}
	let coveredCount = 0;
	const coveredNodeIds = new Set<string>();
	for (let o = 0; o < docCoverageIndex.docCount; o++) {
		if (hasUint32Bit(union, o)) {
			coveredCount++;
			coveredNodeIds.add(docCoverageIndex.nodeIdByOrdinal[o]!);
		}
	}
	const documentCount = docCoverageIndex.docCount;
	const coverageRatio = documentCount > 0 ? coveredCount / documentCount : 0;
	return { coveredNodeIds, documentCount, coveredCount, coverageRatio };
}

async function countChunksForDoc(tenant: IndexTenant, docId: string): Promise<number> {
	const kdb = sqliteStoreManager.getIndexContext(tenant);
	const r = await kdb
		.selectFrom('doc_chunk')
		.select((eb) => eb.fn.count<number>('chunk_id').as('c'))
		.where('doc_id', '=', docId)
		.executeTakeFirst();
	return Number(r?.c ?? 0);
}

async function countEmbeddingsForDoc(tenant: IndexTenant, docId: string): Promise<number> {
	const kdb = sqliteStoreManager.getIndexContext(tenant);
	const r = await kdb
		.selectFrom('embedding')
		.select((eb) => eb.fn.count<number>('id').as('c'))
		.where('doc_id', '=', docId)
		.executeTakeFirst();
	return Number(r?.c ?? 0);
}

async function countTaggedEdgesForDoc(tenant: IndexTenant, docId: string): Promise<number> {
	const kdb = sqliteStoreManager.getIndexContext(tenant);
	const r = await kdb
		.selectFrom('mobius_edge')
		.select((eb) => eb.fn.count<number>('id').as('c'))
		.where('type', 'in', [...GRAPH_TAGGED_EDGE_TYPES])
		.where((eb) => eb.or([eb('from_node_id', '=', docId), eb('to_node_id', '=', docId)]))
		.executeTakeFirst();
	return Number(r?.c ?? 0);
}

/** Incident edge counts grouped by `mobius_edge.type` for one document node. */
async function countEdgesByTypeForDoc(tenant: IndexTenant, docId: string): Promise<Record<string, number>> {
	const kdb = sqliteStoreManager.getIndexContext(tenant);
	const rows = await kdb
		.selectFrom('mobius_edge')
		.select((eb) => [eb.fn.count<number>('id').as('c'), 'type'])
		.where((eb) => eb.or([eb('from_node_id', '=', docId), eb('to_node_id', '=', docId)]))
		.groupBy('type')
		.execute();
	const out: Record<string, number> = {};
	for (const r of rows) {
		out[String(r.type)] = Number(r.c);
	}
	return out;
}

export type DebugDocumentSnapshotOptions = {
	/**
	 * When true, runs {@link debugExplainPathCoverage} (full hub discovery; can be very slow).
	 * Default false for fast DB-only snapshots.
	 */
	includeHubCoverage?: boolean;
	/** Max `doc_chunk` rows to sample with previews. Default 40. Set 0 to skip chunk samples. */
	chunkSampleLimit?: number;
	/** Max edges per reference/semantic sample list. Default 50. */
	edgeSampleLimit?: number;
};

export type DebugDocumentSnapshotResult = {
	path: string;
	tenant: IndexTenant;
	ok: boolean;
	elapsedMs: number;
	warnings: string[];
	error?: string;
	/** Indexed document row (`IndexedDocumentRepo`), when present. */
	indexed: {
		id: string;
		path: string;
		title: string | null;
		type: string | null;
		content_hash: string | null;
		mtime: number | null;
		last_processed_at: number | null;
	} | null;
	/** Short summary column + long-form fields from `attributes_json`. */
	summary: {
		short: string | null;
		full: string | null;
		hubTier: string | null;
		summaryGeneratedAt: number | null;
		headingSkeletonPreview: string | null;
	} | null;
	tags: ReturnType<typeof decodeIndexedTagsBlob> | null;
	docAttrs: {
		llmPending?: unknown;
		llmPendingReason?: unknown;
		vectorPending?: unknown;
		vectorPendingReason?: unknown;
		functionalTagsStatus?: unknown;
		llmTagsGeneratedAt?: unknown;
		llmSummaryGeneratedAt?: unknown;
		vectorGeneratedAt?: unknown;
		semanticOverlayPreview?: string | null;
		frontmatterPreview?: string | null;
	} | null;
	mobiusNodeType: string | null;
	counts: {
		chunk: number;
		embedding: number;
		taggedEdges: number;
		edgesByType: Record<string, number>;
	};
	graph: {
		docIncomingCnt: number | null;
		docOutgoingCnt: number | null;
		otherIncomingCnt: number | null;
		otherOutgoingCnt: number | null;
		pagerank: number | null;
		semanticPagerank: number | null;
		wordCount: number | null;
		charCount: number | null;
		referenceEdgesIncidentSampled: number;
		semanticEdgesIncidentSampled: number;
		referenceEdgesSample: Array<{ from_node_id: string; to_node_id: string }>;
		semanticEdgesSample: Array<{ from_node_id: string; to_node_id: string }>;
		taggedEdgesSample: Array<{
			id: string;
			from: string;
			to: string;
			type: string;
			weight: number | null;
			attrs: unknown;
		}>;
	};
	chunkSamples: Array<{
		chunkId: string;
		chunkIndex: number;
		chunkType: string | null;
		title: string | null;
		len: number;
		preview: string;
		meta: unknown;
	}> | null;
	hubCoverage?: DebugExplainPathCoverageResult;
};

/**
 * Read-only snapshot of indexed state for a vault/chat path: SQLite only (no re-index).
 * Logs one structured object to the console for DevTools debugging.
 */
export async function debugDocumentSnapshot(
	docPath: string,
	options?: DebugDocumentSnapshotOptions,
): Promise<DebugDocumentSnapshotResult> {
	const path = normalizePath(docPath.trim());
	const tenant = getIndexTenantForPath(path);
	const t0 = Date.now();
	const warnings: string[] = [];
	const chunkLimit = options?.chunkSampleLimit ?? 40;
	const edgeLim = options?.edgeSampleLimit ?? 50;

	const pv = (t: string | null | undefined, max = 400) => {
		const s = String(t ?? '').replace(/\s+/g, ' ').trim();
		return !s ? '' : s.length > max ? `${s.slice(0, max)}…` : s;
	};
	const parseJson = (raw: string | null | undefined) => {
		if (raw == null || raw === '') return null;
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	};

	const outBase: Omit<DebugDocumentSnapshotResult, 'hubCoverage'> & { hubCoverage?: DebugExplainPathCoverageResult } = {
		path,
		tenant,
		ok: false,
		elapsedMs: 0,
		warnings,
		indexed: null,
		summary: null,
		tags: null,
		docAttrs: null,
		mobiusNodeType: null,
		counts: {
			chunk: 0,
			embedding: 0,
			taggedEdges: 0,
			edgesByType: {},
		},
		graph: {
			docIncomingCnt: null,
			docOutgoingCnt: null,
			otherIncomingCnt: null,
			otherOutgoingCnt: null,
			pagerank: null,
			semanticPagerank: null,
			wordCount: null,
			charCount: null,
			referenceEdgesIncidentSampled: 0,
			semanticEdgesIncidentSampled: 0,
			referenceEdgesSample: [],
			semanticEdgesSample: [],
			taggedEdgesSample: [],
		},
		chunkSamples: null,
	};

	try {
		requireDb();
	} catch (e) {
		const err = (e as Error).message ?? String(e);
		const res: DebugDocumentSnapshotResult = {
			...outBase,
			ok: false,
			error: err,
			elapsedMs: Date.now() - t0,
		};
		console.info('[index-debug] debugDocumentSnapshot', res);
		return res;
	}

	const indexedRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const meta = await indexedRepo.getByPath(path);
	const row = await mobiusRepo.getByPath(path);
	const docId = meta?.id ?? row?.node_id ?? null;

	if (!docId) {
		const res: DebugDocumentSnapshotResult = {
			...outBase,
			ok: false,
			error: 'No indexed document or mobius_node row for this path.',
			elapsedMs: Date.now() - t0,
		};
		warnings.push('Path not found in index (not indexed or wrong tenant).');
		console.info('[index-debug] debugDocumentSnapshot', res);
		return res;
	}

	if (meta) {
		outBase.indexed = {
			id: meta.id,
			path: meta.path,
			title: meta.title,
			type: meta.type,
			content_hash: meta.content_hash,
			mtime: meta.mtime,
			last_processed_at: meta.last_processed_at,
		};
	} else {
		warnings.push('IndexedDocumentRepo.getByPath returned null; using mobius_node only.');
	}

	const attrsParsed = parseJson(row?.attributes_json) as Record<string, unknown> | null;
	const fullSummary =
		typeof attrsParsed?.full_summary === 'string' ? attrsParsed.full_summary : null;
	const hubTier = typeof attrsParsed?.hub_tier === 'string' ? attrsParsed.hub_tier : null;
	const summaryGeneratedAt =
		typeof attrsParsed?.summary_generated_at === 'number' ? attrsParsed.summary_generated_at : null;
	const headingSkeleton =
		typeof attrsParsed?.heading_skeleton === 'string' ? attrsParsed.heading_skeleton : null;
	const semanticOverlay =
		typeof attrsParsed?.semantic_overlay_mermaid === 'string'
			? attrsParsed.semantic_overlay_mermaid
			: null;
	const frontmatterJson =
		typeof attrsParsed?.frontmatter_json === 'string' ? attrsParsed.frontmatter_json : null;

	outBase.summary = {
		short: row?.summary ?? null,
		full: fullSummary,
		hubTier,
		summaryGeneratedAt,
		headingSkeletonPreview: headingSkeleton ? pv(headingSkeleton, 600) : null,
	};
	outBase.tags = row?.tags_json != null ? decodeIndexedTagsBlob(row.tags_json) : null;
	outBase.mobiusNodeType = row?.type ?? null;
	outBase.docAttrs = {
		llmPending: attrsParsed?.llm_pending,
		llmPendingReason: attrsParsed?.llm_pending_reason,
		vectorPending: attrsParsed?.vector_pending,
		vectorPendingReason: attrsParsed?.vector_pending_reason,
		functionalTagsStatus: attrsParsed?.functional_tags_status,
		llmTagsGeneratedAt: attrsParsed?.llm_tags_generated_at,
		llmSummaryGeneratedAt: attrsParsed?.llm_summary_generated_at,
		vectorGeneratedAt: attrsParsed?.vector_generated_at,
		semanticOverlayPreview: semanticOverlay ? pv(semanticOverlay, 500) : null,
		frontmatterPreview: frontmatterJson ? pv(frontmatterJson, 800) : null,
	};

	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	const [chunkCount, embeddingCount, taggedEdgeCount, edgesByType, refInc, semInc] = await Promise.all([
		countChunksForDoc(tenant, docId),
		countEmbeddingsForDoc(tenant, docId),
		countTaggedEdgesForDoc(tenant, docId),
		countEdgesByTypeForDoc(tenant, docId),
		edgeRepo.listReferenceEdgesIncidentToNode(docId, Math.max(edgeLim, 5000)),
		edgeRepo.listSemanticRelatedEdgesIncidentToNode(docId, Math.max(edgeLim, 2000)),
	]);

	outBase.counts = {
		chunk: chunkCount,
		embedding: embeddingCount,
		taggedEdges: taggedEdgeCount,
		edgesByType,
	};

	const kdbForSamples = sqliteStoreManager.getIndexContext(tenant);
	const taggedRows = await kdbForSamples
		.selectFrom('mobius_edge')
		.select(['id', 'from_node_id', 'to_node_id', 'type', 'weight', 'attributes_json'])
		.where('type', 'in', [...GRAPH_TAGGED_EDGE_TYPES])
		.where((eb) => eb.or([eb('from_node_id', '=', docId), eb('to_node_id', '=', docId)]))
		.limit(edgeLim)
		.execute();
	const taggedSample: DebugDocumentSnapshotResult['graph']['taggedEdgesSample'] = taggedRows.map((r) => ({
		id: r.id,
		from: r.from_node_id,
		to: r.to_node_id,
		type: r.type,
		weight: r.weight,
		attrs: parseJson(r.attributes_json),
	}));

	let chunkSamples: DebugDocumentSnapshotResult['chunkSamples'] = null;
	if (chunkLimit > 0) {
		const docChunkRows = await kdbForSamples
			.selectFrom('doc_chunk')
			.select(['chunk_id', 'chunk_index', 'chunk_type', 'title', 'content_raw', 'chunk_meta_json'])
			.where('doc_id', '=', docId)
			.orderBy('chunk_index', 'asc')
			.limit(chunkLimit)
			.execute();
		chunkSamples = docChunkRows.map((r) => ({
			chunkId: r.chunk_id,
			chunkIndex: r.chunk_index ?? 0,
			chunkType: r.chunk_type,
			title: r.title,
			len: r.content_raw?.length ?? 0,
			preview: pv(r.content_raw, 400),
			meta: parseJson(r.chunk_meta_json),
		}));
	}

	outBase.graph = {
		docIncomingCnt: row?.doc_incoming_cnt ?? null,
		docOutgoingCnt: row?.doc_outgoing_cnt ?? null,
		otherIncomingCnt: row?.other_incoming_cnt ?? null,
		otherOutgoingCnt: row?.other_outgoing_cnt ?? null,
		pagerank: typeof row?.pagerank === 'number' ? row.pagerank : null,
		semanticPagerank: typeof row?.semantic_pagerank === 'number' ? row.semantic_pagerank : null,
		wordCount: row?.word_count ?? null,
		charCount: row?.char_count ?? null,
		referenceEdgesIncidentSampled: refInc.length,
		semanticEdgesIncidentSampled: semInc.length,
		referenceEdgesSample: refInc.slice(0, edgeLim),
		semanticEdgesSample: semInc.slice(0, edgeLim),
		taggedEdgesSample: taggedSample,
	};

	if (chunkCount === 0) {
		warnings.push('chunk count is 0 — check loader / chunking / index.');
	}
	if (embeddingCount === 0) {
		warnings.push('embedding count is 0 — vectors off or not embedded yet.');
	}

	let hubCoverage: DebugExplainPathCoverageResult | undefined;
	if (options?.includeHubCoverage) {
		try {
			hubCoverage = await debugExplainPathCoverage(path);
		} catch (e) {
			warnings.push(`hub coverage failed: ${(e as Error).message ?? String(e)}`);
		}
	}

	const res: DebugDocumentSnapshotResult = {
		...outBase,
		ok: true,
		elapsedMs: Date.now() - t0,
		...(hubCoverage !== undefined ? { hubCoverage } : {}),
		chunkSamples,
	};

	console.info('[index-debug] debugDocumentSnapshot', res);
	return res;
}

/** DevTools progress log for {@link debugIndexDocument} (uses info so default console level shows it). */
function logDebugIndexDocument(
	path: string,
	tenant: IndexTenant,
	t0: number,
	phase: string,
	extra?: Record<string, unknown>,
): void {
	console.info('[index-debug] debugIndexDocument', {
		phase,
		path,
		tenant,
		elapsedMs: Date.now() - t0,
		...extra,
	});
}

/**
 * Index one document and return a compact snapshot for DevTools (no full-text dump).
 */
export async function debugIndexDocument(
	docPath: string,
	getSearchSettings: () => SearchSettings,
	mode: DebugIndexDocumentMode = 'manual_full',
) {
	const path = normalizePath(docPath.trim());
	const tenant = getIndexTenantForPath(path);
	const t0 = Date.now();
	const warnings: string[] = [];
	const out: Record<string, unknown> = {
		path,
		tenant,
		mode,
		ok: false,
		elapsedMs: 0,
		warnings,
	};

	logDebugIndexDocument(path, tenant, t0, 'start');

	try {
		requireDb();
	} catch (e) {
		out.error = (e as Error).message ?? String(e);
		out.elapsedMs = Date.now() - t0;
		logDebugIndexDocument(path, tenant, t0, 'requireDb_failed', { error: out.error });
		return out;
	}

	logDebugIndexDocument(path, tenant, t0, 'db_ready');

	const settings = getSearchSettings();
	const indexOptions = defaultIndexDocumentOptions(DEBUG_INDEX_MODE_TO_REASON[mode]);
	const readOpts: DocumentLoaderReadOptions = {
		includeLlmTags: indexOptions.includeLlmTags,
		includeLlmSummary: indexOptions.includeLlmSummary,
	};
	const loaderManager = DocumentLoaderManager.getInstance();
	logDebugIndexDocument(path, tenant, t0, 'readByPath_start', {
		hint: 'Markdown: parallel LLM tag + summary inside loader; see [MarkdownDocumentLoader] logs',
	});
	const readDoc = await loaderManager.readByPath(path, true, readOpts);
	if (!readDoc) {
		out.error = 'readByPath returned null (unknown type or no loader)';
		out.elapsedMs = Date.now() - t0;
		warnings.push('Could not load document model; index step skipped.');
		logDebugIndexDocument(path, tenant, t0, 'readByPath_null');
		return out;
	}

	logDebugIndexDocument(path, tenant, t0, 'readByPath_ok', { docType: readDoc.type, docId: readDoc.id });

	const pv = (t: string | null | undefined, max = 600) => {
		const s = String(t ?? '').replace(/\s+/g, ' ').trim();
		return !s ? '' : s.length > max ? `${s.slice(0, max)}…` : s;
	};
	const refTenant = (refs: { fullPath: string; docId?: string }[]) =>
		refs.map((r) => ({ ...r, tenant: getIndexTenantForPath(r.fullPath) }));
	const outgoingRefs = refTenant(readDoc.references?.outgoing ?? []);
	out.read = {
		id: readDoc.id,
		type: readDoc.type,
		sourcePreview: pv(readDoc.sourceFileInfo.content, 800),
		cachePreview: pv(readDoc.cacheFileInfo.content, 800),
		metadata: readDoc.metadata,
		references: {
			outgoing: outgoingRefs,
			incoming: refTenant(readDoc.references?.incoming ?? []),
			crossTenantOutgoing: outgoingRefs.filter((r) => r.tenant !== tenant),
		},
		summary: readDoc.summary,
		contentHash: readDoc.contentHash,
	};

	const loader = loaderManager.getLoaderForDocumentType(readDoc.type);
	if (loader) {
		try {
			logDebugIndexDocument(path, tenant, t0, 'chunkContent_start');
			const chunks = await loader.chunkContent(readDoc, settings.chunking);
			const byType: Record<string, number> = {};
			for (const c of chunks) {
				byType[c.chunkType] = (byType[c.chunkType] ?? 0) + 1;
			}
			out.chunks = {
				count: chunks.length,
				byType,
				items: chunks.map((c) => ({
					chunkId: c.chunkId,
					chunkIndex: c.chunkIndex,
					chunkType: c.chunkType,
					title: c.title,
					len: c.content?.length ?? 0,
					preview: pv(c.content, 400),
					meta: c.chunkMeta,
					embLen: Array.isArray(c.embedding) ? c.embedding.length : 0,
				})),
			};
			logDebugIndexDocument(path, tenant, t0, 'chunkContent_ok', { chunkCount: chunks.length });
		} catch (e) {
			warnings.push(`chunkContent failed: ${(e as Error).message ?? String(e)}`);
			logDebugIndexDocument(path, tenant, t0, 'chunkContent_failed', {
				error: (e as Error).message ?? String(e),
			});
		}
	} else {
		warnings.push(`No loader for document type: ${readDoc.type}`);
		logDebugIndexDocument(path, tenant, t0, 'chunkContent_skipped', { reason: 'no_loader' });
	}

	out.indexOptions = indexOptions;
	logDebugIndexDocument(path, tenant, t0, 'indexDocument_start', {
		mode,
		reason: indexOptions.reason,
		includeCoreSearchIndex: indexOptions.includeCoreSearchIndex,
		includeEmbeddings: indexOptions.includeEmbeddings,
		includeLlmTags: indexOptions.includeLlmTags,
		includeLlmSummary: indexOptions.includeLlmSummary,
	});
	try {
		await IndexService.getInstance().indexDocument(path, settings, indexOptions, readDoc);
		out.ok = true;
		logDebugIndexDocument(path, tenant, t0, 'indexDocument_ok');
	} catch (e) {
		out.error = (e as Error).message ?? String(e);
		out.elapsedMs = Date.now() - t0;
		logDebugIndexDocument(path, tenant, t0, 'indexDocument_failed', { error: out.error });
		return out;
	}

	const indexedRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	logDebugIndexDocument(path, tenant, t0, 'indexed_meta_lookup_start');
	const meta = await indexedRepo.getByPath(path);
	if (!meta) {
		warnings.push('Document not found in indexed_document table after index (skipped or load failed).');
		out.elapsedMs = Date.now() - t0;
		logDebugIndexDocument(path, tenant, t0, 'indexed_meta_missing');
		return out;
	}

	logDebugIndexDocument(path, tenant, t0, 'indexed_meta_ok', { docId: meta.id });

	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const row = await mobiusRepo.getByPath(path);
	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	logDebugIndexDocument(path, tenant, t0, 'graph_edges_start', { nodeId: meta.id });
	const refInc = await edgeRepo.listReferenceEdgesIncidentToNode(meta.id, 5000);
	logDebugIndexDocument(path, tenant, t0, 'graph_reference_edges_ok', { sampled: refInc.length });
	const semInc = await edgeRepo.listSemanticRelatedEdgesIncidentToNode(meta.id, 2000);
	logDebugIndexDocument(path, tenant, t0, 'graph_semantic_edges_ok', { sampled: semInc.length });

	const parseJson = (raw: string | null | undefined) => {
		if (raw == null || raw === '') return null;
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	};

	const kdb = sqliteStoreManager.getIndexContext(tenant);
	logDebugIndexDocument(path, tenant, t0, 'doc_chunk_sample_start');
	const docChunkRows = await kdb
		.selectFrom('doc_chunk')
		.select(['chunk_id', 'chunk_index', 'chunk_type', 'title', 'content_raw', 'chunk_meta_json'])
		.where('doc_id', '=', meta.id)
		.orderBy('chunk_index', 'asc')
		.limit(120)
		.execute();
	logDebugIndexDocument(path, tenant, t0, 'doc_chunk_sample_ok', { rows: docChunkRows.length });
	const persistedItems = docChunkRows.map((r) => ({
		chunkId: r.chunk_id,
		chunkIndex: r.chunk_index ?? 0,
		chunkType: r.chunk_type,
		title: r.title,
		len: r.content_raw?.length ?? 0,
		preview: pv(r.content_raw, 400),
		meta: parseJson(r.chunk_meta_json),
	}));
	logDebugIndexDocument(path, tenant, t0, 'tagged_edges_sample_start');
	const taggedRows = await kdb
		.selectFrom('mobius_edge')
		.select(['id', 'from_node_id', 'to_node_id', 'type', 'weight', 'attributes_json'])
		.where('type', 'in', [...GRAPH_TAGGED_EDGE_TYPES])
		.where((eb) => eb.or([eb('from_node_id', '=', meta.id), eb('to_node_id', '=', meta.id)]))
		.limit(50)
		.execute();
	logDebugIndexDocument(path, tenant, t0, 'tagged_edges_sample_ok', { rows: taggedRows.length });
	const taggedSample = taggedRows.map((r) => ({
		id: r.id,
		from: r.from_node_id,
		to: r.to_node_id,
		type: r.type,
		weight: r.weight,
		attrs: parseJson(r.attributes_json),
	}));

	logDebugIndexDocument(path, tenant, t0, 'chunk_embedding_counts_start');
	const chunkCountTotal = await countChunksForDoc(tenant, meta.id);
	const embeddingRowCount = await countEmbeddingsForDoc(tenant, meta.id);
	logDebugIndexDocument(path, tenant, t0, 'chunk_embedding_counts_ok', {
		chunkCount: chunkCountTotal,
		embeddingRowCount,
	});

	out.indexed = {
		nodeId: meta.id,
		title: meta.title,
		type: meta.type,
		chunkCount: chunkCountTotal,
		embeddingRowCount,
	};

	if (row) {
		const attrsParsed = parseJson(row.attributes_json) as Record<string, unknown> | null;
		out.mobiusNode = {
			row: { ...(row as Record<string, unknown>) },
			tagsDecoded: decodeIndexedTagsBlob(row.tags_json),
			attrsParsed,
			pendingState: {
				llmPending: attrsParsed?.llm_pending ?? null,
				llmPendingReason: attrsParsed?.llm_pending_reason ?? null,
				vectorPending: attrsParsed?.vector_pending ?? null,
				vectorPendingReason: attrsParsed?.vector_pending_reason ?? null,
				functionalTagsStatus: attrsParsed?.functional_tags_status ?? null,
			},
		};
	}

	out.persistedChunks = {
		count: chunkCountTotal,
		itemsSampled: persistedItems.length,
		items: persistedItems,
	};

	logDebugIndexDocument(path, tenant, t0, 'tagged_edge_count_start');
	const taggedEdgeCount = await countTaggedEdgesForDoc(tenant, meta.id);
	logDebugIndexDocument(path, tenant, t0, 'tagged_edge_count_ok', { taggedEdgeCount });

	out.graph = {
		referenceEdgesIncidentSampled: refInc.length,
		semanticEdgesIncidentSampled: semInc.length,
		taggedEdgeCount,
		docIncomingCnt: row?.doc_incoming_cnt ?? null,
		docOutgoingCnt: row?.doc_outgoing_cnt ?? null,
		pagerank: typeof row?.pagerank === 'number' ? row.pagerank : null,
		semanticPagerank: typeof row?.semantic_pagerank === 'number' ? row.semantic_pagerank : null,
		referenceEdgesSample: refInc.slice(0, 50),
		semanticEdgesSample: semInc.slice(0, 50),
		taggedEdgesSample: taggedSample,
	};

	const indexedSnap = out.indexed as { chunkCount?: number; embeddingRowCount?: number } | undefined;
	if (indexedSnap?.chunkCount === 0) {
		warnings.push('chunkCount is 0 — check loader / chunking settings.');
	}
	if (indexedSnap?.embeddingRowCount === 0) {
		warnings.push('embeddingRowCount is 0 — vector extension off or embedding model not configured.');
	}

	logDebugIndexDocument(path, tenant, t0, 'localHubPreview_start');
	try {
		const local = await buildLocalHubGraphForPath({
			tenant,
			centerPath: path,
			hubNodeIdSet: new Set<string>(),
			maxDepth: 3,
		});
		if (local) {
			out.localHubPreview = {
				nodeCount: local.nodes.length,
				edgeCount: local.edges.length,
				stopReason: local.frontierSummary?.reason,
			};
			logDebugIndexDocument(path, tenant, t0, 'localHubPreview_ok', {
				nodeCount: local.nodes.length,
				edgeCount: local.edges.length,
			});
		} else {
			logDebugIndexDocument(path, tenant, t0, 'localHubPreview_empty');
		}
	} catch (e) {
		warnings.push(`local hub preview failed: ${(e as Error).message ?? e}`);
		logDebugIndexDocument(path, tenant, t0, 'localHubPreview_failed', {
			error: (e as Error).message ?? String(e),
		});
	}

	out.elapsedMs = Date.now() - t0;
	logDebugIndexDocument(path, tenant, t0, 'done', { ok: out.ok, warningCount: warnings.length });
	return out;
}

/**
 * Batch wrapper around {@link debugIndexDocument}.
 */
export async function debugBatchIndex(
	paths: string[],
	getSearchSettings: () => SearchSettings,
	mode: DebugIndexDocumentMode = 'manual_full',
) {
	const t0 = Date.now();
	const results: Awaited<ReturnType<typeof debugIndexDocument>>[] = [];
	for (const p of paths) {
		results.push(await debugIndexDocument(p, getSearchSettings, mode));
	}
	const success = results.filter((r) => r.ok).length;
	return {
		total: results.length,
		success,
		failed: results.length - success,
		elapsedMs: Date.now() - t0,
		results,
	};
}

export type DebugMaintenanceResult = {
	ok: boolean;
	elapsedMs: number;
	error?: string;
	phaseEvents: Array<{ key: string; tenant: string; phase: string; progressTextSuffix?: string }>;
};

/**
 * Runs {@link IndexService.runMobiusGlobalMaintenance} and records progress events (for timing / hang diagnosis).
 */
export async function debugRunMaintenance(
	tenants: IndexTenant[] = ['vault', 'chat'],
): Promise<DebugMaintenanceResult> {
	const phaseEvents: DebugMaintenanceResult['phaseEvents'] = [];
	const t0 = Date.now();
	try {
		await IndexService.getInstance().runMobiusGlobalMaintenance(tenants, {
			onProgress: (ev) => {
				phaseEvents.push({
					key: `${ev.tenant}:${ev.phase}`,
					tenant: ev.tenant,
					phase: ev.phase,
					progressTextSuffix: ev.progressTextSuffix,
				});
			},
		});
		return { ok: true, elapsedMs: Date.now() - t0, phaseEvents };
	} catch (e) {
		return {
			ok: false,
			elapsedMs: Date.now() - t0,
			error: (e as Error).message ?? String(e),
			phaseEvents,
		};
	}
}

export type DebugHubDiscoverSnapshotResult = {
	candidates: HubCandidate[];
	roundSummaries: HubDiscoverRoundSummary[];
	lastRoundSummary: HubDiscoverRoundSummary | null;
	unionCoverage: {
		documentCount: number;
		coveredCount: number;
		coverageRatio: number;
	};
};

/** Result of running one first-round hub discovery leg in isolation (manual / document / folder). */
export type DebugHubDiscoverSingleLegResult = {
	tenant: IndexTenant;
	leg: 'manual' | 'document' | 'folder';
	docCount: number;
	budgets: ReturnType<typeof computeHubDiscoverBudgets>;
	candidateCount: number;
	elapsedMs: number;
	candidates: HubCandidate[];
};

async function runHubDiscoverSingleLeg(options: {
	tenant: IndexTenant;
	leg: DebugHubDiscoverSingleLegResult['leg'];
}): Promise<DebugHubDiscoverSingleLegResult> {
	const { tenant, leg } = options;
	requireDb();
	const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
	const docCount = docCoverageIndex.docCount;
	const budgets = computeHubDiscoverBudgets(docCount);
	const discovery = new HubCandidateDiscoveryService();
	const t0 = Date.now();
	let candidates: HubCandidate[];
	if (leg === 'manual') {
		candidates = await discovery.discoverManualHubCandidates({ tenant });
	} else if (leg === 'document') {
		candidates = await discovery.discoverDocumentHubCandidates({
			tenant,
			limit: budgets.documentFetchLimit,
			docCoverageIndex,
			limitTotal: budgets.limitTotal,
		});
	} else {
		candidates = await discovery.discoverFolderHubCandidates({
			tenant,
			limit: budgets.folderFetchLimit,
		});
	}
	const res: DebugHubDiscoverSingleLegResult = {
		tenant,
		leg,
		docCount,
		budgets,
		candidateCount: candidates.length,
		elapsedMs: Date.now() - t0,
		candidates,
	};
	console.info('[index-debug] debugHubDiscoverSingleLeg', {
		tenant: res.tenant,
		leg: res.leg,
		docCount: res.docCount,
		budgets: res.budgets,
		candidateCount: res.candidateCount,
		elapsedMs: res.elapsedMs,
	});
	return res;
}

/** First-round manual hub candidates only (paths under manual hub folder, indexed rows). */
export async function debugHubDiscoverManualOnly(tenant: IndexTenant = 'vault'): Promise<DebugHubDiscoverSingleLegResult> {
	return runHubDiscoverSingleLeg({ tenant, leg: 'manual' });
}

/** First-round document hub candidates only (SQL top documents by hub graph score). */
export async function debugHubDiscoverDocumentOnly(tenant: IndexTenant = 'vault'): Promise<DebugHubDiscoverSingleLegResult> {
	return runHubDiscoverSingleLeg({ tenant, leg: 'document' });
}

/** First-round folder hub candidates only (SQL top folder anchors). */
export async function debugHubDiscoverFolderOnly(tenant: IndexTenant = 'vault'): Promise<DebugHubDiscoverSingleLegResult> {
	return runHubDiscoverSingleLeg({ tenant, leg: 'folder' });
}

/** Result of running the first-round cluster hub discovery leg in isolation (includes per-stage stats). */
export type DebugHubDiscoverClusterOnlyResult = {
	tenant: IndexTenant;
	docCount: number;
	budgets: ReturnType<typeof computeHubDiscoverBudgets>;
	candidateCount: number;
	elapsedMs: number;
	candidates: HubCandidate[];
	clusterDiscovery: HubClusterDiscoveryStats;
};

/** First-round cluster hub candidates only (matches first-round exclude set from top document slice). */
export async function debugHubDiscoverClusterOnly(
	tenant: IndexTenant = 'vault',
): Promise<DebugHubDiscoverClusterOnlyResult> {
	requireDb();
	const docCoverageIndex = await buildHubDiscoverDocCoverageIndex(tenant);
	const docCount = docCoverageIndex.docCount;
	const budgets = computeHubDiscoverBudgets(docCount);
	const discovery = new HubCandidateDiscoveryService();
	const t0 = Date.now();
	const docs = await discovery.discoverDocumentHubCandidates({
		tenant,
		limit: budgets.documentFetchLimit,
		docCoverageIndex,
		limitTotal: budgets.limitTotal,
	});
	const topDocIds = new Set(
		docs.slice(0, budgets.topDocExcludeLimit).map((d) => d.nodeId),
	);
	const { candidates, stats } = await discovery.discoverClusterHubCandidates({
		tenant,
		limit: budgets.clusterLimit,
		seedFetchLimit: budgets.clusterSeedFetchLimit,
		excludeNodeIds: topDocIds,
	});
	const res: DebugHubDiscoverClusterOnlyResult = {
		tenant,
		docCount,
		budgets,
		candidateCount: candidates.length,
		elapsedMs: Date.now() - t0,
		candidates,
		clusterDiscovery: stats,
	};
	console.info('[index-debug] debugHubDiscoverClusterOnly', {
		tenant: res.tenant,
		docCount: res.docCount,
		budgets: res.budgets,
		candidateCount: res.candidateCount,
		elapsedMs: res.elapsedMs,
		clusterDiscovery: res.clusterDiscovery,
	});
	return res;
}

/**
 * Full hub discovery + optional union coverage stats. Can be expensive; same cost as maintenance hub-discovery step.
 */
export async function debugHubDiscoverSnapshot(
	tenant: IndexTenant = 'vault',
): Promise<DebugHubDiscoverSnapshotResult> {
	requireDb();
	const { candidates, roundSummaries } = await debugRunHubDiscoverWithReport({ tenant });
	const union = await computeUnionCoverageForHubCandidates(tenant, candidates);
	return {
		candidates,
		roundSummaries,
		lastRoundSummary: roundSummaries.length ? roundSummaries[roundSummaries.length - 1]! : null,
		unionCoverage: {
			documentCount: union.documentCount,
			coveredCount: union.coveredCount,
			coverageRatio: union.coverageRatio,
		},
	};
}

export type DebugValidateSubsetResult = {
	tenant: IndexTenant;
	pathsResolved: string[];
	unionCoverage: {
		documentCount: number;
		coveredCount: number;
		coverageRatio: number;
	};
	subset: {
		documentCount: number;
		coveredCount: number;
		coverageRatio: number;
		coveredPaths: string[];
		uncoveredPaths: string[];
	};
	perPath: Array<{
		path: string;
		nodeId: string | null;
		coveredByUnion: boolean;
		coveringHubs: Array<{ stableKey: string; path: string; label: string; sourceKind: string }>;
	}>;
};

/**
 * Validates coverage for explicit paths and/or path prefixes against the **final** hub candidate set.
 * Pass `candidates` to avoid re-running discovery when you already have a snapshot.
 */
export async function debugValidateSubset(options: {
	paths?: string[];
	pathPrefixes?: string[];
	tenant?: IndexTenant;
	candidates?: HubCandidate[];
}): Promise<DebugValidateSubsetResult> {
	requireDb();
	const tenant = options.tenant ?? 'vault';
	let candidates = options.candidates;
	if (!candidates?.length) {
		const r = await debugRunHubDiscoverWithReport({ tenant });
		candidates = r.candidates;
	}

	const union = await computeUnionCoverageForHubCandidates(tenant, candidates!);
	const { docCoverageIndex, bitsByStableKey } = await debugBuildCandidateCoverageBits(tenant, candidates!);

	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const resolved = new Set<string>();
	for (const p of options.paths ?? []) {
		resolved.add(normalizePath(p.trim()));
	}
	for (const raw of options.pathPrefixes ?? []) {
		const prefix = normalizePath(raw.trim());
		const sqlPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
		const rows = await mobiusRepo.listDocumentNodeIdPathByPathPrefix(sqlPrefix, 8000);
		for (const r of rows) {
			if (r.path) resolved.add(r.path);
		}
	}
	const pathsResolved = [...resolved].sort();

	const perPath: DebugValidateSubsetResult['perPath'] = [];
	let subsetCovered = 0;

	for (const p of pathsResolved) {
		const nodeId = await mobiusRepo.getDocumentNodeIdByVaultPath(p);
		if (!nodeId) {
			perPath.push({
				path: p,
				nodeId: null,
				coveredByUnion: false,
				coveringHubs: [],
			});
			continue;
		}
		const ord = docCoverageIndex.ordinalByNodeId.get(nodeId);
		const coveredByUnion = ord !== undefined && union.coveredNodeIds.has(nodeId);
		if (coveredByUnion) subsetCovered++;

		const coveringHubs: Array<{ stableKey: string; path: string; label: string; sourceKind: string }> = [];
		if (ord !== undefined) {
			for (const c of candidates!) {
				const bits = bitsByStableKey.get(c.stableKey);
				if (bits && hasUint32Bit(bits, ord)) {
					coveringHubs.push({
						stableKey: c.stableKey,
						path: c.path,
						label: c.label,
						sourceKind: c.sourceKind,
					});
				}
			}
		}

		perPath.push({
			path: p,
			nodeId,
			coveredByUnion,
			coveringHubs,
		});
	}

	const n = pathsResolved.length;
	return {
		tenant,
		pathsResolved,
		unionCoverage: {
			documentCount: union.documentCount,
			coveredCount: union.coveredCount,
			coverageRatio: union.coverageRatio,
		},
		subset: {
			documentCount: n,
			coveredCount: subsetCovered,
			coverageRatio: n > 0 ? subsetCovered / n : 0,
			coveredPaths: perPath.filter((x) => x.coveredByUnion).map((x) => x.path),
			uncoveredPaths: perPath.filter((x) => !x.coveredByUnion).map((x) => x.path),
		},
		perPath,
	};
}

export type DebugExplainPathCoverageResult = {
	path: string;
	tenant: IndexTenant;
	nodeId: string | null;
	coveredByUnion: boolean;
	coveringHubs: Array<{ stableKey: string; path: string; label: string; sourceKind: string }>;
	lastRoundSummary: HubDiscoverRoundSummary | null;
};

/**
 * Explains whether a path is inside the union coverage of the current hub candidate set.
 */
/**
 * Hub discovery coverage is computed on the vault tenant document ordinal index.
 * Chat paths are resolved in the chat DB but union coverage compares against vault hubs only.
 */
export async function debugExplainPathCoverage(docPath: string): Promise<DebugExplainPathCoverageResult> {
	const path = normalizePath(docPath.trim());
	const t = getIndexTenantForPath(path);
	requireDb();
	const hubTenant: IndexTenant = 'vault';
	const { candidates, roundSummaries } = await debugRunHubDiscoverWithReport({ tenant: hubTenant });
	const union = await computeUnionCoverageForHubCandidates(hubTenant, candidates);
	const { docCoverageIndex, bitsByStableKey } = await debugBuildCandidateCoverageBits(hubTenant, candidates);
	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(t);
	const nodeId = await mobiusRepo.getDocumentNodeIdByVaultPath(path) ?? null;

	const coveringHubs: DebugExplainPathCoverageResult['coveringHubs'] = [];
	if (nodeId) {
		const ord = docCoverageIndex.ordinalByNodeId.get(nodeId);
		if (ord !== undefined) {
			for (const c of candidates) {
				const bits = bitsByStableKey.get(c.stableKey);
				if (bits && hasUint32Bit(bits, ord)) {
					coveringHubs.push({
						stableKey: c.stableKey,
						path: c.path,
						label: c.label,
						sourceKind: c.sourceKind,
					});
				}
			}
		}
	}

	return {
		path,
		tenant: t,
		nodeId,
		coveredByUnion: nodeId ? union.coveredNodeIds.has(nodeId) : false,
		coveringHubs,
		lastRoundSummary: roundSummaries.length ? roundSummaries[roundSummaries.length - 1]! : null,
	};
}
