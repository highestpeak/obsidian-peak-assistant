// T11Y-4b: SQLite implementation of the narrow
// {@link SemanticLinkReadPort}. Pure read surface — every method maps to
// one or two repo calls and returns plain shapes. Filtering, ranking,
// title/snippet rendering, and similarity parsing live in the service
// layer (`SemanticLinkSuggestionService` + `SmartConnectionService`).
//
// Before T11Y-4b the equivalent code sat on the app layer inside
// `SqliteCopilotActionSemanticGraphAdapter` and mixed merging,
// fallback weights, top-N, and snippet building into the same class.
// That adapter is now retired in favor of this read port plus the two
// services.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphEdgeType } from '@/core/po/graph.po';
import { getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import type {
	SemanticEmbeddingNeighbor,
	SemanticGraphNeighbor,
	SemanticGraphNodeMeta,
	SemanticLinkReadPort,
} from '@/core/ports/SemanticLinkReadPort';

const SEMANTIC_INCOMING_FALLBACK_WEIGHT = 0.5;

export class SqliteSemanticLinkReadAdapter implements SemanticLinkReadPort {
	async getOneHopSemanticNeighbors(filePath: string): Promise<{
		neighbors: SemanticGraphNeighbor[];
	} | null> {
		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

		const docNode = await nodeRepo.getByPath(filePath);
		if (!docNode) return null;

		const docNodeId = docNode.node_id;
		const outEdges = await edgeRepo.getByFromNode(docNodeId);
		const inRows = await edgeRepo.getByToNodesAndTypes([docNodeId], [GraphEdgeType.SemanticRelated]);

		const neighbors: SemanticGraphNeighbor[] = [];
		const seen = new Set<string>();

		for (const e of outEdges) {
			if (e.type !== GraphEdgeType.SemanticRelated) continue;
			if (seen.has(e.to_node_id)) continue;
			seen.add(e.to_node_id);
			neighbors.push({ nodeId: e.to_node_id, weight: e.weight, direction: 'outgoing' });
		}
		for (const row of inRows) {
			if (seen.has(row.from_node_id)) continue;
			seen.add(row.from_node_id);
			// Fallback weight: the incoming-edge query does not select
			// `weight`. The original adapter assigned 0.5 here.
			neighbors.push({
				nodeId: row.from_node_id,
				weight: SEMANTIC_INCOMING_FALLBACK_WEIGHT,
				direction: 'incoming',
			});
		}

		return { neighbors };
	}

	async getGraphNodeMetaByIds(nodeIds: ReadonlyArray<string>): Promise<Map<string, SemanticGraphNodeMeta>> {
		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const out = new Map<string, SemanticGraphNodeMeta>();
		for (const nid of nodeIds) {
			const row = await nodeRepo.getByNodeId(nid);
			if (!row) continue;
			out.set(nid, { nodeId: nid, path: row.path, label: row.label });
		}
		return out;
	}

	async getEmbeddingNeighbors(
		filePath: string,
		options: { limit: number; excludeDocIds: ReadonlySet<string> },
	): Promise<{ neighbors: SemanticEmbeddingNeighbor[] } | null> {
		const indexedDocRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const docMeta = await indexedDocRepo.getByPath(filePath);
		if (!docMeta) return null;

		const raw = await getSemanticNeighbors(
			docMeta.id,
			options.limit,
			options.excludeDocIds as Set<string>,
		);

		const neighbors: SemanticEmbeddingNeighbor[] = raw.map(n => {
			let path: string | null = null;
			try {
				const attrs = JSON.parse(n.attributes || '{}');
				path = typeof attrs.path === 'string' ? attrs.path : null;
			} catch {
				path = null;
			}
			const sim = parseFloat(n.similarity) / 100;
			return {
				docId: n.id,
				path,
				label: n.label,
				similarity: Number.isFinite(sim) ? sim : 0,
			};
		});

		return { neighbors };
	}

	async getIndexedDocumentIdsByPaths(paths: ReadonlyArray<string>): Promise<Map<string, string>> {
		const indexedDocRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const out = new Map<string, string>();
		for (const p of paths) {
			const row = await indexedDocRepo.getByPath(p);
			if (row) out.set(p, row.id);
		}
		return out;
	}

	async getTopicTagsByDocIds(docIds: ReadonlyArray<string>): Promise<Map<string, ReadonlySet<string>>> {
		if (docIds.length === 0) return new Map();
		const graphRepo = sqliteStoreManager.getGraphRepo();
		const { idMapToTags } = await graphRepo.getTagsByDocIds([...docIds]);
		const out = new Map<string, ReadonlySet<string>>();
		for (const docId of docIds) {
			const tags = idMapToTags.get(docId)?.topicTags ?? [];
			out.set(docId, new Set(tags));
		}
		return out;
	}
}
