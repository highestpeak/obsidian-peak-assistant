import type { IndexTenant } from "@/core/storage/sqlite/types";
import { GraphNodeType } from '@/core/po';
import { GraphNode } from "@/core/storage/sqlite/repositories/MobiusNodeRepo";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { EMPTY_SET, emptyMap } from "@/core/utils/collection-utils";
import { DocStatistics } from "@/core/storage/sqlite/repositories/MobiusNodeRepo";
import { GRAPH_RRF_WEIGHTS, RRF_K, PHYSICAL_CONNECTION_BONUS } from "@/core/constant";
import { AppContext } from "@/app/context/AppContext";
import { SearchScopeMode, SearchScopeValue } from "@/service/search/types";
import { getFileTypeByPath } from "@/core/utils/obsidian-utils";
import { getCachedBooleanExpression, getCachedRegex } from "@/core/utils/format-utils";
import { parseSemanticDateRange } from "@/core/utils/date-utils";
import type { FunctionalTagEntry } from '@/core/document/helper/TagService';
import type { FunctionalTagId } from '@/core/schemas/agents/search-agent-schemas';

export type SemanticNeighborNode = GraphNode & { similarity: string }

/** Grep-like matcher: try regex, fallback to case-insensitive substring. */
export function matchVaultPathByGrepPattern(path: string, pattern: string): boolean {
	const p = String(path ?? '');
	const raw = String(pattern ?? '').trim();
	if (!raw) return true;
	try {
		const re = new RegExp(raw, 'i');
		return re.test(p);
	} catch {
		return p.toLowerCase().includes(raw.toLowerCase());
	}
}

export async function getSemanticNeighbors(
    docId: string,
    limit: number,
    filterDocIds: Set<string> = EMPTY_SET,
    tenant: IndexTenant = 'vault',
): Promise<SemanticNeighborNode[]> {
    const queryVector = await sqliteStoreManager.getEmbeddingRepo(tenant).getEmbeddingForSemanticSearch(docId);
    if (!queryVector) return [];

    const searchResults = await sqliteStoreManager.getEmbeddingRepo(tenant).searchSimilarAndGetId(
        queryVector, limit * 2, 'excludeDocIdsSet', { excludeDocIdsSet: filterDocIds },
    );
    const resultDocIds = Array.from(new Set(searchResults.map(r => r.doc_id)));
    const nodesMap = await sqliteStoreManager.getMobiusNodeRepo(tenant).getByIds(resultDocIds);

    return searchResults
        .map(r => {
            const node = nodesMap.get(r.doc_id);
            return node ? { ...node, similarity: `${(r.similarity * 100).toFixed(1)}%` } : null;
        })
        .filter((n): n is SemanticNeighborNode => n !== null && n.id !== docId && !filterDocIds.has(n.id))
        .slice(0, limit);
}

export async function distillClusterNodesData(nodes: GraphNode[], limit: number, ignoreDocumentNodes = false): Promise<{ documentNodes?: GraphNode[]; tagDesc?: string; categoryDesc?: string; omittedDocNodeCnt?: number }> {
    const byType = new Map<GraphNodeType, GraphNode[]>();
    for (const node of nodes) {
        const type = node.type as GraphNodeType;
        const list = byType.get(type);
        list ? list.push(node) : byType.set(type, [node]);
    }

    let documentNodes = byType.get(GraphNodeType.Document);
    let omittedDocNodeCnt = 0;
    if (!ignoreDocumentNodes && documentNodes?.length) {
        const nodeIds = documentNodes.map(n => n.id);
        const [densityMap, docStatisticsMap] = await Promise.all([
            sqliteStoreManager.getMobiusEdgeRepo().countEdges(nodeIds),
            sqliteStoreManager.getMobiusNodeRepo().getByDocIds(nodeIds),
        ]);
        documentNodes = calculateDocumentRRF(documentNodes, densityMap.total, docStatisticsMap)
            .sort((a, b) => b.rrfScore - a.rrfScore);
        if (documentNodes.length > limit) {
            omittedDocNodeCnt = documentNodes.length - limit;
            documentNodes = documentNodes.slice(0, limit);
        }
    }

    return {
        documentNodes,
        tagDesc: byType.get(GraphNodeType.TopicTag)?.map(n => n.label).join(', '),
        categoryDesc: byType.get(GraphNodeType.FunctionalTag)?.map(n => n.label).join(', '),
        omittedDocNodeCnt: omittedDocNodeCnt || undefined,
    };
}

/** RRF scoring for document nodes: density, recency, richness, open stats, semantic similarity. */
function calculateDocumentRRF(nodes: GraphNode[], densityMap: Map<string, number>, docStatisticsMap: Map<string, DocStatistics>): (GraphNode & { rrfScore: number })[] {
    const rankBy = (items: GraphNode[], fn: (n: GraphNode) => number) =>
        new Map([...items].sort((a, b) => fn(b) - fn(a)).map((n, i) => [n.id, i + 1]));
    const stat = (id: string) => docStatisticsMap.get(id);
    const densityRanks = rankBy(nodes, n => densityMap.get(n.id) || 0);
    const updateRanks = rankBy(nodes, n => n.updated_at);
    const richnessRanks = rankBy(nodes, n => stat(n.id)?.richness_score || 0);
    const openCountRanks = rankBy(nodes, n => stat(n.id)?.open_count || 0);
    const lastOpenRanks = rankBy(nodes, n => stat(n.id)?.last_open_ts || 0);
    const semNodes = nodes.filter(n => (n as any).foundBy === 'semantic_neighbors');
    const simRanks = semNodes.length ? rankBy(semNodes, n => parseFloat((n as any).similarity) || 0) : null;
    const term = (w: number, rm: Map<string, number>, id: string, fb: number, gate = 1) =>
        gate > 0 ? w * (1 / (RRF_K + (rm.get(id) || fb) - 1)) : 0;

    return nodes.map(node => {
        const ext = node as any, s = stat(node.id);
        return { ...node, rrfScore:
            term(GRAPH_RRF_WEIGHTS.density, densityRanks, node.id, nodes.length) +
            term(GRAPH_RRF_WEIGHTS.updateTime, updateRanks, node.id, nodes.length) +
            term(GRAPH_RRF_WEIGHTS.richness, richnessRanks, node.id, nodes.length, s?.richness_score || 0) +
            term(GRAPH_RRF_WEIGHTS.openCount, openCountRanks, node.id, nodes.length, s?.open_count || 0) +
            term(GRAPH_RRF_WEIGHTS.lastOpen, lastOpenRanks, node.id, nodes.length, s?.last_open_ts || 0) +
            (ext.foundBy === 'semantic_neighbors' && simRanks && parseFloat(ext.similarity) > 0
                ? term(GRAPH_RRF_WEIGHTS.similarity, simRanks, node.id, semNodes.length) : 0) +
            (ext.foundBy === 'physical_neighbors' ? PHYSICAL_CONNECTION_BONUS : 0),
        };
    });
}

export async function getSemanticSearchResults(
    semanticFilter?: { query: string; topK: number }, scopeMode: SearchScopeMode = 'vault', scopeValue?: SearchScopeValue,
): Promise<Array<{ nodeId: string; score: number }>> {
    if (!semanticFilter) return [];
    try {
        const { items } = await AppContext.getInstance().searchClient.vectorSearch({
            text: semanticFilter.query, topK: Math.min(semanticFilter.topK, 100), scopeMode, scopeValue,
        });
        const pathToDocMap = await sqliteStoreManager.getIndexedDocumentRepo().getByPaths(items.map(r => r.path));
        return items.map(r => { const id = pathToDocMap.get(r.path)?.id; return id ? { nodeId: id, score: r.finalScore || r.score || 0 } : null; })
            .filter((r): r is { nodeId: string; score: number } => r !== null);
    } catch (e) { console.warn('[getSemanticSearchResults]', e); return []; }
}

export type ItemFiledGetter<T> = (item: T) => {
    getPath?: () => string;
    getModified?: () => Date | undefined;
    getCreated?: () => Date | undefined;
    /** Topic + keyword tags combined (display / legacy). */
    getTags?: () => string[];
    getTopicTags?: () => string[];
    /** Functional tag ids for this doc (derived from entries). */
    getFunctionalTags?: () => string[];
    getFunctionalTagEntries?: () => FunctionalTagEntry[];
    getKeywordTags?: () => string[];
    getCategory?: () => string | undefined;
    getResultRank?: () => number;
    getTotalLinksCount?: () => number;
    getInCominglinksCount?: () => number;
    getOutgoingCount?: () => number;
}

export function getPathFromNode(node?: GraphNode | null): string {
    if (!node) return '';
    return JSON.parse(node.attributes || '{}').path;
}

export async function getDefaultItemFiledGetter<T extends { id: string }>(nodeIds: string[], filters?: any, sorter?: string): Promise<ItemFiledGetter<T>> {
    const nodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds(nodeIds);
    const tagsTripleMap = filters?.tag_category_boolean_expression
        ? (await sqliteStoreManager.getGraphRepo().getTagsByDocIds(nodeIds)).idMapToTags
        : emptyMap();
    const needLinks = /^(backlinks_count|outlinks_count)_(asc|desc)$/.test(sorter || '');
    const { incoming: inCominglinksCountMap, outgoing: outGoinglinksCountMap, total: totalLinksCountMap } =
        needLinks ? await sqliteStoreManager.getMobiusEdgeRepo().countEdges(nodeIds)
                  : { incoming: emptyMap(), outgoing: emptyMap(), total: emptyMap() };
    return (node) => ({
        getPath: () => getPathFromNode(nodesMap.get(node.id)),
        getModified: () => new Date(nodesMap.get(node.id)?.updated_at || Date.now()),
        getCreated: () => new Date(nodesMap.get(node.id)?.created_at || Date.now()),
        getTopicTags: () => tagsTripleMap.get(node.id)?.topicTags ?? [],
        getFunctionalTagEntries: () => tagsTripleMap.get(node.id)?.functionalTagEntries ?? [],
        getFunctionalTags: () =>
            tagsTripleMap.get(node.id)?.functionalTagEntries.map((e) => e.id) ?? [],
        getKeywordTags: () => tagsTripleMap.get(node.id)?.keywordTags ?? [],
        getTags: () => {
            const t = tagsTripleMap.get(node.id);
            return [
                ...(t?.topicTags ?? []),
                ...(t?.keywordTags ?? []),
                ...(t?.timeTags ?? []),
                ...(t?.geoTags ?? []),
                ...(t?.personTags ?? []),
            ];
        },
        getCategory: () => tagsTripleMap.get(node.id)?.functionalTagEntries?.[0]?.id,
        // all same rank
        getResultRank: () => 0,
        getTotalLinksCount: () => totalLinksCountMap.get(node.id) || 0,
        getInCominglinksCount: () => inCominglinksCountMap.get(node.id) || 0,
        getOutgoingCount: () => outGoinglinksCountMap.get(node.id) || 0,
    });
}

export function applyFiltersAndSorters<T>(
    items: T[], filters?: any, sorter?: string, limit?: number, itemFiledGetter?: ItemFiledGetter<T>,
): T[] {
    let result = filters ? items.filter(item => shouldIncludeItem(item, filters, itemFiledGetter)) : [...items];
    if (sorter) result.sort(getCompareFn<T>(sorter, itemFiledGetter));
    if (limit && limit > 0) result = result.slice(0, limit);
    return result;
}

function shouldIncludeItem<T>(item: T, filters?: any, itemFiledGetter?: ItemFiledGetter<T>): boolean {
    const path = itemFiledGetter?.(item).getPath?.();

    if (filters.type && filters.type !== 'all' && path !== undefined) {
        if (getFileTypeByPath(path) !== filters.type) return false;
    }

    if (filters.path && path !== undefined) {
        try {
            if (filters.path.startsWith('/')) {
                if (!path.startsWith(filters.path)) return false;
            } else {
                if (!getCachedRegex(filters.path.slice(1)).test(path)) return false;
            }
        } catch {
            if (!path.startsWith(filters.path)) return false;
        }
    }

    const g = itemFiledGetter?.(item);
    const timeToFilter = filters.modified_within ? g?.getModified?.() : filters.created_within ? g?.getCreated?.() : undefined;
    const timeFilterTarget = filters.modified_within || filters.created_within;
    if (timeToFilter && timeFilterTarget) {
        if ((timeToFilter as Date).getTime() < parseSemanticDateRange(timeFilterTarget).getTime()) return false;
    }

    const tagExpr = getCachedBooleanExpression(filters?.tag_category_boolean_expression);
    if (tagExpr) {
        const hasSplit = typeof g?.getTopicTags === 'function' || typeof g?.getKeywordTags === 'function' || typeof g?.getFunctionalTags === 'function';
        const topicTags = hasSplit ? (g?.getTopicTags?.() ?? []) : (g?.getTags?.() ?? []);
        const keywordTags = hasSplit ? (g?.getKeywordTags?.() ?? []) : [];
        const functionalTagEntries: FunctionalTagEntry[] =
            g?.getFunctionalTagEntries?.() ?? (g?.getFunctionalTags?.() ?? []).map((id) => ({ id: id as FunctionalTagId }));
        return tagExpr.rootEvaluate({
            topicTags, functionalTagEntries, keywordTags, tags: topicTags,
            category: functionalTagEntries[0]?.id ?? g?.getCategory?.(),
        });
    }

    return true;
}

const SORTER_VALUE_GETTERS: Record<string, <T>(g: ItemFiledGetter<T>) => (item: T) => number> = {
    result_rank:      g => item => g(item).getResultRank?.() || 0,
    modified:         g => item => g(item).getModified?.()?.getTime() || 0,
    created:          g => item => g(item).getCreated?.()?.getTime() || 0,
    total_links_count: g => item => g(item).getTotalLinksCount?.() || 0,
    backlinks_count:  g => item => g(item).getInCominglinksCount?.() || 0,
    outlinks_count:   g => item => g(item).getOutgoingCount?.() || 0,
};

function getCompareFn<T>(sorter: string, itemFiledGetter?: ItemFiledGetter<T>): (a: T, b: T) => number {
    const key = sorter.trim();
    const isDesc = key.endsWith('_desc');
    const base = key.replace(/_(asc|desc)$/, '');
    const factory = SORTER_VALUE_GETTERS[base];
    if (!factory || !itemFiledGetter) throw new Error(`Invalid sorter: ${sorter}`);
    const valueOf = factory(itemFiledGetter);
    return isDesc ? (a, b) => valueOf(b) - valueOf(a) : (a, b) => valueOf(a) - valueOf(b);
}