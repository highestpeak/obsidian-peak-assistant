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
    physicalAncestor: { ancestorPath: string; startPath: string; endPath: string; depth: number };
    commonTags: string[];
    commonParents: Array<{ nodeId: string; label: string; type: string; connectionCount: number }>;
    isDistant: boolean;
    primaryContext?: string;
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
    const paths: ScoredPath[] = [], forbiddenEdges = new Set<string>();
    for (let i = 0; i < 3; i++) {
        const path = await bidirectionalBFS(context.startId, context.endId, forbiddenEdges, false, context.maxHops, context.filters, context.excludedDocIds);
        if (!path) break;
        paths.push({ segments: path, strategy: 'reliable', score: createEmptyScore(), insightLabel: 'This is the most direct logical chain in your knowledge base.', reasoning: 'Pure physical connections provide the most reliable and trustworthy path.' });
        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) forbiddenEdges.add(edgeToBlock); else break;
    }
    return paths;
}

// --- Strategy 2: FastTrack - A* with Semantic Gravity Field ---

/** A* search with semantic gravity field. */
async function fastTrackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    if (!context.startVector || !context.endVector) return [];
    const path = await aStarSearch(context);
    return path ? [{ segments: path, strategy: 'fastTrack', score: createEmptyScore(), insightLabel: 'Through semantic bridging, these two ideas share a common conceptual core.', reasoning: 'A* algorithm found optimal balance between path length and semantic relevance.' }] : [];
}

/** Min-heap for A* open set. */
class MinHeap<T> {
    private h: T[] = [];
    constructor(private key: (t: T) => number) {}
    get length() { return this.h.length; }
    push(v: T) { this.h.push(v); this.bubbleUp(this.h.length - 1); }
    pop(): T | undefined {
        if (!this.h.length) return undefined;
        const top = this.h[0]; const last = this.h.pop()!;
        if (this.h.length) { this.h[0] = last; this.sinkDown(0); }
        return top;
    }
    private bubbleUp(i: number) {
        while (i > 0) { const p = (i - 1) >> 1; if (this.key(this.h[p]) <= this.key(this.h[i])) break; [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p; }
    }
    private sinkDown(i: number) {
        const n = this.h.length;
        while (true) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < n && this.key(this.h[l]) < this.key(this.h[s])) s = l; if (r < n && this.key(this.h[r]) < this.key(this.h[s])) s = r; if (s === i) break; [this.h[s], this.h[i]] = [this.h[i], this.h[s]]; i = s; }
    }
}

/** A* search implementation. */
async function aStarSearch(context: SearchContext): Promise<PathSegment[] | null> {
    const { startId, endId, startVector, endVector, maxHops, filters } = context;
    if (!startVector || !endVector) return null;

    const openSet = new MinHeap<AStarNode>(n => n.fCost);
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, AStarNode>();

    const hCost = await calculateHeuristic(startId, endVector);
    const startNode: AStarNode = { nodeId: startId, gCost: 0, hCost, fCost: hCost, parent: null, connectionType: 'physical_neighbors' };
    openSet.push(startNode);
    nodeMap.set(startId, startNode);

    let step = 0, consecutiveSemanticCount = 0;

    while (openSet.length > 0 && step < maxHops * 50) {
        step++;
        const current = openSet.pop()!;

        if (current.nodeId === endId) return reconstructAStarPath(current);
        closedSet.add(current.nodeId);

        consecutiveSemanticCount = current.connectionType === 'semantic_neighbors' ? consecutiveSemanticCount + 1 : 0;

        let neighbors = await getNeighbors(current.nodeId, 20, consecutiveSemanticCount >= 4 ? 'none' : 'sparse-only', context.excludedDocIds);
        if (filters) {
            const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(neighbors.map(n => n.id), filters);
            neighbors = applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
        }

        for (const neighbor of neighbors) {
            if (closedSet.has(neighbor.id)) continue;

            const edgeWeight = neighbor.foundBy === 'physical_neighbors'
                ? EDGE_WEIGHTS.physical
                : (consecutiveSemanticCount >= 1 ? EDGE_WEIGHTS.consecutiveSemantic : EDGE_WEIGHTS.semantic);

            if (neighbor.foundBy === 'semantic_neighbors' && neighbor.similarity) {
                if (parseFloat(neighbor.similarity) / 100 < SIMILARITY_THRESHOLD) continue;
            }

            const tentativeGCost = current.gCost + edgeWeight;
            const existingNode = nodeMap.get(neighbor.id);

            if (!existingNode) {
                const h = await calculateHeuristic(neighbor.id, endVector);
                const newNode: AStarNode = { nodeId: neighbor.id, gCost: tentativeGCost, hCost: h, fCost: tentativeGCost + h, parent: current, connectionType: neighbor.foundBy, similarity: neighbor.similarity };
                openSet.push(newNode);
                nodeMap.set(neighbor.id, newNode);
            } else if (tentativeGCost < existingNode.gCost) {
                existingNode.gCost = tentativeGCost;
                existingNode.fCost = tentativeGCost + existingNode.hCost;
                existingNode.parent = current;
                existingNode.connectionType = neighbor.foundBy;
                existingNode.similarity = neighbor.similarity;
                openSet.push(existingNode); // re-insert; stale copies ignored via closedSet
            }
        }
    }
    return null;
}

/** A* heuristic: cosine distance to end vector (admissible). */
async function calculateHeuristic(nodeId: string, endVector: number[]): Promise<number> {
    const v = await sqliteStoreManager.getEmbeddingRepo().getEmbeddingForSemanticSearch(nodeId);
    if (!v) return 2.0;
    return Math.max(0, 1 - cosineSimilarity(v, endVector));
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
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
    const path = await bidirectionalBFS(context.startId, context.endId, new Set(), true, Math.max(context.maxHops * 2, 8), context.filters, context.excludedDocIds);
    return path ? [{ segments: path, strategy: 'fastTrack', score: createEmptyScore(), insightLabel: 'Found through extended search - this connection exists but may be indirect.', reasoning: 'Fallback search found this path after other strategies failed. Consider it as a distant connection.' }] : [];
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

        // Check if path crosses domains or has interesting semantic jumps
        const metasMap = await getIndexedDocumentsByIds(path.map(s => s.nodeId));
        const domains = new Set<string>();
        let semCount = 0, semSimSum = 0;
        for (const seg of path) {
            const meta = metasMap.get(seg.nodeId);
            if (meta) domains.add(getParentFolder(meta.path));
            if (seg.type === 'semantic_neighbors') { semCount++; if (seg.similarity) semSimSum += parseFloat(seg.similarity) / 100; }
        }
        const avgSim = semCount > 0 ? semSimSum / semCount : 0;

        if (domains.size > 1 || (semCount > 0 && avgSim > 0.7)) {
            const insightMessage = domains.size > 1
                ? `Crossing ${domains.size} different domains, this connection may spark unexpected inspiration.`
                : `Through creative semantic connections (avg ${Math.round(avgSim * 100)}% similarity), these ideas form an unexpected bridge.`;
            paths.push({ segments: path, strategy: 'brainstorm', score: createEmptyScore(), insightLabel: insightMessage, reasoning: 'Selected for cross-domain exploration and creative connection discovery.' });
        }

        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) brainstormForbiddenEdges.add(edgeToBlock); else break;
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
    const [startMeta, endMeta] = await Promise.all([getIndexedDocumentById(context.startId), getIndexedDocumentById(context.endId)]);
    if (!startMeta || !endMeta) return [];

    const startTime = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTime = endMeta.mtime ?? endMeta.ctime ?? Date.now();
    const path = await temporalBFS(context.startId, context.endId, Math.max(context.maxHops * 1.5, context.maxHops + 2), startTime <= endTime, context.filters, context.excludedDocIds);

    if (!path?.length) return [];
    return [{ segments: path, strategy: 'temporal', score: createEmptyScore(), insightLabel: `This is your thought evolution from ${new Date(startTime).toLocaleDateString()} to ${new Date(endTime).toLocaleDateString()}.`, reasoning: 'Temporal ordering reveals your knowledge development trajectory.' }];
}

/** Apply filters to neighbors if provided. */
async function applyNeighborFilters(neighbors: NeighborNode[], filters?: any): Promise<NeighborNode[]> {
    if (!filters) return neighbors;
    const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(neighbors.map(n => n.id), filters);
    return applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
}

/** BFS with temporal ordering constraint and heuristic pruning. */
async function temporalBFS(
    startId: string, endId: string, maxHops: number, isForward: boolean, filters?: any, excludedDocIds?: Set<string>
): Promise<PathSegment[] | null> {
    type VisitInfo = { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; timestamp: number };
    const visited = new Map<string, VisitInfo>();

    const [startMeta, endMeta] = await Promise.all([getIndexedDocumentById(startId), getIndexedDocumentById(endId)]);
    if (!startMeta || !endMeta) return null;

    const startTimestamp = startMeta.mtime ?? startMeta.ctime ?? Date.now();
    const endTimestamp = endMeta.mtime ?? endMeta.ctime ?? Date.now();
    visited.set(startId, { parentId: null, type: 'physical_neighbors', timestamp: startTimestamp });

    let queue: { id: string; timestamp: number; heuristicScore: number }[] = [{ id: startId, timestamp: startTimestamp, heuristicScore: 0 }];
    const TIME_WINDOW_HOURS = 24 * 7, TIMEOUT_MS = 3000, startTime = Date.now();

    for (let hops = 0; queue.length > 0 && hops < maxHops; hops++) {
        if (Date.now() - startTime > TIMEOUT_MS) break;
        queue.sort((a, b) => a.heuristicScore - b.heuristicScore);
        const currentLevel = queue.slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);
        queue = queue.slice(5);
        const nextQueue: typeof queue = [];

        for (const current of currentLevel) {
            const neighbors = await applyNeighborFilters(await getNeighbors(current.id, 10, 'sparse-only', excludedDocIds), filters);
            const metasMap = await getIndexedDocumentsByIds(neighbors.map(n => n.id));

            const scored = neighbors
                .filter(n => {
                    if (visited.has(n.id)) return false;
                    const m = metasMap.get(n.id); if (!m) return false;
                    const diff = ((m.mtime ?? m.ctime ?? Date.now()) - current.timestamp) / 3600000;
                    return isForward ? diff >= -TIME_WINDOW_HOURS : diff <= TIME_WINDOW_HOURS;
                })
                .map(n => {
                    const t = (metasMap.get(n.id)!.mtime ?? metasMap.get(n.id)!.ctime ?? Date.now());
                    return { neighbor: n, neighborTime: t, heuristicScore: Math.abs(t - endTimestamp) / 3600000 };
                })
                .sort((a, b) => a.heuristicScore - b.heuristicScore)
                .slice(0, SLICE_CAPS.inspector.pathFindQueueLevel);

            for (const { neighbor, neighborTime, heuristicScore } of scored) {
                visited.set(neighbor.id, { parentId: current.id, type: neighbor.foundBy, timestamp: neighborTime });
                if (neighbor.id === endId) return reconstructVisitedPath(endId, visited);
                nextQueue.push({ id: neighbor.id, timestamp: neighborTime, heuristicScore });
            }
        }
        queue = nextQueue;
    }
    return null;
}

/** Reconstruct path from visited map (used by temporal and bidirectional). */
function reconstructVisitedPath<T extends { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors' }>(
    endId: string, visited: Map<string, T>
): PathSegment[] {
    const path: PathSegment[] = [];
    let currentId: string | null = endId;
    while (currentId) {
        const info = visited.get(currentId); if (!info) break;
        path.unshift({ nodeId: currentId, type: info.type, timestamp: (info as any).timestamp, similarity: (info as any).similarity });
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
    forbiddenEdges: Set<string>, includeSemantic: boolean, filters?: any, avoidFolder?: string | null, excludedDocIds?: Set<string>
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = await getNeighbors(currentId, 20, includeSemantic ? 'always' : 'none', excludedDocIds);

        if (avoidFolder) {
            const metasMap = await getIndexedDocumentsByIds(neighbors.map(n => n.id));
            neighbors = neighbors
                .map(n => ({ ...n, folder: metasMap.get(n.id) ? getParentFolder(metasMap.get(n.id)!.path) : '' }))
                .sort((a, b) => (a.folder === avoidFolder ? 1 : 0) - (b.folder === avoidFolder ? 1 : 0));
        }

        neighbors = await applyNeighborFilters(neighbors, filters);

        for (const neighbor of neighbors) {
            if (forbiddenEdges.has(`${currentId}->${neighbor.id}`)) continue;
            if (!myVisited.has(neighbor.id)) {
                myVisited.set(neighbor.id, { parentId: currentId, type: neighbor.foundBy, similarity: neighbor.similarity });
                nextQueue.push(neighbor.id);
                if (otherVisited.has(neighbor.id)) return { found: true, intersectId: neighbor.id };
            }
        }
    }

    queue.length = 0;
    queue.push(...nextQueue);
    return { found: false };
}

// --- Neighbor Retrieval ---

/** Get physical neighbors, optionally excluding doc IDs. */
async function getPhysicalNeighbors(nodeId: string, limit = 20, excludedDocIds?: Set<string>): Promise<NeighborNode[]> {
    const edges = await sqliteStoreManager.getMobiusEdgeRepo().getAllEdgesForNode(nodeId, limit);
    const seen = new Set<string>(), result: NeighborNode[] = [];
    for (const e of edges) {
        const nid = e.from_node_id === nodeId ? e.to_node_id : e.from_node_id;
        if (!excludedDocIds?.has(nid) && !seen.has(nid)) { seen.add(nid); result.push({ id: nid, foundBy: 'physical_neighbors' }); }
    }
    return result;
}

/** Get neighbors with configurable semantic inclusion ('none' | 'always' | 'sparse-only'). */
async function getNeighbors(nodeId: string, limit = 20, semanticMode: 'none' | 'always' | 'sparse-only' = 'none', excludedDocIds?: Set<string>): Promise<NeighborNode[]> {
    const physical = await getPhysicalNeighbors(nodeId, limit, excludedDocIds);
    const neighbors: NeighborNode[] = [...physical];
    if (semanticMode === 'always' || (semanticMode === 'sparse-only' && physical.length < 3)) {
        const excludeIds = new Set(physical.map(n => n.id));
        if (excludedDocIds) excludedDocIds.forEach(id => excludeIds.add(id));
        const semLimit = semanticMode === 'sparse-only' ? 15 : Math.max(5, limit - neighbors.length);
        for (const n of await getSemanticNeighbors(nodeId, semLimit, excludeIds)) {
            if (!excludedDocIds?.has(n.id)) neighbors.push({ id: n.id, foundBy: 'semantic_neighbors', similarity: n.similarity });
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
    const startPath = reconstructVisitedPath(intersectId, startVisited);
    // End path: walk from intersection toward end, then append (skip intersection to avoid duplicate)
    const endPath: PathSegment[] = [];
    let currentId: string | null = intersectId;
    while (currentId) {
        const info = endVisited.get(currentId); if (!info) break;
        endPath.push({ nodeId: currentId, type: info.type, similarity: info.similarity });
        currentId = info.parentId;
    }
    return endPath.length > 1 ? [...startPath, ...endPath.slice(1)] : startPath;
}

// --- Path Quality Evaluation ---

/** Create empty score structure. */
function createEmptyScore(): PathScore {
    return { totalScore: 0, physicalRatio: 0, avgSimilarity: 0, uniqueness: 1, freshness: 0, domainJumps: 0, length: 0 };
}

/** Score all paths based on quality dimensions. */
async function scorePaths(paths: ScoredPath[], allPaths: ScoredPath[]): Promise<ScoredPath[]> {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const now = Date.now(), oneMonthMs = 30 * 24 * 60 * 60 * 1000;

    for (const path of paths) {
        const { segments } = path;
        const length = segments.length - 1;
        const physicalCount = segments.filter(s => s.type === 'physical_neighbors').length;
        const physicalRatio = length > 0 ? (physicalCount - 1) / length : 1;
        const semSegs = segments.filter(s => s.type === 'semantic_neighbors' && s.similarity);
        const avgSimilarity = semSegs.length > 0 ? semSegs.reduce((sum, s) => sum + parseFloat(s.similarity!) / 100, 0) / semSegs.length : 0;
        const uniqueness = calculateUniqueness(segments, allPaths);

        const nodeIds = segments.map(s => s.nodeId);
        const statsMap = await mobiusNodeRepo.getByDocIds(nodeIds);
        let freshnessSum = 0;
        for (const id of nodeIds) {
            const s = statsMap.get(id);
            freshnessSum += s?.last_open_ts ? Math.max(0, 1 - (now - s.last_open_ts) / oneMonthMs) : 0.5;
        }
        const freshness = nodeIds.length > 0 ? freshnessSum / nodeIds.length : 0;
        const domainJumps = await countDomainJumps(segments);

        const totalScore = physicalRatio * SCORE_WEIGHTS.physicalRatio * 100 + freshness * SCORE_WEIGHTS.freshness * 100
            + Math.min(domainJumps, 3) / 3 * SCORE_WEIGHTS.domainJumps * 100 + uniqueness * SCORE_WEIGHTS.uniqueness * 100
            - length * SCORE_WEIGHTS.lengthPenalty * 10;

        path.score = { totalScore, physicalRatio, avgSimilarity, uniqueness, freshness, domainJumps, length };
    }
    return paths;
}

/** Generate reasoning for path selection. */
function generatePathReasoning(path: ScoredPath): string {
    const { physicalRatio, freshness, domainJumps, uniqueness, length } = path.score;
    const r: string[] = [];
    if (physicalRatio > 0.8) r.push('High physical connectivity ensures reliability');
    else if (physicalRatio > 0.5) r.push('Balanced physical and semantic connections');
    else r.push('Creative semantic bridging for discovery');
    if (freshness > 0.7) r.push('Includes recently accessed knowledge');
    if (domainJumps > 0) r.push(`Crosses ${domainJumps} knowledge domains`);
    if (uniqueness > 0.8) r.push('Unique path not overlapping with others');
    if (length <= 3) r.push('Direct and concise connection');
    return r.length > 0 ? r.join('. ') + '.' : 'Selected for balanced quality metrics.';
}

/** Calculate path uniqueness compared to other paths. */
function calculateUniqueness(segments: PathSegment[], allPaths: ScoredPath[]): number {
    const myNodes = new Set(segments.map(s => s.nodeId));
    let maxOverlap = 0;
    for (const other of allPaths) {
        if (other.segments === segments) continue;
        const otherNodes = new Set(other.segments.map(s => s.nodeId));
        let overlap = 0;
        for (const node of myNodes) if (otherNodes.has(node)) overlap++;
        maxOverlap = Math.max(maxOverlap, overlap / Math.max(myNodes.size, otherNodes.size));
    }
    return 1 - maxOverlap;
}

/** Count folder transitions in path. */
async function countDomainJumps(segments: PathSegment[]): Promise<number> {
    const metasMap = await getIndexedDocumentsByIds(segments.map(s => s.nodeId));
    let jumps = 0, prevFolder: string | null = null;
    for (const seg of segments) {
        const meta = metasMap.get(seg.nodeId); if (!meta) continue;
        const folder = getParentFolder(meta.path);
        if (prevFolder !== null && folder !== prevFolder) jumps++;
        prevFolder = folder;
    }
    return jumps;
}

// --- Utility Functions ---

/** Identify key edge for diversity blocking. */
function identifyKeyEdge(path: PathSegment[]): string {
    if (path.length < 2) return '';
    const parseSim = (s?: string) => { if (!s) return 0; const v = parseFloat(s.replace('%', '')); return isNaN(v) ? 0 : v; };
    let bestEdge = '', bestScore = -1;
    for (let i = 0; i < path.length - 1; i++) {
        const c = path[i], n = path[i + 1];
        const maxSim = Math.max(parseSim(c.similarity), parseSim(n.similarity));
        const bothPhysical = c.type === 'physical_neighbors' && n.type === 'physical_neighbors';
        const bothSemantic = c.type === 'semantic_neighbors' && n.type === 'semantic_neighbors';
        const score = bothPhysical ? 100 + maxSim : bothSemantic ? maxSim : 50 + maxSim * 0.5;
        if (score > bestScore) { bestScore = score; bestEdge = `${c.nodeId}->${n.nodeId}`; }
    }
    return bestEdge;
}

/** Deduplicate paths based on node sequence. */
function deduplicatePaths(paths: ScoredPath[]): ScoredPath[] {
    const seen = new Set<string>();
    return paths.filter(p => { const k = p.segments.map(s => s.nodeId).join('->'); return seen.has(k) ? false : (seen.add(k), true); });
}

/** Ensure at least one path from each strategy type is included. */
function ensureStrategyDiversity(paths: ScoredPath[], maxResults: number): ScoredPath[] {
    const byStrategy = new Map<StrategyType, ScoredPath[]>();
    for (const p of paths) (byStrategy.get(p.strategy) ?? (byStrategy.set(p.strategy, []), byStrategy.get(p.strategy)!)).push(p);

    const result: ScoredPath[] = [];
    for (const s of ['reliable', 'fastTrack', 'brainstorm', 'temporal'] as StrategyType[]) {
        const arr = byStrategy.get(s);
        if (arr?.length && result.length < maxResults) result.push(arr.shift()!);
    }
    const remaining = paths.filter(p => !result.includes(p)).sort((a, b) => b.score.totalScore - a.score.totalScore);
    for (const p of remaining) { if (result.length >= maxResults) break; result.push(p); }
    return result;
}

// --- Post-Processing Analysis ---

/** Analyze hub nodes that appear in multiple paths. */
function analyzeHubs(paths: ScoredPath[]): HubAnalysis[] {
    const nodeCount = new Map<string, number>();
    for (const p of paths) for (let i = 1; i < p.segments.length - 1; i++) {
        const id = p.segments[i].nodeId; nodeCount.set(id, (nodeCount.get(id) || 0) + 1);
    }
    return Array.from(nodeCount.entries())
        .filter(([, c]) => c >= 2)
        .map(([nodeId, count]) => ({ nodeId, label: nodeId, occurrenceCount: count, betweennessCentrality: count / paths.length }))
        .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/** Analyze context intersection between two notes (paths, tags, graph structure). */
async function analyzeContextIntersection(startId: string, endId: string): Promise<ContextIntersectionAnalysis | null> {
    const [startMeta, endMeta] = await Promise.all([getIndexedDocumentById(startId), getIndexedDocumentById(endId)]);
    if (!startMeta || !endMeta) return null;

    const physicalAncestor = analyzePhysicalAncestor(startMeta.path, endMeta.path);
    const commonTags = analyzeTagIntersection(startMeta.tags, endMeta.tags);
    const commonParents = await analyzeCommonParents(startId, endId);
    const isDistant = physicalAncestor.depth <= 1 && (commonTags.length > 0 || commonParents.length > 0);
    const primaryContext = commonTags[0] ?? commonParents[0]?.label;

    return { physicalAncestor, commonTags, commonParents, isDistant, primaryContext };
}

/** Analyze physical path ancestor. */
function analyzePhysicalAncestor(startPath: string, endPath: string) {
    const sp = startPath.split('/'), ep = endPath.split('/');
    const commonParts: string[] = [];
    for (let i = 0; i < Math.min(sp.length, ep.length) && sp[i] === ep[i]; i++) commonParts.push(sp[i]);
    return { ancestorPath: commonParts.length > 0 ? commonParts.join('/') : '/', startPath, endPath, depth: commonParts.length };
}

/** Analyze tag intersection between two documents. */
function analyzeTagIntersection(startTags: string | null, endTags: string | null): string[] {
    if (!startTags || !endTags) return [];
    const parse = (raw: string): string[] => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return raw.split(',').map(t => t.trim()).filter(t => t.length > 0); } };
    return parse(startTags).filter(tag => parse(endTags).includes(tag));
}

/** Find common parent nodes that reference both start and end nodes. */
async function analyzeCommonParents(startId: string, endId: string) {
    const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const [startEdges, endEdges] = await Promise.all([edgeRepo.getAllEdgesForNode(startId, 50), edgeRepo.getAllEdgesForNode(endId, 50)]);
    const startRefs = new Set(startEdges.filter(e => e.to_node_id === startId && e.from_node_id !== endId).map(e => e.from_node_id));
    const endRefs = new Set(endEdges.filter(e => e.to_node_id === endId && e.from_node_id !== startId).map(e => e.from_node_id));
    const commonIds = Array.from(startRefs).filter(id => endRefs.has(id));
    if (!commonIds.length) return [];

    const parentNodes = await sqliteStoreManager.getMobiusNodeRepo().getByIds(commonIds);
    return commonIds
        .map(id => { const n = parentNodes.get(id); if (!n) return null; return { nodeId: id, label: getNodeLabel(n, n.label), type: n.type, connectionCount: startEdges.filter(e => e.from_node_id === id && e.to_node_id === startId).length + endEdges.filter(e => e.from_node_id === id && e.to_node_id === endId).length }; })
        .filter(Boolean)
        .sort((a, b) => (b?.connectionCount || 0) - (a?.connectionCount || 0)) as Array<{ nodeId: string; label: string; type: string; connectionCount: number }>;
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
async function formatPathsForOutput(paths: ScoredPath[], mobiusNodeRepo: any) {
    const allNodeIds = new Set<string>();
    for (const p of paths) for (const s of p.segments) allNodeIds.add(s.nodeId);
    const nodesMap = await mobiusNodeRepo.getByIds(Array.from(allNodeIds));

    return paths.map(sp => ({
        path: sp.segments.map(s => getNodeLabel(nodesMap.get(s.nodeId), s.nodeId)),
        connectionDetails: sp.segments.slice(0, -1).map((seg, i) => {
            const next = sp.segments[i + 1];
            const type = seg.type === 'physical_neighbors' && next.type === 'physical_neighbors' ? 'physical' : 'semantic';
            const sim = seg.similarity || next.similarity;
            return sim ? `${type} (${sim})` : type;
        }).join(' → '),
        strategy: STRATEGY_NAMES[sp.strategy],
        insightLabel: sp.insightLabel,
        score: sp.score.totalScore,
    }));
}
