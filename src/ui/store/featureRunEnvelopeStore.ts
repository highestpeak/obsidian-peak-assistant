// Wave 3 · Shared factory for feature-scoped RunEnvelope stores.
//
// Chat, copilot, analysis, and harness all want the same four UI
// derives (`lastStatus`, `isStreaming`, `activePhase`,
// `latestArtifact`) but with feature-scoped derive ids so a single
// UI shell can subscribe to multiple features without id collisions.
// This module owns the selectors and the factory; feature-scoped
// modules just call `createFeatureRunEnvelopeStore('copilot')` and
// re-export the derive-id constants.
//
// Boundary discipline:
//   - No imports from React, Obsidian, zustand, or `@/app/*`.
//   - Depends only on `@/service/run-envelope`.

import {
	InMemoryRunRecorder,
	RunEnvelopeStore,
	createProjectingRecorder,
	defaultClock,
	defaultIdFactory,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunEventProjection,
	type RunIdFactory,
	type RunStatus,
} from '@/service/run-envelope';

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
	'completed',
	'failed',
	'cancelled',
]);

export interface FeatureRunEnvelopeStoreHandle {
	readonly recorder: InMemoryRunRecorder;
	readonly projection: RunEventProjection;
	readonly store: RunEnvelopeStore;
}

export interface FeatureRunEnvelopeStoreOptions {
	clock?: RunClock;
	idFactory?: RunIdFactory;
}

export interface FeatureDeriveIds {
	readonly lastStatus: string;
	readonly isStreaming: string;
	readonly activePhase: string;
	readonly latestArtifact: string;
}

export function makeFeatureDeriveIds(feature: string): FeatureDeriveIds {
	return {
		lastStatus: `${feature}.lastStatus`,
		isStreaming: `${feature}.isStreaming`,
		activePhase: `${feature}.activePhase`,
		latestArtifact: `${feature}.latestArtifact`,
	};
}

export function registerFeatureDerives(
	store: RunEnvelopeStore,
	ids: FeatureDeriveIds,
): void {
	store.register<RunStatus | null>(ids.lastStatus, selectLastStatus);
	store.register<boolean>(ids.isStreaming, selectIsStreaming);
	store.register<string | null>(ids.activePhase, selectActivePhase);
	store.register<ArtifactRef | null>(ids.latestArtifact, selectLatestArtifact);
}

export function createFeatureRunEnvelopeStore(
	feature: string,
	options: FeatureRunEnvelopeStoreOptions = {},
): FeatureRunEnvelopeStoreHandle & { readonly ids: FeatureDeriveIds } {
	const clock = options.clock ?? defaultClock();
	const idFactory = options.idFactory ?? defaultIdFactory(`${feature}-run`);
	let recorderRef: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) =>
			new InMemoryRunRecorder({
				clock,
				idFactory,
				onEvent: (event) => {
					const snapshot = recorderRef?.getEvents() ?? [];
					onEvent(event, snapshot);
				},
			}),
	});
	recorderRef = recorder;

	const store = new RunEnvelopeStore(projection);
	const ids = makeFeatureDeriveIds(feature);
	registerFeatureDerives(store, ids);
	return { recorder, projection, store, ids };
}

// ── Selectors (exported for offline replays and unit tests) ────────────

export function selectLastStatus(events: readonly RunEvent[]): RunStatus | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'status') return event.status;
	}
	return null;
}

export function selectIsStreaming(events: readonly RunEvent[]): boolean {
	const last = selectLastStatus(events);
	if (last === null) return false;
	if (TERMINAL_STATUSES.has(last)) return false;
	return last === 'running';
}

export function selectActivePhase(events: readonly RunEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'progress') return event.phase;
	}
	return null;
}

export function selectLatestArtifact(
	events: readonly RunEvent[],
): ArtifactRef | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i]!;
		if (event.type === 'artifact') return event.artifact;
	}
	return null;
}
