import type { DocumentType } from '@/core/document/types';
import type { Document as CoreDocument } from '@/core/document/types';
import type { DocumentChunk } from '../types';

/**
 * Search-specific document representation for indexing.
 * 
 * This is a simplified version of the core Document model, optimized for search indexing.
 * It contains only the fields needed for search operations.
 * 
 * Conversion:
 * - Core Document -> IndexableDocument: Extract search-relevant fields
 * - DocumentChunk -> IndexableDocument: Convert chunk to indexable format
 */
export interface IndexableDocument {
	/**
	 * Document identifier.
	 * For regular documents: path
	 * For chunks: chunkId (format: "{path}:chunk:{index}")
	 */
	path: string;
	/**
	 * Document title.
	 */
	title: string;
	/**
	 * Document type.
	 */
	type: DocumentType;
	/**
	 * Document content (or chunk content for chunked documents).
	 */
	content: string;
	/**
	 * Last modification time.
	 */
	mtime: number;
	/**
	 * Optional embedding vector for vector search.
	 * Should be generated externally and provided during indexing.
	 * Dimension should match EMBEDDING_DIMENSION in OramaSearchIndex (default: 1536).
	 * 
	 * For chunked documents: each chunk should have its own embedding.
	 */
	embedding?: number[];
	/**
	 * Chunk identifier for chunked documents.
	 * Format: "{documentId}:chunk:{index}"
	 * If not provided, document is treated as single, non-chunked document.
	 */
	chunkId?: string;
	/**
	 * Chunk index within the original document (0-based).
	 */
	chunkIndex?: number;
	/**
	 * Total number of chunks in the original document.
	 */
	totalChunks?: number;
}

/**
 * Convert core Document to IndexableDocument for search indexing.
 */
export function documentToIndexable(doc: CoreDocument): IndexableDocument {
	return {
		path: doc.id,
		title: doc.metadata.title,
		type: doc.type,
		content: doc.sourceFileInfo.content,
		mtime: doc.sourceFileInfo.mtime,
		// Note: embedding should be added externally
	};
}

/**
 * Convert DocumentChunk to IndexableDocument for search indexing.
 */
export function chunkToIndexable(chunk: DocumentChunk, originalDoc: CoreDocument): IndexableDocument {
	return {
		path: originalDoc.id, // Keep original path for grouping
		title: originalDoc.metadata.title,
		type: originalDoc.type,
		content: chunk.content,
		mtime: originalDoc.sourceFileInfo.mtime,
		chunkId: chunk.id,
		chunkIndex: chunk.chunkIndex,
		totalChunks: chunk.totalChunks,
		embedding: chunk.embedding, // Per-chunk embedding
	};
}

/**
 * Convert multiple DocumentChunks to IndexableDocuments.
 */
export function chunksToIndexable(chunks: DocumentChunk[], originalDoc: CoreDocument): IndexableDocument[] {
	return chunks.map(chunk => chunkToIndexable(chunk, originalDoc));
}

/**
 * Document loader interface for different file types.
 * 
 * Loaders should return core Document model, which can then be converted
 * to IndexableDocument for search indexing.
 */
export interface DocumentLoader {
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
	readByPath(path: string): Promise<CoreDocument | null>;

	/**
	 * Scan documents metadata without loading content.
	 * Returns lightweight metadata: path, mtime, type.
	 * This is used for efficient index change detection.
	 */
	scanDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<Array<{ path: string; mtime: number; type: DocumentType }>>;
}

