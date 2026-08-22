import { getProviderCorsBypassFetch } from '@/core/providers/vercel/provider-factory';
import { ModelType, type ModelMetaData } from '@/core/providers/types';

/**
 * Read the models currently exposed by an LM Studio local server. LM Studio
 * implements the OpenAI-compatible GET /v1/models contract; this is a
 * discovery read only and never changes the server or its loaded models.
 */
export async function fetchLMStudioModels(baseUrl: string): Promise<string[]> {
	return (await fetchLMStudioModelMetadata(baseUrl)).map((model) => model.id);
}

/** Preserve any type/capability metadata provided by an LM Studio server. */
export async function fetchLMStudioModelMetadata(baseUrl: string): Promise<ModelMetaData[]> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		const controller = new AbortController();
		timeout = setTimeout(() => controller.abort(), 3_000);
		const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
		const nativeBaseUrl = normalizedBaseUrl.replace(/\/v1$/, '');
		const request = getProviderCorsBypassFetch() ?? fetch;
		const nativeResponse = await request(`${nativeBaseUrl}/api/v1/models`, { signal: controller.signal });
		if (nativeResponse.ok) {
			const payload = await nativeResponse.json() as { models?: LMStudioModel[] };
			const models = toMetadata(payload.models ?? []);
			if (models.length) return models;
		}
		// Older LM Studio installations may not expose the native REST list. The
		// OpenAI-compatible fallback still discovers models, but should never
		// fabricate an embedding type that the server did not declare.
		const response = await request(`${normalizedBaseUrl}/models`, { signal: controller.signal });
		if (!response.ok) return [];
		const payload = await response.json() as { data?: LMStudioModel[] };
		return toMetadata(payload.data ?? []);
	} catch {
		return [];
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

type LMStudioModel = {
	id?: string;
	key?: string;
	name?: string;
	display_name?: string;
	type?: string;
	capabilities?: string[] | Record<string, unknown>;
};

function hasEmbeddingCapability(capabilities: LMStudioModel['capabilities']): boolean {
	if (Array.isArray(capabilities)) return capabilities.includes('embedding');
	return capabilities?.embedding === true || capabilities?.embeddings === true;
}

function toMetadata(models: LMStudioModel[]): ModelMetaData[] {
	return models.flatMap((model) => {
		const id = model.id ?? model.key ?? model.name;
		if (typeof id !== 'string' || !id.trim()) return [];
		return [{
			id,
			displayName: model.display_name ?? model.name ?? id,
			modelType: model.type === 'embedding' || model.type === 'embeddings' || hasEmbeddingCapability(model.capabilities)
				? ModelType.EMBEDDING
				: ModelType.LLM,
		}];
	});
}
