import type { GraphNodePO, GraphEdgePO } from '@/core/po/graph.po';

/**
 * Graph preview result for UI display.
 * Directly uses PO types, selecting only fields needed for display.
 */
export interface GraphPreview {
	nodes: Pick<GraphNodePO, 'id' | 'label' | 'type'>[];
	edges: Pick<GraphEdgePO, 'from_node_id' | 'to_node_id' | 'weight'>[];
}

/**
 * Parameters for building a graph preview.
 */
export interface GraphPreviewParams {
	/**
	 * Starting node ID or file path.
	 */
	startNodeId: string;
	/**
	 * Maximum number of nodes to include in preview.
	 */
	maxNodes?: number;
}


