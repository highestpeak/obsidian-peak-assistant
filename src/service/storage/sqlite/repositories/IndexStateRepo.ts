import type { QueryBuilder } from '../query-builder';

/**
 * CRUD repository for `index_state` table.
 *
 * This is useful for storing small flags/checkpoints for background indexing.
 */
export class IndexStateRepo {
	constructor(private readonly qb: QueryBuilder) {}

	get(key: string): string | null {
		const rows = this.qb.select('index_state').selectColumns(['value']).where('key', '=', key).execute();
		const row = rows[0];
		return row?.value != null ? String(row.value) : null;
	}

	set(key: string, value: string): void {
		this.qb.insertInto('index_state').onConflictUpdate({ key, value }, 'key');
	}
}


