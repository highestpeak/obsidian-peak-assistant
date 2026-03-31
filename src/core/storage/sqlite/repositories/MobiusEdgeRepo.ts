import { sql, type Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { stableMobiusEdgeId } from '@/core/utils/id-utils';
import {
	GRAPH_TAGGED_EDGE_TYPES,
	GRAPH_TAG_NODE_TYPES,
	GRAPH_WIKI_REFERENCE_EDGE_TYPES,
	GraphEdgeType,
	GraphNodeType,
	isIndexedNoteNodeType,
} from '@/core/po/graph.po';
/** Public edge row shape (`attributes`); persisted in `mobius_edge` as `attributes_json`. */
export type GraphEdge = DbSchema['graph_edges'];

export type MobiusEdgeRow = DbSchema['mobius_edge'];

/**
 * `mobius_edge` access: CRUD, graph queries, and {@link GraphEdge} DTO mapping.
 */
export class MobiusEdgeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/** Logical {@link DbSchema.graph_edges} row from stored `mobius_edge` (or raw SELECT). */
	private graphEdgeFromMobius(row: {
		id: string;
		from_node_id: string;
		to_node_id: string;
		type: string;
		weight: number;
		created_at: number;
		updated_at: number;
		attributes_json?: string | null;
		attributes?: string;
	}): GraphEdge {
		return {
			id: row.id,
			from_node_id: row.from_node_id,
			to_node_id: row.to_node_id,
			type: row.type,
			weight: row.weight,
			attributes: row.attributes_json ?? row.attributes ?? '{}',
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	/**
	 * Generate edge ID (now returns a UUID instead of composite string for better storage efficiency).
	 */
	static generateEdgeId(fromNodeId: string, toNodeId: string, type: string): string {
		return stableMobiusEdgeId(fromNodeId, toNodeId, type);
	}

	/**
	 * Check if graph edge exists by id.
	 */
	async existsById(id: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('mobius_edge')
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
			.insertInto('mobius_edge')
			.values({
				id: edge.id,
				from_node_id: edge.from_node_id,
				to_node_id: edge.to_node_id,
				type: edge.type,
				label: null,
				weight: edge.weight,
				attributes_json: edge.attributes,
				created_at: edge.created_at,
				updated_at: edge.updated_at,
			})
			.execute();
	}

	/**
	 * Update existing graph edge by id.
	 */
	async updateById(id: string, updates: Partial<Pick<DbSchema['graph_edges'], 'weight' | 'attributes' | 'updated_at'>>): Promise<void> {
		const patch: Record<string, unknown> = {};
		if (updates.weight !== undefined) patch.weight = updates.weight;
		if (updates.attributes !== undefined) patch.attributes_json = updates.attributes;
		if (updates.updated_at !== undefined) patch.updated_at = updates.updated_at;
		if (!Object.keys(patch).length) return;
		await this.db.updateTable('mobius_edge').set(patch as any).where('id', '=', id).execute();
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
		const id = edge.id ?? MobiusEdgeRepo.generateEdgeId(edge.from_node_id, edge.to_node_id, edge.type);

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
	async getById(id: string): Promise<GraphEdge | null> {
		const row = await this.db.selectFrom('mobius_edge').selectAll().where('id', '=', id).executeTakeFirst();
		return row ? this.graphEdgeFromMobius(row) : null;
	}

	/**
	 * Get edges by from_node_id.
	 */
	async getByFromNode(fromNodeId: string): Promise<GraphEdge[]> {
		const rows = await this.db
			.selectFrom('mobius_edge')
			.selectAll()
			.where('from_node_id', '=', fromNodeId)
			.execute();
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Get edges by from_node_id (batch).
	 */
	async getByFromNodes(fromNodeIds: string[]): Promise<GraphEdge[]> {
		if (!fromNodeIds.length) return [];
		const rows = await this.db
			.selectFrom('mobius_edge')
			.selectAll()
			.where('from_node_id', 'in', fromNodeIds)
			.execute();
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Get edges by from_node_ids and types (batch).
	 * todo we may need pagination for large result.
	 */
	async getByFromNodesAndTypes(
		fromNodeIds: string[],
		types: string[],
	): Promise<Array<{ to_node_id: string; from_node_id: string; type: string; attributes: string }>> {
		if (!fromNodeIds.length || !types.length) return [];
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select(['to_node_id', 'from_node_id', 'type', 'attributes_json'])
			.where('from_node_id', 'in', fromNodeIds)
			.where('type', 'in', types)
			.execute();
		return rows.map((r) => ({
			to_node_id: r.to_node_id as string,
			from_node_id: r.from_node_id as string,
			type: r.type as string,
			attributes: ((r as { attributes_json?: string | null }).attributes_json ?? '{}') as string,
		}));
	}

	/**
	 * Get edges by to_node_ids and types (batch). No join.
	 */
	async getByToNodesAndTypes(toNodeIds: string[], types: string[]): Promise<{ to_node_id: string; from_node_id: string }[]> {
		if (!toNodeIds.length || !types.length) return [];
		return await this.db
			.selectFrom('mobius_edge')
			.select(['to_node_id', 'from_node_id'])
			.where('to_node_id', 'in', toNodeIds)
			.where('type', 'in', types)
			.execute();
	}

	/**
	 * Edge-only aggregate: filter by type, group by to_node_id, count. No join.
	 * Caller should then look up mobius_node by to_node_id and sum counts by (type, label).
	 */
	async getTagCategoryEdgeCountsByToNode(fromNodeIds?: string[]): Promise<Array<{ to_node_id: string; count: number }>> {
		let q = this.db
			.selectFrom('mobius_edge')
			.select(['to_node_id', sql<number>`count(*)`.as('count')])
			.where('type', 'in', [...GRAPH_TAGGED_EDGE_TYPES])
			.groupBy('to_node_id');
		if (fromNodeIds !== undefined && fromNodeIds.length > 0) {
			q = q.where('from_node_id', 'in', fromNodeIds);
		}
		const rows = await q.execute();
		return rows.map((r: { to_node_id: string; count: number | string }) => ({
			to_node_id: r.to_node_id,
			count: Number(r.count),
		}));
	}

	/**
	 * Incoming edge counts. When `type` is omitted, uses `mobius_node` doc/other columns for document nodes
	 * (aggregate columns rebuilt by {@link IndexService.runMobiusGlobalMaintenance} / per-index incoming refresh;
	 * `semantic_related` edges by {@link IndexService.runMobiusGlobalMaintenance});
	 * non-document ids fall back to `mobius_edge`.
	 * When `type` is set, always aggregates from `mobius_edge` (cannot derive from cached columns).
	 */
	async countInComingEdges(nodeIds: string[], type?: string | readonly string[]): Promise<Map<string, number>> {
		if (!nodeIds.length) return new Map();
		if (type !== undefined) {
			return this.countIncomingEdgesFromEdgeTable(nodeIds, type);
		}
		return this.countIncomingEdgesFromNodeColumns(nodeIds);
	}

	/**
	 * Outgoing edge counts; same caching rules as {@link countInComingEdges}.
	 */
	async countOutgoingEdges(nodeIds: string[], type?: string | readonly string[]): Promise<Map<string, number>> {
		if (!nodeIds.length) return new Map();
		if (type !== undefined) {
			return this.countOutgoingEdgesFromEdgeTable(nodeIds, type);
		}
		return this.countOutgoingEdgesFromNodeColumns(nodeIds);
	}

	private async countIncomingEdgesFromEdgeTable(
		nodeIds: string[],
		edgeType?: string | readonly string[],
	): Promise<Map<string, number>> {
		let query = this.db
			.selectFrom('mobius_edge')
			.select(({ fn }) => [fn.count<number>('id').as('count'), 'to_node_id'])
			.where('to_node_id', 'in', nodeIds);
		if (edgeType !== undefined) {
			const types = typeof edgeType === 'string' ? [edgeType] : [...edgeType];
			query =
				types.length === 1 ? query.where('type', '=', types[0]!) : query.where('type', 'in', types);
		}
		const rows = await query.groupBy(['to_node_id']).execute();
		const map = new Map<string, number>();
		for (const row of rows) {
			map.set(row.to_node_id, row.count);
		}
		return map;
	}

	private async countOutgoingEdgesFromEdgeTable(
		nodeIds: string[],
		edgeType?: string | readonly string[],
	): Promise<Map<string, number>> {
		let query = this.db
			.selectFrom('mobius_edge')
			.select(({ fn }) => [fn.count<number>('id').as('count'), 'from_node_id'])
			.where('from_node_id', 'in', nodeIds);
		if (edgeType !== undefined) {
			const types = typeof edgeType === 'string' ? [edgeType] : [...edgeType];
			query =
				types.length === 1 ? query.where('type', '=', types[0]!) : query.where('type', 'in', types);
		}
		const rows = await query.groupBy(['from_node_id']).execute();
		const map = new Map<string, number>();
		for (const row of rows) {
			map.set(row.from_node_id, row.count);
		}
		return map;
	}

	private async countIncomingEdgesFromNodeColumns(nodeIds: string[]): Promise<Map<string, number>> {
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id', 'type', 'doc_incoming_cnt', 'other_incoming_cnt'])
			.where('node_id', 'in', nodeIds)
			.execute();
		const byId = new Map(rows.map((r) => [r.node_id, r]));
		const fallback = new Set<string>();
		const map = new Map<string, number>();
		for (const id of nodeIds) {
			const r = byId.get(id);
			if (!r || !isIndexedNoteNodeType(r.type)) {
				fallback.add(id);
				continue;
			}
			map.set(id, (r.doc_incoming_cnt ?? 0) + (r.other_incoming_cnt ?? 0));
		}
		if (fallback.size) {
			const sub = await this.countIncomingEdgesFromEdgeTable([...fallback], undefined);
			for (const [k, v] of sub) map.set(k, v);
		}
		for (const id of nodeIds) {
			if (!map.has(id)) map.set(id, 0);
		}
		return map;
	}

	private async countOutgoingEdgesFromNodeColumns(nodeIds: string[]): Promise<Map<string, number>> {
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id', 'type', 'doc_outgoing_cnt', 'other_outgoing_cnt'])
			.where('node_id', 'in', nodeIds)
			.execute();
		const byId = new Map(rows.map((r) => [r.node_id, r]));
		const fallback = new Set<string>();
		const map = new Map<string, number>();
		for (const id of nodeIds) {
			const r = byId.get(id);
			if (!r || !isIndexedNoteNodeType(r.type)) {
				fallback.add(id);
				continue;
			}
			map.set(id, (r.doc_outgoing_cnt ?? 0) + (r.other_outgoing_cnt ?? 0));
		}
		if (fallback.size) {
			const sub = await this.countOutgoingEdgesFromEdgeTable([...fallback], undefined);
			for (const [k, v] of sub) map.set(k, v);
		}
		for (const id of nodeIds) {
			if (!map.has(id)) map.set(id, 0);
		}
		return map;
	}

	/**
	 * group count node's edges by type.
	 * return a map: node_id -> count
	 */
	async countEdges(
		nodeIds: string[],
		type?: string | readonly string[],
	): Promise<{ incoming: Map<string, number>; outgoing: Map<string, number>; total: Map<string, number> }> {
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
			.selectFrom('mobius_edge')
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
	async getByToNode(toNodeId: string): Promise<GraphEdge[]> {
		const rows = await this.db
			.selectFrom('mobius_edge')
			.selectAll()
			.where('to_node_id', '=', toNodeId)
			.execute();
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Get edges between two nodes.
	 */
	async getBetweenNodes(fromNodeId: string, toNodeId: string): Promise<GraphEdge[]> {
		const rows = await this.db
			.selectFrom('mobius_edge')
			.selectAll()
			.where('from_node_id', '=', fromNodeId)
			.where('to_node_id', '=', toNodeId)
			.execute();
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Get edges by type.
	 */
	async getByType(type: string): Promise<GraphEdge[]> {
		const rows = await this.db
			.selectFrom('mobius_edge')
			.selectAll()
			.where('type', '=', type)
			.execute();
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Streams all edges with endpoint `mobius_node` type/path resolved in memory (no SQL JOIN: edge page + `IN` lookup).
	 */
	async *iterateMobiusEdgeBatchesWithEndpointMetadata(
		batchSize: number,
	): AsyncGenerator<
		Array<{
			id: string;
			type: string;
			from_type: string;
			from_path: string | null;
			to_type: string;
			to_path: string | null;
		}>,
		void,
		undefined
	> {
		const limit = Math.max(1, batchSize);
		let afterId: string | null = null;
		for (;;) {
			let q = this.db.selectFrom('mobius_edge').select(['id', 'type', 'from_node_id', 'to_node_id']);
			if (afterId != null) {
				q = q.where('id', '>', afterId);
			}
			const edgeRows = await q.orderBy('id', 'asc').limit(limit).execute();
			if (edgeRows.length === 0) {
				return;
			}

			const idSet = new Set<string>();
			for (const e of edgeRows) {
				idSet.add(String(e.from_node_id));
				idSet.add(String(e.to_node_id));
			}
			const metaById = await this.loadMobiusNodeTypePathByIds([...idSet]);

			yield edgeRows.map((e) => {
				const from = metaById.get(String(e.from_node_id));
				const to = metaById.get(String(e.to_node_id));
				return {
					id: String(e.id),
					type: String(e.type),
					from_type: from?.type ?? '',
					from_path: from?.path ?? null,
					to_type: to?.type ?? '',
					to_path: to?.path ?? null,
				};
			});

			afterId = String(edgeRows[edgeRows.length - 1]!.id);
			if (edgeRows.length < limit) {
				return;
			}
		}
	}

	/** Single-table lookup for endpoint resolution (used with {@link iterateMobiusEdgeBatchesWithEndpointMetadata}). */
	private async loadMobiusNodeTypePathByIds(
		nodeIds: string[],
	): Promise<Map<string, { type: string; path: string | null }>> {
		const out = new Map<string, { type: string; path: string | null }>();
		if (!nodeIds.length) return out;
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id', 'type', 'path'])
			.where('node_id', 'in', nodeIds)
			.execute();
		for (const r of rows) {
			out.set(String(r.node_id), { type: String(r.type), path: r.path ?? null });
		}
		return out;
	}

	/**
	 * Keyset-ordered batches of wiki reference edges (no JOIN). Callers filter by doc-like node ids in memory.
	 */
	async *iterateReferenceEdgeBatches(
		batchSize: number,
	): AsyncGenerator<Array<{ from_node_id: string; to_node_id: string }>, void, undefined> {
		const limit = Math.max(1, batchSize);
		let afterId: string | null = null;
		for (;;) {
			let q = this.db
				.selectFrom('mobius_edge')
				.select(['id', 'from_node_id', 'to_node_id'])
				.where('type', 'in', [...GRAPH_WIKI_REFERENCE_EDGE_TYPES]);
			if (afterId != null) {
				q = q.where('id', '>', afterId);
			}
			const rows = await q.orderBy('id', 'asc').limit(limit).execute();
			if (rows.length === 0) {
				return;
			}
			yield rows.map((r) => ({
				from_node_id: String(r.from_node_id),
				to_node_id: String(r.to_node_id),
			}));
			afterId = String(rows[rows.length - 1]!.id);
			if (rows.length < limit) {
				return;
			}
		}
	}

	/**
	 * Keyset-ordered batches of `semantic_related` edges with weights (weighted PageRank).
	 */
	async *iterateSemanticRelatedEdgeBatches(
		batchSize: number,
	): AsyncGenerator<
		Array<{ from_node_id: string; to_node_id: string; weight: number }>,
		void,
		undefined
	> {
		const limit = Math.max(1, batchSize);
		let afterId: string | null = null;
		for (;;) {
			let q = this.db
				.selectFrom('mobius_edge')
				.select(['id', 'from_node_id', 'to_node_id', 'weight'])
				.where('type', '=', GraphEdgeType.SemanticRelated);
			if (afterId != null) {
				q = q.where('id', '>', afterId);
			}
			const rows = await q.orderBy('id', 'asc').limit(limit).execute();
			if (rows.length === 0) {
				return;
			}
			yield rows.map((r) => ({
				from_node_id: String(r.from_node_id),
				to_node_id: String(r.to_node_id),
				weight: Number(r.weight ?? 0),
			}));
			afterId = String(rows[rows.length - 1]!.id);
			if (rows.length < limit) {
				return;
			}
		}
	}

	/**
	 * Get edges by custom WHERE clause (table is `mobius_edge`; column is `attributes_json`).
	 */
	async getByCustomWhere(whereClause: string): Promise<GraphEdge[]> {
		if (!whereClause.trim()) return [];
		// Create a simple compiled query object for raw SQL
		const compiledQuery = {
			sql: `SELECT * FROM mobius_edge WHERE ${whereClause}`,
			parameters: [],
			query: {} // Add required query property
		} as any;
		console.log('[MobiusEdgeRepo.getByCustomWhere] compiledQuery', compiledQuery);
		const result = await this.db.executeQuery(compiledQuery);
		const rows = result.rows as DbSchema['mobius_edge'][];
		return rows.map((row) => this.graphEdgeFromMobius(row));
	}

	/**
	 * Get source node IDs that are connected to ALL specified target node IDs.
	 * Uses GROUP BY and HAVING to find nodes that have edges to all required targets.
	 * Since target node IDs are unique (tags and categories have different IDs),
	 * we don't need to filter by edge type.
	 * @param targetNodeIds Array of target node IDs to match against
	 */
	async getSourceNodesConnectedToAllTargets(targetNodeIds: string[]): Promise<string[]> {
		if (targetNodeIds.length === 0) return [];

		const result = await this.db
			.selectFrom('mobius_edge')
			.select('from_node_id')
			.where('to_node_id', 'in', targetNodeIds)
			.groupBy('from_node_id')
			.having(sql`COUNT(DISTINCT to_node_id)`, '=', targetNodeIds.length)
			.execute();

		return result.map(row => row.from_node_id);
	}

	/**
	 * Nodes with no outgoing edges. Document rows use `doc_outgoing_cnt` + `other_outgoing_cnt`;
	 * other node types use `NOT EXISTS` on `mobius_edge` (no cached out-degree on tags/categories).
	 */
	async getNodesWithZeroOutDegree(limit?: number): Promise<string[]> {
		const cap = limit ?? 10_000_000;
		const d = GraphNodeType.Document;
		const h = GraphNodeType.HubDoc;
		const result = await sql<{ node_id: string }>`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(n.type IN (${d}, ${h}) AND IFNULL(n.doc_outgoing_cnt,0) + IFNULL(n.other_outgoing_cnt,0) = 0)
				OR (n.type NOT IN (${d}, ${h}) AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.from_node_id = n.node_id))
			)
			LIMIT ${cap}
		`.execute(this.db);
		return result.rows.map((r) => r.node_id);
	}

	/**
	 * Nodes with no incoming edges; same caching rules as {@link getNodesWithZeroOutDegree}.
	 */
	async getNodesWithZeroInDegree(limit?: number): Promise<string[]> {
		const cap = limit ?? 10_000_000;
		const d = GraphNodeType.Document;
		const h = GraphNodeType.HubDoc;
		const result = await sql<{ node_id: string }>`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(n.type IN (${d}, ${h}) AND IFNULL(n.doc_incoming_cnt,0) + IFNULL(n.other_incoming_cnt,0) = 0)
				OR (n.type NOT IN (${d}, ${h}) AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.to_node_id = n.node_id))
			)
			LIMIT ${cap}
		`.execute(this.db);
		return result.rows.map((r) => r.node_id);
	}

	/**
	 * Hard orphan: zero in- and out-degree. Documents use cached columns; other types use `NOT EXISTS` on both directions.
	 */
	async getHardOrphanNodeIds(limit?: number): Promise<string[]> {
		const cap = limit ?? 10_000_000;
		const d = GraphNodeType.Document;
		const h = GraphNodeType.HubDoc;
		const result = await sql<{ node_id: string }>`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(
					n.type IN (${d}, ${h})
					AND IFNULL(n.doc_outgoing_cnt,0) + IFNULL(n.other_outgoing_cnt,0) = 0
					AND IFNULL(n.doc_incoming_cnt,0) + IFNULL(n.other_incoming_cnt,0) = 0
				)
				OR (
					n.type NOT IN (${d}, ${h})
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.from_node_id = n.node_id)
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.to_node_id = n.node_id)
				)
			)
			LIMIT ${cap}
		`.execute(this.db);
		return result.rows.map((r) => r.node_id);
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
	 * TODO: Implement using `mobius_node` doc_incoming_cnt / doc_outgoing_cnt (or aggregate from mobius_edge).
	 *
	 * @param maxConnections Maximum total connections (default: 2)
	 * @param limit Maximum number of nodes to return
	 */
	async getNodesWithLowDegree(maxConnections: number = 2, limit?: number): Promise<Array<{ nodeId: string; totalConnections: number }>> {
		return [];
	}

	/**
	 * Get top nodes by degree metrics (in-degree, out-degree). Queries in and out separately.
	 *
	 * @param limit Max nodes per degree type. Omitted = return all.
	 * @param nodeIdFilter Optional node IDs to restrict to.
	 * @param edgeType Optional edge relationship type (e.g. 'references', 'tagged') to filter by; not node type.
	 */
	async getTopNodeIdsByDegree(
		limit?: number,
		nodeIdFilter?: string[],
		edgeType?: string | readonly string[],
	): Promise<{
		topByOutDegree: Array<{ nodeId: string; outDegree: number }>;
		topByInDegree: Array<{ nodeId: string; inDegree: number }>;
	}> {
		let outDegreeQuery = this.db
			.selectFrom('mobius_edge')
			.select([
				'from_node_id as nodeId',
				({ fn }) => fn.count<number>('id').as('outDegree')
			])
			.groupBy('from_node_id')
			.orderBy('outDegree', 'desc');

		let inDegreeQuery = this.db
			.selectFrom('mobius_edge')
			.select([
				'to_node_id as nodeId',
				({ fn }) => fn.count<number>('id').as('inDegree')
			])
			.groupBy('to_node_id')
			.orderBy('inDegree', 'desc');

		if (edgeType !== undefined) {
			const types = typeof edgeType === 'string' ? [edgeType] : [...edgeType];
			outDegreeQuery =
				types.length === 1
					? outDegreeQuery.where('type', '=', types[0]!)
					: outDegreeQuery.where('type', 'in', types);
			inDegreeQuery =
				types.length === 1
					? inDegreeQuery.where('type', '=', types[0]!)
					: inDegreeQuery.where('type', 'in', types);
		}
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
		await this.db.deleteFrom('mobius_edge').where('id', '=', id).execute();
	}

	/**
	 * Delete edges by from_node_id.
	 */
	async deleteByFromNode(fromNodeId: string): Promise<void> {
		await this.db.deleteFrom('mobius_edge').where('from_node_id', '=', fromNodeId).execute();
	}

	/**
	 * Delete outgoing edges of a given type (e.g. re-materialize `semantic_related` on reindex).
	 */
	async deleteByFromNodeAndType(fromNodeId: string, type: string): Promise<void> {
		await this.db
			.deleteFrom('mobius_edge')
			.where('from_node_id', '=', fromNodeId)
			.where('type', '=', type)
			.execute();
	}

	/**
	 * Document ids linked to a topic tag node (excluding one doc), for semantic peer discovery.
	 */
	async listDocIdsFromTaggedTopicExcluding(
		tagNodeId: string,
		excludeDocId: string,
		limit: number,
	): Promise<string[]> {
		const lim = Math.max(1, limit);
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select('from_node_id')
			.where('to_node_id', '=', tagNodeId)
			.where('type', '=', GraphEdgeType.TaggedTopic)
			.where('from_node_id', '!=', excludeDocId)
			.limit(lim)
			.execute();
		return [...new Set(rows.map((r) => String(r.from_node_id)))];
	}

	/**
	 * Delete edges by to_node_id.
	 */
	async deleteByToNode(toNodeId: string): Promise<void> {
		await this.db.deleteFrom('mobius_edge').where('to_node_id', '=', toNodeId).execute();
	}

	/**
	 * Delete edges between two nodes.
	 */
	async deleteBetweenNodes(fromNodeId: string, toNodeId: string): Promise<void> {
		await this.db.deleteFrom('mobius_edge').where('from_node_id', '=', fromNodeId).where('to_node_id', '=', toNodeId).execute();
	}

	/**
	 * Delete edges by type.
	 */
	async deleteByType(type: string): Promise<void> {
		await this.db.deleteFrom('mobius_edge').where('type', '=', type).execute();
	}

	/**
	 * Delete edges where from_node_id or to_node_id matches any of the given node IDs.
	 */
	async deleteByNodeIds(nodeIds: string[]): Promise<void> {
		if (!nodeIds.length) return;
		await this.db
			.deleteFrom('mobius_edge')
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
		const directionExpr = sql<string>`case when from_node_id = ${nodeId} then 'out' else 'in' end`;

		// Use window function to rank edges by type and updated_at, then filter
		const query = this.db
			.with('ranked_edges', (qb) => {
				let baseQb = qb
					.selectFrom('mobius_edge')
					.select([
						'id',
						'from_node_id',
						'to_node_id',
						'type',
						'weight',
						'attributes_json',
						'created_at',
						'updated_at',
						// 1. define direction explicitly: if the edge is outgoing from the current node, mark as 'out', otherwise mark as 'in'
						directionExpr.as('direction'),
						// 2. add type and direction to partitionBy
						sql<number>`row_number() over(
							partition by type, ${directionExpr} 
							order by updated_at desc
						)`.as('dir_type_rank')
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
			.where('dir_type_rank', '<=', limitPerType)
			.orderBy('updated_at', 'desc');

		const raw = (await query.execute()) as Array<Record<string, unknown>>;
		return raw.map((r) =>
			this.graphEdgeFromMobius({
				id: r.id as string,
				from_node_id: r.from_node_id as string,
				to_node_id: r.to_node_id as string,
				type: r.type as string,
				weight: r.weight as number,
				attributes_json: (r.attributes_json as string) ?? '{}',
				created_at: r.created_at as number,
				updated_at: r.updated_at as number,
			}),
		);
	}


	/**
	 * Top tags by `mobius_node.tag_doc_count` (distinct documents per tag, maintained with edges).
	 */
	async getTopTaggedNodes(limit: number = 50): Promise<Array<{ tagId: string; count: number }>> {
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id', 'tag_doc_count'])
			.where('type', 'in', [...GRAPH_TAG_NODE_TYPES])
			.where('tag_doc_count', 'is not', null)
			.where('tag_doc_count', '>', 0)
			.orderBy('tag_doc_count', 'desc')
			.limit(limit)
			.execute();
		return rows.map((r) => ({ tagId: r.node_id, count: Number(r.tag_doc_count) }));
	}

	/**
	 * count in-degree and out-degree for target node ids.
	 * Chunks nodeIds to avoid SQL variable limit; merges in memory.
	 */
	async getDegreeMapsByNodeIdsChunked(
		nodeIds: string[],
		edgeType: string | readonly string[] = GRAPH_WIKI_REFERENCE_EDGE_TYPES,
	): Promise<{ inMap: Map<string, number>; outMap: Map<string, number> }> {
		const inMap = new Map<string, number>();
		const outMap = new Map<string, number>();
		const CHUNK = 400;
		for (let i = 0; i < nodeIds.length; i += CHUNK) {
			const c = nodeIds.slice(i, i + CHUNK);
			const [inChunk, outChunk] = await Promise.all([
				this.countInComingEdges(c, edgeType),
				this.countOutgoingEdges(c, edgeType),
			]);
			for (const [nid, count] of inChunk) inMap.set(nid, (inMap.get(nid) ?? 0) + count);
			for (const [nid, count] of outChunk) outMap.set(nid, (outMap.get(nid) ?? 0) + count);
		}
		return { inMap, outMap };
	}

	/**
	 * Returns all edges that have *both* endpoints in the given node set ("intra" = within the set).
	 * Used when drawing a subgraph (e.g. top-N nodes): we need every link between those nodes.
	 *
	 * Why two queries?
	 * - getByFromNodesAndTypes(nodeIds): edges whose *source* is in nodeIds. That gives us A→B when A is in the set
	 *   (B may be outside). We then keep only edges where B is also in nodeIds.
	 * - getByToNodesAndTypes(nodeIds): edges whose *target* is in nodeIds. That gives us C→D when D is in the set.
	 *   We then keep only edges where C is also in nodeIds. So we get edges that would be missed if we only queried by from.
	 * The same edge can appear in both result sets, so we dedupe by (from_node_id, to_node_id) before returning.
	 *
	 * @param nodeIds - Node IDs that define the subgraph (e.g. top 20 by degree).
	 * @param edgeType - Edge type to filter (default 'references').
	 * @returns List of edges { from_node_id, to_node_id } with both ends in nodeIds, no duplicates.
	 */
	async getIntraEdges(
		nodeIds: string[],
		edgeType: string | readonly string[] = GRAPH_WIKI_REFERENCE_EDGE_TYPES,
	): Promise<Array<{ from_node_id: string; to_node_id: string }>> {
		if (!nodeIds.length) return [];
		const types = typeof edgeType === 'string' ? [edgeType] : [...edgeType];
		const [fromEdges, toEdges] = await Promise.all([
			this.getByFromNodesAndTypes(nodeIds, types),
			this.getByToNodesAndTypes(nodeIds, types),
		]);
		const nodeSet = new Set(nodeIds);
		const seen = new Set<string>();
		const result: Array<{ from_node_id: string; to_node_id: string }> = [];
		for (const e of fromEdges) {
			if (!nodeSet.has(e.to_node_id)) continue;
			const key = `${e.from_node_id}\t${e.to_node_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(e);
		}
		for (const e of toEdges) {
			if (!nodeSet.has(e.from_node_id)) continue;
			const key = `${e.from_node_id}\t${e.to_node_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(e);
		}
		return result;
	}

	/**
	 * For a set of "internal" nodes (e.g. docs in the group's folders), returns the top external nodes
	 * that are most connected to this set—both directions. Used to draw "Group → external" and
	 * "external → Group" links in the shared-context Mermaid graph.
	 *
	 * - extOut: nodes that internal nodes link *to* (outgoing). Sorted by number of edges from internal to that node; top limitK.
	 * - extIn: nodes that link *into* internal nodes (incoming). Sorted by number of edges from that node to internal; top limitK.
	 *
	 * Why chunk? internalIds can be large (all docs under several folders). We avoid a single huge IN (...)
	 * by splitting into chunks of 400, querying edges for each chunk, and aggregating counts in memory.
	 * No SQL JOIN with indexed document table; internal set is passed in by the caller (from IndexedDocumentRepo).
	 *
	 * @param internalIds - Document/node IDs considered "inside" the group (e.g. from getIdsByPathPrefixes).
	 * @param edgeType - Edge type (default 'references').
	 * @param limitK - Max number of external nodes to return per direction.
	 * @returns { extOut: [{ to_node_id, count }], extIn: [{ from_node_id, count }] } sorted by count descending.
	 */
	async getExternalEdgeCountsChunked(
		internalIds: string[],
		edgeType: string | readonly string[] = GRAPH_WIKI_REFERENCE_EDGE_TYPES,
		limitK: number,
	): Promise<{
		extOut: Array<{ to_node_id: string; count: number }>;
		extIn: Array<{ from_node_id: string; count: number }>;
	}> {
		const internalSet = new Set(internalIds);
		const outByTo = new Map<string, number>();
		const inByFrom = new Map<string, number>();
		const CHUNK = 400;
		const types = typeof edgeType === 'string' ? [edgeType] : [...edgeType];
		for (let i = 0; i < internalIds.length; i += CHUNK) {
			const c = internalIds.slice(i, i + CHUNK);
			const [outEdges, inEdges] = await Promise.all([
				this.getByFromNodesAndTypes(c, types),
				this.getByToNodesAndTypes(c, types),
			]);
			for (const e of outEdges) {
				if (!internalSet.has(e.to_node_id)) outByTo.set(e.to_node_id, (outByTo.get(e.to_node_id) ?? 0) + 1);
			}
			for (const e of inEdges) {
				if (!internalSet.has(e.from_node_id)) inByFrom.set(e.from_node_id, (inByFrom.get(e.from_node_id) ?? 0) + 1);
			}
		}
		const extOut = [...outByTo.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitK).map(([to_node_id, count]) => ({ to_node_id, count }));
		const extIn = [...inByFrom.entries()].sort((a, b) => b[1] - a[1]).slice(0, limitK).map(([from_node_id, count]) => ({ from_node_id, count }));
		return { extOut, extIn };
	}

	/**
	 * Delete all graph edges.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('mobius_edge').execute();
	}

	// --- Hub discovery & local hub graph (read-only) ---

	/** Reference edges touching a node (hub coverage estimate). */
	async listReferenceEdgesIncidentToNode(nodeId: string, limit: number): Promise<
		Array<{ from_node_id: string; to_node_id: string }>
	> {
		const lim = Math.max(1, limit);
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select(['from_node_id', 'to_node_id'])
			.where('type', 'in', [GraphEdgeType.References, GraphEdgeType.ReferencesResource])
			.where((eb) => eb.or([eb('from_node_id', '=', nodeId), eb('to_node_id', '=', nodeId)]))
			.limit(lim)
			.execute();
		return rows as Array<{ from_node_id: string; to_node_id: string }>;
	}

	/** Semantic-related edges touching a node (cluster hub neighbors), strongest first. */
	async listSemanticRelatedEdgesIncidentToNode(nodeId: string, limit: number): Promise<
		Array<{ from_node_id: string; to_node_id: string; weight: number }>
	> {
		const lim = Math.max(1, limit);
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select(['from_node_id', 'to_node_id', 'weight'])
			.where('type', '=', GraphEdgeType.SemanticRelated)
			.where((eb) => eb.or([eb('from_node_id', '=', nodeId), eb('to_node_id', '=', nodeId)]))
			.orderBy('weight desc')
			.limit(lim)
			.execute();
		return rows.map((r) => ({
			from_node_id: r.from_node_id,
			to_node_id: r.to_node_id,
			weight: typeof r.weight === 'number' && Number.isFinite(r.weight) ? r.weight : 1,
		}));
	}

	/**
	 * Semantic-related edges with both endpoints in `nodeIds` (cluster intra-density).
	 */
	async listSemanticRelatedEdgesWithinNodeSet(
		nodeIds: string[],
		limit: number,
	): Promise<Array<{ from_node_id: string; to_node_id: string; weight: number }>> {
		const ids = [...new Set(nodeIds.filter(Boolean))];
		if (ids.length < 2) return [];
		const lim = Math.max(1, limit);
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select(['from_node_id', 'to_node_id', 'weight'])
			.where('type', '=', GraphEdgeType.SemanticRelated)
			.where('from_node_id', 'in', ids)
			.where('to_node_id', 'in', ids)
			.where((eb) => eb('from_node_id', '!=', eb.ref('to_node_id')))
			.limit(lim)
			.execute();
		return rows.map((r) => ({
			from_node_id: r.from_node_id,
			to_node_id: r.to_node_id,
			weight: typeof r.weight === 'number' && Number.isFinite(r.weight) ? r.weight : 1,
		}));
	}

	/**
	 * Edges of given types where at least one endpoint is in `nodeIds` (local hub BFS frontier).
	 */
	async listEdgesByTypesIncidentToAnyNode(
		nodeIds: string[],
		edgeTypes: string[],
		limit: number,
	): Promise<Array<{ from_node_id: string; to_node_id: string; type: string; weight: number | null }>> {
		if (!nodeIds.length || !edgeTypes.length) return [];
		const lim = Math.max(1, limit);
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select(['from_node_id', 'to_node_id', 'type', 'weight'])
			.where('type', 'in', edgeTypes)
			.where((eb) => eb.or([eb('from_node_id', 'in', nodeIds), eb('to_node_id', 'in', nodeIds)]))
			.limit(lim)
			.execute();
		return rows as Array<{ from_node_id: string; to_node_id: string; type: string; weight: number | null }>;
	}
}

