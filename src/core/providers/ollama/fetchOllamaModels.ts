import { getProviderCorsBypassFetch } from '@/core/providers/vercel/provider-factory';
import { ModelType, type ModelMetaData } from '@/core/providers/types';

/**
 * Fetch installed models from a running Ollama instance.
 * Returns model names on success, empty array on failure (silent).
 */
export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
	return (await fetchOllamaModelMetadata(baseUrl)).map((model) => model.id);
}

/**
 * Ollama exposes a model's supported work through `/api/show`.  The tags list
 * alone has no model type, so a local embedding model must not be guessed from
 * its name or silently treated as a chat model.
 */
export async function fetchOllamaModelMetadata(baseUrl: string): Promise<ModelMetaData[]> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		const controller = new AbortController();
		timeout = setTimeout(() => controller.abort(), 3000);

		const res = await (getProviderCorsBypassFetch() ?? fetch)(`${baseUrl}/api/tags`, { signal: controller.signal });

		if (!res.ok) return [];

		const data = (await res.json()) as { models?: Array<{ name?: string }> };
		const modelIds = (data.models ?? [])
			.map((m) => m.name)
			.filter((name): name is string => typeof name === 'string' && name.length > 0);
		return Promise.all(modelIds.map(async (id) => ({
			id,
			displayName: id,
			modelType: await fetchOllamaModelType(baseUrl, id),
		})));
	} catch {
		return [];
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

async function fetchOllamaModelType(baseUrl: string, model: string): Promise<ModelType> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		const controller = new AbortController();
		timeout = setTimeout(() => controller.abort(), 3_000);
		const response = await (getProviderCorsBypassFetch() ?? fetch)(`${baseUrl.replace(/\/+$/, '')}/api/show`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model }),
			signal: controller.signal,
		});
		if (!response.ok) return ModelType.LLM;
		const payload = await response.json() as { capabilities?: string[] };
		return payload.capabilities?.includes('embedding') ? ModelType.EMBEDDING : ModelType.LLM;
	} catch {
		return ModelType.LLM;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
