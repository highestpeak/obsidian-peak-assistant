/**
 * Neutral, plain-data handles for vault files and folders.
 *
 * T11K: loaders and core code never see Obsidian `TFile` / `TFolder`.
 * The app-layer adapter (`AppVaultReaderAdapter`) maps Obsidian types
 * to these shapes at the boundary.
 *
 * Hard rule: these objects must remain plain data. Do NOT attach methods
 * and do NOT store the underlying `TFile` / `TFolder` on them.
 */

export interface VaultFileStat {
	size: number;
	mtime: number;
	ctime: number;
}

export interface VaultFileRef {
	/** Vault-relative path, e.g. `notes/foo.md`. */
	path: string;
	/** File name including extension, e.g. `foo.md`. */
	name: string;
	/** File name without extension, e.g. `foo`. */
	basename: string;
	/** Lower-case extension without leading dot, e.g. `md`. */
	extension: string;
	stat: VaultFileStat;
}

export interface VaultFolderRef {
	/** Vault-relative path. Root folder uses `''`. */
	path: string;
	/** Folder name (last segment). */
	name: string;
}
