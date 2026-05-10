import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { SLICE_CAPS } from "@/core/constant";
import { getSemanticNeighbors, applyFiltersAndSorters, getDefaultItemFiledGetter } from "../common";
import type { IndexedDocumentRecord } from "@/core/storage/sqlite/ddl";

// ============================================================================
// Type Definitions
// ============================================================================

/** Connection types between nodes */
export type ConnectionType = 'physical' | 'semantic';

/** Path segment with full connection metadata */
export interface PathSegment {
    nodeId: string;
    type: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

/** Neighbor node for graph traversal */
export interface NeighborNode {
    id: string;
    foundBy: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

/** Search strategy identifier */
export type StrategyType = 'reliable' | 'fastTrack' | 'brainstorm';

/** Path with strategy metadata and quality score */
export interface ScoredPath {
    segments: PathSegment[];
    strategy: StrategyType;
    score: PathScore;
    insightLabel: string;
    reasoning: string;
}

/** Multi-dimensional path quality score */
export interface PathScore {
    totalScore: number;
    physicalRatio: number;
    avgSimilarity: number;
    uniqueness: number;
    freshness: number;
    domainJumps: number;
    length: number;
}

/** Search context for all strategies */
export interface SearchContext {
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
export interface HubAnalysis {
    nodeId: string;
    label: string;
    occurrenceCount: number;
    betweennessCentrality: number;
}

/** Common ancestor analysis result */
export interface CommonAncestorAnalysis {
    ancestorPath: string;
    startPath: string;
    endPath: string;
    depth: number;
}

/** Enhanced context intersection analysis result */
export interface ContextIntersectionAnalysis {
    physicalAncestor: {
        ancestorPath: string;
        startPath: string;
        endPath: string;
        depth: number;
    };
    commonTags: string[];
    commonParents: Array<{
        nodeId: string;
        label: string;
        type: string;
        connectionCount: number;
    }>;
    isDistant: boolean;
    primaryContext?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Edge weight configuration */
export const EDGE_WEIGHTS = {
    physical: 1.0,
    semantic: 1.5,
    consecutiveSemantic: 2.0,
} as const;

/** Semantic similarity threshold */
export const SIMILARITY_THRESHOLD = 0.5;

/** Maximum consecutive semantic edges allowed */
export const MAX_CONSECUTIVE_SEMANTIC = 3;

/** Score weights for path quality */
export const SCORE_WEIGHTS = {
    physicalRatio: 0.35,
    freshness: 0.25,
    domainJumps: 0.20,
    uniqueness: 0.15,
    lengthPenalty: 0.05,
} as const;

export const PATH_STRING_SEPARATOR = ' -> ';

// ============================================================================
// Helpers
// ============================================================================

/** Single indexed document by node id (batch API). */
export async function getIndexedDocumentById(id: string): Promise<IndexedDocumentRecord | null> {
    const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds([id]);
    return results.length > 0 ? results[0] : null;
}

/** Multiple indexed documents by node id as a Map. */
export async function getIndexedDocumentsByIds(ids: string[]): Promise<Map<string, IndexedDocumentRecord>> {
    const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds(ids);
    const map = new Map<string, IndexedDocumentRecord>();
    for (const meta of results) {
        map.set(meta.id, meta);
    }
    return map;
}

/**
 * Get node label for display.
 */
export function getNodeLabel(nodeId: string, nodesMap: Map<string, any>): string {
    const node = nodesMap.get(nodeId);
    if (!node) return nodeId;
    if (isIndexedNoteNodeType(node.type)) {
        try {
            return JSON.parse(node.attributes).path || nodeId;
        } catch {
            return nodeId;
        }
    }
    return node.type + node.label;
}

/**
 * Get parent folder from file path.
 */
export function getParentFolder(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash > 0 ? path.substring(0, lastSlash) : '/';
}

// ============================================================================
// Neighbor Retrieval
// ============================================================================

/**
 * Get only physical neighbors. Optionally exclude doc IDs.
 */
export async function getPhysicalNeighbors(nodeId: string, limit: number = 20, excludedDocIds?: Set<string>): Promise<NeighborNode[]> {
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
 * Get mixed neighbors (physical + semantic). Optionally exclude doc IDs.
 */
export async function getNeighbors(nodeId: string, includeSemantic: boolean, limit: number = 20, excludedDocIds?: Set<string>): Promise<NeighborNode[]> {
    const neighbors: NeighborNode[] = [];

    const physicalNeighbors = await getPhysicalNeighbors(nodeId, limit, excludedDocIds);
    neighbors.push(...physicalNeighbors);

    const physicalIds = new Set(physicalNeighbors.map(n => n.id));
    if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));

    if (includeSemantic) {
        const semanticNeighbors = await getSemanticNeighbors(
            nodeId,
            Math.max(5, limit - neighbors.length),
            physicalIds
        );
        for (const neighbor of semanticNeighbors) {
            if (excludedDocIds?.has(neighbor.id)) continue;
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
 * Apply neighbor filters if needed.
 */
export async function applyNeighborFilters(neighbors: NeighborNode[], filters?: any): Promise<NeighborNode[]> {
    if (!filters) return neighbors;
    const itemFieldGetter = await getDefaultItemFiledGetter<NeighborNode>(
        neighbors.map(n => n.id),
        filters
    );
    return applyFiltersAndSorters(neighbors, filters, undefined, undefined, itemFieldGetter);
}

// ============================================================================
// Path Reconstruction
// ============================================================================

/**
 * Reconstruct path from bidirectional search visited maps.
 */
export function reconstructPath(
    intersectId: string,
    startVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    endVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>
): PathSegment[] {
    const path: PathSegment[] = [];

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
export function createEmptyScore(): PathScore {
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
export async function scorePaths(paths: ScoredPath[], allPaths: ScoredPath[]): Promise<ScoredPath[]> {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();

    for (const path of paths) {
        const segments = path.segments;
        const length = segments.length - 1;

        const physicalCount = segments.filter(s => s.type === 'physical_neighbors').length;
        const physicalRatio = length > 0 ? (physicalCount - 1) / length : 1;

        const semanticSegments = segments.filter(s => s.type === 'semantic_neighbors' && s.similarity);
        const avgSimilarity = semanticSegments.length > 0
            ? semanticSegments.reduce((sum, s) => sum + (parseFloat(s.similarity!) / 100), 0) / semanticSegments.length
            : 0;

        const uniqueness = calculateUniqueness(segments, allPaths);

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
                freshnessSum += 0.5;
            }
        }
        const freshness = nodeIds.length > 0 ? freshnessSum / nodeIds.length : 0;

        const domainJumps = await countDomainJumps(segments);

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
 * Calculate path uniqueness compared to other paths.
 */
export function calculateUniqueness(segments: PathSegment[], allPaths: ScoredPath[]): number {
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
export async function countDomainJumps(segments: PathSegment[]): Promise<number> {
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

/**
 * Generate human-readable reasoning for why this path was selected.
 */
export function generatePathReasoning(path: ScoredPath): string {
    const score = path.score;
    const reasons: string[] = [];

    if (score.physicalRatio > 0.8) {
        reasons.push('High physical connectivity ensures reliability');
    } else if (score.physicalRatio > 0.5) {
        reasons.push('Balanced physical and semantic connections');
    } else {
        reasons.push('Creative semantic bridging for discovery');
    }

    if (score.freshness > 0.7) {
        reasons.push('Includes recently accessed knowledge');
    }

    if (score.domainJumps > 0) {
        reasons.push(`Crosses ${score.domainJumps} knowledge domains`);
    }

    if (score.uniqueness > 0.8) {
        reasons.push('Unique path not overlapping with others');
    }

    if (score.length <= 3) {
        reasons.push('Direct and concise connection');
    }

    return reasons.length > 0 ? reasons.join('. ') + '.' : 'Selected for balanced quality metrics.';
}

/**
 * Identify key edge for diversity blocking.
 */
export function identifyKeyEdge(path: PathSegment[]): string {
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
export function deduplicatePaths(paths: ScoredPath[]): ScoredPath[] {
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
export function ensureStrategyDiversity(paths: ScoredPath[], maxResults: number): ScoredPath[] {
    const byStrategy: Record<StrategyType, ScoredPath[]> = {
        reliable: [],
        fastTrack: [],
        brainstorm: [],
    };

    for (const path of paths) {
        byStrategy[path.strategy].push(path);
    }

    const result: ScoredPath[] = [];
    const strategies: StrategyType[] = ['reliable', 'fastTrack', 'brainstorm'];

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
export function analyzeHubs(paths: ScoredPath[]): HubAnalysis[] {
    const nodeCount = new Map<string, number>();

    for (const path of paths) {
        for (let i = 1; i < path.segments.length - 1; i++) {
            const nodeId = path.segments[i].nodeId;
            nodeCount.set(nodeId, (nodeCount.get(nodeId) || 0) + 1);
        }
    }

    const hubs: HubAnalysis[] = [];

    for (const [nodeId, count] of nodeCount) {
        if (count >= 2) {
            hubs.push({
                nodeId,
                label: nodeId,
                occurrenceCount: count,
                betweennessCentrality: count / paths.length,
            });
        }
    }

    return hubs.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/**
 * Analyze comprehensive context intersection between two notes.
 */
export async function analyzeContextIntersection(startId: string, endId: string): Promise<ContextIntersectionAnalysis | null> {
    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(startId),
        getIndexedDocumentById(endId)
    ]);

    if (!startMeta || !endMeta) return null;

    const physicalAncestor = analyzePhysicalAncestor(startMeta.path, endMeta.path);
    const commonTags = analyzeTagIntersection(startMeta.tags, endMeta.tags);
    const commonParents = await analyzeCommonParents(startId, endId);

    const isDistant = physicalAncestor.depth <= 1 && (commonTags.length > 0 || commonParents.length > 0);
    let primaryContext: string | undefined;

    if (commonTags.length > 0) {
        primaryContext = commonTags[0];
    } else if (commonParents.length > 0) {
        primaryContext = commonParents[0].label;
    }

    return {
        physicalAncestor,
        commonTags,
        commonParents,
        isDistant,
        primaryContext,
    };
}

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

function analyzeTagIntersection(startTags: string | null, endTags: string | null): string[] {
    if (!startTags || !endTags) return [];

    let startTagArray: string[] = [];
    let endTagArray: string[] = [];

    try {
        const parsedStart = JSON.parse(startTags);
        const parsedEnd = JSON.parse(endTags);
        startTagArray = Array.isArray(parsedStart) ? parsedStart : [];
        endTagArray = Array.isArray(parsedEnd) ? parsedEnd : [];
    } catch {
        startTagArray = startTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        endTagArray = endTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }

    return startTagArray.filter(tag => endTagArray.includes(tag));
}

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
        startEdges
            .filter(edge => edge.to_node_id === startId && edge.from_node_id !== endId)
            .map(edge => edge.from_node_id)
    );

    const endReferrerIds = new Set(
        endEdges
            .filter(edge => edge.to_node_id === endId && edge.from_node_id !== startId)
            .map(edge => edge.from_node_id)
    );

    const commonParentIds = Array.from(startReferrerIds).filter(id => endReferrerIds.has(id));

    if (commonParentIds.length === 0) return [];

    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const parentNodes = await mobiusNodeRepo.getByIds(commonParentIds);

    const result = commonParentIds.map(parentId => {
        const node = parentNodes.get(parentId);
        if (!node) return null;

        const startConnections = startEdges.filter(edge =>
            edge.from_node_id === parentId && edge.to_node_id === startId
        ).length;

        const endConnections = endEdges.filter(edge =>
            edge.from_node_id === parentId && edge.to_node_id === endId
        ).length;

        const connectionCount = startConnections + endConnections;

        let label = node.label;
        if (isIndexedNoteNodeType(node.type)) {
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
export function buildAnalysisSection(hubs: HubAnalysis[], contextIntersection: ContextIntersectionAnalysis | null): string {
    let section = '';

    if (hubs.length > 0) {
        section += '\n\n## Knowledge Hubs\n\n';
        section += 'These nodes appear in multiple paths, acting as central connectors:\n\n';
        for (const hub of hubs.slice(0, SLICE_CAPS.inspector.pathFindHubs)) {
            section += `- **[[${hub.label}]]** (appears in ${hub.occurrenceCount} paths)\n`;
        }
    }

    if (contextIntersection) {
        const hasValuableContent = contextIntersection.commonTags.length > 0 ||
                                  contextIntersection.commonParents.length > 0 ||
                                  contextIntersection.physicalAncestor.depth > 1 ||
                                  contextIntersection.isDistant;

        if (hasValuableContent) {
            section += '\n\n## Shared Context Analysis\n\n';

            const physical = contextIntersection.physicalAncestor;

            if (contextIntersection.commonTags.length > 0) {
                section += `**Common Tags:** ${contextIntersection.commonTags.map(tag => `\`${tag}\``).join(', ')}\n\n`;
            }

            if (contextIntersection.commonParents.length > 0) {
                section += '**Common Reference Points:**\n';
                for (const parent of contextIntersection.commonParents.slice(0, SLICE_CAPS.inspector.pathFindCommonParents)) {
                    const nodeLink = isIndexedNoteNodeType(parent.type) ? `[[${parent.label}]]` : `**${parent.label}**`;
                    section += `- ${nodeLink} (${parent.connectionCount} connections)\n`;
                }
                section += '\n';
            }

            if (physical.depth > 1) {
                section += `**Shared Location:** Both notes are in \`${physical.ancestorPath}\`\n\n`;
            }

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

/** Strategy display names */
const STRATEGY_NAMES: Record<StrategyType, string> = {
    reliable: '🔗 Reliable',
    fastTrack: '🚀 Fast Track',
    brainstorm: '💡 Brainstorm',
};

/**
 * Format paths for user-friendly output.
 */
export async function formatPathsForOutput(
    paths: ScoredPath[],
    mobiusNodeRepo: any
): Promise<Array<{
    path: string[];
    connectionDetails: string;
    strategy: string;
    insightLabel: string;
    score: number;
}>> {
    const allNodeIds = new Set<string>();
    for (const scoredPath of paths) {
        for (const segment of scoredPath.segments) {
            allNodeIds.add(segment.nodeId);
        }
    }

    const nodesMap = await mobiusNodeRepo.getByIds(Array.from(allNodeIds));

    return paths.map(scoredPath => {
        const nodeLabels: string[] = [];

        for (const segment of scoredPath.segments) {
            try {
                const node = nodesMap.get(segment.nodeId);
                if (!node) {
                    nodeLabels.push(segment.nodeId);
                } else if (isIndexedNoteNodeType(node.type)) {
                    nodeLabels.push(JSON.parse(node.attributes).path || segment.nodeId);
                } else {
                    nodeLabels.push(node.type + node.label);
                }
            } catch {
                nodeLabels.push(segment.nodeId);
            }
        }

        const connectionDetails = scoredPath.segments.slice(0, -1).map((segment, i) => {
            const nextSegment = scoredPath.segments[i + 1];
            const type = segment.type === 'physical_neighbors' && nextSegment.type === 'physical_neighbors'
                ? 'physical'
                : 'semantic';
            const similarity = segment.similarity || nextSegment.similarity;
            return similarity ? `${type} (${similarity})` : type;
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
