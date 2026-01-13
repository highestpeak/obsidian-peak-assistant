import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { generateStableUuid } from '@/core/utils/id-utils';

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
		await this.db
			.insertInto('graph_edges')
			.values({
				id,
				from_node_id: edge.from_node_id,
				to_node_id: edge.to_node_id,
				type: edge.type,
				weight: edge.weight ?? 1.0,
				attributes: edge.attributes,
				created_at: edge.created_at ?? now,
				updated_at: edge.updated_at ?? now,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					weight: (eb) => eb.ref('excluded.weight'),
					attributes: (eb) => eb.ref('excluded.attributes'),
					updated_at: (eb) => eb.ref('excluded.updated_at'),
				}),
			)
			.execute();
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
	 * Delete all graph edges.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('graph_edges').execute();
	}
}

