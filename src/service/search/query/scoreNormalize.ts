import type { SearchResultItem } from '@/core/search/searchTypes';

/**
 * Relative-normalize each item's `finalScore` (or `score` fallback) against
 * the max in the same result set, and write the result into
 * `displayScorePercent` (0–100 int). Top item is 100%; below scale linearly.
 *
 * The underlying `finalScore` is an additive boost sum that can exceed 1.0
 * (see `rankingBoosts.ts` head-comment), so a "raw × 100" percentage is
 * semantically wrong — it implies a probability. Relative normalization
 * gives the user a "how close to the best match in this set" reading that
 * matches the scoring reality.
 *
 * Pure: mutates `displayScorePercent` on each item in place, returns the
 * same array reference for convenience. When `maxScore <= 0` or all items
 * are score-less, everyone gets `null` (UI hides the pill).
 */
export function assignDisplayScorePercent(items: SearchResultItem[]): SearchResultItem[] {
	let maxScore = 0;
	for (const item of items) {
		const raw = item.finalScore ?? item.score ?? 0;
		if (raw > maxScore) maxScore = raw;
	}
	if (maxScore <= 0) {
		for (const item of items) item.displayScorePercent = null;
		return items;
	}
	for (const item of items) {
		const raw = item.finalScore ?? item.score ?? 0;
		item.displayScorePercent = raw > 0 ? Math.round((raw / maxScore) * 100) : null;
	}
	return items;
}
