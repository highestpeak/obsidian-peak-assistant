import { normalizePath } from 'obsidian';
import { GRAPH_TAGGED_EDGE_TYPES } from '@/core/po/graph.po';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { createUint32Bitset, hasUint32Bit } from '@/core/utils/bit-util';
import { IndexService, getIndexTenantForPath } from '@/service/search/index/indexService';
import {
	HubCandidateDiscoveryService,
	buildHubDiscoverDocCoverageIndex,
	estimateCandidateCoverageBits,
} from '@/service/search/index/helper/hub/hubDiscover';
import { buildLocalHubGraphForPath } from '@/service/search/index/helper/hub/localGraphAssembler';
import type {
	HubCandidate,
	HubDiscoverDocCoverageIndex,
	HubDiscoverRoundSummary,
} from '@/service/search/index/helper/hub/types';
import type { SearchSettings } from '@/app/settings/types';

function requireDb(): void {
	if (!sqliteStoreManager.isInitialized()) {
		throw new Error('[index-debug] SQLite is not initialized. Open the vault and wait for the plugin to finish loading.');
	}
}

/**
 * Runs full hub discovery and collects per-round summaries (same pipeline as maintenance hub step).
 * May trigger LLM round review when `search.hubDiscover.enableLlmJudge` is true.
 */
async function debugRunHubDiscoverWithReport(options?: {
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

export type DebugIndexDocumentResult = {
	path: string;
	tenant: IndexTenant;
	ok: boolean;
	elapsedMs: number;
	error?: string;
	indexed?: {
		nodeId: string;
		title: string | null;
		type: string | null;
		chunkCount: number;
		embeddingRowCount: number;
	};
	graph?: {
		referenceEdgesIncidentSampled: number;
		semanticEdgesIncidentSampled: number;
		taggedEdgeCount: number;
		docIncomingCnt: number | null;
		docOutgoingCnt: number | null;
		pagerank: number | null;
		semanticPagerank: number | null;
	};
	localHubPreview?: {
		nodeCount: number;
		edgeCount: number;
		stopReason?: string;
	};
	warnings: string[];
};

/**
 * Index one document and return a compact snapshot for DevTools (no full-text dump).
 */
export async function debugIndexDocument(
	docPath: string,
	getSearchSettings: () => SearchSettings,
): Promise<DebugIndexDocumentResult> {
	const path = normalizePath(docPath.trim());
	const tenant = getIndexTenantForPath(path);
	const t0 = Date.now();
	const warnings: string[] = [];
	const out: DebugIndexDocumentResult = {
		path,
		tenant,
		ok: false,
		elapsedMs: 0,
		warnings,
	};

	try {
		requireDb();
		await IndexService.getInstance().indexDocument(path, getSearchSettings());
		out.ok = true;
	} catch (e) {
		out.error = (e as Error).message ?? String(e);
		out.elapsedMs = Date.now() - t0;
		return out;
	}

	out.elapsedMs = Date.now() - t0;

	const indexedRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
	const meta = await indexedRepo.getByPath(path);
	if (!meta) {
		warnings.push('Document not found in indexed_document table after index (skipped or load failed).');
		out.elapsedMs = Date.now() - t0;
		return out;
	}

	const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const row = await mobiusRepo.getByPath(path);
	const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
	const refInc = await edgeRepo.listReferenceEdgesIncidentToNode(meta.id, 5000);
	const semInc = await edgeRepo.listSemanticRelatedEdgesIncidentToNode(meta.id, 2000);

	out.indexed = {
		nodeId: meta.id,
		title: meta.title,
		type: meta.type,
		chunkCount: await countChunksForDoc(tenant, meta.id),
		embeddingRowCount: await countEmbeddingsForDoc(tenant, meta.id),
	};

	out.graph = {
		referenceEdgesIncidentSampled: refInc.length,
		semanticEdgesIncidentSampled: semInc.length,
		taggedEdgeCount: await countTaggedEdgesForDoc(tenant, meta.id),
		docIncomingCnt: row?.doc_incoming_cnt ?? null,
		docOutgoingCnt: row?.doc_outgoing_cnt ?? null,
		pagerank: typeof row?.pagerank === 'number' ? row.pagerank : null,
		semanticPagerank: typeof row?.semantic_pagerank === 'number' ? row.semantic_pagerank : null,
	};

	if (out.indexed.chunkCount === 0) {
		warnings.push('chunkCount is 0 — check loader / chunking settings.');
	}
	if (out.indexed.embeddingRowCount === 0) {
		warnings.push('embeddingRowCount is 0 — vector extension off or embedding model not configured.');
	}

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
		}
	} catch (e) {
		warnings.push(`local hub preview failed: ${(e as Error).message ?? e}`);
	}

	return out;
}

export type DebugBatchIndexResult = {
	total: number;
	success: number;
	failed: number;
	elapsedMs: number;
	results: DebugIndexDocumentResult[];
};

/**
 * Batch wrapper around {@link debugIndexDocument}.
 */
export async function debugBatchIndex(
	paths: string[],
	getSearchSettings: () => SearchSettings,
): Promise<DebugBatchIndexResult> {
	const t0 = Date.now();
	const results: DebugIndexDocumentResult[] = [];
	for (const p of paths) {
		results.push(await debugIndexDocument(p, getSearchSettings));
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
	phaseEvents: Array<{ key: string; tenant: string; phase: string; batchIndex?: number; idsInBatch?: number; processed?: number; total?: number }>;
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
					batchIndex: ev.batchIndex,
					idsInBatch: ev.idsInBatch,
					processed: ev.processed,
					total: ev.total,
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
