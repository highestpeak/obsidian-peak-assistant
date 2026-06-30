import path from 'path';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { normalizeVaultPath } from '@/core/utils/path-utils';

const DEFAULT_PLUGIN_ID = 'obsidian-peak-assistant';

/**
 * T11R Phase 2: Obsidian-binding utilities. Moved out of
 * `core/utils/obsidian-utils.ts` so core stays free of `from 'obsidian'`.
 * App and UI callers import these directly; service callers receive the
 * needed operations through the matching narrow port.
 */

function getPluginDir(pluginId: string, app: App): string {
	const plugin = (app as any)?.plugins?.getPlugin?.(pluginId);
	const pluginDir = plugin?.manifest?.dir as string | undefined;
	if (!pluginDir) {
		throw new Error(`Plugin directory cannot be resolved: plugin '${pluginId}' not found`);
	}
	return pluginDir;
}

export function getPluginDirAbsolute(pluginId: string = DEFAULT_PLUGIN_ID, app: App): string {
	const vaultBase = (app.vault.adapter as any)?.basePath as string | undefined;
	if (!vaultBase) {
		throw new Error('Vault base path not available (e.g. non-filesystem vault)');
	}
	const pluginDir = getPluginDir(pluginId, app);
	return path.join(vaultBase, pluginDir);
}

export function getSelectedTextFromActiveEditor(app: App): string | null {
	try {
		const anyApp = app as any;
		const MarkdownView = anyApp.MarkdownView;
		if (!MarkdownView) return null;

		const view = anyApp.workspace?.getActiveViewOfType?.(MarkdownView);
		const editor = view?.editor || anyApp.workspace?.activeEditor?.editor;

		if (!editor) return null;

		const selection = editor.getSelection?.();
		if (!selection || selection.trim().length === 0) return null;

		return selection.trim();
	} catch (error) {
		console.warn('[obsidian-utils] Failed to get selected text from active editor:', error);
		return null;
	}
}

export async function readFileAsText(filePath: string, app: App): Promise<string | null> {
	try {
		const normalizedPath = normalizeVaultPath(filePath.startsWith('/') ? filePath.slice(1) : filePath);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (file && file instanceof TFile) {
			return await app.vault.read(file);
		}
	} catch (error) {
		console.warn(`[obsidian-utils] Failed to read file as text: ${filePath}`, error);
	}
	return null;
}
