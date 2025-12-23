import type { RerankProvider, RerankRequest, RerankResponse, RerankResult, RerankDocument } from './types';
import type { AIServiceManager } from '@/service/chat/service-manager';

interface LLMRerankOptions {
	modelId: string;
	provider: string;
	aiServiceManager: AIServiceManager;
}

/**
 * LLM-based rerank provider (RankGPT/RankLLM style).
 * Uses existing LLM to rerank documents via prompt.
 * Uses MultiProviderChatService to call the LLM, so no need for baseUrl/apiKey.
 */
export class LLMRerankProvider implements RerankProvider {
	private readonly modelId: string;
	private readonly provider: string;
	private readonly aiServiceManager: AIServiceManager;

	constructor(options: LLMRerankOptions) {
		this.modelId = options.modelId;
		this.provider = options.provider;
		this.aiServiceManager = options.aiServiceManager;
	}

	getType(): string {
		return 'llm';
	}

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		// Build prompt for LLM reranking
		const prompt = this.buildRerankPrompt(request.query, request.documents);

		// Call LLM via MultiProviderChatService
		const multiChat = this.aiServiceManager.getMultiChat();
		const response = await multiChat.blockChat({
			provider: this.provider,
			model: this.modelId,
			messages: [
				{
					role: 'user',
					content: [{ type: 'text', text: prompt }],
				},
			],
		});

		// Parse LLM response to extract rankings
		const results = this.parseLLMResponse(response.content, request.documents.length);

		// Sort by score descending
		results.sort((a, b) => b.score - a.score);

		// Apply topK if specified
		const finalResults = request.topK ? results.slice(0, request.topK) : results;

		return { results: finalResults };
	}

	/**
	 * Build prompt for LLM reranking.
	 */
	private buildRerankPrompt(query: string, documents: RerankDocument[]): string {
		const docList = documents
			.map((doc, idx) => {
				const metadata = doc.metadata?.boostInfo ? ` [${doc.metadata.boostInfo}]` : '';
				return `[${idx}] ${doc.text}${metadata}`;
			})
			.join('\n\n');

		return `You are a search result reranker. Given a query and a list of documents, rank them by relevance.

Query: ${query}

Documents:
${docList}

Please return the document indices in order of relevance (most relevant first), separated by commas.
Example format: 2,0,1,3

Only return the indices, nothing else.`;
	}

	/**
	 * Parse LLM response to extract document rankings.
	 */
	private parseLLMResponse(response: string, docCount: number): RerankResult[] {
		// Try to extract comma-separated indices
		const match = response.match(/\[?\s*(\d+(?:\s*,\s*\d+)*)\s*\]?/);
		if (!match) {
			// Fallback: return original order with equal scores
			return Array.from({ length: docCount }, (_, i) => ({
				index: i,
				score: 1.0,
			}));
		}

		const indices = match[1]
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((idx) => idx >= 0 && idx < docCount);

		// Assign scores based on rank position (higher rank = higher score)
		const results: RerankResult[] = indices.map((index, rank) => ({
			index,
			score: docCount - rank, // Higher rank gets higher score
		}));

		// Add any missing indices with low scores
		const foundIndices = new Set(indices);
		for (let i = 0; i < docCount; i++) {
			if (!foundIndices.has(i)) {
				results.push({ index: i, score: 0.1 });
			}
		}

		return results;
	}
}

