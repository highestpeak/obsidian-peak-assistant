import type { ChunkMeta, ChunkType } from '@/service/search/index/chunkTypes';

/**
 * Document chunking options.
 */
export interface DocumentChunkingOptions {
	/**
	 * Maximum chunk size (characters or tokens).
	 * Default: 1000
	 */
	maxChunkSize?: number;
	/**
	 * Chunk overlap (characters).
	 * Default: 200
	 */
	chunkOverlap?: number;
	/**
	 * Minimum document size to trigger chunking.
	 * Default: 1500
	 */
	minDocumentSize?: number;
	/**
	 * Chunking strategy.
	 * - 'recursive': LangChain RecursiveCharacterTextSplitter (recommended)
	 * - 'paragraph': Split by paragraphs
	 * - 'sentence': Split by sentences
	 * Default: 'recursive'
	 */
	strategy?: 'recursive' | 'paragraph' | 'sentence';
}

/**
 * Chunk representation for search indexing.
 * 
 * This represents a chunk of a document (or the entire document if not chunked).
 * Used for indexing into the search database.
 */
export interface Chunk {
	/**
	 * Document node id (indexed document on `mobius_node`); used as doc_id in chunk/embedding tables.
	 */
	docId: string;
	/**
	 * Provenance: body split, LLM summary, TextRank salient sentence, etc.
	 */
	chunkType: ChunkType;
	/**
	 * Optional structured metadata (TextRank scores, summary source).
	 */
	chunkMeta?: ChunkMeta;
	/**
	 * Optional display title for snippet UX (e.g. summary label).
	 */
	title?: string;
	/**
	 * Chunk content (or document content if not chunked).
	 */
	content: string;
	/**
	 * Optional embedding vector for vector search.
	 * Should be generated externally and provided during indexing.
	 * Dimension should match EMBEDDING_DIMENSION (default: 1536).
	 */
	embedding?: number[];
	/**
	 * Chunk identifier for chunked documents.
	 * UUID or unique identifier generated for the chunk.
	 * If not provided, document is treated as single, non-chunked document.
	 */
	chunkId?: string;
	/**
	 * Chunk index within the original document (0-based, incrementing).
	 */
	chunkIndex?: number;
}

