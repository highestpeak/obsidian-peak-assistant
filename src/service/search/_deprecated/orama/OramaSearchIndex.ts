/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * Orama search has been replaced by SQLite FTS5 + sqlite-vec (USKE architecture).
 * See: src/core/storage/README.md
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { create, insertMultiple, removeMultiple, search as oramaSearch } from '@orama/orama';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { persist, restore } from '@orama/plugin-data-persistence';

type OramaDatabase = any;

import { EMBEDDING_DIMENSION } from '@/core/constant';
import type { OramaDocumentPO } from './orama-document.po';
import { getOramaDocumentSchema } from './orama-document.po';

/**
 * Orama search index supporting both full-text and vector search.
 *
 * Notes:
 * - Orama natively supports vector search without any plugins.
 * - Vector search works by defining a `vector[dimension]` field in the schema.
 * - Embeddings must be generated externally and provided during insert/search.
 * - Full-text search works independently and doesn't require embeddings.
 *
 * Runs inside worker thread. The main thread should never touch this.
 */
export class OramaSearchIndex {
	private constructor(private readonly db: OramaDatabase) {}

	/**
	 * Create and initialize the search index with schema.
	 * If `oramaJson` is provided, it will be used to restore the index.
	 *
	 * Schema includes:
	 * - Text fields: id, path, title, type, content, mtime
	 * - Vector field: embedding (for vector search, optional at insert time)
	 *
	 * Notes:
	 * - By default, Orama uses all the string properties to perform the search. https://docs.orama.com/docs/orama-js/search
	 * - Vector search is natively supported by Orama, no plugins needed. https://docs.orama.com/docs/orama-js/search/vector-search
	 * 	- The `vector[dimension]` field enables vector similarity search. https://docs.orama.com/docs/orama-js/search/vector-search
	 * 	- Embeddings must be generated externally and match EMBEDDING_DIMENSION. https://docs.orama.com/docs/orama-js/search/vector-search
	 * - Documents can be inserted with or without embeddings (full-text still works).
	 *
	 * https://docs.orama.com/docs/orama-js/plugins/plugin-data-persistence
	 */
	static async getInstance(params?: { oramaJson?: string | null }): Promise<OramaSearchIndex> {
		const json = params?.oramaJson ?? null;
		let db: OramaDatabase;

		if (json) {
			// Use Orama's official restore method
			db = await restore('json', json);
		} else {
			db = create({
				schema: getOramaDocumentSchema(),
				id: 'id',
				// todo chinese tokenizer, japanese tokenizer, multi-language tokenizer
				// todo custome stop words.
			});
		}

		return new OramaSearchIndex(db);
	}

	/**
	 * Export current database to JSON string for persistence.
	 * Uses Orama's official data persistence plugin for serialization.
	 * https://docs.orama.com/docs/orama-js/plugins/plugin-data-persistence
	 */
	async save(): Promise<string> {
		return (await persist(this.db, 'json')) as string;
	}

	/**
	 * Insert multiple documents into the index.
	 *
	 * @param docs - Documents to insert. Embedding field is optional.
	 *
	 * Notes:
	 * - If embedding is provided, the document can be found via vector search.
	 * - If embedding is omitted, the document can still be found via full-text search.
	 * - Embedding dimension must match EMBEDDING_DIMENSION (default: 1536).
	 * - It's recommended to provide embeddings for better search quality.
	 */
	async insertDocuments(docs: OramaDocumentPO[]): Promise<void> {
		if (docs.length > 0) {
			await insertMultiple(this.db, docs);
		}
	}

	/**
	 * Remove documents by their IDs (paths).
	 */
	async removeDocuments(ids: string[]): Promise<void> {
		if (ids.length > 0) {
			await removeMultiple(this.db, ids);
		}
	}

	/**
	 * Search the index with full-text, vector, or hybrid search.
	 *
	 * Orama natively supports vector search without plugins. Vector search works by:
	 * 1. Comparing the query embedding with document embeddings using cosine similarity
	 * 2. Returning documents sorted by similarity score
	 *
	 * Search modes:
	 * - 'fulltext': Text-based search only (BM25 algorithm)
	 * - 'vector': Vector similarity search only (cosine similarity)
	 * - 'hybrid': Combines both full-text and vector results (weighted: 60% text, 40% vector)
	 *
	 * @param params.searchMode - Search mode: 'fulltext' | 'vector' | 'hybrid' (default: 'fulltext')
	 * @param params.term - Text query for full-text search (required for fulltext/hybrid mode)
	 * @param params.embedding - Query embedding vector (required for vector/hybrid mode, must match EMBEDDING_DIMENSION)
	 * @param params.properties - Properties to search in full-text mode (default: ['title', 'content'])
	 * @param params.boost - Boost weights for full-text search (default: { title: 2, content: 1 })
	 * @param params.limit - Maximum number of results (default: 50)
	 *
	 * @throws Error if embedding is required but not provided or dimension mismatch
	 */
	async search(params: {
		searchMode?: 'fulltext' | 'vector' | 'hybrid';
		term?: string;
		embedding?: number[];
		properties?: string[];
		boost?: Record<string, number>;
		limit?: number;
	}): Promise<{ hits: any[] }> {
		const mode = params.searchMode ?? 'fulltext';
		const limit = params.limit ?? 50;
		const term = params.term ?? '';

		// Validate embedding vector for vector/hybrid search modes
		// Orama natively supports vector search - no plugins needed
		if (mode === 'vector' || mode === 'hybrid') {
			if (!params.embedding) {
				throw new Error('Embedding vector is required for vector search');
			}
			if (params.embedding.length !== EMBEDDING_DIMENSION) {
				throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${params.embedding.length}`);
			}
		}

		// Hybrid search: combine full-text (BM25) and vector (cosine similarity) results
		// Uses Reciprocal Rank Fusion (RRF) for better ranking
		if (mode === 'hybrid') {
			const [textResults, vectorResults] = await Promise.all([
				term
					? oramaSearch(this.db, {
							term,
							properties: params.properties ?? ['title', 'content'],
							boost: params.boost ?? { title: 2, content: 1 },
							limit,
						})
					: Promise.resolve({ hits: [] }),
				oramaSearch(this.db, {
					mode: 'vector',
					vector: {
						value: params.embedding!,
						property: 'embedding',
					},
					limit,
				}),
			]);

			// Use RRF (Reciprocal Rank Fusion) for merging results
			// This is more robust than weighted score averaging
			return this.mergeHybridResultsWithRRF(
				textResults.hits ?? [],
				vectorResults.hits ?? [],
				limit,
			);
		}

		// Vector-only search: uses cosine similarity between query and document embeddings
		// Orama natively supports this - no plugins required
		if (mode === 'vector') {
			return await oramaSearch(this.db, {
				mode: 'vector',
				vector: {
					value: params.embedding!,
					property: 'embedding', // Vector field name in schema
				},
				limit,
			});
		}

		// Full-text search (default): uses BM25 algorithm for text matching
		// Works independently of embeddings - documents without embeddings can still be found
		return await oramaSearch(this.db, {
			term,
			properties: params.properties ?? ['title', 'content'],
			boost: params.boost ?? { title: 2, content: 1 }, // Title has higher weight than content
			limit,
		});
	}

	/**
	 * Merge hybrid search results using Reciprocal Rank Fusion (RRF).
	 * 
	 * RRF is preferred over weighted score averaging because:
	 * - Scale-invariant: works regardless of BM25/vector score ranges
	 * - Rank-based: focuses on relative positions, not absolute scores
	 * - Proven effective for hybrid search
	 * 
	 * Formula: RRF_score(d) = Σ (weight_i / (k + rank_i(d)))
	 * Where k = 60 (default), rank is 1-based
	 */
	private mergeHybridResultsWithRRF(
		textHits: any[],
		vectorHits: any[],
		limit: number,
	): { hits: any[] } {
		const k = 60; // RRF constant
		const textWeight = 0.6; // Weight for text results
		const vectorWeight = 0.4; // Weight for vector results

		// Calculate RRF scores
		const rrfScores = new Map<string, { score: number; hit: any }>();

		// Process text results (rank 1, 2, 3, ...)
		for (let rank = 1; rank <= textHits.length; rank++) {
			const hit = textHits[rank - 1];
			const id = hit.document?.id ?? hit.id;
			if (!id) continue;

			const rrfScore = textWeight / (k + rank);
			const existing = rrfScores.get(id);
			if (existing) {
				existing.score += rrfScore;
				// Prefer text hit for better snippets
				existing.hit = hit;
			} else {
				rrfScores.set(id, { score: rrfScore, hit });
			}
		}

		// Process vector results (rank 1, 2, 3, ...)
		for (let rank = 1; rank <= vectorHits.length; rank++) {
			const hit = vectorHits[rank - 1];
			const id = hit.document?.id ?? hit.id;
			if (!id) continue;

			const rrfScore = vectorWeight / (k + rank);
			const existing = rrfScores.get(id);
			if (existing) {
				existing.score += rrfScore;
			} else {
				rrfScores.set(id, { score: rrfScore, hit });
			}
		}

		// Sort by RRF score and return top results
		return {
			hits: Array.from(rrfScores.values())
				.sort((a, b) => b.score - a.score)
				.slice(0, limit)
				.map(({ score, hit }) => ({
					...hit,
					score, // Replace original score with RRF score
				})),
		};
	}
}


