import { GRAPH_INSPECT_STEP_TIME_LIMIT } from "@/core/constant";
import { GraphNode } from "@/core/storage/sqlite/repositories/MobiusNodeRepo";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { applyFiltersAndSorters, distillClusterNodesData, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";

type GraphTraversalResult = GraphNode & { depth: number; foundBy: 'physical_neighbors' | 'semantic_neighbors'; similarity?: string };
type VisEdge = { from_node_id: string; to_node_id: string; type: string; weight: number };
export async function graphTraversal(params: any, templateManager?: TemplateManager) {
    const { start_note_path, hops, include_semantic_paths, limit, response_format, filters, sorter } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    // Find start node
    const startIndexedDoc = await sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path);
    if (!startIndexedDoc) {
        return `Graph Traversal Failed. Start note "${start_note_path}" not found in database.`;
    }

    const startNode = await mobiusNodeRepo.getById(startIndexedDoc.id);
    if (!startNode) {
        return `Graph Traversal Failed. Start note node "${start_note_path}" not found in graph database.`;
    }

    const visited = new Set<string>([startNode.id]);

    // BFS traversal - collect both nodes and edges for visualization
    let isTimeOut = false;
    const startTime = Date.now();
    const queue: Array<GraphTraversalResult> = [
        { ...startNode, depth: 0, foundBy: 'physical_neighbors' },
    ];
    const result: Array<GraphTraversalResult> = [];
    const collectedEdges: VisEdge[] = [];
    
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

        const edges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, limit);
        for (const e of edges) collectedEdges.push({ from_node_id: e.from_node_id, to_node_id: e.to_node_id, type: e.type, weight: e.weight });

        const incoming = edges.filter(e => e.to_node_id === current.id).map(e => e.from_node_id);
        const outgoing = edges.filter(e => e.from_node_id === current.id).map(e => e.to_node_id);

        // Decay semantic limit at deeper hops to reduce drift
        const semLimit = include_semantic_paths && current.depth > 0 ? ([limit, 3, 1][current.depth] ?? 0) : limit;
        const semanticNodes = include_semantic_paths && current.type === "document"
            ? await getSemanticNeighbors(current.id, semLimit, new Set([...incoming, ...outgoing])) : [];

        const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds([...incoming, ...outgoing]);
        for (const [nodeId, node] of connectedNodesMap) {
            if (!visited.has(nodeId)) { visited.add(nodeId); queue.push({ ...node, depth: current.depth + 1, foundBy: 'physical_neighbors' }); }
        }
        for (const node of semanticNodes) {
            if (!visited.has(node.id)) {
                visited.add(node.id);
                queue.push({ ...node, depth: current.depth + 1, similarity: node.similarity, foundBy: 'semantic_neighbors' });
                collectedEdges.push({ from_node_id: current.id, to_node_id: node.id, type: 'semantic', weight: parseFloat(node.similarity || '0') || 0.5 });
            }
        }
    }

    const groupedByDepth = new Map<number, GraphTraversalResult[]>();
    for (const node of result) (groupedByDepth.get(node.depth) ?? (groupedByDepth.set(node.depth, []), groupedByDepth.get(node.depth)!)).push(node);
    const levels = await Promise.all(
        [...groupedByDepth.entries()].map(async ([depth, data]) => ({ depth, ...(await distillClusterNodesData(data, limit, true)) }))
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

    const visitedNodeIds = new Set(result.map(n => n.id));
    const parseAttrs = (a: any) => { try { return typeof a === 'string' ? JSON.parse(a || '{}') : a ?? {}; } catch { return {}; } };
    const graphNodes = result.map(node => {
        const attrs = parseAttrs(node.attributes);
        const path = typeof attrs?.path === 'string' && attrs.path.trim() ? attrs.path.trim() : undefined;
        return { id: node.id, label: node.label || node.id, type: node.type, depth: node.depth, foundBy: node.foundBy, ...(path ? { path } : {}), ...(node.attributes ? { attributes: attrs } : {}) };
    });
    const graphEdges = collectedEdges.filter(e => visitedNodeIds.has(e.from_node_id) && visitedNodeIds.has(e.to_node_id));

    const data = {
        isTimeOut,
        start_note_path,
        hops,
        levels,
        graph: { nodes: graphNodes, edges: graphEdges }
    };
    return buildResponse(response_format, ToolTemplateId.GraphTraversal, data, { templateManager });
}
