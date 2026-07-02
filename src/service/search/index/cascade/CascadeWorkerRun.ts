// T3 Wave 2.A — RunEnvelope adoption: CascadeWorker.drainDebt().
//
// One RunSession per drain-window. Progress events per debt item so
// observers can see queue drainage in real time. Artifact carries the
// summary counters (processed / affected doc set size / remaining).
//
// Boundary discipline: no imports from `@/app/*`, `@/ui/*`, `obsidian`,
// or `AppContext`. Tests inject an explicit `drain` function or a stub
// worker object; production passes the app-owned CascadeWorker.

import {
	InMemoryRunRecorder,
	defaultClock,
	defaultIdFactory,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
	type RunSession,
	type RunTrigger,
} from '@/service/run-envelope';

export const CASCADE_WORKER_CAPABILITY_ID = 'knowledge.cascade.drain';

const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.cascade-drain+json';

/**
 * Aggregated counters returned by a single drain-window. Passed through
 * as the artifact payload shape when serialized.
 */
export interface CascadeDrainSummary {
	readonly processedCount: number;
	readonly affectedDocCount: number;
	readonly remainingCount: number;
}

export interface CascadeDrainProgress {
	readonly phase: string;
	readonly label?: string;
	readonly processed?: number;
	readonly total?: number;
}

export interface CascadeDrainCallbacks {
	onProgress?: (event: CascadeDrainProgress) => void;
}

export interface CascadeDrainResult {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly summary: CascadeDrainSummary;
}

export interface CascadeDrainRunOptions {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	/** Production: an app-owned CascadeWorker-shaped handle. */
	drain?: (callbacks: CascadeDrainCallbacks) => Promise<CascadeDrainSummary>;
	/** Where the drain came from. Defaults to `'scheduled'` — idle timer. */
	trigger?: RunTrigger;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runCascadeDrain(
	options: CascadeDrainRunOptions,
): Promise<CascadeDrainResult> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('cascade-drain'),
			...(userOnEvent !== undefined
				? {
						onEvent: (event) => {
							const snapshot = recorderRef?.getEvents() ?? [];
							userOnEvent(event, snapshot);
						},
					}
				: {}),
		});
	recorderRef = recorder;

	const drain = options.drain;
	if (drain === undefined) {
		throw new Error(
			'runCascadeDrain: options.drain must be provided. The runner does not resolve the worker itself.',
		);
	}

	recorder.start({
		capabilityId: CASCADE_WORKER_CAPABILITY_ID,
		trigger: options.trigger ?? 'scheduled',
	});
	recorder.recordStatus('running');

	const callbacks: CascadeDrainCallbacks = {
		onProgress: (ev) => {
			recorder.recordProgress({
				phase: ev.phase,
				...(ev.label !== undefined ? { label: ev.label } : {}),
				...(ev.processed !== undefined ? { processed: ev.processed } : {}),
				...(ev.total !== undefined ? { total: ev.total } : {}),
			});
		},
	};

	let summary: CascadeDrainSummary;
	try {
		summary = await drain(callbacks);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, true);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: `Cascade drain (${summary.processedCount} processed, ${summary.remainingCount} remaining)`,
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
		summary,
	};
}
