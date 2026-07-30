import { MarkerType, type EdgeMarker } from '@xyflow/react';
import type { GraphEdgeDirectionality } from '@/core/types/graph-edge';

interface EdgeMarkers {
	markerStart?: EdgeMarker;
	markerEnd?: EdgeMarker;
}

const ARROW_MARKER: EdgeMarker = {
	type: MarkerType.ArrowClosed,
	width: 18,
	height: 18,
};

export function edgeMarkersForDirectionality(
	directionality: GraphEdgeDirectionality,
): EdgeMarkers {
	if (directionality === 'undirected') return {};
	if (directionality === 'bidirectional') {
		return { markerStart: ARROW_MARKER, markerEnd: ARROW_MARKER };
	}
	return { markerEnd: ARROW_MARKER };
}
