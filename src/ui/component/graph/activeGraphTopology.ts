import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';

export interface ActiveGraphTopology {
	activeDegreeById: Map<string, number>;
	structuralDegreeById: Map<string, number>;
	semanticDegreeById: Map<string, number>;
	isolatedNodeIds: Set<string>;
	semanticOnlyNodeIds: Set<string>;
}

type GraphEdge = ResultSubgraphOutput['edges'][number];

/**
 * Classify nodes from the edges that are actually visible in the active graph.
 * A semantic-only document is connected when the Semantic edges layer is on;
 * only a node with degree zero in that active topology belongs in the detached
 * packing region.
 */
export function buildActiveGraphTopology(
	nodeIds: readonly string[],
	edges: readonly GraphEdge[],
	showSemantic: boolean,
): ActiveGraphTopology {
	const nodeIdSet = new Set(nodeIds);
	const activeDegreeById = new Map<string, number>();
	const structuralDegreeById = new Map<string, number>();
	const semanticDegreeById = new Map<string, number>();

	for (const edge of edges) {
		if (edge.from === edge.to) continue;
		if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;
		const semantic = edge.kind === 'semantic';
		increment(semantic ? semanticDegreeById : structuralDegreeById, edge.from);
		increment(semantic ? semanticDegreeById : structuralDegreeById, edge.to);
		if (semantic && !showSemantic) continue;
		increment(activeDegreeById, edge.from);
		increment(activeDegreeById, edge.to);
	}

	const isolatedNodeIds = new Set<string>();
	const semanticOnlyNodeIds = new Set<string>();
	for (const nodeId of nodeIds) {
		const activeDegree = activeDegreeById.get(nodeId) ?? 0;
		const structuralDegree = structuralDegreeById.get(nodeId) ?? 0;
		const semanticDegree = semanticDegreeById.get(nodeId) ?? 0;
		if (activeDegree === 0) isolatedNodeIds.add(nodeId);
		if (showSemantic && structuralDegree === 0 && semanticDegree > 0) {
			semanticOnlyNodeIds.add(nodeId);
		}
	}

	return {
		activeDegreeById,
		structuralDegreeById,
		semanticDegreeById,
		isolatedNodeIds,
		semanticOnlyNodeIds,
	};
}

function increment(target: Map<string, number>, id: string): void {
	target.set(id, (target.get(id) ?? 0) + 1);
}
