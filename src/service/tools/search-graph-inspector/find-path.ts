import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GRAPH_INSPECT_STEP_TIME_LIMIT } from "@/core/constant";
import { PATH_FINDING_CONSTANTS } from "@/core/constant";
import { buildResponse, withTimeoutMessage } from "../types";
import { template as GRAPH_PATH_FINDING_TEMPLATE } from "../templates/graph-path-finding";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";

/**
 * Architecture Design Philosophy:
 *
 * 1. Multi-layer Algorithm Stack:
 *    findPath (High-level API) → findHybridPaths (Diversity) → bidirectionalSearch (Single Path) → expandFrontier (Expansion)
 *
 * 2. Progressive Search Strategy:
 *    - Phase 1: Bidirectional BFS finds the most direct path
 *    - Phase 2: Forbidden edge iteration discovers diverse paths
 *    - Phase 3: Result sorting and formatted display
 *
 * 3. Hybrid Connection Model:
 *    - Physical connections: Ensure path reliability and intuitiveness
 *    - Semantic connections: Provide innovation and discovery surprises
 *
 * 4. User Experience Optimization:
 *    - Smart limits: Control search depth and result quantity
 *    - Rich output: Returns not just paths, but also connection types and similarity information
 *    - Format friendly: Uses Obsidian link syntax for easy click-through navigation
 *
 * Core Innovations:
 * - Transforms traditional "shortest path" problem into "diversity association discovery" problem
 * - Fuses graph theory algorithms with semantic search, breaking limitations of traditional graph search
 * - Achieves shift from "deterministic" to "exploratory" thinking through iterative forbidden strategies
 * 
 * Application Value:
 * - Knowledge Discovery: Find implicit associations between notes
 * - Creative Inspiration: Explore connection paths of different thinking approaches
 * - Graph Analysis: Understand diverse connection patterns in knowledge structures
 *
 * @param params Search parameters including start point, end point, limits, etc.
 */
export async function findPath(params: any) {
    const { start_note_path, end_note_path, limit, include_semantic_paths, response_format, filters } = params;
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();

    // Find start and end nodes
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

    // Core Search Execution - Using Hybrid Bidirectional BFS with Timeout
    // Design Decision: Choose default iterations, balancing diversity and performance
    // - 1st: Find the most direct path
    // - 2nd: Discover one alternative path
    // - 3rd: Provide additional exploration perspective
    const timeoutResult = await withTimeoutMessage(
        findHybridPaths({
            startId: startNode.id,
            endId: endNode.id,
            // Limit iterations to prevent excessive computation
            iterations: Math.min(
                PATH_FINDING_CONSTANTS.DEFAULT_ITERATIONS,
                limit ?? PATH_FINDING_CONSTANTS.DEFAULT_ITERATIONS
            ),
            includeSemantic: include_semantic_paths,
            // Limit hops to prevent semantic drift too far
            maxHops: PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
            filters: filters
        }),
        GRAPH_INSPECT_STEP_TIME_LIMIT,
        `Path finding from "${start_note_path}" to "${end_note_path}"`
    );
    // Handle timeout case gracefully
    if (!timeoutResult.success) {
        return `# Path Finding Timeout\n\n**${timeoutResult.message}**\n\n`
            + `Try these solutions:\n`
            + `- Reduce search complexity by using notes with fewer connections\n`
            + `- Disable semantic path finding if enabled\n`
            + `- Choose different start/end notes with clearer relationships\n`
            + `- The search may be exploring too many possible paths`;
    }
    const originalHybirdPath = timeoutResult.data;

    // Path Post-processing - Convert internal representation to user-friendly format
    // Design Philosophy:
    // 1. Convert internal nodeId to user-visible labels
    // 2. Preserve detailed path segment information for subsequent analysis
    // 3. Support backward-compatible simple path array format

    // Batch fetch all nodes to optimize database performance
    const allNodeIds = new Set<string>();
    for (const pathSegments of originalHybirdPath) {
        for (const segment of pathSegments) {
            allNodeIds.add(segment.nodeId);
        }
    }
    const nodesMap = await graphNodeRepo.getByIds(Array.from(allNodeIds));
    // Backward compatibility: Simple label arrays
    const paths: string[][] = [];
    // Enhanced format: Includes connection types
    const detailedPaths: Array<{ path: string[]; segments: PathSegment[] }> = [];
    for (const pathSegments of originalHybirdPath) {
        const nodeLabels: string[] = [];

        // Use pre-fetched nodes map - no additional database calls
        for (const segment of pathSegments) {
            const node = nodesMap.get(segment.nodeId);
            const label = node?.label || segment.nodeId; // Fallback: Use ID if node doesn't exist
            nodeLabels.push(label);
        }

        paths.push(nodeLabels);
        detailedPaths.push({
            path: nodeLabels,
            segments: pathSegments // Preserve original segment information for type analysis
        });
    }

    // Result Formatting - Generate user/AI-friendly Markdown output using template
    // Design Philosophy:
    // 1. Use template-based rendering for cleaner separation of logic and presentation
    // 2. Prepare data structure outside template to keep template simple
    // 3. Use Obsidian link syntax [[ ]] for easy click-through navigation
    // 4. Clearly annotate connection types for each path (physical/semantic)

    // Prepare template data - move complex logic out of template
    const templatePaths = detailedPaths.slice(0, limit).map((pathData, index) => {
        // Path string: Connect nodes with arrows
        const pathString = pathData.path.map(node => `[[${node}]]`).join(' → ');

        // Connection details: Analyze type and similarity for each connection segment
        const connectionDetails = pathData.segments.slice(0, -1).map((segment, i) => {
            const nextSegment = pathData.segments[i + 1];

            // Connection type determination: Only when adjacent segments are both physical connections
            const type = segment.type === 'physical_neighbors' && nextSegment.type === 'physical_neighbors'
                ? 'physical'
                : 'semantic';

            // Similarity information: Take whichever valid similarity from the two segments
            const similarity = segment.similarity || nextSegment.similarity;
            return similarity ? `${type} (${similarity})` : type;
        }).join(' → ');

        return {
            index: index + 1,
            steps: pathData.path.length - 1,
            pathString,
            connectionDetails
        };
    });

    // Render template
    return buildResponse(response_format, GRAPH_PATH_FINDING_TEMPLATE, {
        start_note_path,
        end_note_path,
        paths: templatePaths
    });
}

/**
 * Neighbor Node Definition - Supports both physical and semantic connection types
 * Design: Unified interface to handle different types of neighbors for algorithm reusability
 */
export interface NeighborNode {
    id: string;
    foundBy: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string; // Only semantic neighbors include similarity information
}

/**
 * Bidirectional Search Result - Indicates if intersection point was found
 * Design: Core output of bidirectional search, containing collision detection results
 */
interface BidirectionalSearchResult {
    found: boolean;      // Whether path was found (search frontiers meet)
    intersectId?: string; // Node ID of the intersection point
}

/**
 * Path Segment - Fully records connection information for each segment of the path
 * Design: Supports path backtracking and type annotation for subsequent analysis and display
 */
interface PathSegment {
    nodeId: string;
    type: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

/**
 * Find diverse paths - Iterative bidirectional hybrid BFS
 *
 * Design Philosophy:
 * 1. Iterative search strategy: Discover diverse paths through multiple bidirectional searches + forbidden edge mechanism
 * 2. Heuristic diversity: Not random search, but intelligently explore different path branches
 * 3. Balance performance and richness: Default 3 iterations, balancing result diversity with computational cost
 * 4. Adaptive hop limits: Adjust maximum hop limits based on whether semantic search is included
 *
 * Innovations:
 * - Traditional path finding finds only one "shortest" path, we find multiple "most interesting" paths
 * - Forbidden edge mechanism forces algorithm to explore different "dimensions" of knowledge graphs
 * - Combines physical reliability with semantic innovation for comprehensive association insights
 *
 * Application Scenarios:
 * - Knowledge Discovery: Find implicit associations between notes
 * - Creative Inspiration: Explore connection paths of different thinking approaches
 * - Graph Analysis: Understand diverse connection patterns in knowledge structures
 * 
 * @param params.maxhops - when over this hops, the semantic drift is too serious, the paths found are not meaningful
 */
async function findHybridPaths(params: {
    startId: string;
    endId: string;
    iterations?: number;
    includeSemantic?: boolean;
    maxHops?: number;
    filters?: any;
}): Promise<PathSegment[][]> {
    const {
        startId, endId,
        iterations = PATH_FINDING_CONSTANTS.DEFAULT_ITERATIONS,
        includeSemantic,
        maxHops = PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
        filters
    } = params;
    const forbiddenEdges = new Set<string>();
    const finalPaths: PathSegment[][] = [];

    for (let i = 0; i < iterations; i++) {
        const path = await bidirectionalSearch(startId, endId, forbiddenEdges, includeSemantic, maxHops, filters);

        if (!path) break;

        finalPaths.push(path);

        // Block a key edge to find diverse paths
        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) {
            forbiddenEdges.add(edgeToBlock);
        } else {
            break; // No more edges to block
        }
    }

    return finalPaths;
}

/**
 * Identify key edge for diversity blocking - Heuristic edge selection strategy
 *
 * Design Philosophy:
 * 1. Diversity goal: First search finds the most direct path, subsequent iterations need to explore alternative paths
 * 2. Smart selection: Prioritize blocking high-value edges to force algorithm exploration of alternative routes
 * 3. Scoring strategy:
 *    - physical: physical node → physical node (score = 100 + similarity%)
 *    - semantic: semantic node → semantic node (score = similarity%)
 *    - mix: physical node → semantic node (score = 50 + similarity% × 0.5)
 *    - Higher score = more important edge to block for diversity
 * 4. Selection criteria: Choose the edge with highest "blocking value" to maximize path diversity
 *
 * This design ensures:
 * - First iteration finds the most natural path
 * - Subsequent iterations are forced to explore more circuitous but potentially more interesting paths
 * - Important connections are preserved while still enabling diversity
 */
function identifyKeyEdge(path: PathSegment[]): string {
    if (path.length < 2) return '';

    // Helper function to parse similarity percentage string to number
    const parseSimilarity = (similarity?: string): number => {
        if (!similarity) return 0;
        const numericStr = similarity.replace('%', '');
        const parsed = parseFloat(numericStr);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Helper function to calculate edge blocking score
    const calculateEdgeScore = (segment1: PathSegment, segment2: PathSegment): number => {
        const sim1 = parseSimilarity(segment1.similarity);
        const sim2 = parseSimilarity(segment2.similarity);

        // Physical edges get high base score + similarity bonus if available
        if (segment1.type === 'physical_neighbors' && segment2.type === 'physical_neighbors') {
            return 100 + Math.max(sim1, sim2); // Base 100 for physical-physical
        }

        // Semantic edges score based on similarity
        if (segment1.type === 'semantic_neighbors' && segment2.type === 'semantic_neighbors') {
            return Math.max(sim1, sim2); // Pure semantic score
        }

        // Mixed edges: physical gets higher weight, semantic contributes similarity
        if (segment1.type === 'physical_neighbors' || segment2.type === 'physical_neighbors') {
            const physicalBonus = 50;
            const semanticScore = Math.max(sim1, sim2);
            return physicalBonus + semanticScore * 0.5; // Mixed edge score
        }

        // Fallback for any other combination
        return Math.max(sim1, sim2);
    };

    let bestEdge = '';
    let bestScore = -1;

    // Evaluate all edges in the path
    for (let i = 0; i < path.length - 1; i++) {
        const current = path[i];
        const next = path[i + 1];
        const edgeKey = `${current.nodeId}->${next.nodeId}`;
        const edgeScore = calculateEdgeScore(current, next);

        // Choose the edge with highest blocking score
        if (edgeScore > bestScore) {
            bestScore = edgeScore;
            bestEdge = edgeKey;
        }
    }

    return bestEdge;
}

/**
 * Core bidirectional BFS search algorithm - Find single path
 *
 * Design Philosophy:
 * 1. Bidirectional search strategy: Start from both start and end points simultaneously, avoiding exponential expansion of unidirectional search
 * 2. Hybrid neighbor exploration: Each expansion step considers both physical and semantic connections
 * 3. Hop limit: Prevent semantic drift too far leading to unreliable results (default 5 hops)
 * 4. Forbidden edge mechanism: Allows higher-level algorithms to implement diverse path discovery
 *
 * Key Advantages:
 * - Up to 2x faster than unidirectional BFS in worst case
 * - Can discover semantic paths that traditional graph search cannot find
 * - Maintains result relevance through hop limits
 *
 * @param startId Start node ID
 * @param endId End node ID
 * @param forbiddenEdges Set of disabled edges (for diversity search)
 * @param includeSemantic Whether to include semantic neighbors
 * @param maxHops Maximum search hop limit
 */
async function bidirectionalSearch(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean = true,
    maxHops: number = PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
    filters?: any
): Promise<PathSegment[] | null> {
    const startVisited = new Map([
        [startId, { parentId: null, type: 'physical_neighbors' as const }]
    ]);
    const endVisited = new Map([
        [endId, { parentId: null, type: 'physical_neighbors' as const }]
    ]);

    let startQueue = [startId];
    let endQueue = [endId];
    let hops = 0;

    while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
        // Expand from start
        const startResult = await expandFrontier(startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters);
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        // Expand from end
        const endResult = await expandFrontier(endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters);
        if (endResult.found && endResult.intersectId) {
            return reconstructPath(endResult.intersectId, startVisited, endVisited);
        }

        hops++;
    }

    return null;
}

/**
 * Expand search frontier - Core step of bidirectional BFS
 *
 * Design Philosophy:
 * 1. Key to bidirectional search: Expand from both ends toward the middle, theoretically 50% faster than unidirectional search
 * 2. Collision detection: Stop immediately and reconstruct path when visited records from both sides intersect
 * 3. Forbidden edge handling: Use forbiddenEdges to avoid re-exploring the same path branches
 * 4. Priority strategy: Physical neighbors prioritized for enqueueing, ensuring algorithm doesn't fall into semantic drift too early
 *
 * Algorithm Complexity: O(b^d/2) where b is branching factor, d is depth
 */
async function expandFrontier(
    queue: string[],
    myVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    otherVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    filters?: any
): Promise<BidirectionalSearchResult> {
    const currentId = queue.shift();
    if (!currentId) return { found: false };

    let neighbors = await getMixedNeighbors(currentId, includeSemantic);
    if (filters) {
        const itemFiledGetter = await getDefaultItemFiledGetter<NeighborNode>(neighbors.map(neighbor => neighbor.id), filters);
        neighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFiledGetter);
    }

    for (const neighbor of neighbors) {
        const edgeKey = `${currentId}->${neighbor.id}`;
        if (forbiddenEdges.has(edgeKey)) continue;

        if (!myVisited.has(neighbor.id)) {
            myVisited.set(neighbor.id, {
                parentId: currentId,
                type: neighbor.foundBy,
                similarity: neighbor.similarity
            });
            queue.push(neighbor.id);

            // Check for intersection
            if (otherVisited.has(neighbor.id)) {
                return { found: true, intersectId: neighbor.id };
            }
        }
    }

    return { found: false };
}

/**
 * Get mixed neighbor nodes - Physical connections + Semantic similarity
 *
 * Design Philosophy:
 * 1. Physical neighbors: Retrieved via graph database edge relationships, ensuring path "reliability"
 * 2. Semantic neighbors: Discover implicit associations through vector similarity, achieving "semantic bridging"
 * 3. Balance strategy: Prioritize physical neighbors, use semantic neighbors as supplement to avoid excessive drift
 *
 * @param nodeId Starting node ID
 * @param includeSemantic Whether to include semantic neighbors
 * @param limit Maximum number of neighbors limit
 */
async function getMixedNeighbors(nodeId: string, includeSemantic: boolean = true, limit: number = 20, filters?: any): Promise<NeighborNode[]> {
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
    const neighbors: NeighborNode[] = [];

    // Get physical neighbors (bidirectional)
    const physicalEdges = await graphEdgeRepo.getAllEdgesForNode(nodeId, limit);
    const physicalNeighborIds = new Set<string>();

    for (const edge of physicalEdges) {
        if (edge.from_node_id === nodeId && !physicalNeighborIds.has(edge.to_node_id)) {
            physicalNeighborIds.add(edge.to_node_id);
            neighbors.push({
                id: edge.to_node_id,
                foundBy: 'physical_neighbors'
            });
        } else if (edge.to_node_id === nodeId && !physicalNeighborIds.has(edge.from_node_id)) {
            physicalNeighborIds.add(edge.from_node_id);
            neighbors.push({
                id: edge.from_node_id,
                foundBy: 'physical_neighbors'
            });
        }
    }

    // Get semantic neighbors if requested
    if (includeSemantic) {
        const semanticNeighbors = await getSemanticNeighbors(nodeId, Math.max(5, limit - neighbors.length), physicalNeighborIds);
        for (const neighbor of semanticNeighbors) {
            neighbors.push({
                id: neighbor.id,
                foundBy: 'semantic_neighbors',
                similarity: neighbor.similarity
            });
        }
    }

    return neighbors;
}

/**
 * Reconstruct complete path - Assemble path from bidirectional search results
 *
 * Design Philosophy:
 * 1. Bidirectional search advantage: Both start-to-intersection and intersection-to-end paths can be extracted directly from visit records
 * 2. Path concatenation: Careful handling of intersection point to avoid duplication
 * 3. Type information preservation: Fully preserve connection types for each path segment for subsequent analysis
 * 4. Direction correctness: Ensure path direction is from start to end
 *
 * Time Complexity: O(path_length) - typically small since knowledge graphs have short average path lengths
 */
function reconstructPath(
    intersectId: string,
    startVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    endVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>
): PathSegment[] {
    const path: PathSegment[] = [];

    // Reconstruct path from start to intersection
    let currentId: string | null = intersectId;
    const startPath: PathSegment[] = [];

    while (currentId !== null) {
        const visitInfo = startVisited.get(currentId);
        if (!visitInfo) break;

        startPath.unshift({
            nodeId: currentId,
            type: visitInfo.type,
            similarity: visitInfo.similarity
        });

        currentId = visitInfo.parentId;
    }

    // Reconstruct path from intersection to end (in reverse)
    currentId = intersectId;
    const endPath: PathSegment[] = [];

    while (currentId !== null) {
        const visitInfo = endVisited.get(currentId);
        if (!visitInfo) break;

        endPath.push({
            nodeId: currentId,
            type: visitInfo.type,
            similarity: visitInfo.similarity
        });

        currentId = visitInfo.parentId;
    }

    // Combine paths (avoid duplicating intersection node)
    path.push(...startPath);
    if (endPath.length > 1) {
        path.push(...endPath.slice(1));
    }

    return path;
}
