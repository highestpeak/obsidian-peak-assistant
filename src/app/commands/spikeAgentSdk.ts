import { App, Notice } from 'obsidian';
import { join } from 'path';
// Static import: esbuild bundles sdk.mjs directly into main.js (ESM → CJS at
// build time). This avoids runtime ESM loading, which Obsidian's current
// Electron/Node (20.18 / 32.2) does not support via require(). cli.js stays a
// sidecar file that the SDK spawns as a subprocess via pathToClaudeCodeExecutable.
import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Temporary spike command to verify @anthropic-ai/claude-agent-sdk runs inside
 * the Obsidian plugin. Delete this file after migration is verified in Task 16.
 */
export async function runAgentSdkSpike(app: App, pluginId: string): Promise<void> {
    const adapter = app.vault.adapter as unknown as { getBasePath(): string };
    const basePath = adapter.getBasePath();
    const pluginDir = join(basePath, app.vault.configDir, 'plugins', pluginId);

    const cliPath = join(pluginDir, 'sdk', 'cli.js');

    new Notice(`[spike] SDK bundled; using cli.js at ${cliPath}`);
    console.log('[spike] query fn:', typeof query);

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
            } as Parameters<typeof query>[0]['options'],
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
