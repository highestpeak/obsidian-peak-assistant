import type { App } from 'obsidian';

const DEFAULT_PLUGIN_ID = 'obsidian-peak-assistant';

/**
 * Resolve plugin directory path relative to vault root.
 */
export function getPluginDir(app: App, pluginId: string = DEFAULT_PLUGIN_ID): string {
	const plugin = (app as any)?.plugins?.getPlugin?.(pluginId);
	const pluginDir = plugin?.manifest?.dir as string | undefined;
	if (!pluginDir) {
		throw new Error(`Plugin directory cannot be resolved: plugin '${pluginId}' not found`);
	}
	return pluginDir;
}

