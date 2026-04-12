#!/usr/bin/env node
// Copies the Claude Agent SDK files from node_modules to the plugin distribution
// directory so the plugin can load them at runtime via absolute paths.
//
// Why: sdk.mjs uses import.meta.url + createRequire to resolve ./cli.js.
// esbuild bundling into main.js breaks that resolution, so we ship the SDK
// as a sidecar directory loaded with dynamic import at runtime.

import { mkdir, cp, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');

const src = join(projectRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
const dst = join(projectRoot, 'sdk');

async function main() {
    try {
        await stat(src);
    } catch {
        console.error(`[copy-agent-sdk] source not found: ${src}`);
        process.exit(1);
    }

    await mkdir(dst, { recursive: true });

    const files = [
        'sdk.mjs',
        'sdk.d.ts',
        'cli.js',
        'package.json',
        'manifest.json',
    ];
    const dirs = ['vendor'];

    for (const f of files) {
        try {
            await cp(join(src, f), join(dst, f));
            console.log(`[copy-agent-sdk] copied ${f}`);
        } catch (err) {
            console.warn(`[copy-agent-sdk] skipped ${f}: ${err.message}`);
        }
    }

    for (const d of dirs) {
        try {
            await cp(join(src, d), join(dst, d), { recursive: true });
            console.log(`[copy-agent-sdk] copied ${d}/`);
        } catch (err) {
            console.warn(`[copy-agent-sdk] skipped ${d}/: ${err.message}`);
        }
    }

    console.log(`[copy-agent-sdk] done`);
}

main().catch((err) => {
    console.error(`[copy-agent-sdk] error:`, err);
    process.exit(1);
});
