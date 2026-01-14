import { GraphNodeType } from "@/core/po";
import { GraphNode } from "@/core/storage/sqlite/repositories/GraphNodeRepo";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { EMPTY_SET, emptyMap } from "@/core/utils/collection-utils";
import { DocStatistics } from "@/core/storage/sqlite/repositories/DocStatisticsRepo";
import { GRAPH_RRF_WEIGHTS, RRF_K, PHYSICAL_CONNECTION_BONUS } from "@/core/constant";
import { AppContext } from "@/app/context/AppContext";
import { SearchScopeMode, SearchScopeValue } from "@/service/search/types";
import { getFileTypeByPath } from "@/core/utils/obsidian-utils";
import { getCachedBooleanExpression, getCachedRegex } from "@/core/utils/format-utils";
import { parseSemanticDateRange } from "@/core/utils/date-utils";

export type SemanticNeighborNode = GraphNode & { similarity: string }

// Doc-to-Doc Retrieval
export async function getSemanticNeighbors(docId: string, limit: number, filterDocIds: Set<string> = EMPTY_SET):
    Promise<SemanticNeighborNode[]> {
    // Get embedding repository for vector search
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();

    // Get average embedding vector for this document
    const averageVector = await embeddingRepo.getAverageEmbeddingForDoc(docId);

    if (!averageVector) {
        return [];
    }

    // Perform semantic search
    // If you want 'limit' semantic neighbors, but 3 of them are already your structural neighbors, after filtering you'll only have limit - 3 left. So, fetch more at first (e.g., limit * 2), then after filtering, slice(0, limit) to ensure you still return the full number of semantic neighbors to the Agent.
    const searchResults = await embeddingRepo.searchSimilarAndGetId(averageVector, limit * 2);
    // Get unique doc_ids and fetch their metadata
    const resultDocIds = Array.from(new Set(searchResults.map(r => r.doc_id)));
    // doc info
    const resultDocNodesMap = await sqliteStoreManager.getGraphNodeRepo().getByIds(resultDocIds);

    return searchResults.map(r => {
        const docId = r.doc_id;
        const resultDocNode = resultDocNodesMap.get(docId);
        if (!resultDocNode) return null;
        return {
            ...resultDocNode,
            // easier to understand for Agent (and user) in percentage form
            similarity: `${(r.similarity * 100).toFixed(1)}%`,
        };
    })
        .filter(n => n !== null)
        // not myself
        .filter(n => n.id !== docId)
        // not my neighbor documents already included
        .filter(n => !filterDocIds.has(n.id))
        .slice(0, limit);
}

type ClusterNodesDescription = {
    documentNodes?: GraphNode[],
    tagDesc?: string,
    categoryDesc?: string,
    omittedDocNodeCnt?: number
}

/**
 * limit the number of nodes in each cluster. to avoid token explosion.
 *
 * WARNING: how we distill the nodes data determined by the node types. {@link GraphNodeType}
 * when node type change. redesign this function.
 * 
 * @param nodes - do not change the original nodes item. as it may extend GraphNode type. many hide fields.
 */
export async function distillClusterNodesData(nodes: GraphNode[], limit: number): Promise<ClusterNodesDescription> {
    // Map node types to arrays of nodes
    const typeNodeMap: { [key in GraphNodeType]?: GraphNode[] } = {};
    for (const node of nodes) {
        const type = node.type as GraphNodeType;
        if (!typeNodeMap[type]) {
            typeNodeMap[type] = [];
        }
        typeNodeMap[type]!.push(node);
    }

    // For compatibility with previous code, extract specific groups used below
    let documentNodes = typeNodeMap['document'];
    let omittedDocNodeCnt = 0;
    // Implement RRF (Reciprocal Rank Fusion) sorting based on connection density, update time, and similarity
    if (documentNodes && documentNodes.length > 0) {
        const nodeIds = documentNodes.map(node => node.id);

        const densityMap = await sqliteStoreManager.getGraphEdgeRepo().countEdges(nodeIds, 'document');
        const docStatisticsMap = await sqliteStoreManager.getDocStatisticsRepo().getByDocIds(nodeIds);

        // Apply RRF sorting using the extracted function
        documentNodes = calculateDocumentRRF(documentNodes, densityMap, docStatisticsMap)
            .sort((a, b) => b.rrfScore - a.rrfScore);

        // Apply limit and track omitted count
        const originalCount = documentNodes.length;
        if (originalCount > limit) {
            documentNodes = documentNodes.slice(0, limit);
            omittedDocNodeCnt = originalCount - limit;
        }
    }
    const tagNodes = typeNodeMap['tag'];
    const categoryNodes = typeNodeMap['category'];

    return {
        documentNodes,
        // for all nodes parse tags, categories to one line to save tokens. we do not need to list their details.
        tagDesc: tagNodes?.map(n => n.label).join(', '),
        categoryDesc: categoryNodes?.map(n => n.label).join(', '),
        omittedDocNodeCnt: omittedDocNodeCnt > 0 ? omittedDocNodeCnt : undefined,
    };
}

/**
 * Calculate RRF (Reciprocal Rank Fusion) scores for document nodes.
 * Combines multiple ranking criteria: connection density, update time, and document statistics.
 */
function calculateDocumentRRF(
    nodes: GraphNode[],
    densityMap: Map<string, number>,
    docStatisticsMap: Map<string, DocStatistics>
): (GraphNode & { rrfScore: number })[] {
    // Pre-compute rank maps for all sorting criteria
    // Each rank map: node.id -> rank (1-based, lower is better)
    const densityRankMap = new Map(
        [...nodes]
            .sort((a, b) => (densityMap.get(b.id) || 0) - (densityMap.get(a.id) || 0))
            .map((node, index) => [node.id, index + 1])
    );

    const updateTimeRankMap = new Map(
        [...nodes]
            .sort((a, b) => b.updated_at - a.updated_at)
            .map((node, index) => [node.id, index + 1])
    );

    const richnessRankMap = new Map(
        [...nodes]
            .sort((a, b) => {
                const aRich = docStatisticsMap.get(a.id)?.richness_score || 0;
                const bRich = docStatisticsMap.get(b.id)?.richness_score || 0;
                return bRich - aRich;
            })
            .map((node, index) => [node.id, index + 1])
    );

    const openCountRankMap = new Map(
        [...nodes]
            .sort((a, b) => {
                const aOpens = docStatisticsMap.get(a.id)?.open_count || 0;
                const bOpens = docStatisticsMap.get(b.id)?.open_count || 0;
                return bOpens - aOpens;
            })
            .map((node, index) => [node.id, index + 1])
    );

    const lastOpenRankMap = new Map(
        [...nodes]
            .sort((a, b) => {
                const aLast = docStatisticsMap.get(a.id)?.last_open_ts || 0;
                const bLast = docStatisticsMap.get(b.id)?.last_open_ts || 0;
                return bLast - aLast;
            })
            .map((node, index) => [node.id, index + 1])
    );

    // Similarity rank map for semantic neighbors
    const semanticNodes = nodes.filter(n => (n as any).foundBy === 'semantic_neighbors');
    const similarityRankMap = semanticNodes.length > 0 ? new Map(
        [...semanticNodes]
            .sort((a, b) => {
                const aSim = parseFloat((a as any).similarity) || 0;
                const bSim = parseFloat((b as any).similarity) || 0;
                return bSim - aSim;
            })
            .map((node, index) => [node.id, index + 1])
    ) : null;

    return nodes.map(node => {
        const stats = docStatisticsMap.get(node.id);
        const extendedNode = node as any; // Access extended properties

        // Get pre-computed ranks (1-based, convert to 0-based for RRF formula)
        const densityRank = (densityRankMap.get(node.id) || nodes.length) - 1;
        const updateTimeRank = (updateTimeRankMap.get(node.id) || nodes.length) - 1;
        const richnessRank = (richnessRankMap.get(node.id) || nodes.length) - 1;
        const openCountRank = (openCountRankMap.get(node.id) || nodes.length) - 1;
        const lastOpenRank = (lastOpenRankMap.get(node.id) || nodes.length) - 1;

        // Get actual values for conditional scoring
        const richnessScore = stats?.richness_score || 0;
        const openCount = stats?.open_count || 0;
        const lastOpenTs = stats?.last_open_ts || 0;

        // Calculate weighted RRF scores for each dimension
        const densityScore = GRAPH_RRF_WEIGHTS.density * (1 / (RRF_K + densityRank));
        const updateTimeScore = GRAPH_RRF_WEIGHTS.updateTime * (1 / (RRF_K + updateTimeRank));
        const richnessScore_rrf = richnessScore > 0 ? GRAPH_RRF_WEIGHTS.richness * (1 / (RRF_K + richnessRank)) : 0;
        const openCountScore = openCount > 0 ? GRAPH_RRF_WEIGHTS.openCount * (1 / (RRF_K + openCountRank)) : 0;
        const lastOpenScore = lastOpenTs > 0 ? GRAPH_RRF_WEIGHTS.lastOpen * (1 / (RRF_K + lastOpenRank)) : 0;

        // Calculate similarity score for semantic neighbors
        let similarityScore_rrf = 0;
        if (extendedNode.foundBy === 'semantic_neighbors' && extendedNode.similarity) {
            const similarityScore = parseFloat(extendedNode.similarity) || 0;
            if (similarityScore > 0) {
                const similarityRank = (similarityRankMap?.get(node.id) || semanticNodes.length) - 1;
                similarityScore_rrf = GRAPH_RRF_WEIGHTS.similarity * (1 / (RRF_K + similarityRank));
            }
        }

        // Calculate physical connection bonus
        const physicalBonus = extendedNode.foundBy === 'physical_neighbors' ? PHYSICAL_CONNECTION_BONUS : 0;

        // Combine all RRF components
        const rrfScore = densityScore + updateTimeScore + richnessScore_rrf + openCountScore + lastOpenScore + similarityScore_rrf + physicalBonus;

        return { ...node, rrfScore };
    });
}

/**
 * Get semantic search results with document IDs for RRF fusion.
 * Uses QueryService's vector search for semantic matching.
 *
 * @param semanticFilter The semantic filter configuration
 * @returns Array of semantic search results with document IDs and scores
 */
export async function getSemanticSearchResults(
    semanticFilter: { query: string; topK: number },
    scopeMode: SearchScopeMode = 'vault',
    scopeValue?: SearchScopeValue,
): Promise<Array<{ nodeId: string; score: number }>> {
    const { query, topK } = semanticFilter;

    try {
        // Get search client and use its query service for vector search
        const searchClient = AppContext.getInstance().searchClient;
        const vectorResults = await searchClient.vectorSearch({
            text: query,
            topK: Math.min(topK, 100),
            scopeMode, scopeValue,
        });

        // Extract paths from search results
        const paths = vectorResults.items.map(result => result.path);

        // Convert paths to document IDs using doc_meta table
        const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
        const pathToDocMap = await docMetaRepo.getByPaths(paths);
        const docIdMap = new Map<string, string>();
        for (const [path, docMeta] of pathToDocMap) {
            docIdMap.set(path, docMeta.id);
        }

        // Build semantic results with document IDs
        const semanticResults = vectorResults.items
            .map(result => {
                const docId = docIdMap.get(result.path);
                if (!docId) return null; // Skip if path not found in doc_meta

                return {
                    nodeId: docId,
                    score: result.finalScore || result.score || 0
                };
            })
            .filter((result): result is { nodeId: string; score: number } => result !== null);

        return semanticResults;

    } catch (error) {
        console.warn('[getSemanticSearchResults] Semantic search failed:', error);
        return []; // Return empty array on failure
    }
}

export type ItemFiledGetter<T> = (item: T) => {
    getPath?: () => string;
    getModified?: () => Date | undefined;
    getCreated?: () => Date | undefined;
    getTags?: () => string[];
    getCategory?: () => string | undefined;
    getResultRank?: () => number;
    getTotalLinksCount?: () => number;
    getInCominglinksCount?: () => number;
    getOutgoingCount?: () => number;
}

export async function getDefaultItemFiledGetter<T extends { id: string }>(nodeIds: string[], filters?: any, sorter?: string): Promise<ItemFiledGetter<T>> {
    const nodesMap = await sqliteStoreManager.getGraphNodeRepo().getByIds(nodeIds);
    const tagsAndCategoriesMap = filters?.tag_category_boolean_expression
        ? await sqliteStoreManager.getGraphStore().getTagsAndCategoriesByDocIds(nodeIds)
        : emptyMap<string, { tags: string[], categories: string[] }>();
    const edgeRepo = sqliteStoreManager.getGraphEdgeRepo();
    const { incoming: inCominglinksCountMap, outgoing: outGoinglinksCountMap, total: totalLinksCountMap } =
        (sorter === 'backlinks_count_asc' || sorter === 'backlinks_count_desc' || sorter === 'outlinks_count_asc' || sorter === 'outlinks_count_desc')
            ? await edgeRepo.countEdges(nodeIds)
            : { incoming: emptyMap<string, number>(), outgoing: emptyMap<string, number>(), total: emptyMap<string, number>() };
    return (node) => ({
        getPath: () => JSON.parse(nodesMap.get(node.id)?.attributes || '{}').path,
        getModified: () => new Date(nodesMap.get(node.id)?.updated_at || Date.now()),
        getCreated: () => new Date(nodesMap.get(node.id)?.created_at || Date.now()),
        getTags: () => tagsAndCategoriesMap.get(node.id)?.tags || [],
        getCategory: () => tagsAndCategoriesMap.get(node.id)?.categories?.[0] || undefined,
        // all same rank
        getResultRank: () => 0,
        getTotalLinksCount: () => totalLinksCountMap.get(node.id) || 0,
        getInCominglinksCount: () => inCominglinksCountMap.get(node.id) || 0,
        getOutgoingCount: () => outGoinglinksCountMap.get(node.id) || 0,
    });
}

// Helper function for applying filters and sorters consistently across all modes
export function applyFiltersAndSorters<T>(
    items: T[],
    filters?: any, // Simplified for now - in real implementation you'd type this properly
    sorter?: string,
    limit?: number,
    itemFiledGetter?: ItemFiledGetter<T>,
): T[] {
    let filteredItems = [...items];

    // Apply filters if provided
    if (filters) {
        filteredItems = filteredItems.filter(item => shouldIncludeItem(item, filters, itemFiledGetter));
    }

    // Apply sorting if provided
    if (sorter) {
        const compareFn = getCompareFn<T>(sorter, itemFiledGetter);
        filteredItems.sort(compareFn);
    }

    // Apply limit if provided
    if (limit && limit > 0) {
        filteredItems = filteredItems.slice(0, limit);
    }

    return filteredItems;
}

function shouldIncludeItem<T>(item: T, filters?: any, itemFiledGetter?: ItemFiledGetter<T>): boolean {
    const path = itemFiledGetter?.(item).getPath?.();

    // Type filter
    if (filters.type && filters.type !== 'all' && path !== undefined) {
        const itemType = getFileTypeByPath(path);

        if (filters.type === 'note' && itemType !== 'note') return false;
        if (filters.type === 'file' && itemType !== 'file') return false;
        if (filters.type === 'folder' && itemType !== 'folder') return false;
    }

    // Path filter (regex or prefix)
    if (filters.path && path !== undefined) {
        try {
            if (filters.path.startsWith('/')) {
                if (!path.startsWith(filters.path)) return false;
            } else {
                const pathPattern = getCachedRegex(filters.path.slice(1));
                if (!pathPattern.test(path)) return false;
            }
        } catch (e: any) {
            console.warn('[shouldIncludeItem] Invalid regex:', e);
            // Invalid regex, treat as literal string
            if (!path.startsWith(filters.path)) return false;
        }
    }

    const itemModified = itemFiledGetter?.(item).getModified?.();
    const itemCreated = itemFiledGetter?.(item).getCreated?.();

    // Time-based filters
    // timeToFilter: date. timeFilterTargetTime: str
    const { timeToFilter, timeFilterTarget } = filters.modified_within
        ? { timeToFilter: itemModified, timeFilterTarget: filters.modified_within }
        : filters.created_within
            ? { timeToFilter: itemCreated, timeFilterTarget: filters.created_within }
            : { timeToFilter: undefined, timeFilterTarget: undefined };
    if (timeToFilter && timeFilterTarget) {
        const timeToFilterTime = timeToFilter as Date;
        const timeFilterTargetTime = parseSemanticDateRange(timeFilterTarget);
        if (timeToFilterTime.getTime() < timeFilterTargetTime.getTime()) return false;
    }

    // tag, category boolean filter boolean_expression
    const itemTags = itemFiledGetter?.(item).getTags?.();
    const itemCategory = itemFiledGetter?.(item).getCategory?.();
    const tagCategoryBooleanExpression = getCachedBooleanExpression(filters?.tag_category_boolean_expression);
    if (tagCategoryBooleanExpression) {
        return tagCategoryBooleanExpression.rootEvaluate({ tags: itemTags, category: itemCategory });
    }

    return true;
}

type CompareFn<T> = (a: T, b: T) => number;
type ValToCompareGetter<T> = (item: T) => number;
function getCompareFn<T>(sorter: string, itemFiledGetter?: ItemFiledGetter<T>): CompareFn<T> {
    let valToCompareGetter: ValToCompareGetter<T> | null = null;

    switch (sorter) {
        case 'result_rank_asc':
        case 'result_rank_desc':
            valToCompareGetter = (item: T) => itemFiledGetter?.(item).getResultRank?.() || 0;
            break;
        case 'modified_asc':
        case 'modified_desc':
            valToCompareGetter = (item: T) => itemFiledGetter?.(item).getModified?.()?.getTime() || 0;
            break;
        case 'total_links_count_asc':
        case 'total_links_count_desc':
            valToCompareGetter = (item: T) => itemFiledGetter?.(item).getTotalLinksCount?.() || 0;
            break;
        case 'backlinks_count_asc':
        case 'backlinks_count_desc':
            valToCompareGetter = (item: T) => itemFiledGetter?.(item).getInCominglinksCount?.() || 0;
            break;
        case 'outlinks_count_asc':
        case 'outlinks_count_desc':
            valToCompareGetter = (item: T) => itemFiledGetter?.(item).getOutgoingCount?.() || 0;
            break;
        default:
            throw new Error(`Invalid sorter: ${sorter}`);
    }

    if (sorter.endsWith('_desc')) {
        return (a: T, b: T) => {
            const aVal = valToCompareGetter(a);
            const bVal = valToCompareGetter(b);
            return compareNumbers(bVal, aVal);
        };
    } else {
        return (a: T, b: T) => {
            const aVal = valToCompareGetter(a);
            const bVal = valToCompareGetter(b);
            return compareNumbers(aVal, bVal);
        };
    }
}

function compareNumbers(a: number, b: number): number {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
}