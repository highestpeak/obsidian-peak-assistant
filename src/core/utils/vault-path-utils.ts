/**
 * Vault-relative path helpers for folder hierarchy and cross-link analysis.
 */

/** Normalizes path separators and trims slashes (no leading slash). */
export function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Path segments for a vault file path (excluding empty).
 * "a/b/c.md" -> ["a","b","c.md"]
 */
export function pathSegments(path: string): string[] {
	const n = normalizeVaultPath(path);
	if (!n) return [];
	return n.split('/').filter(Boolean);
}

/**
 * Directory path of a file: parent folder path without trailing slash.
 * "a/b/c.md" -> "a/b"
 */
export function parentDirPath(path: string): string {
	const segs = pathSegments(path);
	if (segs.length <= 1) return '';
	return segs.slice(0, -1).join('/');
}

/**
 * Minimum common ancestor depth of two paths (0 = only virtual root).
 * Depth = number of path segments in the LCA.
 * Example: "Work/A/x" and "Personal/B/y" -> LCA "" -> depth 0.
 */
export function pathLcaDepth(a: string, b: string): number {
	const sa = pathSegments(a);
	const sb = pathSegments(b);
	let i = 0;
	while (i < sa.length && i < sb.length && sa[i] === sb[i]) {
		i++;
	}
	return i;
}

/**
 * True when the two paths are under different top-level folders (first segment differs).
 */
export function crossesTopLevelFolder(a: string, b: string): boolean {
	const sa = pathSegments(a);
	const sb = pathSegments(b);
	if (!sa.length || !sb.length) return false;
	return sa[0] !== sb[0];
}
