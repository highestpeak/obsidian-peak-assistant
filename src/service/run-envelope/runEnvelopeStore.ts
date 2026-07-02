// T7 UI RunEvent Projection — framework-agnostic store primitives.
//
// `createProjectingRecorder` already exposes the raw
// `getSnapshot() + subscribe()` pair React's `useSyncExternalStore`
// expects. But UI stores rarely want the raw event array — they want
// *derived* views (e.g. "last status", "the latest artifact", "current
// progress percent"). Recomputing a derive from scratch on every render
// wastes work; caching by array-reference identity does not, because
// the projection promises referential stability between mutations.
//
// This module gives store authors the missing primitive:
//
//   `deriveEvents(projection, selector)` → memoized derive, stable ref
//                                          when the underlying event
//                                          array hasn't changed.
//
// Plus a small `RunEnvelopeStore` façade that bundles the projection +
// a set of named derives. UI code (any framework) hooks into it via
// `store.subscribe(id, listener)` for a specific derive, or
// `store.projection.subscribe` for the raw stream.
//
// Boundary discipline:
//   - No imports from `@/app/*`, `@/ui/*`, `obsidian`, or React.
//   - Depends only on `./projection` and `./types`.

import type { RunEventProjection } from './projection';
import type { RunEvent } from './types';

/**
 * Selector: given an event array, produce a derived value. Selectors
 * must be pure — same input array reference must give the same output.
 */
export type EventSelector<T> = (events: readonly RunEvent[]) => T;

/**
 * Memoized derive handle. Call `get()` to read the current value; the
 * result is cached until the underlying event array reference changes.
 */
export interface DerivedView<T> {
	/** Current derived value. Referentially stable while events unchanged. */
	get(): T;
	/**
	 * Subscribe to changes on THIS derive. Fires only when the selector
	 * output changes by reference — subscribers that only care about
	 * `lastStatus` won't wake up on every artifact event.
	 */
	subscribe(listener: (value: T) => void): () => void;
}

interface DeriveState<T> {
	lastEventsRef: readonly RunEvent[] | null;
	lastValue: T;
	hasValue: boolean;
	listeners: Set<(value: T) => void>;
}

/**
 * Wrap a `RunEventProjection` in a memoized derive. The derive
 * re-computes only when the projection's event array reference
 * changes; listeners fire only when the selector output changes.
 *
 * The derive holds a subscription on `projection` for its lifetime.
 * Callers that construct many short-lived derives should dispose them
 * via the returned `dispose()` when done.
 */
export function deriveEvents<T>(
	projection: RunEventProjection,
	selector: EventSelector<T>,
): DerivedView<T> & { dispose(): void } {
	const state: DeriveState<T> = {
		lastEventsRef: null,
		lastValue: undefined as unknown as T,
		hasValue: false,
		listeners: new Set(),
	};

	function recompute(): T {
		const events = projection.getSnapshot();
		if (state.hasValue && state.lastEventsRef === events) {
			return state.lastValue;
		}
		const next = selector(events);
		const changed = !state.hasValue || !Object.is(next, state.lastValue);
		state.lastEventsRef = events;
		state.lastValue = next;
		state.hasValue = true;
		if (changed) {
			for (const l of state.listeners) {
				try { l(next); } catch (e) { console.warn('[deriveEvents] listener threw:', e); }
			}
		}
		return next;
	}

	// Seed initial value so `get()` and any early subscribers see current state.
	recompute();

	// Track the projection so any event mutation triggers our recompute.
	const unsub = projection.subscribe(() => { recompute(); });

	return {
		get: () => {
			// Guarantee freshness: if projection mutated between subscription
			// setup and the get() call, recompute now.
			recompute();
			return state.lastValue;
		},
		subscribe: (listener) => {
			state.listeners.add(listener);
			return () => { state.listeners.delete(listener); };
		},
		dispose: () => {
			unsub();
			state.listeners.clear();
		},
	};
}

// ---------------------------------------------------------------------------
// Named-derive store façade.
// ---------------------------------------------------------------------------

/**
 * A RunEnvelopeStore bundles a `RunEventProjection` with a set of named
 * derives so UI code has one object to import (instead of juggling the
 * projection + N loose derives). Framework-agnostic:
 *
 *   // Register derives:
 *   store.register('lastStatus', events => events.at(-1)?.type ?? null);
 *   store.register('artifactCount', events => events.filter(e => e.type === 'artifact').length);
 *
 *   // Read:
 *   store.get('lastStatus');
 *   store.get('artifactCount');
 *
 *   // Subscribe (any framework):
 *   store.subscribe('artifactCount', (n) => console.log('now', n));
 */
export class RunEnvelopeStore {
	private readonly derives = new Map<string, DerivedView<unknown> & { dispose(): void }>();

	constructor(public readonly projection: RunEventProjection) {}

	register<T>(id: string, selector: EventSelector<T>): DerivedView<T> {
		if (this.derives.has(id)) {
			throw new Error(`RunEnvelopeStore: derive '${id}' already registered.`);
		}
		const dv = deriveEvents(this.projection, selector);
		this.derives.set(id, dv as DerivedView<unknown> & { dispose(): void });
		return dv;
	}

	get<T>(id: string): T {
		const dv = this.derives.get(id);
		if (dv === undefined) {
			throw new Error(`RunEnvelopeStore: no derive registered for '${id}'.`);
		}
		return dv.get() as T;
	}

	subscribe<T>(id: string, listener: (value: T) => void): () => void {
		const dv = this.derives.get(id);
		if (dv === undefined) {
			throw new Error(`RunEnvelopeStore: no derive registered for '${id}'.`);
		}
		return (dv as DerivedView<T>).subscribe(listener);
	}

	unregister(id: string): void {
		const dv = this.derives.get(id);
		if (dv === undefined) return;
		dv.dispose();
		this.derives.delete(id);
	}

	dispose(): void {
		for (const dv of this.derives.values()) dv.dispose();
		this.derives.clear();
	}
}
