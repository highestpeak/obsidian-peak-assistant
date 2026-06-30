// T11Y-2a: sqlite-backed implementation of the
// `SemanticGraphTraversalReadPort`. Each method is a thin pass-through
// to `MobiusNodeRepo` / `MobiusEdgeRepo` / `EmbeddingRepo('vault')` —
// no filtering, scoring, ordering, or product policy. The serendipity
// algorithm consuming this port lives in
// `src/service/ambient/serendipity/SerendipitySearcher.ts`.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type {
	SemanticGraphTraversalNode,
	SemanticGraphTraversalReadPort,
} from '@/core/ports/SemanticGraphTraversalReadPort';

export class SqliteSemanticGraphTraversalAdapter
	implements SemanticGraphTraversalReadPort
{
	async getNodeIdByPath(path: string): Promise<string | null> {
		const row = await sqliteStoreManager.getMobiusNodeRepo().getByPath(path);
		return row?.node_id ?? null;
	}

	getEmbedding(nodeId: string): Promise<number[] | null> {
		return sqliteStoreManager
			.getEmbeddingRepo('vault')
			.getEmbeddingForSemanticSearch(nodeId);
	}

	getNeighborIdsMap(nodeIds: readonly string[]): Promise<Map<string, string[]>> {
		return sqliteStoreManager
			.getMobiusEdgeRepo()
			.getNeighborIdsMap([...nodeIds]);
	}

	filterToDocumentLikeIds(candidateIds: readonly string[]): Promise<string[]> {
		return sqliteStoreManager
			.getMobiusNodeRepo()
			.getIdsByIdsAndTypes([...candidateIds], [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]);
	}

	async getNodesByIds(
		ids: readonly string[],
	): Promise<Map<string, SemanticGraphTraversalNode>> {
		const rows = await sqliteStoreManager
			.getMobiusNodeRepo()
			.getByIds([...ids]);
		const out = new Map<string, SemanticGraphTraversalNode>();
		for (const [nodeId, row] of rows) {
			out.set(nodeId, { nodeId: row.id, label: row.label });
		}
		return out;
	}
}
