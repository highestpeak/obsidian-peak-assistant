import type { SearchQuery, SearchResponse, SearchResultItem, SearchResultType, SearchScopeMode, SearchScopeValue } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { normalizeTextForFts } from '../support/segmenter';
import { buildHighlightSnippet } from './highlight-builder';
import { Reranker } from './reranker';
import { DEFAULT_SEARCH_MODE, DEFAULT_SEARCH_TOP_K } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import { embedText } from '@/core/embeddings/embedClient';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import {
	RRF_K,
	RRF_CONTENT_WEIGHT,
	RRF_CONTENT_VS_META_WEIGHT,
	SEARCH_SCORING_DIVERSITY_BOOST_CONTENT,
	SEARCH_SCORING_DENSITY_BOOST_CONTENT,
	SEARCH_SCORING_MAX_OCCURRENCES_CONTENT,
	SEARCH_SCORING_DIVERSITY_BOOST_META,
	SEARCH_SCORING_DENSITY_BOOST_META,
	SEARCH_SCORING_MAX_OCCURRENCES_META,
	PPR_SEED_K,
	PPR_RRF_WEIGHT,
	PPR_CM_RRF_WEIGHT,
	PPR_MAX_EXPANSION_RESULTS,
} from '@/core/constant';
import { Stopwatch } from '@/core/utils/Stopwatch';
import type { ChunkType } from '@/service/search/index/chunkTypes';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import { computePPR } from './personalizedPageRank';
import { createPPREdgeFetcher } from './pprEdgeFetcher';

export class QueryService {
	private readonly reranker: Reranker;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {
		this.reranker = new Reranker(aiServiceManager, searchSettings);
	}

	/** Resolve display title: yaml title > filename without extension > path */
	private resolveTitle(metaTitle: string | null | undefined, path: string): string {
		if (metaTitle) return metaTitle;
		if (path) {
			const parts = path.split('/');
			const filename = parts[parts.length - 1] || path;
			return filename.replace(/\.[^/.]+$/, '') || path;
		}
		return path;
	}

	async textSearch(query: SearchQuery, enableLLMRerank: boolean = false): Promise<SearchResponse & { duration: number }> {
		const sw = new Stopwatch('SearchQuery');

		const termRaw = query?.text ?? '';
		const scopeMode = query?.scopeMode ?? DEFAULT_SEARCH_MODE;
		const scopeValue = query?.scopeValue ?? {};

		const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();
		const registry = ProfileRegistry.getInstance();
		const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
		const hasEmbedding = !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);
		let embedding: number[] | undefined;

		if (hasEmbedding && vectorSearchAvailable) {
			sw.start('embedding_generation');
			try {
				embedding = await embedText(termRaw);
			} catch (error) {
				console.error(`[QueryService] Failed to generate embedding for search:`, error);
			}
			sw.stop();
		}

		sw.start('parallel_search_execution');
		const timeAsyncOperation = async <T>(
			operation: () => Promise<T>,
		): Promise<{ result: T; duration: number }> => {
			const startTime = Date.now();
			const result = await operation();
			const duration = Date.now() - startTime;
			return { result, duration };
		};
		const [textResult, vecResult, metaResult] = await Promise.all([
			timeAsyncOperation(() => this.executeFulltextSearch({ query, scopeMode, scopeValue })),
			embedding && vectorSearchAvailable
				? timeAsyncOperation(() => this.executeVectorSearch({ query, mode: scopeMode, scope: scopeValue, embedding }))
				: Promise.resolve({ result: [] as SearchResultItem[], duration: 0 }),
			timeAsyncOperation(() => this.executeMetaSearch({ query, scopeMode, scopeValue })),
		]);
		const textItems = textResult.result;
		const vecItems = vecResult.result;
		const metaItems = metaResult.result;
		sw.addSegmentDetail('fulltext_search', textResult.duration);
		sw.addSegmentDetail('vector_search', vecResult.duration);
		sw.addSegmentDetail('meta_search', metaResult.duration);
		sw.stop();

		sw.start('merge_operations');
		const contentHits = this.mergeContentSources(
			textItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			vecItems.map((i) => ({ ...i, score: i.score ?? 0 })),
		);

		const resultItems = this.mergeContentAndMetaWithRRF(
			contentHits,
			metaItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			Number(query?.topK ?? DEFAULT_SEARCH_TOP_K),
		);
		sw.stop();

		const tenant = query?.indexTenant ?? 'vault';
		let pprEnriched = resultItems;
		const enablePPR = query.enablePPR !== false;
		if (enablePPR && resultItems.length > 0) {
			sw.start('ppr_computation');
			try {
				pprEnriched = await this.applyPPR(resultItems, tenant);
			} catch (error) {
				console.error('[QueryService] PPR failed, using original results:', error);
			}
			sw.stop();
		}

		// Apply ranking boosts and optional LLM rerank
		sw.start('reranking');
		const pprActive = enablePPR && pprEnriched !== resultItems;
		const ranked = await this.reranker.rerank(pprEnriched, termRaw, scopeValue, enableLLMRerank, tenant, pprActive);
		sw.stop();

		// Log timing information
		sw.print(false);

		const totalDuration = sw.getTotalElapsed();
		return { query, items: ranked, duration: totalDuration };
	}

	async vectorSearch(
		query: SearchQuery,
	): Promise<SearchResponse & { duration: number }> {
		const { text: queryText, topK, scopeMode, scopeValue } = query;
		const sw = new Stopwatch('SearchQuery');
		// Check if vector search is available
		const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();
		if (!vectorSearchAvailable) {
			console.warn('[QueryService.vectorSearch] Vector search not available');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		// Generate embedding for the query text
		const registry = ProfileRegistry.getInstance();
		const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
		const hasEmbedding = !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);
		if (!hasEmbedding) {
			console.warn('[QueryService.vectorSearch] No embedding profile configured');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		let embedding: number[] | undefined;
		try {
			embedding = await embedText(queryText);
		} catch (error) {
			console.error(`[QueryService.vectorSearch] Failed to generate embedding:`, error);
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		if (!embedding) {
			console.warn('[QueryService.vectorSearch] No embedding generated');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		// Perform vector search
		const searchQuery: SearchQuery = {
			text: queryText,
			scopeMode,
			scopeValue,
			topK,
			searchMode: 'vector',
			indexTenant: query.indexTenant,
		};

		try {
			const vectorResults = await this.executeVectorSearch({
				query: searchQuery,
				mode: scopeMode,
				scope: scopeValue,
				embedding
			});

			// Return results in the standard SearchResponse format
			return { query, items: vectorResults, duration: sw.getTotalElapsed() };
		} catch (error) {
			console.error(`[QueryService.vectorSearch] Vector search failed:`, error);
			return { query, items: [], duration: sw.getTotalElapsed() };
		}
	}

	private extractKeywords(queryText: string): string[] {
		if (!queryText.trim()) return [];
		// Split by whitespace and normalize each keyword
		return queryText
			.split(/\s+/)
			.filter(k => k.length > 0)
			.map(k => normalizeTextForFts(k));
	}

	private buildFtsQuery(keywords: string[]): string {
		if (keywords.length === 0) return '';
		if (keywords.length === 1) return keywords[0];

		// Use OR to match any keyword, allowing us to count matches per result
		// Escape special FTS characters if needed (quotes, etc.)
		const escapedKeywords = keywords.map(k => {
			// FTS5 special chars: " AND OR NOT
			// Wrap in quotes if contains spaces or special chars
			if (k.includes(' ') || /["ANDORNOT]/i.test(k)) {
				return `"${k.replace(/"/g, '""')}"`;
			}
			return k;
		});

		return escapedKeywords.join(' OR ');
	}

	private countKeywordMatches(content: string, keywords: string[]): number {
		if (!content || keywords.length === 0) return 0;

		const normalizedContent = normalizeTextForFts(content).toLowerCase();
		let matchCount = 0;

		for (const keyword of keywords) {
			const normalizedKeyword = keyword.toLowerCase();
			if (normalizedContent.includes(normalizedKeyword)) {
				matchCount++;
			}
		}

		return matchCount;
	}

	private countTotalKeywordOccurrences(content: string, keywords: string[]): number {
		if (!content || keywords.length === 0) return 0;

		const normalizedContent = normalizeTextForFts(content).toLowerCase();
		let totalOccurrences = 0;

		for (const keyword of keywords) {
			const normalizedKeyword = keyword.toLowerCase();
			let count = 0;
			let index = 0;
			while ((index = normalizedContent.indexOf(normalizedKeyword, index)) !== -1) {
				count++;
				index += normalizedKeyword.length;
			}
			totalOccurrences += count;
		}

		return totalOccurrences;
	}

	private async executeFulltextSearch(params: {
		query: SearchQuery;
		scopeMode: SearchScopeMode;
		scopeValue?: SearchScopeValue;
	}): Promise<SearchResultItem[]> {
		const { query, scopeMode: mode, scopeValue: scope } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);

		if (!termRaw.trim()) {
			return [];
		}

		// Extract keywords from query
		const keywords = this.extractKeywords(termRaw);
		if (keywords.length === 0) {
			return [];
		}

		// Build FTS query: use OR to match any keyword
		const ftsQuery = this.buildFtsQuery(keywords);
		
		// Safety check: ensure FTS query is not empty
		if (!ftsQuery || !ftsQuery.trim()) {
			return [];
		}

		// Increase limit to allow for re-ranking by keyword match count
		// We'll take topK after scoring
		const searchLimit = Math.min(topK * 3, 100); // Search more, then filter

		const tenant = query?.indexTenant ?? 'vault';
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

		// Execute search with OR query to match any keyword (exclude folders applied in SQL)
		const fulltextRows = docChunkRepo.searchFts(ftsQuery, searchLimit, mode, scope, query.excludeFolderPrefixes);
		if (!fulltextRows.length) {
			return [];
		}

		// Fetch indexed document rows separately (avoid JOIN)
		const docIds = Array.from(new Set(fulltextRows.map((r) => r.docId)));
		const metaRows = await indexedDocumentRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const chunkIds = [...new Set(fulltextRows.map((r) => r.chunkId))];
		const chunkRows = chunkIds.length ? await docChunkRepo.getByChunkIds(chunkIds) : [];
		const chunkTypeById = new Map(chunkRows.map((c) => [c.chunk_id, c.chunk_type as ChunkType]));

		// Score results by keyword match count and BM25
		const items: SearchResultItem[] = fulltextRows.map((r) => {
			const meta = metaById.get(r.docId);
			const content = r.content ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);
			const keywordMatchCount = this.countKeywordMatches(content, keywords);
			const totalOccurrences = this.countTotalKeywordOccurrences(content, keywords);
			const title = this.resolveTitle(meta?.title, r.path);

			const bm25Score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));
			const diversityRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
			const diversityBoost = 1 + (diversityRatio * SEARCH_SCORING_DIVERSITY_BOOST_CONTENT);
			const maxReasonableOccurrences = keywords.length * SEARCH_SCORING_MAX_OCCURRENCES_CONTENT;
			const densityRatio = Math.min(totalOccurrences / maxReasonableOccurrences, 1);
			const densityBoost = 1 + (densityRatio * SEARCH_SCORING_DENSITY_BOOST_CONTENT);

			const score = bm25Score * diversityBoost * densityBoost;

			return {
				id: r.path,
				type: (meta?.type ?? 'unknown') as SearchResultType,
				title,
				path: r.path,
				lastModified: Number(meta?.mtime ?? 0),
				content,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score,
				finalScore: score,
				docId: r.docId,
				chunkId: r.chunkId,
				chunkType: chunkTypeById.get(r.chunkId) ?? 'body_raw',
			};
		});

		// Sort by score descending and take topK
		return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, topK);
	}

	private async executeVectorSearch(params: {
		query: SearchQuery;
		mode: SearchScopeMode;
		scope?: SearchScopeValue;
		embedding: number[];
	}): Promise<SearchResultItem[]> {
		const { query, mode, scope, embedding } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);

		const tenant = query?.indexTenant ?? 'vault';
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

		// Use searchSimilarAndGetId for combined vector search and embedding/doc mapping (exclude folders in SQL)
		const vectorResults = await embeddingRepo.searchSimilarAndGetId(embedding, topK, mode, scope, query.excludeFolderPrefixes);
		if (!vectorResults.length) {
			return [];
		}
		const scoreByKey = new Map<string, number>();
		for (const result of vectorResults) {
			const key = result.chunk_id ?? result.id;
			scoreByKey.set(key, result.similarity);
		}

		const chunkIds = vectorResults.filter((r) => r.chunk_id).map((r) => r.chunk_id as string);
		const docOnlyEmb = vectorResults.filter((r) => !r.chunk_id);

		const chunkRows = chunkIds.length ? await docChunkRepo.getByChunkIds(chunkIds) : [];

		const docIds = new Set<string>();
		for (const r of chunkRows) docIds.add(r.doc_id);
		for (const r of docOnlyEmb) docIds.add(r.doc_id);

		const metaRows = await indexedDocumentRepo.getByIds(Array.from(docIds));
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const items: SearchResultItem[] = [];

		for (const r of chunkRows) {
			const meta = metaById.get(r.doc_id);
			const path = meta?.path ?? r.doc_id;
			const content = r.content_raw ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);
			const score = Number(scoreByKey.get(String(r.chunk_id)) ?? 0);
			items.push({
				id: path, type: (meta?.type ?? 'unknown') as SearchResultType,
				title: this.resolveTitle(meta?.title, path), path,
				lastModified: Number(meta?.mtime ?? r.mtime ?? 0), content,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score, finalScore: score, docId: r.doc_id, chunkId: r.chunk_id,
				chunkType: (r.chunk_type as ChunkType) ?? 'body_raw',
			});
		}

		for (const r of docOnlyEmb) {
			const meta = metaById.get(r.doc_id);
			const path = meta?.path ?? r.doc_id;
			const summaryText = [meta?.summary, meta?.full_summary].filter(Boolean).join('\n\n') || '';
			const snippet = buildHighlightSnippet(summaryText, termRaw);
			const score = Number(scoreByKey.get(r.id) ?? 0);
			items.push({
				id: path, type: (meta?.type ?? 'unknown') as SearchResultType,
				title: this.resolveTitle(meta?.title, path), path,
				lastModified: Number(meta?.mtime ?? 0), content: summaryText,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score, finalScore: score, docId: r.doc_id,
				chunkType: (r.chunk_type as ChunkType | null) ?? undefined,
			});
		}

		return items;
	}

	private async executeMetaSearch(params: {
		query: SearchQuery;
		scopeMode: SearchScopeMode;
		scopeValue?: SearchScopeValue;
	}): Promise<SearchResultItem[]> {
		const { query, scopeMode: mode, scopeValue: scope } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);

		if (!termRaw.trim()) {
			return [];
		}

		// Extract keywords from query
		const keywords = this.extractKeywords(termRaw);
		if (keywords.length === 0) {
			return [];
		}

		// Build FTS query: use OR to match any keyword
		const ftsQuery = this.buildFtsQuery(keywords);
		
		// Safety check: ensure FTS query is not empty
		if (!ftsQuery || !ftsQuery.trim()) {
			return [];
		}

		// Increase limit to allow for re-ranking by keyword match count
		const searchLimit = Math.min(topK * 3, 100);

		const tenant = query?.indexTenant ?? 'vault';
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

		// Execute meta search with OR query to match any keyword (exclude folders applied in SQL)
		const metaRows = docChunkRepo.searchMetaFts(ftsQuery, searchLimit, mode, scope, query.excludeFolderPrefixes);
		if (!metaRows.length) {
			return [];
		}

		// Fetch indexed document rows separately (avoid JOIN)
		const docIds = Array.from(new Set(metaRows.map((r) => r.docId)));
		const metaRows_ = await indexedDocumentRepo.getByIds(docIds);
		const metaById = new Map(metaRows_.map((m) => [m.id, m]));

		const items: SearchResultItem[] = metaRows.map((r) => {
			const meta = metaById.get(r.docId);
			const title = this.resolveTitle(meta?.title ?? r.title, r.path);
			const combinedText = `${title} ${r.path ?? ''}`;
			const keywordMatchCount = this.countKeywordMatches(combinedText, keywords);
			const totalOccurrences = this.countTotalKeywordOccurrences(combinedText, keywords);
			const content = `${title} ${r.path}`;
			const snippet = buildHighlightSnippet(content, termRaw);

			const bm25Score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));
			const diversityRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
			const diversityBoost = 1 + (diversityRatio * SEARCH_SCORING_DIVERSITY_BOOST_META);
			const maxReasonableOccurrences = keywords.length * SEARCH_SCORING_MAX_OCCURRENCES_META;
			const densityRatio = Math.min(totalOccurrences / maxReasonableOccurrences, 1);
			const densityBoost = 1 + (densityRatio * SEARCH_SCORING_DENSITY_BOOST_META);
			const score = bm25Score * diversityBoost * densityBoost;

			return {
				id: r.path, type: (meta?.type ?? 'unknown') as SearchResultType, title, path: r.path,
				lastModified: Number(meta?.mtime ?? 0), content,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score, finalScore: score,
			};
		});

		// Sort by score descending and take topK
		return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, topK);
	}

	private mergeContentSources<T extends { path: string; chunkType?: ChunkType }>(
		textHits: Array<T & { score: number }>,
		vectorHits: Array<T & { score: number }>,
	): Array<T & { score: number }> {
		type Acc = { rrf: number; variants: Array<{ hit: T & { score: number }; sourceScore: number }> };
		const byPath = new Map<string, Acc>();

		for (let rank = 1; rank <= textHits.length; rank++) {
			const hit = textHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_CONTENT_WEIGHT / (RRF_K + rank);
			let acc = byPath.get(id);
			if (!acc) {
				acc = { rrf: 0, variants: [] };
				byPath.set(id, acc);
			}
			acc.rrf += rrf;
			acc.variants.push({ hit, sourceScore: hit.score ?? 0 });
		}

		for (let rank = 1; rank <= vectorHits.length; rank++) {
			const hit = vectorHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_CONTENT_WEIGHT / (RRF_K + rank);
			let acc = byPath.get(id);
			if (!acc) {
				acc = { rrf: 0, variants: [] };
				byPath.set(id, acc);
			}
			acc.rrf += rrf;
			const anyHit = hit as T & { score: number; finalScore?: number };
			acc.variants.push({
				hit,
				sourceScore: Number(anyHit.finalScore ?? anyHit.score ?? 0),
			});
		}

		const merged: Array<T & { score: number }> = [];
		for (const [, acc] of byPath) {
			let best = acc.variants[0]!;
			let bestPick = best.sourceScore;
			for (let i = 1; i < acc.variants.length; i++) {
				const v = acc.variants[i]!;
				const pick = v.sourceScore;
				if (pick > bestPick) {
					bestPick = pick;
					best = v;
				}
			}
			merged.push({ ...best.hit, score: acc.rrf });
		}

		return merged.sort((a, b) => b.score - a.score);
	}

	private mergeContentAndMetaWithRRF<T extends { path: string }>(
		contentHits: Array<T & { score: number }>,
		metaHits: Array<T & { score: number }>,
		limit: number,
	): Array<T & { score: number }> {
		const finalScores = new Map<string, { score: number; hit: T & { score: number } }>();

		// Stage 1: Add content hits with their pre-calculated content scores
		for (let rank = 1; rank <= contentHits.length; rank++) {
			const hit = contentHits[rank - 1]!;
			const id = hit.path;
			// Content hits already have their RRF scores from mergeContentSources
			// Now apply equal weighting between content and meta in final ranking
			const rrf = RRF_CONTENT_VS_META_WEIGHT / (RRF_K + rank);
			finalScores.set(id, { score: rrf, hit });
		}

		// Stage 2: Add meta hits with equal weight to content hits
		for (let rank = 1; rank <= metaHits.length; rank++) {
			const hit = metaHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_CONTENT_VS_META_WEIGHT / (RRF_K + rank);
			const existing = finalScores.get(id);
			if (existing) {
				// If item appears in both content and meta, combine scores
				existing.score += rrf;
			} else {
				finalScores.set(id, { score: rrf, hit });
			}
		}

		return Array.from(finalScores.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((x) => ({ ...x.hit, score: x.score }));
	}

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

