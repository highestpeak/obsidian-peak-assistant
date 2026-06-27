import { AgentTool, safeAgentTool } from "./types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import type { ZodType } from "@/core/schemas";
import type { SearchClient } from "@/service/search/SearchClient";
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
import { exploreFolder, type ExploreFolderEnv } from "./search-graph-inspector/explore-folder";
import { grepFileTree } from "./search-graph-inspector/grep-file-tree";
import { getRecentChanges } from "./search-graph-inspector/recent-change-whole-vault";
import { localSearch } from "./search-graph-inspector/local-search";


/** Factory: create a tool that delegates to an executor with `{ ...params, mode }`. */
function makeTool(
    desc: string,
    schema: ZodType,
    mode: string,
    exec: (p: any, tm?: TemplateManager) => Promise<any>,
    tm?: TemplateManager,
    opts?: { forceFormat?: 'markdown' | 'structured' },
): AgentTool {
    return safeAgentTool({
        description: desc,
        inputSchema: schema,
        execute: (p) => exec({
            ...p,
            mode,
            ...(opts?.forceFormat ? { response_format: opts.forceFormat } : {}),
        }, tm),
    });
}

export function inspectNoteContextTool(tm?: TemplateManager, opts?: { forceFormat?: 'markdown' | 'structured' }): AgentTool {
    return makeTool(
        `Single-note deep dive — tags, functional categories, in/out links, semantic neighbors.\n\n` +
        `When to use:\n` +
        `- After local_search finds a candidate, to fully understand one note before including it as evidence\n\n` +
        `Avoid when:\n` +
        `- You need to inspect multiple notes in bulk — call graph_traversal from a common anchor instead`,
        inspectNoteContextInputSchema, 'inspect_note_context', inspectNoteContext, tm, opts,
    );
}

export function graphTraversalTool(tm?: TemplateManager, opts?: { forceFormat?: 'markdown' | 'structured' }): AgentTool {
    return makeTool(
        `BFS from a start note across N hops of physical + optional semantic links.\n\n` +
        `When to use:\n` +
        `- Understanding a note's knowledge neighborhood; 1-2 hops for direct cluster, 3 hops only when results are too sparse\n\n` +
        `Avoid when:\n` +
        `- You want the shortest path between two notes — use find_path`,
        graphTraversalInputSchema, 'graph_traversal', graphTraversal, tm, opts,
    );
}


export function findPathTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Discover connection paths between two known notes using one of three strategies (reliable/fastTrack/brainstorm).\n\n` +
        `When to use:\n` +
        `- "How are note A and note B related?" — directional bridge finding\n\n` +
        `Avoid when:\n` +
        `- You don't know both endpoints — use graph_traversal for open-ended exploration`,
        findPathInputSchema, 'find_path', findPath, tm,
    );
}

export function findKeyNodesTool(tm: TemplateManager | undefined, getSearchClient: () => SearchClient | null): AgentTool {
    return safeAgentTool({
        description:
            `Vault-wide influential note discovery using RRF on out-degree, in-degree, and optional semantic filter. ` +
            `Node types: hub (many outgoing), authority (many incoming), bridge (cross-category), balanced.\n\n` +
            `When to use:\n` +
            `- Orientation at the start of recon when you need to find the most important notes in a topic area\n\n` +
            `Avoid when:\n` +
            `- You already have a starting note — start with inspect_note_context or graph_traversal instead`,
        inputSchema: findKeyNodesInputSchema,
        execute: async (p) => {
            const sc = getSearchClient();
            if (!sc) throw new Error('find_key_nodes: SearchClient not ready');
            return findKeyNodes({ ...p, mode: 'find_key_nodes' }, sc, tm);
        },
    });
}

export function findOrphansTool(tm?: TemplateManager): AgentTool {
    return makeTool(
        `Discover disconnected notes (no physical links) with semantic revival suggestions. ` +
        `revival_suggestion field: nearest semantically similar non-orphan note — agent can propose linking it.\n\n` +
        `When to use:\n` +
        `- Knowledge base maintenance and gap discovery, not search tasks`,
        findOrphansInputSchema, 'find_orphans', findOrphanNotes, tm,
    );
}

export function searchByDimensionsTool(tm: TemplateManager | undefined, getSearchClient: () => SearchClient | null): AgentTool {
    return safeAgentTool({
        description:
            `Boolean-expression filter over tag/functional dimensions (e.g. tag:javascript AND functional:programming). ` +
            `Rules: only tag:value and functional:value prefixes; values must be single words (no spaces, no special characters). ` +
            `Error output: when no results found, returns diagnosis with unknown_tags and known_tags — use these to self-correct.\n\n` +
            `Avoid when:\n` +
            `- Searching by content keywords — use local_search_whole_vault`,
        inputSchema: searchByDimensionsInputSchema,
        execute: async (p) => {
            const sc = getSearchClient();
            if (!sc) throw new Error('search_by_dimensions: SearchClient not ready');
            return searchByDimensions({ ...p, mode: 'search_by_dimensions' }, sc, tm);
        },
    });
}

export function exploreFolderTool(
    tm: TemplateManager | undefined,
    opts: { forceFormat?: 'markdown' | 'structured' } | undefined,
    getEnv: () => ExploreFolderEnv,
): AgentTool {
    return safeAgentTool({
        description:
            `Vault folder structure inspection with per-folder item caps and extension summaries.\n\n` +
            `When to use:\n` +
            `- After grep_file_tree finds a folder anchor, to see its contents and structure; max_depth: 1 for quick browse, 2 standard, 3 for deep structure mapping\n\n` +
            `Avoid when:\n` +
            `- You just need to check if a path exists — use grep_file_tree`,
        inputSchema: exploreFolderInputSchema,
        execute: (p) => exploreFolder({
            ...p,
            mode: 'explore_folder',
            ...(opts?.forceFormat ? { response_format: opts.forceFormat } : {}),
        }, getEnv(), tm),
    });
}

export function grepFileTreeTool(getEnv: () => ExploreFolderEnv): AgentTool {
    return safeAgentTool({
        description:
            `Pattern-match against all vault file paths (regex or substring). Returns paths only.\n\n` +
            `When to use:\n` +
            `- First step to find anchor paths or folder names before deeper exploration; fastest path-discovery available\n\n` +
            `Avoid when:\n` +
            `- You need file content or structure — use explore_folder after finding anchor paths`,
        inputSchema: grepFileTreeInputSchema,
        execute: (params) => grepFileTree(params, getEnv()),
    });
}

export function recentChangesWholeVaultTool(tm: TemplateManager | undefined, getSearchClient: () => SearchClient | null): AgentTool {
    return safeAgentTool({
        description:
            `Recently modified notes, sorted by mtime.\n\n` +
            `When to use:\n` +
            `- Establishing user's current focus at the start of recon; gives temporal context before running targeted searches\n\n` +
            `Avoid when:\n` +
            `- You need precise search results — this is orientation, not discovery`,
        inputSchema: recentChangesWholeVaultInputSchema,
        execute: async (params) => {
            const sc = getSearchClient();
            if (!sc) throw new Error('recent_changes_whole_vault: SearchClient not ready');
            return getRecentChanges({ ...params, mode: 'recent_changes_whole_vault' }, sc, tm);
        },
    });
}

export function localSearchWholeVaultTool(tm: TemplateManager | undefined, getSearchClient: () => SearchClient | null): AgentTool {
    return safeAgentTool({
        description:
            `Full-text, vector, or hybrid search across vault content.\n\n` +
            `When to use:\n` +
            `- Finding notes by keyword or concept; use fulltext for exact terms, vector for semantic concepts, hybrid for best of both\n\n` +
            `Avoid when:\n` +
            `- You already know the tag/category structure — use search_by_dimensions instead`,
        inputSchema: localSearchWholeVaultInputSchema,
        execute: async (params) => {
            const sc = getSearchClient();
            if (!sc) throw new Error('local_search_whole_vault: SearchClient not ready');
            const rawFolder = params.folder_path;
            const folderPath = rawFolder != null && String(rawFolder).trim() !== ''
                ? String(rawFolder).trim().replace(/\/+$/, '') : undefined;
            return localSearch({
                ...params, mode: 'local_search_whole_vault',
                scopeValue: { currentFilePath: params.current_file_path, folderPath, limitIdsSet: params.limit_ids_set },
            }, sc, tm);
        }
    });
}
