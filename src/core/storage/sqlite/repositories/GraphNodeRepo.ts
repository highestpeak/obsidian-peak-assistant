import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

export type GraphNode = DbSchema['graph_nodes'];

/**
 * CRUD repository for `graph_nodes` table.
 */
export class GraphNodeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if graph node exists by id.
	 */
	async existsById(id: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('graph_nodes')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new graph node.
	 */
	async insert(node: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at: number;
		updated_at: number;
	}): Promise<void> {
		await this.db
			.insertInto('graph_nodes')
			.values(node)
			.execute();
	}

	/**
	 * Update existing graph node by id.
	 */
	async updateById(id: string, updates: Partial<Pick<DbSchema['graph_nodes'], 'type' | 'label' | 'attributes' | 'updated_at'>>): Promise<void> {
		await this.db
			.updateTable('graph_nodes')
			.set(updates)
			.where('id', '=', id)
			.execute();
	}

	/**
	 * Upsert a graph node.
	 *
	 * @param node.id - document id, tag id, category id, etc.
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
		const exists = await this.existsById(node.id);

		if (exists) {
			// Update existing node
			await this.updateById(node.id, {
				type: node.type,
				label: node.label,
				attributes: node.attributes,
				updated_at: node.updated_at ?? now,
			});
		} else {
			// Insert new node
			await this.insert({
				id: node.id,
				type: node.type,
				label: node.label,
				attributes: node.attributes,
				created_at: node.created_at ?? now,
				updated_at: node.updated_at ?? now,
			});
		}
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
	async getByIds(ids: string[]): Promise<Map<string, GraphNode>> {
		if (!ids.length) return new Map();
		const rows = await this.db.selectFrom('graph_nodes').selectAll().where('id', 'in', ids).execute();
		const result = new Map<string, GraphNode>();
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
	 * Get nodes by type and labels.
	 */
	async getByTypeAndLabels(type: string, labels: string[]): Promise<DbSchema['graph_nodes'][]> {
		if (!labels.length) return [];
		return await this.db
			.selectFrom('graph_nodes')
			.selectAll()
			.where('type', '=', type)
			.where('label', 'in', labels)
			.execute();
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
}

