// B5.analysis — knowledge-analysis-side RunEnvelope projection store.
//
// See `chatRunEnvelopeStore.ts` for the pattern. The knowledge
// analysis runner emits the same standard `RunEvent`s.

import {
	createFeatureRunEnvelopeStore,
	makeFeatureDeriveIds,
	registerFeatureDerives,
	type FeatureRunEnvelopeStoreHandle,
	type FeatureRunEnvelopeStoreOptions,
} from '@/ui/store/featureRunEnvelopeStore';
import type { RunEnvelopeStore } from '@/service/run-envelope';

const ANALYSIS_FEATURE = 'analysis';
const ANALYSIS_DERIVE_IDS = makeFeatureDeriveIds(ANALYSIS_FEATURE);

export const ANALYSIS_RUN_DERIVE_LAST_STATUS = ANALYSIS_DERIVE_IDS.lastStatus;
export const ANALYSIS_RUN_DERIVE_IS_STREAMING = ANALYSIS_DERIVE_IDS.isStreaming;
export const ANALYSIS_RUN_DERIVE_ACTIVE_PHASE = ANALYSIS_DERIVE_IDS.activePhase;
export const ANALYSIS_RUN_DERIVE_LATEST_ARTIFACT = ANALYSIS_DERIVE_IDS.latestArtifact;

export type AnalysisRunEnvelopeStoreHandle = FeatureRunEnvelopeStoreHandle;
export type AnalysisRunEnvelopeStoreOptions = FeatureRunEnvelopeStoreOptions;

export function createAnalysisRunEnvelopeStore(
	options: AnalysisRunEnvelopeStoreOptions = {},
): AnalysisRunEnvelopeStoreHandle {
	const { recorder, projection, store } = createFeatureRunEnvelopeStore(
		ANALYSIS_FEATURE,
		options,
	);
	return { recorder, projection, store };
}

export function registerAnalysisDerives(store: RunEnvelopeStore): void {
	registerFeatureDerives(store, ANALYSIS_DERIVE_IDS);
}
