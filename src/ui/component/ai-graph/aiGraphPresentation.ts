import type { LensGraphData } from '@/core/types/lens-graph';
import type { AIGraphArtifactView } from '@/service/ai-graph';

/** Project a canonical immutable AI Graph version into the shared lens canvas. */
export function canonicalAIGraphData(view: AIGraphArtifactView): LensGraphData {
	const nodeById = new Map(view.version.nodes.map((node) => [node.nodeId, node]));
	return {
		nodes: view.version.nodes
			.filter((node) => node.reviewStatus !== 'rejected')
			.map((node) => ({
				label: node.label,
				path: node.canonicalRef?.replace(/^vault:\/\//, '') ?? node.nodeId,
				summary: node.description,
				role: node.kind === 'claim' ? 'bridge' : 'leaf',
			})),
		edges: view.version.relations
			.filter((relation) => relation.reviewStatus !== 'rejected')
			.map((relation) => ({
				source: nodeById.get(relation.sourceNodeId)?.canonicalRef?.replace(/^vault:\/\//, '')
					?? relation.sourceNodeId,
				target: nodeById.get(relation.targetNodeId)?.canonicalRef?.replace(/^vault:\/\//, '')
					?? relation.targetNodeId,
				kind: relation.family === 'temporal'
					? 'temporal'
					: relation.family === 'causal'
						? 'derives'
						: relation.family === 'taxonomic'
							? 'builds_on'
							: relation.family === 'structural'
								? 'link'
								: 'references',
				label: relation.label,
				directionality: relation.directed ? 'directed' : 'undirected',
				canonicalRelationId: relation.relationId,
				accessibleLabel: `${nodeById.get(relation.sourceNodeId)?.label ?? relation.sourceNodeId} → ${relation.predicate} → ${nodeById.get(relation.targetNodeId)?.label ?? relation.targetNodeId}`,
				reviewStatus: relation.reviewStatus,
				confidence: relation.confidence,
				evidenceCount: relation.evidenceIds.length,
				predicate: relation.predicate,
				relationFamily: relation.family,
				qualifiers: relation.qualifiers,
			})),
		availableLenses: ['topology', 'thinking-tree', 'timeline'],
	};
}
