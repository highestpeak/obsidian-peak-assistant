import type { SearchQuery, SearchResponse, SearchResultItem, SearchMode, SearchScope } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { RankingSignals } from './ranking/ranking-boost';
import { normalizeTextForFts } from '../support/segmenter';
import { buildSnippet } from '../support/snippet-builder';
import { shouldKeepPathByScope } from '../support/scope-filter';
import { mergeHybridResultsWithRRF } from './ranking/rrf-merger';
import { applyRankingBoosts } from './ranking/ranking-boost';

/**
 * Query service for search operations.
 * Handles fulltext, vector, hybrid search, and graph queries.
 */
export class QueryService {

	/**
	 * Execute search (fulltext, vector, or hybrid) with ranking boosts applied.
	 */
	async executeSearch(params: {
		query: SearchQuery;
	}): Promise<SearchResponse> {
		const { query } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? 50);
		const mode = query?.mode ?? 'vault';
		const scope = query?.scope ?? {};
		const embedding = Array.isArray(query?.embedding) ? (query.embedding as number[]) : undefined;
		const searchMode = embedding ? (query?.searchMode ?? 'hybrid') : (query?.searchMode ?? 'fulltext');

		if (!termRaw) {
			return { query, items: [] };
		}

		// Perform fulltext search independently
		let textItems: SearchResultItem[] = [];
		if (searchMode === 'fulltext' || searchMode === 'hybrid') {
			textItems = await this.executeFulltextSearch({
				query,
				mode,
				scope,
			});
		}

		// Perform vector search independently using sqlite-vec KNN search
		let vecItems: SearchResultItem[] = [];
		if (embedding && (searchMode === 'vector' || searchMode === 'hybrid')) {
			vecItems = await this.executeVectorSearch({
				query,
				mode,
				scope,
			});
		}

		// Merge results based on search mode
		let items: SearchResultItem[] = [];
		if (searchMode === 'fulltext') {
			items = textItems;
		} else if (searchMode === 'vector') {
			items = vecItems;
		} else if (searchMode === 'hybrid') {
			// Merge fulltext and vector results using RRF
			items = mergeHybridResultsWithRRF({
				textHits: textItems.map((i) => ({ ...i, score: i.score ?? 0 })),
				vectorHits: vecItems.map((i) => ({ ...i, score: i.score ?? 0 })),
				limit: topK,
			});
		}

		// Apply ranking boosts
		const signals = await this.getSignalsForPaths(items.map((i) => i.path));
		const related = scope?.currentFilePath
			? this.getRelatedPathsWithinHops({
					startPath: scope.currentFilePath,
					maxHops: 2,
				})
			: new Set<string>();
		const ranked = applyRankingBoosts({ items, signals, relatedPaths: related });

		return { query, items: ranked };
	}

	/**
	 * Execute fulltext search using FTS5.
	 */
	private async executeFulltextSearch(params: {
		query: SearchQuery;
		mode: SearchMode;
		scope?: SearchScope;
	}): Promise<SearchResultItem[]> {
		const { query, mode, scope } = params;
		const termRaw = query?.text ?? '';
		const term = normalizeTextForFts(termRaw);
		const topK = Number(query?.topK ?? 50);

		if (!term) {
			return [];
		}

		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		
		const fulltextRows = docChunkRepo.searchFts(term, topK);
		if (!fulltextRows.length) {
			return [];
		}

		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(fulltextRows.map((r) => r.docId)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		const items: SearchResultItem[] = fulltextRows.map((r) => {
			const meta = metaById.get(r.docId);
			const snippet = buildSnippet(r.content ?? '', termRaw);
			// bm25: smaller is better. Convert to a larger-is-better score.
			const score = 1 / (1 + Math.max(0, Number(r.bm25 ?? 0)));
			return {
				id: r.path,
				type: (meta?.type ?? 'markdown') as any,
				title: r.title ?? r.path,
				path: r.path,
				lastModified: Number(meta?.mtime ?? 0),
				snippet: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score,
				finalScore: score,
			};
		});

		return items.filter((i) => shouldKeepPathByScope({ mode, scope, path: i.path }));
	}

	/**
	 * Execute vector search using sqlite-vec KNN search.
	 */
	private async executeVectorSearch(params: {
		query: SearchQuery;
		mode: SearchMode;
		scope?: SearchScope;
	}): Promise<SearchResultItem[]> {
		const { query, mode, scope } = params;
		const termRaw = query?.text ?? '';
		const topK = Number(query?.topK ?? 50);
		const embedding = Array.isArray(query?.embedding) ? (query.embedding as number[]) : undefined;

		if (!embedding) {
			return [];
		}

		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		
		// Use sqlite-vec KNN search (no need to load all embeddings into memory)
		const vectorResults = embeddingRepo.searchSimilar(embedding, topK);

		if (!vectorResults.length) {
			return [];
		}

		// Batch fetch embedding records by IDs
		const embeddingIds = vectorResults.map((r) => r.embedding_id);
		const embeddingRows = await embeddingRepo.getByIds(embeddingIds);
		const embeddingMap = new Map(embeddingRows.map((r) => [r.id, r]));

		// Get chunk IDs and fetch chunk data
		const vecChunkIds = embeddingRows.map((r) => r.chunk_id).filter((id): id is string => id !== null);
		const rows = await docChunkRepo.getByChunkIds(vecChunkIds);
		
		// Fetch doc_meta separately (avoid JOIN)
		const docIds = Array.from(new Set(rows.map((r) => r.doc_id)));
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));

		// Map distance to similarity score (distance is smaller for more similar vectors)
		const scoreByChunk = new Map<string, number>();
		for (const vecResult of vectorResults) {
			const emb = embeddingMap.get(vecResult.embedding_id);
			if (emb?.chunk_id) {
				// Convert distance to similarity score: 1 / (1 + distance)
				const similarity = 1 / (1 + vecResult.distance);
				scoreByChunk.set(emb.chunk_id, similarity);
			}
		}

		const items: SearchResultItem[] = rows.map((r) => {
			const meta = metaById.get(r.doc_id);
			const snippet = buildSnippet(r.content_raw ?? '', termRaw);
			const score = Number(scoreByChunk.get(String(r.chunk_id)) ?? 0);
			return {
				id: meta?.path ?? r.doc_id,
				type: (meta?.type ?? 'markdown') as any,
				title: r.title ?? meta?.path ?? r.doc_id,
				path: meta?.path ?? r.doc_id,
				lastModified: Number(meta?.mtime ?? r.mtime ?? 0),
				snippet: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score,
				finalScore: score,
			};
		});

		return items.filter((i) => shouldKeepPathByScope({ mode, scope, path: i.path }));
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
	 * Get related document paths within N hops using recursive CTE.
	 *
	 * Notes:
	 * - This follows outgoing edges only (same as current GraphStore neighbor traversal).
	 * - Filters to graph_nodes.type='document'.
	 */
	private getRelatedPathsWithinHops(params: { startPath: string; maxHops: number }): Set<string> {
		const maxHops = Math.max(1, Number(params.maxHops ?? 2));
		const store = sqliteStoreManager.getStore();
		const rows = store.prepare(`
			WITH RECURSIVE
			hop(node_id, depth) AS (
				SELECT ? as node_id, 0
				UNION ALL
				SELECT e.to_node_id, hop.depth + 1
				FROM graph_edges e
				JOIN hop ON e.from_node_id = hop.node_id
				WHERE hop.depth < ?
			)
			SELECT DISTINCT n.id as id
			FROM hop
			JOIN graph_nodes n ON n.id = hop.node_id
			WHERE hop.depth > 0 AND n.type = 'document'
		`).all(params.startPath, maxHops) as Array<{ id: string }>;
		return new Set(rows.map((r) => String(r.id)));
	}
}

