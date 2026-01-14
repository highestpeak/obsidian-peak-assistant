import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticSearchResults } from "./common";
import { KEY_NODES_RRF_K, RRF_RANKING_POOL_SIZE } from "@/core/constant";
import { template as FIND_KEY_NODES_TEMPLATE } from "../templates/find-key-nodes";
import { buildResponse } from "../types";
import { emptyMap } from "@/core/utils/collection-utils";

export async function findKeyNodes(params: any) {
    const { limit, semantic_filter, response_format, filters, sorter } = params;
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

    // Get top nodes' degree statistics for RRF calculation
    const { topByOutDegree: allOutDegreeStats, topByInDegree: allInDegreeStats } =
        await graphEdgeRepo.getTopNodeIdsByDegree(RRF_RANKING_POOL_SIZE);

    // Apply semantic filter to the node pool for RRF calculation
    const semanticResults = await getSemanticSearchResults(
        semantic_filter, 'limitIdsSet',
        {
            limitIdsSet: new Set([
                ...allOutDegreeStats.map(stat => stat.nodeId),
                ...allInDegreeStats.map(stat => stat.nodeId)
            ])
        }
    )

    // Calculate RRF scores using the dedicated function
    const sortedNodes = calculateKeyNoteRRFScores(
        semanticResults,
        allOutDegreeStats,
        allInDegreeStats,
        !!semantic_filter,
        limit
    );

    // Separate into source nodes (high out-degree) and sink nodes (high in-degree) from the top candidates
    const candidateNodeIds = sortedNodes.map(node => node.nodeId);

    // Get degree stats only for candidate nodes
    // For two getTopNodeIdsByDegree query: Above RRF algorithm requires a sufficiently large node pool (500 nodes) 
    //     to calculate accurate ranking scores, avoiding bias from considering too few nodes.
    //     Then we use the user-specified limit (a smaller number, e.g., 10-20) on top of this pool.
    const { topByOutDegree: candidateOutDegrees, topByInDegree: candidateInDegrees } =
        await graphEdgeRepo.getTopNodeIdsByDegree(limit, candidateNodeIds);

    // Batch fetch node labels
    const nodeMap = await graphNodeRepo.getByIds(candidateNodeIds);

    // Group nodes by semantic relevance and type
    type PhysicalNode = { id: string; label: string; degree: number; index: number };
    let physicalSourceNodes: Array<PhysicalNode> = [];
    let physicalSinkNodes: Array<PhysicalNode> = [];

    // Process source nodes (out-degree)
    for (const stat of candidateOutDegrees) {
        const nodeData = {
            id: stat.nodeId,
            label: nodeMap.get(stat.nodeId)?.label || stat.nodeId,
            degree: stat.outDegree
        };

        physicalSourceNodes.push({ ...nodeData, index: physicalSourceNodes.length + 1 });
    }

    // Process sink nodes (in-degree)
    for (const stat of candidateInDegrees) {
        const nodeData = {
            id: stat.nodeId,
            label: nodeMap.get(stat.nodeId)?.label || stat.nodeId,
            degree: stat.inDegree
        };

        physicalSinkNodes.push({ ...nodeData, index: physicalSinkNodes.length + 1 });
    }

    if (filters) {
        const itemFiledGetter = await getDefaultItemFiledGetter<PhysicalNode>(candidateNodeIds, filters, sorter);
        physicalSourceNodes = applyFiltersAndSorters(physicalSourceNodes, filters, sorter, undefined, itemFiledGetter);
        physicalSinkNodes = applyFiltersAndSorters(physicalSinkNodes, filters, sorter, undefined, itemFiledGetter);
    }

    return buildResponse(response_format, FIND_KEY_NODES_TEMPLATE, {
        physical_source_nodes: physicalSourceNodes,
        physical_sink_nodes: physicalSinkNodes
    });
}

/**
 * Calculate RRF (Reciprocal Rank Fusion) scores combining semantic similarity and degree centrality.
 * Uses the standard RRF formula: score = sum(1/(k + rank)) across different ranking sources.
 * Operates on a pool of top-ranked nodes by degree to balance performance and accuracy.
 *
 * @param semanticResults Semantic search results with document IDs and scores
 * @param allOutDegreeStats Top nodes' out-degree statistics (from ranking pool)
 * @param allInDegreeStats Top nodes' in-degree statistics (from ranking pool)
 * @param semanticEnabled Whether semantic filtering is enabled
 * @param candidateLimit Maximum number of candidates to return (multiplied by 2 for source/sink separation)
 * @returns Array of nodes sorted by RRF score, with degree and semantic information
 */
function calculateKeyNoteRRFScores(
    semanticResults: Array<{ nodeId: string; score: number }>,
    allOutDegreeStats: Array<{ nodeId: string; outDegree: number }>,
    allInDegreeStats: Array<{ nodeId: string; inDegree: number }>,
    semanticEnabled: boolean,
    candidateLimit: number
): Array<{
    nodeId: string;
    outDegree: number;
    inDegree: number;
    semanticScore: number;
    rrfScore: number;
}> {
    // Create ranking maps for efficient lookup
    const outDegreeRankMap = new Map<string, number>();
    const inDegreeRankMap = new Map<string, number>();
    const semanticRankMap = new Map<string, number>();

    // Build degree ranking maps (rank starts from 1)
    allOutDegreeStats.forEach((stat, index) => {
        outDegreeRankMap.set(stat.nodeId, index + 1);
    });
    allInDegreeStats.forEach((stat, index) => {
        inDegreeRankMap.set(stat.nodeId, index + 1);
    });

    // Build semantic ranking map (rank starts from 1, based on search result order)
    semanticResults.forEach((result, index) => {
        semanticRankMap.set(result.nodeId, index + 1);
    });

    // Convert stats arrays to Maps for O(1) lookup (eliminates O(n²) complexity)
    const outDegreeMap = new Map(allOutDegreeStats.map(stat => [stat.nodeId, stat.outDegree]));
    const inDegreeMap = new Map(allInDegreeStats.map(stat => [stat.nodeId, stat.inDegree]));

    // Calculate RRF scores for each node
    const nodeScores = new Map<string, {
        nodeId: string;
        outDegree: number;
        inDegree: number;
        semanticScore: number;
        rrfScore: number;
    }>();

    // Process all nodes that have degree information
    const allNodeIds = new Set([
        ...allOutDegreeStats.map(stat => stat.nodeId),
        ...allInDegreeStats.map(stat => stat.nodeId)
    ]);

    for (const nodeId of allNodeIds) {
        const outDegree = outDegreeMap.get(nodeId) || 0;
        const inDegree = inDegreeMap.get(nodeId) || 0;

        const outDegreeRank = outDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
        const inDegreeRank = inDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
        const semanticRank = semanticRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;

        // Calculate RRF score: combine semantic rank with degree ranks
        const semanticContribution = semanticEnabled ? 1 / (KEY_NODES_RRF_K + semanticRank) : 0;
        // Use the better (lower) of out-degree and in-degree rank for overall degree importance
        // If a node is superindex (with high outdegree) or superhub (with high indegree), it will receive an exceptionally high degree rank.
        const degreeRank = Math.min(outDegreeRank, inDegreeRank);
        const degreeContribution = 1 / (KEY_NODES_RRF_K + degreeRank);
        const rrfScore = semanticContribution + degreeContribution;

        nodeScores.set(nodeId, {
            nodeId,
            outDegree,
            inDegree,
            semanticScore: semanticRank < Number.MAX_SAFE_INTEGER ? semanticContribution : 0,
            rrfScore
        });
    }

    // Sort by RRF score and take top N candidates
    return Array.from(nodeScores.values())
        .sort((a, b) => b.rrfScore - a.rrfScore)
        .slice(0, candidateLimit * 2); // Get more candidates to ensure we have enough for both out-degree and in-degree rankings
}
