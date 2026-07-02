// T3 Wave 2.A — RunEnvelope adoption: GraphCleanupService.run().
//
// A single-shot user-triggered maintenance op (currently invoked from
// DevTools via `window.cleanupGraphTable`). Wrapping in a RunSession
// gives us:
//   - a runId per cleanup so repeated invocations don't blur together
//     in trace inspection,
//   - a stable artifact with the deletion counters,
//   - failure trace when the transaction rolls back.
//
// The runner is trigger-defaulted to `'manual'` because DevTools is the
// only current caller.
//
// Boundary discipline: no imports from `@/app/*`, `@/ui/*`, `obsidian`,
// or `AppContext`.

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
import type { GraphCleanupResult } from './GraphCleanupService';

export const GRAPH_CLEANUP_CAPABILITY_ID = 'knowledge.graph.cleanup';

const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.graph-cleanup+json';

/**
 * Minimum surface the runner needs from the cleanup service.
 * Production passes a real `GraphCleanupService`; tests pass a stub.
 */
export interface GraphCleanupHandle {
	run(): Promise<GraphCleanupResult>;
}

export interface GraphCleanupRunResult {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
	readonly result: GraphCleanupResult;
}

export interface GraphCleanupRunOptions {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	/** Production: an app-owned GraphCleanupService. */
	cleaner?: GraphCleanupHandle;
	/** Test: explicit cleanup function. */
	clean?: () => Promise<GraphCleanupResult>;
	trigger?: RunTrigger;
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

export async function runGraphCleanup(
	options: GraphCleanupRunOptions,
): Promise<GraphCleanupRunResult> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('graph-cleanup'),
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

	const clean = options.clean
		?? (options.cleaner ? () => options.cleaner!.run() : undefined);
	if (clean === undefined) {
		throw new Error(
			'runGraphCleanup: options.cleaner or options.clean must be provided.',
		);
	}

	recorder.start({
		capabilityId: GRAPH_CLEANUP_CAPABILITY_ID,
		trigger: options.trigger ?? 'manual',
	});
	recorder.recordStatus('running');

	let result: GraphCleanupResult;
	try {
		result = await clean();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: `Graph cleanup (${result.orphanEdgesDeleted} orphan edges, ${result.nodesWithoutIndexedDocumentDeleted} stale nodes)`,
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
		result,
	};
}
