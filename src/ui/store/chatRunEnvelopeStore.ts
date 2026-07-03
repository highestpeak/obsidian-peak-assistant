// B5.chat — chat-side RunEnvelope projection store.
//
// Wafer-thin wrapper over the shared feature factory. Chat gets its
// own module so UI code can `import { CHAT_RUN_DERIVE_IS_STREAMING }`
// without touching neighbouring features' constants.

import {
	createFeatureRunEnvelopeStore,
	makeFeatureDeriveIds,
	registerFeatureDerives,
	selectActivePhase,
	selectIsStreaming,
	selectLastStatus,
	selectLatestArtifact,
	type FeatureRunEnvelopeStoreHandle,
	type FeatureRunEnvelopeStoreOptions,
} from '@/ui/store/featureRunEnvelopeStore';
import type { RunEnvelopeStore } from '@/service/run-envelope';

const CHAT_FEATURE = 'chat';
const CHAT_DERIVE_IDS = makeFeatureDeriveIds(CHAT_FEATURE);

export const CHAT_RUN_DERIVE_LAST_STATUS = CHAT_DERIVE_IDS.lastStatus;
export const CHAT_RUN_DERIVE_IS_STREAMING = CHAT_DERIVE_IDS.isStreaming;
export const CHAT_RUN_DERIVE_ACTIVE_PHASE = CHAT_DERIVE_IDS.activePhase;
export const CHAT_RUN_DERIVE_LATEST_ARTIFACT = CHAT_DERIVE_IDS.latestArtifact;

export type ChatRunEnvelopeStoreHandle = FeatureRunEnvelopeStoreHandle;
export type ChatRunEnvelopeStoreOptions = FeatureRunEnvelopeStoreOptions;

export function createChatRunEnvelopeStore(
	options: ChatRunEnvelopeStoreOptions = {},
): ChatRunEnvelopeStoreHandle {
	const { recorder, projection, store } = createFeatureRunEnvelopeStore(
		CHAT_FEATURE,
		options,
	);
	return { recorder, projection, store };
}

export function registerChatDerives(store: RunEnvelopeStore): void {
	registerFeatureDerives(store, CHAT_DERIVE_IDS);
}

export {
	selectActivePhase,
	selectIsStreaming,
	selectLastStatus,
	selectLatestArtifact,
};
