import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';

/**
 * CRUD repository for recent open functionality.
 * 
 * @deprecated This repository is deprecated. Use DocStatisticsRepo instead.
 * The recent_open table has been merged into doc_statistics table.
 * This class is kept for backward compatibility with deprecated code.
 */
export class RecentOpenRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

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
	 * Delete open-signal rows for the given doc_ids.
	 */
	async deleteByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;
		await this.db
			.updateTable('doc_statistics')
			.set({
				last_open_ts: null,
				open_count: null,
			})
			.where('doc_id', 'in', docIds)
			.execute();
	}

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
	 * List recent opened items with metadata.
	 * Fetches doc_meta separately to avoid JOIN.
	 */
	async getRecentWithMeta(topK: number): Promise<Array<{ docId: string; path: string; title: string; type: string; mtime: number; lastOpenTs: number; openCount: number }>> {
		const recent = await this.getRecent(topK);
		if (!recent.length) return [];
		const docIds = recent.map((r) => r.docId);
		const metaRows = await this.db
			.selectFrom('doc_meta')
			.select(['id', 'path', 'title', 'type', 'mtime'])
			.where('id', 'in', docIds)
			.execute();
		const meta = new Map<string, { path: string; title: string; type: string; mtime: number }>();
		for (const row of metaRows) {
			meta.set(String(row.id), {
				path: String(row.path),
				title: String(row.title ?? row.path),
				type: String(row.type ?? 'markdown'),
				mtime: Number(row.mtime ?? 0),
			});
		}
		return recent.map((r) => {
			const m = meta.get(r.docId);
			return {
				docId: r.docId,
				path: m?.path ?? '',
				title: m?.title ?? '',
				type: m?.type ?? 'markdown',
				mtime: m?.mtime ?? 0,
				lastOpenTs: r.lastOpenTs,
				openCount: r.openCount,
			};
		});
	}
}


