import type { SearchQuery, SearchResponse, SearchResultItem, SearchResultType, SearchScopeMode, SearchScopeValue } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { normalizeTextForFts } from '../support/segmenter';
import { buildHighlightSnippet } from './highlight-builder';
import { Reranker } from './reranker';
import { DEFAULT_SEARCH_MODE, DEFAULT_SEARCH_TOP_K } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import { RRF_K, RRF_CONTENT_WEIGHT, RRF_CONTENT_VS_META_WEIGHT } from '@/core/constant';
import { Stopwatch } from '@/core/utils/Stopwatch';

/**
 * Query service for search operations.
 * Handles fulltext, vector, hybrid search, and graph queries.
 */
export class QueryService {
	private readonly reranker: Reranker;

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {
		this.reranker = new Reranker(aiServiceManager, searchSettings);
	}

	/**
	 * Execute tri-hybrid search combining three complementary approaches:
	 * 1. Content search: Fulltext + Vector (semantic content matching)
	 * 2. Meta search: Title/Path (explicit user intent matching)
	 * 3. Two-stage RRF merge: Content sources merged first, then with meta
	 *
	 * Design rationale:
	 * - Content sources are merged first because they represent the same type of relevance (content)
	 * - Meta sources get equal weight to content because title/path matches indicate clear user intent
	 * - This balances semantic understanding with explicit knowledge
	 *
	 * @param query - Search query parameters
	 * @param enableLLMRerank - Whether to enable expensive LLM reranking (default: false)
	 * @returns Search response with results and timing information
	 */
	async textSearch(query: SearchQuery, enableLLMRerank: boolean = false): Promise<SearchResponse & { duration: number }> {
		const sw = new Stopwatch('SearchQuery');

		const termRaw = query?.text ?? '';
		const scopeMode = query?.scopeMode ?? DEFAULT_SEARCH_MODE;
		const scopeValue = query?.scopeValue ?? {};

		// Always perform tri-hybrid search (content + meta)
		// Content includes: fulltext + vector (if embedding available)
		const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();

		// Generate embedding first (if configured and vector search is available)
		const embeddingModel = this.searchSettings.chunking.embeddingModel;
		let embedding: number[] | undefined;

		if (embeddingModel && vectorSearchAvailable) {
			sw.start('embedding_generation');
			try {
				const multiProviderChatService = this.aiServiceManager.getMultiChat();
				const embeddings = await multiProviderChatService.generateEmbeddings(
					[termRaw],
					embeddingModel.modelId,
					embeddingModel.provider,
				);
				embedding = embeddings[0];
			} catch (error) {
				console.error(`[QueryService] Failed to generate embedding for search:`, error);
				// Continue with fulltext search only if embedding generation fails
			}
			sw.stop();
		}

		// Parallel execution: fulltext search, vector search, and meta search
		sw.start('parallel_search_execution');
		const [textItems, vecItems, metaItems] = await Promise.all([
			// Perform fulltext search
			this.executeFulltextSearch({ query, scopeMode, scopeValue }),
			// Perform vector search if embedding is available and vector search is enabled
			embedding && vectorSearchAvailable ? this.executeVectorSearch({
				query,
				mode: scopeMode,
				scope: scopeValue,
				embedding,
			}) : Promise.resolve([]),
			// Perform meta search for titles and paths
			this.executeMetaSearch({ query, scopeMode, scopeValue }),
		]);
		sw.stop();

		// Two-stage merge: content sources first, then with meta
		sw.start('merge_operations');
		// Stage 1: Merge fulltext and vector into unified content hits
		const contentHits = this.mergeContentSources(
			textItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			vecItems.map((i) => ({ ...i, score: i.score ?? 0 })),
		);

		// Stage 2: Merge content hits with meta hits using equal weights
		const resultItems = this.mergeContentAndMetaWithRRF(
			contentHits,
			metaItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			Number(query?.topK ?? DEFAULT_SEARCH_TOP_K),
		);
		sw.stop();

		// Apply ranking boosts and optional LLM rerank
		sw.start('reranking');
		const ranked = await this.reranker.rerank(resultItems, termRaw, scopeValue, enableLLMRerank);
		sw.stop();

		// Log timing information
		sw.print(false);

		const totalDuration = sw.getTotalElapsed();
		return { query, items: ranked, duration: totalDuration };
	}

	/**
	 * Perform pure vector similarity search for semantic matching.
	 * Returns document IDs with their similarity scores for RRF fusion.
	 *
	 * @param queryText - The text to search for semantically
	 * @param topK - Maximum number of results to return
	 * @param scopeMode - Search scope mode (default: 'vault')
	 * @param scopeValue - Optional search scope configuration
	 * @returns Array of documents with their similarity scores
	 */
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
		const embeddingModel = this.searchSettings.chunking.embeddingModel;
		if (!embeddingModel) {
			console.warn('[QueryService.vectorSearch] No embedding model configured');
			return { query, items: [], duration: sw.getTotalElapsed() };
		}

		let embedding: number[] | undefined;
		try {
			const multiProviderChatService = this.aiServiceManager.getMultiChat();
			const embeddings = await multiProviderChatService.generateEmbeddings(
				[queryText],
				embeddingModel.modelId,
				embeddingModel.provider,
			);
			embedding = embeddings[0];
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
			searchMode: 'vector'
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

	/**
	 * Extract keywords from query text for multi-keyword matching.
	 * Splits by whitespace and normalizes each keyword.
	 */
	private extractKeywords(queryText: string): string[] {
		if (!queryText.trim()) return [];
		// Split by whitespace and normalize each keyword
		return queryText
			.split(/\s+/)
			.filter(k => k.length > 0)
			.map(k => normalizeTextForFts(k));
	}

	/**
	 * Build FTS query for multi-keyword matching.
	 * Uses OR syntax to match any keyword, allowing weighted scoring by hit count.
	 */
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

	/**
	 * Count how many keywords are matched in the content.
	 * Used for weighted scoring: more keyword matches = higher score.
	 */
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

	/**
	 * Execute fulltext search using FTS5 with multi-keyword support.
	 * Results are weighted by the number of matched keywords.
	 */
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

		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

		// Execute search with OR query to match any keyword
		const fulltextRows = docChunkRepo.searchFts(ftsQuery, searchLimit, mode, scope);
		if (!fulltextRows.length) {
			return [];
		}

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(fulltextRows.map((r) => r.docId)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		// Score results by keyword match count and BM25
		const items: SearchResultItem[] = fulltextRows.map((r) => {
			const meta = metaById.get(r.docId);
			const content = r.content ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);

			// Count keyword matches in content
			const keywordMatchCount = this.countKeywordMatches(content, keywords);

			// Title logic: use yaml title from meta, fallback to filename without extension
			let title = meta?.title ?? null;
			if (!title && r.path) {
				const pathParts = r.path.split('/');
				const filename = pathParts[pathParts.length - 1] || r.path;
				title = filename.replace(/\.[^/.]+$/, ''); // Remove extension
			}
			title = title || r.path; // Final fallback to path

			// Base score from BM25 (smaller is better, convert to larger-is-better)
			const bm25Score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));

			// Weighted score: boost by keyword match count
			// More keywords matched = higher score
			// Formula: baseScore * (1 + matchRatio * boostFactor)
			const matchRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
			const keywordBoost = 1 + (matchRatio * 0.5); // Up to 50% boost for matching all keywords
			const score = bm25Score * keywordBoost;

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
			};
		});

		// Sort by score descending and take topK
		return items
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
			.slice(0, topK);
	}

	/**
	 * Execute vector search using sqlite-vec KNN search.
	 */
	private async executeVectorSearch(params: {
		query: SearchQuery;
		mode: SearchScopeMode;
		scope?: SearchScopeValue;
		embedding: number[];
	}): Promise<SearchResultItem[]> {
		const { query, mode, scope, embedding } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);

		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

		// Use searchSimilarAndGetId for combined vector search and embedding/doc mapping
		const vectorResults = await embeddingRepo.searchSimilarAndGetId(embedding, topK, mode, scope);
		if (!vectorResults.length) {
			return [];
		}
		const scoreByChunk = new Map<string, number>();
		for (const result of vectorResults) {
			if (result.chunk_id) {
				scoreByChunk.set(result.chunk_id, result.similarity);
			}
		}

		// Get chunk IDs and fetch chunk data
		const vecChunkIds = Array.from(scoreByChunk.keys());
		const chunkRows = await docChunkRepo.getByChunkIds(vecChunkIds);

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(chunkRows.map((r) => r.doc_id)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const items: SearchResultItem[] = chunkRows.map((r) => {
			const meta = metaById.get(r.doc_id);
			const path = meta?.path ?? r.doc_id;
			// For vector search, we need to get content from doc_fts or use content_raw
			// Since we're using content_raw from getByChunkIds, keep it for now
			const content = r.content_raw ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);
			const score = Number(scoreByChunk.get(String(r.chunk_id)) ?? 0);

			// Title logic: use yaml title from meta, fallback to filename without extension
			let title = meta?.title ?? null;
			if (!title && path) {
				const pathParts = path.split('/');
				const filename = pathParts[pathParts.length - 1] || path;
				title = filename.replace(/\.[^/.]+$/, ''); // Remove extension
			}
			title = title || path; // Final fallback to path

			return {
				id: path,
				type: (meta?.type ?? 'unknown') as SearchResultType,
				title,
				path,
				lastModified: Number(meta?.mtime ?? r.mtime ?? 0),
				content,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score,
				finalScore: score,
			};
		});

		return items;
	}

	/**
	 * Execute meta search using FTS5 for titles and paths.
	 */
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

		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

		// Execute meta search with OR query to match any keyword
		const metaRows = docChunkRepo.searchMetaFts(ftsQuery, searchLimit, mode, scope);
		if (!metaRows.length) {
			return [];
		}

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(metaRows.map((r) => r.docId)));
		const metaRows_ = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows_.map((m) => [m.id, m]));

		// Score results by keyword match count in title/path
		const items: SearchResultItem[] = metaRows.map((r) => {
			const meta = metaById.get(r.docId);

			// Title logic: use yaml title from meta, fallback to filename without extension
			let title = meta?.title ?? r.title ?? null;
			if (!title && r.path) {
				const pathParts = r.path.split('/');
				const filename = pathParts[pathParts.length - 1] || r.path;
				title = filename.replace(/\.[^/.]+$/, ''); // Remove extension
			}
			title = title || r.path; // Final fallback to path

			// Count keyword matches in title and path
			const titleText = title ?? '';
			const pathText = r.path ?? '';
			const combinedText = `${titleText} ${pathText}`;
			const keywordMatchCount = this.countKeywordMatches(combinedText, keywords);

			// For meta search, create snippet from title and path
			const content = `${title} ${r.path}`;
			const snippet = buildHighlightSnippet(content, termRaw);

			// Base score from BM25 (smaller is better, convert to larger-is-better)
			const bm25Score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));

			// Weighted score: boost by keyword match count
			// Meta matches are important, so give higher boost
			const matchRatio = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
			const keywordBoost = 1 + (matchRatio * 0.8); // Up to 80% boost for meta matches
			const score = bm25Score * keywordBoost;

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
			};
		});

		// Sort by score descending and take topK
		return items
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
			.slice(0, topK);
	}

	/**
	 * Merge content sources (fulltext + vector) into unified content hits.
	 * This creates a "content match" where items that appear in either content source
	 * are considered content hits with combined RRF scoring.
	 */
	private mergeContentSources<T extends { path: string }>(
		textHits: Array<T & { score: number }>,
		vectorHits: Array<T & { score: number }>,
	): Array<T & { score: number }> {
		const contentHits = new Map<string, { score: number; hit: T & { score: number } }>();

		// Add fulltext hits to content map
		for (let rank = 1; rank <= textHits.length; rank++) {
			const hit = textHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_CONTENT_WEIGHT / (RRF_K + rank);
			contentHits.set(id, { score: rrf, hit });
		}

		// Add vector hits to content map (merge if already exists)
		for (let rank = 1; rank <= vectorHits.length; rank++) {
			const hit = vectorHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_CONTENT_WEIGHT / (RRF_K + rank);
			const existing = contentHits.get(id);
			if (existing) {
				// Merge with existing content hit, combine scores
				existing.score += rrf;
			} else {
				contentHits.set(id, { score: rrf, hit });
			}
		}

		// Return deduplicated content hits sorted by score
		return Array.from(contentHits.values())
			.sort((a, b) => b.score - a.score)
			.map((x) => ({ ...x.hit, score: x.score }));
	}

	/**
	 * Merge content hits with meta hits using two-stage RRF approach.
	 *
	 * Stage 1: Content sources (fulltext + vector) are merged into unified "content hits"
	 * Stage 2: Content hits are merged with meta hits using equal weights
	 *
	 * This design recognizes that:
	 * - Content matches (text/vector) represent semantic/content relevance
	 * - Meta matches (title/path) represent explicit user intent
	 * - Both are valuable signals that should be balanced equally
	 */
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

}

