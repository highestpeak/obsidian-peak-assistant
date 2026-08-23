import type { DocumentType, Document, ResourceSummary, Summarizable } from '@/core/document/types';
import type { Chunk, IndexLlmRoute, LlmIndexingCompleteEvent, LlmIndexingProgressEvent, LlmIndexingTraceEvent } from '@/core/search/indexTypes';
import type { ChunkingSettings } from '@/core/config/settingsTypes';

/**
 * Controls expensive LLM work during {@link DocumentLoader.readByPath}.
 * When omitted, loaders default to full LLM (legacy behavior).
 */
export interface DocumentLoaderReadOptions {
	includeLlmTags?: boolean;
	includeLlmSummary?: boolean;
	/** Fires after markdown LLM tag + summary batch for this path (index telemetry). */
	onLlmIndexingComplete?: (ev: LlmIndexingCompleteEvent) => void;
	/** Emits observable request/response/commit phases; never synthetic model reasoning. */
	onLlmIndexingProgress?: (ev: LlmIndexingProgressEvent) => void;
	/** Ephemeral raw request/response trace; never persisted by the loader. */
	onLlmIndexingTrace?: (ev: LlmIndexingTraceEvent) => void;
	llmRoute?: IndexLlmRoute;
}

/**
 * Document loader interface for different file types.
 * 
 * Loaders should return core Document model, which can then be converted
 * to Chunk for search indexing.
 */
export interface DocumentLoader extends Summarizable {
	/**
	 * Get the document type this loader handles.
	 */
	getDocumentType(): DocumentType;

	/**
	 * Get the file extensions this loader supports.
	 */
	getSupportedExtensions(): string[];

	/**
	 * Read a document by its path.
	 * Returns core Document model, or null if file cannot be read.
	 */
	readByPath(
		path: string,
		genCacheContent?: boolean,
		readOptions?: DocumentLoaderReadOptions,
	): Promise<Document | null>;

	/**
	 * Build search chunks for a document: body splits plus derived chunks (e.g. summaries, TextRank).
	 * Implementations should return the final set ready for FTS/embeddings (see assembleIndexedChunks.ts; re-exported from MarkdownDocumentLoader).
	 */
	chunkContent(doc: Document, settings: ChunkingSettings): Promise<Chunk[]>;

	/**
	 * Scan documents metadata without loading content.
	 * Returns lightweight metadata: path, mtime, type.
	 * This is used for efficient index change detection.
	 */
	scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>>;

	/**
	 * Get summary for a document.
	 * Returns both short and full summaries.
	 * @param source - Document to summarize
	 * @param provider - LLM provider
	 * @param modelId - LLM model ID
	 * @returns Resource summary with short and optional full summary
	 */
	getSummary(
		source: Document | string,
		provider: string,
		modelId: string
	): Promise<ResourceSummary>;
}
