/**
 * Graph visualization types.
 * kind is string for extensibility; no domain-specific unions.
 */

export type GraphUINode = {
	id: string;
	label: string;
	type: string;
	badges?: string[];
	attributes?: Record<string, unknown>;
};

export type GraphUIEdge = {
	id?: string;
	from_node_id: string;
	to_node_id: string;
	weight?: number;
	kind?: string;
	attributes?: Record<string, unknown>;
};

export type UIPreviewGraph = {
	nodes: GraphUINode[];
	edges: GraphUIEdge[];
};

export type GraphVizNode = GraphUINode & {
	r: number;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
};

export type GraphVizLink = {
	source: string | GraphVizNode;
	target: string | GraphVizNode;
	weight: number;
	kind: string;
};

export type GraphSnapshot = {
	nodes: GraphUINode[];
	edges: Array<{ source: string; target: string; kind: string; weight: number }>;
};

export type GraphVisualizationHandle = {
	applyPatch: (patch: import('@/ui/component/mine/graph-viz/utils/graphPatches').GraphPatch) => Promise<void>;
	clear: () => void;
	fitToView: () => void;
};

export type GraphVizNodeInfo = {
	id: string;
	label: string;
	type: string;
	/** Optional app-specific path (e.g. vault-relative file path). */
	path: string | null;
};

export type GraphVizNodeHoverInfo = {
	node: GraphVizNodeInfo;
	x: number;
	y: number;
};

export type EdgeStyle = {
	stroke?: string;
	strokeOpacity?: number;
	strokeDasharray?: string | null;
	strokeWidth?: number;
	strokeDashoffset?: number | null;
};

export type NodeStyle = {
	fill?: string;
	r?: number;
};
