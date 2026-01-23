import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { generateStableUuid } from '@/core/utils/id-utils';

export type GraphEdge = DbSchema['graph_edges'];

/**
 * CRUD repository for `graph_edges` table.
 */
export class GraphEdgeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Generate edge ID (now returns a UUID instead of composite string for better storage efficiency).
	 */
	static generateEdgeId(fromNodeId: string, toNodeId: string, type: string): string {
		// Import here to avoid circular dependencies
		return generateStableUuid(fromNodeId + toNodeId + type);
	}

	/**
	 * Check if graph edge exists by id.
	 */
	async existsById(id: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('graph_edges')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new graph edge.
	 */
	async insert(edge: {
		id: string;
		from_node_id: string;
		to_node_id: string;
		type: string;
		weight: number;
		attributes: string;
		created_at: number;
		updated_at: number;
	}): Promise<void> {
		await this.db
			.insertInto('graph_edges')
			.values(edge)
			.execute();
	}

	/**
	 * Update existing graph edge by id.
	 */
	async updateById(id: string, updates: Partial<Pick<DbSchema['graph_edges'], 'weight' | 'attributes' | 'updated_at'>>): Promise<void> {
		await this.db
			.updateTable('graph_edges')
			.set(updates)
			.where('id', '=', id)
			.execute();
	}

	/**
	 * Upsert a graph edge.
	 */
	async upsert(edge: {
		id?: string;
		from_node_id: string;
		to_node_id: string;
		type: string;
		weight?: number;
		attributes: string;
		created_at?: number;
		updated_at?: number;
	}): Promise<void> {
		const now = Date.now();
		const id = edge.id ?? GraphEdgeRepo.generateEdgeId(edge.from_node_id, edge.to_node_id, edge.type);

		const exists = await this.existsById(id);

		if (exists) {
			// Update existing edge
			await this.updateById(id, {
				weight: edge.weight ?? 1.0,
				attributes: edge.attributes,
				updated_at: edge.updated_at ?? now,
			});
		} else {
			// Insert new edge
			await this.insert({
				id,
				from_node_id: edge.from_node_id,
				to_node_id: edge.to_node_id,
				type: edge.type,
				weight: edge.weight ?? 1.0,
				attributes: edge.attributes,
				created_at: edge.created_at ?? now,
				updated_at: edge.updated_at ?? now,
			});
		}
	}

	/**
	 * Get edge by ID.
	 */
	async getById(id: string): Promise<DbSchema['graph_edges'] | null> {
		const row = await this.db.selectFrom('graph_edges').selectAll().where('id', '=', id).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get edges by from_node_id.
	 */
	async getByFromNode(fromNodeId: string): Promise<DbSchema['graph_edges'][]> {
		return await this.db.selectFrom('graph_edges').selectAll().where('from_node_id', '=', fromNodeId).execute();
	}

	/**
	 * Get edges by from_node_id (batch).
	 */
	async getByFromNodes(fromNodeIds: string[]): Promise<DbSchema['graph_edges'][]> {
		if (!fromNodeIds.length) return [];
		return await this.db.selectFrom('graph_edges').selectAll().where('from_node_id', 'in', fromNodeIds).execute();
	}

	/**
	 * Get edges by from_node_ids and types (batch).
	 * todo we may need pagination for large result.
	 */
	async getByFromNodesAndTypes(fromNodeIds: string[], types: string[]): Promise<{ to_node_id: string; from_node_id: string; }[]> {
		if (!fromNodeIds.length || !types.length) return [];
		const rows = await this.db
			.selectFrom('graph_edges')
			.select(['to_node_id', 'from_node_id'])
			.where('from_node_id', 'in', fromNodeIds)
			.where('type', 'in', types)
			.execute();
		return rows;
	}

	/**
	 * group count node's in coming edges by type.
	 * return a map: to_node_id -> count
	 */
	async countInComingEdges(nodeIds: string[], type?: string): Promise<Map<string, number>> {
		const query = this.db
			.selectFrom('graph_edges')
			.select(({ fn }) => [
				fn.count<number>('id').as('count'),
				'to_node_id',
			])
			.where('to_node_id', 'in', nodeIds);

		if (type !== undefined) {
			query.where('type', '=', type);
		}

		const rows = await query
			.groupBy(['to_node_id'])
			.execute();
		const map = new Map<string, number>();
		for (const row of rows) {
			map.set(row.to_node_id, row.count);
		}
		return map;
	}

	/**
	 * group count node's outgoing edges by type.
	 * return a map: from_node_id -> count
	 * If type is undefined, do not filter by type.
	 */
	async countOutgoingEdges(nodeIds: string[], type?: string): Promise<Map<string, number>> {
		const query = this.db
			.selectFrom('graph_edges')
			.select(({ fn }) => [
				fn.count<number>('id').as('count'),
				'from_node_id',
			])
			.where('from_node_id', 'in', nodeIds);

		if (type !== undefined) {
			query.where('type', '=', type);
		}

		const rows = await query
			.groupBy(['from_node_id'])
			.execute();
		const map = new Map<string, number>();
		for (const row of rows) {
			map.set(row.from_node_id, row.count);
		}
		return map;
	}

	/**
	 * group count node's edges by type.
	 * return a map: node_id -> count
	 */
	async countEdges(nodeIds: string[], type?: string): Promise<{ incoming: Map<string, number>; outgoing: Map<string, number> , total: Map<string, number> }> {
		const incoming = await this.countInComingEdges(nodeIds, type);
		const outgoing = await this.countOutgoingEdges(nodeIds, type);
		const total = new Map<string, number>();
		for (const nodeId of nodeIds) {
			total.set(nodeId, (incoming.get(nodeId) ?? 0) + (outgoing.get(nodeId) ?? 0));
		}
		return { incoming, outgoing, total };
	}

	/**
	 * Batch get neighbor node IDs for multiple nodes.
	 *
	 * Returns a map: node_id -> neighbor_id[]
	 */
	async getNeighborIdsMap(nodeIds: string[]): Promise<Map<string, string[]>> {
		if (!nodeIds.length) return new Map();
		const rows = await this.db
			.selectFrom('graph_edges')
			.select(['from_node_id', 'to_node_id'])
			.where('from_node_id', 'in', nodeIds)
			.execute();
		const out = new Map<string, string[]>();
		for (const r of rows) {
			const key = String(r.from_node_id);
			const arr = out.get(key) ?? [];
			arr.push(String(r.to_node_id));
			out.set(key, arr);
		}
		return out;
	}

	/**
	 * Get edges by to_node_id.
	 */
	async getByToNode(toNodeId: string): Promise<DbSchema['graph_edges'][]> {
		return await this.db.selectFrom('graph_edges').selectAll().where('to_node_id', '=', toNodeId).execute();
	}

	/**
	 * Get edges between two nodes.
	 */
	async getBetweenNodes(fromNodeId: string, toNodeId: string): Promise<DbSchema['graph_edges'][]> {
		const rows = await this.db
			.selectFrom('graph_edges')
			.selectAll()
			.where('from_node_id', '=', fromNodeId)
			.where('to_node_id', '=', toNodeId)
			.execute();
		return rows;
	}

	/**
	 * Get edges by type.
	 */
	async getByType(type: string): Promise<DbSchema['graph_edges'][]> {
		return await this.db.selectFrom('graph_edges').selectAll().where('type', '=', type).execute();
	}

	/**
	 * Get edges by custom WHERE clause.
	 */
	async getByCustomWhere(whereClause: string): Promise<DbSchema['graph_edges'][]> {
		if (!whereClause.trim()) return [];
		// Create a simple compiled query object for raw SQL
		const compiledQuery = {
			sql: `SELECT * FROM graph_edges WHERE ${whereClause}`,
			parameters: [],
			query: {} // Add required query property
		} as any;
		const result = await this.db.executeQuery(compiledQuery);
		return result.rows as DbSchema['graph_edges'][];
	}

	/**
	 * Get nodes with zero out-degree (no outgoing edges).
	 * todo cache degree fields in graph_nodes table.
	 * @param limit Maximum number of nodes to return
	 */
	async getNodesWithZeroOutDegree(limit?: number): Promise<string[]> {
		let query = this.db
			.selectFrom('graph_nodes')
			.leftJoin('graph_edges', 'graph_nodes.id', 'graph_edges.from_node_id')
			.select('graph_nodes.id')
			.where('graph_edges.from_node_id', 'is', null);

		if (limit) {
			query = query.limit(limit);
		}

		const rows = await query.execute();
		return rows.map(row => row.id);
	}

	/**
	 * Get nodes with zero in-degree (no incoming edges).
	 * todo cache degree fields in graph_nodes table.
	 * @param limit Maximum number of nodes to return
	 */
	async getNodesWithZeroInDegree(limit?: number): Promise<string[]> {
		let query = this.db
			.selectFrom('graph_nodes')
			.leftJoin('graph_edges', 'graph_nodes.id', 'graph_edges.to_node_id')
			.select('graph_nodes.id')
			.where('graph_edges.to_node_id', 'is', null);

		if (limit) {
			query = query.limit(limit);
		}

		const rows = await query.execute();
		return rows.map(row => row.id);
	}

	/**
	 * // TODO: Implement using redundant degree fields in graph_nodes table
	 * Get hard orphan nodes (zero in-degree AND zero out-degree).
	 * @param limit Maximum number of orphans to return
	 */
	async getHardOrphanNodeIds(limit?: number): Promise<string[]> {
		// Get nodes with zero out-degree and zero in-degree
		const zeroOutNodes = await this.getNodesWithZeroOutDegree(limit);
		const zeroInNodes = await this.getNodesWithZeroInDegree(limit);

		// Find intersection: nodes that appear in both lists
		const zeroOutSet = new Set(zeroOutNodes);
		const hardOrphans = zeroInNodes.filter(nodeId => zeroOutSet.has(nodeId));

		// Apply limit if specified
		return limit ? hardOrphans.slice(0, limit) : hardOrphans;
	}

	/**
	 * Get hard orphan nodes with full node information.
	 * Uses separate queries to avoid JOIN operations.
	 * @param limit Maximum number of orphans to return
	 */
	async getHardOrphans(limit?: number): Promise<string[]> {
		// Get orphan node IDs first
		const orphanIds = await this.getHardOrphanNodeIds(limit);

		if (orphanIds.length === 0) {
			return [];
		}

		return orphanIds;
	}

	/**
	 * Get nodes with low degree (1-2 total connections).
	 * TODO: Implement after adding redundant in_degree/out_degree fields to graph_nodes table
	 * This will allow efficient querying without expensive JOIN operations
	 *
	 * @param maxConnections Maximum total connections (default: 2)
	 * @param limit Maximum number of nodes to return
	 */
	async getNodesWithLowDegree(maxConnections: number = 2, limit?: number): Promise<Array<{ nodeId: string; totalConnections: number }>> {
		// TODO: Implement using redundant degree fields in graph_nodes table
		// SELECT id, in_degree + out_degree as total_connections
		// FROM graph_nodes
		// WHERE in_degree + out_degree BETWEEN 1 AND ?
		// ORDER BY total_connections
		// LIMIT ?

		// Temporary empty implementation until redundant fields are added
		return [];
	}

	/**
	 * Get top nodes by degree metrics (in-degree, out-degree).
	 * Returns only node IDs grouped by degree type.
	 *
	 * @param limit Maximum number of nodes to return per degree type. If not provided, returns all nodes.
	 * @param nodeIdFilter Optional list of node IDs to filter by. If provided, only consider degrees for these nodes.
	 *
	 * TODO: refactor suggestion - add some fields to the node table, as cache fields, such as total degree, out degree, in degree etc.
	 *  by sacrificing write to improve query! it can be used in find key note, and it has great value -- or just put it in the statistics table
	 */
	async getTopNodeIdsByDegree(limit?: number, nodeIdFilter?: string[]): Promise<{
		topByOutDegree: Array<{ nodeId: string; outDegree: number }>;
		topByInDegree: Array<{ nodeId: string; inDegree: number }>;
	}> {
		// Get out-degree stats (only node IDs and counts)
		let outDegreeQuery = this.db
			.selectFrom('graph_edges')
			.select([
				'from_node_id as nodeId',
				({ fn }) => fn.count<number>('id').as('outDegree')
			])
			.groupBy('from_node_id')
			.orderBy('outDegree', 'desc');

		// Get in-degree stats (only node IDs and counts)
		let inDegreeQuery = this.db
			.selectFrom('graph_edges')
			.select([
				'to_node_id as nodeId',
				({ fn }) => fn.count<number>('id').as('inDegree')
			])
			.groupBy('to_node_id')
			.orderBy('inDegree', 'desc');

		// Apply node ID filter if provided
		if (nodeIdFilter && nodeIdFilter.length > 0) {
			outDegreeQuery = outDegreeQuery.where('from_node_id', 'in', nodeIdFilter);
			inDegreeQuery = inDegreeQuery.where('to_node_id', 'in', nodeIdFilter);
		}

		// Apply limit if provided
		if (limit !== undefined) {
			outDegreeQuery = outDegreeQuery.limit(limit);
			inDegreeQuery = inDegreeQuery.limit(limit);
		}

		const [outDegreeStats, inDegreeStats] = await Promise.all([
			outDegreeQuery.execute(),
			inDegreeQuery.execute()
		]);

		return {
			topByOutDegree: outDegreeStats,
			topByInDegree: inDegreeStats
		};
	}

	/**
	 * Delete edge by ID.
	 */
	async deleteById(id: string): Promise<void> {
		await this.db.deleteFrom('graph_edges').where('id', '=', id).execute();
	}

	/**
	 * Delete edges by from_node_id.
	 */
	async deleteByFromNode(fromNodeId: string): Promise<void> {
		await this.db.deleteFrom('graph_edges').where('from_node_id', '=', fromNodeId).execute();
	}

	/**
	 * Delete edges by to_node_id.
	 */
	async deleteByToNode(toNodeId: string): Promise<void> {
		await this.db.deleteFrom('graph_edges').where('to_node_id', '=', toNodeId).execute();
	}

	/**
	 * Delete edges between two nodes.
	 */
	async deleteBetweenNodes(fromNodeId: string, toNodeId: string): Promise<void> {
		await this.db.deleteFrom('graph_edges').where('from_node_id', '=', fromNodeId).where('to_node_id', '=', toNodeId).execute();
	}

	/**
	 * Delete edges by type.
	 */
	async deleteByType(type: string): Promise<void> {
		await this.db.deleteFrom('graph_edges').where('type', '=', type).execute();
	}

	/**
	 * Delete edges where from_node_id or to_node_id matches any of the given node IDs.
	 */
	async deleteByNodeIds(nodeIds: string[]): Promise<void> {
		if (!nodeIds.length) return;
		await this.db
			.deleteFrom('graph_edges')
			.where((eb) => eb.or([eb('from_node_id', 'in', nodeIds), eb('to_node_id', 'in', nodeIds)]))
			.execute();
	}

	/**
	 * Get limited edges by node ID, grouped by type.
	 * Optionally exclude a set of types.
	 * Returns edges where each type (for the remaining types, or all if not provided) is limited to the specified limit per type.
	 * Uses SQLite window functions to rank edges within each type group.
	 * @param nodeId - The node ID to fetch edges for
	 * // todo we should limit by statistics weight. some doc are more important than others. not just simple order
	 * //  so we should add some data to the graph edge, node table. like weight
	 * @param limitPerType - Maximum number of edges per type to return
	 * @param typesExclude - Types to exclude (edges of these types will not be included)
	 */
	async getAllEdgesForNode(
		nodeId: string,
		limitPerType: number,
		typesExclude?: string[]
	): Promise<GraphEdge[]> {
		// Use window function to rank edges by type and updated_at, then filter
		const query = this.db
			.with('ranked_edges', (qb) => {
				let baseQb = qb
					.selectFrom('graph_edges')
					.select([
						'id',
						'from_node_id',
						'to_node_id',
						'type',
						'weight',
						'attributes',
						'created_at',
						'updated_at',
						this.db.fn.agg<number>('row_number').over((ob) =>
							ob.partitionBy('type').orderBy('updated_at', 'desc')
						).as('type_rank')
					])
					.where((eb) =>
						eb.or([
							eb('from_node_id', '=', nodeId),
							eb('to_node_id', '=', nodeId)
						])
					);

				if (typesExclude && typesExclude.length > 0) {
					baseQb = baseQb.where('type', 'not in', typesExclude);
				}

				return baseQb;
			})
			.selectFrom('ranked_edges')
			.selectAll()
			.where('type_rank', '<=', limitPerType)
			.orderBy('updated_at', 'desc');

		return await query.execute();
	}


	/**
	 * Get top N most used tags by counting tagged relationships.
	 * Returns array of { tagId: string, count: number } sorted by count descending.
	 */
	async getTopTaggedNodes(limit: number = 50): Promise<Array<{ tagId: string; count: number }>> {
		return await this.db
			.selectFrom('graph_edges')
			.select([
				'to_node_id as tagId',
				({ fn }) => fn.count<number>('id').as('count')
			])
			.where('type', '=', 'tagged')
			.groupBy('to_node_id')
			.orderBy('count', 'desc')
			.limit(limit)
			.execute();
	}

	/**
	 * Delete all graph edges.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('graph_edges').execute();
	}
}

