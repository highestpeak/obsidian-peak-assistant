/**
 * Pure link resolution: bind link endpoints to node references.
 * Filters out links whose source or target node is missing.
 */

import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId } from '../utils/link-key';

export type ResolvedLink = GraphVizLink & { source: GraphVizNode; target: GraphVizNode };

/**
 * Resolve link source/target from node ids to node references.
 * Returns only links where both endpoints exist; mutates each link's source/target in place
 * and returns the same array (filtered). Caller can use the returned array as new linksRef.
 */
export function resolveLinkEndpoints(
	nodes: GraphVizNode[],
	links: GraphVizLink[]
): ResolvedLink[] {
	const nodeById = new Map(nodes.map((n) => [n.id, n]));
	const result: ResolvedLink[] = [];
	for (const link of links) {
		const sourceId = getLinkEndpointId(link.source);
		const targetId = getLinkEndpointId(link.target);
		const sourceNode = nodeById.get(sourceId);
		const targetNode = nodeById.get(targetId);
		if (!sourceNode || !targetNode) continue;
		(link as ResolvedLink).source = sourceNode;
		(link as ResolvedLink).target = targetNode;
		result.push(link as ResolvedLink);
	}
	return result;
}
