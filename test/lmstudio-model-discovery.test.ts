import assert from 'node:assert/strict';
import { fetchLMStudioModelMetadata } from '@/core/providers/lmstudio/fetchLMStudioModels';
import { ModelType } from '@/core/providers/types';

async function main(): Promise<void> {
	const originalFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requested.push(String(input));
		return {
			ok: true,
			json: async () => ({
				models: [
					{
						type: 'llm',
						key: 'google/gemma-4-26b-a4b-qat',
						display_name: 'Gemma 4 26B A4B QAT',
						capabilities: { vision: true, trained_for_tool_use: true },
					},
					{
						type: 'embedding',
						key: 'text-embedding-nomic-embed-text-v1.5',
						display_name: 'Nomic Embed Text v1.5',
					},
				],
			}),
		} as Response;
	}) as typeof fetch;

	try {
		const models = await fetchLMStudioModelMetadata('http://127.0.0.1:1234/v1');
		assert.deepEqual(models.map((model) => ({ id: model.id, modelType: model.modelType })), [
			{ id: 'google/gemma-4-26b-a4b-qat', modelType: ModelType.LLM },
			{ id: 'text-embedding-nomic-embed-text-v1.5', modelType: ModelType.EMBEDDING },
		]);
		assert.deepEqual(requested, ['http://127.0.0.1:1234/api/v1/models']);
	} finally {
		globalThis.fetch = originalFetch;
	}

	console.log('PASS lmstudio-model-discovery');
}

void main();
