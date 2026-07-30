// B5.harness — agent-harness-side RunEnvelope projection store.
//
// See `chatRunEnvelopeStore.ts` for the pattern.
// `runHarnessAgent` and `HarnessRunBridge` both emit the same
// standard `RunEvent`s the shared factory expects.

import {
	createFeatureRunEnvelopeStore,
	makeFeatureDeriveIds,
	registerFeatureDerives,
	type FeatureRunEnvelopeStoreHandle,
	type FeatureRunEnvelopeStoreOptions,
} from '@/ui/store/featureRunEnvelopeStore';
import type { RunEnvelopeStore } from '@/service/run-envelope';

const HARNESS_FEATURE = 'harness';
const HARNESS_DERIVE_IDS = makeFeatureDeriveIds(HARNESS_FEATURE);

export const HARNESS_RUN_DERIVE_LAST_STATUS = HARNESS_DERIVE_IDS.lastStatus;
export const HARNESS_RUN_DERIVE_IS_STREAMING = HARNESS_DERIVE_IDS.isStreaming;
export const HARNESS_RUN_DERIVE_ACTIVE_PHASE = HARNESS_DERIVE_IDS.activePhase;
export const HARNESS_RUN_DERIVE_LATEST_ARTIFACT = HARNESS_DERIVE_IDS.latestArtifact;

export type HarnessRunEnvelopeStoreHandle = FeatureRunEnvelopeStoreHandle;
export type HarnessRunEnvelopeStoreOptions = FeatureRunEnvelopeStoreOptions;

export function createHarnessRunEnvelopeStore(
	options: HarnessRunEnvelopeStoreOptions = {},
): HarnessRunEnvelopeStoreHandle {
	const { recorder, projection, store } = createFeatureRunEnvelopeStore(
		HARNESS_FEATURE,
		options,
	);
	return { recorder, projection, store };
}

export function registerHarnessDerives(store: RunEnvelopeStore): void {
	registerFeatureDerives(store, HARNESS_DERIVE_IDS);
}
