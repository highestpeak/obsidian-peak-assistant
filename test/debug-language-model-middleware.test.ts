import assert from 'assert';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { DebugTraceRecorder } from '@/core/debug-trace';
import { withDebugLanguageModel } from '@/core/providers/vercel/debug-language-model-middleware';

function usage(input: number, output: number) {
	return {
		inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
		outputTokens: { total: output, text: output, reasoning: 0 },
	};
}

async function main() {
console.log('debug-language-model-middleware: stream passthrough + lifecycle');
{
	const recorder = new DebugTraceRecorder({
		mode: 'raw',
		logger: { info: () => {}, error: () => {} },
	});
	const parts = [
		{ type: 'text-start', id: 't1' },
		{ type: 'text-delta', id: 't1', delta: '{"summary":' },
		{ type: 'reasoning-start', id: 'r1' },
		{ type: 'reasoning-delta', id: 'r1', delta: 'checking schema' },
		{ type: 'reasoning-end', id: 'r1' },
		{ type: 'text-delta', id: 't1', delta: '"ok"}' },
		{ type: 'text-end', id: 't1' },
		{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(12, 4) },
	] as const;
	const base: LanguageModelV3 = {
		specificationVersion: 'v3',
		provider: 'lmstudio.chat',
		modelId: 'gemma-local',
		supportedUrls: {},
		doGenerate: async () => { throw new Error('unused'); },
		doStream: async () => ({
			request: { body: { model: 'gemma-local', messages: [{ role: 'user', content: 'hello' }] } },
			stream: new ReadableStream({
				start(controller) {
					for (const part of parts) controller.enqueue(part as any);
					controller.close();
				},
			}),
		}),
	};
	const observed = withDebugLanguageModel(base, {
		debugTrace: recorder,
		surface: 'agent',
		capabilityId: 'index.summary',
		runId: 'scan-1',
		operation: 'object.generate',
	}) as LanguageModelV3;
	const result = await observed.doStream({ prompt: [] });
	assert.strictEqual(recorder.listModelCalls()[0]?.phase, 'request');
	const delivered: unknown[] = [];
	const reader = result.stream.getReader();
	while (true) {
		const next = await reader.read();
		if (next.done) break;
		delivered.push(next.value);
	}
	assert.strictEqual(delivered.length, parts.length, 'observer must not consume or mutate stream parts');
	const call = recorder.listModelCalls()[0]!;
	assert.strictEqual(call.phase, 'response');
	assert.strictEqual(call.operation, 'object.generate');
	assert.strictEqual(call.request.raw?.includes('"messages"'), true, 'adapter request body should replace logical params');
	assert.strictEqual(call.reasoning?.raw, 'checking schema');
	assert.strictEqual(call.response?.raw?.includes('"text":"{\\"summary\\":\\"ok\\"}"'), true);
	assert.strictEqual(call.response?.raw?.includes('text-delta'), false, 'delta bodies are compacted into exact text instead of retained twice');
	assert.strictEqual(call.finishReason, 'stop');
	assert.strictEqual(call.metrics?.inputTokens, 12);
}

console.log('debug-language-model-middleware: provider error rethrows');
{
	const recorder = new DebugTraceRecorder({
		mode: 'redacted',
		logger: { info: () => {}, error: () => {} },
	});
	const providerError = new Error('model unavailable');
	const base: LanguageModelV3 = {
		specificationVersion: 'v3',
		provider: 'lmstudio.chat',
		modelId: 'gemma-local',
		supportedUrls: {},
		doGenerate: async () => { throw providerError; },
		doStream: async () => { throw providerError; },
	};
	const observed = withDebugLanguageModel(base, {
		debugTrace: recorder,
		surface: 'agent',
		capabilityId: 'index.tags',
	}) as LanguageModelV3;
	await assert.rejects(async () => observed.doGenerate({ prompt: [] }), (error: unknown) => error === providerError);
	assert.strictEqual(recorder.listModelCalls()[0]?.phase, 'failed');
	assert.strictEqual(recorder.listModelCalls()[0]?.error?.message, 'model unavailable');
}

console.log('debug-language-model-middleware: OK');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
