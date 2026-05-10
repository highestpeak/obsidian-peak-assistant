import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { getSemanticNeighbors } from "../common";
import type { ScoredPath, SearchContext, PathSegment, NeighborNode } from './scorer';
import { createEmptyScore, getPhysicalNeighbors, applyNeighborFilters, EDGE_WEIGHTS, SIMILARITY_THRESHOLD } from './scorer';
import { bidirectionalBFS } from './reliable';

/** A* node for priority queue */
interface AStarNode {
    nodeId: string;
    gCost: number;
    hCost: number;
    fCost: number;
    parent: AStarNode | null;
    connectionType: 'physical_neighbors' | 'semantic_neighbors';
    similarity?: string;
}

/**
 * A* search with dynamic semantic gravity field.
 * Uses interpolated target vector for guided exploration.
 */
export async function fastTrackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    if (!context.startVector || !context.endVector) {
        return [];
    }

    const paths: ScoredPath[] = [];

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
 * Fallback strategy when all other strategies fail.
 * Uses very permissive search to find ANY connection between nodes.
 */
export async function fallbackStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];

    const path = await bidirectionalBFS(
        context.startId,
        context.endId,
        new Set(),
        true,
        Math.max(context.maxHops * 2, 8),
        context.filters,
        context.excludedDocIds
    );

    if (path) {
        paths.push({
            segments: path,
            strategy: 'fastTrack',
            score: createEmptyScore(),
            insightLabel: 'Found through extended search - this connection exists but may be indirect.',
            reasoning: 'Fallback search found this path after other strategies failed. Consider it as a distant connection.',
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

    const openSet: AStarNode[] = [];
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, AStarNode>();

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

        openSet.sort((a, b) => a.fCost - b.fCost);
        const current = openSet.shift()!;

        if (current.nodeId === endId) {
            return reconstructAStarPath(current);
        }

        closedSet.add(current.nodeId);

        if (current.connectionType === 'semantic_neighbors') {
            consecutiveSemanticCount++;
        } else {
            consecutiveSemanticCount = 0;
        }

        const neighbors = await getSmartNeighbors(
            current.nodeId,
            true,
            consecutiveSemanticCount >= 4,
            context.excludedDocIds
        );

        let filteredNeighbors = await applyNeighborFilters(neighbors, filters);

        for (const neighbor of filteredNeighbors) {
            if (closedSet.has(neighbor.id)) continue;

            const edgeWeight = neighbor.foundBy === 'physical_neighbors'
                ? EDGE_WEIGHTS.physical
                : (consecutiveSemanticCount >= 1 ? EDGE_WEIGHTS.consecutiveSemantic : EDGE_WEIGHTS.semantic);

            if (neighbor.foundBy === 'semantic_neighbors' && neighbor.similarity) {
                const sim = parseFloat(neighbor.similarity) / 100;
                if (sim < SIMILARITY_THRESHOLD) continue;
            }

            const tentativeGCost = current.gCost + edgeWeight;

            let existingNode = nodeMap.get(neighbor.id);

            if (!existingNode) {
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
 */
async function calculateHeuristic(
    nodeId: string,
    endVector: number[],
    progress: number,
    maxHops: number
): Promise<number> {
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
    const nodeVector = await embeddingRepo.getEmbeddingForSemanticSearch(nodeId);

    if (!nodeVector) {
        return 2.0;
    }

    const similarity = cosineSimilarity(nodeVector, endVector);
    const distance = Math.max(0, 1 - similarity);

    return distance * 1.0;
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

/**
 * Smart neighbor selection with semantic throttling.
 */
async function getSmartNeighbors(
    nodeId: string,
    includeSemantic: boolean,
    throttleSemantic: boolean,
    excludedDocIds?: Set<string>
): Promise<NeighborNode[]> {
    const neighbors: NeighborNode[] = [];

    const physicalNeighbors = await getPhysicalNeighbors(nodeId, 20, excludedDocIds);
    neighbors.push(...physicalNeighbors);

    if (includeSemantic && !throttleSemantic && physicalNeighbors.length < 3) {
        const physicalIds = new Set(physicalNeighbors.map(n => n.id));
        if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));
        const semanticNeighbors = await getSemanticNeighbors(nodeId, 15, physicalIds);
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
