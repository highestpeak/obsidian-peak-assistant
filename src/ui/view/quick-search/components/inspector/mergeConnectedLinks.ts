import type { ConnectedLink } from '@/service/search/inspectorService';

/**
 * UI-facing direction. Extends `ConnectedLink['direction']` with `'both'`
 * for the merged case where the same target appears in both incoming and
 * outgoing lists. Kept UI-local so the service type stays honest about
 * what the DB rows look like.
 */
export type MergedDirection = 'out' | 'in' | 'both';

export interface MergedConnectedLink extends Omit<ConnectedLink, 'direction'> {
	direction: MergedDirection;
}

/**
 * Merge same-target out+in link pairs into a single `both` row. Preserves
 * original array order — the first occurrence's slot is kept and the second
 * is dropped. Non-paired rows pass through unchanged.
 *
 * Merge policy for the composite `both` row:
 *   - `direction` → `'both'`
 *   - `contextSnippet` → prefer non-null (out preferred when both present)
 *   - `convergenceCount` → max of the two (they should agree, but be safe)
 *   - `relevanceScore` → max of the two (both computed off same text)
 *   - `label` / `path` → from first occurrence
 *
 * Pure: never mutates input; returns a new array of new objects.
 */
export function mergeConnectedLinks(links: ConnectedLink[]): MergedConnectedLink[] {
	const byPath = new Map<string, number>();
	const out: MergedConnectedLink[] = [];
	for (const link of links) {
		const existingIdx = byPath.get(link.path);
		if (existingIdx === undefined) {
			byPath.set(link.path, out.length);
			out.push({ ...link });
			continue;
		}
		const existing = out[existingIdx];
		if (existing.direction === link.direction) continue;
		out[existingIdx] = {
			...existing,
			direction: 'both',
			contextSnippet: existing.contextSnippet ?? link.contextSnippet,
			convergenceCount: Math.max(existing.convergenceCount, link.convergenceCount),
			relevanceScore: pickMaxScore(existing.relevanceScore, link.relevanceScore),
		};
	}
	return out;
}

function pickMaxScore(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	if (b === null) return a;
	return Math.max(a, b);
}
