import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { distillClusterNodesData, SemanticNeighborNode } from "./common";
import { getSemanticNeighbors } from "./common";
import { mapGetAll } from "@/core/utils/collection-utils";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
/** Inspect note context (tags, categories, in/out links, semantic neighbors). */
export async function inspectNoteContext(params: any, templateManager?: TemplateManager) {
    const { note_path, limit, include_semantic_paths, response_format } = params;
    // Get note metadata
    const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
    const docMeta = await docMetaRepo.getByPath(note_path);
    if (!docMeta) {
        return `Note not found in database: ${note_path}`;
    }

    const inAndOutEdges = await sqliteStoreManager.getGraphEdgeRepo()
        .getAllEdgesForNode(docMeta.id, limit);
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

    const data = {
        note_path,
        tags,
        categories,
        incoming: await distillClusterNodesData(
            mapGetAll(connectedNodesMap, inComingNode), limit
        ),
        outgoing: await distillClusterNodesData(
            mapGetAll(connectedNodesMap, outGoingNode), limit
        ),
        semanticNeighbors: await distillClusterNodesData(
            semanticNeighbors, limit
        ),
    };
    return buildResponse(response_format, ToolTemplateId.InspectNoteContext, data, { templateManager });
}
