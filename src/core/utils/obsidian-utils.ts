import type { App } from 'obsidian';
import { normalizePath, TFile } from 'obsidian';

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

/**
 * Get file size in bytes from vault.
 * Returns 0 if file doesn't exist or cannot be read.
 * 
 * @param app - Obsidian app instance
 * @param filePath - Path to the file relative to vault root
 * @returns File size in bytes, or 0 if file doesn't exist
 */
export async function getFileSize(app: App, filePath: string): Promise<number> {
	try {
		// Try to get file from vault
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file && 'stat' in file) {
			return (file as any).stat.size || 0;
		}

		// Fallback: try to read file and get its size
		try {
			const content = await app.vault.adapter.read(filePath);
			return new Blob([content]).size;
		} catch {
			// File may be binary, try readBinary
			try {
				const binary = await (app.vault.adapter as any).readBinary(filePath);
				return binary.byteLength || 0;
			} catch {
				// File doesn't exist
				return 0;
			}
		}
	} catch {
		return 0;
	}
}

/**
 * Open a file in Obsidian workspace.
 * Creates a new leaf if needed.
 *
 * @param app - Obsidian app instance
 * @param filePath - Path to the file relative to vault root
 * @returns Promise that resolves when file is opened
 */
export async function openFile(app: App, filePath: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (file && 'path' in file) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file as any);
	}
}

/**
 * Read a file from vault and convert to base64 string.
 * Returns null if file doesn't exist or cannot be read.
 *
 * @param app - Obsidian app instance
 * @param resourceSource - Resource source path (may start with '/')
 * @returns Base64 string of the file content, or null if failed
 */
export async function readFileAsBase64(app: App, resourceSource: string): Promise<string | null> {
	try {
		const normalizedPath = normalizePath(resourceSource.startsWith('/') ? resourceSource.slice(1) : resourceSource);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (file && file instanceof TFile) {
			const arrayBuffer = await app.vault.readBinary(file as TFile);
			return Buffer.from(arrayBuffer).toString('base64');
		}
	} catch (error) {
		console.warn(`[obsidian-utils] Failed to read file as base64: ${resourceSource}`, error);
	}
	return null;
}

