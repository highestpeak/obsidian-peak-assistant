import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { SearchResultItem, SearchScopeValue } from '../types';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { RerankProviderManager } from '@/core/providers/rerank/factory';
import type { RerankDocument } from '@/core/providers/rerank/types';
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
 * Reranker for merging and reranking hybrid search results.
 */
export class Reranker {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) { }

	/**
	 * Provider + model of the configured LLM reranker, or null when disabled.
	 * Callers (debug trace, telemetry) read this so span metadata reflects the
	 * exact reranker in effect at query time.
	 */
	getRerankModelInfo(): { provider: string; modelId: string } | null {
		const rerankModel = this.searchSettings.chunking.rerankModel;
		return rerankModel ?? null;
	}

	/**
	 * Rerank search results with optional LLM reranking.
	 * 
	 * This method handles:
	 * 1. Getting ranking signals and related paths
	 * 2. Applying ranking boosts (always performed)
	 * 3. Optional LLM reranking for high-quality but slow relevance scoring
	 * 
	 * LLM reranking is expensive and should only be enabled for specific use cases
	 * like AI analysis where quality is more important than speed.
	 * 
	 * @param items - Search results to rerank
	 * @param query - Original search query
	 * @param scopeValue - Search scope value for getting related paths
	 * @param enableLLMRerank - Whether to perform expensive LLM reranking (default: false)
	 * @returns Reranked results with updated scores
	 */
	async rerank(
		items: Array<{ path: string; score?: number }>,
		query: string,
		scopeValue?: SearchScopeValue,
		enableLLMRerank: boolean = false,
		indexTenant: IndexTenant = 'vault',
		pprActive: boolean = false,
	): Promise<SearchResultItem[]> {
		if (!query || items.length === 0) {
			return items.map((i) => ({ ...i, score: i.score ?? 0 })) as SearchResultItem[];
		}

		// Get ranking signals and related paths for boost context.
		// eg: last open time, open count, etc.
		const signals = await this.getSignalsForPaths(items.map((i) => i.path), indexTenant);
		const related = scopeValue?.currentFilePath
			? await this.getRelatedPathsWithinHops({
				startPath: scopeValue.currentFilePath,
				maxHops: 2,
			}, indexTenant)
			: new Set<string>();

		// Apply ranking boosts (always performed for better relevance)
		const itemsWithScore = items.map((i) => ({ ...i, score: i.score ?? 0 })) as SearchResultItem[];
		const boostedItems = this.applyRankingBoosts({
			items: itemsWithScore,
			signals,
			relatedPaths: related,
			pprActive,
		});

		// Optional LLM reranking (expensive, only for high-quality requirements)
		if (!enableLLMRerank) {
			return boostedItems;
		}

		// Apply LLM rerank if model is configured and enabled
		const rerankModel = this.searchSettings.chunking.rerankModel;
		if (!rerankModel) {
			return boostedItems;
		}

		// Ensure score is present for rerank
		const itemsForRerank = boostedItems.map((i) => ({
			...i,
			score: i.finalScore ?? i.score ?? 0,
		}));

		try {
			return await this.rerankResults(itemsForRerank, query, rerankModel, signals, related);
		} catch (error) {
			console.error('[Reranker] Failed to rerank results:', error);
			// Continue with boosted results if rerank fails
			return boostedItems;
		}
	}

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
	 * Internal method to perform actual reranking.
	 */
	private async rerankResults<T extends { path: string; score: number }>(
		items: T[],
		query: string,
		rerankModel: { provider: string; modelId: string },
		signals?: RankingSignals,
		relatedPaths?: Set<string>,
	): Promise<T[]> {
		// Prepare document texts for reranking
		// Use content if available, otherwise use highlight text, title, or path
		const documents: RerankDocument[] = items.map((item) => {
			const itemAny = item as any;
			const text = itemAny.content || itemAny.highlight?.text || itemAny.title || item.path;

			// Include boost context information in metadata
			const signal = signals?.get(item.path);
			const isRelated = relatedPaths?.has(item.path);
			const boostInfo: string[] = [];
			if (signal) {
				boostInfo.push(`opened ${signal.openCount} times`);
				if (signal.lastOpenTs) {
					const daysAgo = Math.floor((Date.now() - signal.lastOpenTs) / (1000 * 60 * 60 * 24));
					boostInfo.push(`last opened ${daysAgo} days ago`);
				}
			}
			if (isRelated) {
				boostInfo.push('related to current file');
			}

			return {
				text,
				metadata: {
					boostInfo: boostInfo.join(', '),
				},
			};
		});

		// Get provider config for API-based providers (cohere, jina)
		const providerConfig = this.getProviderConfig(rerankModel.provider);

		// Create rerank provider via manager (handles all provider types)
		const manager = RerankProviderManager.getInstance();
		const provider = manager.createFromRerankModel(
			rerankModel,
			providerConfig || undefined,
			this.aiServiceManager,
		);

		if (!provider) {
			console.warn(
				`[Reranker] Failed to create rerank provider for ${rerankModel.provider}. Using original ranking.`,
			);
			return items;
		}

		try {
			// Call rerank provider
			const response = await provider.rerank({
				query,
				documents,
				topK: items.length,
			});

			// Map reranked results back to original items
			// Rerank provider returns results sorted by relevance score (highest first)
			// Note: Some providers (like LLM) return rank-based scores, so we preserve original scores
			// and use rerank position as a boost factor
			const rerankedItems = response.results.map((result, rerankIndex) => {
				const originalItem = items[result.index]!;
				const originalScore = (originalItem as any).finalScore ?? originalItem.score ?? 0;

				// Normalize rerank score to 0-1 range if it's rank-based (e.g., LLM provider uses docCount - rank)
				// For API providers (cohere, jina), result.score is already a proper relevance score (0-1)
				// For LLM provider, result.score is rank-based (docCount - rank), so we normalize it
				const maxPossibleScore = items.length; // LLM provider uses docCount as max score
				const normalizedRerankScore = result.score > 1 ? result.score / maxPossibleScore : result.score;

				// Combine original score with rerank boost
				// Use weighted combination: 70% original score + 30% rerank boost
				// This preserves the original relevance while incorporating rerank improvements
				const rerankBoost = normalizedRerankScore * 0.3;
				const combinedScore = originalScore * 0.7 + rerankBoost;

				return {
					...originalItem,
					score: combinedScore,
					finalScore: combinedScore,
				};
			});

			// Ensure results are sorted by score (descending) - rerank provider should already do this, but ensure it
			rerankedItems.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));

			return rerankedItems;
		} catch (error) {
			console.error(`[Reranker] Rerank failed:`, error);
			return items;
		}
	}

	/**
	 * Get provider config from search settings.
	 */
	private getProviderConfig(providerType: string): { apiKey?: string; baseUrl?: string; extra?: Record<string, any> } | null {
		// Try to get from AI service settings
		const aiSettings = (this.searchSettings as any).ai;
		if (aiSettings?.llmProviderConfigs?.[providerType]) {
			return aiSettings.llmProviderConfigs[providerType];
		}

		// For LLM provider, try to get from rerank model config
		if (providerType === 'llm') {
			const rerankModel = this.searchSettings.chunking.rerankModel;
			if (rerankModel) {
				const providerConfig = aiSettings?.llmProviderConfigs?.[rerankModel.provider];
				return {
					apiKey: providerConfig?.apiKey,
					baseUrl: providerConfig?.baseUrl,
					extra: {
						provider: rerankModel.provider,
						...providerConfig?.extra,
					},
				};
			}
		}

		return null;
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
