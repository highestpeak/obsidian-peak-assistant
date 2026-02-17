/**
 * Shared graph patch types for stream events (ui-signal channel='graph') and UI animation.
 * Service layer can yield patch payloads without importing UI; UI graphPatches/graphAnimationStore consume these.
 */

export interface GraphPatchNode {
	id: string;
	label: string;
	type?: string;
	badges?: string[];
	path?: string;
	attributes?: Record<string, unknown>;
}

export interface GraphPatchEdge {
	from_node_id: string;
	to_node_id: string;
	weight?: number;
	kind?: string;
}

export interface GraphPatch {
	upsertNodes: GraphPatchNode[];
	upsertEdges: GraphPatchEdge[];
	removeNodeIds?: string[];
	removeEdges?: Array<{ from_node_id: string; to_node_id: string }>;
	focus?: {
		nodeIds?: string[];
		edgeKeys?: string[];
		mode?: 'semantic' | 'physical' | 'mixed';
	};
	meta?: {
		label: string;
		toolName: string;
	};
}
