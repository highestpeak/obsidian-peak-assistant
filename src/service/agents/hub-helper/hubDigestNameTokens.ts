/**
 * Tokenize file or folder basenames for hub digest “top token” columns (dedupe by frequency).
 */

/** Strips last extension segment from a file basename (e.g. `note.md` -> `note`). */
export function stripFileExtensionBasename(basename: string): string {
	const i = basename.lastIndexOf('.');
	if (i <= 0) return basename;
	return basename.slice(0, i);
}

/**
 * Splits a single basename (no path) into tokens: delimiters + simple camelCase boundaries.
 * Latin tokens are lowercased and must be length >= 2; CJK segments kept up to 32 chars.
 */
export function tokenizeHubDigestBasename(rawBasename: string): string[] {
	const base = stripFileExtensionBasename(rawBasename.trim());
	if (!base) return [];
	const withCamel = base
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
	const parts = withCamel.split(/[\s\-_/\.，、]+/).filter(Boolean);
	const out: string[] = [];
	for (const p of parts) {
		const t = p.trim();
		if (!t) continue;
		if (/^[\x00-\x7f]+$/.test(t)) {
			const low = t.toLowerCase();
			if (low.length >= 2) out.push(low);
		} else if (t.length <= 32) {
			out.push(t.toLowerCase());
		}
	}
	return out;
}

/**
 * Aggregates tokens from many basenames, counts occurrences, returns top `maxTokens` by frequency (then lexicographic).
 */
export function topTokensFromBasenames(basenames: string[], maxTokens: number): string[] {
	const counts = new Map<string, number>();
	for (const name of basenames) {
		for (const tok of tokenizeHubDigestBasename(name)) {
			counts.set(tok, (counts.get(tok) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, Math.max(0, maxTokens))
		.map(([t]) => t);
}
