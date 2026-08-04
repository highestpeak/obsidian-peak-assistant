import type { SearchResultItem } from '@/core/search/searchTypes';
import type { V2Source } from '../types/search-steps';

/**
 * Project cited evidence through the shared Result Browser without inventing a
 * relevance score. `readAt` records when the agent read a note; file freshness
 * comes from the app-owned Vault metadata resolver instead.
 */
export function sourcesToResultItems(
	sources: readonly V2Source[],
	lastModifiedByPath: ReadonlyMap<string, number> = new Map(),
): SearchResultItem[] {
	return sources.map((source) => ({
		id: source.path,
		type: 'markdown',
		title: source.title,
		path: source.path,
		lastModified: lastModifiedByPath.get(source.path) ?? 0,
		content: source.reasoning,
		highlight: source.reasoning ? { text: source.reasoning } : null,
		source: 'local',
	}));
}
