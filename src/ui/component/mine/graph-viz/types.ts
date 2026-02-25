/**
 * Graph visualization types.
 * kind is string for extensibility; no domain-specific unions.
 */

import { GraphPatch } from "./utils/graphPatches";

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
	/** Velocity (set by D3 force simulation). */
	vx?: number;
	vy?: number;
	/** Set when node is first added; used for stream fade-in animation. */
	enterTime?: number;
};

export type GraphVizLink = {
	source: string | GraphVizNode;
	target: string | GraphVizNode;
	weight: number;
	kind: string;
	/** Set by layout: true if edge is in maximum spanning tree (stronger spring in force layout). */
	isMSTEdge?: boolean;
	/** Mindflow/domain attributes (e.g. mindflow.main, mindflow.opacityHint). */
	attributes?: Record<string, unknown>;
};

export type GraphSnapshot = {
	nodes: GraphUINode[];
	edges: Array<{ source: string; target: string; kind: string; weight: number }>;
};

export type GraphVisualizationHandle = {
	applyPatch: (patch: GraphPatch) => Promise<void>;
	clear: () => void;
	/** Fit graph in view; pass true to force even if user has interacted. */
	fitToView: (force?: boolean) => void;
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

/** Config for node context menu. Each callback controls whether the corresponding menu item is shown. */
export type NodeContextMenuConfig = {
	onOpenSource?: (path: string) => void | Promise<void>;
	onCopyLabel?: (text: string) => void | Promise<void>;
	onCopyPath?: (path: string) => void | Promise<void>;
	/** Fold/unfold leaf neighbors of this node. Called with node id. */
	onFoldNode?: (nodeId: string) => void;
	/** On-graph path: set start node (by id). */
	onSetPathStartNode?: (nodeId: string) => void;
	/** On-graph path: set end node and compute path (by id). */
	onSetPathEndNode?: (nodeId: string) => void;
	/** Current path start node id (for menu: disable "Set as start" on same node). */
	pathStartNodeId?: string | null;
	runGraphTool?: (
		tool: 'inspect_note_context' | 'graph_traversal' | 'find_path' | 'find_key_nodes',
		input: Record<string, unknown>
	) => void | Promise<unknown>;
	pathStart?: string | null;
	setPathStart?: (path: string | null) => void;
	onOpenChatForNode?: (node: GraphVizNodeInfo) => void;
	onToggleFollowup?: () => void;
};

export type ToolbarHopsValue = 1 | 2 | 3;

export type ToolbarHopsConfig = {
	value: ToolbarHopsValue;
	onChange: (h: ToolbarHopsValue) => void;
};

/** Path result shape for find-path: paths array and optional markdown. */
export type FindPathResult = { paths?: string[]; markdown?: string } | null;

export type ToolbarFindPathConfig = {
	pathStart: string | null;
	setPathStart?: (path: string | null) => void;
	runFindPath: (startPath: string, targetPath: string) => Promise<{ paths?: string[]; markdown?: string; error?: string }>;
	onPathResult?: (result: FindPathResult) => void;
	candidatePaths?: Array<{ path: string; label: string }>;
};

export type GraphBelowExtraAnalysisAreaConfig = {
	hops?: ToolbarHopsConfig;
	findPath?: ToolbarFindPathConfig;
};
