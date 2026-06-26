import type { App } from 'obsidian';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';
import { normalizeVaultPath } from '@/core/utils/path-utils';

/**
 * Loads template files via Obsidian vault adapter.
 * Works on both desktop and mobile — no Node `fs` dependency.
 */
export function createVaultContentProvider(app: App, pluginId: string): TemplateContentProvider {
    const pluginDir = normalizeVaultPath(`${app.vault.configDir}/plugins/${pluginId}`);
    return {
        async load(relativePath: string): Promise<string> {
            const fullPath = normalizeVaultPath(`${pluginDir}/${relativePath}`);
            return app.vault.adapter.read(fullPath);
        },
    };
}
