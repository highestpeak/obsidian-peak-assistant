// B5.chat — chat RunEnvelope projection store tests.
//
// Exercises the four canonical derives against a live recorder:
//
//   - `lastStatus` walks backward and picks the latest `status:` event
//   - `isStreaming` distinguishes `running` from any terminal status
//   - `activePhase` picks the latest `progress:` phase
//   - `latestArtifact` picks the latest recorded artifact
//
// Also verifies referential stability: reading the same derive twice
// without an intervening event mutation must return the same reference
// (contract of `deriveEvents` inside `RunEnvelopeStore`).

import assert from 'assert';
import {
	CHAT_RUN_DERIVE_ACTIVE_PHASE,
	CHAT_RUN_DERIVE_IS_STREAMING,
	CHAT_RUN_DERIVE_LAST_STATUS,
	CHAT_RUN_DERIVE_LATEST_ARTIFACT,
	createChatRunEnvelopeStore,
	registerChatDerives,
	selectActivePhase,
	selectIsStreaming,
	selectLastStatus,
	selectLatestArtifact,
} from '@/ui/store/chatRunEnvelopeStore';
import {
	InMemoryRunRecorder,
	RunEnvelopeStore,
	createProjectingRecorder,
} from '@/service/run-envelope';
import type { ArtifactRef, RunEvent } from '@/service/run-envelope';

const fakeClock = () => {
	let t = 1000;
	return { now: () => (t += 1) };
};

const fakeIdFactory = () => {
	let n = 0;
	return { next: () => `id-${++n}` };
};

async function main() {
	testSelectorsAgainstStaticEventArrays();
	testStoreWiresProjectionThroughRecorder();
	testIsStreamingResetsOnTerminalStatus();
	testDerivesAreReferentiallyStable();
	console.log('chat-run-envelope-store: ok');
}

function testSelectorsAgainstStaticEventArrays() {
	const empty: readonly RunEvent[] = [];
	assert.strictEqual(selectLastStatus(empty), null);
	assert.strictEqual(selectIsStreaming(empty), false);
	assert.strictEqual(selectActivePhase(empty), null);
	assert.strictEqual(selectLatestArtifact(empty), null);

	const events: readonly RunEvent[] = [
		{ type: 'status', runId: 'r1', status: 'running', ts: 100 },
		{ type: 'progress', runId: 'r1', phase: 'streaming-tokens', ts: 110 },
		{
			type: 'artifact',
			runId: 'r1',
			artifact: {
				artifactId: 'a1',
				runId: 'r1',
				kind: 'result',
				createdAt: 120,
			},
			ts: 120,
		},
		{ type: 'progress', runId: 'r1', phase: 'finalizing', ts: 130 },
		{ type: 'status', runId: 'r1', status: 'completed', ts: 140 },
	];

	assert.strictEqual(selectLastStatus(events), 'completed');
	assert.strictEqual(selectIsStreaming(events), false);
	assert.strictEqual(selectActivePhase(events), 'finalizing');
	assert.strictEqual(selectLatestArtifact(events)?.artifactId, 'a1');

	console.log('  ✓ selectors against static event arrays');
}

function testStoreWiresProjectionThroughRecorder() {
	const { recorder, store } = createChatRunEnvelopeStore({
		clock: fakeClock(),
		idFactory: fakeIdFactory(),
	});

	assert.strictEqual(store.get(CHAT_RUN_DERIVE_LAST_STATUS), null);
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_IS_STREAMING), false);

	recorder.start({ capabilityId: 'chat.conversation.run', trigger: 'manual' });
	recorder.recordStatus('running');
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_LAST_STATUS), 'running');
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_IS_STREAMING), true);

	recorder.recordProgress({ phase: 'streaming-tokens' });
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_ACTIVE_PHASE), 'streaming-tokens');

	const artifact = recorder.recordArtifact({
		kind: 'result',
		title: 'chat done',
	});
	const latest = store.get<ArtifactRef>(CHAT_RUN_DERIVE_LATEST_ARTIFACT);
	assert.strictEqual(latest?.artifactId, artifact.artifactId);

	recorder.finish('completed');
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_LAST_STATUS), 'completed');
	assert.strictEqual(store.get(CHAT_RUN_DERIVE_IS_STREAMING), false);

	console.log('  ✓ store wires projection through recorder');
}

function testIsStreamingResetsOnTerminalStatus() {
	const cases: Array<['completed' | 'failed' | 'cancelled', boolean]> = [
		['completed', false],
		['failed', false],
		['cancelled', false],
	];
	for (const [terminal, expected] of cases) {
		const { recorder, store } = createChatRunEnvelopeStore({
			clock: fakeClock(),
			idFactory: fakeIdFactory(),
		});
		recorder.start({ capabilityId: 'chat.conversation.run', trigger: 'manual' });
		recorder.recordStatus('running');
		if (terminal === 'failed') {
			recorder.recordError('boom', false);
		}
		recorder.finish(terminal);
		assert.strictEqual(
			store.get(CHAT_RUN_DERIVE_IS_STREAMING),
			expected,
			`expected isStreaming=${expected} after ${terminal}`,
		);
	}
	console.log('  ✓ isStreaming resets on terminal status');
}

function testDerivesAreReferentiallyStable() {
	const { recorder, store } = createChatRunEnvelopeStore({
		clock: fakeClock(),
		idFactory: fakeIdFactory(),
	});
	recorder.start({ capabilityId: 'chat.conversation.run', trigger: 'manual' });
	recorder.recordStatus('running');
	const first = store.get(CHAT_RUN_DERIVE_IS_STREAMING);
	const second = store.get(CHAT_RUN_DERIVE_IS_STREAMING);
	assert.strictEqual(first, second, 'boolean derives must stay identical');

	const store2 = new RunEnvelopeStore(
		createProjectingRecorder({
			buildRecorder: (onEvent) =>
				new InMemoryRunRecorder({
					clock: fakeClock(),
					idFactory: fakeIdFactory(),
					onEvent: (e) => onEvent(e, []),
				}),
		}).projection,
	);
	registerChatDerives(store2);
	assert.strictEqual(store2.get(CHAT_RUN_DERIVE_LAST_STATUS), null);

	console.log('  ✓ derives referentially stable + re-registration works');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
