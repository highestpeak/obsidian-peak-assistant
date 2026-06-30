// T11Y-2a: pure serendipity 2-hop traversal + bridge tracking +
// embedding-distance scoring + AmbientPushItem mapping. Lifted out of
// `app/ambient/SearchAmbientSearchAdapter.ts` so the SQLite adapter
// is reduced to raw reads.
//
// The class consumes a `SemanticGraphTraversalReadPort` for graph and
// embedding access; it has NO Obsidian, NO sqlite, NO `AppContext`
// imports. The `test/ambient-source-guard.test.ts` import scan keeps
// it that way.
//
// Algorithm (byte-for-byte preserved from the previous adapter):
//   1. Resolve source node + source embedding.
//   2. Collect 1-hop neighbors via the port.
//   3. Collect 2-hop neighbors (neighbors of neighbors) and, for each
//      candidate, record the FIRST bridge that connected it
//      (`candidateToBridge` insertion order — Map iteration order, set
//      by the port's `getNeighborIdsMap` return order).
//   4. Drop the source itself + any 1-hop neighbor that re-appears at
//      hop-2.
//   5. Filter candidates to document-like node types.
//   6. Drop candidates whose basename is already linked from the
//      source (compare lowercased basenames against
//      `existingOutlinks`).
//   7. Score remaining candidates by cosine distance to the source
//      embedding (higher distance = more serendipitous).
//   8. Sort descending by distance; take top `maxResults`.
//   9. Map to `AmbientPushItem` with a `graph_neighbor` hop-2 signal
//      and a templated excerpt referencing the bridge label.

import type {
	SemanticGraphTraversalReadPort,
} from '@/core/ports/SemanticGraphTraversalReadPort';
import type {
	AmbientContext,
	AmbientPushItem,
	AmbientSignal,
} from '@/core/types/ambient';
import { generateExplanation } from '@/service/ambient/RelevanceExplainer';
import { cosineDistance } from '@/service/ambient/SerendipitySearcher';

interface ScoredCandidate {
	path: string;
	nodeId: string;
	bridgeNodeId: string;
	bridgeLabel: string;
	embeddingDistance: number;
}

export class SerendipitySearcher {
	constructor(
		private readonly graph: SemanticGraphTraversalReadPort,
		private readonly nowFn: () => number = Date.now,
	) {}

	async search(
		context: AmbientContext,
		existingOutlinksLower: ReadonlySet<string>,
		maxResults: number,
	): Promise<AmbientPushItem[]> {
		if (maxResults <= 0) return [];

		try {
			const sourceNodeId = await this.graph.getNodeIdByPath(context.filePath);
			if (!sourceNodeId) return [];

			const sourceEmbedding = await this.graph.getEmbedding(sourceNodeId);
			if (!sourceEmbedding) return [];

			const oneHopMap = await this.graph.getNeighborIdsMap([sourceNodeId]);
			const directNeighborIds = new Set(oneHopMap.get(sourceNodeId) ?? []);
			if (directNeighborIds.size === 0) return [];

			const twoHopMap = await this.graph.getNeighborIdsMap(
				Array.from(directNeighborIds),
			);

			const candidateToBridge = new Map<string, string>();
			for (const [bridgeId, neighbors] of twoHopMap) {
				for (const neighborId of neighbors) {
					if (neighborId === sourceNodeId) continue;
					if (directNeighborIds.has(neighborId)) continue;
					if (!candidateToBridge.has(neighborId)) {
						candidateToBridge.set(neighborId, bridgeId);
					}
				}
			}
			if (candidateToBridge.size === 0) return [];

			const candidateIds = Array.from(candidateToBridge.keys());
			const docCandidateIds = await this.graph.filterToDocumentLikeIds(candidateIds);
			const docCandidateSet = new Set(docCandidateIds);
			if (docCandidateSet.size === 0) return [];

			const allNeededIds = new Set<string>(docCandidateSet);
			for (const candidateId of docCandidateSet) {
				const bridgeId = candidateToBridge.get(candidateId)!;
				allNeededIds.add(bridgeId);
			}
			const candidateNodes = await this.graph.getNodesByIds(Array.from(allNeededIds));

			const scored: ScoredCandidate[] = [];
			for (const candidateId of docCandidateSet) {
				const node = candidateNodes.get(candidateId);
				if (!node) continue;
				const candidatePath = node.nodeId;
				if (!candidatePath) continue;

				const basename = candidatePath
					.replace(/^.*\//, '')
					.replace(/\.md$/, '')
					.toLowerCase();
				if (existingOutlinksLower.has(basename)) continue;

				const candidateEmbedding = await this.graph.getEmbedding(candidateId);
				if (!candidateEmbedding) continue;

				const distance = cosineDistance(sourceEmbedding, candidateEmbedding);

				const bridgeId = candidateToBridge.get(candidateId)!;
				const bridgeNode = candidateNodes.get(bridgeId);
				const bridgeLabel = bridgeNode?.label ?? bridgeId;

				scored.push({
					path: candidatePath,
					nodeId: candidateId,
					bridgeNodeId: bridgeId,
					bridgeLabel,
					embeddingDistance: distance,
				});
			}

			scored.sort((a, b) => b.embeddingDistance - a.embeddingDistance);

			const now = this.nowFn();
			return scored.slice(0, maxResults).map((c) => {
				const signals: AmbientSignal[] = [
					{ type: 'graph_neighbor', hop: 2, via: c.bridgeLabel },
				];
				return {
					filePath: c.path,
					title: c.path.replace(/^.*\//, '').replace(/\.md$/, ''),
					excerpt: `Serendipity: connected via [[${c.bridgeLabel}]] but semantically distant`,
					score: c.embeddingDistance,
					explanation: generateExplanation(signals),
					explanationType: 'template' as const,
					signals,
					timestamp: now,
				};
			});
		} catch (err) {
			console.debug('[SerendipitySearcher] Serendipity failed (non-critical):', err);
			return [];
		}
	}
}
