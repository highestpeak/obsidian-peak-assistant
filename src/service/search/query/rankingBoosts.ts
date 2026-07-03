import type { DocRankingSignal } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import {
	INDEX_HUB_TIER_THRESHOLDS,
	INDEX_SEARCH_HUB_INCOMING_BOOST,
	INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
	INDEX_SEARCH_HUB_DOC_TYPE_BOOST,
	PPR_GLOBAL_PR_DAMPENING,
} from '@/core/constant';

/**
 * Additive boost formula for one search result item.
 *
 * finalScore = base
 *            + log1p(openCount) * 0.10          (frequency)
 *            + max(0, 0.2 - days * 0.005)       (recency, days since lastOpen)
 *            + 0.2 if relatedToCurrentFile      (graph proximity)
 *            + anchorBoost                      (hub tier or incoming-cnt)
 *            + 0.15 if clicked                  (session preference)
 *            + INDEX_SEARCH_HUB_DOC_TYPE_BOOST if hub_doc
 *
 * When PPR is active, anchorBoost is multiplied by PPR_GLOBAL_PR_DAMPENING
 * to avoid double-counting graph importance.
 *
 * Pure: no I/O, no DB, no `this`. Used by `Reranker.applyRankingBoosts`.
 */
export interface RankingBoostOptions {
	base: number;
	signal: DocRankingSignal | undefined;
	relatedToCurrentFile: boolean;
	clicked: boolean;
	pprActive: boolean;
	nowTs: number;
}

export function computeRankingBoostFinalScore(opts: RankingBoostOptions): number {
	const { base, signal, relatedToCurrentFile, clicked, pprActive, nowTs } = opts;
	if (!signal) return base;

	const freqBoost = Math.log1p(signal.openCount ?? 0) * 0.10;

	const dayMs = 1000 * 60 * 60 * 24;
	const days = signal.lastOpenTs
		? Math.max(0, (nowTs - signal.lastOpenTs) / dayMs)
		: Infinity;
	const recencyBoost = Number.isFinite(days) ? Math.max(0, 0.2 - days * 0.005) : 0;

	const graphBoost = relatedToCurrentFile ? 0.2 : 0;

	const inc = signal.docIncomingCnt ?? 0;
	const th = INDEX_HUB_TIER_THRESHOLDS;
	let anchorBoost = 0;
	const prReady = typeof signal.pagerankVersion === 'number';
	if (prReady) {
		if (signal.hubTier === 'hub') anchorBoost = INDEX_SEARCH_HUB_INCOMING_BOOST;
		else if (signal.hubTier === 'secondary') anchorBoost = INDEX_SEARCH_SECONDARY_INCOMING_BOOST;
		else if (signal.hubTier === 'none') anchorBoost = 0;
		else if (inc >= th.hubIncomingMin) anchorBoost = INDEX_SEARCH_HUB_INCOMING_BOOST;
		else if (inc >= th.secondaryIncomingMin) anchorBoost = INDEX_SEARCH_SECONDARY_INCOMING_BOOST;
	} else if (inc >= th.hubIncomingMin) {
		anchorBoost = INDEX_SEARCH_HUB_INCOMING_BOOST;
	} else if (inc >= th.secondaryIncomingMin) {
		anchorBoost = INDEX_SEARCH_SECONDARY_INCOMING_BOOST;
	}
	if (pprActive) anchorBoost *= PPR_GLOBAL_PR_DAMPENING;

	const clickBoost = clicked ? 0.15 : 0;
	const hubDocBoost = signal.mobiusNodeType === 'hub_doc' ? INDEX_SEARCH_HUB_DOC_TYPE_BOOST : 0;

	return base + freqBoost + recencyBoost + graphBoost + anchorBoost + clickBoost + hubDocBoost;
}
