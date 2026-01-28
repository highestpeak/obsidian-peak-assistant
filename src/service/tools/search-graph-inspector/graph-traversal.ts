import { GRAPH_INSPECT_STEP_TIME_LIMIT } from "@/core/constant";
import { GraphNode } from "@/core/storage/sqlite/repositories/GraphNodeRepo";
import { GraphEdge } from "@/core/storage/sqlite/repositories/GraphEdgeRepo";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { applyFiltersAndSorters, distillClusterNodesData, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import { template as GRAPH_TRAVERSAL_TEMPLATE } from "../templates/graph-traversal";
import { buildResponse } from "../types";

type GraphTraversalResult = GraphNode
    & {
        depth: number;
        foundBy: 'physical_neighbors' | 'semantic_neighbors';
        similarity?: string,
    };

/**
 * Simplified node for UI visualization
 */
interface GraphVisualizationNode {
    id: string;
    label: string;
    type: string;
    depth: number;
    foundBy: 'physical_neighbors' | 'semantic_neighbors';
}

/**
 * Simplified edge for UI visualization
 */
interface GraphVisualizationEdge {
    from_node_id: string;
    to_node_id: string;
    type: string;
    weight: number;
}
export async function graphTraversal(params: any) {
    const { start_note_path, hops, include_semantic_paths, limit, response_format, filters, sorter } = params;
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

    // Find start node
    const startDocMeta = await sqliteStoreManager.getDocMetaRepo().getByPath(start_note_path);
    if (!startDocMeta) {
        return `Graph Traversal Failed. Start note "${start_note_path}" not found in database.`;
    }

    const startNode = await graphNodeRepo.getById(startDocMeta.id);
    if (!startNode) {
        return `Graph Traversal Failed. Start note node "${start_note_path}" not found in graph database.`;
    }

    // BFS traversal - collect both nodes and edges for visualization
    let isTimeOut = false;
    const startTime = Date.now();
    const visited = new Set([startNode.id]);
    const queue: Array<GraphTraversalResult> = [
        { ...startNode, depth: 0, foundBy: 'physical_neighbors' },
    ];
    const result: Array<GraphTraversalResult> = [];
    const collectedEdges: GraphVisualizationEdge[] = [];
    
    while (queue.length > 0) {
        // avoid time out.
        if (Date.now() - startTime > GRAPH_INSPECT_STEP_TIME_LIMIT) {
            isTimeOut = true;
            break;
        }
        const current = queue.shift()!;
        if (current.depth > hops)
            continue;

        result.push(current);

        if (current.depth === hops) {
            continue;
        }

        // physical neighbors: two directions; And we limit by type to avoid too many edges.
        const physicalInAndOutEdges = await graphEdgeRepo.getAllEdgesForNode(current.id, limit);
        
        // Collect edges for visualization (only edges between visited or to-be-visited nodes)
        for (const edge of physicalInAndOutEdges) {
            collectedEdges.push({
                from_node_id: edge.from_node_id,
                to_node_id: edge.to_node_id,
                type: edge.type,
                weight: edge.weight
            });
        }
        
        // Extract nodeTo and nodeFrom from inAndOutEdges
        // inComingNode --> currentNode --> outGoingNode
        const inComingNode = physicalInAndOutEdges.filter(e => e.to_node_id === current.id).map(e => e.from_node_id);
        const outGoingNode = physicalInAndOutEdges.filter(e => e.from_node_id === current.id).map(e => e.to_node_id);

        // semantic neighbors: indifferent to direction, default is out-going; only for document nodes.
        // If hops > 0 (deeper traversal), automatically reduce the semantic neighbor limit to minimize semantic drift and expensive queries.
        let semanticLimit = limit;
        if (include_semantic_paths && current.depth > 0) {
            // Reduce semantic neighbor limit for farther hops (deeper nodes are less likely to be relevant).
            const decayMap = [limit, 3, 1];
            semanticLimit = decayMap[current.depth] ?? 0;
        }
        const semanticNodes = include_semantic_paths && current.type === "document"
            ? await getSemanticNeighbors(current.id, semanticLimit, new Set([...inComingNode, ...outGoingNode]))
            : [];

        const connectedNodesMap = await sqliteStoreManager.getGraphNodeRepo()
            .getByIds([...inComingNode, ...outGoingNode]);

        for (const [nodeId, node] of connectedNodesMap) {
            if (!visited.has(nodeId)) {
                visited.add(nodeId);
                queue.push({
                    ...node,
                    depth: current.depth + 1,
                    foundBy: 'physical_neighbors'
                });
            }
        }

        for (const node of semanticNodes) {
            if (!visited.has(node.id)) {
                visited.add(node.id);
                queue.push({
                    ...node,
                    depth: current.depth + 1,
                    similarity: node.similarity,
                    foundBy: 'semantic_neighbors'
                });
                // Add semantic edge (synthetic) for visualization
                collectedEdges.push({
                    from_node_id: current.id,
                    to_node_id: node.id,
                    type: 'semantic',
                    weight: parseFloat(node.similarity || '0') || 0.5
                });
            }
        }
    }

    // Group by depth (hops) into a Map, then for each entry, sort by type.
    const groupedByDepth = result.reduce((acc, node) => {
        if (!acc.has(node.depth)) {
            acc.set(node.depth, []);
        }
        acc.get(node.depth)!.push(node);
        return acc;
    }, new Map<number, GraphTraversalResult[]>());
    // Handlebars strugle to handle the map structure, so we convert it to an array of objects.
    const levels = await Promise.all(
        Array.from(groupedByDepth.entries()).map(async ([depth, levelData]) => ({
            depth,
            // ignore document nodes filter as we have already filtered them before. also we want more semantic neighbors for each level.
            ...(await distillClusterNodesData(levelData, limit, true))
        }))
    );

    if (filters) {
        const itemFiledGetter = await getDefaultItemFiledGetter<GraphTraversalResult>(
            levels.flatMap(level => level.documentNodes?.map(node => node.id) ?? []),
            filters,
            sorter
        );
        for (const level of levels) {
            if (level.documentNodes) {
                level.documentNodes = applyFiltersAndSorters(level.documentNodes, filters, sorter, limit, itemFiledGetter);
            }
        }
    }

    // Build graph visualization data from collected nodes and edges
    const visitedNodeIds = new Set(result.map(n => n.id));
    const graphVisualizationNodes: GraphVisualizationNode[] = result.map(node => ({
        id: node.id,
        label: node.label || node.id,
        type: node.type,
        depth: node.depth,
        foundBy: node.foundBy
    }));
    // Filter edges to only include those between visited nodes
    const graphVisualizationEdges = collectedEdges.filter(
        edge => visitedNodeIds.has(edge.from_node_id) && visitedNodeIds.has(edge.to_node_id)
    );

    // Render template with graph field for UI visualization
    return buildResponse(response_format, GRAPH_TRAVERSAL_TEMPLATE, {
        isTimeOut,
        start_note_path,
        hops,
        levels,
        // Graph field for UI real-time visualization (structured output only)
        graph: {
            nodes: graphVisualizationNodes,
            edges: graphVisualizationEdges
        }
    });
}
