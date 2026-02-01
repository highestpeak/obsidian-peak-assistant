import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Repository for ai_analysis_record table (meta.sqlite).
 *
 * Stores lightweight metadata for listing AI analysis history.
 * The full content is persisted as a vault markdown file (vault_rel_path).
 */
export class AIAnalysisRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Insert a record. If vault_rel_path already exists, do nothing.
	 */
	async insertOrIgnore(record: DbSchema['ai_analysis_record']): Promise<void> {
		await this.db
			.insertInto('ai_analysis_record')
			.values(record)
			.onConflict((oc) => oc.column('vault_rel_path').doNothing())
			.execute();
	}

	/**
	 * List records ordered by created_at_ts desc.
	 */
	async list(params: { limit: number; offset: number }): Promise<DbSchema['ai_analysis_record'][]> {
		const limit = Math.max(1, Math.min(200, params.limit || 20));
		const offset = Math.max(0, params.offset || 0);
		return this.db
			.selectFrom('ai_analysis_record')
			.selectAll()
			.orderBy('created_at_ts', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();
	}

	/**
	 * Count records.
	 */
	async count(): Promise<number> {
		const row = await this.db
			.selectFrom('ai_analysis_record')
			.select((eb) => eb.fn.countAll<number>().as('cnt'))
			.executeTakeFirst();
		return Number((row as any)?.cnt ?? 0);
	}

	/**
	 * Delete all records (metadata only).
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('ai_analysis_record').execute();
	}
}

