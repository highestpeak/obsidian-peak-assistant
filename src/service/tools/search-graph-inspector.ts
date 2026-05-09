import { AgentTool, safeAgentTool } from "./types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import {
	exploreFolderInputSchema, findKeyNodesInputSchema, findOrphansInputSchema,
	findPathInputSchema, graphTraversalInputSchema, grepFileTreeInputSchema,
	inspectNoteContextInputSchema, localSearchWholeVaultInputSchema,
	recentChangesWholeVaultInputSchema, searchByDimensionsInputSchema,
} from "@/core/schemas/tools/searchGraphInspector";
import { inspectNoteContext } from "./search-graph-inspector/inspect-note-context";
import { graphTraversal } from "./search-graph-inspector/graph-traversal";
import { findPath } from "./search-graph-inspector/find-path";
import { findKeyNodes } from "./search-graph-inspector/find-key-nodes";
import { findOrphanNotes } from "./search-graph-inspector/find-orphans";
import { searchByDimensions } from "./search-graph-inspector/search-by-dimensions";
import { exploreFolder } from "./search-graph-inspector/explore-folder";
import { grepFileTree } from "./search-graph-inspector/grep-file-tree";
import { getRecentChanges } from "./search-graph-inspector/recent-change-whole-vault";
import { localSearch } from "./search-graph-inspector/local-search";
import type { ZodType } from "@/core/schemas";

/** Factory: create a tool that delegates to an executor with `{ ...params, mode }`. */
function makeTool(desc: string, schema: ZodType, mode: string, exec: (p: any, tm?: TemplateManager) => Promise<any>, tm?: TemplateManager): AgentTool {
    return safeAgentTool({ description: desc, inputSchema: schema, execute: (p) => exec({ ...p, mode }, tm) });
}

/** Factory: MarkdownOnly variant — forces response_format:’markdown’. */
function makeMarkdownOnlyTool(desc: string, schema: ZodType, mode: string, exec: (p: any, tm?: TemplateManager) => Promise<any>, tm?: TemplateManager): AgentTool {
    return safeAgentTool({ description: desc, inputSchema: schema, execute: (p) => exec({ ...p, response_format: ‘markdown’, mode }, tm) });
}

export function inspectNoteContextTool(tm?: TemplateManager): AgentTool {
    return makeTool(`[Deep Dive] Understand a single note’s identity (tags, connections, location).`, inspectNoteContextInputSchema, ‘inspect_note_context’, inspectNoteContext, tm);
}
export function inspectNoteContextToolMarkdownOnly(tm?: TemplateManager): AgentTool {
    return makeMarkdownOnlyTool(`[Deep Dive] Understand a single note’s identity. Returns Markdown only.`, inspectNoteContextInputSchema, ‘inspect_note_context’, inspectNoteContext, tm);
}

export function graphTraversalTool(tm?: TemplateManager): AgentTool {
    return makeTool(`[Relational Discovery] Explore related notes within N degrees of separation (hops).`, graphTraversalInputSchema, ‘graph_traversal’, graphTraversal, tm);
}
export function graphTraversalToolMarkdownOnly(tm?: TemplateManager): AgentTool {
    return makeMarkdownOnlyTool(`[Relational Discovery] Explore related notes within N hops. Returns Markdown only.`, graphTraversalInputSchema, ‘graph_traversal’, graphTraversal, tm);
}

export function findPathTool(tm?: TemplateManager): AgentTool {
    return makeTool(`Discover connection paths between two specific notes.`, findPathInputSchema, ‘find_path’, findPath, tm);
}
export function findKeyNodesTool(tm?: TemplateManager): AgentTool {
    return makeTool(`Identify influential notes (high connectivity nodes, hubs) in the vault.`, findKeyNodesInputSchema, ‘find_key_nodes’, findKeyNodes, tm);
}
export function findOrphansTool(tm?: TemplateManager): AgentTool {
    return makeTool(`Find disconnected/unlinked notes (orphans) in the vault.`, findOrphansInputSchema, ‘find_orphans’, findOrphanNotes, tm);
}
export function searchByDimensionsTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Complex multi-criteria searches with boolean logic. Use tag:value, functional:value, AND, OR, NOT, parentheses. Example: tag:javascript AND functional:programming`,
        searchByDimensionsInputSchema, ‘search_by_dimensions’, searchByDimensions, tm,
    );
}

export function exploreFolderTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Inspect vault structure with spatial navigation. Walk through folders, check contents, discover organization.`,
        exploreFolderInputSchema, ‘explore_folder’, exploreFolder, tm,
    );
}
export function exploreFolderToolMarkdownOnly(tm?: TemplateManager): AgentTool {
    return makeMarkdownOnlyTool(`Inspect vault structure (Markdown-only output).`, exploreFolderInputSchema, ‘explore_folder’, exploreFolder, tm);
}

export function grepFileTreeTool(): AgentTool {
    return safeAgentTool({
        description: `[Anchor phase] Grep the full vault file tree by pattern (substring or regex). Returns matching paths.`,
        inputSchema: grepFileTreeInputSchema,
        execute: (params) => grepFileTree(params),
    });
}

export function recentChangesWholeVaultTool(tm?: TemplateManager): AgentTool {
    return makeTool(`View recently modified notes in the whole vault.`, recentChangesWholeVaultInputSchema, ‘recent_changes_whole_vault’, getRecentChanges, tm);
}

export function localSearchWholeVaultTool(tm?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Full-text and semantic search across the vault.`,
        inputSchema: localSearchWholeVaultInputSchema,
        execute: async (params) => {
            const rawFolder = params.folder_path;
            const folderPath = rawFolder != null && String(rawFolder).trim() !== ‘’
                ? String(rawFolder).trim().replace(/\/+$/, ‘’) : undefined;
            return localSearch({
                ...params, mode: ‘local_search_whole_vault’,
                scopeValue: { currentFilePath: params.current_file_path, folderPath, limitIdsSet: params.limit_ids_set },
            }, tm);
        }
    });
}
