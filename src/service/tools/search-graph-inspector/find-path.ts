import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GRAPH_INSPECT_STEP_TIME_LIMIT } from "@/core/constant";
import { PATH_FINDING_CONSTANTS } from "@/core/constant";
import { buildResponse, withTimeoutMessage } from "../types";
import { template as GRAPH_PATH_FINDING_TEMPLATE } from "../templates/graph-path-finding";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import type { Database as DbSchema } from "@/core/storage/sqlite/ddl";

// Helper: get single doc meta by id (wraps batch API)
async function getDocMetaById(id: string): Promise<DbSchema['doc_meta'] | null> {
    const results = await sqliteStoreManager.getDocMetaRepo().getByIds([id]);
    return results.length > 0 ? results[0] : null;
}

// Helper: get multiple doc metas by ids as a Map
async function getDocMetasByIds(ids: string[]): Promise<Map<string, DbSchema['doc_meta']>> {
    const results = await sqliteStoreManager.getDocMetaRepo().getByIds(ids);
    const map = new Map<string, DbSchema['doc_meta']>();
    for (const meta of results) {
        map.set(meta.id, meta);
    }
    return map;
}

// ============================================================================
// Architecture Design Philosophy (Refactored)
// ============================================================================
/**
 * Multi-Strategy Path Finding System
 * 
 * Design Philosophy:
 * 1. Strategy Pattern: Each path type has independent search strategy
 * 2. Physical Priority: Reliable paths are searched first, ensuring direct connections
 * 3. Semantic Guidance: A* with semantic gravity field for intelligent exploration
 * 4. Quality Evaluation: Multi-dimensional scoring for path ranking
 * 
 * Strategy Types:
 * - Reliable: Pure physical shortest path (bidirectional BFS, physical edges only)
 * - FastTrack: A* with semantic gravity field (dynamic vector interpolation)
 * - Brainstorm: Cross-domain bridge discovery (forced domain jumps)
 * - Temporal: Time-ordered knowledge evolution path
 * 
 * Path Quality Dimensions:
 * - Uniqueness: Low overlap with other paths
 * - Freshness: Contains recently unvisited nodes
 * - Domain Jump: Cross-folder/tag transitions
 * - Physical Ratio: Proportion of reliable physical connections
 */

// ============================================================================
// Type Definitions
// ============================================================================

/** Connection types between nodes */
type ConnectionType = 'physical' | 'semantic';

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
}

/** Hub analysis result */
interface HubAnalysis {
    nodeId: string;
    label: string;
    occurrenceCount: number;
    betweennessCentrality: number;
}

/** Common ancestor analysis result */
interface CommonAncestorAnalysis {
    ancestorPath: string;
    startPath: string;
    endPath: string;
    depth: number;
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

// ============================================================================
// Constants
// ============================================================================

/** Edge weight configuration */
const EDGE_WEIGHTS = {
    physical: 1.0,
    semantic: 1.5,
    consecutiveSemantic: 2.0,  // Reduced from 3.0 to allow more semantic paths
} as const;

/** Semantic similarity threshold */
const SIMILARITY_THRESHOLD = 0.5;

/** Maximum consecutive semantic edges allowed */
const MAX_CONSECUTIVE_SEMANTIC = 3; // Increased from 2 to 3 for more flexibility

/** Score weights for path quality */
const SCORE_WEIGHTS = {
    physicalRatio: 0.35,
    freshness: 0.25,
    domainJumps: 0.20,
    uniqueness: 0.15,
    lengthPenalty: 0.05,
} as const;

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Find diverse paths between two notes using multiple strategies.
 * Returns paths from all strategy types for comprehensive discovery.
 */
export async function findPath(params: any) {
    const { start_note_path, end_note_path, limit, include_semantic_paths, response_format, filters } = params;
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

    // Validate and fetch start/end nodes
    const [startDocMeta, endDocMeta] = await Promise.all([
        sqliteStoreManager.getDocMetaRepo().getByPath(start_note_path),
        sqliteStoreManager.getDocMetaRepo().getByPath(end_note_path)
    ]);

    if (!startDocMeta || !endDocMeta) {
        return `# Path Finding Failed\n\n`
            + `${!startDocMeta ? `Start note "${start_note_path}" not found.` : ''}`
            + `${!endDocMeta ? `End note "${end_note_path}" not found.` : ''}`;
    }

    const [startNode, endNode] = await Promise.all([
        graphNodeRepo.getById(startDocMeta.id),
        graphNodeRepo.getById(endDocMeta.id)
    ]);

    if (!startNode || !endNode) {
        return `# Path Finding Failed\n\n`
            + `${!startNode ? `Start node "${start_note_path}" not found in graph.` : ''}`
            + `${!endNode ? `End node "${end_note_path}" not found in graph.` : ''}`;
    }

    // Pre-fetch semantic vectors for A* heuristic
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
    const [startVector, endVector] = await Promise.all([
        embeddingRepo.getAverageEmbeddingForDoc(startNode.id),
        embeddingRepo.getAverageEmbeddingForDoc(endNode.id)
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
        const hubNodesMap = await graphNodeRepo.getByIds(hubNodeIds);

        for (const hub of hubAnalysis) {
            const node = hubNodesMap.get(hub.nodeId);
            if (node && node.type === 'document') {
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
    const formattedPaths = await formatPathsForOutput(scoredPaths, graphNodeRepo);

    // Build template data
    const templatePaths = formattedPaths.slice(0, limit).map((pathData, index) => {
        // Get reasoning from the original scored path
        const originalPath = scoredPaths[index];
        return {
            index: index + 1,
            steps: pathData.path.length - 1,
            pathString: pathData.path.map(node => `[[${node}]]`).join(' → '),
            connectionDetails: pathData.connectionDetails,
            strategy: pathData.strategy,
            insightLabel: pathData.insightLabel,
            score: pathData.score.toFixed(1),
            reasoning: originalPath?.reasoning || 'Selected for optimal quality metrics.',
        };
    });

    // Add hub and context intersection analysis to template
    const analysisSection = buildAnalysisSection(hubAnalysis, contextIntersection);

    return buildResponse(response_format, GRAPH_PATH_FINDING_TEMPLATE, {
        start_note_path,
        end_note_path,
        paths: templatePaths,
        analysis: analysisSection,
    });
}

// ============================================================================
// Multi-Strategy Search Orchestrator
// ============================================================================

/**
 * Execute all search strategies in parallel and merge results.
 */
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
    console.debug('[findPath] Phase 1: Reliable Strategy');
    const reliablePaths = await reliableStrategy(context);
    console.debug('[findPath] reliablePaths found:', reliablePaths.length);
    allPaths.push(...reliablePaths);

    // Phase 2: FastTrack Strategy - A* with semantic guidance (if semantic enabled)
    if (context.includeSemantic && context.startVector && context.endVector) {
        console.debug('[findPath] Phase 2: FastTrack Strategy');
        const fastTrackPaths = await fastTrackStrategy(context);
        console.debug('[findPath] fastTrackPaths found:', fastTrackPaths.length);
        allPaths.push(...fastTrackPaths);
    }

    // Phase 3: Brainstorm Strategy - Cross-domain discovery (if semantic enabled)
    if (context.includeSemantic) {
        console.debug('[findPath] Phase 3: Brainstorm Strategy');
        const brainstormPaths = await brainstormStrategy(context);
        console.debug('[findPath] brainstormPaths found:', brainstormPaths.length);
        allPaths.push(...brainstormPaths);
    }

    // Phase 4: Temporal Strategy - Time-ordered paths
    console.debug('[findPath] Phase 4: Temporal Strategy');
    const temporalStartTime = Date.now();
    const temporalPaths = await temporalStrategy(context);
    const temporalDuration = Date.now() - temporalStartTime;
    console.debug('[findPath] temporalPaths found:', temporalPaths.length, 'in', temporalDuration, 'ms');
    allPaths.push(...temporalPaths);

    // Fallback Strategy: If no paths found, try a more permissive search
    if (allPaths.length === 0) {
        console.debug('[findPath] No paths found, attempting fallback strategy');
        const fallbackPaths = await fallbackStrategy(context);
        console.debug('[findPath] fallbackPaths found:', fallbackPaths.length);
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

// ============================================================================
// Strategy 1: Reliable - Pure Physical BFS
// ============================================================================

/**
 * Find shortest physical-only path using bidirectional BFS.
 * Guarantees the most direct and reliable connection.
 */
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
            context.filters
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

// ============================================================================
// Strategy 2: FastTrack - A* with Semantic Gravity Field
// ============================================================================

/**
 * A* search with dynamic semantic gravity field.
 * Uses interpolated target vector for guided exploration.
 */
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

/**
 * A* search implementation with semantic gravity field.
 */
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

        // Get neighbors (prioritize physical, limit semantic)
        // For A* FastTrack strategy, be more permissive with semantic connections
        const neighbors = await getSmartNeighbors(
            current.nodeId,
            true, // Include semantic
            consecutiveSemanticCount >= 4 // More permissive than default 3
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

                // For A* strategy, be more permissive with consecutive semantic edges
                // Allow up to 4 consecutive semantic edges to find longer semantic bridges
                const allowSemantic = consecutiveSemanticCount < 4;

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

/**
 * Calculate A* heuristic using semantic gravity field.
 * Uses dynamic interpolation between start and end vectors.
 * Heuristic should be admissible (never overestimate) and provide good guidance.
 */
async function calculateHeuristic(
    nodeId: string,
    endVector: number[],
    progress: number,
    maxHops: number
): Promise<number> {
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
    const nodeVector = await embeddingRepo.getAverageEmbeddingForDoc(nodeId);

    if (!nodeVector) {
        return 2.0; // Small penalty for nodes without embeddings
    }

    // Calculate cosine similarity to target
    const similarity = cosineSimilarity(nodeVector, endVector);

    // Convert to distance (0 = identical, higher = more different)
    // Use smaller multiplier to reduce punishment - aim for guidance not blocking
    const distance = Math.max(0, 1 - similarity);

    // Scale down the heuristic influence - use an even smaller constant for A* exploration
    return distance * 1.0; // Reduced from 2.0 to allow more exploration
}

/**
 * Calculate cosine similarity between two vectors.
 */
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

/**
 * Reconstruct path from A* node chain.
 */
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

// ============================================================================
// Strategy Fallback: Permissive Search
// ============================================================================

/**
 * Fallback strategy when all other strategies fail.
 * Uses very permissive search to find ANY connection between nodes.
 */
async function fallbackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];

    // Try with increased hop limit and no edge restrictions
    const path = await bidirectionalBFS(
        context.startId,
        context.endId,
        new Set(), // No forbidden edges
        true, // Always include semantic
        Math.max(context.maxHops * 2, 8), // Double hop limit, minimum 8
        context.filters
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

// ============================================================================
// Strategy 3: Brainstorm - Cross-Domain Bridge Discovery
// ============================================================================

/**
 * Find paths that cross different knowledge domains.
 * Forces exploration through domain boundaries for serendipitous discovery.
 */
async function brainstormStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const brainstormForbiddenEdges = new Set<string>();

    // Get folder paths for domain analysis
    const [startMeta, endMeta] = await Promise.all([
        getDocMetaById(context.startId),
        getDocMetaById(context.endId)
    ]);

    if (!startMeta || !endMeta) return paths;

    const startFolder = getParentFolder(startMeta.path);
    const endFolder = getParentFolder(endMeta.path);

    // Find multiple diverse cross-domain paths
    for (let i = 0; i < 3; i++) {
        // If same folder, force cross-domain exploration
        const forceCrossDomain = startFolder === endFolder || i === 0; // Always force cross-domain on first attempt

        // Search with preference for domain-crossing edges
        const path = await bidirectionalBFSWithDomainPreference(
            context.startId,
            context.endId,
            brainstormForbiddenEdges,
            context.includeSemantic,
            context.maxHops,
            context.filters,
            forceCrossDomain ? endFolder : null
        );

        if (!path) break;

        // Check if path actually crosses domains or has interesting semantic jumps
        const nodeIds = path.map(s => s.nodeId);
        const metasMap = await getDocMetasByIds(nodeIds);
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
            const domainCount = domains.size;
            let insightMessage = '';

            if (domainCount > 1) {
                insightMessage = `Crossing ${domainCount} different domains, this connection may spark unexpected inspiration.`;
            } else if (semanticConnections > 0) {
                insightMessage = `Through creative semantic connections (avg ${Math.round(avgSimilarity * 100)}% similarity), these ideas form an unexpected bridge.`;
            } else {
                insightMessage = `This path reveals hidden connections through creative exploration.`;
            }

            paths.push({
                segments: path,
                strategy: 'brainstorm',
                score: createEmptyScore(),
                insightLabel: insightMessage,
                reasoning: 'Selected for cross-domain exploration and creative connection discovery.',
            });

            // Block key cross-domain edges for diversity
            const edgeToBlock = identifyKeyEdge(path);
            if (edgeToBlock) {
                brainstormForbiddenEdges.add(edgeToBlock);
            } else {
                break;
            }
        } else {
            // If path doesn't meet criteria, still block an edge to try different approaches
            const edgeToBlock = identifyKeyEdge(path);
            if (edgeToBlock) {
                brainstormForbiddenEdges.add(edgeToBlock);
            } else {
                break;
            }
        }
    }

    return paths;
}

/**
 * Get parent folder from file path.
 */
function getParentFolder(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash > 0 ? path.substring(0, lastSlash) : '/';
}

/**
 * BFS with preference for domain-crossing edges.
 */
async function bidirectionalBFSWithDomainPreference(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    maxHops: number,
    filters?: any,
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
        // Expand from start with domain preference
        const startResult = await expandFrontierWithDomainPreference(
            startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters, avoidFolder
        );
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        // Expand from end
        const endResult = await expandFrontierWithDomainPreference(
            endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters, avoidFolder
        );
        if (endResult.found && endResult.intersectId) {
            return reconstructPath(endResult.intersectId, startVisited, endVisited);
        }

        hops++;
    }

    return null;
}

// ============================================================================
// Strategy 4: Temporal - Time-Ordered Knowledge Evolution
// ============================================================================

/**
 * Find paths following chronological order.
 * Shows how ideas evolved over time.
 */
async function temporalStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];

    // Get timestamps for start and end nodes
    const [startMeta, endMeta] = await Promise.all([
        getDocMetaById(context.startId),
        getDocMetaById(context.endId)
    ]);

    if (!startMeta || !endMeta) return paths;

    const startTime = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTime = endMeta.mtime ?? endMeta.ctime ?? Date.now();

    // Determine direction based on timestamps
    // Use creation time as fallback if modification time is unreliable for evolution
    const isForward = startTime <= endTime;

    // Search with temporal constraint
    // Give temporal search more hops since temporal evolution is often more circuitous
    const path = await temporalBFS(
        context.startId,
        context.endId,
        Math.max(context.maxHops * 1.5, context.maxHops + 2), // Increase hop limit for temporal
        isForward,
        context.filters
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

/**
 * BFS with temporal ordering constraint.
 * Uses physical-first approach with limited semantic fallback for performance.
 * Implements heuristic pruning to prioritize temporally relevant nodes.
 */
async function temporalBFS(
    startId: string,
    endId: string,
    maxHops: number,
    isForward: boolean,
    filters?: any
): Promise<PathSegment[] | null> {
    const visited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; timestamp: number }>();

    // Get start and end timestamps for heuristic guidance
    const [startMeta, endMeta] = await Promise.all([
        getDocMetaById(startId),
        getDocMetaById(endId)
    ]);
    if (!startMeta || !endMeta) return null;

    const startTimestamp = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTimestamp = endMeta.mtime ?? endMeta.ctime ?? Date.now();

    visited.set(startId, { parentId: null, type: 'physical_neighbors', timestamp: startTimestamp });

    let queue: { id: string; timestamp: number; heuristicScore: number }[] = [{
        id: startId,
        timestamp: startTimestamp,
        heuristicScore: 0
    }];
    let hops = 0;

    // Time window tolerance (optimized for performance)
    const TIME_WINDOW_HOURS = 24 * 7; // 7 days for better performance

    // Performance timeout check - prevent temporal search from dominating execution time
    const startTime = Date.now();
    const TIMEOUT_MS = 3000; // 3 second timeout for temporal search

    while (queue.length > 0 && hops < maxHops) {
        // Timeout check
        if (Date.now() - startTime > TIMEOUT_MS) {
            console.warn('[Temporal] Strategy timeout, returning partial results');
            break;
        }

        // Sort queue by heuristic score (closer to end time = better)
        queue.sort((a, b) => a.heuristicScore - b.heuristicScore);
        const nextQueue: { id: string; timestamp: number; heuristicScore: number }[] = [];

        // Limit processing per level to prevent explosion (max 5 nodes per level)
        // This bounds the search space and prevents exponential growth
        const currentLevelNodes = queue.slice(0, 5);
        queue = queue.slice(5);

        for (const current of currentLevelNodes) {
            // Physical-first approach: prefer physical neighbors, use semantic as fallback
            let neighbors = await getPhysicalNeighbors(current.id, 10); // Start with physical only, limit to 10

            // If too few physical neighbors, add limited semantic neighbors (max 3)
            if (neighbors.length < 3) {
                const physicalIds = new Set(neighbors.map(n => n.id));
                const semanticNeighbors = await getSemanticNeighbors(current.id, 3, physicalIds);
                neighbors.push(...semanticNeighbors.map(s => ({
                    id: s.id,
                    foundBy: 'semantic_neighbors' as const,
                    similarity: s.similarity
                })));
            }

            // Filter by filters if provided
            let filteredNeighbors = neighbors;
            if (filters) {
                const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(
                    neighbors.map(n => n.id),
                    filters
                );
                filteredNeighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
            }

            // Batch fetch neighbor timestamps (only for filtered neighbors)
            const neighborIds = filteredNeighbors.map(n => n.id);
            const neighborMetasMap = await getDocMetasByIds(neighborIds);

            // Score and filter neighbors by temporal relevance
            const scoredNeighbors = filteredNeighbors
                .filter(neighbor => {
                    if (visited.has(neighbor.id)) return false;

                    const neighborMeta = neighborMetasMap.get(neighbor.id);
                    if (!neighborMeta) return false;

                    const neighborTime = neighborMeta.mtime ?? neighborMeta.ctime ?? Date.now();

                    // Temporal constraint with sliding window
                    const timeDiff = neighborTime - current.timestamp;
                    const timeDiffHours = timeDiff / (1000 * 60 * 60);

                    // Allow flexible temporal ordering within window
                    const isValidTemporal = isForward
                        ? timeDiffHours >= -TIME_WINDOW_HOURS // Allow some backward movement within window
                        : timeDiffHours <= TIME_WINDOW_HOURS;  // Allow some forward movement within window

                    return isValidTemporal;
                })
                .map(neighbor => {
                    const neighborMeta = neighborMetasMap.get(neighbor.id)!;
                    const neighborTime = neighborMeta.mtime ?? neighborMeta.ctime ?? Date.now();

                    // Heuristic: prefer nodes closer to end time (temporal distance)
                    const temporalDistance = Math.abs(neighborTime - endTimestamp);
                    const heuristicScore = temporalDistance / (1000 * 60 * 60); // Hours difference

                    return {
                        neighbor,
                        neighborTime,
                        heuristicScore
                    };
                })
                .sort((a, b) => a.heuristicScore - b.heuristicScore) // Sort by temporal proximity to end time
                .slice(0, 5); // Take only top 5 most temporally relevant neighbors - bounds search

            for (const { neighbor, neighborTime, heuristicScore } of scoredNeighbors) {
                const connectionType = neighbor.foundBy === 'physical_neighbors'
                    ? 'physical_neighbors'
                    : 'semantic_neighbors';

                visited.set(neighbor.id, {
                    parentId: current.id,
                    type: connectionType,
                    timestamp: neighborTime,
                });

                // Check if goal reached
                if (neighbor.id === endId) {
                    return reconstructTemporalPath(endId, visited);
                }

                nextQueue.push({
                    id: neighbor.id,
                    timestamp: neighborTime,
                    heuristicScore
                });
            }
        }

        queue = nextQueue;
        hops++;
    }

    return null;
}

/**
 * Reconstruct path from temporal search.
 */
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

// ============================================================================
// Core BFS Implementation
// ============================================================================

/**
 * Bidirectional BFS for path finding.
 */
async function bidirectionalBFS(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    maxHops: number,
    filters?: any
): Promise<PathSegment[] | null> {
    const startVisited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>();
    const endVisited = new Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>();

    startVisited.set(startId, { parentId: null, type: 'physical_neighbors' });
    endVisited.set(endId, { parentId: null, type: 'physical_neighbors' });

    let startQueue = [startId];
    let endQueue = [endId];
    let hops = 0;

    while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
        // Expand from start
        const startResult = await expandFrontier(
            startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters
        );
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        // Expand from end
        const endResult = await expandFrontier(
            endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters
        );
        if (endResult.found && endResult.intersectId) {
            return reconstructPath(endResult.intersectId, startVisited, endVisited);
        }

        hops++;
    }

    return null;
}

/**
 * Expand search frontier for BFS.
 */
async function expandFrontier(
    queue: string[],
    myVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    otherVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    filters?: any
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = includeSemantic
            ? await getMixedNeighbors(currentId, true)
            : await getPhysicalNeighbors(currentId);

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

    // Update queue in place
    queue.length = 0;
    queue.push(...nextQueue);

    return { found: false };
}

/**
 * Expand frontier with domain crossing preference.
 */
async function expandFrontierWithDomainPreference(
    queue: string[],
    myVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    otherVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    filters?: any,
    avoidFolder?: string | null
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = includeSemantic
            ? await getMixedNeighbors(currentId, true)
            : await getPhysicalNeighbors(currentId);

        // Sort neighbors to prefer those in different folders
        if (avoidFolder) {
            const neighborIds = neighbors.map(n => n.id);
            const metasMap = await getDocMetasByIds(neighborIds);
            const neighborsWithMeta = neighbors.map(n => {
                const meta = metasMap.get(n.id);
                return { ...n, folder: meta ? getParentFolder(meta.path) : '' };
            });
            // Prefer neighbors not in the avoid folder
            neighborsWithMeta.sort((a, b) => {
                const aInAvoid = a.folder === avoidFolder ? 1 : 0;
                const bInAvoid = b.folder === avoidFolder ? 1 : 0;
                return aInAvoid - bInAvoid;
            });
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

// ============================================================================
// Neighbor Retrieval
// ============================================================================

/**
 * Get only physical neighbors.
 */
async function getPhysicalNeighbors(nodeId: string, limit: number = 20): Promise<NeighborNode[]> {
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
    const neighbors: NeighborNode[] = [];

    const physicalEdges = await graphEdgeRepo.getAllEdgesForNode(nodeId, limit);
    const seenIds = new Set<string>();

    for (const edge of physicalEdges) {
        const neighborId = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
        if (!seenIds.has(neighborId)) {
            seenIds.add(neighborId);
            neighbors.push({ id: neighborId, foundBy: 'physical_neighbors' });
        }
    }

    return neighbors;
}

/**
 * Get mixed neighbors (physical + semantic).
 */
async function getMixedNeighbors(nodeId: string, includeSemantic: boolean, limit: number = 20): Promise<NeighborNode[]> {
    const neighbors: NeighborNode[] = [];

    // Physical neighbors first
    const physicalNeighbors = await getPhysicalNeighbors(nodeId, limit);
    neighbors.push(...physicalNeighbors);

    const physicalIds = new Set(physicalNeighbors.map(n => n.id));

    // Add semantic neighbors if requested
    if (includeSemantic) {
        const semanticNeighbors = await getSemanticNeighbors(
            nodeId,
            Math.max(5, limit - neighbors.length),
            physicalIds
        );
        for (const neighbor of semanticNeighbors) {
            neighbors.push({
                id: neighbor.id,
                foundBy: 'semantic_neighbors',
                similarity: neighbor.similarity,
            });
        }
    }

    return neighbors;
}

/**
 * Smart neighbor selection with semantic throttling.
 */
async function getSmartNeighbors(
    nodeId: string,
    includeSemantic: boolean,
    throttleSemantic: boolean
): Promise<NeighborNode[]> {
    const neighbors: NeighborNode[] = [];

    // Always get physical neighbors
    const physicalNeighbors = await getPhysicalNeighbors(nodeId, 20);
    neighbors.push(...physicalNeighbors);

    // Only add semantic if allowed and not throttled
    if (includeSemantic && !throttleSemantic && physicalNeighbors.length < 3) {
        const physicalIds = new Set(physicalNeighbors.map(n => n.id));
        // Increase semantic neighbor count for better exploration, especially in A*
        const semanticNeighbors = await getSemanticNeighbors(nodeId, 15, physicalIds); // Increased from 5 to 15
        for (const neighbor of semanticNeighbors) {
            neighbors.push({
                id: neighbor.id,
                foundBy: 'semantic_neighbors',
                similarity: neighbor.similarity,
            });
        }
    }

    return neighbors;
}

// ============================================================================
// Path Reconstruction
// ============================================================================

/**
 * Reconstruct path from bidirectional search visited maps.
 */
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

// ============================================================================
// Path Quality Evaluation
// ============================================================================

/**
 * Create empty score structure.
 */
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

/**
 * Score all paths based on quality dimensions.
 */
async function scorePaths(paths: ScoredPath[], allPaths: ScoredPath[]): Promise<ScoredPath[]> {
    const docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();

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
        const statsMap = await docStatisticsRepo.getByDocIds(nodeIds);
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

/**
 * Generate human-readable reasoning for why this path was selected.
 */
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

/**
 * Calculate path uniqueness compared to other paths.
 */
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

/**
 * Count folder transitions in path.
 */
async function countDomainJumps(segments: PathSegment[]): Promise<number> {
    const nodeIds = segments.map(s => s.nodeId);
    const metasMap = await getDocMetasByIds(nodeIds);

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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Identify key edge for diversity blocking.
 */
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

/**
 * Deduplicate paths based on node sequence.
 */
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

/**
 * Ensure at least one path from each strategy type is included.
 */
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

// ============================================================================
// Post-Processing Analysis
// ============================================================================

/**
 * Analyze hub nodes that appear in multiple paths.
 */
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

/**
 * Analyze comprehensive context intersection between two notes.
 * Includes physical paths, semantic tags, and graph structure relationships.
 */
async function analyzeContextIntersection(startId: string, endId: string): Promise<ContextIntersectionAnalysis | null> {
    const [startMeta, endMeta] = await Promise.all([
        getDocMetaById(startId),
        getDocMetaById(endId)
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

    // Debug logging
    console.debug('[ContextAnalysis]', {
        startPath: startMeta.path,
        endPath: endMeta.path,
        startTags: startMeta.tags,
        endTags: endMeta.tags,
        commonTags: commonTags.length,
        commonParents: commonParents.length,
        physicalDepth: physicalAncestor.depth,
        isDistant,
        primaryContext
    });

    return {
        physicalAncestor,
        commonTags,
        commonParents,
        isDistant,
        primaryContext,
    };
}

/**
 * Analyze physical path ancestor (refactored from original function).
 */
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

/**
 * Analyze tag intersection between two documents.
 */
function analyzeTagIntersection(startTags: string | null, endTags: string | null): string[] {
    if (!startTags || !endTags) return [];

    let startTagArray: string[] = [];
    let endTagArray: string[] = [];

    // Try to parse as JSON array first (preferred format)
    try {
        const parsedStart = JSON.parse(startTags);
        const parsedEnd = JSON.parse(endTags);
        startTagArray = Array.isArray(parsedStart) ? parsedStart : [];
        endTagArray = Array.isArray(parsedEnd) ? parsedEnd : [];
    } catch {
        // Fallback to comma-separated string
        startTagArray = startTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        endTagArray = endTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }

    // Find intersection
    const commonTags = startTagArray.filter(tag => endTagArray.includes(tag));

    return commonTags;
}

/**
 * Analyze common parent nodes in the knowledge graph.
 * Finds nodes that reference both start and end nodes (MOC-like relationships).
 */
async function analyzeCommonParents(startId: string, endId: string): Promise<Array<{
    nodeId: string;
    label: string;
    type: string;
    connectionCount: number;
}>> {
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

    // Get all edges for start and end nodes
    const [startEdges, endEdges] = await Promise.all([
        graphEdgeRepo.getAllEdgesForNode(startId, 50),
        graphEdgeRepo.getAllEdgesForNode(endId, 50)
    ]);

    // Find nodes that have edges to BOTH start and end nodes
    // This represents nodes that "contain" or reference both notes
    const startReferrerIds = new Set(
        startEdges
            .filter(edge => edge.to_node_id === startId && edge.from_node_id !== endId)
            .map(edge => edge.from_node_id)
    );

    const endReferrerIds = new Set(
        endEdges
            .filter(edge => edge.to_node_id === endId && edge.from_node_id !== startId)
            .map(edge => edge.from_node_id)
    );

    // Find intersection - nodes that reference both
    const commonParentIds = Array.from(startReferrerIds).filter(id => endReferrerIds.has(id));

    if (commonParentIds.length === 0) return [];

    // Get node details for common parents
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
    const parentNodes = await graphNodeRepo.getByIds(commonParentIds);

    // Build result with connection strength
    const result = commonParentIds.map(parentId => {
        const node = parentNodes.get(parentId);
        if (!node) return null;

        // Calculate connection strength (number of edges between parent and each target)
        const startConnections = startEdges.filter(edge =>
            edge.from_node_id === parentId && edge.to_node_id === startId
        ).length;

        const endConnections = endEdges.filter(edge =>
            edge.from_node_id === parentId && edge.to_node_id === endId
        ).length;

        const connectionCount = startConnections + endConnections;

        let label = node.label;
        if (node.type === 'document') {
            try {
                const attributes = JSON.parse(node.attributes);
                label = attributes.path || label;
            } catch {
                // Keep original label
            }
        }

        return {
            nodeId: parentId,
            label,
            type: node.type,
            connectionCount,
        };
    }).filter(Boolean).sort((a, b) => (b?.connectionCount || 0) - (a?.connectionCount || 0));

    return result as Array<{
        nodeId: string;
        label: string;
        type: string;
        connectionCount: number;
    }>;
}

/**
 * Build analysis section for output with enhanced context analysis.
 */
function buildAnalysisSection(hubs: HubAnalysis[], contextIntersection: ContextIntersectionAnalysis | null): string {
    let section = '';

    // Knowledge Hubs section
    if (hubs.length > 0) {
        section += '\n\n## Knowledge Hubs\n\n';
        section += 'These nodes appear in multiple paths, acting as central connectors:\n\n';
        for (const hub of hubs.slice(0, 3)) {
            section += `- **[[${hub.label}]]** (appears in ${hub.occurrenceCount} paths)\n`;
        }
    }

    // Enhanced Context Analysis section - only show if there's valuable content
    if (contextIntersection) {
        const hasValuableContent = contextIntersection.commonTags.length > 0 ||
                                  contextIntersection.commonParents.length > 0 ||
                                  contextIntersection.physicalAncestor.depth > 1 ||
                                  contextIntersection.isDistant;

        if (hasValuableContent) {
            section += '\n\n## Shared Context Analysis\n\n';

            const physical = contextIntersection.physicalAncestor;

            // Common tags
            if (contextIntersection.commonTags.length > 0) {
                section += `**Common Tags:** ${contextIntersection.commonTags.map(tag => `\`${tag}\``).join(', ')}\n\n`;
            }

            // Common parents (structural relationships)
            if (contextIntersection.commonParents.length > 0) {
                section += '**Common Reference Points:**\n';
                for (const parent of contextIntersection.commonParents.slice(0, 3)) {
                    const nodeLink = parent.type === 'document' ? `[[${parent.label}]]` : `**${parent.label}**`;
                    section += `- ${nodeLink} (${parent.connectionCount} connections)\n`;
                }
                section += '\n';
            }

            // Physical context information (only show if meaningful)
            if (physical.depth > 1) {
                section += `**Shared Location:** Both notes are in \`${physical.ancestorPath}\`\n\n`;
            }

            // Cross-domain insight
            if (contextIntersection.isDistant) {
                section += '**Cross-Domain Insight:** Despite different locations, these notes share ';
                if (contextIntersection.primaryContext) {
                    section += `**${contextIntersection.primaryContext}**`;
                } else {
                    section += 'semantic connections';
                }
                section += '.\n\n';
            }
        }
    }

    return section;
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format paths for user-friendly output.
 */
async function formatPathsForOutput(
    paths: ScoredPath[],
    graphNodeRepo: any
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

    const nodesMap = await graphNodeRepo.getByIds(Array.from(allNodeIds));

    return paths.map(scoredPath => {
        const nodeLabels: string[] = [];

        for (const segment of scoredPath.segments) {
            try {
                const node = nodesMap.get(segment.nodeId);
                if (!node) {
                    nodeLabels.push(segment.nodeId);
                } else if (node.type === 'document') {
                    nodeLabels.push(JSON.parse(node.attributes).path || segment.nodeId);
                } else {
                    nodeLabels.push(node.type + node.label);
                }
            } catch {
                nodeLabels.push(segment.nodeId);
            }
        }

        // Build connection details
        const connectionDetails = scoredPath.segments.slice(0, -1).map((segment, i) => {
            const nextSegment = scoredPath.segments[i + 1];
            const type = segment.type === 'physical_neighbors' && nextSegment.type === 'physical_neighbors'
                ? 'physical'
                : 'semantic';
            const similarity = segment.similarity || nextSegment.similarity;
            return similarity ? `${type} (${similarity})` : type;
        }).join(' → ');

        // Strategy display names
        const strategyNames: Record<StrategyType, string> = {
            reliable: '🔗 Reliable',
            fastTrack: '🚀 Fast Track',
            brainstorm: '💡 Brainstorm',
            temporal: '⏳ Temporal',
        };

        return {
            path: nodeLabels,
            connectionDetails,
            strategy: strategyNames[scoredPath.strategy],
            insightLabel: scoredPath.insightLabel,
            score: scoredPath.score.totalScore,
        };
    });
}
