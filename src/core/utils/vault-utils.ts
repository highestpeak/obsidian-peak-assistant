import { AppContext } from '@/app/context/AppContext';
import { App, normalizePath, TFile, TFolder } from 'obsidian';

function resolveApp(app?: App): App {
	return app ?? AppContext.getApp();
}

/**
 * Ensures that a folder exists at the specified path.
 * If the folder does not exist, it is created recursively.
 */
export async function ensureFolder(folderPath: string, app?: App): Promise<TFolder> {
	const targetApp = resolveApp(app);
	const normalized = normalizePath(folderPath.trim());
	if (!normalized) {
		throw new Error('Invalid folder path');
	}
	await ensureFolderRecursive(normalized, targetApp);
	// Mock vault (e.g. desktop dev) does not persist; skip strict check so save flow can return path from params/settings
	if ((targetApp as any).isMock) {
		return null as unknown as TFolder;
	}
	const folder = targetApp.vault.getAbstractFileByPath(normalized);
	if (folder instanceof TFolder) {
		return folder;
	}
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

/**
 * Recursively create folder and all parent folders.
 */
export async function ensureFolderRecursive(folderPath: string, app?: App): Promise<void> {
	const targetApp = resolveApp(app);
	const parts = folderPath.split('/').filter((p) => p.length > 0);
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		let existing = targetApp.vault.getAbstractFileByPath(currentPath);

		// If folder doesn't exist, try to create it
		if (!existing) {
			try {
				await targetApp.vault.createFolder(currentPath);
				console.log(`[vault-utils] Created folder: ${currentPath}`);
			} catch (error) {
				// Re-check if folder exists after error (might have been created by another process)
				existing = targetApp.vault.getAbstractFileByPath(currentPath);
				if (existing instanceof TFolder) {
					continue;
				}

				// Check for "already exists" type errors
				const errorMessage = error instanceof Error ? error.message : String(error);
				const isAlreadyExistsError = errorMessage.includes('already exist');

				if (isAlreadyExistsError) {
					// Double-check the folder exists
					existing = targetApp.vault.getAbstractFileByPath(currentPath);
					if (existing instanceof TFolder) {
						console.log(`[vault-utils] Folder already exists (caught error): ${currentPath}`);
						continue;
					}
				}

				console.error(`[vault-utils] Failed to create folder: ${currentPath}`, {
					error: errorMessage,
					isAlreadyExistsError,
					path: currentPath,
				});
				throw error;
			}
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`Path exists but is not a folder: ${currentPath}`);
		}
		// If folder already exists and is a TFolder, continue to next part
	}
}

/**
 * Upload a single file to vault.
 */
export async function uploadFileToVault(
	file: File,
	uploadFolder: string,
	app?: App,
): Promise<string | null> {
	const targetApp = resolveApp(app);
	try {
		const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;

		await ensureFolderRecursive(normalizedFolder, targetApp);

		const timestamp = Date.now();
		const sanitizedName = file.name.replace(/[<>:"/\\|?*]/g, '_');
		const fileName = `${timestamp}-${sanitizedName}`;
		const filePath = `${normalizedFolder}/${fileName}`;

		const arrayBuffer = await file.arrayBuffer();
		await targetApp.vault.createBinary(filePath, arrayBuffer);

		const savedFile = targetApp.vault.getAbstractFileByPath(filePath);
		if (savedFile && savedFile instanceof TFile) {
			return filePath;
		}
		return null;
	} catch (error) {
		console.error('Failed to upload file:', file.name, error);
		return null;
	}
}

/**
 * Upload multiple files to vault and return uploaded file paths.
 */
export async function uploadFilesToVault(
	files: File[],
	uploadFolder: string,
	app?: App,
): Promise<string[]> {
	const targetApp = resolveApp(app);
	if (files.length === 0) {
		return [];
	}

	const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
	await ensureFolderRecursive(normalizedFolder, targetApp);

	const uploadedPaths: string[] = [];
	for (const file of files) {
		const path = await uploadFileToVault(file, normalizedFolder, targetApp);
		if (path) {
			uploadedPaths.push(path);
		}
	}

	return uploadedPaths;
}

/**
 * Join path parts and normalize the result.
 */
export function joinPath(...parts: string[]): string {
	return normalizePath(parts.join('/'));
}

/**
 * Write content to a file, creating it if it doesn't exist, or modifying it if it does.
 */
export async function writeFile(
	file: TFile | null,
	path: string,
	content: string,
	app?: App,
): Promise<TFile> {
	const targetApp = resolveApp(app);
	if (file) {
		await targetApp.vault.modify(file, content);
		return file;
	}
	return await targetApp.vault.create(path, content);
}

/**
 * Get absolute path from root folder and relative path.
 */
export function getAbsolutePath(rootFolder: string, relativePath: string): string {
	return joinPath(rootFolder, relativePath);
}

/**
 * Get relative path from absolute path and root folder.
 */
export function getRelativePath(rootFolder: string, absolutePath: string): string {
	const normalized = normalizePath(absolutePath);
	const rootNormalized = normalizePath(rootFolder);
	if (normalized.startsWith(rootNormalized)) {
		return normalized.substring(rootNormalized.length).replace(/^\//, '');
	}
	return normalized;
}

/**
 * Open an attachment link in Obsidian workspace.
 */
export function openAttachment(path: string, app?: App): void {
	if (!path) return;
	const targetApp = resolveApp(app);
	const cleaned = path.replace(/^\[\[|\]\]$/g, '');
	const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
	void targetApp.workspace.openLinkText(normalized, '', true);
}

/**
 * Read plaintext from a vault file with truncation. Returns null for missing paths, non-files, or read errors.
 * Skips synthetic paths such as `__hub_cluster__/...` used for cluster hub candidates.
 */
export async function readVaultTextSnippet(vaultPath: string, maxChars: number, app?: App): Promise<string | null> {
	const targetApp = resolveApp(app);
	const p = normalizePath(vaultPath);
	if (!p || p.startsWith('__hub_cluster__')) return null;
	const f = targetApp.vault.getAbstractFileByPath(p);
	if (!(f instanceof TFile)) return null;
	try {
		const raw = await targetApp.vault.cachedRead(f);
		return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}\n\n[truncated]`;
	} catch {
		return null;
	}
}
