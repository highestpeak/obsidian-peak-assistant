import type { SearchQuery, SearchResponse, SearchResultItem, SearchResultType, SearchScopeMode, SearchScopeValue } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { normalizeTextForFts } from '../support/segmenter';
import { buildHighlightSnippet } from './highlight-builder';
import { Reranker } from './reranker';
import { DEFAULT_SEARCH_MODE, DEFAULT_SEARCH_TOP_K } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import { RRF_K, RRF_TEXT_WEIGHT, RRF_VECTOR_WEIGHT } from '@/core/constant';

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
	 * Execute search (fulltext, vector, or hybrid) with ranking boosts applied.
	 */
	async textSearch(query: SearchQuery): Promise<SearchResponse> {
		const termRaw = query?.text ?? '';
		const scopeMode = query?.scopeMode ?? DEFAULT_SEARCH_MODE;
		const scopeValue = query?.scopeValue ?? {};

		// Always perform hybrid search (fulltext + vector if embedding is available)
		// Generate embedding first (if configured)
		const embeddingModel = this.searchSettings.chunking.embeddingModel;
		let embedding: number[] | undefined;

		if (embeddingModel) {
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
		}

		// Parallel execution: fulltext search and vector search (if embedding is available)
		const [textItems, vecItems] = await Promise.all([
			// Perform fulltext search
			this.executeFulltextSearch({ query, scopeMode, scopeValue }),
			// Perform vector search if embedding is available
			embedding ? this.executeVectorSearch({
				query,
				mode: scopeMode,
				scope: scopeValue,
				embedding,
			}) : Promise.resolve([]),
		]);

		// Merge fulltext and vector results using RRF (always hybrid)
		const resultItems = this.mergeHybridResultsWithRRF(
			textItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			vecItems.map((i) => ({ ...i, score: i.score ?? 0 })),
			Number(query?.topK ?? DEFAULT_SEARCH_TOP_K),
		);

		// Apply ranking boosts and rerank (handled inside reranker)
		const ranked = await this.reranker.rerank(resultItems, termRaw, scopeValue);

		return { query, items: ranked };
	}

	/**
	 * Execute fulltext search using FTS5.
	 */
	private async executeFulltextSearch(params: {
		query: SearchQuery;
		scopeMode: SearchScopeMode;
		scopeValue?: SearchScopeValue;
	}): Promise<SearchResultItem[]> {
		const { query, scopeMode: mode, scopeValue: scope } = params;
		const termRaw = query?.text ?? '';
		const term = normalizeTextForFts(termRaw);
		const topK = Number(query?.topK ?? DEFAULT_SEARCH_TOP_K);
		if (!term) {
			return [];
		}

		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

		// Execute search with scope filtering at SQL level
		const fulltextRows = docChunkRepo.searchFts(term, topK, mode, scope);
		if (!fulltextRows.length) {
			return [];
		}

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(fulltextRows.map((r) => r.docId)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const items: SearchResultItem[] = fulltextRows.map((r) => {
			const meta = metaById.get(r.docId);
			const content = r.content ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);
			// bm25: smaller is better. Convert to a larger-is-better score.
			const score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));
			return {
				id: r.path,
				type: (meta?.type ?? 'unknown') as SearchResultType,
				title: r.title ?? r.path,
				path: r.path,
				lastModified: Number(meta?.mtime ?? 0),
				content,
				highlight: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score,
				finalScore: score,
			};
		});

		return items;
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

		// Use sqlite-vec KNN search with scope filtering at SQL level
		const vectorResults = embeddingRepo.searchSimilar(embedding, topK, mode, scope);
		if (!vectorResults.length) {
			return [];
		}

		// Map distance to similarity score (distance is smaller for more similar vectors)
		const embeddingRows = await embeddingRepo.getByIds(
			vectorResults.map((r) => r.embedding_id)
		);
		const embeddingMap = new Map(embeddingRows.map((r) => [r.id, r]));
		const scoreByChunk = new Map<string, number>();
		for (const vecResult of vectorResults) {
			const emb = embeddingMap.get(vecResult.embedding_id);
			if (emb?.chunk_id) {
				// Convert distance to similarity score: 1 / (1 + distance)
				const similarity = 1 / (1 + vecResult.distance);
				scoreByChunk.set(emb.chunk_id, similarity);
			}
		}

		// Get chunk IDs and fetch chunk data
		const vecChunkIds = embeddingRows.map((r) => r.chunk_id).filter((id): id is string => id !== null);
		const chunkRows = await docChunkRepo.getByChunkIds(vecChunkIds);

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(chunkRows.map((r) => r.doc_id)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const items: SearchResultItem[] = chunkRows.map((r) => {
			const meta = metaById.get(r.doc_id);
			const path = meta?.path ?? r.doc_id;
			const content = r.content_raw ?? '';
			const snippet = buildHighlightSnippet(content, termRaw);
			const score = Number(scoreByChunk.get(String(r.chunk_id)) ?? 0);
			return {
				id: path,
				type: (meta?.type ?? 'unknown') as SearchResultType,
				title: r.title ?? path,
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
	 * Merge hybrid search results using Reciprocal Rank Fusion (RRF).
	 */
	private mergeHybridResultsWithRRF<T extends { path: string }>(
		textHits: Array<T & { score: number }>,
		vectorHits: Array<T & { score: number }>,
		limit: number,
	): Array<T & { score: number }> {
		const scores = new Map<string, { score: number; hit: T & { score: number } }>();

		for (let rank = 1; rank <= textHits.length; rank++) {
			const hit = textHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_TEXT_WEIGHT / (RRF_K + rank);
			const existing = scores.get(id);
			if (existing) {
				existing.score += rrf;
				existing.hit = hit;
			} else {
				scores.set(id, { score: rrf, hit });
			}
		}

		for (let rank = 1; rank <= vectorHits.length; rank++) {
			const hit = vectorHits[rank - 1]!;
			const id = hit.path;
			const rrf = RRF_VECTOR_WEIGHT / (RRF_K + rank);
			const existing = scores.get(id);
			if (existing) {
				existing.score += rrf;
			} else {
				scores.set(id, { score: rrf, hit });
			}
		}

		return Array.from(scores.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((x) => ({ ...x.hit, score: x.score }));
	}

}

