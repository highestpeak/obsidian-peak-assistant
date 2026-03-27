import { sql } from 'kysely';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export interface GraphCleanupResult {
	/** Edges whose from/to node no longer exist in mobius_node */
	orphanEdgesDeleted: number;
	/** Document-like nodes whose id is not in indexed doc set; incident edges deleted first */
	nodesWithoutIndexedDocumentDeleted: number;
}

/**
 * Removes dirty data from mobius_node / mobius_edge:
 * 1. Orphan edges: edges that reference non-existent nodes.
 * 2. Document-like nodes not backed by an indexed document row: delete those nodes and incident edges.
 *
 * Call from DevTools: window.cleanupGraphTable()
 */
export async function cleanupGraphTable(): Promise<GraphCleanupResult> {
	const kdb = sqliteStoreManager.getSearchContext();
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
	const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();

	const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
	const paths = Array.from(pathMap.keys());
	const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
	const validDocIds = new Set(idRows.map((r) => r.id));

	const allNodeIdsToCheck: string[] = [];
	for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
		const nodes = await mobiusNodeRepo.getByType(t);
		allNodeIdsToCheck.push(...nodes.map((n) => n.id));
	}
	const nodeIdsWithoutIndexedDocument = [...new Set(allNodeIdsToCheck)].filter((id) => !validDocIds.has(id));

	let orphanEdgesDeleted = 0;

	await kdb.transaction().execute(async (trx) => {
		const orphanEdgeRows = await trx
			.selectFrom('mobius_edge')
			.select('id')
			.where(
				sql<boolean>`from_node_id NOT IN (SELECT node_id FROM mobius_node) OR to_node_id NOT IN (SELECT node_id FROM mobius_node)`,
			)
			.execute();

		const orphanEdgeIds = orphanEdgeRows.map((r) => r.id);
		if (orphanEdgeIds.length > 0) {
			const chunkSize = 500;
			for (let i = 0; i < orphanEdgeIds.length; i += chunkSize) {
				const chunk = orphanEdgeIds.slice(i, i + chunkSize);
				await trx.deleteFrom('mobius_edge').where('id', 'in', chunk).execute();
			}
			orphanEdgesDeleted = orphanEdgeIds.length;
		}

		if (nodeIdsWithoutIndexedDocument.length > 0) {
			await trx
				.deleteFrom('mobius_edge')
				.where((eb) =>
					eb.or([
						eb('from_node_id', 'in', nodeIdsWithoutIndexedDocument),
						eb('to_node_id', 'in', nodeIdsWithoutIndexedDocument),
					]),
				)
				.execute();
			await trx.deleteFrom('mobius_node').where('node_id', 'in', nodeIdsWithoutIndexedDocument).execute();
		}
	});

	return {
		orphanEdgesDeleted,
		nodesWithoutIndexedDocumentDeleted: nodeIdsWithoutIndexedDocument.length,
	};
}
