/**
 * Rerank provider configuration.
 * 
 * Field requirements by provider type:
 * - 'cohere' / 'jina': requires apiKey, modelId
 * - 'llm': requires modelId, extra.provider (actual LLM provider), extra.aiServiceManager
 * - 'flashrank': requires modelId (optional)
 */
export interface RerankProviderConfig {
	/**
	 * Provider type identifier.
	 * - 'cohere': Cohere Rerank API
	 * - 'jina': Jina Rerank API
	 * - 'llm': LLM-based reranking (uses MultiProviderChatService)
	 * - 'flashrank': FlashRank local reranking
	 */
	type: string;
	/**
	 * API key (required for 'cohere' and 'jina' providers).
	 */
	apiKey?: string;
	/**
	 * Base URL for API (optional, for 'cohere' and 'jina' providers).
	 */
	baseUrl?: string;
	/**
	 * Model identifier (required for all providers).
	 */
	modelId?: string;
	/**
	 * Extra provider-specific options.
	 * For 'llm' provider:
	 *   - provider: actual LLM provider name (e.g., 'ollama', 'openai')
	 *   - aiServiceManager: AIServiceManager instance
	 */
	extra?: Record<string, any>;
}

/**
 * Document to be reranked.
 */
export interface RerankDocument {
	/**
	 * Document text content.
	 */
	text: string;
	/**
	 * Optional metadata (e.g., boost info, title, etc.).
	 */
	metadata?: Record<string, any>;
}

/**
 * Rerank result for a single document.
 */
export interface RerankResult {
	/**
	 * Original document index.
	 */
	index: number;
	/**
	 * Relevance score (higher is better).
	 */
	score: number;
}

/**
 * Rerank request.
 */
export interface RerankRequest {
	/**
	 * Search query.
	 */
	query: string;
	/**
	 * Documents to rerank.
	 */
	documents: RerankDocument[];
	/**
	 * Optional top K to return (default: return all).
	 */
	topK?: number;
}

/**
 * Rerank response.
 */
export interface RerankResponse {
	/**
	 * Reranked results, sorted by score (descending).
	 */
	results: RerankResult[];
}

/**
 * Rerank provider interface.
 */
export interface RerankProvider {
	/**
	 * Get provider type identifier.
	 */
	getType(): string;

	/**
	 * Rerank documents based on query.
	 * @param request - Rerank request
	 * @returns Reranked results
	 */
	rerank(request: RerankRequest): Promise<RerankResponse>;
}

