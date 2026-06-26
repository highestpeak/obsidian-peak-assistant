/**
 * Pure vault-path helpers. No Obsidian imports.
 *
 * T11K: previously these lived in `vault-utils.ts` and `obsidian-utils.ts`
 * which also pulled in `normalizePath` from Obsidian. Splitting the pure
 * string operations into this file lets non-Obsidian-aware callers depend
 * on path math without dragging in vault adapters or the runtime.
 *
 * The normalization matches Obsidian's `normalizePath` behavior for vault-
 * relative paths: collapse repeated slashes, normalize backslashes, strip
 * leading slashes, drop trailing slashes (except root).
 */

/** Collapse `\\` to `/`, collapse repeated slashes, trim leading/trailing slashes. */
export function normalizeVaultPath(input: string): string {
	if (input == null) return '';
	let s = String(input).replace(/\\+/g, '/');
	s = s.replace(/\/+/g, '/');
	// Strip leading slash so paths are vault-relative.
	if (s.startsWith('/')) s = s.slice(1);
	// Strip trailing slash unless the whole string is empty.
	if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
	return s;
}

/** Join path parts with `/` and normalize the result. */
export function joinPath(...parts: string[]): string {
	return normalizeVaultPath(parts.join('/'));
}

/** Join `rootFolder + relativePath` and normalize. */
export function getAbsolutePath(rootFolder: string, relativePath: string): string {
	return joinPath(rootFolder, relativePath);
}

/** Strip `rootFolder` prefix from `absolutePath`; returns the rest, normalized. */
export function getRelativePath(rootFolder: string, absolutePath: string): string {
	const normalized = normalizeVaultPath(absolutePath);
	const rootNormalized = normalizeVaultPath(rootFolder);
	if (normalized.startsWith(rootNormalized)) {
		return normalized.substring(rootNormalized.length).replace(/^\//, '');
	}
	return normalized;
}

/**
 * Pure file-type classification from a vault-relative path.
 *
 * T11L: replaces call sites that previously needed `app.vault.getAbstractFileByPath`
 * just to discriminate note vs file vs folder. Pure heuristic:
 * `.md` → `note`, any other extension → `file`, no extension → `folder`.
 *
 * The "no extension == folder" heuristic is good enough for search-result
 * filtering (where folders are not in the result set anyway). For full
 * vault-tree semantics that need to distinguish a TFile from a TFolder,
 * the caller should still resolve via the vault adapter.
 */
export function getFileTypeByExtension(path: string): 'note' | 'file' | 'folder' {
	const lastSlash = path.lastIndexOf('/');
	const basename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
	const dot = basename.lastIndexOf('.');
	if (dot <= 0) return 'folder';
	const ext = basename.slice(dot + 1).toLowerCase();
	return ext === 'md' ? 'note' : 'file';
}
