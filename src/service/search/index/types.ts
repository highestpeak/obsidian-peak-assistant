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

