import type { ScoredPath, SearchContext, PathSegment, NeighborNode } from './scorer';
import { createEmptyScore, identifyKeyEdge, reconstructPath, getPhysicalNeighbors, getNeighbors, applyNeighborFilters } from './scorer';

/**
 * Find shortest physical-only path using bidirectional BFS.
 * Guarantees the most direct and reliable connection.
 */
export async function reliableStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const forbiddenEdges = new Set<string>();

    for (let i = 0; i < 3; i++) {
        const path = await bidirectionalBFS(
            context.startId,
            context.endId,
            forbiddenEdges,
            false,
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

        const edgeToBlock = identifyKeyEdge(path);
        if (edgeToBlock) {
            forbiddenEdges.add(edgeToBlock);
        } else {
            break;
        }
    }

    return paths;
}

/**
 * Bidirectional BFS for path finding.
 */
export async function bidirectionalBFS(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    maxHops: number,
    filters?: any,
    excludedDocIds?: Set<string>
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
            startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters, excludedDocIds
        );
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        const endResult = await expandFrontier(
            endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters, excludedDocIds
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
export async function expandFrontier(
    queue: string[],
    myVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    otherVisited: Map<string, { parentId: string | null; type: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string }>,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    filters?: any,
    excludedDocIds?: Set<string>
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = includeSemantic
            ? await getNeighbors(currentId, true, 20, excludedDocIds)
            : await getPhysicalNeighbors(currentId, 20, excludedDocIds);

        neighbors = await applyNeighborFilters(neighbors, filters);

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
