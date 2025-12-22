/**
 * Document metadata PO (Persistent Object).
 * Stores document metadata information extracted from Document.
 * fields in Document model, like tags, title will be readed when needed from Document sourceFile or cacheFile.
 */
export interface DocumentMetaPO {
	/**
	 * Document ID (unique identifier, may differ from path).
	 * primary key for database.
	 */
	id: string;
	/**
	 * File path
	 */
	sourceFilePath: string;
	/**
	 * Cache file path
	 */
	cacheFilePath: string;
	/**
	 * Document type.
	 * type limit to DocumentType enum.
	 */
	type: string | null;
	/**
	 * Last modification time (timestamp, from sourceFileInfo.mtime).
	 */
	mtime: number | null;
	/**
	 * Creation time (timestamp, from sourceFileInfo.ctime).
	 */
	ctime: number | null;
	/**
	 * MD5 hash of content (for deduplication, from Document.contentHash).
	 */
	content_hash: string | null;
	/**
	 * Last processing timestamp (from Document.lastProcessedAt).
	 */
	last_processed_at: number | null;
}

