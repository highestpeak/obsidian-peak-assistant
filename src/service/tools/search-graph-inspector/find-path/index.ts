import { isIndexedNoteNodeType } from '@/core/types/graph';
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GRAPH_INSPECT_STEP_TIME_LIMIT, PATH_FINDING_CONSTANTS } from "@/core/constant";
import { buildResponse, withTimeoutMessage } from "../../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import type { SearchContext, ScoredPath, HubAnalysis } from './scorer';
import { scorePaths, deduplicatePaths, ensureStrategyDiversity, generatePathReasoning, formatPathsForOutput, buildAnalysisSection, analyzeHubs, analyzeContextIntersection, PATH_STRING_SEPARATOR } from './scorer';
import { reliableStrategy } from './reliable';
import { fastTrackStrategy, fallbackStrategy } from './fast-track';
import { brainstormStrategy } from './brainstorm';

export { PATH_STRING_SEPARATOR } from './scorer';

/**
 * Find diverse paths between two notes using multiple strategies.
 * Returns paths from all strategy types for comprehensive discovery.
 */
export async function findPath(params: any, templateManager?: TemplateManager) {
    const { start_note_path, end_note_path, strategy, max_paths, include_semantic_paths, response_format, filters } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

    // Validate and fetch start/end nodes
    const [startIndexedDoc, endIndexedDoc] = await Promise.all([
        sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path),
        sqliteStoreManager.getIndexedDocumentRepo().getByPath(end_note_path)
    ]);

    if (!startIndexedDoc || !endIndexedDoc) {
        return `# Path Finding Failed\n\n`
            + `${!startIndexedDoc ? `Start note "${start_note_path}" not found.` : ''}`
            + `${!endIndexedDoc ? `End note "${end_note_path}" not found.` : ''}`;
    }

    const [startNode, endNode] = await Promise.all([
        mobiusNodeRepo.getById(startIndexedDoc.id),
        mobiusNodeRepo.getById(endIndexedDoc.id)
    ]);

    if (!startNode || !endNode) {
        return `# Path Finding Failed\n\n`
            + `${!startNode ? `Start node "${start_note_path}" not found in graph.` : ''}`
            + `${!endNode ? `End node "${end_note_path}" not found in graph.` : ''}`;
    }

    // Pre-fetch semantic vectors for A* heuristic
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
    const [startVector, endVector] = await Promise.all([
        embeddingRepo.getEmbeddingForSemanticSearch(startNode.id),
        embeddingRepo.getEmbeddingForSemanticSearch(endNode.id)
    ]);

    const effectiveMaxPaths = max_paths ?? 3;

    // Build search context
    const context: SearchContext = {
        startId: startNode.id,
        endId: endNode.id,
        startVector,
        endVector,
        maxHops: PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
        filters,
        forbiddenEdges: new Set(),
        includeSemantic: include_semantic_paths ?? false,
        excludedDocIds: new Set<string>(),
    };

    // Execute strategy-based search with timeout
    const timeoutResult = await withTimeoutMessage(
        executeStrategySearch(context, strategy ?? 'reliable', effectiveMaxPaths),
        GRAPH_INSPECT_STEP_TIME_LIMIT,
        `Path finding from "${start_note_path}" to "${end_note_path}"`
    );

    if (!timeoutResult.success) {
        return `# Path Finding Timeout\n\n**${timeoutResult.message}**\n\n`
            + `Try these solutions:\n`
            + `- Reduce search complexity by using notes with fewer connections\n`
            + `- Disable semantic path finding if enabled\n`
            + `- Choose different start/end notes with clearer relationships\n`
            + `- The search may be exploring too many possible paths`;
    }

    const { scoredPaths, hubAnalysis, contextIntersection } = timeoutResult.data;

    // Set hub labels to paths for consistency
    if (hubAnalysis.length > 0) {
        const hubNodeIds = hubAnalysis.map(h => h.nodeId);
        const hubNodesMap = await mobiusNodeRepo.getByIds(hubNodeIds);

        for (const hub of hubAnalysis) {
            const node = hubNodesMap.get(hub.nodeId);
            if (node && isIndexedNoteNodeType(node.type)) {
                try {
                    hub.label = JSON.parse(node.attributes).path || hub.nodeId;
                } catch {
                    hub.label = hub.nodeId;
                }
            } else {
                hub.label = node ? (node.type + node.label) : hub.nodeId;
            }
        }
    }

    // Convert paths to user-friendly format
    const formattedPaths = await formatPathsForOutput(scoredPaths, mobiusNodeRepo);

    // Build template data
    const templatePaths = formattedPaths.slice(0, effectiveMaxPaths).map((pathData, index) => {
        const originalPath = scoredPaths[index];
        return {
            index: index + 1,
            steps: pathData.path.length - 1,
            pathString: pathData.path.map(node => `[[${node}]]`).join(PATH_STRING_SEPARATOR),
            connectionDetails: pathData.connectionDetails,
            strategy: pathData.strategy,
            insightLabel: pathData.insightLabel,
            score: pathData.score.toFixed(1),
            reasoning: originalPath?.reasoning || 'Selected for optimal quality metrics.',
        };
    });

    const analysisSection = buildAnalysisSection(hubAnalysis, contextIntersection);

    const data = {
        start_note_path,
        end_note_path,
        paths: templatePaths,
        analysis: analysisSection,
    };
    return buildResponse(response_format, ToolTemplateId.GraphPathFinding, data, { templateManager });
}

/**
 * Execute search based on selected strategy.
 */
async function executeStrategySearch(
    context: SearchContext,
    strategy: string,
    maxResults: number
): Promise<{
    scoredPaths: ScoredPath[];
    hubAnalysis: HubAnalysis[];
    contextIntersection: any;
}> {
    const allPaths: ScoredPath[] = [];

    switch (strategy) {
        case 'reliable':
            console.debug('[findPath] Strategy: Reliable');
            allPaths.push(...await reliableStrategy(context));
            break;
        case 'fastTrack':
            console.debug('[findPath] Strategy: FastTrack');
            if (context.startVector && context.endVector) {
                allPaths.push(...await fastTrackStrategy(context));
            }
            // Fallback to reliable if no semantic vectors or no results
            if (allPaths.length === 0) {
                allPaths.push(...await reliableStrategy(context));
            }
            break;
        case 'brainstorm':
            console.debug('[findPath] Strategy: Brainstorm');
            allPaths.push(...await brainstormStrategy(context));
            break;
        default:
            // Default to reliable
            allPaths.push(...await reliableStrategy(context));
            break;
    }

    // Fallback if nothing found
    if (allPaths.length === 0) {
        console.debug('[findPath] No paths found, attempting fallback strategy');
        allPaths.push(...await fallbackStrategy(context));
    }

    // Score, deduplicate, format
    const uniquePaths = deduplicatePaths(allPaths);
    const scoredPaths = await scorePaths(uniquePaths, allPaths);

    // Add reasoning to each path
    for (const path of scoredPaths) {
        path.reasoning = generatePathReasoning(path);
    }

    // Sort by total score
    scoredPaths.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Ensure diversity
    const diversePaths = ensureStrategyDiversity(scoredPaths, maxResults);

    // Post-processing
    const hubAnalysis = analyzeHubs(diversePaths);
    const contextIntersection = await analyzeContextIntersection(context.startId, context.endId);

    return { scoredPaths: diversePaths, hubAnalysis, contextIntersection };
}
