import type { SearchQuery, SearchResponse, SearchResultItem, SearchResultType } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { Reranker } from './reranker';
import { DEFAULT_SEARCH_TOP_K } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import {
	RRF_K,
	PPR_SEED_K,
	PPR_RRF_WEIGHT,
	PPR_CM_RRF_WEIGHT,
	PPR_MAX_EXPANSION_RESULTS,
} from '@/core/constant';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { computePPR } from './personalizedPageRank';
import { createPPREdgeFetcher } from './pprEdgeFetcher';
import { parseQuery } from './query-parser';
import { RetrieverRegistry } from '@/service/search/retriever/registry';
import { FtsRetriever } from '@/service/search/retriever/fts-retriever';
import { FtsStemRetriever } from '@/service/search/retriever/fts-stem-retriever';
import { VectorRetriever } from '@/service/search/retriever/vector-retriever';
import { MetaRetriever } from '@/service/search/retriever/meta-retriever';
import { FuzzyRetriever } from '@/service/search/retriever/fuzzy-retriever';
import { rrfMerge } from '@/service/search/merger/rrf-merger';
import { HighlightEngine } from './highlight-engine';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';

/**
 * Query service for search operations.
 * Handles fulltext, vector, hybrid search, and graph queries.
 */
export class QueryService {
	private readonly reranker: Reranker;
	private readonly registry: RetrieverRegistry;
	private readonly highlightEngine = new HighlightEngine();

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {
		this.reranker = new Reranker(aiServiceManager, searchSettings);
		this.registry = new RetrieverRegistry();
		this.registry.register(new FtsRetriever());
		this.registry.register(new FtsStemRetriever());
		this.registry.register(new VectorRetriever());
		this.registry.register(new MetaRetriever());
		this.registry.register(new FuzzyRetriever());
	}

	/**
	 * Execute multi-retriever search pipeline:
	 * 1. Parse query into a QueryPlan (terms, phrases, excludes, filters, weights)
	 * 2. Execute all active retrievers in parallel via RetrieverRegistry
	 * 3. Merge results with adaptive RRF (weights from QueryPlan)
	 * 4. PPR graph-based reranking
	 * 5. Ranking boosts (frequency, recency, graph, hub, click-through)
	 * 6. Exclude filter, highlight, optional LLM rerank
	 */
	async textSearch(query: SearchQuery, enableLLMRerank: boolean = false): Promise<SearchResponse & { duration: number }> {
		const sw = new Stopwatch('SearchQuery');
		const termRaw = query?.text ?? '';
		const plan = parseQuery(termRaw);

		if (plan.terms.length === 0 && plan.phrases.length === 0) {
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		// Execute all active retrievers
		sw.start('retriever_execution');
		const retrieverResults = await this.registry.executeAll(plan);
		sw.stop();

		// Merge with adaptive RRF
		sw.start('rrf_merge');
		const merged = rrfMerge(retrieverResults, plan.retrievers);
		sw.stop();

		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);

		// Convert MergedResult[] to SearchResultItem[]
		let resultItems: SearchResultItem[] = merged.slice(0, topK * 2).map(m => ({
			id: m.path,
			path: m.path,
			title: m.best.title ?? m.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? m.path,
			type: (m.best.type ?? 'unknown') as SearchResultType,
			content: m.best.content ?? '',
			score: m.rrfScore,
			lastModified: m.best.lastModified ?? 0,
			docId: m.best.docId,
			highlight: null,
			contentRaw: m.best.contentRaw,
			matchType: m.best.matchType,
			fuzzyCorrection: m.best.fuzzyCorrection,
		}));

		// PPR graph-based reranking
		const tenant = query?.indexTenant ?? 'vault';
		const enablePPR = query.enablePPR !== false;
		let pprActive = false;
		if (enablePPR && resultItems.length > 0) {
			sw.start('ppr_computation');
			try {
				const pprEnriched = await this.applyPPR(resultItems, tenant);
				pprActive = pprEnriched !== resultItems;
				resultItems = pprEnriched as SearchResultItem[];
			} catch (error) {
				console.error('[QueryService] PPR failed, using original results:', error);
			}
			sw.stop();
		}

		// Ranking boosts with click-through
		sw.start('ranking_boosts');
		const clickedPaths = this.getClickedPaths(plan);
		const signals = await this.reranker.getSignalsForPaths(resultItems.map(i => i.path), tenant);
		const relatedPaths = query.scopeValue?.currentFilePath
			? await this.reranker.getRelatedPathsWithinHops(
				{ startPath: query.scopeValue.currentFilePath, maxHops: 2 },
				tenant,
			)
			: new Set<string>();
		resultItems = this.reranker.applyRankingBoosts({
			items: resultItems,
			signals,
			relatedPaths,
			pprActive,
			clickedPaths,
		});
		sw.stop();

		// Post-ranking exclude filter
		if (plan.excludes.length > 0) {
			resultItems = this.reranker.applyExcludeFilter(resultItems, plan.excludes);
		}

		// Trim to topK
		resultItems = resultItems.slice(0, topK);

		// Highlight on final results only
		sw.start('highlighting');
		for (const item of resultItems) {
			const raw = item.contentRaw ?? item.content ?? '';
			const norm = item.content ?? '';
			item.highlight = this.highlightEngine.highlightSnippet(raw, norm, plan);
			item.titleHighlight = this.highlightEngine.highlight(item.title ?? '', plan);
		}
		sw.stop();

		// Optional LLM rerank
		if (enableLLMRerank) {
			sw.start('llm_rerank');
			resultItems = await this.reranker.rerank(
				resultItems,
				termRaw,
				query.scopeValue,
				true,
				tenant,
				pprActive,
			);
			sw.stop();
		}

		// Find fuzzy correction for UI
		const fuzzyCorrection = resultItems.find(i => i.fuzzyCorrection)?.fuzzyCorrection;

		sw.print(false);

		return {
			query,
			items: resultItems,
			duration: sw.getTotalElapsed(),
			...(fuzzyCorrection ? { fuzzyCorrection } : {}),
		};
	}

	/**
	 * Perform pure vector similarity search for semantic matching.
	 * Delegates to VectorRetriever and converts results to SearchResultItem format.
	 */
	async vectorSearch(
		query: SearchQuery,
	): Promise<SearchResponse & { duration: number }> {
		const sw = new Stopwatch('VectorSearch');

		const vectorRetriever = this.registry.getRegistered().find(r => r.name === 'vector');
		if (!vectorRetriever) {
			console.warn('[QueryService.vectorSearch] VectorRetriever not registered');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		const plan = parseQuery(query.text);
		if (!vectorRetriever.shouldActivate(plan)) {
			console.warn('[QueryService.vectorSearch] Vector search not available');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		try {
			const results = await vectorRetriever.retrieve(plan);
			const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);
			const items: SearchResultItem[] = results.slice(0, topK).map(r => ({
				id: r.path,
				path: r.path,
				title: r.title ?? r.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? r.path,
				type: (r.type ?? 'unknown') as SearchResultType,
				content: r.content ?? '',
				score: r.score,
				finalScore: r.score,
				lastModified: r.lastModified ?? 0,
				docId: r.docId,
				highlight: null,
			}));
			return { query, items, duration: sw.getTotalElapsed() };
		} catch (error) {
			console.error('[QueryService.vectorSearch] Vector search failed:', error);
			return { query, items: [], duration: sw.getTotalElapsed() };
		}
	}

	/**
	 * Get paths that the user has previously clicked for this query.
	 * Used as a ranking signal to boost previously-selected results.
	 */
	private getClickedPaths(plan: ReturnType<typeof parseQuery>): Set<string> {
		try {
			const store = sqliteStoreManager.getSearchStore();
			if (!store) return new Set();
			// SqliteDatabase is structurally compatible with better-sqlite3 Database
			const clickRepo = new SearchClickRepo(store as any);
			const queryStems = SearchClickRepo.buildQueryStems(plan.terms.map(t => t.text));
			return clickRepo.getClickedPaths(queryStems);
		} catch {
			return new Set();
		}
	}

	/**
	 * Apply Personalized PageRank to rerank and expand search results.
	 *
	 * 1. Select top-K items with docId as PPR seeds (weights from RRF scores).
	 * 2. Run Forward Push PPR over the multi-layer graph.
	 * 3. Fuse original CM ranks with PPR ranks via weighted RRF.
	 * 4. Expand with PPR-discovered docs not in the original result set.
	 */
	private async applyPPR(
		items: Array<{ path: string; score: number; docId?: string }>,
		tenant: IndexTenant,
	): Promise<Array<{ path: string; score: number; docId?: string }>> {
		// 1. Select seeds: top PPR_SEED_K items that have a docId.
		const seedCandidates = items.filter((i) => i.docId);
		const seeds = seedCandidates.slice(0, PPR_SEED_K);
		if (seeds.length === 0) return items;

		// Normalize seed weights from RRF scores.
		const totalSeedScore = seeds.reduce((s, i) => s + i.score, 0);
		const pprSeeds = totalSeedScore > 0
			? seeds.map((i) => ({ nodeId: i.docId!, weight: i.score / totalSeedScore }))
			: seeds.map((i) => ({ nodeId: i.docId!, weight: 1 / seeds.length }));

		// 2. Compute PPR.
		const getOutEdges = createPPREdgeFetcher(tenant);
		const pprResult = await computePPR(pprSeeds, getOutEdges, {});

		if (pprResult.scores.size === 0) return items;

		// 3. Build PPR rank map (sorted by PPR score descending).
		const pprEntries = [...pprResult.scores.entries()].sort((a, b) => b[1] - a[1]);
		const pprRankByNodeId = new Map<string, number>();
		for (let i = 0; i < pprEntries.length; i++) {
			pprRankByNodeId.set(pprEntries[i]![0], i + 1);
		}

		// 4. RRF fusion for existing items.
		const existingDocIds = new Set<string>();
		const existingPaths = new Set<string>();
		const fused: Array<{ path: string; score: number; docId?: string }> = [];

		for (let cmRank = 0; cmRank < items.length; cmRank++) {
			const item = items[cmRank]!;
			if (item.docId) existingDocIds.add(item.docId);
			existingPaths.add(item.path);

			const cmRrf = PPR_CM_RRF_WEIGHT / (RRF_K + cmRank + 1);
			const pprRank = item.docId ? pprRankByNodeId.get(item.docId) : undefined;
			const pprRrf = pprRank !== undefined ? PPR_RRF_WEIGHT / (RRF_K + pprRank) : 0;

			fused.push({ ...item, score: cmRrf + pprRrf });
		}

		// 5. Expansion: PPR-discovered docs not in original results.
		// Collect candidates, batch-fetch paths via Promise.all (max 20 lookups).
		const candidateNodeIds: string[] = [];
		for (const [nodeId] of pprEntries) {
			if (candidateNodeIds.length >= PPR_MAX_EXPANSION_RESULTS) break;
			if (!existingDocIds.has(nodeId)) candidateNodeIds.push(nodeId);
		}

		if (candidateNodeIds.length > 0) {
			const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
			const nodes = await Promise.all(
				candidateNodeIds.map((id) => mobiusNodeRepo.getByNodeId(id)),
			);
			let expansionCount = 0;

			for (const node of nodes) {
				if (expansionCount >= PPR_MAX_EXPANSION_RESULTS) break;
				if (!node?.path || existingPaths.has(node.path)) continue;

				const pprRank = pprRankByNodeId.get(node.node_id)!;
				const pprRrf = PPR_RRF_WEIGHT / (RRF_K + pprRank);

				fused.push({ path: node.path, score: pprRrf, docId: node.node_id });
				existingPaths.add(node.path);
				expansionCount++;
			}
		}

		// 6. Sort by fused score descending.
		fused.sort((a, b) => b.score - a.score);
		return fused;
	}

}

