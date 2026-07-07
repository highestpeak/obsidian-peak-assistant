import type { DocRankingSignal } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { segmentToWhitespace } from '@/core/utils/segmenter';
import {
	INDEX_HUB_TIER_THRESHOLDS,
	INDEX_SEARCH_HUB_INCOMING_BOOST,
	INDEX_SEARCH_SECONDARY_INCOMING_BOOST,
	INDEX_SEARCH_HUB_DOC_TYPE_BOOST,
	INDEX_SEARCH_TITLE_MATCH_BOOST,
	INDEX_SEARCH_FOLDER_MATCH_BOOST,
	INDEX_SEARCH_CONTENT_MATCH_BOOST,
	PPR_GLOBAL_PR_DAMPENING,
} from '@/core/constant';

const CJK_RE = /[　-鿿가-힯豈-﫿]/;

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
 *            + titleHitRatio  * TITLE_MATCH_BOOST     (raw filename)
 *            + folderHitRatio * FOLDER_MATCH_BOOST    (path minus filename)
 *            + contentHitRatio * CONTENT_MATCH_BOOST  (snippet body)
 *
 * Title and folder are computed on disjoint substrings of `path` (filename
 * vs folder segments), so a term that hits both counts in title only — the
 * folder ratio is intentionally about tokens that ONLY hit the folder.
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
	/** Fraction of expanded query tokens hit in the raw filename (0..1). */
	titleHitRatio?: number;
	/** Fraction of expanded query tokens hit ONLY in folder segments (0..1). */
	folderHitRatio?: number;
	/** Fraction of expanded query tokens hit in the retrieved content snippet (0..1). */
	contentHitRatio?: number;
}

/**
 * Expand raw query terms/phrases into the set of tokens we actually try to hit.
 *   - lowercased
 *   - deduped
 *   - CJK terms additionally split via `segmentToWhitespace` (so `英语练习`
 *     also contributes sub-tokens `英语` and `练习` — matching what the fuzzy
 *     retriever does downstream)
 */
export function expandQueryTokens(terms: string[], phrases: string[]): string[] {
	const out = new Set<string>();
	const add = (raw: string): void => {
		const t = raw.trim().toLowerCase();
		if (!t) return;
		out.add(t);
		if (!CJK_RE.test(t)) return;
		const segmented = segmentToWhitespace(t);
		if (!segmented) return;
		for (const part of segmented.split(/\s+/)) {
			const p = part.trim().toLowerCase();
			if (p && p !== t) out.add(p);
		}
	};
	for (const term of terms) add(term);
	for (const phrase of phrases) add(phrase);
	return [...out];
}

/** Fraction of expanded tokens that appear as a substring of `text`. */
export function computeHitRatio(text: string | undefined, tokens: string[]): number {
	if (!text || tokens.length === 0) return 0;
	const lower = text.toLowerCase();
	let hits = 0;
	for (const tok of tokens) if (lower.includes(tok)) hits += 1;
	return hits / tokens.length;
}

/**
 * Convenience for the old title-only call site; kept so external callers /
 * tests don't need to be rewritten. New code should call `expandQueryTokens`
 * once and reuse it for title/path/content.
 */
export function computeTitleMatchRatio(
	title: string | undefined,
	terms: string[],
	phrases: string[],
): number {
	return computeHitRatio(title, expandQueryTokens(terms, phrases));
}

/**
 * Per-component breakdown of the final score. Kept as a plain data record so
 * it can be attached to a debug span verbatim.
 *
 * All *Boost fields are absolute additive contributions (already sign/scale
 * applied); `titleHitRatio`/`folderHitRatio`/`contentHitRatio` are 0..1 and
 * shown so a reader can see the raw hit-rate that produced the boost.
 */
export interface RankingBoostBreakdown {
	base: number;
	finalScore: number;
	titleHitRatio: number;
	folderHitRatio: number;
	contentHitRatio: number;
	titleBoost: number;
	folderBoost: number;
	contentBoost: number;
	freqBoost: number;
	recencyBoost: number;
	graphBoost: number;
	anchorBoost: number;
	clickBoost: number;
	hubDocBoost: number;
}

/**
 * Compute the full breakdown for one item. `computeRankingBoostFinalScore`
 * delegates to this so the on-hot-path formula and the debug-trace formula
 * can never drift.
 */
export function computeRankingBoostBreakdown(opts: RankingBoostOptions): RankingBoostBreakdown {
	const { base, signal, relatedToCurrentFile, clicked, pprActive, nowTs } = opts;
	const titleHitRatio = opts.titleHitRatio ?? 0;
	const folderHitRatio = opts.folderHitRatio ?? 0;
	const contentHitRatio = opts.contentHitRatio ?? 0;
	const titleBoost = titleHitRatio * INDEX_SEARCH_TITLE_MATCH_BOOST;
	const folderBoost = folderHitRatio * INDEX_SEARCH_FOLDER_MATCH_BOOST;
	const contentBoost = contentHitRatio * INDEX_SEARCH_CONTENT_MATCH_BOOST;
	const keywordBoost = titleBoost + folderBoost + contentBoost;

	if (!signal) {
		return {
			base,
			finalScore: base + keywordBoost,
			titleHitRatio, folderHitRatio, contentHitRatio,
			titleBoost, folderBoost, contentBoost,
			freqBoost: 0, recencyBoost: 0, graphBoost: 0,
			anchorBoost: 0, clickBoost: 0, hubDocBoost: 0,
		};
	}

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

	const finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + clickBoost + hubDocBoost + keywordBoost;
	return {
		base, finalScore,
		titleHitRatio, folderHitRatio, contentHitRatio,
		titleBoost, folderBoost, contentBoost,
		freqBoost, recencyBoost, graphBoost,
		anchorBoost, clickBoost, hubDocBoost,
	};
}

export function computeRankingBoostFinalScore(opts: RankingBoostOptions): number {
	return computeRankingBoostBreakdown(opts).finalScore;
}
