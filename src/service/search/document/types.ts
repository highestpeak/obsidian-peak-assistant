import type { DocumentType } from '@/core/Enums';

/**
 * Plain document representation used by indexing subsystems.
 *
 * Keep this decoupled from Obsidian runtime types.
 */
export interface IndexableDocument {
	path: string;
	title: string;
	type: DocumentType;
	content: string;
	mtime: number;
	/**
	 * Optional embedding vector for vector search.
	 * Should be generated externally and provided during indexing.
	 * Dimension should match EMBEDDING_DIMENSION in OramaSearchIndex (default: 1536).
	 */
	embedding?: number[];
}

/**
 * Document loader interface for different file types.
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
	 * Returns null if the file cannot be read or is not supported.
	 */
	readByPath(path: string): Promise<IndexableDocument | null>;

	/**
	 * Stream documents in batches.
	 */
	batchLoadDocuments(params?: { limit?: number; batchSize?: number }): AsyncGenerator<IndexableDocument[]>;
}

