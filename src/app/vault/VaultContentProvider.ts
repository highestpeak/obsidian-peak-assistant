import type { App } from 'obsidian';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';
import { normalizeVaultPath } from '@/core/utils/path-utils';

/**
 * T11R Phase 2: Moved out of `core/template/VaultContentProvider.ts` so
 * core no longer imports `obsidian`. Loads template files via the
 * Obsidian vault adapter — works on both desktop and mobile.
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
