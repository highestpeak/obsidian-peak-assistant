import { sql, type Kysely } from 'kysely';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';

/**
 * Narrow ports that mirror only the SqliteStoreManager surface
 * `GraphCleanupService` actually uses. Tests can supply lightweight
 * stubs without bringing up real SQLite.
 */

/** Subset of `IndexedDocumentRepo` we depend on. */
export interface GraphCleanupIndexedDocumentReader {
	getAllIndexedPaths(): Promise<Map<string, number>>;
	getIdsByPaths(paths: string[]): Promise<{ id: string; path: string }[]>;
}

/** Subset of `MobiusNodeRepo` we depend on. */
export interface GraphCleanupMobiusNodeReader {
	getByType(type: string): Promise<{ id: string }[]>;
}

/**
 * Subset of the Kysely query builder we depend on. Typed loosely
 * (`Kysely<any>`) because the cleanup logic only touches the
 * `mobius_edge` / `mobius_node` tables and we want tests to use a
 * stub that records the operations instead of a real db schema.
 */
export type GraphCleanupDb = Kysely<any>;

export interface GraphCleanupResult {
	/** Edges whose from/to node no longer exist in mobius_node */
	orphanEdgesDeleted: number;
	/** Document-like nodes whose id is not in indexed doc set; incident edges deleted first */
	nodesWithoutIndexedDocumentDeleted: number;
}

/**
 * Maximum ids per delete chunk when removing orphan edges. The
 * single-statement `IN (...)` list would otherwise grow unbounded
 * for vaults with millions of stale edges.
 */
export const GRAPH_CLEANUP_DELETE_CHUNK_SIZE = 500;

/**
 * Removes dirty data from `mobius_node` / `mobius_edge`:
 * 1. Orphan edges: edges that reference non-existent nodes.
 * 2. Document-like nodes not backed by an indexed document row:
 *    delete those nodes and any incident edges first.
 *
 * Wired into DevTools via `window.cleanupGraphTable` (see
 * `AppContext.handleDevToolsSettingChange`).
 */
export class GraphCleanupService {
	constructor(
		private readonly db: GraphCleanupDb,
		private readonly mobiusNodeRepo: GraphCleanupMobiusNodeReader,
		private readonly indexedDocumentRepo: GraphCleanupIndexedDocumentReader,
		private readonly documentLikeNodeTypes: readonly string[] = GRAPH_DOCUMENT_LIKE_NODE_TYPES as readonly string[],
		private readonly deleteChunkSize: number = GRAPH_CLEANUP_DELETE_CHUNK_SIZE,
	) {}

	async run(): Promise<GraphCleanupResult> {
		const pathMap = await this.indexedDocumentRepo.getAllIndexedPaths();
		const paths = Array.from(pathMap.keys());
		const idRows = paths.length > 0 ? await this.indexedDocumentRepo.getIdsByPaths(paths) : [];
		const validDocIds = new Set(idRows.map((r) => r.id));

		const allNodeIdsToCheck: string[] = [];
		for (const t of this.documentLikeNodeTypes) {
			const nodes = await this.mobiusNodeRepo.getByType(t);
			allNodeIdsToCheck.push(...nodes.map((n) => n.id));
		}
		const nodeIdsWithoutIndexedDocument = [...new Set(allNodeIdsToCheck)].filter(
			(id) => !validDocIds.has(id),
		);

		let orphanEdgesDeleted = 0;

		await this.db.transaction().execute(async (trx) => {
			const orphanEdgeRows = await trx
				.selectFrom('mobius_edge')
				.select('id')
				.where(
					sql<boolean>`from_node_id NOT IN (SELECT node_id FROM mobius_node) OR to_node_id NOT IN (SELECT node_id FROM mobius_node)`,
				)
				.execute();

			const orphanEdgeIds = (orphanEdgeRows as Array<{ id: string }>).map((r) => r.id);
			if (orphanEdgeIds.length > 0) {
				for (let i = 0; i < orphanEdgeIds.length; i += this.deleteChunkSize) {
					const chunk = orphanEdgeIds.slice(i, i + this.deleteChunkSize);
					await trx.deleteFrom('mobius_edge').where('id', 'in', chunk).execute();
				}
				orphanEdgesDeleted = orphanEdgeIds.length;
			}

			if (nodeIdsWithoutIndexedDocument.length > 0) {
				await trx
					.deleteFrom('mobius_edge')
					.where((eb: any) =>
						eb.or([
							eb('from_node_id', 'in', nodeIdsWithoutIndexedDocument),
							eb('to_node_id', 'in', nodeIdsWithoutIndexedDocument),
						]),
					)
					.execute();
				await trx
					.deleteFrom('mobius_node')
					.where('node_id', 'in', nodeIdsWithoutIndexedDocument)
					.execute();
			}
		});

		return {
			orphanEdgesDeleted,
			nodesWithoutIndexedDocumentDeleted: nodeIdsWithoutIndexedDocument.length,
		};
	}
}
