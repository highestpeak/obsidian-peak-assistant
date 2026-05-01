/**
 * In-process filesystem MCP server exposing vault operations.
 *
 * Mirrors the tool surface the real vault MCP server exposes to VaultSearchAgent,
 * but reads from a fixture directory instead of Obsidian's Vault / MetadataCache.
 *
 * Tool names chosen to match what post-refactor VaultSearchAgent expects.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { listFiles, readFile, grep, readFrontmatter } from './fs-vault-reader';
import { buildLinkIndex, resolveLink, listBacklinks } from './link-resolver';

export interface FsVaultMcpOptions {
    rootDir: string;
}

export function createFsVaultMcpServer(opts: FsVaultMcpOptions) {
    const { rootDir } = opts;
    // Precompute link index once at server construction — fixture is static.
    const linkIndex = buildLinkIndex(rootDir);

    return createSdkMcpServer({
        name: 'fs-vault',
        version: '0.1.0',
        tools: [
            tool(
                'vault_list_files',
                'List all markdown notes in the vault, optionally filtered by a simple glob.',
                {
                    glob: z.string().optional().describe('Glob like "refactor/**/*.md" (optional).'),
                },
                async ({ glob }) => ({
                    content: [
                        {
                            type: 'text' as const,
                            text: listFiles(rootDir, glob).map((p) => `- ${p}`).join('\n'),
                        },
                    ],
                }),
            ),
            tool(
                'vault_read_note',
                'Read the full content of a note by vault-relative path.',
                {
                    path: z.string().describe('Vault-relative path, e.g. "refactor/provider-v2-overview.md".'),
                },
                async ({ path: relPath }) => ({
                    content: [{ type: 'text' as const, text: readFile(rootDir, relPath) }],
                }),
            ),
            tool(
                'vault_grep',
                'Full-text search across the vault for a literal substring. Optional scope prefix.',
                {
                    query: z.string().describe('Literal substring to search for.'),
                    scope: z.string().optional().describe('Optional path prefix, e.g. "multilingual/".'),
                },
                async ({ query, scope }) => {
                    const hits = grep(rootDir, query, scope);
                    if (hits.length === 0) {
                        return { content: [{ type: 'text' as const, text: 'No matches.' }] };
                    }
                    const preview = hits
                        .slice(0, 50)
                        .map((h) => `- ${h.path}:${h.lineNumber}: ${h.line.trim()}`)
                        .join('\n');
                    const more = hits.length > 50 ? `\n(+${hits.length - 50} more)` : '';
                    return { content: [{ type: 'text' as const, text: preview + more }] };
                },
            ),
            tool(
                'vault_read_frontmatter',
                'Return the YAML frontmatter of a note as a JSON object. Returns "null" if none.',
                {
                    path: z.string(),
                },
                async ({ path: relPath }) => {
                    const fm = readFrontmatter(rootDir, relPath);
                    return {
                        content: [{ type: 'text' as const, text: JSON.stringify(fm) }],
                    };
                },
            ),
            tool(
                'vault_resolve_link',
                'Resolve a wiki-link target name to a vault-relative path. Returns the path or "null".',
                {
                    target: z.string().describe('Link target without brackets, e.g. "profile-registry".'),
                },
                async ({ target }) => ({
                    content: [{ type: 'text' as const, text: JSON.stringify(resolveLink(linkIndex, target)) }],
                }),
            ),
            tool(
                'vault_list_backlinks',
                'List vault-relative paths that link TO the given note.',
                {
                    path: z.string(),
                },
                async ({ path: relPath }) => {
                    const backs = listBacklinks(linkIndex, relPath);
                    if (backs.length === 0) return { content: [{ type: 'text' as const, text: 'No backlinks.' }] };
                    return {
                        content: [{ type: 'text' as const, text: backs.map((p) => `- ${p}`).join('\n') }],
                    };
                },
            ),
        ],
    });
}
