import assert from 'node:assert/strict';
import type { HttpClientPort, HttpRequest, HttpResponse } from '@/core/ports/HttpClientPort';
import { createPresetProfile } from '@/core/profiles/presets';
import { resolveProviderProbeEndpoints } from '@/core/providers/provider-endpoints';
import { inspectProviderConnection } from '@/core/providers/testProviderConnection';

function response(status: number, text = '{}'): HttpResponse {
	return { status, text, headers: {}, arrayBuffer: new ArrayBuffer(0) };
}

class FakeHttp implements HttpClientPort {
	readonly requests: HttpRequest[] = [];
	constructor(private readonly replies: HttpResponse[]) {}
	async request(request: HttpRequest): Promise<HttpResponse> {
		this.requests.push(request);
		return this.replies.shift() ?? response(500);
	}
}

function testVersionedEndpoints(): void {
	assert.equal(resolveProviderProbeEndpoints(createPresetProfile('openai')).catalog, 'https://api.openai.com/v1/models');
	assert.equal(resolveProviderProbeEndpoints(createPresetProfile('anthropic')).generation, 'https://api.anthropic.com/v1/messages');
	assert.equal(resolveProviderProbeEndpoints(createPresetProfile('openrouter')).catalog, 'https://openrouter.ai/api/v1/models');
	assert.equal(resolveProviderProbeEndpoints(createPresetProfile('codex')).generation, 'http://127.0.0.1:8787/v1/chat/completions');
	assert.equal(resolveProviderProbeEndpoints(createPresetProfile('custom', { baseUrl: 'https://example.test/api/v1/' })).catalog, 'https://example.test/api/v1/models');
}

async function testReadyRequiresCatalogAndGeneration(): Promise<void> {
	const http = new FakeHttp([response(200, '{"data":[{"id":"gpt-5"}]}'), response(200, '{"choices":[]}')]);
	const result = await inspectProviderConnection(http, createPresetProfile('openai', { apiKey: 'secret' }));
	assert.equal(result.ready, true);
	assert.equal(result.catalog.state, 'passed');
	assert.equal(result.minimumGeneration.state, 'passed');
	assert.deepEqual(result.catalogModelIds, ['gpt-5']);
	assert.deepEqual(http.requests.map((request) => request.url), [
		'https://api.openai.com/v1/models',
		'https://api.openai.com/v1/chat/completions',
	]);
}

async function testOllamaUsesDiscoveredModel(): Promise<void> {
	const http = new FakeHttp([
		response(200, '{"models":[{"name":"qwen3:8b"}]}'),
		response(200, '{"response":"OK"}'),
	]);
	const result = await inspectProviderConnection(http, createPresetProfile('ollama'));
	assert.equal(result.ready, true);
	assert.deepEqual(result.catalogModelIds, ['qwen3:8b']);
	assert.equal(JSON.parse(http.requests[1]!.body ?? '{}').model, 'qwen3:8b');
}

async function testOllama404IsNotReady(): Promise<void> {
	const result = await inspectProviderConnection(new FakeHttp([response(404, 'not found')]), createPresetProfile('ollama'));
	assert.equal(result.ready, false);
	assert.equal(result.failureReason, 'catalog');
}

async function testEmptyCatalogIsNotReady(): Promise<void> {
	const result = await inspectProviderConnection(new FakeHttp([response(200, '{"data":[]}'), response(200)]), createPresetProfile('openrouter', { apiKey: 'secret' }));
	assert.equal(result.ready, false);
	assert.equal(result.failureReason, 'catalog');
}

async function main(): Promise<void> {
	testVersionedEndpoints();
	await testReadyRequiresCatalogAndGeneration();
	await testOllamaUsesDiscoveredModel();
	await testOllama404IsNotReady();
	await testEmptyCatalogIsNotReady();
	console.log('PASS onboarding-provider-readiness');
}

void main();
