// T11H (2026-06-26): framework-agnostic Lens graph types now live in
// `@/core/graph/lensGraphTypes`; this module re-exports them and adds
// the ReactFlow-coupled aliases (`LensNode` / `LensEdge`) used by the
// React component layer. Service- and core-side callers should import
// directly from `@/core/graph/lensGraphTypes` so the service -> ui
// boundary stays clean.

import type { Node, Edge } from '@xyflow/react';
import type { LensNodeData, LensEdgeData } from '@/core/graph/lensGraphTypes';

export type {
	LensType,
	LensNodeData,
	LensEdgeData,
	LensGraphData,
} from '@/core/graph/lensGraphTypes';

export type LensNode = Node<LensNodeData, 'lensNode'>;
export type LensEdge = Edge<LensEdgeData>;
