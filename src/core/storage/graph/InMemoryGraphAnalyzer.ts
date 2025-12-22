import Graph from 'graphology';
import type { GraphStore } from './GraphStore';
import type { GraphNodePO, GraphEdgePO, GraphNodeType, GraphEdgeType } from '@/core/po/graph.po';
import type { GraphPreview, GraphPreviewParams } from './types';

// Graphology types are incomplete, use any for graph instance
type GraphInstance = any;

/**
 * In-memory graph analyzer for advanced graph algorithms.
 * 
 * This class builds temporary Graphology graphs on-demand for complex analyses.
 * The graph is loaded from SQLite, used for analysis, and then discarded.
 * 
 * Design Principles:
 * 1. **Minimal Graph Structure**: Only stores essential graph topology:
 *    - Node IDs only (no metadata like attributes, type, label)
 *    - Edge connections and weights (no edge type or attributes)
 *    This keeps memory footprint minimal while preserving graph structure for algorithms.
 * 
 * 2. **On-Demand Metadata Loading**: Metadata (attributes, type, label) is stored in SQLite
 *    and queried on-demand via GraphStore when needed, not loaded into memory.
 * 
 * 3. **Selective Loading**: Supports loading only nodes within N hops (typically 2) of
 *    specified center nodes, avoiding full graph loading for large datasets.
 * 
 * 4. **Temporary Nature**: Graphs are built only when complex algorithms are truly needed,
 *    used for analysis, and then released immediately.
 * 
 * Typical usage:
 * 1. Create analyzer instance with GraphStore
 * 2. Call buildGraph() with center node IDs to load 2-hop neighborhood (or empty for full graph)
 * 3. Perform analysis using Graphology algorithms via getGraph()
 * 4. Query metadata on-demand using getNodeMetadata() if needed
 * 5. Analyzer instance is garbage collected, graph is released
 */
export class InMemoryGraphAnalyzer {
	private graph: GraphInstance | null = null;

	constructor(private readonly graphStore: GraphStore) {}

	/**
	 * Build an in-memory Graphology graph from SQLite data.
	 * 
	 * This method implements a minimal graph structure approach:
	 * - Only loads node IDs and edge connections (no metadata)
	 * - Metadata (attributes, type, label) can be queried on-demand via GraphStore.getNode()
	 * - Supports selective loading: only loads nodes within 2 hops of center nodes
	 * 
	 * Why this approach?
	 * - Reduces memory footprint significantly (especially for large graphs)
	 * - Metadata can change, keeping it in SQLite ensures we always get latest data
	 * - Graph algorithms typically only need topology (connections), not metadata
	 * - Allows working with large graphs by loading only relevant subgraphs
	 * 
	 * @param centerNodeIds Optional: Only load nodes within 2 hops of these center nodes.
	 *   If not provided, loads all nodes (use with caution for large graphs).
	 *   Recommended: Always specify center nodes to load only needed subgraph.
	 */
	buildGraph(centerNodeIds?: string[]): void {
		this.graph = new Graph() as GraphInstance;

		if (centerNodeIds && centerNodeIds.length > 0) {
			const nodesToLoad = this.collectNodesWithinHops(centerNodeIds, 2);
			this.addNodesToGraph(nodesToLoad);
			this.addEdgesBetweenNodes(nodesToLoad);
		} else {
			const allNodeIds = this.collectAllNodeIds();
			this.addNodesToGraph(allNodeIds);
			this.addEdgesBetweenNodes(allNodeIds);
		}
	}

	/**
	 * Collect node IDs within N hops of center nodes.
	 */
	private collectNodesWithinHops(centerNodeIds: string[], maxHops: number): Set<string> {
		const nodesToLoad = new Set<string>(centerNodeIds);
		
		for (let hop = 0; hop < maxHops; hop++) {
			const currentLevel = Array.from(nodesToLoad);
			for (const nodeId of currentLevel) {
				const neighbors = this.graphStore.getNeighborIds(nodeId);
				for (const neighborId of neighbors) {
					nodesToLoad.add(neighborId);
				}
			}
		}

		return nodesToLoad;
	}

	/**
	 * Collect all node IDs from the graph store.
	 */
	private collectAllNodeIds(): Set<string> {
		const allNodeIds = new Set<string>();
		const nodeTypes: GraphNodeType[] = 
			['document', 'tag', 'category', 'link', 'resource', 'concept', 'person', 'project'];
		
		for (const nodeType of nodeTypes) {
			const nodes = this.graphStore.getNodesByType(nodeType);
			for (const node of nodes) {
				allNodeIds.add(node.id);
			}
		}

		return allNodeIds;
	}

	/**
	 * Add nodes to the in-memory graph (only node IDs, no metadata).
	 */
	private addNodesToGraph(nodeIds: Set<string>): void {
		for (const nodeId of nodeIds) {
			if (!this.graph?.hasNode(nodeId)) {
				this.graph?.addNode(nodeId);
			}
		}
	}

	/**
	 * Add edges between nodes to the in-memory graph (only connections and weights).
	 */
	private addEdgesBetweenNodes(nodeIds: Set<string>): void {
		if (!this.graph) return;

		for (const nodeId of nodeIds) {
			const outgoingEdges = this.graphStore.getOutgoingEdges(nodeId);
			for (const edge of outgoingEdges) {
				if (nodeIds.has(edge.to_node_id)) {
					this.addEdgeToGraph(edge);
				}
			}
		}
	}

	/**
	 * Add an edge to the in-memory graph.
	 * 
	 * Only stores essential graph structure:
	 * - Connection (from_node_id -> to_node_id)
	 * - Weight (for algorithm calculations)
	 * 
	 * Does NOT store:
	 * - Edge type (use getEdgeMetadata() to query if needed)
	 * - Edge attributes (use getEdgeMetadata() to query if needed)
	 * 
	 * This keeps the graph minimal and focused on topology.
	 */
	private addEdgeToGraph(edge: GraphEdgePO): void {
		if (!this.graph) return;
		
		const edgeKey = edge.id;
		if (!this.graph.hasEdge(edgeKey) && this.graph.hasNode(edge.from_node_id) && this.graph.hasNode(edge.to_node_id)) {
			try {
				// Only store essential graph structure: connection and weight
				this.graph.addDirectedEdgeWithKey(
					edgeKey,
					edge.from_node_id,
					edge.to_node_id,
					{
						weight: edge.weight,
					},
				);
			} catch (e) {
				// Edge might already exist, ignore
			}
		}
	}

	/**
	 * Get the underlying Graphology graph instance.
	 * Use this to perform advanced graph algorithms.
	 * 
	 * Note: The graph only contains node IDs and edge connections.
	 * To get node metadata (type, label, attributes), use GraphStore.getNode().
	 * 
	 * @throws Error if graph has not been built yet
	 */
	getGraph(): GraphInstance {
		if (!this.graph) {
			throw new Error('Graph has not been built. Call buildGraph() first.');
		}
		return this.graph;
	}

	/**
	 * Get node metadata from GraphStore (on-demand loading).
	 * 
	 * The in-memory graph only contains node IDs. Use this method to query
	 * full node information (type, label, attributes) from SQLite when needed.
	 * 
	 * This approach ensures:
	 * - Minimal memory usage (metadata not duplicated in memory)
	 * - Always up-to-date metadata (queried fresh from SQLite)
	 * - Metadata only loaded when actually needed
	 * 
	 * @param nodeId The node ID to query metadata for
	 * @returns Node metadata including type, label, attributes, or null if not found
	 */
	getNodeMetadata(nodeId: string): GraphNodePO | null {
		return this.graphStore.getNode(nodeId);
	}

	/**
	 * Get edge metadata from GraphStore (on-demand loading).
	 * 
	 * The in-memory graph only contains edge connections and weights.
	 * Use this method to query full edge information (type, attributes) from SQLite when needed.
	 * 
	 * @param fromNodeId Source node ID
	 * @param toNodeId Target node ID
	 * @param edgeType Edge type to match
	 * @returns Edge metadata including type, attributes, or null if not found
	 */
	getEdgeMetadata(fromNodeId: string, toNodeId: string, edgeType: GraphEdgeType): GraphEdgePO | null {
		const edges = this.graphStore.getOutgoingEdges(fromNodeId);
		return edges.find(e => e.to_node_id === toNodeId && e.type === edgeType) ?? null;
	}

	/**
	 * Check if graph has been built.
	 */
	hasGraph(): boolean {
		return this.graph !== null;
	}

	/**
	 * Release the in-memory graph to free memory.
	 * This is automatically done when the analyzer instance is garbage collected,
	 * but can be called explicitly if needed.
	 */
	release(): void {
		if (this.graph) {
			this.graph.clear();
			this.graph = null;
		}
	}

	/**
	 * Build a preview subgraph for UI display (2-hop from start node).
	 * 
	 * This method uses efficient SQL queries via GraphStore without building
	 * an in-memory Graphology graph. Metadata (label, type) is loaded on-demand.
	 * 
	 * For simple queries like preview/display, SQL queries are sufficient and
	 * more efficient than building a Graphology graph. Use buildGraph() only
	 * when you need advanced graph algorithms.
	 */
	buildPreview(params: GraphPreviewParams): GraphPreview {
		// Use GraphStore's getPreview which already implements efficient SQL-based query
		return this.graphStore.getPreview({ currentFilePath: params.startNodeId, maxNodes: params.maxNodes });
	}

	/**
	 * Get related document IDs within N hops (uses SQL queries, no Graphology needed).
	 * 
	 * This is a basic query that uses SQL via GraphStore. It doesn't require
	 * building an in-memory graph because simple traversals can be done efficiently
	 * with SQL queries. Use buildGraph() only when you need complex graph algorithms
	 * that Graphology provides (e.g., community detection, shortest paths, etc.).
	 */
	getRelatedDocumentIds(params: { documentId: string; maxHops?: number }): Set<string> {
		const maxHops = params.maxHops ?? 2;
		const relatedNodeIds = this.graphStore.getRelatedNodeIds(params.documentId, maxHops);

		// Filter to only document nodes
		const documentIds = new Set<string>();
		for (const nodeId of relatedNodeIds) {
			const node = this.graphStore.getNode(nodeId);
			if (node?.type === 'document') {
				documentIds.add(nodeId);
			}
		}
		return documentIds;
	}
}

