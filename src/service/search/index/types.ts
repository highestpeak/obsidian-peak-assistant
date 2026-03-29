import type { Document } from '@/core/document/types';
import type { LLMUsage } from '@/core/providers/types';
import type { ChunkMeta, ChunkType } from '@/service/search/index/chunkTypes';

/**
 * Payload when markdown index-time LLM (tags + summary) completes for one document.
 */
export type LlmIndexingCompleteEvent = {
	path: string;
	durationMs: number;
	usage: LLMUsage;
	costUsd: number;
};

/**
 * Why this index run was triggered (drives default {@link IndexDocumentOptions}).
 */
export type IndexDocumentReason =
	| 'listener_fast'
	| 'startup_scan'
	| 'manual_full'
	| 'hub_maintenance'
	| 'vector_enrich_only'
	| 'llm_enrich_only';

/**
 * Per-index-run options: split core search indexing from LLM tags/summary.
 * Use {@link defaultIndexDocumentOptions} for presets.
 */
export interface IndexDocumentOptions {
	/** When false, skip embedding generation for this pass. */
	includeEmbeddings: boolean;
	includeLlmTags: boolean;
	includeLlmSummary: boolean;
	/** When LLM steps are skipped, keep existing DB tags/summary/infer_created_at. */
	preserveExistingLlmDataWhenSkipped: boolean;
	/** When LLM steps are skipped, mark doc for deferred enrichment in attributes_json. */
	markLlmPendingWhenSkipped: boolean;
	/** When false, skip chunking + FTS persistence. */
	includeCoreSearchIndex: boolean;
	/** When embeddings are skipped, mark doc for deferred vector enrichment in attributes_json. */
	markVectorPendingWhenSkipped: boolean;
	/** When false, do not bump index_state indexedDocs/builtAt (enrich-only pass). */
	incrementIndexState: boolean;
	reason: IndexDocumentReason;
	/** Optional; forwarded to markdown loader for LLM usage telemetry (e.g. pending enrichment progress). */
	onLlmIndexingComplete?: (ev: LlmIndexingCompleteEvent) => void;
}

/**
 * Default options by reason. No plugin settings required.
 */
export function defaultIndexDocumentOptions(reason: IndexDocumentReason): IndexDocumentOptions {
	switch (reason) {
		case 'listener_fast':
		case 'startup_scan':
			return {
				includeEmbeddings: false,
				includeLlmTags: false,
				includeLlmSummary: false,
				preserveExistingLlmDataWhenSkipped: true,
				markLlmPendingWhenSkipped: true,
				includeCoreSearchIndex: true,
				markVectorPendingWhenSkipped: true,
				incrementIndexState: true,
				reason,
			};
		case 'manual_full':
		case 'hub_maintenance':
			return {
				includeEmbeddings: true,
				includeLlmTags: true,
				includeLlmSummary: true,
				preserveExistingLlmDataWhenSkipped: false,
				markLlmPendingWhenSkipped: false,
				includeCoreSearchIndex: true,
				markVectorPendingWhenSkipped: false,
				incrementIndexState: true,
				reason,
			};
		case 'vector_enrich_only':
			return {
				includeEmbeddings: true,
				includeLlmTags: false,
				includeLlmSummary: false,
				preserveExistingLlmDataWhenSkipped: true,
				markLlmPendingWhenSkipped: false,
				includeCoreSearchIndex: false,
				markVectorPendingWhenSkipped: false,
				incrementIndexState: false,
				reason,
			};
		case 'llm_enrich_only':
			return {
				includeEmbeddings: false,
				includeLlmTags: true,
				includeLlmSummary: true,
				preserveExistingLlmDataWhenSkipped: false,
				markLlmPendingWhenSkipped: false,
				includeCoreSearchIndex: false,
				markVectorPendingWhenSkipped: false,
				incrementIndexState: false,
				reason,
			};
	}
}

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

