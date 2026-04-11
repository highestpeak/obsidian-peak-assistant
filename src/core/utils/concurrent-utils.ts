/**
 * Async pool helpers: bounded parallelism while preserving per-index results.
 */

import type { Stopwatch } from './Stopwatch';
import { EventBuffer } from './event-buffer';

type ConcurrentTrace = {
	start(label: string): void;
	stop(): void;
};

type ConcurrentOptions<T, R> = {
	limit: number;
	stopwatch?: Stopwatch;
	eventBuffer?: EventBuffer<MapWithConcurrencyEvent<T, R>>;
};

export type MapWithConcurrencyEvent<T, R> =
	| {
		type: 'task-start';
		item: T;
		index: number;
		total: number;
		running: number;
	}
	| {
		type: 'task-complete';
		item: T;
		index: number;
		total: number;
		running: number;
		durationMs: number;
		result: R;
	}
	| {
		type: 'task-error';
		item: T;
		index: number;
		total: number;
		running: number;
		durationMs: number;
		error: unknown;
	};

type TimedStep = {
	label: string;
	durationMs: number;
};

type TimedRow<T, R> = {
	item: T;
	index: number;
	label: string;
	result: R;
	totalMs: number;
	steps: TimedStep[];
};

type StepSummary = {
	label: string;
	count: number;
	avgMs: number;
	maxMs: number;
};

/**
 * Maps items with a fixed worker pool size.
 * When `stopwatch` is provided, task timings are appended to the current Stopwatch segment.
 */
export function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]>;
export function mapWithConcurrency<T, R>(
	items: readonly T[],
	options: ConcurrentOptions<T, R>,
	fn: (item: T, index: number, trace: ConcurrentTrace) => Promise<R>,
): Promise<R[]>;
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limitOrOptions: number | ConcurrentOptions<T, R>,
	fn: ((item: T, index: number) => Promise<R>) | ((item: T, index: number, trace: ConcurrentTrace) => Promise<R>),
): Promise<R[]> {
	const options: ConcurrentOptions<T, R> = typeof limitOrOptions === 'number'
		? { limit: limitOrOptions }
		: limitOrOptions;
	if (items.length === 0) {
		if (options.eventBuffer && !options.eventBuffer.isClosed()) {
			options.eventBuffer.close();
		}
		return [];
	}

	const pool = Math.max(1, Math.min(options.limit, items.length));
	const results: R[] = new Array(items.length);
	const timedRows: TimedRow<T, R>[] = [];
	const enableTiming = Boolean(options.stopwatch);
	const noopTrace: ConcurrentTrace = {
		start(): void { },
		stop(): void { },
	};
	let nextIndex = 0;
	let running = 0;

	const emitEvent = async (event: MapWithConcurrencyEvent<T, R>): Promise<void> => {
		if (!options.eventBuffer) return;
		await options.eventBuffer.push(event);
	};

	async function worker(): Promise<void> {
		for (;;) {
			const i = nextIndex++;
			if (i >= items.length) return;
			const item = items[i]!;
			const startedAt = Date.now();
			running += 1;
			await emitEvent({
				type: 'task-start',
				item,
				index: i,
				total: items.length,
				running,
			});

			if (!enableTiming) {
				try {
					const result = await (fn as (item: T, index: number, trace: ConcurrentTrace) => Promise<R>)(item, i, noopTrace);
					results[i] = result;
					running -= 1;
					await emitEvent({
						type: 'task-complete',
						item,
						index: i,
						total: items.length,
						running,
						durationMs: Date.now() - startedAt,
						result,
					});
				} catch (error) {
					running -= 1;
					await emitEvent({
						type: 'task-error',
						item,
						index: i,
						total: items.length,
						running,
						durationMs: Date.now() - startedAt,
						error,
					});
					throw error;
				}
				continue;
			}

			const steps: TimedStep[] = [];
			let currentStep: { label: string; startedAt: number } | null = null;
			const closeCurrentStep = (): void => {
				if (!currentStep) return;
				steps.push({
					label: currentStep.label,
					durationMs: Date.now() - currentStep.startedAt,
				});
				currentStep = null;
			};
			const trace: ConcurrentTrace = {
				start(label: string): void {
					closeCurrentStep();
					currentStep = { label, startedAt: Date.now() };
				},
				stop(): void {
					closeCurrentStep();
				},
			};

			try {
				const result = await (fn as (item: T, index: number, trace: ConcurrentTrace) => Promise<R>)(item, i, trace);
				closeCurrentStep();
				results[i] = result;
				running -= 1;
				timedRows.push({
					item,
					index: i,
					label: `task.${i + 1}`,
					result,
					totalMs: Date.now() - startedAt,
					steps,
				});
				await emitEvent({
					type: 'task-complete',
					item,
					index: i,
					total: items.length,
					running,
					durationMs: Date.now() - startedAt,
					result,
				});
			} catch (error) {
				closeCurrentStep();
				running -= 1;
				await emitEvent({
					type: 'task-error',
					item,
					index: i,
					total: items.length,
					running,
					durationMs: Date.now() - startedAt,
					error,
				});
				throw error;
			}
		}
	}

	try {
		await Promise.all(Array.from({ length: pool }, () => worker()));
	} catch (error) {
		options.eventBuffer?.error(error);
		throw error;
	} finally {
		if (options.eventBuffer && !options.eventBuffer.isClosed()) {
			options.eventBuffer.close();
		}
	}

	if (enableTiming) {
		appendTimingToStopwatch(options.stopwatch!, timedRows, options);
	}
	return results;
}

function appendTimingToStopwatch<T, R>(
	sw: Stopwatch,
	rows: readonly TimedRow<T, R>[],
	options: ConcurrentOptions<T, R>,
): void {
	const prefix = sw.getCurrentSegmentLabel() ?? 'concurrent';
	const slowestCount = 3;
	const stepMap = new Map<string, { count: number; totalMs: number; maxMs: number }>();

	rows.forEach((row) => {
		sw.addSegmentDetail(`${prefix}.${row.label}.total`, row.totalMs);
		for (const step of row.steps) {
			sw.addSegmentDetail(`${prefix}.${row.label}.step.${step.label}`, step.durationMs);
			const prev = stepMap.get(step.label);
			if (!prev) {
				stepMap.set(step.label, {
					count: 1,
					totalMs: step.durationMs,
					maxMs: step.durationMs,
				});
			} else {
				prev.count += 1;
				prev.totalMs += step.durationMs;
				prev.maxMs = Math.max(prev.maxMs, step.durationMs);
			}
		}
	});

	const totalMs = rows.reduce((acc, row) => acc + row.totalMs, 0);
	sw.addSegmentDetail(`${prefix}.summary.task.avg`, rows.length > 0 ? totalMs / rows.length : 0);

	const stepSummaries: StepSummary[] = [...stepMap.entries()]
		.map(([label, agg]) => ({
			label,
			count: agg.count,
			avgMs: agg.totalMs / agg.count,
			maxMs: agg.maxMs,
		}))
		.sort((a, b) => b.avgMs - a.avgMs);
	for (const step of stepSummaries) {
		sw.addSegmentDetail(`${prefix}.summary.step.${step.label}.avg.${step.count}`, step.avgMs);
		sw.addSegmentDetail(`${prefix}.summary.step.${step.label}.max.${step.count}`, step.maxMs);
	}

	[...rows]
		.sort((a, b) => b.totalMs - a.totalMs)
		.slice(0, slowestCount)
		.forEach((row, index) => {
			sw.addSegmentDetail(`${prefix}.summary.slowest.${index + 1} ${row.label}`, row.totalMs);
		});
}
