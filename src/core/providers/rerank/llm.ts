import type { RerankProvider, RerankRequest, RerankResponse, RerankResult, RerankDocument } from './types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

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
	private readonly promptService: PromptService;

	constructor(options: LLMRerankOptions) {
		this.modelId = options.modelId;
		this.provider = options.provider;
		this.aiServiceManager = options.aiServiceManager;
		this.promptService = options.aiServiceManager.getUnifiedPromptService();
	}

	getType(): string {
		return 'llm';
	}

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		// Build documents array for prompt
		const documentsArray = request.documents.map((doc, idx) => ({
			index: idx,
			text: doc.text,
			boostInfo: doc.metadata?.boostInfo,
		}));

		// Render prompt and call LLM via PromptService
		const content = await this.promptService.chatWithPrompt(
			PromptId.SearchRerankRankGpt,
			{
				query: request.query,
				documents: documentsArray,
			},
			this.provider,
			this.modelId
		);

		// Parse LLM response to extract rankings
		const results = this.parseLLMResponse(content, request.documents.length);

		// Sort by score descending
		results.sort((a, b) => b.score - a.score);

		// Apply topK if specified
		const finalResults = request.topK ? results.slice(0, request.topK) : results;

		return { results: finalResults };
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

