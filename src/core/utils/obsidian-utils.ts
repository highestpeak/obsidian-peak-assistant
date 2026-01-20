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
 * @param newTab - Whether to open in a new tab (default: false)
 * @returns Promise that resolves when file is opened
 */
export async function openFile(app: App, filePath: string, newTab: boolean = false): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (file && 'path' in file) {
		const leaf = app.workspace.getLeaf(newTab);
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

export function getActiveNoteDetail(appInstance?: App): {
	activeFile: ActiveFile | null;
	openFiles: Array<ActiveFile>;
} {
	const app = appInstance ?? AppContext.getInstance().app;

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
		// Get the MarkdownView constructor safely
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

/**
 * Open a file and navigate to a specific line number.
 * Creates a new leaf if needed.
 *
 * @param app - Obsidian app instance
 * @param filePath - Path to the file relative to vault root
 * @param lineNumber - Line number to navigate to (0-indexed)
 * @param newTab - Whether to open in a new tab (default: false)
 * @returns Promise that resolves when file is opened and cursor is positioned
 */
export async function openFileAtLine(app: App, filePath: string, lineNumber: number, newTab: boolean = false): Promise<void> {
	try {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!file || !('path' in file)) {
			throw new Error(`File not found: ${filePath}`);
		}

		const leaf = app.workspace.getLeaf(newTab);
		await leaf.openFile(file as any);

		// Wait a bit for the file to be fully loaded
		await new Promise(resolve => setTimeout(resolve, 100));

		// Get the active editor and set cursor to the specified line
		const view = leaf.view as any;
		const editor = view?.editor;
		if (!editor || !editor.setCursor) {
			console.warn('[obsidian-utils] Editor not found or does not support setCursor');
			return;
		}
		// Get file line count and adjust line number if out of bounds
		let safeLineNumber = lineNumber;

		try {
			let actualLineCount = 0;
			if (editor.lineCount) {
				actualLineCount = editor.lineCount();
			} else if (editor.state?.doc) {
				actualLineCount = editor.state.doc.lines;
			}

			// If line number exceeds file length, jump to last line
			if (actualLineCount > 0 && lineNumber >= actualLineCount) {
				safeLineNumber = Math.max(0, actualLineCount - 1);
				console.warn(`[obsidian-utils] Line ${lineNumber + 1} exceeds file length ${actualLineCount}, jumping to last line`);
			}
		} catch (error) {
			console.warn('[obsidian-utils] Could not determine line count:', error);
		}

		// Set cursor to the beginning of the specified line
		try {
			editor.setCursor({ line: safeLineNumber, ch: 0 });
		} catch (cursorError) {
			console.warn('[obsidian-utils] Failed to set cursor:', cursorError);
		}

		// Scroll to target line using CodeMirror's built-in method
		const scrollToLine = async (targetLineNumber: number): Promise<{ success: boolean, targetElement?: Element }> => {
			try {
				const container = view.containerEl;
				if (!container) return { success: false };

				// Custom centering scroll based on DOM structure
				const cm = editor.cm || editor;
				if (cm) {
					try {
						// First ensure the line is visible using scrollIntoView
						if (cm.scrollIntoView) {
							cm.scrollIntoView({ line: targetLineNumber, ch: 0, char: 0 });
						}

						// Wait a bit for DOM update
						await new Promise(resolve => setTimeout(resolve, 100));

						// Find the target line element - try multiple selectors based on DOM structure
						let targetLineElement = container.querySelector('.cm-active') ||
							container.querySelector(`[data-line="${targetLineNumber}"]`) ||
							container.querySelector('.cm-line');

						// console.debug(`[obsidian-utils] Found target line element:`, targetLineElement);

						if (targetLineElement) {
							// Find the scroll container (.cm-scroller)
							const scrollContainer = container.closest('.cm-editor')?.querySelector('.cm-scroller') ||
								container.querySelector('.cm-scroller') ||
								container;

							if (scrollContainer) {
								// Calculate position to center the line in viewport
								const containerRect = scrollContainer.getBoundingClientRect();
								const lineRect = targetLineElement.getBoundingClientRect();
								const containerHeight = scrollContainer.clientHeight;

								// Current scroll position
								const currentScrollTop = scrollContainer.scrollTop;

								// Line's position relative to scroll container
								const lineTopRelativeToContainer = lineRect.top - containerRect.top + currentScrollTop;

								// Calculate target scroll position to center the line
								const targetScrollTop = lineTopRelativeToContainer - containerHeight / 2 + targetLineElement.offsetHeight / 2;

								// Apply smooth scroll to center position
								scrollContainer.scrollTo({
									top: Math.max(0, targetScrollTop),
									behavior: 'smooth'
								});

								// console.debug(`[obsidian-utils] Centering scroll: lineTop=${lineTopRelativeToContainer}, containerHeight=${containerHeight}, targetScroll=${targetScrollTop}`);
							}
						}
					} catch (scrollError) {
						console.warn('[obsidian-utils] Custom scroll failed:', scrollError);
						// Fallback to basic scrollIntoView
						if (cm.scrollIntoView) {
							cm.scrollIntoView({ line: targetLineNumber, ch: 0, char: 0 });
						}
					}
				}

				// Wait for scroll to complete
				await new Promise(resolve => setTimeout(resolve, 200));

				// Find target element for flashing
				let targetElement = container.querySelector('.cm-active') ||
					container.querySelector('.cm-active.cm-line') ||
					container.querySelector('.cm-line');

				// console.debug(`[obsidian-utils] Target element for flashing (line ${targetLineNumber}):`, targetElement);

				// If still no element found, wait a bit and try again (cursor change might take time to reflect in DOM)
				if (!targetElement) {
					await new Promise(resolve => setTimeout(resolve, 50));
					targetElement = container.querySelector('.cm-active') ||
						container.querySelector('.cm-active.cm-line') ||
						container.querySelector('.cm-line');
					// console.debug(`[obsidian-utils] Retry - Target element:`, targetElement);
				}

				return { success: true, targetElement: targetElement || undefined };
			} catch (error) {
				console.warn('[obsidian-utils] Scroll failed:', error);
				return { success: false };
			}
		};

		// Add flash highlight effect after scrolling is complete
		const applyFlashEffect = async (targetElement: Element): Promise<boolean> => {
			return new Promise((resolve) => {
				try {
					// console.log(`[obsidian-utils] Applying flash effect for element:`, targetElement);

					// Find the actual line element
					let lineElement: HTMLElement | null = null;

					if (targetElement.classList.contains('cm-line')) {
						lineElement = targetElement as HTMLElement;
					} else {
						// Try to find the line element from various sources
						const container = targetElement.closest('.cm-editor') || targetElement.closest('.cm-content') || targetElement.ownerDocument;
						if (container) {
							// Try multiple selectors to find the target line
							lineElement = container.querySelector('.cm-active.cm-line') as HTMLElement ||
								container.querySelector('.cm-active') as HTMLElement ||
								container.querySelector('.cm-line') as HTMLElement;
						}
					}

					// console.log(`[obsidian-utils] Final line element for flashing:`, lineElement);

					if (lineElement) {
						// Fast red flash with white text
						const originalBackground = lineElement.style.backgroundColor;
						const originalColor = lineElement.style.color;
						const originalTransition = lineElement.style.transition;

						// console.log(`[obsidian-utils] Starting fast red flash on element:`, lineElement);

						// Immediate red background with white text
						lineElement.style.backgroundColor = '#ff0000'; // Pure red
						lineElement.style.color = '#ffffff'; // White text
						lineElement.style.transition = 'none';

						// Force style application
						lineElement.offsetHeight;

						// Fast flash sequence - quicker and shorter
						let flashCount = 0;
						const flashInterval = setInterval(() => {
							flashCount++;
							if (flashCount <= 4) { // 4 flashes total (2 on, 2 off)
								const isRed = flashCount % 2 === 1;
								lineElement!.style.backgroundColor = isRed ? '#ff0000' : originalBackground;
								lineElement!.style.color = isRed ? '#ffffff' : originalColor;
							} else {
								clearInterval(flashInterval);
								// Quick fade out
								lineElement!.style.transition = 'background-color 0.2s ease-out, color 0.2s ease-out';
								lineElement!.style.backgroundColor = originalBackground;
								lineElement!.style.color = originalColor;
								setTimeout(() => {
									lineElement!.style.transition = originalTransition;
									// console.log(`[obsidian-utils] Fast flash effect completed`);
									resolve(true);
								}, 300);
							}
						}, 150); // Moderate speed: 150ms per flash

					} else {
						console.warn(`[obsidian-utils] No line element found for flashing`);
						resolve(false);
					}
				} catch (flashError) {
					console.warn('[obsidian-utils] Could not apply flash effect:', flashError);
					resolve(false);
				}
			});
		};

		// Scroll to the target line and get the target element for flashing
		const scrollResult = await scrollToLine(safeLineNumber);
		// console.debug(`[obsidian-utils] Scroll result: success=${scrollResult.success}, hasElement=${!!scrollResult.targetElement}`);

		// Apply flash effect after scrolling is complete, using the found element
		if (scrollResult.targetElement) {
			// console.debug(`[obsidian-utils] Starting flash effect for target element`);
			await applyFlashEffect(scrollResult.targetElement);
		} else {
			console.warn(`[obsidian-utils] No target element found for flashing, skipping flash effect`);
		}
	} catch (error) {
		console.warn(`[obsidian-utils] Failed to open file at line: ${filePath}:${lineNumber}`, error);
		throw error;
	}
}