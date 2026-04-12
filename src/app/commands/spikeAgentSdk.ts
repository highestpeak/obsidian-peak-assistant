import { App, Notice } from 'obsidian';
import { join } from 'path';

/**
 * Temporary spike command to verify @anthropic-ai/claude-agent-sdk runs inside
 * the Obsidian plugin. Delete this file after migration is verified in Task 16.
 */
export async function runAgentSdkSpike(app: App, pluginId: string): Promise<void> {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    const basePath = adapter.getBasePath();
    const pluginDir = join(basePath, app.vault.configDir, 'plugins', pluginId);

    const sdkPath = join(pluginDir, 'sdk', 'sdk.mjs');
    const cliPath = join(pluginDir, 'sdk', 'cli.js');

    new Notice(`[spike] loading SDK via Node require from ${sdkPath}`);

    // IMPORTANT: Dynamic import() goes through Chromium's module loader which
    // blocks file:// URLs by default (webSecurity policy). Use Node's CJS
    // require instead — it bypasses Chromium entirely and reads directly from
    // the filesystem. Node 22.12+ supports require(esm) for .mjs files, which
    // covers current Electron/Obsidian versions.
    //
    // NOTE: Use globalThis.require (Node's runtime require) NOT esbuild's
    // bundled require. The cast + indirection here prevents esbuild from
    // trying to statically resolve the path at build time.
    let sdk: unknown;
    try {
        const nodeRequire = (globalThis as unknown as { require: NodeJS.Require }).require;
        sdk = nodeRequire(sdkPath);
        console.log('[spike] SDK loaded', sdk);
    } catch (err) {
        new Notice(`[spike] SDK require failed: ${(err as Error).message}`, 10000);
        console.error('[spike] require error', err);
        console.log('[spike] diagnostic:', {
            nodeVersion: (globalThis as unknown as { process?: { versions?: { node?: string } } })
                .process?.versions?.node,
            electronVersion: (globalThis as unknown as { process?: { versions?: { electron?: string } } })
                .process?.versions?.electron,
        });
        return;
    }

    const query = (sdk as { query: (opts: unknown) => AsyncIterable<unknown> }).query;
    if (typeof query !== 'function') {
        new Notice('[spike] query() is not a function on the loaded module');
        return;
    }

    const apiKey = (window as unknown as { PEAK_SPIKE_ANTHROPIC_KEY?: string }).PEAK_SPIKE_ANTHROPIC_KEY;
    if (!apiKey) {
        new Notice(
            '[spike] Set window.PEAK_SPIKE_ANTHROPIC_KEY in DevTools before running this command',
            8000
        );
        return;
    }

    new Notice('[spike] starting query() — check console');
    const messages: unknown[] = [];
    try {
        for await (const msg of query({
            prompt: 'What files end with .md in the current directory? List at most 3.',
            options: {
                pathToClaudeCodeExecutable: cliPath,
                cwd: basePath,
                allowedTools: ['Glob'],
                settingSources: [],
                maxTurns: 3,
                model: 'claude-haiku-4-5',
                env: {
                    ANTHROPIC_API_KEY: apiKey,
                    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
                    PATH: process.env.PATH ?? '',
                },
            },
        })) {
            messages.push(msg);
            console.log('[spike] message', messages.length, msg);
            if (messages.length > 50) {
                console.warn('[spike] too many messages, breaking');
                break;
            }
        }
        new Notice(`[spike] done — ${messages.length} messages received`);
    } catch (err) {
        console.error('[spike] query error', err);
        new Notice(`[spike] query failed: ${(err as Error).message}`, 10000);
    }
}
