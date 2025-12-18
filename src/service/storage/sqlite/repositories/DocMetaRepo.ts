import type { QueryBuilder } from '../query-builder';
import type { Database } from '../database';

/**
 * CRUD repository for `doc_meta` table.
 */
export class DocMetaRepo {
	constructor(private readonly qb: QueryBuilder) {}

	upsert(doc: { path: string; title: string; type: string; mtime: number }): void {
		this.qb
			.insertInto('doc_meta')
			.onConflictUpdate(
				{
					path: doc.path,
					title: doc.title,
					type: doc.type,
					mtime: doc.mtime,
				},
				'path',
			);
	}

	/**
	 * Delete metadata rows for the given paths.
	 */
	deleteByPaths(paths: string[]): void {
		if (!paths.length) return;
		this.qb.deleteFrom('doc_meta').where('path', 'IN', paths).execute();
	}

	/**
	 * Get all indexed file paths with their modification times.
	 * Returns a map of path -> mtime for efficient lookup.
	 */
	getAllIndexedPaths(): Map<string, number> {
		const rows = this.qb.select('doc_meta').selectColumns(['path', 'mtime']).execute();
		const result = new Map<string, number>();
		for (const row of rows) {
			// mtime can be null in database, but we treat it as 0 if missing
			const mtime = row.mtime ?? 0;
			result.set(row.path, mtime);
		}
		return result;
	}
}


