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

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		// TODO: Implement FlashRank integration
		// Option 1: Call Python backend service via HTTP
		// Option 2: Use Node.js binding if available
		// Option 3: Use WebAssembly version if available
		
		// For now, return a simple fallback (original order with equal scores)
		// In production, this should call the actual FlashRank service
		console.warn(
			`[FlashRankProvider] FlashRank not yet implemented. Using fallback ranking. Model: ${this.modelId}`,
		);

		// Fallback: return original order
		return {
			results: request.documents.map((_, index) => ({
				index,
				score: 1.0,
			})),
		};
	}
}

