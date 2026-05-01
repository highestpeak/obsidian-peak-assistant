/**
 * Multi-layer edge fetcher for Personalized PageRank.
 *
 * Bridges the pure `getOutEdges` callback expected by {@link computePPR}
 * to the SQLite graph storage via {@link MobiusEdgeRepo}.
 *
 * Three edge layers are combined with configurable weights:
 * 1. **Reference** — wiki links (weight 1.0 each, normalized)
 * 2. **Semantic** — `semantic_related` edges (use stored weight, normalized)
 * 3. **Tag co-occurrence** — 2-hop expansion through shared tags (1/sqrt(tagDocCount), normalized)
 */

import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { GraphEdge } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
import {
	GRAPH_WIKI_REFERENCE_EDGE_TYPES,
	GRAPH_SEMANTIC_DOC_EDGE_TYPES,
	GRAPH_TAGGED_EDGE_TYPES,
} from '@/core/po/graph.po';
import {
	PPR_LAYER_WEIGHT_REFERENCE,
	PPR_LAYER_WEIGHT_SEMANTIC,
	PPR_LAYER_WEIGHT_TAG,
} from '@/core/constant';
import type { MultiLayerEdge } from './personalizedPageRank';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Skip tags shared by more than this many documents (too generic to be informative). */
const TAG_MAX_DOC_COUNT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REFERENCE_TYPE_SET = new Set<string>(GRAPH_WIKI_REFERENCE_EDGE_TYPES);
const SEMANTIC_TYPE_SET = new Set<string>(GRAPH_SEMANTIC_DOC_EDGE_TYPES);
const TAGGED_TYPE_SET = new Set<string>(GRAPH_TAGGED_EDGE_TYPES);

/**
 * Normalize an array of edges so weights sum to 1.
 * Returns empty array if input is empty or total weight is 0.
 */
function normalizeLayer(edges: MultiLayerEdge[]): MultiLayerEdge[] {
	if (edges.length === 0) return [];
	const total = edges.reduce((s, e) => s + e.weight, 0);
	if (total <= 0) return [];
	return edges.map((e) => ({ to: e.to, weight: e.weight / total }));
}

/**
 * Merge multiple weighted layers into a single edge list.
 * Edges to the same target from different layers are summed.
 */
function combineLayers(
	layers: Array<{ edges: MultiLayerEdge[]; lambda: number }>,
): MultiLayerEdge[] {
	const merged = new Map<string, number>();
	for (const { edges, lambda } of layers) {
		if (lambda <= 0) continue;
		for (const e of edges) {
			merged.set(e.to, (merged.get(e.to) ?? 0) + lambda * e.weight);
		}
	}
	const result: MultiLayerEdge[] = [];
	for (const [to, weight] of merged) {
		if (weight > 0) result.push({ to, weight });
	}
	return result;
}

// ---------------------------------------------------------------------------
// Edge fetcher factory
// ---------------------------------------------------------------------------

/**
 * Creates a cached async edge-lookup callback for PPR.
 *
 * The returned function fetches all outgoing edges from SQLite for a given
 * node, separates them into three layers (reference, semantic, tag co-occurrence),
 * normalizes each independently, then combines with configured layer weights.
 *
 * Results are cached per nodeId for the lifetime of the returned closure.
 */
export function createPPREdgeFetcher(
	tenant: IndexTenant,
): (nodeId: string) => Promise<MultiLayerEdge[]> {
	const cache = new Map<string, MultiLayerEdge[]>();

	return async (nodeId: string): Promise<MultiLayerEdge[]> => {
		const cached = cache.get(nodeId);
		if (cached !== undefined) return cached;

		const edgeRepo = SqliteStoreManager.getInstance().getMobiusEdgeRepo(tenant);

		// 1. Fetch all outgoing edges in one query.
		const allEdges: GraphEdge[] = await edgeRepo.getByFromNode(nodeId);

		// 2. Separate into three buckets by edge type.
		const refRaw: MultiLayerEdge[] = [];
		const semRaw: MultiLayerEdge[] = [];
		const tagNodeIds: string[] = [];

		for (const edge of allEdges) {
			if (REFERENCE_TYPE_SET.has(edge.type)) {
				refRaw.push({ to: edge.to_node_id, weight: 1.0 });
			} else if (SEMANTIC_TYPE_SET.has(edge.type)) {
				const w = typeof edge.weight === 'number' && Number.isFinite(edge.weight) && edge.weight > 0
					? edge.weight
					: 1.0;
				semRaw.push({ to: edge.to_node_id, weight: w });
			} else if (TAGGED_TYPE_SET.has(edge.type)) {
				tagNodeIds.push(edge.to_node_id);
			}
		}

		// 3. Tag co-occurrence: 2-hop expansion through shared tags.
		//    For each tag node this doc points to, find other docs pointing to the same tag,
		//    then create virtual edges to those co-tagged docs.
		const tagRaw: MultiLayerEdge[] = [];
		if (tagNodeIds.length > 0) {
			// Reverse lookup: which docs also point to these tag nodes?
			const coTaggedRows = await edgeRepo.getByToNodesAndTypes(
				tagNodeIds,
				[...GRAPH_TAGGED_EDGE_TYPES],
			);

			// Group by tag node → set of docs (excluding self).
			const tagToDocs = new Map<string, Set<string>>();
			for (const row of coTaggedRows) {
				if (row.from_node_id === nodeId) continue; // exclude self
				let docSet = tagToDocs.get(row.to_node_id);
				if (!docSet) {
					docSet = new Set();
					tagToDocs.set(row.to_node_id, docSet);
				}
				docSet.add(row.from_node_id);
			}

			// Create virtual edges: for each shared tag, weight = 1/sqrt(tagDocCount).
			// Skip tags with too many documents (too generic).
			const docWeights = new Map<string, number>();
			for (const [_tagId, docSet] of tagToDocs) {
				const tagDocCount = docSet.size + 1; // +1 for the source node itself
				if (tagDocCount > TAG_MAX_DOC_COUNT) continue;
				const perDocWeight = 1.0 / Math.sqrt(tagDocCount);
				for (const docId of docSet) {
					docWeights.set(docId, (docWeights.get(docId) ?? 0) + perDocWeight);
				}
			}

			for (const [docId, weight] of docWeights) {
				tagRaw.push({ to: docId, weight });
			}
		}

		// 4. Normalize each layer independently.
		const refNorm = normalizeLayer(refRaw);
		const semNorm = normalizeLayer(semRaw);
		const tagNorm = normalizeLayer(tagRaw);

		// 5. Combine with layer weights.
		const result = combineLayers([
			{ edges: refNorm, lambda: PPR_LAYER_WEIGHT_REFERENCE },
			{ edges: semNorm, lambda: PPR_LAYER_WEIGHT_SEMANTIC },
			{ edges: tagNorm, lambda: PPR_LAYER_WEIGHT_TAG },
		]);

		cache.set(nodeId, result);
		return result;
	};
}
