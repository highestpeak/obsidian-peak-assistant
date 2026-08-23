import assert from 'node:assert/strict';
import type { LanguageModel } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { Profile } from '@/core/profiles/types';
import { runHarnessText } from '@/service/agents/harness/HarnessModelRunner';

const RAW_USAGE = {
	inputTokens: { total: 20, noCache: 20, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 8, textTokens: 8, reasoningTokens: 0 },
	totalTokens: 28,
	reasoningTokens: 0,
	cachedInputTokens: undefined,
};

const profile: Profile = {
	id: 'lmstudio-test',
	name: 'LM Studio test',
	kind: 'lmstudio',
	enabled: true,
	createdAt: 0,
	baseUrl: 'http://127.0.0.1:1234/v1',
	apiKey: null,
	primaryModel: 'test-model',
	fastModel: null,
	customHeaders: {},
	embeddingEndpoint: null,
	embeddingApiKey: null,
	embeddingModel: null,
	icon: null,
	description: null,
};

async function main(): Promise<void> {
	const model = new MockLanguageModelV3({
		provider: 'mock',
		modelId: 'structured-model',
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: 'stream-start', warnings: [] },
				{ type: 'text-start', id: 'text-1' },
				{ type: 'text-delta', id: 'text-1', delta: '{"ok":true}' },
				{ type: 'text-end', id: 'text-1' },
				{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: RAW_USAGE },
			] as any),
		}),
	});
	const schema = {
		type: 'object',
		properties: { ok: { type: 'boolean' } },
		required: ['ok'],
		additionalProperties: false,
	};

	const result = await runHarnessText({
		loopId: 'structured-output-test',
		profile,
		modelId: 'structured-model',
		systemPrompt: 'Return JSON.',
		prompt: 'Confirm.',
		maxSteps: 1,
		responseFormat: {
			type: 'json',
			schema: schema as any,
			name: 'peak_structured_response',
		},
		languageModel: model as unknown as LanguageModel,
	});

	assert.equal(result.text, '{"ok":true}');
	assert.deepEqual(model.doStreamCalls[0]?.responseFormat, {
		type: 'json',
		schema,
		name: 'peak_structured_response',
	}, 'the Harness must forward the real JSON Schema to the provider call');
	console.log('harness structured output tests passed');
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
