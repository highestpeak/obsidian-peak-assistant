import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticSearchResults } from "./common";
import { BooleanExpressionParser } from "./boolean-expression-parser";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GraphNode } from "@/core/storage/sqlite/repositories/GraphNodeRepo";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
export async function searchByDimensions(params: any, templateManager?: TemplateManager) {
    const { boolean_expression, semantic_filter, filters, sorter, limit, response_format } = params;
    const expr = typeof boolean_expression === 'string' ? boolean_expression.trim() : '';
    if (!expr) {
        return "No search dimensions specified. Please specify a boolean_expression like 'tag:javascript AND category:programming'.";
    }

    let parser: BooleanExpressionParser;
    try {
        parser = new BooleanExpressionParser(expr);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Invalid boolean_expression: ${msg}. Use only tag:value, category:value, AND, OR, NOT, and parentheses. Example: tag:javascript AND category:programming. Attention. Only one word. do not use space. do not use special characters.`;
    }

    // Extract all tags and categories from the expression
    const { tags: expressionTags, categories: expressionCategories } = parser.extractDimensions();
    if (expressionTags.length === 0 && expressionCategories.length === 0) {
        return 'Boolean expression must contain at least one tag or category filter.';
    }

    const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes }
        = await findByExpressionWhere(parser, expressionTags, expressionCategories);
    if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
        return matchingDocumentsMessage || 'Error finding matching documents.';
    }

    type nodeWithSimilarityScore = GraphNode & { similarityScore: number };
    let docsAlignToSemantic: Map<string, GraphNode | nodeWithSimilarityScore> = matchingExpressionDocNodes;

    // do semantic filter to matchingExpressionDocNodes
    if (semantic_filter) {
        const semanticSearchResults = await getSemanticSearchResults(
            semantic_filter, 'limitIdsSet',
            { limitIdsSet: new Set(Array.from(matchingExpressionDocNodes.values()).map(document => document.id)) }
        );
        if (semanticSearchResults && semanticSearchResults.length > 0) {
            let semanticScoreMap = new Map(semanticSearchResults.map(res => [res.nodeId, res.score]));
            docsAlignToSemantic = new Map(
                Array.from(matchingExpressionDocNodes.entries())
                    .filter(([id]) => semanticScoreMap.has(id))
                    .map(([id, docNode]) => {
                        return [id, { ...docNode, score: semanticScoreMap.get(id) }];
                    })
            );
        }
    }

    // Apply additional filters and sorters
    const itemFiledGetter = await getDefaultItemFiledGetter<GraphNode | nodeWithSimilarityScore>(
        Array.from(docsAlignToSemantic.keys()),
        filters,
        sorter
    );
    const filtered = applyFiltersAndSorters(
        Array.from(docsAlignToSemantic.values()),
        filters,
        sorter,
        limit || 20,
        itemFiledGetter
    );

    const data = {
        boolean_expression,
        items: filtered,
        total_found: matchingExpressionDocNodes.size,
        semantic_filtered_cnt: matchingExpressionDocNodes.size - docsAlignToSemantic.size,
        all_filtered_cnt: matchingExpressionDocNodes.size - filtered.length,
    };
    return buildResponse(response_format, ToolTemplateId.SearchByDimensions, data, { templateManager });
}

async function findByExpressionWhere(
    parser: BooleanExpressionParser,
    expressionTags: string[],
    expressionCategories: string[]
): Promise<{ success: boolean; message?: string; data?: Map<string, GraphNode>; }> {
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

    // Find tag and category nodes that match the expression using SQL
    const tagLookupMap = await graphNodeRepo.getByTypeAndLabels('tag', expressionTags)
        // key: label(tag name), value: tag node id
        .then(nodes => new Map(
            nodes.map(node => [node.label, node.id])
        ));
    const categoryLookupMap = await graphNodeRepo.getByTypeAndLabels('category', expressionCategories)
        // key: label(category name), value: category node id
        .then(nodes => new Map(
            nodes.map(node => [node.label, node.id])
        ));

    // Collect all target node IDs (tags and categories)
    const allTargetNodeIds: string[] = [];

    // Add tag IDs
    tagLookupMap.forEach((tagId) => {
        allTargetNodeIds.push(tagId);
    });

    // Add category IDs
    categoryLookupMap.forEach((categoryId) => {
        allTargetNodeIds.push(categoryId);
    });

    if (allTargetNodeIds.length === 0) {
        return { success: false, message: 'No valid tags or categories found in expression.' };
    }

    // Use GROUP BY and HAVING to find documents connected to ALL specified targets
    const documentIds = await graphEdgeRepo.getSourceNodesConnectedToAllTargets(allTargetNodeIds);

    if (documentIds.length === 0) {
        return { success: false, message: 'No documents found matching all criteria.' };
    }

    return {
        success: true,
        data: await graphNodeRepo.getByIds(documentIds)
    };
}
