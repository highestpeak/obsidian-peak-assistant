import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';

/**
 * CRUD repository for `doc_statistics` table.
 * This table combines document statistics and recent open tracking.
 */
export class DocStatisticsRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Upsert document statistics.
	 */
	async upsert(stats: {
		doc_id: string;
		word_count?: number | null;
		char_count?: number | null;
		language?: string | null;
		richness_score?: number | null;
		updated_at: number;
	}): Promise<void> {
		await this.db
			.insertInto('doc_statistics')
			.values({
				doc_id: stats.doc_id,
				word_count: stats.word_count ?? null,
				char_count: stats.char_count ?? null,
				language: stats.language ?? null,
				richness_score: stats.richness_score ?? null,
				updated_at: stats.updated_at,
			})
			.onConflict((oc) =>
				oc.column('doc_id').doUpdateSet({
					word_count: (eb) => eb.ref('excluded.word_count'),
					char_count: (eb) => eb.ref('excluded.char_count'),
					language: (eb) => eb.ref('excluded.language'),
					richness_score: (eb) => eb.ref('excluded.richness_score'),
					updated_at: (eb) => eb.ref('excluded.updated_at'),
				}),
			)
			.execute();
	}

	/**
	 * Record document open event (increments open_count).
	 */
	async recordOpen(docId: string, ts: number): Promise<void> {
		await this.db
			.insertInto('doc_statistics')
			.values({
				doc_id: docId,
				last_open_ts: ts,
				open_count: 1,
				updated_at: ts,
			})
			.onConflict((oc) =>
				oc.column('doc_id').doUpdateSet({
					last_open_ts: (eb) => eb.ref('excluded.last_open_ts'),
					open_count: sql<number>`coalesce(open_count, 0) + 1`,
					updated_at: ts,
				}),
			)
			.execute();
	}

	/**
	 * Get recent opened documents.
	 */
	async getRecent(topK: number): Promise<Array<{ docId: string; lastOpenTs: number; openCount: number }>> {
		const limit = Math.max(1, topK || 20);
		const rows = await this.db
			.selectFrom('doc_statistics')
			.select(['doc_id', 'last_open_ts', 'open_count'])
			.where('last_open_ts', 'is not', null)
			.orderBy('last_open_ts', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({
			docId: String(row.doc_id),
			lastOpenTs: Number(row.last_open_ts ?? 0),
			openCount: Number(row.open_count ?? 0),
		}));
	}

	/**
	 * Get open signals for multiple doc_ids.
	 */
	async getSignalsForDocIds(docIds: string[]): Promise<Map<string, { lastOpenTs: number; openCount: number }>> {
		if (!docIds.length) return new Map();
		const rows = await this.db
			.selectFrom('doc_statistics')
			.select(['doc_id', 'last_open_ts', 'open_count'])
			.where('doc_id', 'in', docIds)
			.execute();
		const out = new Map<string, { lastOpenTs: number; openCount: number }>();
		for (const row of rows) {
			out.set(String(row.doc_id), {
				lastOpenTs: Number(row.last_open_ts ?? 0),
				openCount: Number(row.open_count ?? 0),
			});
		}
		return out;
	}

	/**
	 * Get statistics by doc_id.
	 */
	async getByDocId(docId: string): Promise<DbSchema['doc_statistics'] | null> {
		const row = await this.db
			.selectFrom('doc_statistics')
			.selectAll()
			.where('doc_id', '=', docId)
			.executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get statistics by doc_ids (batch).
	 */
	async getByDocIds(docIds: string[]): Promise<Map<string, DbSchema['doc_statistics']>> {
		if (!docIds.length) return new Map();

		const rows = await this.db
			.selectFrom('doc_statistics')
			.selectAll()
			.where('doc_id', 'in', docIds)
			.execute();

		const result = new Map<string, DbSchema['doc_statistics']>();
		for (const row of rows) {
			result.set(row.doc_id, row);
		}
		return result;
	}

	/**
	 * Delete statistics by doc_id.
	 */
	async deleteByDocId(docId: string): Promise<void> {
		await this.db.deleteFrom('doc_statistics').where('doc_id', '=', docId).execute();
	}

	/**
	 * Delete statistics by doc_ids (batch).
	 */
	async deleteByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;
		await this.db.deleteFrom('doc_statistics').where('doc_id', 'in', docIds).execute();
	}

	/**
	 * Get top documents by richness score.
	 */
	async getTopByRichness(limit: number): Promise<DbSchema['doc_statistics'][]> {
		return await this.db
			.selectFrom('doc_statistics')
			.selectAll()
			.orderBy('richness_score', 'desc')
			.limit(limit)
			.execute();
	}
}

