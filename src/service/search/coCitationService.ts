/**
 * Co-citation service: finds notes frequently cited alongside the current note
 * by shared third-party notes.
 *
 * Co-citation score = shared_citer_count / 10 (normalized).
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexService';

export interface CoCitationResult {
	nodeId: string;
	path: string;
	label: string;
	/** Notes that cite both the source and this note */
	citingNotes: string[];
	score: number;
}

/**
 * Build the co-citation SQL query (pure, no DB access — testable).
 */
export function buildCoCitationQuery(
	sourceNodeId: string,
	limit: number,
): { sql: string; params: unknown[] } {
	const sql = `
SELECT
  e2.to_node_id AS co_cited_id,
  n.label,
  n.path,
  COUNT(DISTINCT e1.from_node_id) AS shared_citer_count,
  GROUP_CONCAT(DISTINCT n2.label) AS citing_labels
FROM mobius_edge e1
JOIN mobius_edge e2 ON e1.from_node_id = e2.from_node_id
JOIN mobius_node n ON n.node_id = e2.to_node_id
JOIN mobius_node n2 ON n2.node_id = e1.from_node_id
WHERE e1.to_node_id = ?
  AND e2.to_node_id != ?
  AND e1.type = 'references'
  AND e2.type = 'references'
  AND n.type = 'document'
GROUP BY e2.to_node_id
HAVING shared_citer_count >= 2
ORDER BY shared_citer_count DESC
LIMIT ?
`.trim();

	return { sql, params: [sourceNodeId, sourceNodeId, limit] };
}

/**
 * Get co-cited notes for the given vault path.
 */
export async function getCoCitations(
	currentPath: string,
	limit = 10,
): Promise<CoCitationResult[]> {
	const tenant = getIndexTenantForPath(currentPath);
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

	const docMeta = await indexedDocumentRepo.getByPath(currentPath);
	if (!docMeta) return [];

	const rawDb =
		tenant === 'chat'
			? sqliteStoreManager.getMetaStore()
			: sqliteStoreManager.getSearchStore();
	if (!rawDb) return [];

	const { sql: querySql, params } = buildCoCitationQuery(docMeta.id, limit);

	type Row = {
		co_cited_id: string;
		label: string | null;
		path: string | null;
		shared_citer_count: number;
		citing_labels: string | null;
	};

	let rows: Row[];
	try {
		const stmt = rawDb.prepare(querySql);
		rows = stmt.all(...params) as Row[];
	} catch {
		return [];
	}

	return rows.map((row) => ({
		nodeId: row.co_cited_id,
		path: row.path ?? '',
		label: row.label ?? '',
		citingNotes: row.citing_labels ? row.citing_labels.split(',').filter(Boolean) : [],
		score: Math.min(1, (row.shared_citer_count ?? 0) / 10),
	}));
}
