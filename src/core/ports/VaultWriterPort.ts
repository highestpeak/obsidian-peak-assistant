import type { VaultFileRef, VaultFolderRef } from './VaultFileRef';

/**
 * T11R: Narrow vault write/mutation port used by service-tier storage
 * (chat docs, copilot review history, vault utils). Replaces direct
 * `app.vault.*` calls from service/core. Returns neutral
 * `VaultFileRef` / `VaultFolderRef` shapes — no Obsidian `TFile` /
 * `TFolder` escapes through this port.
 */
export interface VaultWriterPort {
	/** Read text content of a file by neutral ref or path. */
	read(target: VaultFileRef | string): Promise<string>;

	/** Cached/fast read for hot paths (e.g. listing previews). */
	cachedRead(target: VaultFileRef | string): Promise<string>;

	/** Read binary content. */
	readBinary(target: VaultFileRef | string): Promise<ArrayBuffer>;

	/** Overwrite an existing file's text content. */
	modify(target: VaultFileRef | string, content: string): Promise<void>;

	/** Create a text file (rejects if it already exists). */
	create(path: string, content: string): Promise<VaultFileRef>;

	/** Create a binary file. */
	createBinary(path: string, data: ArrayBuffer): Promise<VaultFileRef>;

	/** Create a folder (no-op if it already exists). */
	createFolder(path: string): Promise<void>;

	/** Create a folder and every missing parent (no-op if final path exists). */
	ensureFolder(path: string): Promise<void>;

	/** Move file/folder to Obsidian's trash. */
	trash(target: VaultFileRef | VaultFolderRef | string, systemTrash: boolean): Promise<void>;

	/** Rename a file/folder to a new vault path. */
	rename(target: VaultFileRef | VaultFolderRef | string, newPath: string): Promise<void>;
}
