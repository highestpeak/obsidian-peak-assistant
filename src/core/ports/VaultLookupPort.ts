import type { VaultFileRef, VaultFolderRef } from './VaultFileRef';

/**
 * T11R: Narrow vault lookup port for code that needs to resolve a path to
 * a neutral file/folder ref without using `app.vault.getAbstractFileByPath`.
 *
 * This is the read-side counterpart to {@link VaultWriterPort#read}. Kept
 * separate so callers can ask for exactly the slice they need (e.g.
 * ChatDocName only needs lookup for collision checks, not writes).
 */
export interface VaultLookupPort {
	/** Resolve a path to a file ref; returns null if absent or not a file. */
	getFile(path: string): VaultFileRef | null;

	/** Resolve a path to a folder ref; returns null if absent or not a folder. */
	getFolder(path: string): VaultFolderRef | null;

	/** True if anything (file or folder) exists at the path. */
	exists(path: string): boolean;
}
