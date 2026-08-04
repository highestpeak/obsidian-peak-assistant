export interface ComposerFindMatch {
	from: number;
	to: number;
}

/** Case-insensitive, non-overlapping source ranges for Composer-local find. */
export function findComposerMatches(source: string, query: string): ComposerFindMatch[] {
	const needle = query.trim();
	if (!needle) return [];
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const matcher = new RegExp(escaped, 'giu');
	const matches: ComposerFindMatch[] = [];
	for (const match of source.matchAll(matcher)) {
		const from = match.index;
		matches.push({ from, to: from + match[0].length });
	}
	return matches;
}
