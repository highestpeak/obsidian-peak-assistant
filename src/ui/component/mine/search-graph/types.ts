/** Minimal graph node for UI preview rendering. */
export type GraphUINode = {
	id: string;
	label: string;
	type: string;
	badges?: string[];
	attributes?: Record<string, unknown>;
};

/** Minimal graph edge for UI preview rendering. */
export type GraphUIEdge = {
	id?: string;
	from_node_id: string;
	to_node_id: string;
	kind?: string;
	weight?: number;
	attributes?: Record<string, unknown>;
};

/** Graph data shape consumed by search graph components. */
export type UIPreviewGraph = {
	nodes: GraphUINode[];
	edges: GraphUIEdge[];
};
