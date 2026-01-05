import type { GraphNodeRepo } from '@/core/storage/sqlite/repositories/GraphNodeRepo';
import { GraphEdgeRepo } from '@/core/storage/sqlite/repositories/GraphEdgeRepo';
import type { GraphNodePO, GraphEdgePO, GraphNodeType, GraphEdgeType } from '@/core/po/graph.po';
import { extractTags, extractWikiLinks } from '@/core/utils/markdown-utils';
import type { GraphPreview } from './types';

/**
 * Graph store backed by SQLite repositories.
 * 
 * This is the primary interface for all graph operations:
 * - Persists all node and edge data in SQLite
 * - Provides efficient SQL-based queries for basic graph operations
 * - Handles all document indexing and relationship extraction
 * 
 * Design principle: All data persists in SQLite, keeping the plugin lightweight.
 */
export class GraphStore {
	constructor(
		private readonly nodeRepo: GraphNodeRepo,
		private readonly edgeRepo: GraphEdgeRepo,
	) {}

	// ===== Node Operations =====

	/**
	 * Upsert a node.
	 */
	async upsertNode(node: {
		id: string;
		type: GraphNodeType;
		label: string;
		attributes: Record<string, unknown>;
	}): Promise<void> {
		const now = Date.now();
		await this.nodeRepo.upsert({
			id: node.id,
			type: node.type,
			label: node.label,
			attributes: JSON.stringify(node.attributes),
			created_at: now,
			updated_at: now,
		});
	}

	/**
	 * Get node by ID.
	 */
	async getNode(id: string): Promise<GraphNodePO | null> {
		const node = await this.nodeRepo.getById(id);
		if (!node) return null;
		return {
			id: node.id,
			type: node.type as GraphNodeType,
			label: node.label,
			attributes: node.attributes,
			created_at: node.created_at,
			updated_at: node.updated_at,
		};
	}

	/**
	 * Delete node and all its incident edges.
	 */
	async deleteNode(id: string): Promise<void> {
		await this.edgeRepo.deleteByFromNode(id);
		await this.edgeRepo.deleteByToNode(id);
		await this.nodeRepo.deleteById(id);
	}

	/**
	 * Get all nodes of a specific type.
	 */
	async getNodesByType(type: GraphNodeType): Promise<GraphNodePO[]> {
		const nodes = await this.nodeRepo.getByType(type);
		return nodes.map((n) => ({
			id: n.id,
			type: n.type as GraphNodeType,
			label: n.label,
			attributes: n.attributes,
			created_at: n.created_at,
			updated_at: n.updated_at,
		}));
	}

	// ===== Edge Operations =====

	/**
	 * Upsert an edge. If edge exists, weight is incremented.
	 */
	async upsertEdge(edge: {
		fromNodeId: string;
		toNodeId: string;
		type: GraphEdgeType;
		weight?: number;
		attributes?: Record<string, unknown>;
	}): Promise<void> {
		const now = Date.now();
		const edgeId = GraphEdgeRepo.generateEdgeId(edge.fromNodeId, edge.toNodeId, edge.type);
		const existingEdge = await this.edgeRepo.getById(edgeId);

		let weight = edge.weight ?? 1.0;
		if (existingEdge) {
			// Increment weight if edge already exists
			weight = existingEdge.weight + (edge.weight ?? 1.0);
		}

		await this.edgeRepo.upsert({
			id: edgeId,
			from_node_id: edge.fromNodeId,
			to_node_id: edge.toNodeId,
			type: edge.type,
			weight,
			attributes: JSON.stringify(edge.attributes ?? {}),
			created_at: existingEdge?.created_at ?? now,
			updated_at: now,
		});
	}

	/**
	 * Get outgoing edges from a node.
	 */
	async getOutgoingEdges(nodeId: string): Promise<GraphEdgePO[]> {
		const edges = await this.edgeRepo.getByFromNode(nodeId);
		return edges.map((e) => ({
			id: e.id,
			from_node_id: e.from_node_id,
			to_node_id: e.to_node_id,
			type: e.type as GraphEdgeType,
			weight: e.weight,
			attributes: e.attributes,
			created_at: e.created_at,
			updated_at: e.updated_at,
		}));
	}

	/**
	 * Get incoming edges to a node.
	 */
	async getIncomingEdges(nodeId: string): Promise<GraphEdgePO[]> {
		const edges = await this.edgeRepo.getByToNode(nodeId);
		return edges.map((e) => ({
			id: e.id,
			from_node_id: e.from_node_id,
			to_node_id: e.to_node_id,
			type: e.type as GraphEdgeType,
			weight: e.weight,
			attributes: e.attributes,
			created_at: e.created_at,
			updated_at: e.updated_at,
		}));
	}

	/**
	 * Delete edge between two nodes.
	 */
	async deleteEdge(fromNodeId: string, toNodeId: string, type: GraphEdgeType): Promise<void> {
		const edgeId = GraphEdgeRepo.generateEdgeId(fromNodeId, toNodeId, type);
		await this.edgeRepo.deleteById(edgeId);
	}

	// ===== Basic Graph Queries (SQL-based) =====

	/**
	 * Get neighbor node IDs (outgoing).
	 */
	async getNeighborIds(nodeId: string): Promise<string[]> {
		const edges = await this.getOutgoingEdges(nodeId);
		return edges.map((e) => e.to_node_id);
	}

	/**
	 * Get related nodes within N hops (BFS traversal using SQL queries).
	 * This uses efficient SQL queries without loading the entire graph into memory.
	 */
	async getRelatedNodeIds(startNodeId: string, maxHops: number = 2): Promise<Set<string>> {
		const visited = new Set<string>([startNodeId]);
		let frontier = new Set<string>([startNodeId]);

		for (let hop = 0; hop < maxHops; hop++) {
			const next = new Set<string>();
			// Batch-load outgoing neighbors for the whole frontier in one query to avoid N+1.
			const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
			for (const [, neighbors] of neighborMap) {
				for (const neighborId of neighbors) {
					if (!visited.has(neighborId)) {
						visited.add(neighborId);
						next.add(neighborId);
					}
				}
			}
			frontier = next;
			if (!frontier.size) break;
		}

		visited.delete(startNodeId); // Remove start node
		return visited;
	}

	// ===== Document Operations =====

	/**
	 * Upsert a document node into the graph.
	 */
	async upsertDocument(params: { id: string; path: string; docType?: string }): Promise<void> {
		await this.upsertNode({
			id: params.id,
			type: 'document',
			label: params.path,
			attributes: {
				path: params.path,
				docType: params.docType,
			},
		});
	}

	/**
	 * Upsert a markdown document with its relationships (tags, links, categories).
	 * This method extracts relationships from content and persists them in SQLite.
	 */
	async upsertMarkdownDocument(params: {
		id: string;
		path: string;
		content: string;
		docType?: string;
		categories?: string[];
	}): Promise<void> {
		// Upsert document node
		await this.upsertDocument({
			id: params.id,
			path: params.path,
			docType: params.docType,
		});

		// Extract and upsert wiki links
		// TODO: The other node should be document instead of link - documents are only markdown
		const links = extractWikiLinks(params.content);
		for (const link of links) {
			const linkId = `link:${link}`;
			await this.upsertNode({
				id: linkId,
				type: 'link',
				label: link,
				attributes: {
					target: link,
					resolved: false,
				},
			});
			await this.upsertEdge({
				fromNodeId: params.id,
				toNodeId: linkId,
				type: 'references',
				weight: 1.0,
			});
		}

		// TODO: Missing a resource type node, such as image, pdf, etc. These resource nodes must have file type identifier, see DocumentType

		// Extract and upsert tags
		const tags = extractTags(params.content);
		for (const tag of tags) {
			const tagId = `tag:${tag}`;
			await this.upsertNode({
				id: tagId,
				type: 'tag',
				label: tag,
				attributes: {
					tagName: tag,
				},
			});
			await this.upsertEdge({
				fromNodeId: params.id,
				toNodeId: tagId,
				type: 'tagged',
				weight: 1.0,
			});
		}

		// Upsert categories if provided
		if (params.categories) {
			for (const category of params.categories) {
				const categoryId = `category:${category}`;
				await this.upsertNode({
					id: categoryId,
					type: 'category',
					label: category,
					attributes: {
						categoryName: category,
					},
				});
				await this.upsertEdge({
					fromNodeId: params.id,
					toNodeId: categoryId,
					type: 'categorized',
					weight: 1.0,
				});
			}
		}
	}

	/**
	 * Remove a document node and all its incident edges from the graph.
	 * This keeps tag/link/category nodes to avoid expensive garbage collection.
	 */
	async removeDocument(id: string): Promise<void> {
		await this.deleteNode(id);
	}

	/**
	 * Get related file paths within N hops (backward compatibility wrapper).
	 * Returns document IDs that are related to the given document.
	 */
	async getRelatedFilePaths(params: { currentFilePath: string; maxHops?: number }): Promise<Set<string>> {
		const relatedNodeIds = await this.getRelatedNodeIds(params.currentFilePath, params.maxHops ?? 2);
		// Filter to only document nodes in SQL to avoid loading unnecessary data.
		const documentIds = await this.nodeRepo.getIdsByIdsAndTypes(Array.from(relatedNodeIds), ['document']);
		return new Set(documentIds);
	}

	/**
	 * Build a preview subgraph for UI display (N-hop from start node).
	 * This uses efficient SQL queries, no in-memory graph needed.
	 * 
	 * @param params.currentFilePath The starting node ID or file path
	 * @param params.maxNodes Maximum number of nodes to include (default: 30)
	 * @param params.maxHops Maximum hops from the start node (default: 2)
	 */
	async getPreview(params: { currentFilePath: string; maxNodes?: number; maxHops?: number }): Promise<GraphPreview> {
		const maxNodes = params.maxNodes ?? 30;
		const maxHops = Math.max(0, Number(params.maxHops ?? 2));
		const startNode = await this.getNode(params.currentFilePath);
		if (!startNode) {
			return { nodes: [], edges: [] };
		}

		// Get N-hop neighbors using batched SQL queries.
		const keep = new Set<string>([params.currentFilePath]);
		let frontier = new Set<string>([params.currentFilePath]);
		for (let hop = 0; hop < maxHops; hop++) {
			const next = new Set<string>();
			const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
			for (const [, neighbors] of neighborMap) {
				for (const nid of neighbors) {
					if (!keep.has(nid)) {
						keep.add(nid);
						next.add(nid);
					}
				}
			}
			frontier = next;
			if (!frontier.size) break;
		}

		// Build nodes array
		const nodes: GraphPreview['nodes'] = [];
		const nodeMap = await this.nodeRepo.getByIds(Array.from(keep));
		for (const [id, nodeRow] of nodeMap) {
			if (nodes.length >= maxNodes) break;
			const node = {
				id: nodeRow.id,
				type: nodeRow.type as GraphNodeType,
				label: nodeRow.label,
			};

			let label = node.label;
			// Add # prefix for tags
			if (node.type === 'tag') {
				label = `#${node.label}`;
			}

			nodes.push({ id, label, type: node.type });
		}

		// Build edges array
		const nodeSet = new Set(nodes.map((n) => n.id));
		const edges: GraphPreview['edges'] = [];
		const outgoingEdges = await this.edgeRepo.getByFromNodes(Array.from(nodeSet));
		for (const e of outgoingEdges) {
			if (nodeSet.has(e.to_node_id)) {
				edges.push({
					from_node_id: e.from_node_id,
					to_node_id: e.to_node_id,
					weight: e.weight,
				});
			}
		}

		return { nodes, edges };
	}
}
