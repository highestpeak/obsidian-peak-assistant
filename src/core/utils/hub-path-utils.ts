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

