import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * CRUD repository for `graph_nodes` table.
 */
export class GraphNodeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert a graph node.
	 * 
	 * @param node.id - Normalized path (for document nodes) or prefixed identifier (for tags, categories, etc.).
	 *                  For document nodes, this should be the normalized file path relative to vault root.
	 */
	async upsert(node: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at?: number;
		updated_at?: number;
	}): Promise<void> {
		const now = Date.now();
		await this.db
			.insertInto('graph_nodes')
			.values({
				id: node.id,
				type: node.type,
				label: node.label,
				attributes: node.attributes,
				created_at: node.created_at ?? now,
				updated_at: node.updated_at ?? now,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					type: (eb) => eb.ref('excluded.type'),
					label: (eb) => eb.ref('excluded.label'),
					attributes: (eb) => eb.ref('excluded.attributes'),
					updated_at: (eb) => eb.ref('excluded.updated_at'),
				}),
			)
			.execute();
	}

	/**
	 * Get node by ID.
	 */
	async getById(id: string): Promise<DbSchema['graph_nodes'] | null> {
		const row = await this.db.selectFrom('graph_nodes').selectAll().where('id', '=', id).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get nodes by IDs (batch).
	 */
	async getByIds(ids: string[]): Promise<Map<string, DbSchema['graph_nodes']>> {
		if (!ids.length) return new Map();
		const rows = await this.db.selectFrom('graph_nodes').selectAll().where('id', 'in', ids).execute();
		const result = new Map<string, DbSchema['graph_nodes']>();
		for (const row of rows) {
			result.set(row.id, row);
		}
		return result;
	}

	/**
	 * Get nodes by type.
	 */
	async getByType(type: string): Promise<DbSchema['graph_nodes'][]> {
		return await this.db.selectFrom('graph_nodes').selectAll().where('type', '=', type).execute();
	}

	/**
	 * Get node IDs by IDs and types (batch filter).
	 * Returns only IDs that match both the ID list and one of the specified types.
	 */
	async getIdsByIdsAndTypes(ids: string[], types: string[]): Promise<string[]> {
		if (!ids.length || !types.length) return [];
		const rows = await this.db
			.selectFrom('graph_nodes')
			.select(['id'])
			.where('id', 'in', ids)
			.where('type', 'in', types)
			.execute();
		return rows.map((row) => row.id);
	}

	/**
	 * Delete node by ID.
	 */
	async deleteById(id: string): Promise<void> {
		await this.db.deleteFrom('graph_nodes').where('id', '=', id).execute();
	}

	/**
	 * Delete nodes by IDs (batch).
	 */
	async deleteByIds(ids: string[]): Promise<void> {
		if (!ids.length) return;
		await this.db.deleteFrom('graph_nodes').where('id', 'in', ids).execute();
	}

	/**
	 * Delete all graph nodes.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('graph_nodes').execute();
	}

	/**
	 * Delete nodes by type.
	 */
	async deleteByType(type: string): Promise<void> {
		await this.db.deleteFrom('graph_nodes').where('type', '=', type).execute();
	}

	/**
	 * Get all node IDs.
	 */
	async getAllIds(): Promise<string[]> {
		const rows = await this.db.selectFrom('graph_nodes').select(['id']).execute();
		return rows.map((row) => row.id);
	}
}

