import type { Node, Edge } from '@xyflow/react';

export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline';

export interface LensNodeData extends Record<string, unknown> {
	label: string;
	path: string;
	role?: 'root' | 'hub' | 'bridge' | 'leaf' | 'orphan';
	group?: string;
	createdAt?: number;
	modifiedAt?: number;
	level?: number;
	parentId?: string;
	summary?: string;
	score?: number;
}

export type LensNode = Node<LensNodeData, 'lensNode'>;

export interface LensEdgeData extends Record<string, unknown> {
	kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain';
	weight?: number;
	edgeLabel?: string;
}

export type LensEdge = Edge<LensEdgeData>;

export interface LensGraphData {
	nodes: LensNodeData[];
	edges: Array<{
		source: string;
		target: string;
		kind: LensEdgeData['kind'];
		weight?: number;
		label?: string;
	}>;
	availableLenses: LensType[];
}
