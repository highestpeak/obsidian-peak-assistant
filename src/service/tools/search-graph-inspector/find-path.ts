import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GRAPH_INSPECT_STEP_TIME_LIMIT, PATH_FINDING_CONSTANTS, SLICE_CAPS } from "@/core/constant";
import { buildResponse, withTimeoutMessage } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import type { IndexedDocumentRecord } from "@/core/storage/sqlite/ddl";

/** Single indexed document by node id (batch API). */
async function getIndexedDocumentById(id: string): Promise<IndexedDocumentRecord | null> {
    const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds([id]);
    return results.length > 0 ? results[0] : null;
}

/** Multiple indexed documents by node id as a Map. */
async function getIndexedDocumentsByIds(ids: string[]): Promise<Map<string, IndexedDocumentRecord>> {
    const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds(ids);
    const map = new Map<string, IndexedDocumentRecord>();
    for (const meta of results) {
        map.set(meta.id, meta);
    }
    return map;
}

// Multi-Strategy Path Finding: reliable (BFS), fastTrack (A*), brainstorm (cross-domain), temporal.
// Paths scored on: physicalRatio, freshness, domainJumps, uniqueness.

/** Path segment with full connection metadata */
export interface PathSegment {
    nodeId: string;
    type: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
    timestamp?: number;  // For temporal strategy
    folderPath?: string; // For domain jump analysis
}

/** Neighbor node for graph traversal */
export interface NeighborNode {
    id: string;
    foundBy: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
    timestamp?: number;
}

/** Search strategy identifier */
type StrategyType = 'reliable' | 'fastTrack' | 'brainstorm' | 'temporal';

/** Path with strategy metadata and quality score */
interface ScoredPath {
    segments: PathSegment[];
    strategy: StrategyType;
    score: PathScore;
    insightLabel: string;
    reasoning: string; // Why this path was chosen
}

/** Multi-dimensional path quality score */
interface PathScore {
    totalScore: number;
    physicalRatio: number;      // 0-1, proportion of physical connections
    avgSimilarity: number;      // 0-1, average semantic similarity
    uniqueness: number;         // 0-1, path uniqueness
    freshness: number;          // 0-1, node freshness (last access)
    domainJumps: number;        // Count of folder/tag transitions
    length: number;             // Path length (number of steps)
}

/** A* node for priority queue */
interface AStarNode {
    nodeId: string;
    gCost: number;              // Cost from start
    hCost: number;              // Heuristic cost to end
    fCost: number;              // Total cost (g + h)
    parent: AStarNode | null;
    connectionType: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

/** Search context for all strategies */
interface SearchContext {
    startId: string;
    endId: string;
    startVector: number[] | null;
    endVector: number[] | null;
    maxHops: number;
    filters?: any;
    forbiddenEdges: Set<string>;
    includeSemantic: boolean;
    /** Doc IDs to exclude from path expansion (e.g. AI analysis auto-save folder). */
    excludedDocIds: Set<string>;
}

/** Hub analysis result */
interface HubAnalysis {
    nodeId: string;
    label: string;
    occurrenceCount: number;
    betweennessCentrality: number;
}

/** Enhanced context intersection analysis result */
interface ContextIntersectionAnalysis {
    // Physical path analysis (legacy, kept for compatibility)
    physicalAncestor: {
        ancestorPath: string;
        startPath: string;
        endPath: string;
        depth: number;
    };

    // Tag-based semantic intersection
    commonTags: string[];

    // Graph-based structural intersection (common parents)
    commonParents: Array<{
        nodeId: string;
        label: string;
        type: string;
        connectionCount: number; // how many paths connect through this node
    }>;

    // Overall assessment
    isDistant: boolean; // true if physically distant but semantically connected
    primaryContext?: string; // main shared context (tag or parent node)
}

// --- Constants ---

/** Edge weight configuration */
const EDGE_WEIGHTS = {
    physical: 1.0,
    semantic: 1.5,
    consecutiveSemantic: 2.0,  // Reduced from 3.0 to allow more semantic paths
} as const;

/** Semantic similarity threshold */
const SIMILARITY_THRESHOLD = 0.5;

/** Score weights for path quality */
const SCORE_WEIGHTS = {
    physicalRatio: 0.35,
    freshness: 0.25,
    domainJumps: 0.20,
    uniqueness: 0.15,
    lengthPenalty: 0.05,
} as const;

export const PATH_STRING_SEPARATOR = ' -> ';

const STRATEGY_NAMES: Record<StrategyType, string> = {
    reliable: '🔗 Reliable', fastTrack: '🚀 Fast Track',
    brainstorm: '💡 Brainstorm', temporal: '⏳ Temporal',
};

/** Resolve a graph node to a display label. */
function getNodeLabel(node: { type: string; label: string; attributes: string } | undefined, fallback: string): string {
    if (!node) return fallback;
    if (isIndexedNoteNodeType(node.type)) {
        try { return JSON.parse(node.attributes).path || fallback; } catch { return fallback; }
    }
    return node.type + node.label;
}

// --- Main Entry Point ---

/** Find diverse paths between two notes using multiple strategies. */
export async function findPath(params: any, templateManager?: TemplateManager) {
    const { start_note_path, end_note_path, limit, include_semantic_paths, response_format, filters } = params;
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

    // Execute multi-strategy search with timeout
    const timeoutResult = await withTimeoutMessage(
        executeMultiStrategySearch(context, limit ?? 5),
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
            hub.label = getNodeLabel(hubNodesMap.get(hub.nodeId), hub.nodeId);
        }
    }

    // Convert paths to user-friendly format
    const formattedPaths = await formatPathsForOutput(scoredPaths, mobiusNodeRepo);

    // Build template data
    const templatePaths = formattedPaths.slice(0, limit).map((pathData, index) => {
        // Get reasoning from the original scored path
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

// --- Multi-Strategy Search Orchestrator ---

/** Execute all search strategies and merge results. */
async function executeMultiStrategySearch(
    context: SearchContext,
    maxResults: number
): Promise<{
    scoredPaths: ScoredPath[];
    hubAnalysis: HubAnalysis[];
    contextIntersection: ContextIntersectionAnalysis | null;
}> {
    const allPaths: ScoredPath[] = [];

    // Phase 1: Reliable Strategy - Pure physical paths (guaranteed first)
    const reliablePaths = await reliableStrategy(context);
    allPaths.push(...reliablePaths);

    // Phase 2: FastTrack Strategy - A* with semantic guidance (if semantic enabled)
    if (context.includeSemantic && context.startVector && context.endVector) {
        const fastTrackPaths = await fastTrackStrategy(context);
        allPaths.push(...fastTrackPaths);
    }

    // Phase 3: Brainstorm Strategy - Cross-domain discovery (if semantic enabled)
    if (context.includeSemantic) {
        const brainstormPaths = await brainstormStrategy(context);
        allPaths.push(...brainstormPaths);
    }

    // Phase 4: Temporal Strategy - Time-ordered paths
    const temporalPaths = await temporalStrategy(context);
    allPaths.push(...temporalPaths);

    // Fallback Strategy: If no paths found, try a more permissive search
    if (allPaths.length === 0) {
        const fallbackPaths = await fallbackStrategy(context);
        allPaths.push(...fallbackPaths);
    }

    // Deduplicate and score paths
    const uniquePaths = deduplicatePaths(allPaths);
    const scoredPaths = await scorePaths(uniquePaths, allPaths);

    // Add reasoning to each path
    for (const path of scoredPaths) {
        path.reasoning = generatePathReasoning(path);
    }

    // Sort by total score
    scoredPaths.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Ensure diversity: at least one from each strategy type (if available)
    const diversePaths = ensureStrategyDiversity(scoredPaths, maxResults);

    // Post-processing: Hub and context intersection analysis
    const hubAnalysis = analyzeHubs(diversePaths);
    const contextIntersection = await analyzeContextIntersection(context.startId, context.endId);

    return { scoredPaths: diversePaths, hubAnalysis, contextIntersection };
}

// --- Strategy 1: Reliable - Pure Physical BFS ---

/** Find shortest physical-only paths using bidirectional BFS. */
async function reliableStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const forbiddenEdges = new Set<string>();

    // Find multiple diverse physical paths
    for (let i = 0; i < 3; i++) {
        const path = await bidirectionalBFS(
            context.startId,
            context.endId,
            forbiddenEdges,
            false,  // Physical only
            context.maxHops,
            context.filters,
            context.excludedDocIds
        );

        if (!path) break;

        paths.push({
            segments: path,
            strategy: 'reliable',
            score: createEmptyScore(),
            insightLabel: 'This is the most direct logical chain in your knowledge base.',
            reasoning: 'Pure physical connections provide the most reliable and trustworthy path.',
        });

        // Block key edge for diversity
        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) {
            forbiddenEdges.add(edgeToBlock);
        } else {
            break;
        }
    }

    return paths;
}

// --- Strategy 2: FastTrack - A* with Semantic Gravity Field ---

/** A* search with semantic gravity field. */
async function fastTrackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    if (!context.startVector || !context.endVector) {
        return [];
    }

    const paths: ScoredPath[] = [];

    // Find path using A* with semantic heuristic
    const path = await aStarSearch(context);

    if (path) {
        paths.push({
            segments: path,
            strategy: 'fastTrack',
            score: createEmptyScore(),
            insightLabel: 'Through semantic bridging, these two ideas share a common conceptual core.',
            reasoning: 'A* algorithm found optimal balance between path length and semantic relevance.',
        });
    }

    return paths;
}

/** A* search implementation. */
async function aStarSearch(context: SearchContext): Promise<PathSegment[] | null> {
    const { startId, endId, startVector, endVector, maxHops, filters } = context;

    if (!startVector || !endVector) return null;

    // Priority queue (min-heap based on fCost)
    const openSet: AStarNode[] = [];
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, AStarNode>();

    // Initialize start node
    const startNode: AStarNode = {
        nodeId: startId,
        gCost: 0,
        hCost: await calculateHeuristic(startId, endVector, 0, maxHops),
        fCost: 0,
        parent: null,
        connectionType: 'physical_neighbors',
    };
    startNode.fCost = startNode.gCost + startNode.hCost;

    openSet.push(startNode);
    nodeMap.set(startId, startNode);

    let step = 0;
    let consecutiveSemanticCount = 0;

    while (openSet.length > 0 && step < maxHops * 50) {
        step++;

        // Get node with lowest fCost
        openSet.sort((a, b) => a.fCost - b.fCost);
        const current = openSet.shift()!;

        // Goal reached
        if (current.nodeId === endId) {
            return reconstructAStarPath(current);
        }

        closedSet.add(current.nodeId);

        // Track consecutive semantic edges
        if (current.connectionType === 'semantic_neighbors') {
            consecutiveSemanticCount++;
        } else {
            consecutiveSemanticCount = 0;
        }

        const neighbors = await getNeighbors(
            current.nodeId, 20,
            consecutiveSemanticCount >= 4 ? 'none' : 'sparse-only',
            context.excludedDocIds
        );

        // Apply filters if provided
        let filteredNeighbors = neighbors;
        if (filters) {
            const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(
                neighbors.map(n => n.id),
                filters
            );
            filteredNeighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
        }

        for (const neighbor of filteredNeighbors) {
            if (closedSet.has(neighbor.id)) continue;

            // Calculate edge weight
            const edgeWeight = neighbor.foundBy === 'physical_neighbors'
                ? EDGE_WEIGHTS.physical
                : (consecutiveSemanticCount >= 1 ? EDGE_WEIGHTS.consecutiveSemantic : EDGE_WEIGHTS.semantic);

            // Skip low-similarity semantic edges
            if (neighbor.foundBy === 'semantic_neighbors' && neighbor.similarity) {
                const sim = parseFloat(neighbor.similarity) / 100;
                if (sim < SIMILARITY_THRESHOLD) continue;
            }

            const tentativeGCost = current.gCost + edgeWeight;

            let existingNode = nodeMap.get(neighbor.id);

            if (!existingNode) {
                // Calculate heuristic with dynamic gravity field
                const progress = step / (maxHops * 2);
                const hCost = await calculateHeuristic(neighbor.id, endVector, progress, maxHops);

                const newNode: AStarNode = {
                    nodeId: neighbor.id,
                    gCost: tentativeGCost,
                    hCost,
                    fCost: tentativeGCost + hCost,
                    parent: current,
                    connectionType: neighbor.foundBy,
                    similarity: neighbor.similarity,
                };

                openSet.push(newNode);
                nodeMap.set(neighbor.id, newNode);
            } else if (tentativeGCost < existingNode.gCost) {
                // Found better path
                existingNode.gCost = tentativeGCost;
                existingNode.fCost = tentativeGCost + existingNode.hCost;
                existingNode.parent = current;
                existingNode.connectionType = neighbor.foundBy;
                existingNode.similarity = neighbor.similarity;
            }
        }
    }

    return null;
}

/** A* heuristic: cosine distance to end vector (admissible). */
async function calculateHeuristic(
    nodeId: string, endVector: number[], _progress: number, _maxHops: number
): Promise<number> {
    const nodeVector = await sqliteStoreManager.getEmbeddingRepo().getEmbeddingForSemanticSearch(nodeId);
    if (!nodeVector) return 2.0;
    return Math.max(0, 1 - cosineSimilarity(nodeVector, endVector));
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Reconstruct path from A* node chain. */
function reconstructAStarPath(endNode: AStarNode): PathSegment[] {
    const path: PathSegment[] = [];
    let current: AStarNode | null = endNode;

    while (current) {
        path.unshift({
            nodeId: current.nodeId,
            type: current.connectionType,
            similarity: current.similarity,
        });
        current = current.parent;
    }

    return path;
}

// --- Strategy Fallback: Permissive Search ---

/** Fallback: permissive search with doubled hops and all edge types. */
async function fallbackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const path = await bidirectionalBFS(
        context.startId, context.endId,
        new Set(), true, Math.max(context.maxHops * 2, 8),
        context.filters, context.excludedDocIds
    );

    if (path) {
        paths.push({
            segments: path,
            strategy: 'fastTrack', // Label as fastTrack for UI consistency
            score: createEmptyScore(),
            insightLabel: 'Found through extended search - this connection exists but may be indirect.',
            reasoning: 'Fallback search found this path after other strategies failed. Consider it as a distant connection.',
        });
    }

    return paths;
}

// --- Strategy 3: Brainstorm - Cross-Domain Bridge Discovery ---

/** Find cross-domain bridge paths. */
async function brainstormStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const brainstormForbiddenEdges = new Set<string>();

    // Get folder paths for domain analysis
    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(context.startId),
        getIndexedDocumentById(context.endId)
    ]);

    if (!startMeta || !endMeta) return paths;

    const startFolder = getParentFolder(startMeta.path);
    const endFolder = getParentFolder(endMeta.path);

    // Find multiple diverse cross-domain paths
    for (let i = 0; i < 3; i++) {
        // If same folder, force cross-domain exploration
        const forceCrossDomain = startFolder === endFolder || i === 0; // Always force cross-domain on first attempt

        const path = await bidirectionalBFS(
            context.startId,
            context.endId,
            brainstormForbiddenEdges,
            context.includeSemantic,
            context.maxHops,
            context.filters,
            context.excludedDocIds,
            forceCrossDomain ? endFolder : null
        );

        if (!path) break;

        // Check if path actually crosses domains or has interesting semantic jumps
        const nodeIds = path.map(s => s.nodeId);
        const metasMap = await getIndexedDocumentsByIds(nodeIds);
        const domains = new Set<string>();
        let semanticConnections = 0;
        let totalSimilarity = 0;

        for (const segment of path) {
            const meta = metasMap.get(segment.nodeId);
            if (meta) {
                domains.add(getParentFolder(meta.path));
            }
            if (segment.type === 'semantic_neighbors') {
                semanticConnections++;
                if (segment.similarity) {
                    const sim = parseFloat(segment.similarity) / 100;
                    totalSimilarity += sim;
                }
            }
        }

        // Accept path if it crosses domains OR has high-quality semantic connections
        const avgSimilarity = semanticConnections > 0 ? totalSimilarity / semanticConnections : 0;
        const shouldAccept = domains.size > 1 || (semanticConnections > 0 && avgSimilarity > 0.7);

        if (shouldAccept) {
            const insightMessage = domains.size > 1
                ? `Crossing ${domains.size} different domains, this connection may spark unexpected inspiration.`
                : semanticConnections > 0
                    ? `Through creative semantic connections (avg ${Math.round(avgSimilarity * 100)}% similarity), these ideas form an unexpected bridge.`
                    : `This path reveals hidden connections through creative exploration.`;

            paths.push({
                segments: path,
                strategy: 'brainstorm',
                score: createEmptyScore(),
                insightLabel: insightMessage,
                reasoning: 'Selected for cross-domain exploration and creative connection discovery.',
            });
        }

        // Block key edge for diversity (whether accepted or not)
        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) {
            brainstormForbiddenEdges.add(edgeToBlock);
        } else {
            break;
        }
    }

    return paths;
}

/** Get parent folder from file path. */
function getParentFolder(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash > 0 ? path.substring(0, lastSlash) : '/';
}

// --- Strategy 4: Temporal - Time-Ordered Knowledge Evolution ---

/** Find paths following chronological order. */
async function temporalStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];

    // Get timestamps for start and end nodes
    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(context.startId),
        getIndexedDocumentById(context.endId)
    ]);

    if (!startMeta || !endMeta) return paths;

    const startTime = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTime = endMeta.mtime ?? endMeta.ctime ?? Date.now();

    const isForward = startTime <= endTime;
    const path = await temporalBFS(
        context.startId, context.endId,
        Math.max(context.maxHops * 1.5, context.maxHops + 2),
        isForward,
        context.filters,
        context.excludedDocIds
    );

    if (path && path.length > 0) {
        const startDate = new Date(startTime).toLocaleDateString();
        const endDate = new Date(endTime).toLocaleDateString();
        paths.push({
            segments: path,
            strategy: 'temporal',
            score: createEmptyScore(),
            insightLabel: `This is your thought evolution from ${startDate} to ${endDate}.`,
            reasoning: 'Temporal ordering reveals your knowledge development trajectory.',
        });
    }

    return paths;
}

/** BFS with temporal ordering constraint and heuristic pruning. */
async function temporalBFS(
    startId: string,
    endId: string,
    maxHops: number,
    isForward: boolean,
    filters?: any,
    excludedDocIds?: Set<string>
): Promise<PathSegment[] | null> {
    const visited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; timestamp: number }>();

    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(startId), getIndexedDocumentById(endId)
    ]);
    if (!startMeta || !endMeta) return null;

    const startTimestamp = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTimestamp = endMeta.mtime ?? endMeta.ctime ?? Date.now();
    visited.set(startId, { parentId: null, type: 'physical_neighbors', timestamp: startTimestamp });

    let queue: { id: string; timestamp: number; heuristicScore: number }[] = [
        { id: startId, timestamp: startTimestamp, heuristicScore: 0 }
    ];
    let hops = 0;
    const TIME_WINDOW_HOURS = 24 * 7;
    const startTime = Date.now();
    const TIMEOUT_MS = 3000;

    while (queue.length > 0 && hops < maxHops) {
        if (Date.now() - startTime > TIMEOUT_MS) break;

        queue.sort((a, b) => a.heuristicScore - b.heuristicScore);
        const nextQueue: { id: string; timestamp: number; heuristicScore: number }[] = [];
        const currentLevelNodes = queue.slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);
        queue = queue.slice(5);

        for (const current of currentLevelNodes) {
            let neighbors = await getNeighbors(current.id, 10, 'sparse-only', excludedDocIds);
            let filteredNeighbors = neighbors;
            if (filters) {
                const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(
                    neighbors.map(n => n.id),
                    filters
                );
                filteredNeighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
            }

            const neighborMetasMap = await getIndexedDocumentsByIds(filteredNeighbors.map(n => n.id));

            const scoredNeighbors = filteredNeighbors
                .filter(neighbor => {
                    if (visited.has(neighbor.id)) return false;
                    const meta = neighborMetasMap.get(neighbor.id);
                    if (!meta) return false;
                    const timeDiffHours = ((meta.mtime ?? meta.ctime ?? Date.now()) - current.timestamp) / (1000 * 60 * 60);
                    return isForward ? timeDiffHours >= -TIME_WINDOW_HOURS : timeDiffHours <= TIME_WINDOW_HOURS;
                })
                .map(neighbor => {
                    const meta = neighborMetasMap.get(neighbor.id)!;
                    const neighborTime = meta.mtime ?? meta.ctime ?? Date.now();
                    return { neighbor, neighborTime, heuristicScore: Math.abs(neighborTime - endTimestamp) / (1000 * 60 * 60) };
                })
                .sort((a, b) => a.heuristicScore - b.heuristicScore)
                .slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);

            for (const { neighbor, neighborTime, heuristicScore } of scoredNeighbors) {
                visited.set(neighbor.id, {
                    parentId: current.id,
                    type: neighbor.foundBy,
                    timestamp: neighborTime,
                });

                if (neighbor.id === endId) return reconstructTemporalPath(endId, visited);

                nextQueue.push({ id: neighbor.id, timestamp: neighborTime, heuristicScore });
            }
        }

        queue = nextQueue;
        hops++;
    }

    return null;
}

/** Reconstruct path from temporal search. */
function reconstructTemporalPath(
    endId: string,
    visited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; timestamp: number }>
): PathSegment[] {
    const path: PathSegment[] = [];
    let currentId: string | null = endId;

    while (currentId) {
        const info = visited.get(currentId);
        if (!info) break;

        path.unshift({
            nodeId: currentId,
            type: info.type,
            timestamp: info.timestamp,
        });

        currentId = info.parentId;
    }

    return path;
}

// --- Core BFS Implementation ---

/** Bidirectional BFS for path finding. Supports optional domain-crossing preference via avoidFolder. */
async function bidirectionalBFS(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    maxHops: number,
    filters?: any,
    excludedDocIds?: Set<string>,
    avoidFolder?: string | null
): Promise<PathSegment[] | null> {
    const startVisited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>();
    const endVisited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>();

    startVisited.set(startId, { parentId: null, type: 'physical_neighbors' });
    endVisited.set(endId, { parentId: null, type: 'physical_neighbors' });

    let startQueue = [startId];
    let endQueue = [endId];
    let hops = 0;

    while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
        const startResult = await expandFrontier(
            startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds
        );
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        const endResult = await expandFrontier(
            endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds
        );
        if (endResult.found && endResult.intersectId) {
            return reconstructPath(endResult.intersectId, startVisited, endVisited);
        }

        hops++;
    }

    return null;
}

/** Expand search frontier for BFS, with optional domain-crossing preference. */
async function expandFrontier(
    queue: string[],
    myVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    otherVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    filters?: any,
    avoidFolder?: string | null,
    excludedDocIds?: Set<string>
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = await getNeighbors(currentId, 20, includeSemantic ? 'always' : 'none', excludedDocIds);

        // Sort neighbors to prefer those in different folders (domain-crossing preference)
        if (avoidFolder) {
            const metasMap = await getIndexedDocumentsByIds(neighbors.map(n => n.id));
            const neighborsWithMeta = neighbors.map(n => {
                const meta = metasMap.get(n.id);
                return { ...n, folder: meta ? getParentFolder(meta.path) : '' };
            });
            neighborsWithMeta.sort((a, b) =>
                (a.folder === avoidFolder ? 1 : 0) - (b.folder === avoidFolder ? 1 : 0)
            );
            neighbors = neighborsWithMeta;
        }

        if (filters) {
            const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(
                neighbors.map(n => n.id),
                filters
            );
            neighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
        }

        for (const neighbor of neighbors) {
            const edgeKey = `${currentId}->${neighbor.id}`;
            if (forbiddenEdges.has(edgeKey)) continue;

            if (!myVisited.has(neighbor.id)) {
                myVisited.set(neighbor.id, {
                    parentId: currentId,
                    type: neighbor.foundBy,
                    similarity: neighbor.similarity,
                });
                nextQueue.push(neighbor.id);

                if (otherVisited.has(neighbor.id)) {
                    return { found: true, intersectId: neighbor.id };
                }
            }
        }
    }

    queue.length = 0;
    queue.push(...nextQueue);
    return { found: false };
}

// --- Neighbor Retrieval ---

/** Get physical neighbors, optionally excluding doc IDs. */
async function getPhysicalNeighbors(nodeId: string, limit: number = 20, excludedDocIds?: Set<string>): Promise<NeighborNode[]> {
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const neighbors: NeighborNode[] = [];

    const physicalEdges = await mobiusEdgeRepo.getAllEdgesForNode(nodeId, limit);
    const seenIds = new Set<string>();

    for (const edge of physicalEdges) {
        const neighborId = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
        if (excludedDocIds?.has(neighborId)) continue;
        if (!seenIds.has(neighborId)) {
            seenIds.add(neighborId);
            neighbors.push({ id: neighborId, foundBy: 'physical_neighbors' });
        }
    }

    return neighbors;
}

/**
 * Get neighbors with configurable semantic inclusion.
 * @param semanticMode - 'none' | 'always' | 'sparse-only' (only when physical < 3)
 */
async function getNeighbors(
    nodeId: string,
    limit: number = 20,
    semanticMode: 'none' | 'always' | 'sparse-only' = 'none',
    excludedDocIds?: Set<string>
): Promise<NeighborNode[]> {
    const physicalNeighbors = await getPhysicalNeighbors(nodeId, limit, excludedDocIds);
    const neighbors: NeighborNode[] = [...physicalNeighbors];

    const shouldAddSemantic = semanticMode === 'always'
        || (semanticMode === 'sparse-only' && physicalNeighbors.length < 3);

    if (shouldAddSemantic) {
        const excludeIds = new Set(physicalNeighbors.map(n => n.id));
        if (excludedDocIds) excludedDocIds.forEach(id => excludeIds.add(id));
        const semanticLimit = semanticMode === 'sparse-only' ? 15 : Math.max(5, limit - neighbors.length);
        const semanticNeighbors = await getSemanticNeighbors(nodeId, semanticLimit, excludeIds);
        for (const neighbor of semanticNeighbors) {
            if (excludedDocIds?.has(neighbor.id)) continue;
            neighbors.push({ id: neighbor.id, foundBy: 'semantic_neighbors', similarity: neighbor.similarity });
        }
    }

    return neighbors;
}

// --- Path Reconstruction ---

/** Reconstruct path from bidirectional search visited maps. */
function reconstructPath(
    intersectId: string,
    startVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    endVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>
): PathSegment[] {
    const path: PathSegment[] = [];

    // Build path from start to intersection
    let currentId: string | null = intersectId;
    const startPath: PathSegment[] = [];

    while (currentId) {
        const info = startVisited.get(currentId);
        if (!info) break;

        startPath.unshift({
            nodeId: currentId,
            type: info.type,
            similarity: info.similarity,
        });

        currentId = info.parentId;
    }

    // Build path from intersection to end
    currentId = intersectId;
    const endPath: PathSegment[] = [];

    while (currentId) {
        const info = endVisited.get(currentId);
        if (!info) break;

        endPath.push({
            nodeId: currentId,
            type: info.type,
            similarity: info.similarity,
        });

        currentId = info.parentId;
    }

    // Combine paths (avoid duplicating intersection)
    path.push(...startPath);
    if (endPath.length > 1) {
        path.push(...endPath.slice(1));
    }

    return path;
}

// --- Path Quality Evaluation ---

/** Create empty score structure. */
function createEmptyScore(): PathScore {
    return {
        totalScore: 0,
        physicalRatio: 0,
        avgSimilarity: 0,
        uniqueness: 1,
        freshness: 0,
        domainJumps: 0,
        length: 0,
    };
}

/** Score all paths based on quality dimensions. */
async function scorePaths(paths: ScoredPath[], allPaths: ScoredPath[]): Promise<ScoredPath[]> {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

    for (const path of paths) {
        const segments = path.segments;
        const length = segments.length - 1;

        // Physical ratio
        const physicalCount = segments.filter(s => s.type === 'physical_neighbors').length;
        const physicalRatio = length > 0 ? (physicalCount - 1) / length : 1;

        // Average similarity for semantic connections
        const semanticSegments = segments.filter(s => s.type === 'semantic_neighbors' && s.similarity);
        const avgSimilarity = semanticSegments.length > 0
            ? semanticSegments.reduce((sum, s) => sum + (parseFloat(s.similarity!) / 100), 0) / semanticSegments.length
            : 0;

        // Uniqueness (compared to other paths)
        const uniqueness = calculateUniqueness(segments, allPaths);

        // Freshness (based on last access time)
        let freshnessSum = 0;
        const nodeIds = segments.map(s => s.nodeId);
        const statsMap = await mobiusNodeRepo.getByDocIds(nodeIds);
        const now = Date.now();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

        for (const nodeId of nodeIds) {
            const stats = statsMap.get(nodeId);
            if (stats?.last_open_ts) {
                const age = now - stats.last_open_ts;
                freshnessSum += Math.max(0, 1 - age / oneMonthMs);
            } else {
                freshnessSum += 0.5; // Default freshness for untracked nodes
            }
        }
        const freshness = nodeIds.length > 0 ? freshnessSum / nodeIds.length : 0;

        // Domain jumps
        const domainJumps = await countDomainJumps(segments);

        // Calculate total score
        const totalScore =
            physicalRatio * SCORE_WEIGHTS.physicalRatio * 100 +
            freshness * SCORE_WEIGHTS.freshness * 100 +
            Math.min(domainJumps, 3) / 3 * SCORE_WEIGHTS.domainJumps * 100 +
            uniqueness * SCORE_WEIGHTS.uniqueness * 100 -
            length * SCORE_WEIGHTS.lengthPenalty * 10;

        path.score = {
            totalScore,
            physicalRatio,
            avgSimilarity,
            uniqueness,
            freshness,
            domainJumps,
            length,
        };
    }

    return paths;
}

/** Generate reasoning for path selection. */
function generatePathReasoning(path: ScoredPath): string {
    const score = path.score;
    const reasons: string[] = [];

    // Physical reliability
    if (score.physicalRatio > 0.8) {
        reasons.push('High physical connectivity ensures reliability');
    } else if (score.physicalRatio > 0.5) {
        reasons.push('Balanced physical and semantic connections');
    } else {
        reasons.push('Creative semantic bridging for discovery');
    }

    // Freshness
    if (score.freshness > 0.7) {
        reasons.push('Includes recently accessed knowledge');
    }

    // Domain diversity
    if (score.domainJumps > 0) {
        reasons.push(`Crosses ${score.domainJumps} knowledge domains`);
    }

    // Uniqueness
    if (score.uniqueness > 0.8) {
        reasons.push('Unique path not overlapping with others');
    }

    // Length consideration
    if (score.length <= 3) {
        reasons.push('Direct and concise connection');
    }

    return reasons.length > 0 ? reasons.join('. ') + '.' : 'Selected for balanced quality metrics.';
}

/** Calculate path uniqueness compared to other paths. */
function calculateUniqueness(segments: PathSegment[], allPaths: ScoredPath[]): number {
    const myNodes = new Set(segments.map(s => s.nodeId));
    let maxOverlap = 0;

    for (const other of allPaths) {
        if (other.segments === segments) continue;

        const otherNodes = new Set(other.segments.map(s => s.nodeId));
        let overlap = 0;

        for (const node of myNodes) {
            if (otherNodes.has(node)) overlap++;
        }

        const overlapRatio = overlap / Math.max(myNodes.size, otherNodes.size);
        maxOverlap = Math.max(maxOverlap, overlapRatio);
    }

    return 1 - maxOverlap;
}

/** Count folder transitions in path. */
async function countDomainJumps(segments: PathSegment[]): Promise<number> {
    const nodeIds = segments.map(s => s.nodeId);
    const metasMap = await getIndexedDocumentsByIds(nodeIds);

    let jumps = 0;
    let prevFolder: string | null = null;

    for (const segment of segments) {
        const meta = metasMap.get(segment.nodeId);
        if (!meta) continue;

        const folder = getParentFolder(meta.path);

        if (prevFolder !== null && folder !== prevFolder) {
            jumps++;
        }

        prevFolder = folder;
    }

    return jumps;
}

// --- Utility Functions ---

/** Identify key edge for diversity blocking. */
function identifyKeyEdge(path: PathSegment[]): string {
    if (path.length < 2) return '';

    const parseSimilarity = (similarity?: string): number => {
        if (!similarity) return 0;
        const parsed = parseFloat(similarity.replace('%', ''));
        return isNaN(parsed) ? 0 : parsed;
    };

    let bestEdge = '';
    let bestScore = -1;

    for (let i = 0; i < path.length - 1; i++) {
        const current = path[i];
        const next = path[i + 1];

        // Calculate edge importance score
        let score = 0;
        if (current.type === 'physical_neighbors' && next.type === 'physical_neighbors') {
            score = 100 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
        } else if (current.type === 'semantic_neighbors' && next.type === 'semantic_neighbors') {
            score = Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
        } else {
            score = 50 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity)) * 0.5;
        }

        if (score > bestScore) {
            bestScore = score;
            bestEdge = `${current.nodeId}->${next.nodeId}`;
        }
    }

    return bestEdge;
}

/** Deduplicate paths based on node sequence. */
function deduplicatePaths(paths: ScoredPath[]): ScoredPath[] {
    const seen = new Set<string>();
    const unique: ScoredPath[] = [];

    for (const path of paths) {
        const key = path.segments.map(s => s.nodeId).join('->');
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(path);
        }
    }

    return unique;
}

/** Ensure at least one path from each strategy type is included. */
function ensureStrategyDiversity(paths: ScoredPath[], maxResults: number): ScoredPath[] {
    const byStrategy: Record<StrategyType, ScoredPath[]> = {
        reliable: [],
        fastTrack: [],
        brainstorm: [],
        temporal: [],
    };

    for (const path of paths) {
        byStrategy[path.strategy].push(path);
    }

    const result: ScoredPath[] = [];
    const strategies: StrategyType[] = ['reliable', 'fastTrack', 'brainstorm', 'temporal'];

    // First pass: one from each strategy
    for (const strategy of strategies) {
        if (byStrategy[strategy].length > 0 && result.length < maxResults) {
            result.push(byStrategy[strategy].shift()!);
        }
    }

    // Second pass: fill remaining slots by score
    const remaining = paths.filter(p => !result.includes(p));
    remaining.sort((a, b) => b.score.totalScore - a.score.totalScore);

    for (const path of remaining) {
        if (result.length >= maxResults) break;
        result.push(path);
    }

    return result;
}

// --- Post-Processing Analysis ---

/** Analyze hub nodes that appear in multiple paths. */
function analyzeHubs(paths: ScoredPath[]): HubAnalysis[] {
    const nodeCount = new Map<string, number>();

    for (const path of paths) {
        // Skip first and last (start/end nodes)
        for (let i = 1; i < path.segments.length - 1; i++) {
            const nodeId = path.segments[i].nodeId;
            nodeCount.set(nodeId, (nodeCount.get(nodeId) || 0) + 1);
        }
    }

    // Filter nodes appearing in multiple paths
    const hubs: HubAnalysis[] = [];

    for (const [nodeId, count] of nodeCount) {
        if (count >= 2) {
            hubs.push({
                nodeId,
                label: nodeId, // Will be replaced with actual label in formatting
                occurrenceCount: count,
                betweennessCentrality: count / paths.length,
            });
        }
    }

    return hubs.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/** Analyze context intersection between two notes (paths, tags, graph structure). */
async function analyzeContextIntersection(startId: string, endId: string): Promise<ContextIntersectionAnalysis | null> {
    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(startId),
        getIndexedDocumentById(endId)
    ]);

    if (!startMeta || !endMeta) return null;

    // 1. Physical path analysis
    const physicalAncestor = analyzePhysicalAncestor(startMeta.path, endMeta.path);

    // 2. Tag-based semantic intersection
    const commonTags = analyzeTagIntersection(startMeta.tags, endMeta.tags);

    // 3. Graph-based structural intersection
    const commonParents = await analyzeCommonParents(startId, endId);

    // 4. Overall assessment
    const isDistant = physicalAncestor.depth <= 1 && (commonTags.length > 0 || commonParents.length > 0);
    let primaryContext: string | undefined;

    if (commonTags.length > 0) {
        primaryContext = commonTags[0]; // Most relevant tag
    } else if (commonParents.length > 0) {
        primaryContext = commonParents[0].label; // Most connected parent
    }

    return {
        physicalAncestor,
        commonTags,
        commonParents,
        isDistant,
        primaryContext,
    };
}

/** Analyze physical path ancestor. */
function analyzePhysicalAncestor(startPath: string, endPath: string) {
    const startParts = startPath.split('/');
    const endParts = endPath.split('/');

    let commonParts: string[] = [];
    for (let i = 0; i < Math.min(startParts.length, endParts.length); i++) {
        if (startParts[i] === endParts[i]) {
            commonParts.push(startParts[i]);
        } else {
            break;
        }
    }

    const ancestorPath = commonParts.length > 0 ? commonParts.join('/') : '/';

    return {
        ancestorPath,
        startPath,
        endPath,
        depth: commonParts.length,
    };
}

/** Analyze tag intersection between two documents. */
function analyzeTagIntersection(startTags: string | null, endTags: string | null): string[] {
    if (!startTags || !endTags) return [];
    const parseTags = (raw: string): string[] => {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
        catch { return raw.split(',').map(t => t.trim()).filter(t => t.length > 0); }
    };
    const startArr = parseTags(startTags), endArr = parseTags(endTags);
    return startArr.filter(tag => endArr.includes(tag));
}

/** Find common parent nodes that reference both start and end nodes. */
async function analyzeCommonParents(startId: string, endId: string): Promise<Array<{
    nodeId: string;
    label: string;
    type: string;
    connectionCount: number;
}>> {
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const [startEdges, endEdges] = await Promise.all([
        mobiusEdgeRepo.getAllEdgesForNode(startId, 50),
        mobiusEdgeRepo.getAllEdgesForNode(endId, 50)
    ]);

    const startReferrerIds = new Set(
        startEdges.filter(e => e.to_node_id === startId && e.from_node_id !== endId).map(e => e.from_node_id)
    );
    const endReferrerIds = new Set(
        endEdges.filter(e => e.to_node_id === endId && e.from_node_id !== startId).map(e => e.from_node_id)
    );
    const commonParentIds = Array.from(startReferrerIds).filter(id => endReferrerIds.has(id));
    if (commonParentIds.length === 0) return [];

    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const parentNodes = await mobiusNodeRepo.getByIds(commonParentIds);

    const result = commonParentIds.map(parentId => {
        const node = parentNodes.get(parentId);
        if (!node) return null;
        const connectionCount =
            startEdges.filter(e => e.from_node_id === parentId && e.to_node_id === startId).length +
            endEdges.filter(e => e.from_node_id === parentId && e.to_node_id === endId).length;
        return { nodeId: parentId, label: getNodeLabel(node, node.label), type: node.type, connectionCount };
    }).filter(Boolean).sort((a, b) => (b?.connectionCount || 0) - (a?.connectionCount || 0));

    return result as Array<{
        nodeId: string;
        label: string;
        type: string;
        connectionCount: number;
    }>;
}

/** Build analysis section for output. */
function buildAnalysisSection(hubs: HubAnalysis[], contextIntersection: ContextIntersectionAnalysis | null): string {
    let section = '';

    // Knowledge Hubs section
    if (hubs.length > 0) {
        section += '\n\n## Knowledge Hubs\n\n';
        section += 'These nodes appear in multiple paths, acting as central connectors:\n\n';
        for (const hub of hubs.slice(0, SLICE_CAPS.inspector.pathFindHubs)) {
            section += `- **[[${hub.label}]]** (appears in ${hub.occurrenceCount} paths)\n`;
        }
    }

    if (contextIntersection) {
        const ci = contextIntersection;
        const hasContent = ci.commonTags.length > 0 || ci.commonParents.length > 0 ||
                          ci.physicalAncestor.depth > 1 || ci.isDistant;
        if (hasContent) {
            section += '\n\n## Shared Context Analysis\n\n';
            if (ci.commonTags.length > 0)
                section += `**Common Tags:** ${ci.commonTags.map(tag => `\`${tag}\``).join(', ')}\n\n`;
            if (ci.commonParents.length > 0) {
                section += '**Common Reference Points:**\n';
                for (const p of ci.commonParents.slice(0, SLICE_CAPS.inspector.pathFindCommonParents)) {
                    const link = isIndexedNoteNodeType(p.type) ? `[[${p.label}]]` : `**${p.label}**`;
                    section += `- ${link} (${p.connectionCount} connections)\n`;
                }
                section += '\n';
            }
            if (ci.physicalAncestor.depth > 1)
                section += `**Shared Location:** Both notes are in \`${ci.physicalAncestor.ancestorPath}\`\n\n`;
            if (ci.isDistant)
                section += `**Cross-Domain Insight:** Despite different locations, these notes share ${ci.primaryContext ? `**${ci.primaryContext}**` : 'semantic connections'}.\n\n`;
        }
    }

    return section;
}

// --- Output Formatting ---

/** Format paths for user-friendly output. */
async function formatPathsForOutput(
    paths: ScoredPath[],
    mobiusNodeRepo: any
): Promise<Array<{
    path: string[];
    connectionDetails: string;
    strategy: string;
    insightLabel: string;
    score: number;
}>> {
    // Batch fetch all nodes
    const allNodeIds = new Set<string>();
    for (const scoredPath of paths) {
        for (const segment of scoredPath.segments) {
            allNodeIds.add(segment.nodeId);
        }
    }

    const nodesMap = await mobiusNodeRepo.getByIds(Array.from(allNodeIds));

    return paths.map(scoredPath => {
        const nodeLabels = scoredPath.segments.map(s => getNodeLabel(nodesMap.get(s.nodeId), s.nodeId));

        const connectionDetails = scoredPath.segments.slice(0, -1).map((seg, i) => {
            const next = scoredPath.segments[i + 1];
            const type = seg.type === 'physical_neighbors' && next.type === 'physical_neighbors' ? 'physical' : 'semantic';
            const sim = seg.similarity || next.similarity;
            return sim ? `${type} (${sim})` : type;
        }).join(' → ');

        return {
            path: nodeLabels,
            connectionDetails,
            strategy: STRATEGY_NAMES[scoredPath.strategy],
            insightLabel: scoredPath.insightLabel,
            score: scoredPath.score.totalScore,
        };
    });
}
