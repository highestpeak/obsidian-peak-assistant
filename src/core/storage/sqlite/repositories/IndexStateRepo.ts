import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * CRUD repository for `index_state` table.
 *
 * This is useful for storing small flags/checkpoints for background indexing.
 */
export class IndexStateRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if index state exists by key.
	 */
	async existsByKey(key: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('index_state')
			.select('key')
			.where('key', '=', key)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new index state.
	 */
	async insert(state: { key: string; value: string }): Promise<void> {
		await this.db
			.insertInto('index_state')
			.values(state)
			.execute();
	}

	/**
	 * Update existing index state by key.
	 */
	async updateByKey(key: string, value: string): Promise<void> {
		await this.db
			.updateTable('index_state')
			.set({ value })
			.where('key', '=', key)
			.execute();
	}

	async get(key: string): Promise<string | null> {
		const row = await this.db
			.selectFrom('index_state')
			.select(['value'])
			.where('key', '=', key)
			.executeTakeFirst();
		return row?.value != null ? String(row.value) : null;
	}

	async set(key: string, value: string): Promise<void> {
		const exists = await this.existsByKey(key);

		if (exists) {
			// Update existing record
			await this.updateByKey(key, value);
		} else {
			// Insert new record
			await this.insert({ key, value });
		}
	}

	/**
	 * Clear all index state entries.
	 */
	async clearAll(): Promise<void> {
		await this.db.deleteFrom('index_state').execute();
	}
}


