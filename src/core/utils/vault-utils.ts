import { App, normalizePath, TFile, TFolder } from 'obsidian';
// todo seperate app parameter from function parameters. in this way we can seperate file open from obsidian to electron.
/**
 * Ensures that a folder exists at the specified path.
 * If the folder does not exist, it is created recursively.
 * @param app The Obsidian app instance.
 * @param folderPath The path to the folder to ensure.
 * @returns The TFolder object representing the folder.
 */
export async function ensureFolder(app: App, folderPath: string): Promise<TFolder> {
	const normalized = normalizePath(folderPath);
	await ensureFolderRecursive(app, normalized);
	const folder = app.vault.getAbstractFileByPath(normalized);
	if (folder instanceof TFolder) {
		return folder;
	}
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

/**
 * Recursively create folder and all parent folders
 */
export async function ensureFolderRecursive(app: App, folderPath: string): Promise<void> {
	const parts = folderPath.split('/').filter(p => p.length > 0);
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
					path: currentPath
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
 * Upload a single file to vault
 */
export async function uploadFileToVault(
	app: App,
	file: File,
	uploadFolder: string
): Promise<string | null> {
	try {
		const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
		
		await ensureFolderRecursive(app, normalizedFolder);

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
 * Upload multiple files to vault and return uploaded file paths
 */
export async function uploadFilesToVault(
	app: App,
	files: File[],
	uploadFolder: string
): Promise<string[]> {
	if (files.length === 0) {
		return [];
	}

	const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
	await ensureFolderRecursive(app, normalizedFolder);

	const uploadedPaths: string[] = [];
	for (const file of files) {
		const path = await uploadFileToVault(app, file, normalizedFolder);
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
	app: App,
	file: TFile | null,
	path: string,
	content: string
): Promise<TFile> {
	if (file) {
		await app.vault.modify(file, content);
		return file;
	}
	return await app.vault.create(path, content);
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
 * Open an attachment link in Obsidian workspace
 * Cleans up wiki link syntax and normalizes the path before opening
 */
export function openAttachment(app: App, path: string): void {
	if (!path) return;
	const cleaned = path.replace(/^\[\[|\]\]$/g, '');
	const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
	void app.workspace.openLinkText(normalized, '', true);
}

