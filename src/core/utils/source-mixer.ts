import type { SearchResultItem, SearchResultSource } from '@/service/search/types';

/**
 * Mix search results from different sources, ensuring minimum items per source.
 * 
 * Strategy:
 * 1. Ensure each source has at least `minPerSource` items
 * 2. Interleave remaining items by score (round-robin by source)
 * 
 * @deprecated we shouldn't use this during ui logic
 * 
 * @param items - Search results with source information
 * @param minPerSource - Minimum items to include from each source (default: 2)
 * @returns Mixed and sorted results
 */
export function mixSearchResultsBySource(
	items: SearchResultItem[],
	minPerSource: number = 2,
): SearchResultItem[] {
	// Group items by source
	const bySource = new Map<SearchResultSource, SearchResultItem[]>();
	
	// Default to 'local' if source is not specified
	items.forEach(item => {
		const source = item.source || 'local';
		if (!bySource.has(source)) {
			bySource.set(source, []);
		}
		bySource.get(source)!.push(item);
	});
	
	// Sort each group by score (descending)
	bySource.forEach((group) => {
		group.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));
	});
	
	const result: SearchResultItem[] = [];
	const sources = Array.from(bySource.keys());
	
	// Step 1: Ensure minimum items per source
	const taken = new Map<SearchResultSource, number>();
	sources.forEach(source => {
		const group = bySource.get(source)!;
		const take = Math.min(minPerSource, group.length);
		for (let i = 0; i < take; i++) {
			result.push(group[i]!);
		}
		taken.set(source, take);
	});
	
	// Step 2: Interleave remaining items by score (round-robin)
	const maxRemaining = Math.max(...sources.map(source => {
		const group = bySource.get(source)!;
		return group.length - (taken.get(source) || 0);
	}));
	
	for (let i = 0; i < maxRemaining; i++) {
		sources.forEach(source => {
			const group = bySource.get(source)!;
			const alreadyTaken = taken.get(source) || 0;
			if (alreadyTaken + i < group.length) {
				result.push(group[alreadyTaken + i]!);
			}
		});
	}
	
	// Final sort by score to ensure best results are at top
	result.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));
	
	return result;
}

