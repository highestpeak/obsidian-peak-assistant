import type { SearchResultItem } from '../types';

export type RankingSignals = Map<string, { lastOpenTs: number; openCount: number }>;

/**
 * Apply metadata/graph based boosts to items and return a sorted copy.
 *
 * Notes:
 * - This intentionally keeps the formula simple and stable.
 * - Minor tuning: clamp recency boost to [0, 0.3] to avoid unbounded negative drift.
 */
export function applyRankingBoosts(params: {
	items: SearchResultItem[];
	signals: RankingSignals;
	relatedPaths: Set<string>;
	nowTs?: number;
}): SearchResultItem[] {
	const now = params.nowTs ?? Date.now();
	const items = params.items.map((i) => ({ ...i }));

	for (const item of items) {
		const s = params.signals.get(item.path);
		if (!s) continue;

		const freqBoost = Math.log1p(s.openCount) * 0.15;

		const dayMs = 1000 * 60 * 60 * 24;
		const days = s.lastOpenTs ? Math.max(0, (now - s.lastOpenTs) / dayMs) : Infinity;
		const recencyBoost = Number.isFinite(days) ? Math.max(0, 0.3 - days * 0.01) : 0;

		const graphBoost = params.relatedPaths.has(item.path) ? 0.2 : 0;

		const base = item.score ?? 0;
		item.finalScore = base + freqBoost + recencyBoost + graphBoost;
	}

	items.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));
	return items;
}

