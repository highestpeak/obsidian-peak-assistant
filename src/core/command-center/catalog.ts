import type { CommandCenterCatalogEntry } from './types';

function catalogMatchRank(entry: CommandCenterCatalogEntry, normalizedQuery: string): number {
	const label = entry.label.toLocaleLowerCase();
	const source = entry.sourceLabel.toLocaleLowerCase();
	const key = entry.key.toLocaleLowerCase();
	if (label === normalizedQuery) return 0;
	if (label.startsWith(normalizedQuery)) return 1;
	if (label.includes(normalizedQuery)) return 2;
	if (source.startsWith(normalizedQuery)) return 3;
	if (source.includes(normalizedQuery)) return 4;
	if (key.includes(normalizedQuery)) return 5;
	return 6;
}

/**
 * Build the launcher's global command fallback without duplicating commands
 * already visible in the curated result projection.
 */
export function prepareCommandCenterGlobalMatches(
	entries: CommandCenterCatalogEntry[],
	visibleConfiguredKeys: ReadonlySet<string>,
	query: string,
): CommandCenterCatalogEntry[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [];
	const seen = new Set(visibleConfiguredKeys);
	return entries
		.filter((entry) => {
			if (entry.layer !== 'command' || !entry.available || seen.has(entry.key)) return false;
			seen.add(entry.key);
			return true;
		})
		.sort((left, right) => {
			const rankDelta = catalogMatchRank(left, normalizedQuery) - catalogMatchRank(right, normalizedQuery);
			if (rankDelta !== 0) return rankDelta;
			const labelDelta = left.label.localeCompare(right.label);
			if (labelDelta !== 0) return labelDelta;
			return left.sourceLabel.localeCompare(right.sourceLabel);
		});
}
