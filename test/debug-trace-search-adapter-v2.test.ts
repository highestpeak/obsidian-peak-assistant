// Follow-up coverage for the second wave of search debug spans:
//   - dedup metric on the RRF merge span
//   - topK cutoff filter.decision span
// The original debug-trace-search-adapter test covers the primary path.

import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import type { RetrieverResult } from '@/service/search/retriever/types';
import type { MergedResult } from '@/service/search/merger/rrf-merger';
import type { SearchResultItem } from '@/core/search/searchTypes';
import {
	recordRrfMerge,
	recordTopKCutoff,
} from '@/service/search/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

function retrieverResult(name: string, entries: Array<[string, number]>): RetrieverResult[] {
	return entries.map(([path, score]) => ({
		path,
		title: path,
		score,
		matchType: 'exact',
		source: name,
	}));
}

console.log('debug-trace-search-v2: RRF merge span exposes dedup metric');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });

	// 3 vector + 3 fts, but 2 paths overlap → 4 unique.
	const vector = retrieverResult('vector', [
		['notes/a.md', 0.9],
		['notes/b.md', 0.6],
		['notes/c.md', 0.4],
	]);
	const fts = retrieverResult('fts', [
		['notes/a.md', 0.7],
		['notes/b.md', 0.5],
		['notes/d.md', 0.3],
	]);
	const retrieverResults = new Map<string, RetrieverResult[]>([
		['vector', vector],
		['fts', fts],
	]);
	const merged: MergedResult[] = [
		{ path: 'notes/a.md', rrfScore: 0.03, best: vector[0], sources: new Set(['vector', 'fts']) },
		{ path: 'notes/b.md', rrfScore: 0.02, best: vector[1], sources: new Set(['vector', 'fts']) },
		{ path: 'notes/c.md', rrfScore: 0.01, best: vector[2], sources: new Set(['vector']) },
		{ path: 'notes/d.md', rrfScore: 0.008, best: fts[2], sources: new Set(['fts']) },
	];
	recordRrfMerge(run, { vector: 0.6, fts: 0.4 }, retrieverResults, merged);
	const finished = run.finish('completed');

	const mergeSpan = finished.spans.find((s) => s.kind === 'retrieval.merge')!;
	assert.strictEqual(mergeSpan.metrics?.rawCandidates, 6);
	assert.strictEqual(mergeSpan.metrics?.mergedCandidates, 4);
	assert.strictEqual(mergeSpan.metrics?.dedupDropped, 2);
}

console.log('debug-trace-search-v2: topK cutoff records dropped tail as filter.decision');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });

	const before: SearchResultItem[] = Array.from({ length: 8 }, (_, i) => ({
		id: `notes/${i}.md`,
		type: 'markdown',
		title: `Note ${i}`,
		path: `notes/${i}.md`,
		lastModified: 0,
		score: 1 - i * 0.1,
	}));
	const after = before.slice(0, 5);

	recordTopKCutoff(run, before, after, 5);
	const finished = run.finish('completed');

	const cutoff = finished.spans.find(
		(s) => s.kind === 'filter.decision' && s.name === 'topk-cutoff',
	)!;
	assert.ok(cutoff, 'topk-cutoff span should exist');
	assert.strictEqual(cutoff.params?.topK, 5);
	assert.strictEqual(cutoff.metrics?.droppedCount, 3);
	assert.strictEqual(cutoff.decisions?.length, 3);
	assert.strictEqual(cutoff.decisions?.[0].target, 'notes/5.md');
	assert.strictEqual(cutoff.decisions?.[0].reason, 'topk-cutoff');
}

console.log('debug-trace-search-v2: topK cutoff no-op when nothing dropped');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	const items: SearchResultItem[] = [
		{
			id: 'notes/a.md',
			type: 'markdown',
			title: 'a',
			path: 'notes/a.md',
			lastModified: 0,
			score: 0.9,
		},
	];
	recordTopKCutoff(run, items, items, 10);
	const finished = run.finish('completed');
	assert.strictEqual(finished.spans.length, 0, 'no span when nothing dropped');
}

console.log('debug-trace-search-v2: OK');
