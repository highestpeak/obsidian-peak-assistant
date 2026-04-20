import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

type QueryPatternRow = DbSchema['query_pattern'];

/**
 * Repository for query_pattern table (chat.sqlite, alongside ai_analysis_record).
 *
 * Stores reusable query templates discovered from user behaviour or shipped
 * as defaults.  Active patterns (deprecated=0) are ranked by usage frequency
 * to surface the most relevant suggestions first.
 */
export class QueryPatternRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Insert a new pattern. If the id already exists, do nothing.
	 */
	async insert(record: QueryPatternRow): Promise<void> {
		await this.db
			.insertInto('query_pattern')
			.values(record)
			.onConflict((oc) => oc.column('id').doNothing())
			.execute();
	}

	/**
	 * List active (non-deprecated) patterns ordered by usage_count DESC,
	 * then discovered_at DESC (newest first on ties).
	 */
	async listActive(): Promise<QueryPatternRow[]> {
		return this.db
			.selectFrom('query_pattern')
			.selectAll()
			.where('deprecated', '=', 0)
			.orderBy('usage_count', 'desc')
			.orderBy('discovered_at', 'desc')
			.execute();
	}

	/**
	 * List all patterns regardless of deprecated status.
	 */
	async listAll(): Promise<QueryPatternRow[]> {
		return this.db
			.selectFrom('query_pattern')
			.selectAll()
			.orderBy('usage_count', 'desc')
			.orderBy('discovered_at', 'desc')
			.execute();
	}

	/**
	 * Increment usage_count by 1 and update last_used_at to now.
	 */
	async incrementUsage(id: string): Promise<void> {
		await this.db
			.updateTable('query_pattern')
			.set({
				usage_count: sql`usage_count + 1`,
				last_used_at: Date.now(),
			})
			.where('id', '=', id)
			.execute();
	}

	/**
	 * Mark a single pattern as deprecated.
	 */
	async deprecate(id: string): Promise<void> {
		await this.db
			.updateTable('query_pattern')
			.set({ deprecated: 1 })
			.where('id', '=', id)
			.execute();
	}

	/**
	 * Deprecate stale discovered patterns: those with source='discovered',
	 * usage_count=0, and discovered_at older than maxAgeDays.
	 */
	async deprecateStale(maxAgeDays: number): Promise<void> {
		const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
		await this.db
			.updateTable('query_pattern')
			.set({ deprecated: 1 })
			.where('source', '=', 'discovered')
			.where('usage_count', '=', 0)
			.where('discovered_at', '<', cutoff)
			.execute();
	}

	/**
	 * Total row count (all patterns, including deprecated).
	 */
	async count(): Promise<number> {
		const row = await this.db
			.selectFrom('query_pattern')
			.select((eb) => eb.fn.countAll<number>().as('cnt'))
			.executeTakeFirst();
		return Number((row as any)?.cnt ?? 0);
	}

	/**
	 * Returns true when the table has no rows at all.
	 */
	async isEmpty(): Promise<boolean> {
		return (await this.count()) === 0;
	}
}
