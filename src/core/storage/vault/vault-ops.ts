import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import { normalizeVaultPath } from '@/core/utils/path-utils';

/**
 * T11R Phase 2: duck-typed vault operations that service code reaches
 * through {@link AppHandle} without importing `obsidian`.
 *
 * Why a service-internal helper instead of widening AppHandle:
 * - AppHandle stays `Record<string, any>` (no widening).
 * - These helpers encapsulate the duck-typed access patterns so every
 *   service file does not re-implement them.
 * - When the chat-storage cascade lands proper VaultWriterPort wiring,
 *   each call site swaps to the port; this file disappears.
 *
 * Hard rule: this file MUST NOT import from `obsidian`. All operations
 * type the `app` parameter as the existing `AppHandle` neutral ref.
 */

export async function ensureFolderRecursive(folderPath: string, app: AppHandle): Promise<void> {
	const normalized = normalizeVaultPath(folderPath.trim());
	if (!normalized) return;

	const parts = normalized.split('/').filter(p => p.length > 0);
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault?.getAbstractFileByPath?.(current);
		if (existing && isFolder(existing)) continue;
		if (!existing) {
			try {
				await app.vault.createFolder(current);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes('already exist')) continue;
				const recheck = app.vault?.getAbstractFileByPath?.(current);
				if (recheck && isFolder(recheck)) continue;
				console.error(`[service/internal/vault-ops] Failed to create folder: ${current}`, { error: msg });
				throw err;
			}
		} else if (!isFolder(existing)) {
			throw new Error(`Path exists but is not a folder: ${current}`);
		}
	}
}

export async function ensureFolderRef(folderPath: string, app: AppHandle): Promise<VaultFolderRef | null> {
	const normalized = normalizeVaultPath(folderPath.trim());
	if (!normalized) throw new Error('Invalid folder path');
	await ensureFolderRecursive(normalized, app);
	const af = app.vault?.getAbstractFileByPath?.(normalized);
	if (af && isFolder(af)) return af as VaultFolderRef;
	if (app.isMock) return null;
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

/**
 * Write a file: modify if a file ref is given, create otherwise.
 */
export async function writeVaultFile(
	file: VaultFileRef | null,
	path: string,
	content: string,
	app: AppHandle,
): Promise<VaultFileRef> {
	if (file) {
		await app.vault.modify(file, content);
		return file;
	}
	const created = await app.vault.create(path, content);
	return created as VaultFileRef;
}

export async function uploadFilesToVault(
	files: File[],
	uploadFolder: string,
	app: AppHandle,
): Promise<string[]> {
	if (files.length === 0) return [];
	const normalizedFolder = uploadFolder.startsWith('/') ? uploadFolder.slice(1) : uploadFolder;
	await ensureFolderRecursive(normalizedFolder, app);

	const paths: string[] = [];
	for (const file of files) {
		const path = await uploadFileToVault(file, normalizedFolder, app);
		if (path) paths.push(path);
	}
	return paths;
}

export async function uploadFileToVault(
	file: File,
	uploadFolder: string,
	app: AppHandle,
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
		const savedFile = app.vault?.getAbstractFileByPath?.(filePath);
		if (savedFile && isFile(savedFile)) return filePath;
		return null;
	} catch (error) {
		console.error('[service/internal/vault-ops] Failed to upload file:', file.name, error);
		return null;
	}
}

/**
 * Duck-type check: TFile-like (has `extension` field, no `children`).
 * Safer than `instanceof TFile` when the file ref crosses module boundaries.
 */
export function isFile(af: unknown): af is VaultFileRef {
	return !!af && typeof af === 'object' && 'extension' in af && !('children' in af);
}

/**
 * Duck-type check: TFolder-like (has `children` field).
 */
export function isFolder(af: unknown): af is VaultFolderRef {
	return !!af && typeof af === 'object' && 'children' in af;
}

export function getFileRef(path: string, app: AppHandle): VaultFileRef | null {
	const af = app.vault?.getAbstractFileByPath?.(path);
	return isFile(af) ? (af as VaultFileRef) : null;
}

export function getFolderRef(path: string, app: AppHandle): VaultFolderRef | null {
	const af = app.vault?.getAbstractFileByPath?.(path);
	return isFolder(af) ? (af as VaultFolderRef) : null;
}
