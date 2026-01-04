import type { Database as DbSchema } from '../ddl';

/**
 * Chunk data for upsert operations.
 */
export type DocChunkInput = {
	chunk_id: string;
	doc_id: string;
	chunk_index: number;
	title: string | null;
	mtime: number | null;
	content_raw: string | null;
	content_fts_norm: string | null;
};

/**
 * Chunk data returned from queries.
 */
export type DocChunkOutput = Pick<DbSchema['doc_chunk'], 'chunk_id' | 'doc_id' | 'title' | 'content_raw' | 'mtime'>;

/**
 * FTS insert parameters for content.
 */
export type FtsInsertParams = {
	chunk_id: string;
	doc_id: string;
	content: string;
};

/**
 * FTS insert parameters for document metadata.
 */
export type FtsMetaInsertParams = {
	doc_id: string;
	path: string;
	title: string | null;
};

/**
 * FTS search result row.
 */
export type FtsSearchResult = {
	chunkId: string;
	path: string;
	title: string;
	type: string;
	mtime: number;
	content: string;
	bm25: number;
};

