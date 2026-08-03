// Debug-trace helpers for the search pipeline.
//
// Each function is invoked at a well-known stage boundary in
// `QueryService.textSearch()` (see spec §6.2). The functions are pure over
// their inputs: they don't touch the sqlite store, don't call the model,
// and don't mutate the search results — they only record onto a DebugRun.
//
// Debug is opt-in: callers pass `debugRun: DebugRunHandle | undefined`. When
// the handle is undefined, callers skip the record call entirely, so hot
// paths pay zero cost when debug tracing is off.

import type { DebugRunHandle } from '@/core/debug-trace';
import type { RetrieverResult } from '@/service/search/retriever/types';
import type { SearchResultItem } from '@/core/search/searchTypes';
import type { MergedResult } from '@/service/search/merger/rrf-merger';
import type { RankingBoostBreakdown } from '@/service/search/query/rankingBoosts';

/** Record the output of a single retriever. */
export function recordRetrievalRecall(
	debugRun: DebugRunHandle,
	retrieverName: string,
	results: readonly RetrieverResult[],
): void {
	const span = debugRun.startSpan({
		kind: 'retrieval.recall',
		name: retrieverName,
	});
	span.setParams({ source: retrieverName });
	span.addMetric('hits', results.length);
	if (results.length > 0) {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const r of results) {
			if (r.score < min) min = r.score;
			if (r.score > max) max = r.score;
		}
		span.addMetric('minScore', min);
		span.addMetric('maxScore', max);
		const preview = results
			.slice(0, 3)
			.map((r) => r.title ?? r.path)
			.join(' | ');
		span.setOutput({ raw: preview });
	} else {
		span.setOutput({ raw: '' });
	}
	span.finish();
}

/**
 * Record the fusion stage. Emits per-doc source contributions for the top-N
 * merged results as `decisions` so a reader can see "doc X came 30% from
 * vector, 70% from fts".
 */
export function recordRrfMerge(
	debugRun: DebugRunHandle,
	weights: Record<string, number>,
	retrieverResults: Map<string, RetrieverResult[]>,
	merged: readonly MergedResult[],
	previewTopN = 10,
): void {
	const span = debugRun.startSpan({
		kind: 'retrieval.merge',
		name: 'rrf',
	});
	span.setParams({ weights });
	let rawCandidateCount = 0;
	for (const results of retrieverResults.values()) rawCandidateCount += results.length;
	span.addMetric('rawCandidates', rawCandidateCount);
	span.addMetric('mergedCandidates', merged.length);
	span.addMetric('dedupDropped', Math.max(0, rawCandidateCount - merged.length));
	span.addMetric('retrieverCount', retrieverResults.size);

	// Precompute per-source rank position for each path so we can approximate
	// the exact RRF contribution shape (rank + weight) without recomputing
	// rrfMerge internals.
	const positionByPath = new Map<string, Map<string, number>>();
	for (const [name, results] of retrieverResults) {
		for (let i = 0; i < results.length; i += 1) {
			const path = results[i]!.path;
			let m = positionByPath.get(path);
			if (!m) {
				m = new Map();
				positionByPath.set(path, m);
			}
			m.set(name, i + 1);
		}
	}

	const previewSlice = merged.slice(0, previewTopN);
	for (const m of previewSlice) {
		const sourcePositions = positionByPath.get(m.path) ?? new Map();
		const meta: Record<string, unknown> = {
			sources: [...m.sources].sort(),
		};
		const perSource: Record<string, { rank: number; weight: number }> = {};
		for (const src of m.sources) {
			perSource[src] = {
				rank: sourcePositions.get(src) ?? -1,
				weight: weights[src] ?? 0.5,
			};
		}
		meta.perSource = perSource;
		span.addDecision({
			decision: 'keep',
			target: m.path,
			reason: 'rrf-fused',
			score: m.rrfScore,
			meta,
		});
	}
	span.finish();
}

/**
 * Signals contributed by the boost stage. The reranker composes a handful of
 * heuristics (recency, click-through, hub, graph, related-to-current). We
 * cannot inspect the exact delta each signal applied without instrumenting the
 * reranker; instead, callers pass a `signalsSnapshot` capturing which signals
 * were active for each preview doc so a reader sees WHICH heuristics could
 * have contributed even if the exact per-signal number is opaque.
 */
export interface BoostSignalContext {
	readonly openCount?: number;
	readonly lastOpenTs?: number;
	readonly clicked?: boolean;
	readonly relatedToCurrent?: boolean;
	readonly hub?: boolean;
	readonly pprSeeded?: boolean;
}

/**
 * Round a number to 4 decimal places for compact trace output. Debug traces
 * are meant to be human-scannable — 12-digit floats hurt readability.
 */
function round4(n: number): number {
	return Math.round(n * 10000) / 10000;
}

/** Record the boost stage (frequency / recency / graph / hub / click-through).
 *
 * When `breakdownByPath` is provided (the debug/opt-in path in `queryService`),
 * each preview decision includes the absolute contribution of every individual
 * boost — title / folder / content hit ratios plus each additive boost value —
 * so a reader can see EXACTLY why a doc scored what it did instead of guessing.
 * This is the "diagnostic layer" from the 2026-07-07 ranking research doc.
 */
export function recordRankingBoosts(
	debugRun: DebugRunHandle,
	input: {
		items: readonly SearchResultItem[];
		afterItems: readonly SearchResultItem[];
		pprActive: boolean;
		clickedPathCount: number;
		relatedPathCount: number;
		/** Optional per-path signal snapshot for preview items. */
		signalsByPath?: ReadonlyMap<string, BoostSignalContext>;
		/** Optional per-path boost breakdown (title/folder/content/etc contributions). */
		breakdownByPath?: ReadonlyMap<string, RankingBoostBreakdown>;
	},
	previewTopN = 10,
): void {
	const span = debugRun.startSpan({
		kind: 'ranking.score',
		name: 'boosts',
	});
	span.setParams({
		pprActive: input.pprActive,
		clickedPaths: input.clickedPathCount,
		relatedPaths: input.relatedPathCount,
	});
	span.addMetric('inputCount', input.items.length);
	span.addMetric('outputCount', input.afterItems.length);
	// Map path→scoreBefore so we can render per-doc delta.
	const before = new Map<string, number>();
	for (const it of input.items) before.set(it.path, it.score ?? 0);
	const preview = input.afterItems.slice(0, previewTopN);
	for (const item of preview) {
		const b = before.get(item.path);
		const s = item.score ?? 0;
		const sig = input.signalsByPath?.get(item.path);
		const bd = input.breakdownByPath?.get(item.path);
		const meta: Record<string, unknown> = {};
		if (b !== undefined && b !== s) {
			meta.scoreBefore = b;
			meta.delta = s - b;
		}
		if (sig) {
			// Emit only the signals that actually fired for readability.
			const active: string[] = [];
			if (sig.clicked) active.push('click-through');
			if (sig.relatedToCurrent) active.push('related-to-current');
			if (sig.hub) active.push('hub-member');
			if (sig.pprSeeded) active.push('ppr-seeded');
			if (sig.openCount !== undefined && sig.openCount > 0) {
				active.push(`open-count:${sig.openCount}`);
			}
			if (sig.lastOpenTs !== undefined && sig.lastOpenTs > 0) {
				active.push('recency');
			}
			if (active.length > 0) meta.signals = active;
		}
		if (bd) {
			meta.hitRatios = {
				title: round4(bd.titleHitRatio),
				folder: round4(bd.folderHitRatio),
				content: round4(bd.contentHitRatio),
			};
			// Emit only non-zero contributions. Keeps traces skimmable when
			// most of the boost formula didn't fire for this doc.
			const contributions: Record<string, number> = {};
			const add = (k: string, v: number): void => {
				if (v !== 0) contributions[k] = round4(v);
			};
			add('title', bd.titleBoost);
			add('folder', bd.folderBoost);
			add('content', bd.contentBoost);
			add('freq', bd.freqBoost);
			add('recency', bd.recencyBoost);
			add('graph', bd.graphBoost);
			add('anchor', bd.anchorBoost);
			add('click', bd.clickBoost);
			add('hubDoc', bd.hubDocBoost);
			meta.contributions = contributions;
			meta.base = round4(bd.base);
			meta.finalScore = round4(bd.finalScore);
		}
		span.addDecision({
			decision: 'keep',
			target: item.path,
			reason: 'boost-applied',
			score: s,
			meta: Object.keys(meta).length > 0 ? meta : undefined,
		});
	}
	span.finish();
}

/**
 * Record the "already-linked to current file" filter/boost decision. Search
 * treats already-linked docs as a signal but doesn't drop them; the debug
 * receipt calls it out separately so users can see WHICH results were
 * influenced by the current-file-neighbourhood set.
 */
export function recordAlreadyLinkedDecisions(
	debugRun: DebugRunHandle,
	items: readonly SearchResultItem[],
	relatedPaths: ReadonlySet<string>,
	previewTopN = 20,
): void {
	if (relatedPaths.size === 0) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'already-linked',
	});
	span.addMetric('relatedPathCount', relatedPaths.size);
	let hitCount = 0;
	for (const item of items.slice(0, previewTopN)) {
		if (!relatedPaths.has(item.path)) continue;
		hitCount += 1;
		span.addDecision({
			decision: 'promote',
			target: item.path,
			reason: 'already-linked-to-current',
		});
	}
	span.addMetric('hitCount', hitCount);
	span.finish();
}

/**
 * Record the PPR (Personalized PageRank) graph-reranking stage. Fires only
 * when PPR is enabled AND actually changed the ranking (pprActive === true).
 */
export function recordPprRerank(
	debugRun: DebugRunHandle,
	input: {
		seedDocIds: readonly string[];
		before: readonly SearchResultItem[];
		after: readonly SearchResultItem[];
	},
	previewTopN = 10,
): void {
	const span = debugRun.startSpan({
		kind: 'ranking.score',
		name: 'ppr',
	});
	span.setParams({ seedDocIds: [...input.seedDocIds] });
	span.addMetric('seedCount', input.seedDocIds.length);
	span.addMetric('inputCount', input.before.length);
	span.addMetric('outputCount', input.after.length);
	const beforeRank = new Map<string, number>();
	input.before.forEach((it, i) => beforeRank.set(it.path, i));
	input.after.slice(0, previewTopN).forEach((item, i) => {
		const b = beforeRank.get(item.path);
		span.addDecision({
			decision: b === i ? 'keep' : b !== undefined && b > i ? 'promote' : 'demote',
			target: item.path,
			reason: 'ppr-graph-rerank',
			meta: { rankAfter: i, rankBefore: b },
		});
	});
	span.finish();
}

/**
 * Record the retriever-level path/type filter settings so a reader can see
 * WHICH document types the search was restricted to. Retriever filters run
 * inside individual retrievers; this span captures the SearchSettings snapshot
 * rather than per-doc drops.
 */
export function recordRetrieverFilterSettings(
	debugRun: DebugRunHandle,
	input: {
		includedDocumentTypes?: readonly string[];
	},
): void {
	if (!input.includedDocumentTypes || input.includedDocumentTypes.length === 0) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'retriever-settings',
	});
	span.setParams({
		includedDocumentTypes: [...input.includedDocumentTypes],
	});
	span.addMetric('typeCount', input.includedDocumentTypes.length);
	span.finish();
}

/** Record the topK cutoff (post-boost) filter.decision. */
export function recordTopKCutoff(
	debugRun: DebugRunHandle,
	beforeItems: readonly SearchResultItem[],
	afterItems: readonly SearchResultItem[],
	topK: number,
): void {
	if (beforeItems.length <= afterItems.length) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'topk-cutoff',
	});
	span.setParams({ topK });
	span.addMetric('droppedCount', beforeItems.length - afterItems.length);
	const kept = new Set(afterItems.map((i) => i.path));
	const dropped = beforeItems.filter((i) => !kept.has(i.path));
	for (const item of dropped.slice(0, 20)) {
		span.addDecision({
			decision: 'drop',
			target: item.path,
			reason: 'topk-cutoff',
			score: item.score ?? 0,
		});
	}
	span.finish();
}

/** Record the exclude filter drops. */
export function recordExcludeFilter(
	debugRun: DebugRunHandle,
	beforeItems: readonly SearchResultItem[],
	afterItems: readonly SearchResultItem[],
	excludes: readonly string[],
): void {
	const kept = new Set(afterItems.map((i) => i.path));
	const dropped = beforeItems.filter((i) => !kept.has(i.path));
	if (dropped.length === 0 && excludes.length === 0) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'exclude',
	});
	span.setParams({ excludes: [...excludes] });
	span.addMetric('droppedCount', dropped.length);
	for (const item of dropped.slice(0, 20)) {
		span.addDecision({
			decision: 'drop',
			target: item.path,
			reason: 'exclude-filter',
		});
	}
	span.finish();
}

/** Finalise the search run summary. */
export function finalizeSearchSummary(
	debugRun: DebugRunHandle,
	summary: {
		query: string;
		effectiveQuery?: string;
		topK: number;
		finalCount: number;
		durationMs: number;
	},
): void {
	debugRun.mergeSummary({
		query: summary.query,
		...(summary.effectiveQuery && summary.effectiveQuery !== summary.query
			? { effectiveQuery: summary.effectiveQuery }
			: {}),
		topK: summary.topK,
		finalCount: summary.finalCount,
		durationMs: summary.durationMs,
	});
}
