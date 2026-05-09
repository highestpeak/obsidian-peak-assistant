import { GRAPH_TAGGED_EDGE_TYPES } from '@/core/po/graph.po';
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticSearchResults } from "./common";
import { KEY_NODES_RRF_K, RRF_RANKING_POOL_SIZE } from "@/core/constant";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";

async function getNodeCategoryConnections(nodeIds: string[]): Promise<Map<string, number>> {
    if (!nodeIds.length) return new Map();
    const edges = await sqliteStoreManager.getMobiusEdgeRepo().getByFromNodesAndTypes(nodeIds, [...GRAPH_TAGGED_EDGE_TYPES]);
    const map = new Map<string, number>();
    for (const e of edges) map.set(e.from_node_id, (map.get(e.from_node_id) || 0) + 1);
    return map;
}

type KeyNode = { id: string; label: string; type: string; degree: number; direction: 'out' | 'in'; nodeType: 'hub' | 'authority' | 'bridge' | 'balanced'; uniqueCategories: number };

export async function findKeyNodes(params: any, templateManager?: TemplateManager) {
    const { limit, semantic_filter, response_format, filters, sorter } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const { topByOutDegree: allOutDegreeStats, topByInDegree: allInDegreeStats } =
        await mobiusEdgeRepo.getTopNodeIdsByDegree(RRF_RANKING_POOL_SIZE);

    const semanticResults = await getSemanticSearchResults(
        semantic_filter, 'limitIdsSet',
        { limitIdsSet: new Set([...allOutDegreeStats.map(s => s.nodeId), ...allInDegreeStats.map(s => s.nodeId)]) }
    );

    const sortedNodes = await calculateKeyNoteRRFScores(semanticResults, allOutDegreeStats, allInDegreeStats, !!semantic_filter, limit);
    const candidateNodeIds = sortedNodes.map(n => n.nodeId);

    // Re-query degree stats scoped to candidates (RRF pool was larger for accuracy)
    const { topByOutDegree: candidateOutDegrees, topByInDegree: candidateInDegrees } =
        await mobiusEdgeRepo.getTopNodeIdsByDegree(limit, candidateNodeIds);
    const nodeMap = await mobiusNodeRepo.getByIds(candidateNodeIds);
    const metaMap = new Map(sortedNodes.map(n => [n.nodeId, { nodeType: n.nodeType, uniqueCategories: n.uniqueCategories }]));

    const toKeyNode = (nodeId: string, degree: number, direction: 'out' | 'in'): KeyNode => {
        const info = nodeMap.get(nodeId);
        const meta = metaMap.get(nodeId) || { nodeType: 'balanced' as const, uniqueCategories: 0 };
        return { id: nodeId, label: info?.label || nodeId, type: info?.type || 'unknown', degree, direction, nodeType: meta.nodeType, uniqueCategories: meta.uniqueCategories };
    };

    let allKeyNodes: KeyNode[] = [
        ...candidateOutDegrees.map(s => toKeyNode(s.nodeId, s.outDegree, 'out')),
        ...candidateInDegrees.map(s => toKeyNode(s.nodeId, s.inDegree, 'in')),
    ];

    if (filters) {
        const itemFiledGetter = await getDefaultItemFiledGetter<KeyNode>(candidateNodeIds, filters, sorter);
        allKeyNodes = applyFiltersAndSorters(allKeyNodes, filters, sorter, undefined, itemFiledGetter);
    }

    return buildResponse(response_format, ToolTemplateId.FindKeyNodes, { key_nodes: allKeyNodes }, { templateManager });
}

async function calculateKeyNoteRRFScores(
    semanticResults: Array<{ nodeId: string; score: number }>,
    allOutDegreeStats: Array<{ nodeId: string; outDegree: number }>,
    allInDegreeStats: Array<{ nodeId: string; inDegree: number }>,
    semanticEnabled: boolean,
    candidateLimit: number,
) {
    const rankMap = (arr: Array<{ nodeId: string }>) => new Map(arr.map((s, i) => [s.nodeId, i + 1]));
    const outRanks = rankMap(allOutDegreeStats);
    const inRanks = rankMap(allInDegreeStats);
    const semRanks = rankMap(semanticResults);
    const outMap = new Map(allOutDegreeStats.map(s => [s.nodeId, s.outDegree]));
    const inMap = new Map(allInDegreeStats.map(s => [s.nodeId, s.inDegree]));

    const allNodeIds = new Set([...allOutDegreeStats.map(s => s.nodeId), ...allInDegreeStats.map(s => s.nodeId)]);
    const catConns = await getNodeCategoryConnections([...allNodeIds]);
    const INF = Number.MAX_SAFE_INTEGER;

    const scores = [...allNodeIds].map(nodeId => {
        const outDegree = outMap.get(nodeId) || 0;
        const inDegree = inMap.get(nodeId) || 0;
        const uniqueCategories = catConns.get(nodeId) || 0;
        const semRank = semRanks.get(nodeId) || INF;
        const semScore = semanticEnabled ? 1 / (KEY_NODES_RRF_K + semRank) : 0;
        const degreeScore = Math.max(1 / (KEY_NODES_RRF_K + (outRanks.get(nodeId) || INF)), 1 / (KEY_NODES_RRF_K + (inRanks.get(nodeId) || INF)));

        const nodeType: 'hub' | 'authority' | 'bridge' | 'balanced' =
            uniqueCategories >= 2 ? 'bridge'
            : outDegree > inDegree * 1.2 && outDegree > 3 ? 'hub'
            : inDegree > outDegree * 1.2 && inDegree > 3 ? 'authority'
            : 'balanced';

        return { nodeId, outDegree, inDegree, semanticScore: semRank < INF ? semScore : 0,
            rrfScore: semScore + degreeScore + (nodeType === 'bridge' ? 0.1 : 0), nodeType, uniqueCategories };
    });

    return scores.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, candidateLimit * 2);
}
