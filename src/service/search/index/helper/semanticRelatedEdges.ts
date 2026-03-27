/**
 * Doc→doc `semantic_related` edges: overlay Mermaid, inspector reads, and tenant-wide vector KNN rebuild.
 * Local Mermaid overlay on document nodes is derived from stored edges (not SSOT).
 */

import { GraphEdgeType, isIndexedNoteNodeType } from '@/core/po/graph.po';
import type { EmbeddingRepo } from '@/core/storage/sqlite/repositories/EmbeddingRepo';
import { MobiusEdgeRepo } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { BusinessError, ErrorCode } from '@/core/errors';
import { getFileNameFromPath } from '@/core/utils/file-utils';
import { getPathFromNode } from '@/service/tools/search-graph-inspector/common';
import type { Document } from '@/core/document/types';
import { SLICE_CAPS } from '@/core/constant';
import { SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT, type ChunkType } from '@/service/search/index/chunkTypes';

// ---------------------------------------------------------------------------
// Shared types & constants
// ---------------------------------------------------------------------------

/** Bumped when edge materialization or stored mermaid shape changes. */
export const SEMANTIC_EDGE_RULE_VERSION = 4;

export type SemanticEdgeWrite = {
	toNodeId: string;
	weight: number;
	attributes: Record<string, unknown>;
};

export type GraphSemanticLinkItem = {
	path: string;
	label: string;
	/** Display string; from edge attributes when available. */
	similarity: string;
};

/** Max outgoing semantic neighbors per source document. */
export const SEMANTIC_VECTOR_TOP_K_PER_DOC = 12;
/** KNN pool size per doc query (distinct docs may be fewer after aggregation). */
export const SEMANTIC_VECTOR_KNN_LIMIT = 150;
/** Minimum raw similarity (1/(1+distance)) to keep a candidate before weighting. */
export const SEMANTIC_VECTOR_MIN_SIMILARITY = 0.38;

export type RebuildSemanticEdgesBatchResult = {
	tenant: IndexTenant;
	documentsProcessed: number;
	edgesWritten: number;
	skipped: boolean;
	reason?: string;
};

type MermaidEdgeKind = 'ref' | 'topic' | 'vec';

type NeighborAgg = {
	bestWeighted: number;
	bestDistance: number;
	bestSimilarity: number;
	targetChunkType: ChunkType;
};

// ---------------------------------------------------------------------------
// Overlay service (cached Mermaid on indexed note nodes)
// ---------------------------------------------------------------------------

/**
 * Builds and resolves labels for semantic neighborhood Mermaid overlays stored on note nodes.
 */
export class SemanticRelatedEdgesOverlayService {
	private static escapeMermaidLabel(s: string): string {
		return s.replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').slice(0, SLICE_CAPS.semanticEdges.mermaidSafeLabel);
	}

	/**
	 * Compact Mermaid flowchart for local neighborhood (stored on document node; not the graph SSOT).
	 */
	static buildMermaid(centerLabel: string, items: ReadonlyArray<{ label: string; edge: MermaidEdgeKind }>): string {
		const lines: string[] = ['flowchart LR', `  center["${this.escapeMermaidLabel(centerLabel)}"]`];
		items.slice(0, SLICE_CAPS.semanticEdges.items).forEach((it, idx) => {
			const nid = `n${idx}`;
			const el = it.edge === 'vec' ? 'vec' : it.edge === 'topic' ? 'topic' : 'ref';
			lines.push(`  ${nid}["${this.escapeMermaidLabel(it.label)}"]`);
			lines.push(`  center -->|${el}| ${nid}`);
		});
		return lines.join('\n');
	}

	/** Build mermaid text from collected writes + resolved neighbor labels. */
	static async buildMermaidForWrites(
		centerLabel: string,
		writes: readonly SemanticEdgeWrite[],
		mobiusNodeRepo: MobiusNodeRepo,
	): Promise<string | null> {
		if (writes.length === 0) return null;
		const ids = [...new Set(writes.map((w) => w.toNodeId))];
		const nodes = await mobiusNodeRepo.getByIds(ids);
		const items: Array<{ label: string; edge: MermaidEdgeKind }> = [];
		for (const w of writes) {
			const n = nodes.get(w.toNodeId);
			const label = n?.label ?? w.toNodeId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
			const rule = w.attributes.rule;
			const edge: MermaidEdgeKind =
				rule === 'chunk_knn_max' ||
				rule === 'vector_knn' ||
				rule === 'typed_weighted_knn' ||
				rule === 'semantic_doc_center_knn'
					? 'vec'
					: rule === 'shared_topic_tag'
						? 'topic'
						: 'ref';
			items.push({ label, edge });
		}
		return this.buildMermaid(centerLabel, items);
	}

	/** Build mermaid from a loaded {@link Document} (title from doc metadata / path). */
	static async buildMermaidForDocument(
		doc: Document,
		writes: readonly SemanticEdgeWrite[],
		mobiusNodeRepo: MobiusNodeRepo,
	): Promise<string | null> {
		const center = doc.metadata.title ?? getFileNameFromPath(doc.sourceFileInfo.path);
		return this.buildMermaidForWrites(center, writes, mobiusNodeRepo);
	}
}

// ---------------------------------------------------------------------------
// Read service (inspector / UI over stored edges)
// ---------------------------------------------------------------------------

/**
 * Reads stored `semantic_related` edges for inspector and similar consumers.
 */
export class SemanticRelatedEdgesReadService {
	private static formatSimilarityFromAttributes(attrsJson: string): string | null {
		try {
			const o = JSON.parse(attrsJson || '{}') as Record<string, unknown>;
			const s = o.bestSimilarity;
			if (typeof s === 'number' && Number.isFinite(s)) {
				return `${(s * 100).toFixed(1)}%`;
			}
		} catch {
			/* ignore */
		}
		return null;
	}

	/** Neighbors reachable via stored `semantic_related` out-edges. */
	static async loadGraphSemanticLinkItems(
		docId: string,
		tenant: IndexTenant,
		limit: number,
	): Promise<GraphSemanticLinkItem[]> {
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
		const edges = await mobiusEdgeRepo.getByFromNode(docId);
		const sem = edges.filter((e) => e.type === GraphEdgeType.SemanticRelated).slice(0, Math.max(1, limit));
		if (!sem.length) return [];
		const ids = sem.map((e) => e.to_node_id);
		const nodes = await mobiusNodeRepo.getByIds(ids);
		const out: GraphSemanticLinkItem[] = [];
		for (const e of sem) {
			const n = nodes.get(e.to_node_id);
			if (!n || !isIndexedNoteNodeType(n.type)) continue;
			const path = getPathFromNode(n);
			if (!path) continue;
			const fromAttrs = this.formatSimilarityFromAttributes(e.attributes ?? '{}');
			out.push({
				path,
				label: n.label,
				similarity: fromAttrs ?? '55.0%',
			});
		}
		return out;
	}
}

// ---------------------------------------------------------------------------
// Rebuild service (tenant-wide maintenance pass)
// ---------------------------------------------------------------------------

/**
 * Rebuilds doc→doc `semantic_related` edges from doc-center vector KNN (sqlite-vec).
 * Not used during single-document indexing.
 */
export class SemanticRelatedEdgesRebuildService {
	private static async yieldToMainThread(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}

	/**
	 * Rebuilds all `semantic_related` edges for one index tenant using vector similarity.
	 * Clears existing edges of this type, clears cached Mermaid overlays, then writes new edges and overlays.
	 *
	 * Uses one query vector per source doc via {@link EmbeddingRepo.getEmbeddingForSemanticSearch} and one KNN;
	 * target chunk types are weighted only at aggregation time.
	 */
	static async rebuildForTenant(
		tenant: IndexTenant,
		options?: {
			yieldEveryDocs?: number;
			onProgress?: (p: { tenant: IndexTenant; processed: number; total: number }) => void;
		},
	): Promise<RebuildSemanticEdgesBatchResult> {
		if (!sqliteStoreManager.isVectorSearchEnabled()) {
			return {
				tenant,
				documentsProcessed: 0,
				edgesWritten: 0,
				skipped: true,
				reason: 'Vector search (sqlite-vec) is not enabled.',
			};
		}

		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
		const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

		let docIds: string[];
		try {
			docIds = await embeddingRepo.listDistinctDocIdsWithEmbeddings();
		} catch (e) {
			return {
				tenant,
				documentsProcessed: 0,
				edgesWritten: 0,
				skipped: true,
				reason: e instanceof Error ? e.message : String(e),
			};
		}

		if (!docIds.length) {
			return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: false };
		}

		const probeId = docIds[0]!;
		const probeVec = await embeddingRepo.getEmbeddingForSemanticSearch(probeId);
		if (probeVec) {
			try {
				await embeddingRepo.searchSimilarAndGetId(probeVec, 1, 'excludeDocIdsSet', {
					excludeDocIdsSet: new Set([probeId]),
				});
			} catch (e) {
				if (e instanceof BusinessError && e.code === ErrorCode.VEC_EMBEDDINGS_TABLE_MISSING) {
					return {
						tenant,
						documentsProcessed: 0,
						edgesWritten: 0,
						skipped: true,
						reason: e.message,
					};
				}
				throw e;
			}
		}

		const yieldEvery = options?.yieldEveryDocs ?? 40;
		const total = docIds.length;
		let edgesWritten = 0;
		let processed = 0;
		const now = Date.now();

		await mobiusEdgeRepo.deleteByType(GraphEdgeType.SemanticRelated);

		await mobiusNodeRepo.clearSemanticOverlayFieldsForIndexedNotes(now, SEMANTIC_EDGE_RULE_VERSION);

		for (const fromId of docIds) {
			processed++;
			options?.onProgress?.({ tenant, processed, total });

			const queryVector = await embeddingRepo.getEmbeddingForSemanticSearch(fromId);
			if (!queryVector) {
				if (processed % yieldEvery === 0) await this.yieldToMainThread();
				continue;
			}

			let results: Awaited<ReturnType<EmbeddingRepo['searchSimilarAndGetId']>>;
			try {
				results = await embeddingRepo.searchSimilarAndGetId(
					queryVector,
					SEMANTIC_VECTOR_KNN_LIMIT,
					'excludeDocIdsSet',
					{ excludeDocIdsSet: new Set([fromId]) },
				);
			} catch (e) {
				console.warn('[semanticRelatedEdges] KNN failed:', fromId, e);
				if (processed % yieldEvery === 0) await this.yieldToMainThread();
				continue;
			}

			const byNeighbor = new Map<string, NeighborAgg>();

			for (const r of results) {
				if (r.doc_id === fromId) continue;
				if (r.similarity < SEMANTIC_VECTOR_MIN_SIMILARITY) continue;
				const targetChunkType = ((r.chunk_type as ChunkType | null) ?? 'body_raw') as ChunkType;
				const w = SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT[targetChunkType];
				const weighted = r.similarity * w;
				const prev = byNeighbor.get(r.doc_id);
				if (!prev || weighted > prev.bestWeighted) {
					byNeighbor.set(r.doc_id, {
						bestWeighted: weighted,
						bestDistance: r.distance,
						bestSimilarity: r.similarity,
						targetChunkType,
					});
				}
			}

			const ranked = [...byNeighbor.entries()]
				.filter(([, v]) => v.bestSimilarity >= SEMANTIC_VECTOR_MIN_SIMILARITY)
				.sort((a, b) => b[1].bestWeighted - a[1].bestWeighted)
				.slice(0, SEMANTIC_VECTOR_TOP_K_PER_DOC);

			const toIds = ranked.map(([id]) => id);
			const targetNodes = await mobiusNodeRepo.getByIds(toIds);

			const writes: SemanticEdgeWrite[] = [];
			for (const [toId, agg] of ranked) {
				const target = targetNodes.get(toId);
				if (!target || !isIndexedNoteNodeType(target.type)) continue;
				writes.push({
					toNodeId: toId,
					weight: Math.min(1, agg.bestWeighted),
					attributes: {
						source: 'vector',
						rule: 'semantic_doc_center_knn',
						ruleVersion: SEMANTIC_EDGE_RULE_VERSION,
						bestDistance: agg.bestDistance,
						bestSimilarity: agg.bestSimilarity,
						targetChunkType: agg.targetChunkType,
						bestWeightedSimilarity: agg.bestWeighted,
					},
				});
			}

			for (const w of writes) {
				await mobiusEdgeRepo.upsert({
					id: MobiusEdgeRepo.generateEdgeId(fromId, w.toNodeId, GraphEdgeType.SemanticRelated),
					from_node_id: fromId,
					to_node_id: w.toNodeId,
					type: GraphEdgeType.SemanticRelated,
					weight: w.weight,
					attributes: JSON.stringify({ ...w.attributes, updatedAt: now }),
				});
				edgesWritten++;
			}

			if (writes.length > 0) {
				const centerNode = await mobiusNodeRepo.getByNodeId(fromId);
				const centerLabel = centerNode?.label ?? fromId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
				const mermaid = await SemanticRelatedEdgesOverlayService.buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo);
				await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(
					fromId,
					{
						semantic_overlay_mermaid: mermaid ?? null,
						semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION,
					},
					now,
				);
			}

			if (processed % yieldEvery === 0) await this.yieldToMainThread();
		}

		return { tenant, documentsProcessed: processed, edgesWritten, skipped: false };
	}
}
