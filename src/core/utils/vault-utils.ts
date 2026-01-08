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
		const existing = app.vault.getAbstractFileByPath(currentPath);
		
		if (!existing) {
			try {
				await app.vault.createFolder(currentPath);
				console.log(`[vault-utils] Created folder: ${currentPath}`);
			} catch (error) {
				// Check if folder was created by another process/thread
				const checkAgain = app.vault.getAbstractFileByPath(currentPath);
				if (checkAgain instanceof TFolder) {
					// Folder exists now, which is what we want
					continue;
				}
				// If error is "Folder already exists", ignore it
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (errorMessage.includes('already exists') || errorMessage.includes('Folder already exists')) {
					// Verify it's actually a folder
					const verify = app.vault.getAbstractFileByPath(currentPath);
					if (verify instanceof TFolder) {
						continue;
					}
				}
				console.error('Failed to create folder:', currentPath, error);
				throw error;
			}
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`Path exists but is not a folder: ${currentPath}`);
		}
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

