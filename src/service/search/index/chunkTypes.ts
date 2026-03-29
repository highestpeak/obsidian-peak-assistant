/**
 * First-class chunk provenance for indexing, retrieval, and semantic graph edges.
 */

/** Stable chunk categories stored in SQLite and carried on {@link Chunk}. */
export const CHUNK_TYPES = [
	'body_raw',
	'summary_short',
	'summary_full',
	'salient_textrank_sentence',
] as const;

export type ChunkType = (typeof CHUNK_TYPES)[number];

/**
 * Optional structured metadata for a chunk (persisted in `doc_chunk.chunk_meta_json`).
 */
export type ChunkMeta = {
	/** TextRank salience score when {@link ChunkType} is `salient_textrank_sentence`. */
	textrankScore?: number;
	/** Original sentence index from TextRank extraction. */
	textrankIndex?: number;
	/** Where summary text came from when indexed. */
	summarySource?: 'llm' | 'frontmatter';
	/** Zero-based part index when a summary was split across multiple chunks. */
	summarySliceIndex?: number;
	/** Total parts when a summary was split across multiple chunks. */
	summarySliceCount?: number;
};

/** Priority order for semantic doc–doc queries (higher index = lower priority). */
export const SEMANTIC_CHUNK_TYPE_ORDER: readonly ChunkType[] = [
	'summary_short',
	'summary_full',
	'salient_textrank_sentence',
	'body_raw',
] as const;

/** Relative weight when aggregating KNN scores by chunk type (semantic edges). */
export const SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT: Record<ChunkType, number> = {
	summary_short: 1.25,
	summary_full: 1.15,
	salient_textrank_sentence: 1.1,
	body_raw: 1.0,
};
