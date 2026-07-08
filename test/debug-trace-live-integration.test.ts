import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import { TraceBus } from '@/service/agents/harness/trace/events';
import { attachHarnessDebugTrace } from '@/service/agents/harness/trace/debugTraceAdapter';
import {
	recordAmbientTrigger,
	recordAmbientCandidates,
	recordAmbientDedupContext,
	finalizeAmbientRun,
} from '@/service/ambient/debugTraceAdapter';
import {
	recordAnalysisPlan,
	recordAnalysisSectionGeneration,
	recordAnalysisArtifact,
} from '@/service/agents/report/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(prefix = 'id'): DebugIdFactory {
	let n = 0;
	return { next: () => `${prefix}-${++n}` };
}

console.log('debug-trace-live: harness permission_check → permission.check span');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const bus = new TraceBus();
	const run = rec.startRun({ surface: 'agent' });
	const attached = attachHarnessDebugTrace({ bus, debugRun: run });

	bus.emit('loop_start', { loopId: 'loop-1', startedAt: 1_000_000 });
	bus.emit('step_start', {
		loopId: 'loop-1',
		stepIndex: 0,
		tier: 'local-fast',
		modelId: 'haiku-4-5',
	});
	// Allow event
	bus.emit('permission_check', {
		loopId: 'loop-1',
		stepIndex: 0,
		toolName: 'read_file',
		source: 'permission',
		decision: 'allow',
	});
	// Deny event
	bus.emit('permission_check', {
		loopId: 'loop-1',
		stepIndex: 0,
		toolName: 'delete_file',
		source: 'quarantine',
		decision: 'deny',
		reason: 'not-in-whitelist',
	});
	bus.emit('loop_finish', { loopId: 'loop-1', finishReason: 'ok', durationMs: 10 });

	const finished = run.finish('completed');
	attached.detach();

	const permSpans = finished.spans.filter((s) => s.kind === 'permission.check');
	assert.strictEqual(permSpans.length, 2, 'expected 2 permission.check spans');
	const allowSpan = permSpans.find((s) => s.name === 'read_file');
	const denySpan = permSpans.find((s) => s.name === 'delete_file');
	assert.ok(allowSpan);
	assert.ok(denySpan);
	assert.strictEqual(allowSpan!.decisions?.[0].decision, 'keep');
	assert.strictEqual(denySpan!.decisions?.[0].decision, 'deny');
	assert.strictEqual(denySpan!.decisions?.[0].reason, 'not-in-whitelist');
	assert.strictEqual(denySpan!.params?.source, 'quarantine');
}

console.log('debug-trace-live: ambient dedup context span');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'ambient' });
	recordAmbientTrigger(run, {
		filePath: 'notes/a.md',
		triggerType: 'edit',
		paragraph: 'writing about mobius nodes...',
	});
	recordAmbientDedupContext(run, {
		pushHistoryPaths: ['notes/x.md', 'notes/y.md', 'notes/z.md'],
	});
	recordAmbientCandidates(run, [
		{ filePath: 'notes/b.md', title: 'B', score: 0.9, source: 'semantic' },
	]);
	finalizeAmbientRun(run, { chosen: ['notes/b.md'] });
	const finished = run.finish('completed');

	const dedup = finished.spans.find(
		(s) => s.kind === 'filter.decision' && s.name === 'ambient-dedup-context',
	);
	assert.ok(dedup);
	assert.strictEqual(dedup!.metrics?.pushHistorySize, 3);
	assert.strictEqual(dedup!.decisions?.length, 3);
	assert.strictEqual(dedup!.decisions?.[0].reason, 'in-push-history');
	assert.deepStrictEqual(finished.summary?.chosen, ['notes/b.md']);
}

console.log('debug-trace-live: analyze artifact.write and section skip');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'analyze' });
	recordAnalysisPlan(run, {
		userQuery: 'summarise vault',
		sections: [
			{ id: 's1', title: 'Overview' },
			{ id: 's2', title: 'Detail' },
		],
		evidencePathCount: 5,
	});
	recordAnalysisSectionGeneration(run, {
		sectionId: 's1',
		sectionTitle: 'Overview',
		provider: 'anthropic',
		model: 'sonnet-4-6',
		promptExcerpt: 'Overview prompt',
		responseExcerpt: 'Overview response',
		durationMs: 1200,
	});
	recordAnalysisArtifact(run, {
		path: 'ChatFolder/A-Analyze/vault-summary.md',
		kind: 'report',
		bytes: 2048,
	});
	const finished = run.finish('completed');

	const artifact = finished.spans.find((s) => s.kind === 'artifact.write');
	assert.ok(artifact, 'artifact.write span should exist');
	assert.strictEqual(artifact!.params?.path, 'ChatFolder/A-Analyze/vault-summary.md');
	assert.strictEqual(artifact!.metrics?.bytes, 2048);
	const section = finished.spans.find((s) => s.kind === 'model.call');
	assert.ok(section);
	assert.strictEqual(section!.params?.provider, 'anthropic');
	assert.strictEqual(section!.params?.model, 'sonnet-4-6');
}

console.log('debug-trace-live: OK');
