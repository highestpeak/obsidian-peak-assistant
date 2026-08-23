import assert from 'node:assert/strict';
import type { HttpClientPort, HttpRequest, HttpResponse } from '@/core/ports/HttpClientPort';
import { ModelCatalogRuntime } from '@/app/model-catalog/ModelCatalogRuntime';
import { ModelRegistry } from '@/core/providers/model-registry';
import { createPresetProfile } from '@/core/profiles/presets';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';
import { ModelType } from '@/core/providers/types';

const requests: HttpRequest[] = [];
const responses: Array<{ status: number; body: unknown }> = [
	{
		status: 200,
		body: { data: [
			{ id: 'openai/gpt-current', name: 'GPT Current', created: 10, context_length: 128000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools', 'reasoning'], pricing: { prompt: '0.000001', completion: '0.000002' }, top_provider: { max_completion_tokens: 32000 } },
			{ id: 'vendor/removed-later', name: 'Removed Later', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: [] },
		] },
	},
	{ status: 200, body: { data: [{ id: 'openai/gpt-newest', name: 'GPT Newest', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'] }] } },
	{ status: 503, body: { error: 'temporary' } },
];
const http: HttpClientPort = {
	async request(request: HttpRequest): Promise<HttpResponse> {
		requests.push(request);
		const response = responses.shift();
		if (!response) throw new Error('unexpected request');
		return { status: response.status, headers: {}, text: JSON.stringify(response.body), arrayBuffer: new ArrayBuffer(0) };
	},
};

void (async () => {
const profile = createPresetProfile('openrouter', {
	id: 'runtime-openrouter-test',
	name: 'Runtime OpenRouter',
	enabled: true,
	apiKey: 'secret-test-key',
	baseUrl: 'https://openrouter.ai/api/v1',
});
const catalogId = profileModelCatalogId(profile)!;
const registry = ModelRegistry.getInstance();
const runtime = new ModelCatalogRuntime(http, registry);

await runtime.refreshProfile(profile);
assert.equal(requests[0]?.method, 'GET');
assert.equal(requests[0]?.url, 'https://openrouter.ai/api/v1/models/user?output_modalities=all');
assert.equal(requests[0]?.headers?.Authorization, 'Bearer secret-test-key');
assert.equal(requests.some((request) => request.method === 'POST'), false, 'catalog refresh must never generate text');
const first = runtime.getModelsForProvider(catalogId);
assert.deepEqual(first.map((model) => model.id), ['openai/gpt-current', 'vendor/removed-later']);
assert.equal(first[0]?.modelType, ModelType.LLM);
assert.equal(first[0]?.capabilities?.vision, true);
assert.equal(first[0]?.capabilities?.tools, true);
assert.equal(first[0]?.tokenLimits?.maxOutputTokens, 32000);

await runtime.refreshProfile(profile);
assert.deepEqual(runtime.getModelsForProvider(catalogId).map((model) => model.id), ['openai/gpt-newest'], 'successful refresh replaces stale entries');
const refreshedAt = runtime.getProfileState(profile.id).refreshedAt;

await runtime.refreshProfile(profile);
assert.deepEqual(runtime.getModelsForProvider(catalogId).map((model) => model.id), ['openai/gpt-newest'], 'failed refresh preserves last-known-good snapshot');
assert.equal(runtime.getProfileState(profile.id).status, 'stale');
assert.equal(runtime.getProfileState(profile.id).refreshedAt, refreshedAt);
assert.match(runtime.getProfileState(profile.id).error ?? '', /503/);

console.log('PASS openrouter-model-catalog-runtime');
})();
