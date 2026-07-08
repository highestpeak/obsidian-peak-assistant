// Coverage for the P21-P24 depth pass:
//   - Search: PPR span + per-signal boost meta + already-linked decision + type filter
//   - Ambient: serendipity span
//   - Analyze: per-section tool_use children

import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import type { SearchResultItem } from '@/core/search/searchTypes';
import {
	recordRankingBoosts,
	recordAlreadyLinkedDecisions,
	recordPprRerank,
	recordRetrieverFilterSettings,
	type BoostSignalContext,
} from '@/service/search/debugTraceAdapter';
import { recordAmbientSerendipity } from '@/service/ambient/debugTraceAdapter';
import { recordAnalysisSectionGeneration } from '@/service/agents/report/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

function item(path: string, score: number): SearchResultItem {
	return {
		id: path,
		type: 'markdown',
		title: path,
		path,
		lastModified: 0,
		score,
	};
}

console.log('debug-trace-deep: boost span carries per-signal meta');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	const before = [item('a.md', 0.5), item('b.md', 0.4)];
	const after = [item('a.md', 0.7), item('b.md', 0.4)];
	const signals = new Map<string, BoostSignalContext>([
		['a.md', { clicked: true, relatedToCurrent: true, openCount: 3, lastOpenTs: 123 }],
		['b.md', { hub: true }],
	]);
	recordRankingBoosts(
		run,
		{
			items: before,
			afterItems: after,
			pprActive: true,
			clickedPathCount: 1,
			relatedPathCount: 1,
			signalsByPath: signals,
		},
	);
	const finished = run.finish('completed');
	const boostSpan = finished.spans.find((s) => s.kind === 'ranking.score' && s.name === 'boosts')!;
	const aDecision = boostSpan.decisions?.find((d) => d.target === 'a.md')!;
	assert.ok(aDecision);
	const meta = aDecision.meta as { signals?: string[]; delta?: number };
	assert.ok(meta.signals?.includes('click-through'));
	assert.ok(meta.signals?.includes('related-to-current'));
	assert.ok(meta.signals?.includes('recency'));
	assert.ok(meta.signals?.some((s) => s.startsWith('open-count:')));
	assert.ok(meta.delta !== undefined && meta.delta > 0);
	const bDecision = boostSpan.decisions?.find((d) => d.target === 'b.md')!;
	assert.ok((bDecision.meta as any).signals?.includes('hub-member'));
}

console.log('debug-trace-deep: already-linked decision is separate');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	const items = [item('linked.md', 0.9), item('unlinked.md', 0.6)];
	const related = new Set<string>(['linked.md']);
	recordAlreadyLinkedDecisions(run, items, related);
	const finished = run.finish('completed');
	const span = finished.spans.find((s) => s.kind === 'filter.decision' && s.name === 'already-linked')!;
	assert.ok(span);
	assert.strictEqual(span.metrics?.relatedPathCount, 1);
	assert.strictEqual(span.metrics?.hitCount, 1);
	assert.strictEqual(span.decisions?.length, 1);
	assert.strictEqual(span.decisions?.[0].decision, 'promote');
	assert.strictEqual(span.decisions?.[0].target, 'linked.md');
}

console.log('debug-trace-deep: already-linked no-op when nothing related');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	recordAlreadyLinkedDecisions(run, [item('a.md', 0.5)], new Set());
	const finished = run.finish('completed');
	assert.strictEqual(finished.spans.length, 0);
}

console.log('debug-trace-deep: PPR span records seeds + rank shuffle');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	const before = [item('a.md', 0.5), item('b.md', 0.4), item('c.md', 0.3)];
	// After PPR: b promoted, c demoted, a stays
	const after = [item('b.md', 0.6), item('a.md', 0.5), item('c.md', 0.2)];
	recordPprRerank(run, {
		seedDocIds: ['doc-123', 'doc-456'],
		before,
		after,
	});
	const finished = run.finish('completed');
	const span = finished.spans.find((s) => s.kind === 'ranking.score' && s.name === 'ppr')!;
	assert.ok(span);
	assert.strictEqual(span.metrics?.seedCount, 2);
	assert.deepStrictEqual(span.params?.seedDocIds, ['doc-123', 'doc-456']);
	const bDecision = span.decisions?.find((d) => d.target === 'b.md')!;
	assert.strictEqual(bDecision.decision, 'promote');
	const aDecision = span.decisions?.find((d) => d.target === 'a.md')!;
	assert.strictEqual(aDecision.decision, 'demote');
}

console.log('debug-trace-deep: retriever filter settings snapshot');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	recordRetrieverFilterSettings(run, {
		includedDocumentTypes: ['markdown', 'pdf'],
	});
	const finished = run.finish('completed');
	const span = finished.spans.find((s) => s.name === 'retriever-settings')!;
	assert.ok(span);
	assert.deepStrictEqual(span.params?.includedDocumentTypes, ['markdown', 'pdf']);
	assert.strictEqual(span.metrics?.typeCount, 2);
}

console.log('debug-trace-deep: retriever filter no-op when empty');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	recordRetrieverFilterSettings(run, { includedDocumentTypes: [] });
	assert.strictEqual(run.finish('completed').spans.length, 0);
}

console.log('debug-trace-deep: ambient serendipity span filters hop=2');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'ambient' });
	recordAmbientSerendipity(run, [
		// serendipity
		{
			filePath: 'notes/serendip-1.md',
			title: 'Bridge',
			score: 0.9,
			signals: [{ type: 'graph_neighbor', hop: 2, via: 'topic:mobius' }],
		},
		// direct neighbor (hop=1) → should NOT be picked up
		{
			filePath: 'notes/direct.md',
			title: 'Direct',
			score: 0.8,
			signals: [{ type: 'graph_neighbor', hop: 1 }],
		},
		// semantic only → skip
		{
			filePath: 'notes/sem.md',
			title: 'Sem',
			score: 0.7,
			signals: [{ type: 'text_overlap' }],
		},
	]);
	const finished = run.finish('completed');
	const span = finished.spans.find((s) => s.name === 'serendipity')!;
	assert.ok(span);
	assert.strictEqual(span.metrics?.hits, 1);
	assert.strictEqual(span.decisions?.length, 1);
	assert.strictEqual(span.decisions?.[0].target, 'notes/serendip-1.md');
	assert.strictEqual((span.decisions?.[0].meta as any).bridge, 'topic:mobius');
}

console.log('debug-trace-deep: analyze section tool_use children');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'analyze' });
	recordAnalysisSectionGeneration(run, {
		sectionId: 's1',
		sectionTitle: 'Overview',
		provider: 'anthropic',
		model: 'sonnet',
		promptExcerpt: 'section prompt',
		responseExcerpt: 'section response',
		toolUses: [
			{
				toolName: 'read_file',
				toolCallId: 'tc-1',
				inputExcerpt: '{"path":"a.md"}',
				outputExcerpt: 'content of a.md',
				ok: true,
			},
			{
				toolName: 'search_vault',
				toolCallId: 'tc-2',
				inputExcerpt: '{"query":"mobius"}',
				ok: false,
			},
		],
	});
	const finished = run.finish('completed');
	const section = finished.spans.find((s) => s.kind === 'model.call')!;
	assert.ok(section);
	const toolChildren = finished.spans.filter(
		(s) => s.kind === 'tool.call' && s.parentSpanId === section.spanId,
	);
	assert.strictEqual(toolChildren.length, 2);
	const readFile = toolChildren.find((s) => s.name === 'read_file')!;
	assert.strictEqual(readFile.params?.ok, true);
	assert.strictEqual(readFile.output?.excerpt, 'content of a.md');
	const searchVault = toolChildren.find((s) => s.name === 'search_vault')!;
	assert.strictEqual(searchVault.params?.ok, false);
}

console.log('debug-trace-deep: OK');
