// B5.copilot — copilot-side RunEnvelope projection store.
//
// See `chatRunEnvelopeStore.ts` for the pattern. Copilot's runner
// (`runCopilotConversation`) emits the same standard `RunEvent`s, so
// the four canonical derives apply verbatim.

import {
	createFeatureRunEnvelopeStore,
	makeFeatureDeriveIds,
	registerFeatureDerives,
	type FeatureRunEnvelopeStoreHandle,
	type FeatureRunEnvelopeStoreOptions,
} from '@/ui/store/featureRunEnvelopeStore';
import type { RunEnvelopeStore } from '@/service/run-envelope';

const COPILOT_FEATURE = 'copilot';
const COPILOT_DERIVE_IDS = makeFeatureDeriveIds(COPILOT_FEATURE);

export const COPILOT_RUN_DERIVE_LAST_STATUS = COPILOT_DERIVE_IDS.lastStatus;
export const COPILOT_RUN_DERIVE_IS_STREAMING = COPILOT_DERIVE_IDS.isStreaming;
export const COPILOT_RUN_DERIVE_ACTIVE_PHASE = COPILOT_DERIVE_IDS.activePhase;
export const COPILOT_RUN_DERIVE_LATEST_ARTIFACT = COPILOT_DERIVE_IDS.latestArtifact;

export type CopilotRunEnvelopeStoreHandle = FeatureRunEnvelopeStoreHandle;
export type CopilotRunEnvelopeStoreOptions = FeatureRunEnvelopeStoreOptions;

export function createCopilotRunEnvelopeStore(
	options: CopilotRunEnvelopeStoreOptions = {},
): CopilotRunEnvelopeStoreHandle {
	const { recorder, projection, store } = createFeatureRunEnvelopeStore(
		COPILOT_FEATURE,
		options,
	);
	return { recorder, projection, store };
}

export function registerCopilotDerives(store: RunEnvelopeStore): void {
	registerFeatureDerives(store, COPILOT_DERIVE_IDS);
}
