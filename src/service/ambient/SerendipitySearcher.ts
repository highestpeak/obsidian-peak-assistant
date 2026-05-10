import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { AmbientContext, AmbientPushItem, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';

/**
 * A serendipity candidate: a note that is 2-hops away in the graph
 * but maximally distant in embedding space.
 */
export interface SerendipityCandidate {
	/** File path of the candidate note */
	path: string;
	/** Node ID in the graph */
	nodeId: string;
	/** The bridge note that connects source to this candidate (1-hop intermediary) */
	bridgeNodeId: string;
	bridgePath: string | null;
	bridgeLabel: string;
	/** Embedding distance from source (higher = more serendipitous) */
	embeddingDistance: number;
}

/**
 * Find notes that are exactly 2 hops away in the knowledge graph
 * but maximally distant in embedding space — the "serendipity sweet spot".
 *
 * Algorithm:
 * 1. Get 1-hop neighbors of source (direct neighbors)
 * 2. Get 1-hop neighbors of those neighbors (2-hop candidates)
 * 3. Filter out source and direct neighbors
 * 4. For remaining candidates, compute embedding distance from source
 * 5. Sort by embedding distance DESC — most distant = most serendipitous
 * 6. Return top-N
 *
 * @param context - Current ambient context
 * @param existingOutlinks - Already-linked notes to exclude
 * @param maxResults - Maximum serendipity candidates to return (default: 3)
 */
export async function serendipitySearch(
	context: AmbientContext,
	existingOutlinks: Set<string>,
	maxResults: number = 3,
): Promise<AmbientPushItem[]> {
	try {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo('vault');

		// 1. Get source node
		const sourceNode = await mobiusNodeRepo.getByPath(context.filePath);
		if (!sourceNode) return [];
		const sourceNodeId = sourceNode.node_id;

		// 2. Get source embedding for distance comparison
		const sourceEmbedding = await embeddingRepo.getEmbeddingForSemanticSearch(sourceNodeId);
		if (!sourceEmbedding) return []; // No embedding = can't compute distance

		// 3. Get 1-hop neighbor IDs
		const oneHopMap = await edgeRepo.getNeighborIdsMap([sourceNodeId]);
		const directNeighborIds = new Set(oneHopMap.get(sourceNodeId) ?? []);
		if (directNeighborIds.size === 0) return [];

		// 4. Get 2-hop neighbor IDs (neighbors of neighbors)
		const twoHopMap = await edgeRepo.getNeighborIdsMap(Array.from(directNeighborIds));

		// 5. Collect 2-hop candidates, recording which bridge connects them
		//    candidateId -> bridgeNodeId
		const candidateToBridge = new Map<string, string>();
		for (const [bridgeId, neighbors] of twoHopMap) {
			for (const neighborId of neighbors) {
				// Exclude source node and direct neighbors
				if (neighborId === sourceNodeId) continue;
				if (directNeighborIds.has(neighborId)) continue;
				// Keep the first bridge found (arbitrary but deterministic)
				if (!candidateToBridge.has(neighborId)) {
					candidateToBridge.set(neighborId, bridgeId);
				}
			}
		}

		if (candidateToBridge.size === 0) return [];

		// 6. Filter to document-like nodes only
		const candidateIds = Array.from(candidateToBridge.keys());
		const docCandidateIds = await mobiusNodeRepo.getIdsByIdsAndTypes(
			candidateIds,
			[...GRAPH_DOCUMENT_LIKE_NODE_TYPES],
		);
		const docCandidateSet = new Set(docCandidateIds);

		// 7. Get graph nodes for all document candidates + bridges (batch)
		const allNeededIds = new Set<string>(docCandidateSet);
		for (const candidateId of docCandidateSet) {
			const bridgeId = candidateToBridge.get(candidateId)!;
			allNeededIds.add(bridgeId);
		}
		const candidateNodes = await mobiusNodeRepo.getByIds(Array.from(allNeededIds));

		// 8. Score candidates by embedding distance
		const candidatesWithEmbeddings: SerendipityCandidate[] = [];

		for (const candidateId of docCandidateSet) {
			const node = candidateNodes.get(candidateId);
			if (!node) continue;

			// For document nodes, the node ID is the normalized vault path
			const candidatePath = node.id;
			if (!candidatePath) continue;

			// Skip already-linked notes
			const basename = candidatePath.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase();
			if (existingOutlinks.has(basename)) continue;

			// Get candidate embedding
			const candidateEmbedding = await embeddingRepo.getEmbeddingForSemanticSearch(candidateId);
			if (!candidateEmbedding) continue;

			// Compute cosine distance (1 - cosine_similarity)
			const distance = cosineDistance(sourceEmbedding, candidateEmbedding);

			// Resolve bridge info
			const bridgeId = candidateToBridge.get(candidateId)!;
			const bridgeNode = candidateNodes.get(bridgeId);
			let bridgePath: string | null = null;
			let bridgeLabel = bridgeId;
			if (bridgeNode) {
				bridgeLabel = bridgeNode.label;
				bridgePath = bridgeNode.id;
			}

			candidatesWithEmbeddings.push({
				path: candidatePath,
				nodeId: candidateId,
				bridgeNodeId: bridgeId,
				bridgePath,
				bridgeLabel,
				embeddingDistance: distance,
			});
		}

		// 9. Sort by embedding distance DESC — most distant first
		candidatesWithEmbeddings.sort((a, b) => b.embeddingDistance - a.embeddingDistance);

		// 10. Convert top-N to AmbientPushItems
		const now = Date.now();
		return candidatesWithEmbeddings.slice(0, maxResults).map((c) => {
			const signals: AmbientSignal[] = [
				{ type: 'graph_neighbor', hop: 2, via: c.bridgeLabel },
			];
			return {
				filePath: c.path,
				title: c.path.replace(/^.*\//, '').replace(/\.md$/, ''),
				excerpt: `Serendipity: connected via [[${c.bridgeLabel}]] but semantically distant`,
				score: c.embeddingDistance, // Higher distance = higher serendipity score
				explanation: generateExplanation(signals),
				explanationType: 'template' as const,
				signals,
				timestamp: now,
			};
		});
	} catch (err) {
		console.debug('[SerendipitySearcher] Search failed (non-critical):', err);
		return [];
	}
}

/**
 * Compute cosine distance between two vectors: 1 - cosine_similarity.
 * Returns 0 for identical vectors, 2 for opposite vectors.
 */
export function cosineDistance(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 1;

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) return 1;

	return 1 - dotProduct / denominator;
}
