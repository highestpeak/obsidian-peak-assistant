import type { QueryBuilder } from '../query-builder';
import type { Database } from '../database';

/**
 * CRUD repository for `recent_open` table.
 */
export class RecentOpenRepo {
	constructor(private readonly qb: QueryBuilder) {}

	recordOpen(path: string, ts: number): void {
		this.qb
			.insertInto('recent_open')
			.onConflictUpdate(
				{
					path,
					last_open_ts: ts,
					open_count: 1,
				},
				'path',
				{
					open_count: 'open_count + 1',
				},
			);
	}

	/**
	 * Delete open-signal rows for the given paths.
	 */
	deleteByPaths(paths: string[]): void {
		if (!paths.length) return;
		this.qb.deleteFrom('recent_open').where('path', 'IN', paths).execute();
	}

	getSignalsForPaths(paths: string[]): Map<string, { lastOpenTs: number; openCount: number }> {
		if (!paths.length) return new Map();

		const rows = this.qb
			.select('recent_open')
			.selectColumns(['path', 'last_open_ts', 'open_count'])
			.where('path', 'IN', paths)
			.execute();

		const out = new Map<string, { lastOpenTs: number; openCount: number }>();
		for (const row of rows) {
			out.set(String(row.path), {
				lastOpenTs: Number(row.last_open_ts ?? 0),
				openCount: Number(row.open_count ?? 0),
			});
		}
		return out;
	}

	getRecent(topK: number): Array<{ path: string; lastOpenTs: number; openCount: number }> {
		const limit = Math.max(1, topK || 20);
		const rows = this.qb
			.select('recent_open')
			.selectColumns(['path', 'last_open_ts', 'open_count'])
			.orderBy('last_open_ts', 'DESC')
			.limit(limit)
			.execute();

		return rows.map((row) => ({
			path: String(row.path),
			lastOpenTs: Number(row.last_open_ts ?? 0),
			openCount: Number(row.open_count ?? 0),
		}));
	}

	/**
	 * List recent opened items with best-effort metadata join.
	 */
	getRecentWithMeta(topK: number): Array<{ path: string; title: string; type: string; mtime: number; lastOpenTs: number; openCount: number }> {
		const recent = this.getRecent(topK);
		if (!recent.length) return [];

		const paths = recent.map((r) => r.path);
		const metaRows = this.qb
			.select('doc_meta')
			.selectColumns(['path', 'title', 'type', 'mtime'])
			.where('path', 'IN', paths)
			.execute();

		const meta = new Map<string, { title: string; type: string; mtime: number }>();
		for (const row of metaRows) {
			meta.set(String(row.path), {
				title: String(row.title ?? row.path),
				type: String(row.type ?? 'markdown'),
				mtime: Number(row.mtime ?? 0),
			});
		}

		return recent.map((r) => {
			const m = meta.get(r.path);
			return {
				path: r.path,
				title: m?.title ?? r.path,
				type: m?.type ?? 'markdown',
				mtime: m?.mtime ?? 0,
				lastOpenTs: r.lastOpenTs,
				openCount: r.openCount,
			};
		});
	}
}


