import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { GraphNode } from "@/core/storage/sqlite/repositories/MobiusNodeRepo";
import { applyFiltersAndSorters, getDefaultItemFiledGetter, getSemanticNeighbors } from "./common";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
// Define types for orphan analysis
type OrphanNode = GraphNode & { orphanType: string; }
export async function findOrphanNotes(params: any, templateManager?: TemplateManager) {
    const { filters, sorter, limit, response_format } = params;
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();

    const hardOrphanIds = await mobiusEdgeRepo.getHardOrphans(params.limit || 100);
    let filteredHardOrphans: OrphanNode[] = [];
    if (hardOrphanIds.length > 0) {
        const hardOrphanNodeMap = await mobiusNodeRepo.getByIds(hardOrphanIds);
        const hardOrphanNodes: OrphanNode[] = Array.from(hardOrphanNodeMap.values()).map(node => ({
            ...node,
            orphanType: 'hard'
        }));
        const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(hardOrphanIds, filters, sorter);
        filteredHardOrphans = applyFiltersAndSorters(hardOrphanNodes, filters, sorter, limit, itemFiledGetter);
    }

    // Note: only hard orphans (zero connections) are detected here.
    // Soft orphan detection (few connections, mostly to other orphans) is not implemented.

    // Find semantic revival suggestions for each orphan
    const cadidateAllOrphanNodes: OrphanNode[] = [...filteredHardOrphans];
    // apply filters and sorting for all orphans
    const itemFiledGetter = await getDefaultItemFiledGetter<OrphanNode>(cadidateAllOrphanNodes.map(node => node.id), filters, sorter);
    const finalAllOrphanNodes = applyFiltersAndSorters(cadidateAllOrphanNodes, filters, sorter, limit, itemFiledGetter);

    // find revival suggestions for all orphans
    const orphanRevivalSuggestions = await findRevivalSuggestions(finalAllOrphanNodes);

    // Prepare orphans data
    const hardOrphans = finalAllOrphanNodes.map((orphan: any, i: number) => {
        const suggestion = orphanRevivalSuggestions.get(orphan.id);
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

    const data = {
        total_count: cadidateAllOrphanNodes.length,
        filtered_count: finalAllOrphanNodes.length,
        hard_orphans: hardOrphans,
    };
    return buildResponse(response_format, ToolTemplateId.OrphanNotes, data, { templateManager });
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
        if (!isIndexedNoteNodeType(orphan.type)) continue;
        try {
            // Use getSemanticNeighbors to find semantically similar documents
            // Filter out only the current orphan node itself to find connections to active parts of the knowledge graph
            const semanticNeighbors = await getSemanticNeighbors(orphan.id, 10, new Set([orphan.id]));

            // console.log('[findRevivalSuggestions] semanticNeighbors', semanticNeighbors);
            // Find the closest non-orphan document with high similarity
            const closestNonOrphan = semanticNeighbors
                .filter(neighbor => !orphanIds.has(neighbor.id)) // Ensure it's not an orphan
                .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];
            // console.log('[findRevivalSuggestions] closestNonOrphan', closestNonOrphan);

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