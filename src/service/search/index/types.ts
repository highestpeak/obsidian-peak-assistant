/**
 * Document chunk (for embedding and search).
 * 
 * Long documents are split into chunks for:
 * - Better embedding quality (focused, smaller units)
 * - More precise search results (can find specific sections)
 * - Efficient processing (parallel chunk processing)
 */
export interface DocumentChunk {
	/**
	 * Unique chunk identifier.
	 * Format: "{documentId}:chunk:{index}"
	 */
	id: string;
	/**
	 * Parent document ID.
	 */
	documentId: string;
	/**
	 * Chunk index within document (0-based).
	 */
	chunkIndex: number;
	/**
	 * Total number of chunks in parent document.
	 */
	totalChunks: number;
	/**
	 * Chunk content.
	 */
	content: string;
	/**
	 * Start offset in original document (character index).
	 */
	startOffset: number;
	/**
	 * End offset in original document (character index).
	 */
	endOffset: number;
	/**
	 * Chunk metadata (heading, section, etc.).
	 */
	metadata?: {
		heading?: string;
		section?: string;
		[key: string]: unknown;
	};
	/**
	 * Optional embedding vector for this chunk.
	 * Should be generated externally.
	 */
	embedding?: number[];
}

/**
 * Document chunking options.
 */
export interface DocumentChunkingOptions {
	/**
	 * Whether to enable chunking.
	 * Default: true for documents above threshold.
	 */
	enabled?: boolean;
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

