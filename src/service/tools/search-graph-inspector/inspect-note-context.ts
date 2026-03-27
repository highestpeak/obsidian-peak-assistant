import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { distillClusterNodesData, SemanticNeighborNode } from "./common";
import { getSemanticNeighbors } from "./common";
import { mapGetAll } from "@/core/utils/collection-utils";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { GraphNodeType } from "@/core/po/graph.po";
import type { FunctionalTagEntry } from '@/core/document/helper/TagService';

/** Inspect note context (tags, functional tags, keywords, in/out links, semantic neighbors). */
export async function inspectNoteContext(params: any, templateManager?: TemplateManager) {
    const { note_path, limit, include_semantic_paths, response_format } = params;
    // Get note metadata
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
    const docMeta = await indexedDocumentRepo.getByPath(note_path);
    if (!docMeta) {
        return `Note not found in database: ${note_path}`;
    }

    const inAndOutEdges = await sqliteStoreManager.getMobiusEdgeRepo()
        .getAllEdgesForNode(docMeta.id, limit);
    const inComingNode = inAndOutEdges.filter(e => e.to_node_id === docMeta.id).map(e => e.from_node_id);
    const outGoingNode = inAndOutEdges.filter(e => e.from_node_id === docMeta.id).map(e => e.to_node_id);

    const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo()
        .getByIds([...inComingNode, ...outGoingNode]);

    const { idMapToTags } = await sqliteStoreManager.getGraphRepo().getTagsByDocIds([docMeta.id]);
    const functionalTagEntries: FunctionalTagEntry[] =
        idMapToTags.get(docMeta.id)?.functionalTagEntries ?? [];

    let topicTags: string[] = [];
    let keywordTags: string[] = [];
    let timeTags: string[] = [];
    let geoTags: string[] = [];
    let personTags: string[] = [];
    let neighborDocumentsIds: Set<string> = new Set();
    for (const nodeVal of connectedNodesMap.values()) {
        if (nodeVal.type === GraphNodeType.TopicTag) {
            topicTags.push(nodeVal.label);
        }
        if (nodeVal.type === GraphNodeType.KeywordTag) {
            keywordTags.push(nodeVal.label);
        }
        if (nodeVal.type === GraphNodeType.ContextTag) {
            const ax = contextAxisFromInspectNode(nodeVal);
            if (ax === "time") timeTags.push(nodeVal.label);
            else if (ax === "geo") geoTags.push(nodeVal.label);
            else if (ax === "person") personTags.push(nodeVal.label);
        }
        if (nodeVal.type === GraphNodeType.Document) {
            neighborDocumentsIds.add(nodeVal.id);
        }
    }

    const semanticNeighbors: SemanticNeighborNode[] = include_semantic_paths
        ? await getSemanticNeighbors(docMeta.id, limit, neighborDocumentsIds)
        : [];

    const data = {
        note_path,
        topicTags,
        functionalTagEntries,
        keywordTags,
        timeTags,
        geoTags,
        personTags,
        tags: [
            ...topicTags,
            ...keywordTags,
            ...timeTags,
            ...geoTags,
            ...personTags,
            ...functionalTagEntries.map((e) => e.id),
        ],
        categories: functionalTagEntries.map((e) => e.id),
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

function contextAxisFromInspectNode(node: {
    label: string;
    attributes?: string | null;
}): "time" | "geo" | "person" | null {
    try {
        const a = JSON.parse(node.attributes || "{}") as { axis?: string };
        if (a.axis === "time" || a.axis === "geo" || a.axis === "person") return a.axis;
    } catch {
        /* ignore */
    }
    if (node.label.startsWith("Time")) return "time";
    if (node.label.startsWith("Geo")) return "geo";
    if (node.label.startsWith("Person")) return "person";
    return null;
}
