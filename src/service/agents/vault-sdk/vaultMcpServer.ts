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

import type { Vault } from 'obsidian';

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
