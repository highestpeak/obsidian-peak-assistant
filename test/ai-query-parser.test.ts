import assert from 'assert';
import {
	AI_QUERY_SYSTEM_PROMPT,
	AiQueryPlanSchema,
	parseNaturalLanguageQuery,
	type AiQueryLLMInvoker,
} from '@/service/search/query/aiQueryParser';
import { parseQuery } from '@/service/search/query/query-parser';

function invokerReturning(text: string): AiQueryLLMInvoker {
	return async () => text;
}

function invokerThrowing(message: string): AiQueryLLMInvoker {
	return async () => {
		throw new Error(message);
	};
}

function invokerSequence(...texts: (string | Error)[]): AiQueryLLMInvoker {
	let i = 0;
	return async () => {
		const val = texts[i++];
		if (val instanceof Error) throw val;
		if (val === undefined) throw new Error('sequence exhausted');
		return val;
	};
}

async function testEmptyInputShortCircuits() {
	const result = await parseNaturalLanguageQuery('   ', invokerThrowing('should not call'));
	assert.strictEqual(result.compiled, '', 'empty compiled');
	assert.strictEqual(result.usedFallback, true);
	assert.strictEqual(result.attempts, 0);
	console.log('[ai-query-parser] empty input short-circuits: PASS');
}

async function testHappyPath() {
	const raw = JSON.stringify({
		compiled: '"diffusion models" folder:research -old',
		explanation: 'Phrase + folder filter + exclude',
	});
	const result = await parseNaturalLanguageQuery(
		'papers about diffusion models from the research folder, excluding old ones',
		invokerReturning(raw),
	);
	assert.strictEqual(result.usedFallback, false);
	assert.strictEqual(result.compiled, '"diffusion models" folder:research -old');
	assert.strictEqual(result.explanation, 'Phrase + folder filter + exclude');
	assert.strictEqual(result.attempts, 1);
	// Downstream parser must swallow the compiled string cleanly.
	const plan = parseQuery(result.compiled);
	assert.strictEqual(plan.phrases[0], 'diffusion models');
	assert.strictEqual(plan.filters[0].field, 'folder');
	assert.strictEqual(plan.filters[0].value, 'research');
	assert.strictEqual(plan.excludes.length, 1);
	console.log('[ai-query-parser] happy path + downstream parseQuery: PASS');
}

async function testFencedJsonIsAccepted() {
	// Bad case: model wraps JSON in a markdown fence.
	const raw = '```json\n{ "compiled": "notes" }\n```';
	const result = await parseNaturalLanguageQuery('any notes', invokerReturning(raw));
	assert.strictEqual(result.usedFallback, false);
	assert.strictEqual(result.compiled, 'notes');
	console.log('[ai-query-parser] fenced JSON accepted: PASS');
}

async function testRetryOnInvalidJsonThenSuccess() {
	const good = JSON.stringify({ compiled: 'kubernetes' });
	const result = await parseNaturalLanguageQuery(
		'kubernetes stuff',
		invokerSequence('not json at all', good),
		{ maxAttempts: 2 },
	);
	assert.strictEqual(result.usedFallback, false);
	assert.strictEqual(result.compiled, 'kubernetes');
	assert.strictEqual(result.attempts, 2, 'succeeded on second attempt');
	console.log('[ai-query-parser] retry after invalid JSON: PASS');
}

async function testMaxAttemptsExceededFallsBack() {
	const result = await parseNaturalLanguageQuery(
		'find launch plan drafts',
		invokerSequence('{"compiled":""}', 'nope', 'still nope'),
		{ maxAttempts: 2 },
	);
	assert.strictEqual(result.usedFallback, true);
	assert.strictEqual(result.compiled, 'find launch plan drafts', 'falls back to raw NL');
	assert.strictEqual(result.attempts, 2);
	assert.ok(result.fallbackReason, 'fallback reason surfaced');
	console.log('[ai-query-parser] max attempts fallback: PASS');
}

async function testLLMThrowsAllAttemptsFallsBack() {
	const result = await parseNaturalLanguageQuery(
		'weekly reflection notes',
		invokerThrowing('network down'),
		{ maxAttempts: 3 },
	);
	assert.strictEqual(result.usedFallback, true);
	assert.strictEqual(result.compiled, 'weekly reflection notes');
	assert.strictEqual(result.attempts, 3);
	assert.strictEqual(result.fallbackReason, 'network down');
	console.log('[ai-query-parser] LLM throws → fallback: PASS');
}

async function testAbortSignalStopsRetryLoop() {
	const controller = new AbortController();
	const invoker: AiQueryLLMInvoker = async () => {
		controller.abort();
		throw new Error('first attempt failed');
	};
	const result = await parseNaturalLanguageQuery(
		'something',
		invoker,
		{ maxAttempts: 3, signal: controller.signal },
	);
	assert.strictEqual(result.usedFallback, true);
	// Attempt 1 ran and failed; abort was seen at the top of attempt 2.
	assert.strictEqual(result.fallbackReason, 'aborted');
	console.log('[ai-query-parser] abort signal short-circuits retry: PASS');
}

function testSchemaRejectsEmptyCompiled() {
	// The schema must fail the empty-string variant, otherwise fallback is skipped.
	const bad = AiQueryPlanSchema.safeParse({ compiled: '' });
	assert.strictEqual(bad.success, false);
	const good = AiQueryPlanSchema.safeParse({ compiled: 'ok' });
	assert.strictEqual(good.success, true);
	console.log('[ai-query-parser] schema rejects empty compiled: PASS');
}

function testSystemPromptMentionsSyntax() {
	// Guard against inadvertently rewriting the system prompt in a way that
	// loses required syntax examples. This is a shape check, not a substance test.
	assert.ok(AI_QUERY_SYSTEM_PROMPT.includes('folder:'), 'system prompt mentions folder filter');
	assert.ok(AI_QUERY_SYSTEM_PROMPT.includes('-'), 'system prompt mentions exclude marker');
	assert.ok(AI_QUERY_SYSTEM_PROMPT.includes('compiled'), 'system prompt mentions compiled key');
	console.log('[ai-query-parser] system prompt shape: PASS');
}

(async () => {
	await testEmptyInputShortCircuits();
	await testHappyPath();
	await testFencedJsonIsAccepted();
	await testRetryOnInvalidJsonThenSuccess();
	await testMaxAttemptsExceededFallsBack();
	await testLLMThrowsAllAttemptsFallsBack();
	await testAbortSignalStopsRetryLoop();
	testSchemaRejectsEmptyCompiled();
	testSystemPromptMentionsSyntax();
})();
