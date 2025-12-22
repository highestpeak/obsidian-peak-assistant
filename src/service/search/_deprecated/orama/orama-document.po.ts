/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * Orama search has been replaced by SQLite FTS5 + sqlite-vec (USKE architecture).
 * See: src/core/storage/README.md
 */

import { EMBEDDING_DIMENSION } from '@/core/constant';

/**
 * Orama document PO (Persistent Object).
 * Represents a document in the Orama search index.
 */
export interface OramaDocumentPO {
	/**
	 * Document identifier (typically file path or chunk ID).
	 */
	id: string;
	/**
	 * File path.
	 */
	path: string;
	/**
	 * Document title.
	 */
	title: string;
	/**
	 * Document type.
	 */
	type: string;
	/**
	 * Document content (full text).
	 */
	content: string;
	/**
	 * Last modification time (timestamp).
	 */
	mtime: number;
	/**
	 * Optional embedding vector for vector search.
	 * Dimension must match EMBEDDING_DIMENSION constant.
	 */
	embedding?: number[];
}

/**
 * Orama schema definition for document structure.
 * This is used when creating the Orama database.
 * 
 * @see {@link OramaDocumentPO} - The corresponding document PO type.
 */
export function getOramaDocumentSchema() {
	return {
		id: 'string' as const,
		path: 'string' as const,
		title: 'string' as const,
		type: 'string' as const,
		content: 'string' as const,
		mtime: 'number' as const,
		embedding: `vector[${EMBEDDING_DIMENSION}]` as const,
	} as const;
}

