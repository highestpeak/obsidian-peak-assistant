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
