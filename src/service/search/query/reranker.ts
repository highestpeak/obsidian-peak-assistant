import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import type { SearchResultItem, SearchScopeValue } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { RerankProviderManager } from '@/service/chat/providers/rerank/factory';
import type { RerankDocument } from '@/service/chat/providers/rerank/types';

/**
 * Ranking signals for boosting search results.
 */
export type RankingSignals = Map<string, { lastOpenTs: number; openCount: number }>;

/**
 * Reranker for merging and reranking hybrid search results.
 */
export class Reranker {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {}

	/**
	 * Rerank search results using a rerank model.
	 * 
	 * This method handles:
	 * 1. Getting ranking signals and related paths
	 * 2. Applying ranking boosts
	 * 3. Reranking with boost context
	 * 
	 * This function can be extended to support:
	 * 1. Dedicated rerank APIs (e.g., Cohere Rerank API, Jina Reranker)
	 * 2. LLM-based relevance scoring
	 * 3. Cross-encoder models for reranking
	 * 
	 * @param items - Search results to rerank
	 * @param query - Original search query
	 * @param scopeValue - Search scope value for getting related paths
	 * @returns Reranked results with updated scores, or original results if rerank is not configured or fails
	 */
	async rerank(
		items: Array<{ path: string; score?: number }>,
		query: string,
		scopeValue?: SearchScopeValue,
	): Promise<SearchResultItem[]> {
		if (!query || items.length === 0) {
			return items.map((i) => ({ ...i, score: i.score ?? 0 })) as SearchResultItem[];
		}

		// Get ranking signals and related paths for boost context
		const signals = await this.getSignalsForPaths(items.map((i) => i.path));
		const related = scopeValue?.currentFilePath
			? await this.getRelatedPathsWithinHops({
					startPath: scopeValue.currentFilePath,
					maxHops: 2,
				})
			: new Set<string>();

		// Apply ranking boosts first
		const itemsWithScore = items.map((i) => ({ ...i, score: i.score ?? 0 })) as SearchResultItem[];
		const boostedItems = this.applyRankingBoosts({ items: itemsWithScore, signals, relatedPaths: related });

		// Apply rerank if model is configured (with boost context)
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
	private async getSignalsForPaths(paths: string[]): Promise<RankingSignals> {
		if (!paths.length) return new Map();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();

		// Get doc_ids from paths
		const metaMap = await docMetaRepo.getByPaths(paths);
		const docIds = Array.from(metaMap.values()).map((m) => m.id);
		const signals = await docStatisticsRepo.getSignalsForDocIds(docIds);

		// Map back to paths
		const pathToDocId = new Map(Array.from(metaMap.entries()).map(([path, meta]) => [path, meta.id]));
		const result = new Map<string, { lastOpenTs: number; openCount: number }>();
		for (const [path, docId] of pathToDocId.entries()) {
			const signal = signals.get(docId);
			if (signal) {
				result.set(path, signal);
			}
		}
		return result;
	}

	/**
	 * Get related document paths within N hops using GraphStore.
	 */
	private async getRelatedPathsWithinHops(params: { startPath: string; maxHops: number }): Promise<Set<string>> {
		const maxHops = Math.max(1, Number(params.maxHops ?? 2));
		const graphStore = sqliteStoreManager.getGraphStore();
		return await graphStore.getRelatedFilePaths({
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
			return response.results.map((result) => {
				const originalItem = items[result.index]!;
				return {
					...originalItem,
					score: result.score,
				};
			});
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
	 * Notes:
	 * - This intentionally keeps the formula simple and stable.
	 * - Minor tuning: clamp recency boost to [0, 0.3] to avoid unbounded negative drift.
	 */
	applyRankingBoosts(params: {
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
}
