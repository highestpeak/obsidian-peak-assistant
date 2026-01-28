import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod/v3"
import { inspectNoteContext } from "./search-graph-inspector/inspect-note-context";
import { graphTraversal } from "./search-graph-inspector/graph-traversal";
import { findPath } from "./search-graph-inspector/find-path";
import { findKeyNodes } from "./search-graph-inspector/find-key-nodes";
import { findOrphanNotes } from "./search-graph-inspector/find-orphans";
import { searchByDimensions } from "./search-graph-inspector/search-by-dimensions";
import { exploreFolder } from "./search-graph-inspector/explore-folder";
import { getRecentChanges } from "./search-graph-inspector/recent-change-whole-vault";
import { localSearch } from "./search-graph-inspector/local-search";

// Define sorter options
const SorterOption = z.enum([
    'result_rank_desc', 'result_rank_asc',
    'created_desc', 'created_asc',
    'modified_desc', 'modified_asc',
    'total_links_count_desc', 'total_links_count_asc',
    'backlinks_count_desc', 'backlinks_count_asc',
    'outlinks_count_desc', 'outlinks_count_asc'
]);

// Define filter options - eliminate logical redundancy
const FilterOption = z.object({
    tag_category_boolean_expression: z.string().optional()
        .describe("Complex boolean expression for filtering. Supports: tag:value, category:value, AND, OR, NOT, parentheses. "
            + "Category/tags refers to a field in the metadata of the note."
            + "Example: '(tag:react OR tag:vue) AND category:frontend'"),

    // Single choice type selection - eliminates conflicts with boolean flags
    type: z.enum(['note', 'folder', 'file', 'all']).optional().default('all')
        .describe("note (markdown only), file (attachments), folder, or all (everything). Default is 'all'."),
    path: z.string().optional().describe("Regex or prefix for file paths"),

    /**
     * Semantic time filtering
     * AI will match natural language (e.g., "yesterday", "this week", "recent month") to these ranges
     *  High tolerance: AI will never fail due to incorrect date format (e.g., 12/05/2026 vs 05/12/2026).
     */
    modified_within: z.enum([
        'today',        // 24 hours
        'yesterday',    // 48 hours
        'this_week',    // 7 days
        'this_month',   // 30 days
        // user often seeks "recent quarter" work
        'last_3_months', // 90 days
        'this_year'     // 365 days
    ]).optional(),

    created_within: z.enum([
        'today',
        'yesterday',
        'this_week',
        'this_month',
        // user often seeks "recent quarter" work
        'last_3_months',
        'this_year',
    ]).optional()
});

// Define semantic filter (optional advanced feature) - prevent hallucination
const SemanticFilter = z.object({
    query: z.string().describe('A descriptive phrase of the concept you\'re looking for. Example: \'advanced machine learning optimization\' (don\'t use single keywords).'),
    topK: z.number().min(1).max(50).default(20).describe('Number of top similar nodes to keep')
});

const ResponseFormat = z.object({
    response_format: z.enum(['structured', 'markdown', 'hybrid'])
        .default('hybrid')
        // also AI may auto switch the mode when it meet some troubles in other modes.
        .describe("Choose 'markdown' if you need to reason about relationships, summarize content, or present findings. "
            + "Choose 'structured' if you are performing multi-step operations for programmatic piping (e.g., getting IDs for another tool)."
            + "Choose 'hybrid' if you need to get both data and context. But avoid this as it may cause context overflow(especially for graph_traversal).")
});

// Base parameter blocks for reuse
// Basic pagination/limiting
// NOTE: Use .optional().default(x) order so that Zod applies the default when param is not provided
const BaseLimit = z.object({
    limit: z.number().min(1).max(100).optional().default(20).describe('Maximum number of results(each step inner also. not so strictly.)')
});

// Semantic enhancement options
const SemanticOptions = z.object({
    // make more: expand results
    // The algorithm reuses the content of the current node. When it arrives at a point A, its query is formed using the content of A to search for neighboring vectors in the vector library dynamically and adaptively without requiring additional user input.
    include_semantic_paths: z.boolean().optional().default(false).describe('Include document semantic connection paths. Only semantic connection to document nodes.'),
    // make less: when semantic_filter is true, it will be a "guard", whenever the algorithm is about to walk to a new node, it will ask: "is this node related to the user's search intent (query)?"
    semantic_filter: SemanticFilter.optional()
        .describe("Semantic pruning/relevance filtering. The conceptual anchor for filtering. "
            + "Instead of 'AI', use 'Large language model architecture and training' to ensure vector relevance.")
});

/**
 * Tool 1: inspect_note_context
 */
export function inspectNoteContextTool(): AgentTool {
    return safeAgentTool({
        // No need for filters and sorters. as it's a single note context. Content will not be too much.
        description: `[Deep Dive] [detailed analysis] Use this tool to understand a single note's identity (tags, connections, location). Includes 'get_note_connections', 'get_note_tags', 'get_note_categories'.`,
        inputSchema: z.object({
            note_path: z.string()
        })
            .merge(BaseLimit)
            .extend({
                include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
                // Use structured by default for better tool chaining and graph reasoning
                response_format: ResponseFormat.shape.response_format.default('structured')
            }),
        execute: async (params) => {
            return await inspectNoteContext({ ...params, mode: 'inspect_note_context' });
        }
    });
}

/**
 * Tool 2: graph_traversal
 * hops=3 limit=30 structured output for a normal doc may lead to 100KB output witch may count to 50k tokens.
 * hops=3 limit=100 structured output for a normal doc may lead to 217KB output witch may count to 100k tokens.
 * hops=3 limit=100 structured output for a doc with a lot outlinks(50) may lead to 255KB output witch may count to 100k tokens.
 */
export function graphTraversalTool(): AgentTool {
    return safeAgentTool({
        description: `[Relational Discovery] Explore related notes within N degrees of separation (hops). Find knowledge clusters and neighborhood.`,
        inputSchema: z.object({
            start_note_path: z.string(),
            // The '6-degree separation' theory implies that with five jumps, almost all points in a small note database can be covered
            hops: z.number().min(1).max(3).default(1)
                .describe('3 hops is usually enough to cover a vast knowledge cluster. start with 1-2 hops. Only escalate to 3 hops if the results are too sparse.')
        })
            /*
             * When traversing the graph, the Agent has two choices:
             * Physical Hops: Walk along [[links]], e.g. A -> B -> C.
             * Semantic Hops: Walk along "meaning", e.g. A -> (semantically closest node) -> B.
             * Without SemanticOptions, graph_traversal works as a rigid crawler; with it, the Agent can discover paths that are physically disconnected but logically related.
             */
            .merge(SemanticOptions)
            .extend({
                filters: FilterOption.optional().describe('Only filter document nodes in each level.'),
                sorter: SorterOption.optional().describe('Only sort document nodes in each level.'),
                // traversal is usually an intermediate step, default to precise path arrays can reduce AI spelling errors.
                response_format: ResponseFormat.shape.response_format.default('structured'),
                // Exploration tools, using a larger limit to allow AI to get a more complete local graph.
                limit: z.number().min(1).max(100).optional().default(15).describe('Maximum number of results. do not set too large as it may cause context overflow.')
            }),
        execute: async (params) => {
            return await graphTraversal({ ...params, mode: 'graph_traversal' });
        }
    });
}

/**
 * Tool 3: find_path
 * no support for sorting multiple paths by relevance/modification. meaningless for most cases. and also meaningless for sorting nodes in the path.
 */
export function findPathTool(): AgentTool {
    return safeAgentTool({
        description: `Discover connection paths between two specific notes. Useful for finding how two concepts are related.`,
        inputSchema: z.object({
            start_note_path: z.string(),
            end_note_path: z.string()
        })
            .merge(BaseLimit)
            .extend({
                filters: FilterOption.optional().describe('Filter nodes in the path. May cost much more time and resources. As the graph algorithm is time-consuming.'),
                include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
                // find_path is usually an intermediate step, precise path arrays can reduce AI spelling errors.
                response_format: ResponseFormat.shape.response_format.default('structured'),
            }),
        execute: async (params) => {
            return await findPath({ ...params, mode: 'find_path' });
        }
    });
}

/**
 * Tool 4: find_key_nodes
 */
export function findKeyNodesTool(): AgentTool {
    return safeAgentTool({
        description: `Identify influential notes (high connectivity nodes, hubs) in the vault.`,
        inputSchema: z.object({})
            .merge(BaseLimit)
            .extend({
                filters: FilterOption.optional(),
                // normally user want to find the key nodes with the most backlinks.
                sorter: SorterOption.optional().default('backlinks_count_desc'),
                semantic_filter: SemanticOptions.shape.semantic_filter.optional(),
                // AI need to understand the meaning associations between these notes, or give the user a summary.
                response_format: ResponseFormat.shape.response_format.default('markdown')
            }),
        execute: async (params) => {
            return await findKeyNodes({ ...params, mode: 'find_key_nodes' });
        }
    });
}

/**
 * Tool 5: find_orphans
 */
export function findOrphansTool(): AgentTool {
    return safeAgentTool({
        description: `Find disconnected/unlinked notes (orphans) in the vault.`,
        inputSchema: z.object({})
            .extend({
                limit: z.number().min(1).max(1000).optional().default(50).describe('Maximum number of results.'),
                filters: FilterOption.optional(),
                sorter: SorterOption.optional(),
                // AI need to understand the meaning associations between these notes, or give the user a summary.
                response_format: ResponseFormat.shape.response_format.default('markdown')
            }),
        execute: async (params) => {
            return await findOrphanNotes({ ...params, mode: 'find_orphans' });
        }
    });
}

/**
 * Tool 6: search_by_dimensions
 * example: user asks: "find the low-risk financial suggestions suitable for a layperson in my personal finance notes."
 *     AI => search_by_dimensions: tag:FinancialPlanning OR category:Finance
 *     AI => semantic_filter: "layperson、low-risk、stable income、anti-greed"
 */
export function searchByDimensionsTool(): AgentTool {
    return safeAgentTool({
        description: `Complex multi-criteria searches. Advanced filtering by tags, folders, time ranges with boolean logic. E.g. "(tag:react OR tag:vue) AND category:frontend"`,
        inputSchema: z.object({
            boolean_expression: z.string()
                .describe("Complex boolean expression for filtering. Supports: tag:value, category:value, AND, OR, NOT, parentheses. "
                    + "Category/tags refers to a field in the metadata of the note."
                    + "Example: '(tag:react OR tag:vue) AND category:frontend'."
                    + "If no results are found, try relaxing the boolean constraints or switching to OR logic")
        })
            .merge(BaseLimit)
            .extend({
                // For search_by_dimensions, we only need to filter by type and time, so we exclude tag/category from filters.
                filters: FilterOption.omit({ tag_category_boolean_expression: true }).optional(),
                sorter: SorterOption.optional(),
                response_format: ResponseFormat.shape.response_format.default('structured')
            }),
        execute: async (params) => {
            return await searchByDimensions({ ...params, mode: 'search_by_dimensions' });
        }
    });
}

/**
 * Tool 7: explore_folder
 */
export function exploreFolderTool(): AgentTool {
    return safeAgentTool({
        description: `Inspect vault structure with spatial navigation. `
                    + `Use this to 'walk' through folders. Best paired with 'response_format: markdown' to visualize the directory tree clearly.`
                    + `Use this when you need to:`
                    + `\n- Browse folders and understand vault organization`
                    + `\n- Check folder contents before moving or organizing notes`
                    + `\n- Discover vault structure for better context understanding`,
        inputSchema: z.object({
            folderPath: z.string().default("/").describe("Folder path to inspect (relative to vault root, use '/' for root)"),
            recursive: z.boolean().default(true),
            // The depth of 2 usually shows the "folder -> sub-file" structure, which is more intuitive than depth 1 for "recursive browsing", while not generating too many results like depth 3.
            max_depth: z.number().min(1).max(3).optional().default(2)
                .describe('Only active when recursive: true. Use max_depth: 1 for quick navigation, use max_depth: 3 only for deep structure mapping.')
        })
            .merge(BaseLimit)
            .extend({
                filters: FilterOption.optional(),
                sorter: SorterOption.optional(),
                response_format: ResponseFormat.shape.response_format.default('markdown')
            }),
        execute: async (params) => {
            return await exploreFolder({ ...params, mode: 'explore_folder' });
        }
    });
}

/**
 * Tool 8: recent_changes_whole_vault
 */
export function recentChangesWholeVaultTool(): AgentTool {
    return safeAgentTool({
        description: `View recently modified notes in the whole vault. Great for understanding users' current focus.`,
        inputSchema: z.object({})
            .merge(BaseLimit)
            .extend({
                filters: FilterOption.optional(),
                sorter: SorterOption.optional(),
                // AI need to understand the recent changes, or give the user a summary.
                response_format: ResponseFormat.shape.response_format.default('markdown')
            }),
        execute: async (params) => {
            return await getRecentChanges({ ...params, mode: 'recent_changes_whole_vault' });
        }
    });
}

/**
 * Tool 9: local_search_whole_vault
 * great for inspector support. As web searching isn’t semantically driven to inspect a vault, we switched the web search tool with another tool.
 */
export function localSearchWholeVaultTool(): AgentTool {
    return safeAgentTool({
        description: `Full-text and semantic search across the vault. Use keywords or semantic description to find relevant notes.`,
        inputSchema: z.object({
            query: z.string().describe("The query to search for"),
            searchMode: z.enum(['fulltext', 'vector', 'hybrid'])
                .optional()
                .default('fulltext')
                .describe("Search mode: 'fulltext' (text only), 'vector' (embedding-based), or 'hybrid' (combine both)."),
            scopeMode: z.enum(['vault', 'inFile', 'inFolder', 'limitIdsSet'])
                .optional()
                .default('vault')
                .describe("Scope of search: 'vault' (entire vault), 'inFile' (current file), 'inFolder' (a folder and its subnotes), or 'limitIdsSet' (specific note ids set)."),
            // Flattened scope values
            current_file_path: z.string().nullable().optional()
                .describe("Current file path (if any). Used for inFile mode and directory boost."),
            folder_path: z.string().nullable().optional()
                .describe("Folder path (if inFolder mode)."),
            limit_ids_set: z.array(z.string()).optional()
                .describe("Set of note/document ids to limit search within (if limitIdsSet mode)."),
            // Default limit reduced for faster responses and less context overflow
            limit: z.number().min(1).max(100).optional().default(8)
                .describe('Maximum number of results. Keep small (8-12) for fast responses.')
        })
            .extend({
                filters: FilterOption.optional(),
                sorter: SorterOption.optional(),
                response_format: ResponseFormat.shape.response_format.default('structured')
            }),
        execute: async (params) => {
            // Reconstruct scopeValue object for the internal function
            const scopeValue = {
                currentFilePath: params.current_file_path,
                folderPath: params.folder_path,
                limitIdsSet: params.limit_ids_set
            };
            
            return await localSearch({ 
                ...params, 
                scopeValue,
                mode: 'local_search_whole_vault' 
            });
        }
    });
}
