import {
	coalesceGraphEdges,
	type GraphEdgeDirectionality,
} from '@/core/types/graph-edge';

export type SourcesGraphEdgeKind = 'reference' | 'semantic';

export interface SourcesGraphCandidateEdge {
	fromNodeId: string;
	toNodeId: string;
	kind: SourcesGraphEdgeKind;
}

export interface ProjectedSourcesGraphEdge {
	id: string;
	from_node_id: string;
	to_node_id: string;
	kind: SourcesGraphEdgeKind;
	directionality: GraphEdgeDirectionality;
}

export function projectSourcesGraphEdges(
	candidates: readonly SourcesGraphCandidateEdge[],
	docIdToDisplayId: ReadonlyMap<string, string>,
): ProjectedSourcesGraphEdge[] {
	const displayEdges = candidates.flatMap((candidate) => {
		const from = docIdToDisplayId.get(candidate.fromNodeId);
		const to = docIdToDisplayId.get(candidate.toNodeId);
		if (!from || !to || from === to) return [];
		return [{
			from,
			to,
			kind: candidate.kind,
			directionality: candidate.kind === 'semantic' ? 'undirected' as const : 'directed' as const,
		}];
	});

	return coalesceGraphEdges(displayEdges).map((edge) => ({
		id: `e-${edge.kind}-${edge.from}-${edge.to}`,
		from_node_id: edge.from,
		to_node_id: edge.to,
		kind: edge.kind,
		directionality: edge.directionality,
	}));
}
