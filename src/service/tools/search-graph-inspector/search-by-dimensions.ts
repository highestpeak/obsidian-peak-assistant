import { z } from "zod/v3";
import { GraphNodeType } from '@/core/types/graph';
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticSearchResults } from "./common";
import { BooleanExpressionParser } from "@/core/utils/boolean-expression-parser";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GraphNode } from "@/core/storage/sqlite/repositories/MobiusNodeRepo";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { searchByDimensionsInputSchema } from "@/core/schemas/tools/searchGraphInspector";

type SearchByDimensionsParams = z.infer<typeof searchByDimensionsInputSchema> & { mode: string };

import type { SearchClient } from "@/service/search/SearchClient";

export async function searchByDimensions(params: SearchByDimensionsParams, searchClient: SearchClient, templateManager?: TemplateManager) {
    const { boolean_expression, semantic_filter, filters, sorter, limit, response_format } = params;
    const expr = typeof boolean_expression === 'string' ? boolean_expression.trim() : '';
    if (!expr) {
        return "No search dimensions specified. Please specify a boolean_expression like 'tag:javascript AND functional:programming'.";
    }

    let parser: BooleanExpressionParser;
    try {
        parser = new BooleanExpressionParser(expr);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Invalid boolean_expression: ${msg}. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Example: tag:javascript AND functional:programming. Attention. Only one word. do not use space. do not use special characters.`;
    }

    const { tags: expressionTags, functionals: expressionFunctionals, keywords: expressionKeywords } =
        parser.extractDimensions();
    if (expressionTags.length === 0 && expressionFunctionals.length === 0 && expressionKeywords.length === 0) {
        return 'Boolean expression must contain at least one tag:functional: or keyword: filter.';
    }

    const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes, diagnosis: matchingDocumentsDiagnosis } =
        await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);
    if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
        if (matchingDocumentsDiagnosis) {
            const diagData = {
                boolean_expression,
                matched: 0,
                diagnosis: matchingDocumentsDiagnosis,
            };
            return buildResponse(response_format, ToolTemplateId.SearchByDimensions, diagData, { templateManager });
        }
        return matchingDocumentsMessage || 'Error finding matching documents.';
    }

    type nodeWithSimilarityScore = GraphNode & { similarityScore: number };
    let docsAlignToSemantic: Map<string, GraphNode | nodeWithSimilarityScore> = matchingExpressionDocNodes;

    // do semantic filter to matchingExpressionDocNodes
    if (semantic_filter) {
        const semanticSearchResults = await getSemanticSearchResults(
            searchClient, semantic_filter, 'limitIdsSet',
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
    expressionTags: string[],
    expressionFunctionals: string[],
    expressionKeywords: string[],
): Promise<{
    success: boolean;
    message?: string;
    data?: Map<string, GraphNode>;
    diagnosis?: {
        unknown_tags: string[];
        unknown_functionals: string[];
        known_tags: string[];
        known_functionals: string[];
        suggestion: string;
    };
}> {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const tagLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.TopicTag, expressionTags)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
    const functionalLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.FunctionalTag, expressionFunctionals)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
    const keywordLookupMap = await mobiusNodeRepo
        .getByTypeAndLabels(GraphNodeType.KeywordTag, expressionKeywords)
        .then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));

    const unknownTags = expressionTags.filter(t => !tagLookupMap.has(t));
    const unknownFunctionals = expressionFunctionals.filter(f => !functionalLookupMap.has(f));
    const knownTags = expressionTags.filter(t => tagLookupMap.has(t));
    const knownFunctionals = expressionFunctionals.filter(f => functionalLookupMap.has(f));

    const allTargetNodeIds: string[] = [];
    tagLookupMap.forEach((id) => allTargetNodeIds.push(id));
    functionalLookupMap.forEach((id) => allTargetNodeIds.push(id));
    keywordLookupMap.forEach((id) => allTargetNodeIds.push(id));

    if (allTargetNodeIds.length === 0) {
        return {
            success: false,
            diagnosis: {
                unknown_tags: unknownTags,
                unknown_functionals: unknownFunctionals,
                known_tags: knownTags,
                known_functionals: knownFunctionals,
                suggestion: unknownTags.length + unknownFunctionals.length > 0
                    ? `Tags/functionals not found in vault: ${[...unknownTags, ...unknownFunctionals].join(', ')}. Check spelling or use local_search to discover valid tags.`
                    : 'All tags/functionals exist but no documents match the expression.',
            },
        };
    }

    // Use GROUP BY and HAVING to find documents connected to ALL specified targets
    const documentIds = await mobiusEdgeRepo.getSourceNodesConnectedToAllTargets(allTargetNodeIds);

    if (documentIds.length === 0) {
        return {
            success: false,
            diagnosis: {
                unknown_tags: unknownTags,
                unknown_functionals: unknownFunctionals,
                known_tags: knownTags,
                known_functionals: knownFunctionals,
                suggestion: 'Tags exist but AND intersection is empty. Try OR instead of AND, or check if tags are used on different documents.',
            },
        };
    }

    return {
        success: true,
        data: await mobiusNodeRepo.getByIds(documentIds)
    };
}
