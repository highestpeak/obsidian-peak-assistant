import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath } from './path-utils';

// T11K: re-export the pure path helpers so existing import paths keep working
// without dragging callers into Obsidian-backed runtime code.
export { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath };

/**
 * Ensures that a folder exists at the specified path.
 * If the folder does not exist, it is created recursively.
 *
 * T11K: `app` is required — no AppContext fallback.
 */
export async function ensureFolder(folderPath: string, app: App): Promise<TFolder> {
	const normalized = normalizePath(folderPath.trim());
	if (!normalized) {
		throw new Error('Invalid folder path');
	}
	await ensureFolderRecursive(normalized, app);
	// Mock vault (e.g. desktop dev) does not persist; skip strict check so save flow can return path from params/settings
	if ((app as any).isMock) {
		return null as unknown as TFolder;
	}
	const folder = app.vault.getAbstractFileByPath(normalized);
	if (folder instanceof TFolder) {
		return folder;
	}
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

/**
 * Recursively create folder and all parent folders.
 */
export async function ensureFolderRecursive(folderPath: string, app: App): Promise<void> {
	const parts = folderPath.split('/').filter((p) => p.length > 0);
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		let existing = app.vault.getAbstractFileByPath(currentPath);

		// If folder doesn't exist, try to create it
		if (!existing) {
			try {
				await app.vault.createFolder(currentPath);
				console.log(`[vault-utils] Created folder: ${currentPath}`);
			} catch (error) {
				// Re-check if folder exists after error (might have been created by another process)
				existing = app.vault.getAbstractFileByPath(currentPath);
				if (existing instanceof TFolder) {
					continue;
				}

				// Check for "already exists" type errors
				const errorMessage = error instanceof Error ? error.message : String(error);
				const isAlreadyExistsError = errorMessage.includes('already exist');

				if (isAlreadyExistsError) {
					// Double-check the folder exists
					existing = app.vault.getAbstractFileByPath(currentPath);
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
	app: App,
): Promise<string | null> {
	try {
		const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;

		await ensureFolderRecursive(normalizedFolder, app);

		const timestamp = Date.now();
		const sanitizedName = file.name.replace(/[<>:"/\\|?*]/g, '_');
		const fileName = `${timestamp}-${sanitizedName}`;
		const filePath = `${normalizedFolder}/${fileName}`;

		const arrayBuffer = await file.arrayBuffer();
		await app.vault.createBinary(filePath, arrayBuffer);

		const savedFile = app.vault.getAbstractFileByPath(filePath);
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
	app: App,
): Promise<string[]> {
	if (files.length === 0) {
		return [];
	}

	const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
	await ensureFolderRecursive(normalizedFolder, app);

	const uploadedPaths: string[] = [];
	for (const file of files) {
		const path = await uploadFileToVault(file, normalizedFolder, app);
		if (path) {
			uploadedPaths.push(path);
		}
	}

	return uploadedPaths;
}

/**
 * Write content to a file, creating it if it doesn't exist, or modifying it if it does.
 */
export async function writeFile(
	file: TFile | null,
	path: string,
	content: string,
	app: App,
): Promise<TFile> {
	if (file) {
		await app.vault.modify(file, content);
		return file;
	}
	return await app.vault.create(path, content);
}

/**
 * Open an attachment link in Obsidian workspace.
 */
export function openAttachment(path: string, app: App): void {
	if (!path) return;
	const cleaned = path.replace(/^\[\[|\]\]$/g, '');
	const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
	void app.workspace.openLinkText(normalized, '', true);
}

/**
 * Read plaintext from a vault file with truncation. Returns null for missing paths, non-files, or read errors.
 * Skips synthetic paths such as `__hub_cluster__/...` used for cluster hub candidates.
 */
export async function readVaultTextSnippet(vaultPath: string, maxChars: number, app: App): Promise<string | null> {
	const p = normalizePath(vaultPath);
	if (!p || p.startsWith('__hub_cluster__')) return null;
	const f = app.vault.getAbstractFileByPath(p);
	if (!(f instanceof TFile)) return null;
	try {
		const raw = await app.vault.cachedRead(f);
		return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}\n\n[truncated]`;
	} catch {
		return null;
	}
}
