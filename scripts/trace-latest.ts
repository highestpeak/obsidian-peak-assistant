#!/usr/bin/env node
/**
 * Print the path of the newest *.meta.jsonl file under data/traces/.
 * Optionally filter by a substring match on the filename.
 *
 * Usage:
 *   npm run trace:latest                       # newest of all
 *   npm run trace:latest vault-search          # newest containing "vault-search"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_ROOT = path.resolve(__dirname, '..', 'data', 'traces');

export function findLatestTrace(root: string, filter?: string): string | null {
    if (!fs.existsSync(root)) return null;
    const candidates: Array<{ path: string; mtimeMs: number }> = [];
    walk(root, (p, stat) => {
        if (!p.endsWith('.meta.jsonl')) return;
        if (filter && !path.basename(p).includes(filter)) return;
        candidates.push({ path: p, mtimeMs: stat.mtimeMs });
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0].path;
}

function walk(dir: string, visit: (p: string, stat: fs.Stats) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(abs, visit);
        } else if (entry.isFile()) {
            visit(abs, fs.statSync(abs));
        }
    }
}

// CLI entry point: only run when invoked as a standalone script, not when
// bundled by esbuild into a test or larger bundle.
// We detect this by checking that argv[1] refers to this file by name.
if (
    typeof process !== 'undefined' &&
    typeof process.argv !== 'undefined' &&
    process.argv[1]?.endsWith('trace-latest.ts') === true
) {
    const filter = process.argv[2];
    const latest = findLatestTrace(DEFAULT_ROOT, filter);
    if (!latest) {
        process.stderr.write('no matching trace found\n');
        process.exit(1);
    }
    process.stdout.write(`${latest}\n`);
}
