import { AppContext } from "@/app/context/AppContext";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { distillClusterNodesData, SemanticNeighborNode } from "./common";
import { getSemanticNeighbors } from "./common";
import { mapGetAll } from "@/core/utils/collection-utils";
import { buildResponse, buildResponseFromRendered } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { getAiAnalysisExcludeContext } from "./ai-analysis-exclude";

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
    let inComingNode = inAndOutEdges.filter(e => e.to_node_id === docMeta.id).map(e => e.from_node_id);
    let outGoingNode = inAndOutEdges.filter(e => e.from_node_id === docMeta.id).map(e => e.to_node_id);

    const excludeCtx = await getAiAnalysisExcludeContext();
    if (excludeCtx) {
        inComingNode = inComingNode.filter((id) => !excludeCtx.excludedDocIds.has(id));
        outGoingNode = outGoingNode.filter((id) => !excludeCtx.excludedDocIds.has(id));
    }
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

    if (excludeCtx) {
        excludeCtx.excludedDocIds.forEach((id) => neighborDocumentsIds.add(id));
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
    const tm = templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
    if (tm) {
        const rendered = await tm.render(ToolTemplateId.InspectNoteContext, data);
        return buildResponseFromRendered(response_format, data, rendered);
    }
    return buildResponse(response_format, undefined, data);
}
