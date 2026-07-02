// T3 Wave 2.A — RunEnvelope adoption: IndexInitializer.
//
// Wraps IndexInitializer.checkAndUpdateIndex() in a RunSession so that
// observability, cancellation, and golden-trace testing become uniform
// with VaultLintRun. This is the second real adopter of RunEnvelope
// after Vault Lint (T3B) and follows the pattern documented in
// `docs/superpowers/specs/2026-07-02-t3-first-adopter-selection-design.md`.
//
// Boundary discipline (mirrors VaultLintRun.ts §Boundary):
//   - This runner does NOT import `AppContext`, `sqliteStoreManager`,
//     the runtime registry, or any zustand store. Tests supply an
//     explicit stub via `initialize` callback; production wires the
//     app-owned `IndexInitializer` instance via `initializer`.
//   - No module-level mutable state. Every call is self-contained.
//
// Progress event granularity: the wrapper today emits only the
// skeleton events (`status`, optional `progress`, `artifact`, `error`,
// terminal `status`). Fine-grained "file X of Y indexed" progress is
// deferred until IndexInitializer grows an observer callback surface.
// The outer skeleton is already enough for:
//   - RunEnvelope conformance (can we drive it? can we replay it?)
//   - Startup latency tracking (endedAt - startedAt)
//   - Failure trace capture
//   - UI store projection experiments (T7)

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

/**
 * Stable capability id. Matches handbook §8 vocabulary ('knowledge.*'
 * for background indexing work) and the T1 fixture naming style.
 */
export const INDEX_INITIALIZER_CAPABILITY_ID = 'knowledge.index.initialize';

const ARTIFACT_CONTENT_TYPE = 'application/vnd.peak.index-initialize+json';

/** Everything a caller (main.ts, command handler, test) needs after a run. */
export interface IndexInitializerRunResult {
	readonly session: RunSession;
	readonly events: readonly RunEvent[];
	readonly artifact: ArtifactRef;
}

/**
 * Minimum surface the runner needs from the initializer. Production
 * passes a real `IndexInitializer` (its `checkAndUpdateIndex` matches
 * this signature). Tests pass a stub.
 */
export interface IndexInitializerHandle {
	checkAndUpdateIndex(): Promise<void>;
}

/**
 * Options accepted by `runIndexInitializer`.
 *
 * Exactly one of `initializer` or `initialize` must be supplied — the
 * runner refuses to resolve either from a service locator. Tests
 * typically inject `initialize` and omit `initializer`.
 */
export interface IndexInitializerRunOptions {
	recorder?: InMemoryRunRecorder;
	clock?: RunClock;
	idFactory?: RunIdFactory;
	/** Production: an app-owned IndexInitializer instance. */
	initializer?: IndexInitializerHandle;
	/** Test: an explicit function to run instead of an initializer. */
	initialize?: () => Promise<void>;
	/**
	 * Where the run comes from. Defaults to `'startup'` because that
	 * is the current production callsite (main.ts onload).
	 */
	trigger?: RunTrigger;
	/** Optional per-run event sink; mirrors VaultLintRun.onEvent. */
	onEvent?: (event: RunEvent, snapshot: readonly RunEvent[]) => void;
}

/**
 * Execute one IndexInitializer check-and-update inside a fresh
 * RunEnvelope.
 *
 * On success: returns `{ session, events, artifact }` with status
 * `'completed'`.
 *
 * On failure: records an `error` event, finishes with `'failed'`, then
 * rethrows so callers can surface the failure their way (existing
 * `main.ts` swallows the error at the outer try/catch; that behavior
 * is preserved because we rethrow the original error object).
 */
export async function runIndexInitializer(
	options: IndexInitializerRunOptions,
): Promise<IndexInitializerRunResult> {
	let recorderRef: InMemoryRunRecorder | null = null;
	const userOnEvent = options?.onEvent;
	const recorder =
		options.recorder ??
		new InMemoryRunRecorder({
			clock: options.clock ?? defaultClock(),
			idFactory: options.idFactory ?? defaultIdFactory('idx-init'),
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

	const initialize = options.initialize
		?? (options.initializer ? () => options.initializer!.checkAndUpdateIndex() : undefined);
	if (initialize === undefined) {
		throw new Error(
			'runIndexInitializer: either options.initializer or options.initialize must be provided. The runner does not resolve the initializer itself; pass the app-owned instance in.',
		);
	}

	recorder.start({
		capabilityId: INDEX_INITIALIZER_CAPABILITY_ID,
		trigger: options.trigger ?? 'startup',
	});
	recorder.recordStatus('running');

	try {
		await initialize();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		recorder.recordError(message, false);
		recorder.finish('failed');
		throw err;
	}

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'Index initializer check-and-update completed',
		contentType: ARTIFACT_CONTENT_TYPE,
	});
	const finalSession = recorder.finish('completed');

	return {
		session: finalSession,
		events: recorder.getEvents(),
		artifact,
	};
}
