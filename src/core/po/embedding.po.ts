/**
 * Embedding PO (Persistent Object).
 * Caches generated embeddings for document chunks.
 */
export interface EmbeddingPO {
	/**
	 * Unique identifier (primary key).
	 * Format: "{file_id}:chunk:{chunk_index}" or file_id for non-chunked documents.
	 */
	id: string;
	/**
	 * File identifier (typically file path or document ID).
	 */
	file_id: string;
	/**
	 * Chunk identifier (for chunked documents).
	 */
	chunk_id: string | null;
	/**
	 * Chunk index within document (0-based).
	 */
	chunk_index: number | null;
	/**
	 * MD5 hash of chunk content (for cache invalidation).
	 */
	md5: string;
	/**
	 * Creation time (timestamp).
	 */
	ctime: number;
	/**
	 * Last modification time (timestamp).
	 */
	mtime: number;
	/**
	 * Embedding vector (stored as JSON string or BLOB).
	 * JSON array of numbers.
	 */
	embedding: string;
	/**
	 * Embedding model identifier.
	 */
	embedding_model: string;
	/**
	 * Embedding vector length (dimension).
	 */
	embedding_len: number;
}

