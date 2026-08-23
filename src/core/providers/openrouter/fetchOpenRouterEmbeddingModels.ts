import { getProviderCorsBypassFetch } from '@/core/providers/vercel/provider-factory';
import { ModelType, type ModelMetaData } from '@/core/providers/types';

type OpenRouterModel = {
	id?: string;
	name?: string;
	output_modalities?: string[];
	architecture?: { output_modalities?: string[] };
};

/**
 * OpenRouter's model catalog is dynamic. Ask it for the models whose declared
 * output modality is embeddings instead of guessing from a model name.
 */
export async function fetchOpenRouterEmbeddingModels(baseUrl: string): Promise<ModelMetaData[]> {
	const endpoint = `${baseUrl.replace(/\/+$/, '')}/models?output_modalities=embeddings`;
	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), 5_000);
	try {
		const response = await (getProviderCorsBypassFetch() ?? fetch)(endpoint, { signal: controller.signal });
		if (!response.ok) return [];
		const body = await response.json() as { data?: OpenRouterModel[] };
		return (body.data ?? [])
			.filter((model) => {
				const modalities = model.output_modalities ?? model.architecture?.output_modalities ?? [];
				return typeof model.id === 'string' && modalities.includes('embeddings');
			})
			.map((model) => ({
				id: model.id!,
				displayName: model.name ?? model.id!,
				modelType: ModelType.EMBEDDING,
			}));
	} catch {
		return [];
	} finally {
		window.clearTimeout(timeout);
	}
}
