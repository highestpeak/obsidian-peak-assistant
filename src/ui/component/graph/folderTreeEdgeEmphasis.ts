import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';

export interface FolderTreeTrafficEdge {
	id: string;
	from: string;
	to: string;
	directionality: GraphEdgeDirectionality;
}

/**
 * Measure visible directional traffic for each Tree relation. A relation is
 * stronger when its source fans out heavily or its target receives many
 * incoming links. Undirected relations use ordinary endpoint incidence.
 */
export function buildFolderTreeEdgeTrafficNorm(
	edges: readonly FolderTreeTrafficEdge[],
	degreeCap: number,
): Map<string, number> {
	const cap = Math.max(1, Math.floor(degreeCap));
	const incomingById = new Map<string, number>();
	const outgoingById = new Map<string, number>();
	const incidentById = new Map<string, number>();

	for (const edge of edges) {
		increment(incidentById, edge.from);
		increment(incidentById, edge.to);
		if (edge.directionality === 'undirected') continue;
		increment(outgoingById, edge.from);
		increment(incomingById, edge.to);
		if (edge.directionality !== 'bidirectional') continue;
		increment(incomingById, edge.from);
		increment(outgoingById, edge.to);
	}

	const trafficByEdgeId = new Map<string, number>();
	for (const edge of edges) {
		const traffic = edge.directionality === 'undirected'
			? Math.max(incidentById.get(edge.from) ?? 0, incidentById.get(edge.to) ?? 0)
			: Math.max(
				outgoingById.get(edge.from) ?? 0,
				incomingById.get(edge.to) ?? 0,
				...(edge.directionality === 'bidirectional'
					? [incomingById.get(edge.from) ?? 0, outgoingById.get(edge.to) ?? 0]
					: []),
			);
		trafficByEdgeId.set(edge.id, Math.min(traffic, cap) / cap);
	}
	return trafficByEdgeId;
}

function increment(target: Map<string, number>, id: string): void {
	target.set(id, (target.get(id) ?? 0) + 1);
}
