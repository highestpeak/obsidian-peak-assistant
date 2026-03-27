import { AppContext } from "@/app/context/AppContext";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import type { FunctionalTagEntry, TopicTagEntry } from '@/core/document/helper/TagService';
import { applyFiltersAndSorters } from "./common";
import { SearchResultItem, SearchSnippet } from "@/service/search/types";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
/**
 * Convert SearchSnippet to a text string with highlights marked using **bold** syntax.
 */
function convertHighlightToText(highlight: SearchSnippet | null | undefined): string {
    if (!highlight || !highlight.text) {
        return '';
    }

    if (!highlight.highlights || highlight.highlights.length === 0) {
        return highlight.text;
    }

    // Sort highlights by start position in descending order to avoid position shifting
    const sortedHighlights = [...highlight.highlights].sort((a, b) => b.start - a.start);

    let result = highlight.text;

    for (const span of sortedHighlights) {
        const start = span.start;
        const end = span.end;

        // Insert closing ** first, then opening ** to avoid position shifting
        result = result.slice(0, end) + '**' + result.slice(end);
        result = result.slice(0, start) + '**' + result.slice(start);
    }

    return result;
}

/**
 * Slim down search result items to reduce token output.
 * Removes content field which can be very large and cause context overflow.
 * Converts highlight snippets to highlighted text strings.
 */
function slimSearchResults(
    items: SearchResultItem[]
): (Omit<SearchResultItem, 'content' | 'highlight'> & { highlightedText?: string })[] {
    return items.map(item => {
        const {
            content,
            highlight,
            ...rest
        } = item;
        return {
            ...rest,
            highlightedText: convertHighlightToText(highlight)
        };
    });
}

/**
 * Build a field getter for SearchResultItem that works with path-based items.
 * Unlike getDefaultItemFiledGetter which expects graph node IDs, this works directly
 * with SearchResultItem which uses path as id.
 */
async function getSearchResultItemFieldGetter(items: SearchResultItem[], filters?: any, sorter?: string) {
    // Get doc metadata by paths for time-based filtering
    const paths = items.map(item => item.path);
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
    const pathToMetaMap = await indexedDocumentRepo.getByPaths(paths);

    // Build tags and categories map if needed for boolean expression filter
    let tagsTripleByPath = new Map<
        string,
        {
            topicTags: string[];
            topicTagEntries?: TopicTagEntry[];
            functionalTagEntries: FunctionalTagEntry[];
            keywordTags: string[];
            timeTags: string[];
            geoTags: string[];
            personTags: string[];
        }
    >();
    if (filters?.tag_category_boolean_expression) {
        const docIds = Array.from(pathToMetaMap.values()).map((meta) => meta.id);
        const graphData = await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds);
        const docIdToData = graphData.idMapToTags;
        for (const [path, meta] of pathToMetaMap) {
            const data = docIdToData.get(meta.id);
            if (data) {
                tagsTripleByPath.set(path, data);
            }
        }
    }

    return (item: SearchResultItem) => ({
        getPath: () => item.path,
        getModified: () => {
            const meta = pathToMetaMap.get(item.path);
            return meta?.mtime ? new Date(meta.mtime) : new Date(item.lastModified);
        },
        getCreated: () => {
            const meta = pathToMetaMap.get(item.path);
            const createTime = meta?.ctime ?? meta?.mtime;
            return createTime ? new Date(createTime) : undefined;
        },
        getTopicTags: () => tagsTripleByPath.get(item.path)?.topicTags ?? [],
        getFunctionalTagEntries: () => tagsTripleByPath.get(item.path)?.functionalTagEntries ?? [],
        getFunctionalTags: () =>
            tagsTripleByPath.get(item.path)?.functionalTagEntries.map((e) => e.id) ?? [],
        getKeywordTags: () => tagsTripleByPath.get(item.path)?.keywordTags ?? [],
        getTags: () => {
            const t = tagsTripleByPath.get(item.path);
            return [
                ...(t?.topicTags ?? []),
                ...(t?.keywordTags ?? []),
                ...(t?.timeTags ?? []),
                ...(t?.geoTags ?? []),
                ...(t?.personTags ?? []),
            ];
        },
        getCategory: () => tagsTripleByPath.get(item.path)?.functionalTagEntries?.[0]?.id,
        getResultRank: () => item.finalScore || item.score || 0,
        getTotalLinksCount: () => 0, // Not available for search results
        getInCominglinksCount: () => 0,
        getOutgoingCount: () => 0,
    });
}

export async function localSearch(params: any, templateManager?: TemplateManager) {
    const { query, searchMode, scopeMode, scopeValue, limit, response_format, filters, sorter } = params;
    const { items: rawItems, duration } = await AppContext.getInstance().searchClient.search({
        text: query,
        searchMode: searchMode,
        scopeMode: scopeMode,
        scopeValue: scopeValue,
        topK: limit,
        indexTenant: 'vault',
    });

    // Use path-aware field getter instead of graph node ID based getter
    const itemFieldGetter = await getSearchResultItemFieldGetter(rawItems, filters, sorter);
    const filteredItems = applyFiltersAndSorters(rawItems, filters, sorter, limit, itemFieldGetter);

    const slimResults = slimSearchResults(filteredItems);

    const data = {
        query: query,
        results: slimResults,
        searchTime: duration
    };

    return buildResponse(response_format, ToolTemplateId.LocalSearch, data, { templateManager });
}