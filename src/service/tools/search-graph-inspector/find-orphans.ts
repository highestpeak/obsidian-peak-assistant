import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GraphNode } from "@/core/storage/sqlite/repositories/GraphNodeRepo";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import { template as ORPHAN_NOTES_TEMPLATE } from "../templates/orphan-notes";
import { buildResponse } from "../types";

// Define types for orphan analysis
type OrphanNode = GraphNode & { orphanType: string; }
export async function findOrphanNotes(params: any) {
    const { filters, sorter, limit, response_format } = params;
    const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
    const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

    // Level 1: Hard Orphans (no connections) - get full orphan data without JOIN
    const hardOrphanIds = await graphEdgeRepo.getHardOrphans(params.limit || 100);
    let filteredHardOrphans: OrphanNode[] = [];
    if (hardOrphanIds.length > 0) {
        const hardOrphanNodeMap = await graphNodeRepo.getByIds(hardOrphanIds);
        const hardOrphanNodes: OrphanNode[] = Array.from(hardOrphanNodeMap.values()).map(node => ({
            ...node,
            orphanType: 'hard'
        }));
        const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(hardOrphanIds, filters, sorter);
        filteredHardOrphans = applyFiltersAndSorters(hardOrphanNodes, filters, sorter, limit, itemFiledGetter);
    }

    // Level 2: Soft Orphans (few connections, mostly to other orphans)
    // TODO: Implement soft orphan detection after adding redundant in/out degree fields to graph_nodes table
    // orphans.push(...edgeRepo.getNodesWithLowDegree)
    // This will allow efficient querying without complex JOINs
    // For now, only hard orphans are detected

    // Find semantic revival suggestions for each orphan
    const cadidateAllOrphanNodes: OrphanNode[] = [...filteredHardOrphans, /*...filteredSoftOrphans*/];
    // apply filters and sorting for all orphans
    const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(cadidateAllOrphanNodes.map(node => node.id), filters, sorter);
    const finalAllOrphanNodes = applyFiltersAndSorters(cadidateAllOrphanNodes, filters, sorter, limit, itemFiledGetter);

    // find revival suggestions for all orphans
    const orphanRevivalSuggestions = await findRevivalSuggestions(finalAllOrphanNodes);

    // Prepare orphans data
    const hardOrphans = finalAllOrphanNodes.map((orphan: any, i: number) => {
        const suggestion = orphanRevivalSuggestions.get(orphan.nodeId);
        return {
            index: i + 1,
            modified: orphan.modified,
            label: orphan.label,
            revival_suggestion: suggestion ? {
                title: suggestion.suggestedNode.title,
                reason: suggestion.reason
            } : null
        };
    });

    return buildResponse(response_format, ORPHAN_NOTES_TEMPLATE, {
        total_count: cadidateAllOrphanNodes.length,
        filtered_count: finalAllOrphanNodes.length,
        hard_orphans: hardOrphans,
        // soft_orphans: [] // TODO: implement soft orphans
    });
}

/**
 * Find semantic revival suggestions for orphan notes using doc-to-doc similarity
 */
async function findRevivalSuggestions(orphans: OrphanNode[]) {
    const suggestions = new Map();

    // Get all node IDs and filter out orphans
    const orphanIds = new Set(orphans.map(o => o.id));

    for (const orphan of orphans) {
        // Only consider note nodes for revival suggestions
        if (orphan.type !== 'document') continue;
        try {
            // Use getSemanticNeighbors to find semantically similar documents
            // Filter out orphan nodes to find connections to active parts of the knowledge graph
            const semanticNeighbors = await getSemanticNeighbors(orphan.id, 10, orphanIds);

            // Find the closest non-orphan document with high similarity
            const closestNonOrphan = semanticNeighbors
                .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];

            if (closestNonOrphan) {
                suggestions.set(orphan.id, {
                    suggestedNode: {
                        path: closestNonOrphan.attributes ? JSON.parse(closestNonOrphan.attributes)?.path : closestNonOrphan.id,
                        title: closestNonOrphan.label,
                        similarity: parseFloat(closestNonOrphan.similarity)
                    },
                    reason: `High semantic similarity (${closestNonOrphan.similarity}) - suggests potential connection`
                });
            }
        } catch (error) {
            console.warn(`[findRevivalSuggestions] Failed to find suggestion for orphan ${orphan.id}:`, error);
        }
    }

    return suggestions;
}