// Wave 3 · four feature-scoped RunEnvelope stores share a factory.
//
// This test proves:
//   1. each feature's derive ids are distinct (`chat.isStreaming`
//      ≠ `copilot.isStreaming` ≠ `analysis.isStreaming` ≠
//      `harness.isStreaming`);
//   2. all four stores derive the same shape of `isStreaming` +
//      `lastStatus` from an identical event stream;
//   3. `registerXxxDerives(sharedStore)` composes onto an
//      externally-owned RunEnvelopeStore without conflict — a single
//      UI shell can subscribe to all four features from one store.

import assert from 'assert';
import {
	CHAT_RUN_DERIVE_IS_STREAMING,
	CHAT_RUN_DERIVE_LAST_STATUS,
	createChatRunEnvelopeStore,
	registerChatDerives,
} from '@/ui/store/chatRunEnvelopeStore';
import {
	COPILOT_RUN_DERIVE_IS_STREAMING,
	COPILOT_RUN_DERIVE_LAST_STATUS,
	createCopilotRunEnvelopeStore,
	registerCopilotDerives,
} from '@/ui/store/copilotRunEnvelopeStore';
import {
	ANALYSIS_RUN_DERIVE_IS_STREAMING,
	ANALYSIS_RUN_DERIVE_LAST_STATUS,
	createAnalysisRunEnvelopeStore,
	registerAnalysisDerives,
} from '@/ui/store/analysisRunEnvelopeStore';
import {
	HARNESS_RUN_DERIVE_IS_STREAMING,
	HARNESS_RUN_DERIVE_LAST_STATUS,
	createHarnessRunEnvelopeStore,
	registerHarnessDerives,
} from '@/ui/store/harnessRunEnvelopeStore';
import {
	InMemoryRunRecorder,
	RunEnvelopeStore,
	createProjectingRecorder,
} from '@/service/run-envelope';

const fakeClock = () => {
	let t = 1000;
	return { now: () => (t += 1) };
};

const fakeIdFactory = (prefix: string) => {
	let n = 0;
	return { next: () => `${prefix}-${++n}` };
};

async function main() {
	testDeriveIdsAreDistinctAcrossFeatures();
	testAllFourFeatureStoresBehaveIdentically();
	testFeaturesComposeOntoSingleStore();
	console.log('feature-run-envelope-stores: ok');
}

function testDeriveIdsAreDistinctAcrossFeatures() {
	const ids = [
		CHAT_RUN_DERIVE_IS_STREAMING,
		COPILOT_RUN_DERIVE_IS_STREAMING,
		ANALYSIS_RUN_DERIVE_IS_STREAMING,
		HARNESS_RUN_DERIVE_IS_STREAMING,
	];
	assert.strictEqual(new Set(ids).size, 4, 'isStreaming ids must be feature-scoped');

	assert.strictEqual(CHAT_RUN_DERIVE_LAST_STATUS, 'chat.lastStatus');
	assert.strictEqual(COPILOT_RUN_DERIVE_LAST_STATUS, 'copilot.lastStatus');
	assert.strictEqual(ANALYSIS_RUN_DERIVE_LAST_STATUS, 'analysis.lastStatus');
	assert.strictEqual(HARNESS_RUN_DERIVE_LAST_STATUS, 'harness.lastStatus');

	console.log('  ✓ derive ids are distinct across features');
}

function testAllFourFeatureStoresBehaveIdentically() {
	const cases = [
		{
			label: 'chat',
			handle: createChatRunEnvelopeStore({
				clock: fakeClock(),
				idFactory: fakeIdFactory('chat'),
			}),
			ids: {
				lastStatus: CHAT_RUN_DERIVE_LAST_STATUS,
				isStreaming: CHAT_RUN_DERIVE_IS_STREAMING,
			},
			capabilityId: 'chat.conversation.run',
		},
		{
			label: 'copilot',
			handle: createCopilotRunEnvelopeStore({
				clock: fakeClock(),
				idFactory: fakeIdFactory('copilot'),
			}),
			ids: {
				lastStatus: COPILOT_RUN_DERIVE_LAST_STATUS,
				isStreaming: COPILOT_RUN_DERIVE_IS_STREAMING,
			},
			capabilityId: 'copilot.conversation.run',
		},
		{
			label: 'analysis',
			handle: createAnalysisRunEnvelopeStore({
				clock: fakeClock(),
				idFactory: fakeIdFactory('analysis'),
			}),
			ids: {
				lastStatus: ANALYSIS_RUN_DERIVE_LAST_STATUS,
				isStreaming: ANALYSIS_RUN_DERIVE_IS_STREAMING,
			},
			capabilityId: 'analysis.run',
		},
		{
			label: 'harness',
			handle: createHarnessRunEnvelopeStore({
				clock: fakeClock(),
				idFactory: fakeIdFactory('harness'),
			}),
			ids: {
				lastStatus: HARNESS_RUN_DERIVE_LAST_STATUS,
				isStreaming: HARNESS_RUN_DERIVE_IS_STREAMING,
			},
			capabilityId: 'harness.agent.run',
		},
	];

	for (const c of cases) {
		const { recorder, store } = c.handle;
		assert.strictEqual(store.get(c.ids.lastStatus), null, `${c.label} initial lastStatus`);
		assert.strictEqual(store.get(c.ids.isStreaming), false, `${c.label} initial isStreaming`);

		recorder.start({ capabilityId: c.capabilityId, trigger: 'manual' });
		recorder.recordStatus('running');
		assert.strictEqual(store.get(c.ids.lastStatus), 'running', `${c.label} sees running`);
		assert.strictEqual(store.get(c.ids.isStreaming), true, `${c.label} isStreaming=true`);

		recorder.finish('completed');
		assert.strictEqual(store.get(c.ids.lastStatus), 'completed', `${c.label} sees completed`);
		assert.strictEqual(store.get(c.ids.isStreaming), false, `${c.label} isStreaming=false`);
	}

	console.log('  ✓ all four feature stores derive identically');
}

function testFeaturesComposeOntoSingleStore() {
	// UI shell scenario: one recorder feeds a shared projection; four
	// feature registrars decorate the same store with their own ids.
	// Reading `chat.isStreaming` and `copilot.isStreaming` must both
	// reflect the same underlying event stream (because they consume the
	// same projection), but the ids stay distinct so a UI can pick which
	// feature it's rendering for.
	let recorderRef: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) =>
			new InMemoryRunRecorder({
				clock: fakeClock(),
				idFactory: fakeIdFactory('shared'),
				onEvent: (e) => onEvent(e, recorderRef?.getEvents() ?? []),
			}),
	});
	recorderRef = recorder;
	const store = new RunEnvelopeStore(projection);
	registerChatDerives(store);
	registerCopilotDerives(store);
	registerAnalysisDerives(store);
	registerHarnessDerives(store);

	recorder.start({ capabilityId: 'shared.run', trigger: 'manual' });
	recorder.recordStatus('running');

	assert.strictEqual(store.get(CHAT_RUN_DERIVE_IS_STREAMING), true);
	assert.strictEqual(store.get(COPILOT_RUN_DERIVE_IS_STREAMING), true);
	assert.strictEqual(store.get(ANALYSIS_RUN_DERIVE_IS_STREAMING), true);
	assert.strictEqual(store.get(HARNESS_RUN_DERIVE_IS_STREAMING), true);

	recorder.finish('failed');
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_LAST_STATUS), 'failed');
	assert.strictEqual(store.get(COPILOT_RUN_DERIVE_LAST_STATUS), 'failed');
	assert.strictEqual(store.get(HARNESS_RUN_DERIVE_LAST_STATUS), 'failed');

	console.log('  ✓ features compose onto a single store');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
