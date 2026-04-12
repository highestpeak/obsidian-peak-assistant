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

import type { Vault, MetadataCache, CachedMetadata, TFile } from 'obsidian';

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
