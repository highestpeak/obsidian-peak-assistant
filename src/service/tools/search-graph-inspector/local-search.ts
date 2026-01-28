import { AppContext } from "@/app/context/AppContext";
import { template as LOCAL_SEARCH_TEMPLATE } from "../templates/local-search";
import { buildResponse } from "../types";
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
    const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
    const pathToMetaMap = await docMetaRepo.getByPaths(paths);

    // Build tags and categories map if needed for boolean expression filter
    let tagsAndCategoriesMap = new Map<string, { tags: string[], categories: string[] }>();
    if (filters?.tag_category_boolean_expression) {
        const docIds = Array.from(pathToMetaMap.values()).map(meta => meta.id);
        const graphData = await sqliteStoreManager.getGraphStore().getTagsAndCategoriesByDocIds(docIds);
        // Map from docId to tags/categories, then we'll look up by path
        const docIdToData = graphData.idMapToTagsAndCategories;
        for (const [path, meta] of pathToMetaMap) {
            const data = docIdToData.get(meta.id);
            if (data) {
                tagsAndCategoriesMap.set(path, data);
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
        getTags: () => tagsAndCategoriesMap.get(item.path)?.tags || [],
        getCategory: () => tagsAndCategoriesMap.get(item.path)?.categories?.[0],
        getResultRank: () => item.finalScore || item.score || 0,
        getTotalLinksCount: () => 0, // Not available for search results
        getInCominglinksCount: () => 0,
        getOutgoingCount: () => 0,
    });
}

export async function localSearch(params: any) {
    const { query, searchMode, scopeMode, scopeValue, limit, response_format, filters, sorter } = params;
    const { items, duration } = await AppContext.getInstance().searchClient.search({
        text: query,
        searchMode: searchMode,
        scopeMode: scopeMode,
        scopeValue: scopeValue,
        topK: limit,
    });

    // Use path-aware field getter instead of graph node ID based getter
    const itemFieldGetter = await getSearchResultItemFieldGetter(items, filters, sorter);
    const filteredItems = applyFiltersAndSorters(items, filters, sorter, limit, itemFieldGetter);

    // Slim down results to reduce token output (remove content field)
    const slimResults = slimSearchResults(filteredItems);

    // Render template
    return buildResponse(response_format, LOCAL_SEARCH_TEMPLATE, {
        query: query,
        results: slimResults,
        searchTime: duration
    });
}