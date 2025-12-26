import { App, normalizePath, TFile, TFolder } from 'obsidian';

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

