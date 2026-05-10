import type { ScoredPath, SearchContext, PathSegment } from './scorer';
import { createEmptyScore, identifyKeyEdge, getParentFolder, getIndexedDocumentById, getIndexedDocumentsByIds, reconstructPath, getPhysicalNeighbors, getNeighbors, applyNeighborFilters } from './scorer';

/**
 * Find paths that cross different knowledge domains.
 * Forces exploration through domain boundaries for serendipitous discovery.
 */
export async function brainstormStrategy(context: SearchContext): Promise<ScoredPath[]> {
    const paths: ScoredPath[] = [];
    const brainstormForbiddenEdges = new Set<string>();

    const [startMeta, endMeta] = await Promise.all([
        getIndexedDocumentById(context.startId),
        getIndexedDocumentById(context.endId)
    ]);

    if (!startMeta || !endMeta) return paths;

    const startFolder = getParentFolder(startMeta.path);
    const endFolder = getParentFolder(endMeta.path);

    for (let i = 0; i < 3; i++) {
        const forceCrossDomain = startFolder === endFolder || i === 0;

        const path = await bidirectionalBFSWithDomainPreference(
            context.startId,
            context.endId,
            brainstormForbiddenEdges,
            context.includeSemantic,
            context.maxHops,
            context.filters,
            forceCrossDomain ? endFolder : null,
            context.excludedDocIds
        );

        if (!path) break;

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

            const edgeToBlock = identifyKeyEdge(path);
            if (edgeToBlock) {
                brainstormForbiddenEdges.add(edgeToBlock);
            } else {
                break;
            }
        } else {
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
 * BFS with preference for domain-crossing edges.
 */
async function bidirectionalBFSWithDomainPreference(
    startId: string,
    endId: string,
    forbiddenEdges: Set<string>,
    includeSemantic: boolean,
    maxHops: number,
    filters?: any,
    avoidFolder?: string | null,
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
        const startResult = await expandFrontierWithDomainPreference(
            startQueue, startVisited, endVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds
        );
        if (startResult.found && startResult.intersectId) {
            return reconstructPath(startResult.intersectId, startVisited, endVisited);
        }

        const endResult = await expandFrontierWithDomainPreference(
            endQueue, endVisited, startVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds
        );
        if (endResult.found && endResult.intersectId) {
            return reconstructPath(endResult.intersectId, startVisited, endVisited);
        }

        hops++;
    }

    return null;
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
    avoidFolder?: string | null,
    excludedDocIds?: Set<string>
): Promise<{ found: boolean; intersectId?: string }> {
    const nextQueue: string[] = [];

    for (const currentId of queue) {
        let neighbors = includeSemantic
            ? await getNeighbors(currentId, true, 20, excludedDocIds)
            : await getPhysicalNeighbors(currentId, 20, excludedDocIds);

        if (avoidFolder) {
            const neighborIds = neighbors.map(n => n.id);
            const metasMap = await getIndexedDocumentsByIds(neighborIds);
            const neighborsWithMeta = neighbors.map(n => {
                const meta = metasMap.get(n.id);
                return { ...n, folder: meta ? getParentFolder(meta.path) : '' };
            });
            neighborsWithMeta.sort((a, b) => {
                const aInAvoid = a.folder === avoidFolder ? 1 : 0;
                const bInAvoid = b.folder === avoidFolder ? 1 : 0;
                return aInAvoid - bInAvoid;
            });
            neighbors = neighborsWithMeta;
        }

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
