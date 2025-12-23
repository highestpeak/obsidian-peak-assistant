import type { RerankProvider, RerankRequest, RerankResponse } from './types';

interface JinaRerankOptions {
	apiKey: string;
	baseUrl?: string;
	modelId?: string;
}

interface JinaRerankAPIRequest {
	model: string;
	query: string;
	documents: string[];
	top_n?: number;
}

interface JinaRerankAPIResponse {
	results: Array<{
		index: number;
		relevance_score: number;
	}>;
}

/**
 * Jina Rerank API provider.
 */
export class JinaRerankProvider implements RerankProvider {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly modelId: string;

	constructor(options: JinaRerankOptions) {
		this.apiKey = options.apiKey;
		this.baseUrl = options.baseUrl || 'https://api.jina.ai/v1';
		this.modelId = options.modelId || 'jina-reranker-v2-base-multilingual';
	}

	getType(): string {
		return 'jina';
	}

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		const documents = request.documents.map((d) => d.text);

		const apiRequest: JinaRerankAPIRequest = {
			model: this.modelId,
			query: request.query,
			documents,
			top_n: request.topK,
		};

		const response = await fetch(`${this.baseUrl}/rerank`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(apiRequest),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Jina rerank API error: ${response.status} ${errorText}`);
		}

		const data: JinaRerankAPIResponse = await response.json();

		return {
			results: data.results.map((r) => ({
				index: r.index,
				score: r.relevance_score,
			})),
		};
	}
}

