import type { DocumentType, Document, ResourceSummary, Summarizable } from '@/core/document/types';
import type { Chunk } from '@/service/search/index/types';
import type { ChunkingSettings } from '@/app/settings/types';

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
	readByPath(path: string, genCacheContent?: boolean): Promise<Document | null>;

	/**
	 * Chunk content from a document.
	 * First calls getIndexableContent, then chunks the content using appropriate splitter.
	 * 
	 * @param doc - Document to chunk
	 * @param settings - Chunking settings (chunk size, overlap, etc.)
	 * @returns Array of chunks
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

