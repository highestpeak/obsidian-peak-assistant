import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import {
	recordAmbientTrigger,
	recordAmbientCandidates,
	recordAmbientFilterDrops,
	finalizeAmbientRun,
} from '@/service/ambient/debugTraceAdapter';
import {
	recordAnalysisPlan,
	recordAnalysisSectionGeneration,
	recordAnalysisArtifact,
	recordAnalysisSkip,
} from '@/service/agents/report/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

console.log('debug-trace: ambient push receipt');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'ambient' });
	recordAmbientTrigger(run, {
		filePath: 'notes/foo.md',
		triggerType: 'edit',
		paragraph: 'The current thinking about ambient computing...',
	});
	recordAmbientCandidates(run, [
		{ filePath: 'notes/related-1.md', title: 'Related 1', score: 0.9, source: 'semantic' },
		{ filePath: 'notes/related-2.md', title: 'Related 2', score: 0.6, source: 'graph_neighbor' },
		{ filePath: 'notes/related-3.md', title: 'Related 3', score: 0.4, source: 'shared_tag' },
	]);
	recordAmbientFilterDrops(run, [
		{ target: 'notes/related-3.md', reason: 'already-linked' },
	]);
	finalizeAmbientRun(run, {
		chosen: ['notes/related-1.md', 'notes/related-2.md'],
	});
	const finished = run.finish('completed');

	const trigger = finished.spans.find((s) => s.kind === 'trigger.fire')!;
	assert.strictEqual(trigger.params?.filePath, 'notes/foo.md');
	assert.strictEqual(trigger.params?.triggerType, 'edit');
	assert.ok(trigger.input?.excerpt.length > 0);

	const recall = finished.spans.find((s) => s.kind === 'retrieval.recall')!;
	assert.strictEqual(recall.metrics?.hits, 3);
	assert.strictEqual(recall.metrics?.maxScore, 0.9);

	const filter = finished.spans.find((s) => s.kind === 'filter.decision')!;
	assert.strictEqual(filter.metrics?.droppedCount, 1);
	assert.strictEqual(filter.decisions?.[0].target, 'notes/related-3.md');

	assert.deepStrictEqual(finished.summary?.chosen, [
		'notes/related-1.md',
		'notes/related-2.md',
	]);
}

console.log('debug-trace: ambient skip path');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'ambient' });
	recordAmbientTrigger(run, {
		filePath: 'notes/foo.md',
		triggerType: 'scroll',
		paragraph: 'short',
	});
	finalizeAmbientRun(run, { skipReason: 'paragraph-too-short' });
	const finished = run.finish('completed');
	assert.strictEqual(finished.summary?.skipReason, 'paragraph-too-short');
	assert.strictEqual(finished.summary?.chosen, undefined);
}

console.log('debug-trace: analyze report receipt');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'analyze', capabilityId: 'analysis.report.run' });
	recordAnalysisPlan(run, {
		userQuery: 'summarise my mobius nodes',
		sections: [
			{ id: 'overview', title: 'Overview' },
			{ id: 'themes', title: 'Themes' },
			{ id: 'gaps', title: 'Gaps' },
		],
		evidencePathCount: 12,
	});
	recordAnalysisSectionGeneration(run, {
		sectionId: 'overview',
		sectionTitle: 'Overview',
		provider: 'anthropic',
		model: 'sonnet-4-6',
		promptExcerpt: 'Write an overview of the following notes...',
		responseExcerpt: 'These notes describe mobius nodes and their...',
		tokens: { prompt: 5000, completion: 400, total: 5400 },
		durationMs: 2300,
	});
	recordAnalysisSkip(run, {
		sectionId: 'gaps',
		reason: 'fallback',
		detail: 'model returned empty',
	});
	recordAnalysisArtifact(run, {
		path: 'ChatFolder/A-Analyze/mobius-report.md',
		kind: 'report',
		bytes: 4200,
	});
	const finished = run.finish('completed', { totalSections: 3, generatedSections: 1 });

	const plan = finished.spans.find((s) => s.kind === 'custom' && s.name === 'analysis-plan')!;
	assert.strictEqual(plan.params?.sectionCount, 3);
	assert.strictEqual(plan.params?.evidencePathCount, 12);

	const section = finished.spans.find(
		(s) => s.kind === 'model.call' && s.name === 'section-overview',
	)!;
	assert.strictEqual(section.metrics?.totalTokens, 5400);
	assert.strictEqual(section.metrics?.durationMs, 2300);

	const skip = finished.spans.find((s) => s.kind === 'filter.decision')!;
	assert.strictEqual(skip.decisions?.[0].decision, 'skip');
	assert.strictEqual(skip.decisions?.[0].target, 'gaps');

	const artifact = finished.spans.find((s) => s.kind === 'artifact.write')!;
	assert.strictEqual(artifact.name, 'report');
	assert.strictEqual(artifact.params?.path, 'ChatFolder/A-Analyze/mobius-report.md');

	assert.strictEqual(finished.summary?.generatedSections, 1);
}

console.log('debug-trace-ambient-analyze: OK');
