import type { RerankProvider, RerankRequest, RerankResponse } from './types';

interface FlashRankOptions {
	modelId?: string;
}

/**
 * FlashRank local rerank provider.
 * Note: This requires a Python backend service or Node.js binding.
 * For now, this is a placeholder that can be extended with actual implementation.
 */
export class FlashRankProvider implements RerankProvider {
	private readonly modelId: string;

	constructor(options: FlashRankOptions) {
		// Default model: ms-marco-MiniLM-L-12-v2 (lightweight, fast)
		this.modelId = options.modelId || 'ms-marco-MiniLM-L-12-v2';
	}

	getType(): string {
		return 'flashrank';
	}

	async rerank(_request: RerankRequest): Promise<RerankResponse> {
		throw new Error('FlashRank reranker is not yet implemented. Please select a different reranker in Settings.');
	}
}

