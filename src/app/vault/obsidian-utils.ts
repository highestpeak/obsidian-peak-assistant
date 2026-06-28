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

export function getPluginDir(pluginId: string = DEFAULT_PLUGIN_ID, app: App): string {
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

export async function getFileSize(filePath: string, app: App): Promise<number> {
	try {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file && 'stat' in file) {
			return (file as any).stat.size || 0;
		}
		try {
			const content = await app.vault.adapter.read(filePath);
			return new Blob([content]).size;
		} catch {
			try {
				const binary = await (app.vault.adapter as any).readBinary(filePath);
				return binary.byteLength || 0;
			} catch {
				return 0;
			}
		}
	} catch {
		return 0;
	}
}

export async function openFile(filePath: string, newTab: boolean = false, app: App): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (file && 'path' in file) {
		const leaf = app.workspace.getLeaf(newTab);
		await leaf.openFile(file as any);
	}
}

export async function readFileAsBase64(resourceSource: string, app: App): Promise<string | null> {
	try {
		const normalizedPath = normalizeVaultPath(resourceSource.startsWith('/') ? resourceSource.slice(1) : resourceSource);
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

export type ActiveFile = {
	path: string;
	title: string;
	selectedText: string | null;
	cursorPosition: { line: number; ch: number } | null;
};

export function getActiveNoteDetail(app: App): {
	activeFile: ActiveFile | null;
	openFiles: Array<ActiveFile>;
} {
	const activeFile = app.workspace.getActiveFile();
	const openFiles: Array<ActiveFile> = [];
	let activeFileDetail: ActiveFile | null = null;

	app.workspace.iterateAllLeaves((leaf: any) => {
		const view = leaf.view as any;
		const file = view?.file;

		if (!file) return;

		const isActive = activeFile ? file.path === activeFile.path : false;
		const fileInfo: ActiveFile = {
			path: file.path,
			title: file.name || file.basename || 'Untitled',
			selectedText: null,
			cursorPosition: null,
		};

		openFiles.push(fileInfo);

		if (isActive) {
			const selectedText = getSelectedTextFromActiveEditor(app);
			let cursorPosition = null;
			try {
				const editor = view?.editor || app.workspace?.activeEditor?.editor;
				if (editor && editor.getCursor) {
					const cursor = editor.getCursor();
					cursorPosition = { line: cursor.line, ch: cursor.ch };
				}
			} catch (error) {
				console.warn('[obsidian-utils] Failed to get cursor position:', error);
			}

			activeFileDetail = {
				path: file.path,
				title: file.name || file.basename || 'Untitled',
				selectedText,
				cursorPosition,
			};
		}
	});

	return { activeFile: activeFileDetail, openFiles };
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

export function getFileTypeByPath(filePath: string, app: App): 'note' | 'file' | 'folder' | null {
	const abstractFile = app.vault.getAbstractFileByPath(filePath);

	let itemType: 'note' | 'file' | 'folder' = 'folder';
	if (abstractFile) {
		if ('extension' in abstractFile) {
			itemType = (abstractFile as any).extension === 'md' ? 'note' : 'file';
		} else {
			itemType = 'folder';
		}
	}

	return itemType ?? null;
}

export async function openFileAtLine(
	filePath: string,
	lineNumber: number,
	newTab: boolean = false,
	app: App,
): Promise<void> {
	try {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!file || !('path' in file)) {
			throw new Error(`File not found: ${filePath}`);
		}

		const leaf = app.workspace.getLeaf(newTab);
		await leaf.openFile(file as any);
		await new Promise(resolve => setTimeout(resolve, 100));

		const view = leaf.view as any;
		const editor = view?.editor;
		if (!editor || !editor.setCursor) {
			console.warn('[obsidian-utils] Editor not found or does not support setCursor');
			return;
		}

		let safeLineNumber = lineNumber;
		try {
			let actualLineCount = 0;
			if (editor.lineCount) actualLineCount = editor.lineCount();
			else if (editor.state?.doc) actualLineCount = editor.state.doc.lines;
			if (actualLineCount > 0 && lineNumber >= actualLineCount) {
				safeLineNumber = Math.max(0, actualLineCount - 1);
				console.warn(`[obsidian-utils] Line ${lineNumber + 1} exceeds file length ${actualLineCount}, jumping to last line`);
			}
		} catch (error) {
			console.warn('[obsidian-utils] Could not determine line count:', error);
		}

		try {
			editor.setCursor({ line: safeLineNumber, ch: 0 });
		} catch (cursorError) {
			console.warn('[obsidian-utils] Failed to set cursor:', cursorError);
		}

		const cm = editor.cm || editor;
		try {
			if (cm?.scrollIntoView) {
				cm.scrollIntoView({ line: safeLineNumber, ch: 0, char: 0 });
			}
		} catch (scrollError) {
			console.warn('[obsidian-utils] scrollIntoView failed:', scrollError);
		}
	} catch (error) {
		console.warn(`[obsidian-utils] Failed to open file at line: ${filePath}:${lineNumber}`, error);
		throw error;
	}
}
