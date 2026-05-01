/**
 * Filesystem-backed vault reader.
 *
 * All functions take an absolute `root` directory and vault-relative paths.
 * Paths are resolved safely to reject traversal outside of `root`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface GrepHit {
    path: string;
    lineNumber: number;
    line: string;
}

export function listFiles(root: string, glob?: string): string[] {
    const absRoot = path.resolve(root);
    const all: string[] = [];
    walk(absRoot, absRoot, all);
    if (!glob) return all.sort();
    const matcher = compileGlob(glob);
    return all.filter((p) => matcher(p)).sort();
}

export function readFile(root: string, relPath: string): string {
    const abs = safeResolve(root, relPath);
    return fs.readFileSync(abs, 'utf8');
}

export function grep(root: string, query: string, scopePrefix?: string): GrepHit[] {
    const files = listFiles(root);
    const hits: GrepHit[] = [];
    const scope = scopePrefix ? scopePrefix.replace(/\/$/, '') + '/' : '';
    for (const relPath of files) {
        if (scope && !relPath.startsWith(scope)) continue;
        const content = readFile(root, relPath);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
                hits.push({ path: relPath, lineNumber: i + 1, line: lines[i] });
            }
        }
    }
    return hits;
}

export function readFrontmatter(root: string, relPath: string): Record<string, unknown> | null {
    const content = readFile(root, relPath);
    if (!content.startsWith('---\n')) return null;
    const end = content.indexOf('\n---', 4);
    if (end === -1) return null;
    const yamlBlock = content.slice(4, end);
    try {
        const parsed = parseYaml(yamlBlock);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

// ── Internals ────────────────────────────────────────────────────────────

function walk(rootAbs: string, dirAbs: string, out: string[]): void {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const abs = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
            walk(rootAbs, abs, out);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            out.push(path.relative(rootAbs, abs).split(path.sep).join('/'));
        }
    }
}

function safeResolve(root: string, relPath: string): string {
    const absRoot = path.resolve(root);
    const abs = path.resolve(absRoot, relPath);
    const prefix = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
    if (abs !== absRoot && !abs.startsWith(prefix)) {
        throw new Error(`Path escapes vault root: ${relPath}`);
    }
    return abs;
}

/**
 * Compile a minimal glob (supports `*`, `**`, `/`) to a predicate function.
 */
function compileGlob(glob: string): (p: string) => boolean {
    // Replace **/ with a pattern matching zero or more path segments
    // e.g. "multilingual/**/*.md" matches "multilingual/foo.md" and "multilingual/sub/foo.md"
    const pattern =
        '^' +
        glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*\//g, '(?:.+/)?')
            .replace(/\*\*/g, '.*')
            .replace(/(?<!\[)\*/g, '[^/]*') +
        '$';
    const re = new RegExp(pattern);
    return (p: string) => re.test(p);
}
