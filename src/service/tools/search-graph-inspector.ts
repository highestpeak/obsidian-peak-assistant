import { AgentTool, safeAgentTool } from "./types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import {
	exploreFolderInputSchema,
	findKeyNodesInputSchema,
	findOrphansInputSchema,
	findPathInputSchema,
	graphTraversalInputSchema,
	grepFileTreeInputSchema,
	inspectNoteContextInputSchema,
	localSearchWholeVaultInputSchema,
	recentChangesWholeVaultInputSchema,
	searchByDimensionsInputSchema,
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

/**
 * Tool 1: inspect_note_context
 */
export function inspectNoteContextTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `[Deep Dive] [detailed analysis] Use this tool to understand a single note's identity (tags, connections, location). Includes 'get_note_connections', 'get_note_tags', 'get_note_categories'.`,
        inputSchema: inspectNoteContextInputSchema,
        execute: async (params) => {
            return await inspectNoteContext({ ...params, mode: 'inspect_note_context' }, templateManager);
        }
    });
}

/** inspect_note_context variant that always returns Markdown. Used in recon to avoid structured output inflating context. */
export function inspectNoteContextToolMarkdownOnly(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `[Deep Dive] Use this tool to understand a single note's identity (tags, connections, location). Returns Markdown only.`,
        inputSchema: inspectNoteContextInputSchema,
        execute: async (params) => {
            return await inspectNoteContext(
                { ...params, response_format: 'markdown', mode: 'inspect_note_context' },
                templateManager
            );
        }
    });
}

/**
 * Tool 2: graph_traversal
 * hops=3 limit=30 structured output for a normal doc may lead to 100KB output witch may count to 50k tokens.
 * hops=3 limit=100 structured output for a normal doc may lead to 217KB output witch may count to 100k tokens.
 * hops=3 limit=100 structured output for a doc with a lot outlinks(50) may lead to 255KB output witch may count to 100k tokens.
 */
export function graphTraversalTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `[Relational Discovery] Explore related notes within N degrees of separation (hops). Find knowledge clusters and neighborhood.`,
        inputSchema: graphTraversalInputSchema,
        execute: async (params) => {
            return await graphTraversal({ ...params, mode: 'graph_traversal' }, templateManager);
        }
    });
}

/** graph_traversal variant that always returns Markdown. Used in recon to avoid structured output inflating context. */
export function graphTraversalToolMarkdownOnly(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `[Relational Discovery] Explore related notes within N degrees of separation (hops). Returns Markdown only.`,
        inputSchema: graphTraversalInputSchema,
        execute: async (params) => {
            return await graphTraversal(
                { ...params, response_format: 'markdown', mode: 'graph_traversal' },
                templateManager
            );
        }
    });
}

/**
 * Tool 3: find_path
 * no support for sorting multiple paths by relevance/modification. meaningless for most cases. and also meaningless for sorting nodes in the path.
 */
export function findPathTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Discover connection paths between two specific notes. Useful for finding how two concepts are related.`,
        inputSchema: findPathInputSchema,
        execute: async (params) => {
            return await findPath({ ...params, mode: 'find_path' }, templateManager);
        }
    });
}

/**
 * Tool 4: find_key_nodes
 */
export function findKeyNodesTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Identify influential notes (high connectivity nodes, hubs) in the vault.`,
        inputSchema: findKeyNodesInputSchema,
        execute: async (params) => {
            return await findKeyNodes({ ...params, mode: 'find_key_nodes' }, templateManager);
        }
    });
}

/**
 * Tool 5: find_orphans
 */
export function findOrphansTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Find disconnected/unlinked notes (orphans) in the vault.`,
        inputSchema: findOrphansInputSchema,
        execute: async (params) => {
            return await findOrphanNotes({ ...params, mode: 'find_orphans' }, templateManager);
        }
    });
}

/**
 * Tool 6: search_by_dimensions
 * example: user asks: "find the low-risk financial suggestions suitable for a layperson in my personal finance notes."
 *     AI => search_by_dimensions: tag:FinancialPlanning OR category:Finance
 *     AI => semantic_filter: "layperson、low-risk、stable income、anti-greed"
 */
export function searchByDimensionsTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Complex multi-criteria searches. Advanced filtering by tags, folders, time ranges with boolean logic. ` +
            `Use only tag:value, category:value, AND, OR, NOT, and parentheses. Each value must be a single word (no spaces, no special characters). ` +
            `Example: tag:javascript AND category:programming or (tag:react OR tag:vue) AND category:frontend`,
        inputSchema: searchByDimensionsInputSchema,
        execute: async (params) => {
            return await searchByDimensions({ ...params, mode: 'search_by_dimensions' }, templateManager);
        }
    });
}

/**
 * Tool 7: explore_folder
 */
export function exploreFolderTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Inspect vault structure with spatial navigation. `
                    + `Use this to 'walk' through folders. Best paired with 'response_format: markdown' to visualize the directory tree clearly.`
                    + `Use this when you need to:`
                    + `\n- Browse folders and understand vault organization`
                    + `\n- Check folder contents before moving or organizing notes`
                    + `\n- Discover vault structure for better context understanding`,
        inputSchema: exploreFolderInputSchema,
        execute: async (params) => {
            return await exploreFolder({ ...params, mode: 'explore_folder' }, templateManager);
        }
    });
}

/**
 * explore_folder variant that always returns Markdown.
 * Useful for recon/breadth agents to prevent structured output from inflating context.
 */
export function exploreFolderToolMarkdownOnly(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description:
            `Inspect vault structure with spatial navigation (Markdown-only output). `
            + `This tool will always return Markdown regardless of response_format.`,
        inputSchema: exploreFolderInputSchema,
        execute: async (params) => {
            return await exploreFolder(
                { ...params, response_format: 'markdown', mode: 'explore_folder' },
                templateManager
            );
        }
    });
}

/**
 * Tool: grep_file_tree — fast anchor finding over full vault path list.
 */
export function grepFileTreeTool(): AgentTool {
    return safeAgentTool({
        description:
            `[Anchor phase] Grep the full vault file tree by pattern (substring or regex). `
            + `Returns matching paths so you can choose which folders to explore_folder or which nodes to graph_traversal. `
            + `Use in recon to quickly find anchor paths or directory names.`,
        inputSchema: grepFileTreeInputSchema,
        execute: async (params) => grepFileTree(params),
    });
}

/**
 * Tool 8: recent_changes_whole_vault
 */
export function recentChangesWholeVaultTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `View recently modified notes in the whole vault. Great for understanding users' current focus.`,
        inputSchema: recentChangesWholeVaultInputSchema,
        execute: async (params) => {
            return await getRecentChanges({ ...params, mode: 'recent_changes_whole_vault' }, templateManager);
        }
    });
}

/**
 * Tool 9: local_search_whole_vault
 * great for inspector support. As web searching isn’t semantically driven to inspect a vault, we switched the web search tool with another tool.
 */
export function localSearchWholeVaultTool(templateManager?: TemplateManager): AgentTool {
    return safeAgentTool({
        description: `Full-text and semantic search across the vault. Use keywords or semantic description to find relevant notes.`,
        inputSchema: localSearchWholeVaultInputSchema,
        execute: async (params) => {
            const rawFolder = params.folder_path;
            const folderPath = rawFolder != null && String(rawFolder).trim() !== ''
                ? String(rawFolder).trim().replace(/\/+$/, '')
                : undefined;
            const scopeValue = {
                currentFilePath: params.current_file_path,
                folderPath,
                limitIdsSet: params.limit_ids_set
            };
            return await localSearch(
                { ...params, scopeValue, mode: 'local_search_whole_vault' },
                templateManager
            );
        }
    });
}
