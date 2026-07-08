import assert from 'assert';
import {
	DebugTraceRecorder,
	formatDebugRun,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

console.log('debug-trace-formatter: markdown basic layout');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({
		surface: 'search',
		capabilityId: 'search.query',
		summary: { query: 'hello world', topK: 10 },
	});
	const recall = run.startSpan({ kind: 'retrieval.recall', name: 'vector' });
	recall.setParams({ topK: 10 });
	recall.setOutput({ raw: 'doc1\ndoc2\ndoc3', contentType: 'text/plain' });
	recall.addMetric('hits', 3);
	recall.finish();

	const merge = run.startSpan({ kind: 'retrieval.merge', name: 'rrf' });
	merge.addDecision({ decision: 'promote', target: 'doc-1', reason: 'top of fused list', score: 0.87 });
	merge.addDecision({ decision: 'drop', target: 'doc-9', reason: 'below cutoff', score: 0.02 });
	merge.finish();

	const finished = run.finish('completed');

	const { markdown } = formatDebugRun(finished, {
		format: 'markdown',
		includeRawIfAvailable: false,
	});

	assert.ok(markdown);
	// Header
	assert.ok(markdown.includes('# Debug receipt — search · search.query'));
	assert.ok(markdown.includes('- mode: redacted'));
	// Summary block
	assert.ok(markdown.includes('## Summary'));
	assert.ok(markdown.includes('query: "hello world"'));
	assert.ok(markdown.includes('topK: 10'));
	// Spans
	assert.ok(markdown.includes('### 1. retrieval.recall — vector'));
	assert.ok(markdown.includes('### 2. retrieval.merge — rrf'));
	assert.ok(markdown.includes('**promote**'));
	assert.ok(markdown.includes('**drop**'));
	// Redacted mode must NOT include raw fence
	assert.ok(!markdown.includes('```\ndoc1'), 'redacted mode should not render raw');
	// FULL LOCAL banner absent
	assert.ok(!markdown.includes('MODE: FULL LOCAL'));
}

console.log('debug-trace-formatter: raw mode banner + raw fence');
{
	const rec = new DebugTraceRecorder({
		mode: 'raw',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'chat', capabilityId: 'chat.conversation.run' });
	const span = run.startSpan({ kind: 'model.call', name: 'anthropic' });
	span.setInput({ raw: 'summarise this note' });
	span.finish();
	const finished = run.finish('completed');
	const { markdown } = formatDebugRun(finished, {
		format: 'markdown',
		includeRawIfAvailable: true,
	});
	assert.ok(markdown);
	assert.ok(markdown.includes('MODE: FULL LOCAL'));
	assert.ok(markdown.includes('input.raw:'));
	assert.ok(markdown.includes('summarise this note'));
}

console.log('debug-trace-formatter: redaction footer counts hits');
{
	const rec = new DebugTraceRecorder({
		mode: 'raw',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'chat' });
	const s = run.startSpan({ kind: 'tool.call', name: 'call' });
	s.setInput({ raw: 'sk-abcdefghij1234567890 and sk-abcdefghij0987654321' });
	s.finish();
	const finished = run.finish('completed');
	const { markdown } = formatDebugRun(finished, {
		format: 'markdown',
		includeRawIfAvailable: false,
	});
	assert.ok(markdown);
	assert.ok(markdown.includes('redaction hits: 2'));
	assert.ok(markdown.includes('## Redaction'));
	assert.ok(markdown.includes('pattern `openai-key`'));
}

console.log('debug-trace-formatter: both format has JSON appendix');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'chat' });
	run.startSpan({ kind: 'model.call', name: 'x' }).finish();
	const finished = run.finish('completed');
	const out = formatDebugRun(finished, {
		format: 'both',
		includeRawIfAvailable: false,
	});
	assert.ok(out.markdown && out.json);
	assert.ok(out.markdown.includes('<details><summary>JSON appendix</summary>'));
	const parsed = JSON.parse(out.json);
	assert.strictEqual(parsed.surface, 'chat');
	assert.strictEqual(parsed.status, 'completed');
	assert.strictEqual(parsed.version, 1);
}

console.log('debug-trace-formatter: OK');
