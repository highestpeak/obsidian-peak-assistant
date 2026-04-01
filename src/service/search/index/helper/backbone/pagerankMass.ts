/**
 * Batch-loads PageRank scalars from `mobius_node` for document ids.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * Returns pagerank / semantic_pagerank per node id (0 when missing).
 */
export async function loadDocPageranks(docIds: string[]): Promise<Map<string, { pr: number; spr: number }>> {
	const out = new Map<string, { pr: number; spr: number }>();
	if (!docIds.length || !sqliteStoreManager.isInitialized()) return out;

	const kdb = sqliteStoreManager.getIndexContext('vault');
	const chunk = 900;
	for (let i = 0; i < docIds.length; i += chunk) {
		const slice = docIds.slice(i, i + chunk);
		const rows = await kdb
			.selectFrom('mobius_node')
			.select(['node_id', 'pagerank', 'semantic_pagerank'])
			.where('node_id', 'in', slice)
			.execute();
		for (const r of rows) {
			const id = String(r.node_id);
			out.set(id, {
				pr: typeof r.pagerank === 'number' && Number.isFinite(r.pagerank) ? r.pagerank : 0,
				spr:
					typeof r.semantic_pagerank === 'number' && Number.isFinite(r.semantic_pagerank)
						? r.semantic_pagerank
						: 0,
			});
		}
	}
	return out;
}
