import { normalizePath, type App } from 'obsidian';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';

/**
 * Loads template files via Obsidian vault adapter.
 * Works on both desktop and mobile — no Node `fs` dependency.
 */
export function createVaultContentProvider(app: App, pluginId: string): TemplateContentProvider {
    const pluginDir = normalizePath(`${app.vault.configDir}/plugins/${pluginId}`);
    return {
        async load(relativePath: string): Promise<string> {
            const fullPath = normalizePath(`${pluginDir}/${relativePath}`);
            return app.vault.adapter.read(fullPath);
        },
    };
}
