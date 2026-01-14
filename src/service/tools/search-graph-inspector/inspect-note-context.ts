import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { template as INSPECT_NOTE_CONTEXT_TEMPLATE } from "../templates/inspect-note-context";
import { distillClusterNodesData, SemanticNeighborNode } from "./common";
import { getSemanticNeighbors } from "./common";
import { mapGetAll } from "@/core/utils/collection-utils";
import { buildResponse } from "../types";

/**
 * {@link INSPECT_NOTE_CONTEXT_TEMPLATE}
 */
export async function inspectNoteContext(params: any) {
    const { note_path, limit, include_semantic_paths, response_format } = params;
    // Get note metadata
    const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
    const docMeta = await docMetaRepo.getByPath(note_path);
    if (!docMeta) {
        return `Note not found in database: ${note_path}`;
    }

    // Get limited edges by type (each type limited to limit)
    // If this document has 100 tags (Tag) and 2 referenced notes (Note), setting a simple limit of 20 might only display the top 20 tags, potentially overshadowing those two important referenced notes. Using 'limitPerType' with a value of 20 assigns 20 names each to Tags and Notes categories respectively.
    const inAndOutEdges = await sqliteStoreManager.getGraphEdgeRepo()
        .getAllEdgesForNode(docMeta.id, limit);
    // Extract nodeTo and nodeFrom from inAndOutEdges
    // inComingNode --> currentNode --> outGoingNode
    const inComingNode = inAndOutEdges.filter(e => e.to_node_id === docMeta.id).map(e => e.from_node_id);
    const outGoingNode = inAndOutEdges.filter(e => e.from_node_id === docMeta.id).map(e => e.to_node_id);
    const connectedNodesMap = await sqliteStoreManager.getGraphNodeRepo()
        .getByIds([...inComingNode, ...outGoingNode]);

    // Extract tags and categories from connected nodes
    let tags: string[] = [];
    let categories: string[] = [];
    let neighborDocumentsIds: Set<string> = new Set();
    for (const nodeVal of connectedNodesMap.values()) {
        if (nodeVal.type === "tag") {
            tags.push(nodeVal.label);
        }
        if (nodeVal.type === "category") {
            categories.push(nodeVal.label);
        }
        if (nodeVal.type === "document") {
            neighborDocumentsIds.add(nodeVal.id);
        }
    }

    const semanticNeighbors: SemanticNeighborNode[] = include_semantic_paths
        ? await getSemanticNeighbors(docMeta.id, limit, neighborDocumentsIds)
        : [];

    return buildResponse(response_format, INSPECT_NOTE_CONTEXT_TEMPLATE, {
        note_path,
        tags,
        categories,
        // we don't need to render tag or categories from incoming and outgoing nodes. as we already have them in the two fields above.
        incoming: await distillClusterNodesData(
            mapGetAll(connectedNodesMap, inComingNode), limit
        ),
        outgoing: await distillClusterNodesData(
            mapGetAll(connectedNodesMap, outGoingNode), limit
        ),
        // only document nodes are semantic neighbors.
        semanticNeighbors: await distillClusterNodesData(
            semanticNeighbors, limit
        ),
    });
}
