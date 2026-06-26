import type { VaultFileRef, VaultFolderRef } from './VaultFileRef';

/**
 * Narrow, read-only vault port used by document/resource loaders.
 *
 * Forbidden by design (T11K): create / modify / delete / rename, event
 * subscription, workspace, adapter pass-through. Loaders never mutate
 * the vault and never need editor or workspace access.
 *
 * The port returns neutral `VaultFileRef` / `VaultFolderRef` shapes so
 * that no Obsidian `TFile` / `TFolder` escapes through it.
 */
export interface DocumentVaultReaderPort {
	/** Resolve a path to a file ref; returns null if absent or not a file. */
	getFile(path: string): VaultFileRef | null;

	/** Resolve a path to a folder ref; returns null if absent or not a folder. */
	getFolder(path: string): VaultFolderRef | null;

	/** All files in the vault, in vault iteration order. */
	listFiles(): VaultFileRef[];

	/** Immediate children of a folder (non-recursive). Returns empty arrays if the folder is absent. */
	listFolderChildren(folderPath: string): {
		files: VaultFileRef[];
		folders: VaultFolderRef[];
	};

	/** Read file contents as text using the vault's cached read fast path. */
	readText(file: VaultFileRef): Promise<string>;

	/** Read file contents as binary. */
	readBinary(file: VaultFileRef): Promise<ArrayBuffer>;
}
