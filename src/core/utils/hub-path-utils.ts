/**
 * Helpers for Hub summary folder paths (vault-relative) and tenant routing.
 */

import { normalizeVaultPath } from '@/core/utils/vault-path-utils';

/**
 * True when `path` is exactly `prefix` or under `prefix/` (vault-relative, normalized).
 */
export function isVaultPathUnderPrefix(path: string, prefix: string): boolean {
	const p = normalizeVaultPath(path);
	const pre = normalizeVaultPath(prefix);
	if (!pre) return false;
	if (p === pre) return true;
	return p.startsWith(pre + '/');
}

/**
 * True when `path` matches any normalized prefix: equals, is under a prefix, or a prefix is under `path`
 * (folder-prefix hints where the hint may be a parent or child of the candidate path).
 */
export function pathMatchesAnyPrefix(path: string, prefixes: string[]): boolean {
	if (!prefixes.length) return true;
	const p = normalizeVaultPath(path.trim());
	if (!p) return false;
	for (const raw of prefixes) {
		const pref = normalizeVaultPath(raw.trim());
		if (!pref) continue;
		if (p === pref || p.startsWith(`${pref}/`) || pref.startsWith(`${p}/`)) return true;
	}
	return false;
}
