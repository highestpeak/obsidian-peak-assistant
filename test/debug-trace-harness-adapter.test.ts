import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import { TraceBus } from '@/service/agents/harness/trace/events';
import { attachHarnessDebugTrace } from '@/service/agents/harness/trace/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

console.log('debug-trace-harness-adapter: end-to-end mapping');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const bus = new TraceBus();
	const debugRun = rec.startRun({
		surface: 'agent',
		capabilityId: 'harness.agent.loop',
	});
	const attached = attachHarnessDebugTrace({ bus, debugRun });

	// Emulate a small loop
	bus.emit('loop_start', { loopId: 'loop-1', startedAt: 1_000_000 });
	bus.emit('step_start', {
		loopId: 'loop-1',
		stepIndex: 0,
		tier: 'fast',
		modelId: 'haiku-4-5',
	});
	bus.emit('tool_call', {
		loopId: 'loop-1',
		stepIndex: 0,
		toolName: 'read_file',
		toolCallId: 'tc-1',
		args: { path: 'notes/foo.md' },
	});
	bus.emit('tool_result', {
		loopId: 'loop-1',
		stepIndex: 0,
		toolName: 'read_file',
		toolCallId: 'tc-1',
		ok: true,
		payload: { bytes: 42 },
		durationMs: 5,
	});
	bus.emit('step_finish', {
		loopId: 'loop-1',
		stepIndex: 0,
		tier: 'fast',
		modelId: 'haiku-4-5',
		providerId: 'anthropic',
		promptTokens: 100,
		completionTokens: 40,
		totalTokens: 140,
		toolCalls: [],
		toolResults: [],
		text: 'partial answer',
		finishReason: 'tool_calls',
		durationMs: 20,
	});
	bus.emit('tier_escalate', {
		loopId: 'loop-1',
		from: 'fast',
		to: 'research',
		reason: 'self-score too low',
		auto: true,
	});
	bus.emit('context_compacted', {
		loopId: 'loop-1',
		stepIndex: 1,
		tokensBefore: 5000,
		tokensAfter: 1200,
		droppedBlocks: 3,
		droppedMessages: 8,
		compactSummaries: [],
	});
	bus.emit('loop_finish', {
		loopId: 'loop-1',
		finishReason: 'final_answer',
		durationMs: 120,
	});

	const finished = debugRun.finish('completed');
	attached.detach();

	// Root loop span exists
	const root = finished.spans.find((s) => s.kind === 'custom' && s.name === 'agent-loop-loop-1');
	assert.ok(root, 'loop span should exist');
	assert.strictEqual(root!.params?.finishReason, 'final_answer');
	assert.strictEqual(root!.decisions?.[0].decision, 'promote');
	assert.ok(root!.decisions?.[0].target?.includes('fast→research'));

	// Step span exists as child of loop span
	const step = finished.spans.find((s) => s.kind === 'model.call');
	assert.ok(step);
	assert.strictEqual(step!.parentSpanId, root!.spanId);
	assert.strictEqual(step!.params?.tier, 'fast');
	assert.strictEqual(step!.metrics?.totalTokens, 140);

	// Tool span is a child of the step span
	const tool = finished.spans.find((s) => s.kind === 'tool.call');
	assert.ok(tool);
	assert.strictEqual(tool!.parentSpanId, step!.spanId);
	assert.strictEqual(tool!.name, 'read_file');
	assert.strictEqual(tool!.params?.ok, true);

	// Context compact span exists
	const compact = finished.spans.find((s) => s.kind === 'context.compact');
	assert.ok(compact);
	assert.strictEqual(compact!.metrics?.tokensBefore, 5000);
	assert.strictEqual(compact!.metrics?.tokensAfter, 1200);
	assert.strictEqual(compact!.metrics?.droppedBlocks, 3);
}

console.log('debug-trace-harness-adapter: detach cleans up');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const bus = new TraceBus();
	const run = rec.startRun({ surface: 'agent' });
	const a = attachHarnessDebugTrace({ bus, debugRun: run });
	a.detach();
	// After detach, further emits must not create spans on the run.
	bus.emit('loop_start', { loopId: 'x', startedAt: 0 });
	const snap = run.snapshot();
	// The loop span opened by detach cleanup does exist (the adapter closes what
	// was pending at detach time). The critical guarantee is: no NEW subscriber
	// activity after detach.
	const before = snap.spans.length;
	bus.emit('tool_call', {
		loopId: 'x',
		stepIndex: 0,
		toolName: 't',
		toolCallId: 'tc',
		args: {},
	});
	const after = run.snapshot().spans.length;
	assert.strictEqual(after, before, 'no new spans after detach');
}

console.log('debug-trace-harness-adapter: off mode is a no-op');
{
	const rec = new DebugTraceRecorder({ mode: 'off' });
	const bus = new TraceBus();
	const run = rec.startRun({ surface: 'agent' });
	const a = attachHarnessDebugTrace({ bus, debugRun: run });
	// No throws even when we flood the bus.
	bus.emit('loop_start', { loopId: 'x', startedAt: 0 });
	bus.emit('step_start', {
		loopId: 'x',
		stepIndex: 0,
		tier: 'fast',
		modelId: 'm',
	});
	bus.emit('loop_finish', { loopId: 'x', finishReason: 'ok', durationMs: 1 });
	a.detach();
	assert.deepStrictEqual(rec.listRecent(), []);
}

console.log('debug-trace-harness-adapter: OK');
