// Debug-trace helpers for Ambient Push.
//
// One trigger fire = one DebugRun. The runtime records:
//   1. trigger.fire — file path, trigger type, paragraph excerpt
//   2. retrieval.recall — the ambient search candidates
//   3. filter.decision — items dropped by dedup / already-linked / cooldown
//   4. run summary — chosen item path or skip reason

import type { DebugRunHandle } from '@/core/debug-trace';

export interface AmbientTriggerInput {
	readonly filePath: string;
	readonly triggerType: string;
	readonly paragraph: string;
}

export function recordAmbientTrigger(
	debugRun: DebugRunHandle,
	input: AmbientTriggerInput,
): void {
	const span = debugRun.startSpan({
		kind: 'trigger.fire',
		name: `ambient-${input.triggerType}`,
	});
	span.setParams({
		filePath: input.filePath,
		triggerType: input.triggerType,
	});
	span.setInput({ raw: input.paragraph, contentType: 'text/markdown' });
	span.finish();
}

export interface AmbientCandidate {
	readonly filePath: string;
	readonly title?: string;
	readonly score: number;
	readonly source?: string;
}

export function recordAmbientCandidates(
	debugRun: DebugRunHandle,
	candidates: readonly AmbientCandidate[],
): void {
	const span = debugRun.startSpan({
		kind: 'retrieval.recall',
		name: 'ambient-search',
	});
	span.addMetric('hits', candidates.length);
	if (candidates.length > 0) {
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		for (const c of candidates) {
			if (c.score < min) min = c.score;
			if (c.score > max) max = c.score;
		}
		span.addMetric('minScore', min);
		span.addMetric('maxScore', max);
	}
	for (const c of candidates.slice(0, 20)) {
		span.addDecision({
			decision: 'keep',
			target: c.filePath,
			reason: c.source ?? 'candidate',
			score: c.score,
			...(c.title !== undefined ? { meta: { title: c.title } } : {}),
		});
	}
	span.finish();
}

export function recordAmbientFilterDrops(
	debugRun: DebugRunHandle,
	drops: ReadonlyArray<{ target: string; reason: string }>,
): void {
	if (drops.length === 0) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'ambient-filter',
	});
	span.addMetric('droppedCount', drops.length);
	for (const d of drops) {
		span.addDecision({
			decision: 'drop',
			target: d.target,
			reason: d.reason,
		});
	}
	span.finish();
}

/**
 * Ambient push runs the search adapter, which internally consumes pushHistory
 * (recently-shown items) as a dedup gate. The runtime does not observe the
 * pre-filter candidates; we surface the dedup context as a filter.decision
 * span so a reader can see "the searcher had N recently-pushed paths in its
 * suppress list" without having to plumb dedup drops out of the searcher.
 */
export function recordAmbientDedupContext(
	debugRun: DebugRunHandle,
	input: {
		pushHistoryPaths: readonly string[];
		alreadyLinkedPaths?: readonly string[];
	},
): void {
	const totalSuppressed =
		input.pushHistoryPaths.length + (input.alreadyLinkedPaths?.length ?? 0);
	if (totalSuppressed === 0) return;
	const span = debugRun.startSpan({
		kind: 'filter.decision',
		name: 'ambient-dedup-context',
	});
	span.addMetric('pushHistorySize', input.pushHistoryPaths.length);
	span.addMetric(
		'alreadyLinkedCount',
		input.alreadyLinkedPaths?.length ?? 0,
	);
	// Enumerate a small sample so a reader can eyeball which paths the
	// searcher is actively suppressing.
	for (const path of input.pushHistoryPaths.slice(0, 10)) {
		span.addDecision({
			decision: 'skip',
			target: path,
			reason: 'in-push-history',
		});
	}
	for (const path of (input.alreadyLinkedPaths ?? []).slice(0, 10)) {
		span.addDecision({
			decision: 'skip',
			target: path,
			reason: 'already-linked',
		});
	}
	span.finish();
}

/**
 * Record a dedicated `ranking.score` span for items produced by the
 * SerendipitySearcher. Serendipity items are recognised by their
 * `graph_neighbor` hop=2 signal — a 2-hop bridge from the current file.
 * The span exposes each item's bridge label (via signal) and the embedding
 * distance (kept on `score`) so a reader can see why the surprise was
 * proposed.
 */
export function recordAmbientSerendipity(
	debugRun: DebugRunHandle,
	items: ReadonlyArray<{
		filePath: string;
		title?: string;
		score: number;
		signals?: ReadonlyArray<{ type: string; hop?: number; via?: string }>;
	}>,
): void {
	const serendipity = items.filter((i) =>
		(i.signals ?? []).some((s) => s.type === 'graph_neighbor' && s.hop === 2),
	);
	if (serendipity.length === 0) return;
	const span = debugRun.startSpan({
		kind: 'ranking.score',
		name: 'serendipity',
	});
	span.addMetric('hits', serendipity.length);
	let minDist = Number.POSITIVE_INFINITY;
	let maxDist = Number.NEGATIVE_INFINITY;
	for (const i of serendipity) {
		if (i.score < minDist) minDist = i.score;
		if (i.score > maxDist) maxDist = i.score;
	}
	span.addMetric('minDistance', minDist);
	span.addMetric('maxDistance', maxDist);
	for (const item of serendipity.slice(0, 10)) {
		const bridge = (item.signals ?? []).find(
			(s) => s.type === 'graph_neighbor' && s.hop === 2,
		)?.via;
		span.addDecision({
			decision: 'promote',
			target: item.filePath,
			reason: 'serendipity-2hop-bridge',
			score: item.score,
			...(bridge ? { meta: { bridge } } : {}),
		});
	}
	span.finish();
}

export function finalizeAmbientRun(
	debugRun: DebugRunHandle,
	summary: {
		chosen?: readonly string[];
		skipReason?: string;
	},
): void {
	debugRun.mergeSummary({
		...(summary.chosen !== undefined
			? { chosen: [...summary.chosen] }
			: {}),
		...(summary.skipReason !== undefined
			? { skipReason: summary.skipReason }
			: {}),
	});
}
