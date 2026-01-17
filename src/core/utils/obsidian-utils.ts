import { AppContext } from '@/app/context/AppContext';
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

type ActiveFile = {
	path: string;
	title: string;
	selectedText: string | null;
	cursorPosition: { line: number; ch: number } | null;
}

export function getActiveNoteDetail(): {
	activeFile: ActiveFile | null;
	openFiles: Array<ActiveFile>;
} {
	const app = AppContext.getInstance().app;

	// Get the active file using the recommended API
	const activeFile = app.workspace.getActiveFile();

	// Get all open files
	const openFiles: Array<ActiveFile> = [];

	let activeFileDetail: ActiveFile | null = null;

	// Process each open leaf
	app.workspace.iterateAllLeaves((leaf: any) => {
		const view = leaf.view as any;
		const file = view?.file;

		if (!file) {
			return;
		}

		const isActive = activeFile ? file.path === activeFile.path : false;
		const fileInfo: ActiveFile = {
			path: file.path,
			title: file.name || file.basename || 'Untitled',
			selectedText: null,
			cursorPosition: null
		};

		openFiles.push(fileInfo);

		// Check if this is the active file
		if (isActive) {
			// Get selected text for active file
			const selectedText = getSelectedTextFromActiveEditor(app);

			// Get cursor position for active file
			let cursorPosition = null;
			try {
				const editor = view?.editor || app.workspace?.activeEditor?.editor;
				if (editor && editor.getCursor) {
					const cursor = editor.getCursor();
					cursorPosition = {
						line: cursor.line,
						ch: cursor.ch
					};
				}
			} catch (error) {
				console.warn('[obsidian-utils] Failed to get cursor position:', error);
			}

			activeFileDetail = {
				path: file.path,
				title: file.name || file.basename || 'Untitled',
				selectedText,
				cursorPosition
			};
		}
	});

	return {
		activeFile: activeFileDetail,
		openFiles
	};
}

/**
 * Get selected text from the currently active Obsidian editor.
 * Returns null if no editor is active or no text is selected.
 *
 * @param app - Obsidian app instance
 * @returns Selected text string, or null if none selected
 */
export function getSelectedTextFromActiveEditor(app: App): string | null {
	try {
		const anyApp = app as any;
		const view = anyApp.workspace?.getActiveViewOfType?.(anyApp.MarkdownView || (anyApp as any).MarkdownView);
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

export async function readFileContentByPath(app: App, filePath: string): Promise<ArrayBuffer | null> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (file && file instanceof TFile) {
		return await app.vault.readBinary(file);
	}
	return null;
}

export async function readFileAsText(filePath: string): Promise<string | null> {
	try {
		const app = AppContext.getInstance().app;
		const normalizedPath = normalizePath(filePath.startsWith('/') ? filePath.slice(1) : filePath);
		const file = app.vault.getAbstractFileByPath(normalizedPath);
		if (file && file instanceof TFile) {
			return await app.vault.read(file);
		}
	} catch (error) {
		console.warn(`[obsidian-utils] Failed to read file as text: ${filePath}`, error);
	}
	return null;
}

export function getFileTypeByPath(filePath: string): 'note' | 'file' | 'folder' | null {
	// Use Obsidian API to properly determine file type
	const app = AppContext.getInstance().app;
	const path = filePath;
	const abstractFile = app.vault.getAbstractFileByPath(path);

	let itemType: 'note' | 'file' | 'folder' = 'folder';
	if (abstractFile) {
		if ('extension' in abstractFile) {
			// It's a TFile
			itemType = abstractFile.extension === 'md' ? 'note' : 'file';
		} else {
			// It's a TFolder
			itemType = 'folder';
		}
	}

	return itemType ?? null;
}