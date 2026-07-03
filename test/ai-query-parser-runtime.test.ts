import assert from 'assert';
import { maybeCompileWithAiParser } from '@/service/search/query/aiQueryParserRuntime';
import type { SearchSettings } from '@/core/config/settingsTypes';
import { DEFAULT_SEARCH_SETTINGS } from '@/core/config/settingsTypes';
import type { AiQueryLLMInvoker } from '@/service/search/query/aiQueryParser';

function makeSettings(overrides: Partial<SearchSettings>): SearchSettings {
	return { ...DEFAULT_SEARCH_SETTINGS, ...overrides };
}

async function testOffByDefaultReturnsRaw() {
	const result = await maybeCompileWithAiParser(
		'foo bar',
		makeSettings({ useAiQueryParser: false }),
		() => {
			throw new Error('should not be called when setting is off');
		},
	);
	assert.strictEqual(result.compiled, 'foo bar');
	assert.strictEqual(result.usedFallback, false, 'off path is not a fallback — no LLM was attempted');
	assert.strictEqual(result.attempts, 0);
	console.log('[ai-query-parser-runtime] off by default: PASS');
}

async function testEmptyQueryShortCircuits() {
	const result = await maybeCompileWithAiParser(
		'   ',
		makeSettings({ useAiQueryParser: true }),
		() => {
			throw new Error('should not be called for empty input');
		},
	);
	assert.strictEqual(result.compiled, '   ', 'empty input passed through unchanged');
	console.log('[ai-query-parser-runtime] empty input short-circuits: PASS');
}

async function testMissingInvokerFallsBackToRaw() {
	const result = await maybeCompileWithAiParser(
		'notes about kubernetes',
		makeSettings({ useAiQueryParser: true }),
		() => null,
	);
	assert.strictEqual(result.compiled, 'notes about kubernetes');
	assert.strictEqual(result.usedFallback, true);
	assert.ok(result.fallbackReason?.includes('no fast-role profile'));
	console.log('[ai-query-parser-runtime] missing invoker → fallback: PASS');
}

async function testEnabledInvokesLLM() {
	const invoker: AiQueryLLMInvoker = async () =>
		JSON.stringify({ compiled: 'kubernetes folder:notes', explanation: 'ok' });
	const result = await maybeCompileWithAiParser(
		'notes about kubernetes',
		makeSettings({ useAiQueryParser: true }),
		() => invoker,
	);
	assert.strictEqual(result.usedFallback, false);
	assert.strictEqual(result.compiled, 'kubernetes folder:notes');
	assert.strictEqual(result.explanation, 'ok');
	assert.ok(result.attempts >= 1);
	console.log('[ai-query-parser-runtime] enabled invokes LLM: PASS');
}

async function testEnabledFallsBackOnLlmFailure() {
	const invoker: AiQueryLLMInvoker = async () => {
		throw new Error('network down');
	};
	const result = await maybeCompileWithAiParser(
		'papers on diffusion',
		makeSettings({ useAiQueryParser: true }),
		() => invoker,
	);
	assert.strictEqual(result.usedFallback, true);
	assert.strictEqual(result.compiled, 'papers on diffusion');
	assert.strictEqual(result.fallbackReason, 'network down');
	console.log('[ai-query-parser-runtime] LLM failure → fallback: PASS');
}

(async () => {
	await testOffByDefaultReturnsRaw();
	await testEmptyQueryShortCircuits();
	await testMissingInvokerFallsBackToRaw();
	await testEnabledInvokesLLM();
	await testEnabledFallsBackOnLlmFailure();
})();
