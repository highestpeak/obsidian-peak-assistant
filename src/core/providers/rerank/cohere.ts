import type { RerankProvider, RerankRequest, RerankResponse } from './types';

interface CohereRerankOptions {
	apiKey: string;
	baseUrl?: string;
	modelId?: string;
}

interface CohereRerankAPIRequest {
	model: string;
	query: string;
	documents: string[];
	top_n?: number;
}

interface CohereRerankAPIResponse {
	results: Array<{
		index: number;
		relevance_score: number;
	}>;
}

/**
 * Cohere Rerank API provider.
 */
export class CohereRerankProvider implements RerankProvider {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly modelId: string;

	constructor(options: CohereRerankOptions) {
		this.apiKey = options.apiKey;
		this.baseUrl = options.baseUrl || 'https://api.cohere.ai/v1';
		this.modelId = options.modelId || 'rerank-multilingual-v3.0';
	}

	getType(): string {
		return 'cohere';
	}

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		const documents = request.documents.map((d) => d.text);

		const apiRequest: CohereRerankAPIRequest = {
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
			throw new Error(`Cohere rerank API error: ${response.status} ${errorText}`);
		}

		const data: CohereRerankAPIResponse = await response.json();

		return {
			results: data.results.map((r) => ({
				index: r.index,
				score: r.relevance_score,
			})),
		};
	}
}

