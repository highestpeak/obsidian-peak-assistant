import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import type { AtlasGraphModel } from '../AtlasGraphModel';

export function resultSubgraphToAtlasModel(
	subgraph: ResultSubgraphOutput,
	id = 'result-subgraph',
): AtlasGraphModel {
	return {
		id,
		nodes: [
			...subgraph.resultNodes.map((node) => ({
				id: node.id,
				label: node.title || node.path || node.id,
				path: node.path,
				role: 'document' as const,
				score: node.score,
				communityId: node.communityId,
				folder: node.folder,
				preview: node.preview,
				signals: node.signals,
				incomingLinks: node.incomingLinks,
				outgoingLinks: node.outgoingLinks,
			})),
			...subgraph.hubAnchors.map((hub) => ({
				id: hub.id,
				label: hub.title || hub.path || hub.id,
				path: hub.path,
				role: 'hub' as const,
				constituentCount: hub.constituentCount,
			})),
		],
		edges: subgraph.edges.map((edge, index) => ({
			id: `${edge.kind}:${edge.from}:${edge.to}:${index}`,
			source: edge.from,
			target: edge.to,
			role: edge.kind,
			directionality: edge.directionality,
			weight: edge.weight,
			relationId: null,
		})),
		communities: subgraph.communities,
		isolationIds: subgraph.isolatedDocIds,
		overflowCount: subgraph.overflowCount,
		layerRole: 'semantic',
	};
}
