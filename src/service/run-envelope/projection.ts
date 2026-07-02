// T7 UI RunEvent Projection — framework-agnostic subscription helper.
//
// A `RunEventProjection` wraps an `InMemoryRunRecorder` and exposes the
// two functions React's `useSyncExternalStore` expects:
//
//   - `getSnapshot()`      → the current, cached event array. Returns
//                            the SAME array reference between snapshots
//                            when nothing has changed (React relies on
//                            reference equality to skip re-renders).
//   - `subscribe(listener)` → registers a callback; returns an unsubscribe
//                            function.
//
// The projection is intentionally framework-agnostic. React binds it
// via `useSyncExternalStore(proj.subscribe, proj.getSnapshot)`; a
// Zustand adapter would call `subscribe` and update its own state.
// The recorder never learns about the subscribers — the projection
// listens via the recorder's per-run `onEvent` sink.
//
// One projection per recorder. Cannot mix or reuse across runs.
//
// Boundary discipline:
//   - No imports from `@/app/*`, `@/ui/*`, `obsidian`.
//   - Depends only on `./types` and `./InMemoryRunRecorder`.

import type { InMemoryRunRecorder } from './InMemoryRunRecorder';
import type { RunEvent } from './types';

export interface RunEventProjection {
	/**
	 * Snapshot of every event recorded so far. Returns the SAME array
	 * reference when nothing has changed (referential stability).
	 */
	getSnapshot(): readonly RunEvent[];
	/**
	 * Register a listener that fires after every recorder event. Returns
	 * an unsubscribe function.
	 */
	subscribe(listener: () => void): () => void;
}

/**
 * Wrap a recorder in a projection. Must be attached BEFORE the first
 * `recorder.start()` call — the projection installs itself as the
 * recorder's `onEvent` sink and only sees events emitted after
 * attachment. `attachRunEventProjection` throws when called twice on
 * the same recorder.
 *
 * Contract with the recorder (see `InMemoryRunRecorderOptions.onEvent`
 * comment in `InMemoryRunRecorder.ts` §"Progress reporting"): only ONE
 * onEvent sink per recorder. If a caller already wired an `onEvent`,
 * they should compose it themselves — the projection does not
 * multiplex.
 */
export function attachRunEventProjection(
	recorder: InMemoryRunRecorder,
): RunEventProjection {
	// Guard: the recorder's `onEvent` is set at construction time via
	// `InMemoryRunRecorderOptions`; we cannot swap it here. Instead,
	// this projection assumes the recorder was constructed with an
	// onEvent sink that forwards into `notifyChange`. Callers use the
	// convenience `createProjectingRecorder` below when they want the
	// wiring done for them.
	//
	// We keep this exported `attach*` variant for the case where the
	// caller has an existing recorder that was built WITH the projection
	// sink (see `notify`). This function only exposes the projection
	// handle and the notify hook.
	void recorder;
	throw new Error(
		'attachRunEventProjection: use createProjectingRecorder({ ... }) at construction time — post-hoc attachment is not supported because InMemoryRunRecorder captures its onEvent sink in the constructor.',
	);
}

/** Internal projection state. Not exported. */
interface ProjectionState {
	snapshot: readonly RunEvent[];
	listeners: Set<() => void>;
}

function makeState(): ProjectionState {
	return {
		snapshot: [],
		listeners: new Set(),
	};
}

function notify(state: ProjectionState, snapshot: readonly RunEvent[]): void {
	state.snapshot = snapshot;
	for (const l of state.listeners) {
		try {
			l();
		} catch (e) {
			console.warn('[RunEventProjection] listener threw:', e);
		}
	}
}

export interface ProjectingRecorderHooks {
	/**
	 * Called by the caller to construct the recorder. Receives the
	 * onEvent sink the projection installs; the caller passes it to
	 * `new InMemoryRunRecorder({ ..., onEvent })`.
	 */
	buildRecorder(onEvent: (event: RunEvent, snapshot: readonly RunEvent[]) => void): InMemoryRunRecorder;
}

/**
 * Construct a recorder + projection pair. The caller supplies a
 * `buildRecorder` factory (because `InMemoryRunRecorder` needs a clock
 * and idFactory the projection has no opinion on).
 *
 *   const { recorder, projection } = createProjectingRecorder({
 *     buildRecorder: (onEvent) => new InMemoryRunRecorder({
 *       clock, idFactory, onEvent: (e) => onEvent(e, recorder.getEvents()),
 *     }),
 *   });
 *
 * Returns:
 *   - `recorder`  — the wrapped recorder (call `.start`, `.recordProgress`, etc.)
 *   - `projection` — hand to `useSyncExternalStore(projection.subscribe, projection.getSnapshot)`.
 */
export function createProjectingRecorder(hooks: ProjectingRecorderHooks): {
	recorder: InMemoryRunRecorder;
	projection: RunEventProjection;
} {
	const state = makeState();
	const projection: RunEventProjection = {
		getSnapshot: () => state.snapshot,
		subscribe: (listener: () => void) => {
			state.listeners.add(listener);
			return () => {
				state.listeners.delete(listener);
			};
		},
	};
	const recorder = hooks.buildRecorder((_event, snapshot) => {
		notify(state, snapshot);
	});
	return { recorder, projection };
}
