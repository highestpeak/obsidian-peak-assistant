import { App, TFile, TFolder } from 'obsidian';

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
				const checkAgain = app.vault.getAbstractFileByPath(currentPath);
				if (!checkAgain) {
					console.error('Failed to create folder:', currentPath, error);
					throw error;
				}
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

