import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * CRUD repository for `index_state` table.
 *
 * This is useful for storing small flags/checkpoints for background indexing.
 */
export class IndexStateRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async get(key: string): Promise<string | null> {
		const row = await this.db
			.selectFrom('index_state')
			.select(['value'])
			.where('key', '=', key)
			.executeTakeFirst();
		return row?.value != null ? String(row.value) : null;
	}

	async set(key: string, value: string): Promise<void> {
		await this.db
			.insertInto('index_state')
			.values({ key, value })
			.onConflict((oc) => oc.column('key').doUpdateSet({ value: (eb) => eb.ref('excluded.value') }))
			.execute();
	}

	/**
	 * Clear all index state entries.
	 */
	async clearAll(): Promise<void> {
		await this.db.deleteFrom('index_state').execute();
	}
}


