import { sql } from 'kysely';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/** Node types that represent a document (id = path / doc_meta.id). */
const DOC_NODE_TYPES = ['document', 'file', 'doc'] as const;

export interface GraphCleanupResult {
	/** Edges whose from/to node no longer exist in graph_nodes */
	orphanEdgesDeleted: number;
	/** Nodes whose id (path) is not in doc_meta; their incident edges are deleted first */
	nodesWithoutDocMetaDeleted: number;
}

/**
 * Removes dirty data from graph_nodes and graph_edges:
 * 1. Orphan edges: edges that reference non-existent nodes.
 * 2. Nodes whose id (path) is not in doc_meta: delete those nodes and all edges touching them.
 *
 * Call from DevTools: window.cleanupGraphTable()
 */
export async function cleanupGraphTable(): Promise<GraphCleanupResult> {
	const kdb = sqliteStoreManager.getSearchContext();
	const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
	const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

	// Valid doc ids = ids (paths) present in doc_meta
	const pathMap = await docMetaRepo.getAllIndexedPaths();
	const paths = Array.from(pathMap.keys());
	const idRows = paths.length > 0 ? await docMetaRepo.getIdsByPaths(paths) : [];
	const validDocIds = new Set(idRows.map((r) => r.id));

	// All graph nodes whose id is not in doc_meta (path missing in doc_meta) -> to be deleted
	const allNodeIdsToCheck: string[] = [];
	for (const t of DOC_NODE_TYPES) {
		const nodes = await graphNodeRepo.getByType(t);
		allNodeIdsToCheck.push(...nodes.map((n) => n.id));
	}
	const nodeIdsWithoutDocMeta = [...new Set(allNodeIdsToCheck)].filter((id) => !validDocIds.has(id));

	let orphanEdgesDeleted = 0;

	await kdb.transaction().execute(async (trx) => {
		// 1. Orphan edges: from/to not in graph_nodes
		const orphanEdgeRows = await trx
			.selectFrom('graph_edges')
			.select('id')
			.where(
				sql<boolean>`from_node_id NOT IN (SELECT id FROM graph_nodes) OR to_node_id NOT IN (SELECT id FROM graph_nodes)`
			)
			.execute();

		const orphanEdgeIds = orphanEdgeRows.map((r) => r.id);
		if (orphanEdgeIds.length > 0) {
			const chunkSize = 500;
			for (let i = 0; i < orphanEdgeIds.length; i += chunkSize) {
				const chunk = orphanEdgeIds.slice(i, i + chunkSize);
				await trx.deleteFrom('graph_edges').where('id', 'in', chunk).execute();
			}
			orphanEdgesDeleted = orphanEdgeIds.length;
		}

		// 2. Nodes whose path (id) is not in doc_meta: delete incident edges then nodes
		if (nodeIdsWithoutDocMeta.length > 0) {
			await trx
				.deleteFrom('graph_edges')
				.where((eb) =>
					eb.or([
						eb('from_node_id', 'in', nodeIdsWithoutDocMeta),
						eb('to_node_id', 'in', nodeIdsWithoutDocMeta),
					])
				)
				.execute();
			await trx.deleteFrom('graph_nodes').where('id', 'in', nodeIdsWithoutDocMeta).execute();
		}
	});

	return {
		orphanEdgesDeleted,
		nodesWithoutDocMetaDeleted: nodeIdsWithoutDocMeta.length,
	};
}
