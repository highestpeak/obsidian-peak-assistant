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
	recordRetrievalRecall,
	recordRrfMerge,
	recordRankingBoosts,
	recordLlmRerank,
	recordExcludeFilter,
	finalizeSearchSummary,
} from '@/service/search/debugTraceAdapter';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

function retriever(name: string, entries: Array<[string, number]>): RetrieverResult[] {
	return entries.map(([path, score]) => ({
		path,
		title: path.split('/').pop() ?? path,
		score,
		matchType: 'exact',
		source: name,
	}));
}

console.log('debug-trace-search-adapter: full pipeline receipt');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
		retention: 5,
	});
	const debugRun = rec.startRun({ surface: 'search', capabilityId: 'search.query' });

	const vector = retriever('vector', [
		['notes/a.md', 0.90],
		['notes/b.md', 0.60],
		['notes/c.md', 0.40],
	]);
	const fts = retriever('fts', [
		['notes/b.md', 0.75],
		['notes/d.md', 0.55],
	]);
	const retrieverResults = new Map<string, RetrieverResult[]>([
		['vector', vector],
		['fts', fts],
	]);

	recordRetrievalRecall(debugRun, 'vector', vector);
	recordRetrievalRecall(debugRun, 'fts', fts);

	const merged: MergedResult[] = [
		{
			path: 'notes/b.md',
			rrfScore: 0.02,
			best: fts[0],
			sources: new Set(['vector', 'fts']),
		},
		{
			path: 'notes/a.md',
			rrfScore: 0.017,
			best: vector[0],
			sources: new Set(['vector']),
		},
		{
			path: 'notes/d.md',
			rrfScore: 0.008,
			best: fts[1],
			sources: new Set(['fts']),
		},
	];
	recordRrfMerge(debugRun, { vector: 0.6, fts: 0.4 }, retrieverResults, merged);

	const items: SearchResultItem[] = merged.map((m) => ({
		id: m.path,
		type: 'markdown',
		title: m.path,
		path: m.path,
		lastModified: 0,
		score: m.rrfScore,
	}));
	const boosted: SearchResultItem[] = items.map((i) => ({ ...i, score: (i.score ?? 0) + 0.05 }));
	recordRankingBoosts(debugRun, {
		items,
		afterItems: boosted,
		pprActive: false,
		clickedPathCount: 0,
		relatedPathCount: 0,
	});

	const reranked: SearchResultItem[] = [boosted[1], boosted[0], boosted[2]];
	recordLlmRerank(debugRun, {
		before: boosted,
		after: reranked,
		provider: 'anthropic',
		model: 'haiku-4-5',
	});

	const afterExclude = reranked.slice(0, 2);
	recordExcludeFilter(debugRun, reranked, afterExclude, ['spam']);

	finalizeSearchSummary(debugRun, {
		query: 'raw query',
		effectiveQuery: 'raw query AND syntax',
		topK: 20,
		finalCount: afterExclude.length,
		llmRerank: true,
		durationMs: 42,
	});

	const finished = debugRun.finish('completed');

	// Assertions on the shape of the receipt.
	const recallSpans = finished.spans.filter((s) => s.kind === 'retrieval.recall');
	assert.strictEqual(recallSpans.length, 2);
	const vectorSpan = recallSpans.find((s) => s.name === 'vector')!;
	assert.strictEqual(vectorSpan.metrics?.hits, 3);
	assert.ok(vectorSpan.metrics?.maxScore === 0.90);

	const mergeSpan = finished.spans.find((s) => s.kind === 'retrieval.merge')!;
	assert.ok(mergeSpan);
	assert.strictEqual(mergeSpan.metrics?.mergedCandidates, 3);
	// notes/b.md has both vector + fts sources
	const bDecision = mergeSpan.decisions?.find((d) => d.target === 'notes/b.md')!;
	assert.ok(bDecision, 'merge span must include notes/b.md decision');
	const perSource = (bDecision.meta as any).perSource as Record<
		string,
		{ rank: number; weight: number }
	>;
	assert.strictEqual(perSource.vector.rank, 2);
	assert.strictEqual(perSource.fts.rank, 1);
	assert.strictEqual(perSource.vector.weight, 0.6);

	const boostSpan = finished.spans.find(
		(s) => s.kind === 'ranking.score' && s.name === 'boosts',
	)!;
	assert.ok(boostSpan);
	const boostDecision = boostSpan.decisions?.[0];
	assert.ok(boostDecision?.meta);
	assert.strictEqual((boostDecision!.meta as any).delta, 0.05);

	const rerankSpan = finished.spans.find(
		(s) => s.kind === 'ranking.score' && s.name === 'llm-rerank',
	)!;
	assert.ok(rerankSpan);
	// notes/a.md was rank 1 (index 1) before rerank, now rank 0 → promote
	const aRerankDecision = rerankSpan.decisions?.find((d) => d.target === 'notes/a.md')!;
	assert.strictEqual(aRerankDecision.decision, 'promote');
	assert.strictEqual((aRerankDecision.meta as any).rankBefore, 1);
	assert.strictEqual((aRerankDecision.meta as any).rankAfter, 0);

	const filterSpan = finished.spans.find((s) => s.kind === 'filter.decision')!;
	assert.ok(filterSpan);
	assert.strictEqual(filterSpan.metrics?.droppedCount, 1);
	assert.strictEqual(filterSpan.decisions?.[0].target, 'notes/d.md');
	assert.strictEqual(filterSpan.decisions?.[0].reason, 'exclude-filter');

	assert.strictEqual(finished.summary?.query, 'raw query');
	assert.strictEqual(finished.summary?.effectiveQuery, 'raw query AND syntax');
	assert.strictEqual(finished.summary?.llmRerank, true);
}

console.log('debug-trace-search-adapter: empty retriever result is fine');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'search' });
	recordRetrievalRecall(run, 'graph', []);
	const finished = run.finish('completed');
	const span = finished.spans[0];
	assert.strictEqual(span.metrics?.hits, 0);
	assert.strictEqual(span.metrics?.minScore, undefined);
}

console.log('debug-trace-search-adapter: OK');
