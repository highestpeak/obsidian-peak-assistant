import type { SearchResultItem } from '@/core/search/searchTypes';
import {
	SEARCH_RESULT_INTENSITY_HIGH_THRESHOLD,
	SEARCH_RESULT_INTENSITY_MID_THRESHOLD,
} from '@/core/constant';

export type IntensityTier = 'high' | 'mid' | 'low';

/**
 * Three-tier relative strength for a Tree file row. Reads
 * `displayScorePercent` (set by `assignDisplayScorePercent` in the search
 * pipeline — already normalized so the top match is 100 and everything
 * else scales below).
 *
 * `null` / missing → `'low'`. Callers can render `'low'` as a transparent
 * spacer so file names stay column-aligned across tiers.
 */
export function intensityTier(result: SearchResultItem): IntensityTier {
	const pct = result.displayScorePercent;
	if (pct == null) return 'low';
	const ratio = pct / 100;
	if (ratio >= SEARCH_RESULT_INTENSITY_HIGH_THRESHOLD) return 'high';
	if (ratio >= SEARCH_RESULT_INTENSITY_MID_THRESHOLD) return 'mid';
	return 'low';
}
