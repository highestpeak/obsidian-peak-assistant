import assert from 'node:assert/strict';
import { fetchOllamaModelMetadata } from '@/core/providers/ollama/fetchOllamaModels';
import { ModelType } from '@/core/providers/types';

async function main(): Promise<void> {
	const originalFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		requested.push(url);
		if (url.endsWith('/api/tags')) {
			return { ok: true, json: async () => ({ models: [{ name: 'llama3.1' }, { name: 'nomic-embed-text:latest' }] }) } as Response;
		}
		const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
		return {
			ok: true,
			json: async () => ({ capabilities: body.model === 'nomic-embed-text:latest' ? ['embedding'] : ['completion'] }),
		} as Response;
	}) as typeof fetch;

	try {
		const models = await fetchOllamaModelMetadata('http://localhost:11434');
		assert.deepEqual(models.map((model) => ({ id: model.id, modelType: model.modelType })), [
			{ id: 'llama3.1', modelType: ModelType.LLM },
			{ id: 'nomic-embed-text:latest', modelType: ModelType.EMBEDDING },
		]);
		assert.deepEqual(requested, [
			'http://localhost:11434/api/tags',
			'http://localhost:11434/api/show',
			'http://localhost:11434/api/show',
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}

	console.log('PASS ollama-model-discovery');
}

void main();
