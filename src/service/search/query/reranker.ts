import type { SearchResultItem } from '../types';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { DocRankingSignal } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import {
	computeRankingBoostBreakdown,
	computeHitRatio,
	expandQueryTokens,
	type RankingBoostBreakdown,
} from './rankingBoosts';

/**
 * Ranking signals for boosting search results.
 */
export type RankingSignals = Map<string, DocRankingSignal>;

/** Basename minus extension. Used for keyword-hit boost so we ignore the
 * FTS-normalized `item.title` (which drops hyphens and inserts CJK spaces). */
function deriveRawFilename(path: string): string {
	const base = path.split('/').pop() ?? path;
	const dot = base.lastIndexOf('.');
	return dot > 0 ? base.slice(0, dot) : base;
}

/** Folder segments of a vault path (everything except the final basename). */
function deriveFolderPath(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx >= 0 ? path.slice(0, idx) : '';
}

/**
 * Deterministic ranking boosts and post-ranking filters for hybrid search.
 */
export class Reranker {
	/**
	 * Get ranking signals for given paths.
	 */
	async getSignalsForPaths(paths: string[], tenant: IndexTenant = 'vault'): Promise<RankingSignals> {
		if (!paths.length) return new Map();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

		// Get doc_ids from paths
		const metaMap = await indexedDocumentRepo.getByPaths(paths);
		const docIds = Array.from(metaMap.values()).map((m) => m.id);
		const signals = await mobiusNodeRepo.getSignalsForDocIds(docIds);

		// Map back to paths
		const pathToDocId = new Map(Array.from(metaMap.entries()).map(([path, meta]) => [path, meta.id]));
		const result = new Map<string, DocRankingSignal>();
		for (const [path, docId] of pathToDocId.entries()) {
			const signal = signals.get(docId);
			if (signal) {
				result.set(path, signal);
			}
		}
		return result;
	}

	/**
	 * Get related document paths within N hops using GraphRepo.
	 */
	async getRelatedPathsWithinHops(params: { startPath: string; maxHops: number }, tenant: IndexTenant = 'vault'): Promise<Set<string>> {
		const maxHops = Math.max(1, Number(params.maxHops ?? 2));
		const graphRepo = sqliteStoreManager.getGraphRepo(tenant);
		return await graphRepo.getRelatedFilePaths({
			currentFilePath: params.startPath,
			maxHops,
		});
	}

	/**
	 * Apply metadata/graph based boosts to items and return a sorted copy.
	 *
	 * Current boost strategy:
	 * 1. Frequency boost (freqBoost):
	 *    - Formula: log1p(openCount) * 0.15
	 *    - Uses logarithmic scaling to prevent over-weighting high-frequency items
	 *    - Example: 1 open -> ~0.10, 10 opens -> ~0.38, 100 opens -> ~0.69
	 *
	 * 2. Recency boost (recencyBoost):
	 *    - Formula: max(0, 0.3 - days * 0.01)
	 *    - Clamped to [0, 0.3] to avoid unbounded negative drift
	 *    - Linear decay: 0.3 for today, 0.2 for 10 days ago, 0 for 30+ days ago
	 *    - Rewards recently accessed documents
	 *
	 * 3. Graph boost (graphBoost):
	 *    - Fixed value: 0.2 if file is related to current file (within 2 hops), 0 otherwise
	 *    - Binary boost: either related or not (no distance weighting currently)
	 *
	 * Final score: baseScore + freqBoost + recencyBoost + graphBoost + anchorBoost
	 *
	 * Anchor boost: when `pagerankVersion` is set on the document node (`mobius_node.pagerank_version`),
	 * hub-style boosts can use explicit `hubTier` signals when present; otherwise falls back to incoming
	 * reference count thresholds.
	 *
	 * Potential extensions (not yet implemented):
	 * - Recent 2-week access count: track and boost based on opens within last 14 days
	 * - Bookmark boost: add fixed boost for bookmarked documents
	 * - Content richness boost: use richness_score from doc_statistics (word_count, link_count, etc.)
	 * - Graph distance weighting: use actual hop distance (1 hop > 2 hops) instead of binary
	 * - Keyword match boost: differentiate title matches (higher) vs content matches (lower)
	 * - Match frequency boost: more query term matches in title/content should boost more
	 *
	 * Notes:
	 * - This intentionally keeps the formula simple and stable.
	 * - All boosts are additive to maintain interpretability.
	 */
	applyRankingBoosts(params: {
		items: SearchResultItem[];
		signals: RankingSignals;
		relatedPaths: Set<string>;
		nowTs?: number;
		pprActive?: boolean;
		clickedPaths?: Set<string>;
		/** Query terms + phrases used to compute keyword-hit boosts per item. */
		queryTerms?: string[];
		queryPhrases?: string[];
		/**
		 * When provided, per-item boost breakdowns are written into this map
		 * keyed by `item.path`. Debug callers pass a fresh Map to record what
		 * each individual boost contributed; production callers omit this so
		 * we skip the (small) allocation.
		 */
		breakdownOut?: Map<string, RankingBoostBreakdown>;
	}): SearchResultItem[] {
		const now = params.nowTs ?? Date.now();
		const items = params.items.map((i) => ({ ...i }));

		// Expand once for the whole batch; each item then does 3 cheap
		// substring passes over its raw filename, path and content.
		const tokens = expandQueryTokens(params.queryTerms ?? [], params.queryPhrases ?? []);
		const capture = params.breakdownOut;

		for (const item of items) {
			const rawTitle = deriveRawFilename(item.path);
			const folderPart = deriveFolderPath(item.path);
			const breakdown = computeRankingBoostBreakdown({
				base: item.score ?? 0,
				signal: params.signals.get(item.path),
				relatedToCurrentFile: params.relatedPaths.has(item.path),
				clicked: params.clickedPaths?.has(item.path) ?? false,
				pprActive: params.pprActive ?? false,
				nowTs: now,
				titleHitRatio: computeHitRatio(rawTitle, tokens),
				folderHitRatio: computeHitRatio(folderPart, tokens),
				contentHitRatio: computeHitRatio(item.content, tokens),
			});
			item.finalScore = breakdown.finalScore;
			if (capture) capture.set(item.path, breakdown);
		}

		items.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));
		return items;
	}

	/**
	 * Post-ranking exclude filter. Removes results whose content or title
	 * contains any excluded term. Safety net for Vector/Fuzzy results
	 * that don't support FTS5 NOT syntax.
	 */
	applyExcludeFilter(
		items: SearchResultItem[],
		excludes: string[],
	): SearchResultItem[] {
		if (excludes.length === 0) return items;
		return items.filter(item => {
			const text = ((item.title ?? '') + ' ' + (item.content ?? '')).toLowerCase();
			return !excludes.some(ex => text.includes(ex));
		});
	}

	/**
	 * Post-ranking folder filter. Applied uniformly across all retrievers
	 * so `folder:PATH` narrows FTS + vector + fuzzy + meta hits alike.
	 * Matches path prefix at a folder boundary, case-insensitive; strips
	 * leading/trailing slashes on both sides so `folder:foo`, `folder:/foo/`
	 * and `folder:foo/` all behave the same.
	 */
	applyFolderFilter(
		items: SearchResultItem[],
		folders: string[],
	): SearchResultItem[] {
		if (folders.length === 0) return items;
		const norms = folders
			.map(f => f.replace(/^\/+|\/+$/g, '').toLowerCase())
			.filter(f => f.length > 0);
		if (norms.length === 0) return items;
		return items.filter(item => {
			const p = item.path.replace(/^\/+/, '').toLowerCase();
			return norms.some(f => p === f || p.startsWith(f + '/'));
		});
	}
}
