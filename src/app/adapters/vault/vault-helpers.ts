import { App, TFile, TFolder } from 'obsidian';
import { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath } from '@/core/utils/path-utils';

// T11R: Re-export pure path helpers for callers that imported them from
// the old `@/core/utils/vault-utils` location.
export { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath };

/**
 * T11R: Obsidian-backed vault helpers. Moved out of `core/utils/vault-utils.ts`
 * so service/core can stay free of `from 'obsidian'`. App and UI callers
 * import these directly; service callers reach the same operations via
 * {@link import('@/core/ports/VaultWriterPort').VaultWriterPort}.
 */
export async function ensureFolder(folderPath: string, app: App): Promise<TFolder> {
	const normalized = normalizeVaultPath(folderPath.trim());
	if (!normalized) {
		throw new Error('Invalid folder path');
	}
	await ensureFolderRecursive(normalized, app);
	if ((app as any).isMock) {
		return null as unknown as TFolder;
	}
	const folder = app.vault.getAbstractFileByPath(normalized);
	if (folder instanceof TFolder) {
		return folder;
	}
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

export async function ensureFolderRecursive(folderPath: string, app: App): Promise<void> {
	const parts = folderPath.split('/').filter((p) => p.length > 0);
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		let existing = app.vault.getAbstractFileByPath(currentPath);

		if (!existing) {
			try {
				await app.vault.createFolder(currentPath);
				console.log(`[vault-helpers] Created folder: ${currentPath}`);
			} catch (error) {
				existing = app.vault.getAbstractFileByPath(currentPath);
				if (existing instanceof TFolder) {
					continue;
				}

				const errorMessage = error instanceof Error ? error.message : String(error);
				const isAlreadyExistsError = errorMessage.includes('already exist');

				if (isAlreadyExistsError) {
					existing = app.vault.getAbstractFileByPath(currentPath);
					if (existing instanceof TFolder) {
						console.log(`[vault-helpers] Folder already exists (caught error): ${currentPath}`);
						continue;
					}
				}

				console.error(`[vault-helpers] Failed to create folder: ${currentPath}`, {
					error: errorMessage,
					isAlreadyExistsError,
					path: currentPath,
				});
				throw error;
			}
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`Path exists but is not a folder: ${currentPath}`);
		}
	}
}

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

export function openAttachment(path: string, app: App): void {
	if (!path) return;
	const cleaned = path.replace(/^\[\[|\]\]$/g, '');
	const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
	void app.workspace.openLinkText(normalized, '', true);
}

export async function readVaultTextSnippet(vaultPath: string, maxChars: number, app: App): Promise<string | null> {
	const p = normalizeVaultPath(vaultPath);
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
