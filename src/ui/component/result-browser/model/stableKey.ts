/**
 * Stable cross-view identity for a result. Contract #1 of the shared plan:
 * "Normalize selection to `docId ?? path ?? id` in every view." List rows,
 * Tree files and Graph nodes all resolve their identity through this one
 * helper so a selection made in one view maps losslessly to another.
 */
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { ResultItemId } from './types';

/**
 * Resolve the stable id for a result. Prefers the indexed document id, then
 * the vault path, then the raw engine id. Empty strings are skipped (an empty
 * `docId` must not shadow a real `path`).
 */
export function stableItemId(item: Pick<SearchResultItem, 'docId' | 'path' | 'id'>): ResultItemId {
	return firstNonEmpty(item.docId, item.path, item.id);
}

/**
 * Same precedence for a loose `{ docId?, path?, id? }` — used where a graph
 * node or tree file carries only a subset of the fields.
 */
export function stableIdFrom(parts: { docId?: string | null; path?: string | null; id?: string | null }): ResultItemId {
	return firstNonEmpty(parts.docId, parts.path, parts.id);
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
	for (const v of values) {
		if (typeof v === 'string' && v.length > 0) return v;
	}
	return '';
}
