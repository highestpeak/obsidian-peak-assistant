// T8: search adapter. Wraps three infrastructure surfaces and feeds
// the pure `ambientSearch` orchestrator:
//   1. `AppContext.getSearchClient().search(...)` for vault search;
//   2. `AmbientPersistencePort.getLearnedPatterns()` for pattern boost;
//   3. `MobiusNodeRepo` + `MobiusEdgeRepo` + `EmbeddingRepo('vault')`
//      for the 2-hop serendipity traversal (formerly in
//      `service/ambient/SerendipitySearcher.serendipitySearch`).
//
// Behavior is byte-identical to the pre-T8 pipeline: same
// `SearchQuery`, same algorithm (1-hop neighbors → 2-hop bridges →
// document-like filter → embedding distance sort → first-bridge
// deterministic), same `AmbientPushItem` shape.

import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type { SearchQuery, SearchResponse } from '@/core/search/searchTypes';
import type {
	AmbientContext,
	AmbientPushItem,
	AmbientPushSettings,
	AmbientSignal,
} from '@/core/types/ambient';
import type {
	AmbientPersistencePort,
	AmbientSearchDeps,
	AmbientSearchPort,
} from '@/service/ambient/ports/AmbientPorts';
import { ambientSearch } from '@/service/ambient/AmbientSearcher';
import { generateExplanation } from '@/service/ambient/RelevanceExplainer';
import { cosineDistance } from '@/service/ambient/SerendipitySearcher';

export class SearchAmbientSearchAdapter implements AmbientSearchPort {
	private readonly deps: AmbientSearchDeps;

	constructor(private readonly persistence: AmbientPersistencePort) {
		this.deps = {
			searchVault: (query: SearchQuery): Promise<SearchResponse> =>
				AppContext.getSearchClient().search(query),
			getLearnedPatterns: () => this.persistence.getLearnedPatterns(),
			searchSerendipity: (context, existingOutlinksLower, maxResults) =>
				serendipitySearch(context, existingOutlinksLower, maxResults),
		};
	}

	search(
		context: AmbientContext,
		maxItems: number,
		pushHistory: ReadonlyMap<string, number>,
		settings: AmbientPushSettings,
	): Promise<AmbientPushItem[]> {
		return ambientSearch(this.deps, context, maxItems, pushHistory, settings);
	}
}

// ---------------------------------------------------------------------------
// Serendipity 2-hop graph traversal (moved from
// `service/ambient/SerendipitySearcher.serendipitySearch`).
// ---------------------------------------------------------------------------

async function serendipitySearch(
	context: AmbientContext,
	existingOutlinks: ReadonlySet<string>,
	maxResults: number,
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
		if (!sourceEmbedding) return [];

		// 3. Get 1-hop neighbor IDs
		const oneHopMap = await edgeRepo.getNeighborIdsMap([sourceNodeId]);
		const directNeighborIds = new Set(oneHopMap.get(sourceNodeId) ?? []);
		if (directNeighborIds.size === 0) return [];

		// 4. Get 2-hop neighbor IDs (neighbors of neighbors)
		const twoHopMap = await edgeRepo.getNeighborIdsMap(Array.from(directNeighborIds));

		// 5. Collect 2-hop candidates, recording which bridge connects them
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

		interface ScoredCandidate {
			path: string;
			nodeId: string;
			bridgeNodeId: string;
			bridgePath: string | null;
			bridgeLabel: string;
			embeddingDistance: number;
		}

		const candidatesWithEmbeddings: ScoredCandidate[] = [];
		for (const candidateId of docCandidateSet) {
			const node = candidateNodes.get(candidateId);
			if (!node) continue;
			const candidatePath = node.id;
			if (!candidatePath) continue;

			const basename = candidatePath.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase();
			if (existingOutlinks.has(basename)) continue;

			const candidateEmbedding = await embeddingRepo.getEmbeddingForSemanticSearch(candidateId);
			if (!candidateEmbedding) continue;

			const distance = cosineDistance(sourceEmbedding, candidateEmbedding);

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

		candidatesWithEmbeddings.sort((a, b) => b.embeddingDistance - a.embeddingDistance);

		const now = Date.now();
		return candidatesWithEmbeddings.slice(0, maxResults).map((c) => {
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
		console.debug('[SearchAmbientSearchAdapter] Serendipity failed (non-critical):', err);
		return [];
	}
}
