// T11B: Concrete semantic-graph port. Owns every Mobius node / edge /
// indexed-doc / embedding lookup the two semantic actions need
// (`suggest-semantic-links` + `smart-connections`). Service code now
// asks for "unlinked semantic neighbors" — the adapter handles every
// sqlite call.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphEdgeType } from '@/core/po/graph.po';
import { getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import type {
	CopilotActionSemanticGraphPort,
	SemanticLinkNeighbor,
	SmartConnection,
} from '@/service/copilot/actions/CopilotActionPorts';

export class SqliteCopilotActionSemanticGraphAdapter implements CopilotActionSemanticGraphPort {
	async findSemanticLinkNeighbors(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ suggestions: SemanticLinkNeighbor[]; totalNeighbors: number; indexed: boolean }> {
		const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

		const docNode = await nodeRepo.getByPath(filePath);
		if (!docNode) {
			return { suggestions: [], totalNeighbors: 0, indexed: false };
		}
		const docNodeId = docNode.node_id;

		const outEdges = await edgeRepo.getByFromNode(docNodeId);
		const semanticOut = outEdges.filter(e => e.type === GraphEdgeType.SemanticRelated);

		const inRows = await edgeRepo.getByToNodesAndTypes([docNodeId], [GraphEdgeType.SemanticRelated]);
		const inFromIds = inRows.map(r => r.from_node_id);

		const neighborMap = new Map<string, { weight: number; direction: 'outgoing' | 'incoming' }>();
		for (const e of semanticOut) {
			neighborMap.set(e.to_node_id, { weight: e.weight, direction: 'outgoing' });
		}
		for (const nid of inFromIds) {
			if (!neighborMap.has(nid)) {
				neighborMap.set(nid, { weight: 0.5, direction: 'incoming' });
			}
		}

		if (neighborMap.size === 0) {
			return { suggestions: [], totalNeighbors: 0, indexed: true };
		}

		const neighborIds = [...neighborMap.keys()];
		const neighborMeta = new Map<string, { path: string | null; label: string }>();
		for (const nid of neighborIds) {
			const row = await nodeRepo.getByNodeId(nid);
			if (row) neighborMeta.set(nid, { path: row.path, label: row.label });
		}

		const suggestions: SemanticLinkNeighbor[] = [];
		for (const [nid, info] of neighborMap.entries()) {
			const meta = neighborMeta.get(nid);
			if (!meta || !meta.path) continue;
			if (existingLinkPaths.has(meta.path)) continue;
			if (meta.path === filePath) continue;

			const title = meta.label || meta.path.replace(/\.md$/, '').split('/').pop() || meta.path;
			suggestions.push({
				path: meta.path,
				title,
				score: info.weight,
				direction: info.direction,
				snippet: `Similarity: ${(info.weight * 100).toFixed(0)}%`,
			});
		}

		suggestions.sort((a, b) => b.score - a.score);
		return { suggestions: suggestions.slice(0, 20), totalNeighbors: neighborMap.size, indexed: true };
	}

	async findSmartConnections(
		filePath: string,
		existingLinkPaths: Set<string>,
	): Promise<{ connections: SmartConnection[]; indexed: boolean }> {
		const indexedDocRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const docMeta = await indexedDocRepo.getByPath(filePath);
		if (!docMeta) {
			return { connections: [], indexed: false };
		}

		const existingNodeIds = new Set<string>();
		for (const linkPath of existingLinkPaths) {
			const linkedDoc = await indexedDocRepo.getByPath(linkPath);
			if (linkedDoc) existingNodeIds.add(linkedDoc.id);
		}

		const semanticNeighbors = await getSemanticNeighbors(docMeta.id, 20, existingNodeIds);

		const graphRepo = sqliteStoreManager.getGraphRepo();
		const { idMapToTags } = await graphRepo.getTagsByDocIds([docMeta.id]);
		const myTags = new Set<string>(idMapToTags.get(docMeta.id)?.topicTags ?? []);

		const connections: SmartConnection[] = [];
		for (const neighbor of semanticNeighbors) {
			const path = JSON.parse(neighbor.attributes || '{}').path;
			if (!path) continue;
			if (path === filePath) continue;
			if (existingLinkPaths.has(path)) continue;

			const { idMapToTags: neighborTagsMap } = await graphRepo.getTagsByDocIds([neighbor.id]);
			const neighborTags = neighborTagsMap.get(neighbor.id)?.topicTags ?? [];
			const sharedThemes = neighborTags.filter(t => myTags.has(t));

			const similarity = parseFloat(neighbor.similarity) / 100;
			const title = neighbor.label || path.replace(/\.md$/, '').split('/').pop() || path;

			connections.push({
				path,
				title,
				similarityScore: similarity,
				sharedThemes: sharedThemes.slice(0, 5),
				suggestedLinkText: title,
			});
		}

		connections.sort((a, b) => b.similarityScore - a.similarityScore);
		return { connections: connections.slice(0, 15), indexed: true };
	}
}
