import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';

function makeFakeClock(start = 1000): DebugClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIds(prefix = 'id'): DebugIdFactory {
	let n = 0;
	return { next: () => `${prefix}-${++n}` };
}

// ---------------------------------------------------------------------------
// Boundary source scan — core stays pure
// ---------------------------------------------------------------------------

const CORE_DIR = path.resolve(process.cwd(), 'src/core/debug-trace');
const CORE_FILES = [
	'types.ts',
	'helpers.ts',
	'redactor.ts',
	'DebugTracePort.ts',
	'DebugTraceRecorder.ts',
	'DebugTraceFormatter.ts',
	'index.ts',
];

const FORBIDDEN = [
	{ pattern: /^obsidian(\/.*)?$/, why: 'core must not import Obsidian' },
	{ pattern: /^@\/app\//, why: 'core must not depend on the app shell' },
	{ pattern: /^@\/ui\//, why: 'core must not depend on the UI layer' },
	{ pattern: /^@\/service\//, why: 'core must not depend on service layer' },
	{ pattern: /^zustand(\/.*)?$/, why: 'core must not depend on zustand' },
	{ pattern: /^react(\/.*)?$/, why: 'core must not depend on React' },
	{ pattern: /^better-sqlite3$/, why: 'core must not depend on sqlite' },
];

function importsOf(src: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src)) !== null) out.push(m[1]!);
	return out;
}

console.log('debug-trace-recorder: boundary scan');
for (const f of CORE_FILES) {
	const src = fs.readFileSync(path.join(CORE_DIR, f), 'utf8');
	for (const imp of importsOf(src)) {
		for (const rule of FORBIDDEN) {
			assert.ok(
				!rule.pattern.test(imp),
				`${f}: illegal import '${imp}' — ${rule.why}`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// types.ts must be side-effect free
// ---------------------------------------------------------------------------

const typesSrc = fs.readFileSync(path.join(CORE_DIR, 'types.ts'), 'utf8');
assert.ok(!/\bclass\s+\w/.test(typesSrc), 'types.ts must not declare classes');
assert.ok(
	!/\bfunction\s+\w/.test(typesSrc),
	'types.ts must not declare functions',
);

// ---------------------------------------------------------------------------
// off mode: startRun returns a no-op handle, listRecent empty
// ---------------------------------------------------------------------------

console.log('debug-trace-recorder: off mode');
{
	const rec = new DebugTraceRecorder({ mode: 'off' });
	assert.strictEqual(rec.isEnabled(), false);
	const run = rec.startRun({ surface: 'chat' });
	assert.strictEqual(run.runId, 'noop');
	run.startSpan({ kind: 'model.call', name: 'test' }).finish();
	run.finish('completed');
	assert.deepStrictEqual(rec.listRecent(), []);
}

// ---------------------------------------------------------------------------
// redacted mode: spans capture excerpt+hash, raw dropped, retention enforced
// ---------------------------------------------------------------------------

console.log('debug-trace-recorder: redacted mode + retention');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeFakeClock(),
		idFactory: makeFakeIds(),
		retention: 2,
	});
	for (let i = 0; i < 5; i += 1) {
		const run = rec.startRun({ surface: 'search', capabilityId: 'search.query' });
		const span = run.startSpan({ kind: 'retrieval.recall', name: 'vector' });
		span.setInput({ raw: `query ${i}` });
		span.setOutput({ raw: `docs ${i}` });
		span.setParams({ topK: 10 });
		span.addMetric('hits', i);
		span.addDecision({ decision: 'keep', reason: 'top-k', target: `doc-${i}` });
		span.finish();
		run.finish('completed');
	}
	const list = rec.listRecent();
	assert.strictEqual(list.length, 2, 'retention should cap at 2');
	// Newest first per listRecent contract.
	assert.strictEqual(list[0].spans.length, 1);
	const s = list[0].spans[0];
	assert.strictEqual(s.kind, 'retrieval.recall');
	assert.strictEqual(s.redaction, 'redacted');
	assert.strictEqual(s.input?.raw, undefined, 'raw must be dropped in redacted mode');
	assert.ok(s.input?.excerpt.length > 0);
	assert.ok(s.input?.contentHash.startsWith('h'));
	assert.strictEqual(s.metrics?.hits, 4);
	assert.strictEqual(s.decisions?.[0].decision, 'keep');
}

// ---------------------------------------------------------------------------
// raw mode: raw kept but secrets scrubbed
// ---------------------------------------------------------------------------

console.log('debug-trace-recorder: raw mode');
{
	const rec = new DebugTraceRecorder({
		mode: 'raw',
		clock: makeFakeClock(),
		idFactory: makeFakeIds(),
	});
	const run = rec.startRun({ surface: 'chat' });
	const span = run.startSpan({ kind: 'model.call', name: 'anthropic' });
	span.setInput({ raw: 'Authorization: Bearer abcdef1234567890qwerty please summarise' });
	span.finish();
	const finished = run.finish('completed');
	const captured = finished.spans[0].input!;
	assert.ok(captured.raw, 'raw mode should keep raw payload');
	assert.ok(!captured.raw!.includes('abcdef1234567890qwerty'), 'bearer token must be scrubbed');
	assert.ok(captured.raw!.includes('[REDACTED-'), 'redaction tag should appear in raw');
	assert.ok((captured.redactionHits?.length ?? 0) > 0);
}

// ---------------------------------------------------------------------------
// child spans + summary + status
// ---------------------------------------------------------------------------

console.log('debug-trace-recorder: child spans + summary');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeFakeClock(),
		idFactory: makeFakeIds(),
	});
	const run = rec.startRun({ surface: 'agent', capabilityId: 'harness.agent.loop' });
	const step = run.startSpan({ kind: 'model.call', name: 'step-0' });
	const tool = step.child({ kind: 'tool.call', name: 'read_file' });
	tool.setParams({ toolCallId: 'tc-1' });
	tool.finish();
	step.finish();
	run.mergeSummary({ finalTier: 'quick' });
	const finished = run.finish('completed', { tokens: 123 });

	assert.strictEqual(finished.spans.length, 2);
	const toolSpan = finished.spans.find((s) => s.kind === 'tool.call');
	assert.ok(toolSpan);
	assert.strictEqual(toolSpan!.parentSpanId, step.spanId);
	assert.strictEqual(finished.status, 'completed');
	assert.strictEqual(finished.summary?.tokens, 123);
	assert.strictEqual(finished.summary?.finalTier, 'quick');
}

// ---------------------------------------------------------------------------
// provider call lifecycle: visible before send, streaming, terminal + errors
// ---------------------------------------------------------------------------

console.log('debug-trace-recorder: provider call lifecycle');
{
	const logs: unknown[][] = [];
	const rec = new DebugTraceRecorder({
		mode: 'raw',
		clock: makeFakeClock(),
		idFactory: makeFakeIds('call'),
		logger: {
			info: (...args: unknown[]) => { logs.push(args); },
			error: (...args: unknown[]) => { logs.push(args); },
		},
	});
	let notifications = 0;
	const unsubscribe = rec.subscribe(() => { notifications += 1; });
	rec.setMode('redacted');
	assert.strictEqual(notifications, 1, 'mode changes must immediately refresh diagnostics UI');
	rec.setMode('raw');
	const call = rec.startModelCall({
		surface: 'agent',
		capabilityId: 'index.summary',
		operation: 'object.generate',
		providerId: 'lmstudio',
		modelId: 'gemma-local',
		request: { raw: JSON.stringify({ prompt: 'summarize', apiKey: 'sk-12345678901234567890' }) },
	});
	assert.strictEqual(rec.listModelCalls()[0]?.phase, 'request');
	assert.strictEqual(rec.listModelCalls()[0]?.request.raw?.includes('sk-123'), false);
	call.replaceRequest({ raw: JSON.stringify({ wire: true, authorization: 'Bearer 12345678901234567890' }) });
	call.updateStream({
		response: { raw: '{"summary":"partial' },
		reasoning: { raw: 'provider reasoning delta' },
	});
	assert.strictEqual(rec.listModelCalls()[0]?.phase, 'streaming');
	assert.strictEqual(rec.listModelCalls()[0]?.reasoning?.raw, 'provider reasoning delta');
	const finished = call.succeed({
		response: { raw: '{"summary":"done"}' },
		finishReason: 'stop',
		metrics: { inputTokens: 12, outputTokens: 3 },
	});
	assert.strictEqual(finished.phase, 'response');
	assert.strictEqual(finished.metrics?.outputTokens, 3);
	assert.ok(notifications >= 4);
	assert.strictEqual(logs.length, 2, 'request and terminal states should log');
	unsubscribe();

	const failed = rec.startModelCall({
		surface: 'agent',
		capabilityId: 'index.tags',
		operation: 'object.generate',
		providerId: 'lmstudio',
		modelId: 'gemma-local',
		request: { raw: '{}' },
	});
	failed.fail(new Error('LLM returned empty response'));
	assert.strictEqual(rec.listModelCalls()[0]?.phase, 'failed');
	assert.strictEqual(rec.listModelCalls()[0]?.error?.message, 'LLM returned empty response');
}

console.log('debug-trace-recorder: call privacy mode is stable for its lifetime');
{
	const rec = new DebugTraceRecorder({ mode: 'redacted', logger: { info: () => {}, error: () => {} } });
	const call = rec.startModelCall({
		surface: 'agent',
		capabilityId: 'privacy.mode-stability',
		operation: 'text.stream',
		providerId: 'local',
		modelId: 'model',
		request: { raw: 'request body' },
	});
	rec.setMode('raw');
	const finished = call.succeed({ response: { raw: 'response body' } });
	assert.strictEqual(finished.redaction, 'redacted');
	assert.strictEqual(finished.request.raw, undefined);
	assert.strictEqual(finished.response?.raw, undefined);
	assert.deepStrictEqual(rec.listModelCalls(), [], 'a call from the previous privacy mode must not reappear');
}

console.log('debug-trace-recorder: OK');
