/**
 * In-process MCP server exposing Obsidian Vault operations as tools for
 * Claude Agent SDK. Tools run in the plugin process (not the subprocess),
 * so they have full access to app.vault, app.metadataCache, and plugin state.
 *
 * Tool implementations are pure functions that accept Vault-like / metadata-
 * cache-like interfaces, so they're testable with simple mocks. The actual
 * MCP tool wrapper (createSdkMcpServer + tool()) is added in Task 8.
 *
 * Tools defined here (added incrementally across tasks 5-8):
 *   Task 5:  vault_list_folders
 *   Task 6:  vault_read_folder, vault_read_note
 *   Task 7:  vault_grep, vault_wikilink_expand
 *   Task 8:  submit_plan + buildVaultMcpServer wrapper
 */

import type { Vault, MetadataCache, CachedMetadata, TFile, App } from 'obsidian';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ─── vault_list_folders ──────────────────────────────────────────────────────

export interface ListFoldersParams {
    maxDepth?: number;
}

export interface FolderInfo {
    path: string;
    mdCount: number;
}

export interface ListFoldersResult {
    folders: FolderInfo[];
    totalMdFiles: number;
}

/**
 * Pure implementation callable from tests with a mocked Vault. Enumerates
 * folders up to `maxDepth` levels deep and counts all markdown files under
 * each folder (recursive count, so kb2 includes files in kb2/sub/).
 *
 * Results sorted by mdCount descending so the agent sees the largest
 * collections first — these are the most common targets for reflective
 * queries ("my X", "all Y").
 */
export async function listFoldersImpl(
    vault: Vault,
    params: ListFoldersParams
): Promise<ListFoldersResult> {
    const maxDepth = Math.max(1, Math.min(params.maxDepth ?? 2, 5));
    const files = vault.getMarkdownFiles();

    // folderPath → recursive md count
    const folderCounts = new Map<string, number>();

    for (const file of files) {
        const parts = file.path.split('/');
        // e.g., 'kb2/sub/note.md' → ['kb2', 'sub', 'note.md']
        // For each ancestor folder up to maxDepth, increment its count.
        const folderDepth = parts.length - 1; // number of folder levels
        const limit = Math.min(folderDepth, maxDepth);
        for (let d = 1; d <= limit; d++) {
            const folderPath = parts.slice(0, d).join('/');
            folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
        }
    }

    const folders: FolderInfo[] = Array.from(folderCounts.entries())
        .map(([path, mdCount]) => ({ path, mdCount }))
        .sort((a, b) => b.mdCount - a.mdCount);

    return {
        folders,
        totalMdFiles: files.length,
    };
}

// ─── vault_read_folder ───────────────────────────────────────────────────────

export interface ReadFolderParams {
    folder: string;
    recursive?: boolean;
}

export interface ReadFolderFileInfo {
    path: string;
    basename: string;
}

export interface ReadFolderResult {
    folder: string;
    files: ReadFolderFileInfo[];
    totalCount: number;
}

/**
 * List markdown files under a folder prefix. Recursive by default; when
 * `recursive` is false, returns only immediate children of the folder.
 */
export async function readFolderImpl(
    vault: Vault,
    params: ReadFolderParams
): Promise<ReadFolderResult> {
    const folder = params.folder.replace(/\/+$/, ''); // strip trailing slash
    const recursive = params.recursive ?? true;
    const allFiles = vault.getMarkdownFiles();

    const matches = allFiles.filter((f) => {
        if (!f.path.startsWith(folder + '/') && f.path !== folder) return false;
        if (recursive) return true;
        // Non-recursive: only immediate children (no further slashes)
        const rest = f.path.slice(folder.length + 1);
        return !rest.includes('/');
    });

    return {
        folder,
        files: matches.map((f) => ({
            path: f.path,
            basename: (f as TFile).basename,
        })),
        totalCount: matches.length,
    };
}

// ─── vault_read_note ─────────────────────────────────────────────────────────

export interface ReadNoteParams {
    path: string;
    maxChars?: number;
}

export interface ReadNoteResult {
    path: string;
    frontmatter: Record<string, unknown>;
    bodyPreview: string;
    wikilinks: string[];
    tags: string[];
    error?: string;
}

/**
 * Read a note's frontmatter, body preview, wikilinks, and tags. Returns an
 * error field if the file can't be located. Body preview is truncated to
 * `maxChars` (default 3000) and strips the frontmatter block.
 */
export async function readNoteImpl(
    vault: Vault,
    metadataCache: MetadataCache,
    params: ReadNoteParams
): Promise<ReadNoteResult> {
    const maxChars = params.maxChars ?? 3000;
    const file = vault.getAbstractFileByPath(params.path) as TFile | null;
    if (!file || !('extension' in file)) {
        return {
            path: params.path,
            frontmatter: {},
            bodyPreview: '',
            wikilinks: [],
            tags: [],
            error: 'not found',
        };
    }

    const content = await vault.cachedRead(file);
    const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    const bodyPreview = body.slice(0, maxChars);

    const cache: CachedMetadata | null = metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const wikilinks = (cache?.links ?? []).map((l) => l.link);
    const tags = (cache?.tags ?? []).map((t) => t.tag);

    return {
        path: params.path,
        frontmatter,
        bodyPreview,
        wikilinks,
        tags,
    };
}

// ─── vault_wikilink_expand ───────────────────────────────────────────────────

export interface WikilinkExpandParams {
    startPath: string;
    maxSteps?: number;
}

export interface WikilinkExpandResult {
    startPath: string;
    visited: string[];
}

/**
 * BFS over the wikilink graph starting at `startPath`. Traverses `[[links]]`
 * up to `maxSteps` hops deep (clamped 1-4). Uses metadata cache's
 * `getFirstLinkpathDest` to resolve link references to actual note paths.
 *
 * Used by the agent to follow user-declared semantic edges — more reliable
 * than vector similarity on personal vaults where user naming is inconsistent.
 */
export async function wikilinkExpandImpl(
    vault: Vault,
    metadataCache: MetadataCache,
    params: WikilinkExpandParams
): Promise<WikilinkExpandResult> {
    const maxSteps = Math.max(1, Math.min(params.maxSteps ?? 2, 4));
    const visited = new Set<string>();
    const queue: { path: string; depth: number }[] = [{ path: params.startPath, depth: 0 }];

    while (queue.length > 0) {
        const { path, depth } = queue.shift()!;
        if (visited.has(path)) continue;
        visited.add(path);
        if (depth >= maxSteps) continue;

        const file = vault.getAbstractFileByPath(path) as TFile | null;
        if (!file) continue;
        const cache = metadataCache.getFileCache(file);
        if (!cache?.links) continue;

        for (const linkRef of cache.links) {
            const dest = metadataCache.getFirstLinkpathDest(linkRef.link, path);
            if (dest && !visited.has(dest.path)) {
                queue.push({ path: dest.path, depth: depth + 1 });
            }
        }
    }

    return {
        startPath: params.startPath,
        visited: Array.from(visited),
    };
}

// ─── vault_grep ──────────────────────────────────────────────────────────────

export interface GrepParams {
    query: string;
    limit?: number;
}

export interface GrepHit {
    path: string;
    snippet: string;
    score: number;
}

export interface GrepResult {
    query: string;
    hits: GrepHit[];
}

/**
 * Generic grep impl. The caller supplies a searchFn that wraps the existing
 * FTS/hybrid search client. This lets us test in isolation and lets the MCP
 * tool wrapper inject the real search client at runtime (Task 8).
 *
 * Clamps limit to 1-50.
 */
export async function grepImpl(
    searchFn: (query: string, limit: number) => Promise<GrepHit[]>,
    params: GrepParams
): Promise<GrepResult> {
    const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
    const hits = await searchFn(params.query, limit);
    return { query: params.query, hits };
}

// ─── submit_plan (HITL trigger) ───────────────────────────────────────────────

export interface SubmitPlanInput {
    selected_paths: string[];
    rationale: string;
    proposed_outline: string;
    coverage_assessment: string;
    follow_up_questions?: string[];
    plan_sections?: Array<{
        id: string;
        title: string;
        content_type: string;
        visual_type: string;
        evidence_paths: string[];
        brief: string;
        weight: number;
        mission_role: string;
    }>;
}

export interface SubmitPlanFeedback {
    approved: boolean;
    adjustedPaths?: string[];
    adjustedOutline?: string;
    message?: string;
}

// ─── buildVaultMcpServer ──────────────────────────────────────────────────────

/**
 * Minimal search function signature the MCP tool wrapper expects. The real
 * implementation wraps the plugin's SearchClient in VaultSearchAgentSDK
 * (Task 11) and passes it here.
 */
export type GrepSearchFn = (
    query: string,
    limit: number
) => Promise<GrepHit[]>;

export interface VaultMcpServerDeps {
    app: App;
    /** Injected search function (wraps existing FTS/hybrid search at the call site). */
    searchFn: GrepSearchFn;
    /** Invoked when the LLM calls submit_plan. Returns user feedback. */
    onSubmitPlan: (plan: SubmitPlanInput) => Promise<SubmitPlanFeedback>;
}

/**
 * Build the in-process MCP server exposing vault tools to Claude Agent SDK.
 * Returns the server config object to pass to query({
 *   options: { mcpServers: { vault: server } }
 * }).
 *
 * All tools run in the plugin process (not in the SDK's subprocess). When
 * the agent calls a tool, the SDK routes the call back to us via IPC and
 * we execute the pure impl against `deps.app.vault` / `deps.app.metadataCache`.
 */
export function buildVaultMcpServer(deps: VaultMcpServerDeps) {
    const { app, searchFn, onSubmitPlan } = deps;

    const listFolders = tool(
        'vault_list_folders',
        'List top-level folders in the vault with markdown file counts. CALL THIS FIRST for reflective queries like "my X" or "all Y". The result shows you the user\'s folder taxonomy so you can decide which folders to enumerate.',
        {
            maxDepth: z.number().min(1).max(5).default(2),
        },
        async (input, _extra) => {
            const result = await listFoldersImpl(app.vault, {
                maxDepth: input.maxDepth,
            });
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    const readFolder = tool(
        'vault_read_folder',
        'List all markdown files in a specific folder. Use after vault_list_folders has told you which folder to dive into. Recursive by default.',
        {
            folder: z.string(),
            recursive: z.boolean().default(true),
        },
        async (input, _extra) => {
            const result = await readFolderImpl(app.vault, {
                folder: input.folder,
                recursive: input.recursive,
            });
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    const readNote = tool(
        'vault_read_note',
        'Read a single note: frontmatter, wikilinks, tags, and body preview (first N chars). Use after vault_read_folder gives you candidate paths.',
        {
            path: z.string(),
            maxChars: z.number().min(100).max(20000).default(3000),
        },
        async (input, _extra) => {
            const result = await readNoteImpl(
                app.vault,
                app.metadataCache,
                { path: input.path, maxChars: input.maxChars }
            );
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    const grep = tool(
        'vault_grep',
        'Full-text keyword search across the vault (FTS + vector hybrid). Use for specific-concept queries ("what did I write about X"). Do NOT use this as the first tool for reflective queries — it collapses on homogeneous folders.',
        {
            query: z.string(),
            limit: z.number().min(1).max(50).default(20),
        },
        async (input, _extra) => {
            const result = await grepImpl(searchFn, {
                query: input.query,
                limit: input.limit,
            });
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    const wikilinkExpand = tool(
        'vault_wikilink_expand',
        'Follow wikilinks N hops from a starting note. Use to find notes connected by the user\'s explicit semantic edges (more reliable than vector similarity on personal vaults).',
        {
            startPath: z.string(),
            maxSteps: z.number().min(1).max(4).default(2),
        },
        async (input, _extra) => {
            const result = await wikilinkExpandImpl(
                app.vault,
                app.metadataCache,
                { startPath: input.startPath, maxSteps: input.maxSteps }
            );
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    const submitPlan = tool(
        'vault_submit_plan',
        'Call this when you have gathered enough evidence to propose a plan for the final report. The user will review and either approve or request adjustments. selected_paths must contain all vault paths you want cited in the final report.',
        {
            selected_paths: z.array(z.string()),
            rationale: z.string(),
            proposed_outline: z.string(),
            coverage_assessment: z.string(),
            follow_up_questions: z.array(z.string()).optional().describe('3-5 context-specific follow-up questions the user might ask next'),
            plan_sections: z.array(z.object({
                id: z.string(),
                title: z.string().describe('Conclusion-as-heading: a short finding sentence, max 50 chars. E.g. "3 projects viable, PeakAssistant fastest to revenue"'),
                content_type: z.enum(['enumeration', 'comparison', 'analysis', 'recommendation', 'timeline']),
                visual_type: z.enum(['table', 'quadrantChart', 'flowchart', 'timeline', 'mindmap', 'none']),
                evidence_paths: z.array(z.string()).describe('Vault paths relevant to this section'),
                brief: z.string().describe('1-2 sentence description of section content'),
                weight: z.number().min(0).max(10).describe('Display weight: 1-3=small, 4-6=medium, 7-10=full-width'),
                mission_role: z.enum([
                    'synthesis',
                    'contradictions',
                    'trade_off',
                    'action_plan',
                    'risk_audit',
                    'roadmap',
                    'decomposition',
                    'blindspots',
                    'probing_horizon',
                ]).describe('Block mission role from McKinsey report framework'),
            })).optional().describe('Structured report plan: 3-6 sections with content types and visual prescriptions'),
        },
        async (input, _extra) => {
            const feedback = await onSubmitPlan({
                selected_paths: input.selected_paths,
                rationale: input.rationale,
                proposed_outline: input.proposed_outline,
                coverage_assessment: input.coverage_assessment,
                follow_up_questions: input.follow_up_questions,
                plan_sections: input.plan_sections,
            });
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(feedback, null, 2) }],
            };
        }
    );

    return createSdkMcpServer({
        name: 'vault',
        version: '1.0.0',
        tools: [
            listFolders,
            readFolder,
            readNote,
            grep,
            wikilinkExpand,
            submitPlan,
        ],
    });
}
