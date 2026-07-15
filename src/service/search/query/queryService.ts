import type { SearchQuery, SearchResponse, SearchResultItem, SearchResultType } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { Reranker } from './reranker';
import type { RankingBoostBreakdown } from './rankingBoosts';
import { DEFAULT_SEARCH_TOP_K } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/core/config/settingsTypes';
import {
	RRF_K,
	PPR_SEED_K,
	PPR_RRF_WEIGHT,
	PPR_CM_RRF_WEIGHT,
	PPR_MAX_EXPANSION_RESULTS,
	PPR_QUERY_NODE_SEED_K,
	PPR_QUERY_NODE_WEIGHT_FRACTION,
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
import { assignDisplayScorePercent } from './scoreNormalize';
import {
	HighlightSourceResolver,
	MemoryVaultTextCache,
	type VaultTextReader,
	type VaultTextCache,
} from './highlight-source-resolver';
import { SearchClickRepo } from '@/core/storage/sqlite/repositories/SearchClickRepo';
import type { DebugRunHandle } from '@/core/debug-trace';
import {
	recordRetrievalRecall,
	recordRrfMerge,
	recordRankingBoosts,
	recordLlmRerank,
	recordExcludeFilter,
	recordTopKCutoff,
	recordPprRerank,
	recordAlreadyLinkedDecisions,
	recordRetrieverFilterSettings,
	finalizeSearchSummary,
	type BoostSignalContext,
} from '@/service/search/debugTraceAdapter';

export class QueryService {
	private readonly reranker: Reranker;
	private readonly registry: RetrieverRegistry;
	private readonly highlightEngine = new HighlightEngine();
	private readonly vaultTextCache: VaultTextCache = new MemoryVaultTextCache();

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
	async textSearch(
		query: SearchQuery,
		enableLLMRerank: boolean = false,
		debugRun?: DebugRunHandle,
	): Promise<SearchResponse & { duration: number }> {
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

		if (debugRun) {
			// Type filter is a settings-driven gate applied inside each retriever;
			// the debug receipt captures the configured allow-list so a reader
			// can see whether markdown-only / PDF-included etc. was in effect.
			const includedTypes = this.searchSettings.includeDocumentTypes
				? Object.entries(this.searchSettings.includeDocumentTypes)
					.filter(([, on]) => on)
					.map(([t]) => t)
				: [];
			recordRetrieverFilterSettings(debugRun, {
				includedDocumentTypes: includedTypes,
			});
			for (const [name, results] of retrieverResults) {
				recordRetrievalRecall(debugRun, name, results);
			}
		}

		// Merge with adaptive RRF
		sw.start('rrf_merge');
		const merged = rrfMerge(retrieverResults, plan.retrievers);
		sw.stop();

		if (debugRun) {
			recordRrfMerge(
				debugRun,
				plan.retrievers as unknown as Record<string, number>,
				retrieverResults,
				merged,
			);
		}

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
			chunkId: m.best.chunkId,
			highlight: null,
			contentRaw: m.best.contentRaw,
			matchType: m.best.matchType,
			fuzzyCorrection: m.best.fuzzyCorrection,
		}));

		// Apply folder: filter uniformly across all retriever hits before PPR
		// so graph reranking / boosts / highlighting only run on in-scope docs.
		const folderScopes = plan.filters
			.filter(f => f.field === 'folder')
			.map(f => f.value);
		if (folderScopes.length > 0) {
			resultItems = this.reranker.applyFolderFilter(resultItems, folderScopes);
		}

		// PPR graph-based reranking
		const tenant = query?.indexTenant ?? 'vault';
		// Settings flag takes priority; query-level flag can still force-disable.
		const enablePPR = this.searchSettings.enablePPR !== false && query.enablePPR !== false;
		let pprActive = false;
		if (enablePPR && resultItems.length > 0) {
			// Collect docIds from FTS retrievers for query-node seeding in PPR.
			const ftsDocIds: string[] = (() => {
				const ftsResult = retrieverResults.get('fts');
				if (!ftsResult) return [];
				return ftsResult
					.slice(0, PPR_QUERY_NODE_SEED_K)
					.map(r => r.docId)
					.filter((id): id is string => typeof id === 'string');
			})();

			sw.start('ppr_computation');
			const itemsBeforePpr = resultItems;
			try {
				const pprEnriched = await this.applyPPR(resultItems, tenant, ftsDocIds);
				pprActive = pprEnriched !== resultItems;
				resultItems = pprEnriched as SearchResultItem[];
			} catch (error) {
				console.error('[QueryService] PPR failed, using original results:', error);
			}
			sw.stop();
			if (debugRun && pprActive) {
				recordPprRerank(debugRun, {
					seedDocIds: ftsDocIds,
					before: itemsBeforePpr,
					after: resultItems,
				});
			}
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
		const itemsBeforeBoost = resultItems;
		// Only allocate the breakdown capture when debug is on — production
		// pays zero. See `Reranker.applyRankingBoosts` `breakdownOut` param.
		const breakdownByPath = debugRun ? new Map<string, RankingBoostBreakdown>() : undefined;
		resultItems = this.reranker.applyRankingBoosts({
			items: resultItems,
			signals,
			relatedPaths,
			pprActive,
			clickedPaths,
			queryTerms: plan.terms.map((t) => t.text),
			queryPhrases: plan.phrases,
			breakdownOut: breakdownByPath,
		});
		sw.stop();

		if (debugRun) {
			// Per-path signal snapshot for preview items so the receipt shows
			// which heuristics could have fired for each doc.
			const signalsByPath = new Map<string, BoostSignalContext>();
			for (const item of resultItems.slice(0, 20)) {
				const sig = signals.get(item.path);
				signalsByPath.set(item.path, {
					...(sig ? {
						openCount: sig.openCount,
						lastOpenTs: sig.lastOpenTs,
					} : {}),
					clicked: clickedPaths.has(item.path),
					relatedToCurrent: relatedPaths.has(item.path),
				});
			}
			recordRankingBoosts(debugRun, {
				items: itemsBeforeBoost,
				afterItems: resultItems,
				pprActive,
				clickedPathCount: clickedPaths.size,
				relatedPathCount: relatedPaths.size,
				signalsByPath,
				breakdownByPath,
			});
			// Already-linked emerges as its own decision so a reader sees
			// exactly which items were promoted because they already link
			// to the current file.
			recordAlreadyLinkedDecisions(debugRun, resultItems, relatedPaths);
		}

		// Post-ranking exclude filter
		if (plan.excludes.length > 0) {
			const before = resultItems;
			resultItems = this.reranker.applyExcludeFilter(resultItems, plan.excludes);
			if (debugRun) {
				recordExcludeFilter(debugRun, before, resultItems, plan.excludes);
			}
		}

		// Trim to topK
		const itemsBeforeTopK = resultItems;
		resultItems = resultItems.slice(0, topK);
		if (debugRun) {
			recordTopKCutoff(debugRun, itemsBeforeTopK, resultItems, topK);
		}

		// Highlight on final results only. Raw source resolution runs once per
		// query, batched over topK: markdown-like types read the current Vault
		// file (authoritative, no stale `content_raw`); binary/derived types
		// fall back to indexed `content_raw` since their extracted text has
		// no re-parseable source.
		sw.start('highlighting');
		const sourceResolver = new HighlightSourceResolver(
			sqliteStoreManager.getDocChunkRepo(tenant),
			this.buildVaultReader(),
			this.vaultTextCache,
		);
		const sourceByItemId = await sourceResolver.resolveMany(resultItems);
		for (const item of resultItems) {
			const source = sourceByItemId.get(item.id);
			const raw = source?.text ?? item.contentRaw ?? item.content ?? '';
			const norm = item.content ?? '';
			item.highlight = this.highlightEngine.highlightSnippet(
				raw,
				norm,
				plan,
				undefined,
				undefined,
				source?.hintOffset,
			);
			item.titleHighlight = this.highlightEngine.highlight(item.title ?? '', plan);
			if (source) {
				item.highlightSourceKind = source.kind;
				if (source.hintOffset !== undefined) item.highlightHintOffset = source.hintOffset;
				if (source.vaultReadMs !== undefined) item.highlightVaultReadMs = source.vaultReadMs;
			}
		}
		sw.stop();

		// Optional LLM rerank
		if (enableLLMRerank) {
			sw.start('llm_rerank');
			const beforeRerank = resultItems;
			resultItems = await this.reranker.rerank(
				resultItems,
				termRaw,
				query.scopeValue,
				true,
				tenant,
				pprActive,
			);
			sw.stop();
			if (debugRun) {
				const info = this.reranker.getRerankModelInfo();
				recordLlmRerank(debugRun, {
					before: beforeRerank,
					after: resultItems,
					provider: info?.provider,
					model: info?.modelId,
				});
			}
		}

		// Relative-normalize score for UI display. Kept as the last step so
		// LLM rerank (which can reorder but not rewrite scores) is respected.
		assignDisplayScorePercent(resultItems);

		// Find fuzzy correction for UI
		const fuzzyCorrection = resultItems.find(i => i.fuzzyCorrection)?.fuzzyCorrection;

		sw.print(false);

		const totalDuration = sw.getTotalElapsed();
		if (debugRun) {
			finalizeSearchSummary(debugRun, {
				query: termRaw,
				topK,
				finalCount: resultItems.length,
				llmRerank: enableLLMRerank,
				durationMs: totalDuration,
			});
		}

		return {
			query,
			items: resultItems,
			duration: totalDuration,
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
	 * Build a minimal Vault text reader for the resolver. Returns null if no
	 * Obsidian App is reachable — the resolver then skips Vault fallback and
	 * relies on doc_chunk.content_raw, which is the common case in tests.
	 */
	private buildVaultReader(): VaultTextReader | null {
		let app: { vault?: { adapter?: { read?: (p: string) => Promise<string> } } } | null = null;
		try {
			app = (this.aiServiceManager as unknown as { getApp?: () => unknown }).getApp?.() as typeof app ?? null;
		} catch {
			app = null;
		}
		const adapter = app?.vault?.adapter;
		if (!adapter || typeof adapter.read !== 'function') return null;
		return {
			async readText(path: string): Promise<string | null> {
				try {
					return await adapter.read!(path);
				} catch {
					return null;
				}
			},
		};
	}

	private async applyPPR(
		items: Array<{ path: string; score: number; docId?: string }>,
		tenant: IndexTenant,
		queryNodeDocIds: string[] = [],
	): Promise<Array<{ path: string; score: number; docId?: string }>> {
		const seeds = items.filter((i) => i.docId).slice(0, PPR_SEED_K);
		if (seeds.length === 0) return items;

		const totalSeedScore = seeds.reduce((s, i) => s + i.score, 0);
		const pprSeeds = totalSeedScore > 0
			? seeds.map((i) => ({ nodeId: i.docId!, weight: i.score / totalSeedScore }))
			: seeds.map((i) => ({ nodeId: i.docId!, weight: 1 / seeds.length }));

		// Blend query-node seeds into the seed distribution.
		// Query-node seeds get PPR_QUERY_NODE_WEIGHT_FRACTION of total weight;
		// RRF seeds are scaled to (1 - PPR_QUERY_NODE_WEIGHT_FRACTION).
		if (queryNodeDocIds.length > 0 && PPR_QUERY_NODE_WEIGHT_FRACTION > 0) {
			const rrfFraction = 1 - PPR_QUERY_NODE_WEIGHT_FRACTION;
			for (const seed of pprSeeds) seed.weight *= rrfFraction;

			const existingNodeIds = new Set(pprSeeds.map(s => s.nodeId));
			const queryOnlyNodes = queryNodeDocIds
				.filter(id => !existingNodeIds.has(id))
				.slice(0, PPR_QUERY_NODE_SEED_K);

			if (queryOnlyNodes.length > 0) {
				const perQueryNodeWeight = PPR_QUERY_NODE_WEIGHT_FRACTION / queryOnlyNodes.length;
				for (const nodeId of queryOnlyNodes) {
					pprSeeds.push({ nodeId, weight: perQueryNodeWeight });
				}
			}
		}

		const pprResult = await computePPR(pprSeeds, createPPREdgeFetcher(tenant), {});
		if (pprResult.scores.size === 0) return items;

		const pprEntries = [...pprResult.scores.entries()].sort((a, b) => b[1] - a[1]);

		// Build candidateNodeIds early for debug logging.
		const existingDocIdsForLog = new Set(items.filter(i => i.docId).map(i => i.docId!));
		const candidateNodeIdsForLog: string[] = [];
		for (const [nid] of pprEntries) {
			if (candidateNodeIdsForLog.length >= PPR_MAX_EXPANSION_RESULTS) break;
			if (!existingDocIdsForLog.has(nid)) candidateNodeIdsForLog.push(nid);
		}

		console.debug('[PPR]', {
			seeds: pprSeeds.length,
			queryNodeSeeds: queryNodeDocIds.length,
			pushOps: pprResult.pushOps,
			nodesExplored: pprResult.nodesExplored,
			elapsedMs: pprResult.elapsedMs,
			truncated: pprResult.truncated,
			expansion: candidateNodeIdsForLog.length,
		});
		const pprRankByNodeId = new Map<string, number>();
		for (let i = 0; i < pprEntries.length; i++) pprRankByNodeId.set(pprEntries[i]![0], i + 1);

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

		fused.sort((a, b) => b.score - a.score);
		return fused;
	}

}
