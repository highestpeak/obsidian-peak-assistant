import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';

/**
 * Graph preview result for UI display (`graph_nodes` / `graph_edges` field picks).
 */
export interface GraphPreview {
	nodes: Pick<DbSchema['graph_nodes'], 'id' | 'label' | 'type'>[];
	edges: Pick<DbSchema['graph_edges'], 'from_node_id' | 'to_node_id' | 'weight'>[];
}

/**
 * Parameters for building a graph preview.
 */
export interface GraphPreviewParams {
	/** Starting node ID or file path. */
	startNodeId: string;
	/** Maximum number of nodes to include in preview. */
	maxNodes?: number;
}
