/**
 * Link utilities for graph visualization.
 */

import type { GraphVizLink, GraphVizNode } from '../types';

export function getLinkEndpointId(v: string | GraphVizNode): string {
	return typeof v === 'string' ? v : v.id;
}

export function linkKey(
	l: GraphVizLink,
	normalizeNodeId: (id: string) => string = (id) => id
): string {
	const sourceId = normalizeNodeId(getLinkEndpointId(l.source));
	const targetId = normalizeNodeId(getLinkEndpointId(l.target));
	return `edge-${sourceId}::${targetId}::${l.kind}`;
}
