// T7 UI RunEvent Projection — framework-agnostic subscription guard.

import assert from 'assert';
import {
	InMemoryRunRecorder,
	createProjectingRecorder,
	defaultClock,
} from '@/service/run-envelope';
import type { RunEvent, RunIdFactory } from '@/service/run-envelope';

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

async function testProjectionAccumulatesEvents(): Promise<void> {
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory('proj-test'),
				onEvent: (event) => {
					// The projection expects (event, snapshot) — we take
					// the snapshot from the closure-captured recorder.
					onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []);
				},
			});
			capturedRecorder = r;
			return r;
		},
	});

	// Initial snapshot is empty.
	assert.strictEqual(projection.getSnapshot().length, 0);

	recorder.start({ capabilityId: 'test.projection', trigger: 'manual' });
	// After start(), snapshot has one status(queued) event.
	assert.strictEqual(projection.getSnapshot().length, 1);
	assert.strictEqual(projection.getSnapshot()[0]!.type, 'status');

	recorder.recordStatus('running');
	assert.strictEqual(projection.getSnapshot().length, 2);

	recorder.finish('completed');
	assert.strictEqual(projection.getSnapshot().length, 3);

	console.log('PASS: projectionAccumulatesEvents');
}

async function testSubscribeFiresOnEveryEvent(): Promise<void> {
	let calls = 0;
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory('sub-test'),
				onEvent: (event) => onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []),
			});
			capturedRecorder = r;
			return r;
		},
	});
	const unsub = projection.subscribe(() => { calls += 1; });
	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	recorder.recordStatus('running');
	recorder.finish('completed');
	assert.strictEqual(calls, 3, `expected 3 notifications, got ${calls}`);
	unsub();
	console.log('PASS: subscribeFiresOnEveryEvent');
}

async function testUnsubscribeStopsCallbacks(): Promise<void> {
	let calls = 0;
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory('unsub-test'),
				onEvent: (event) => onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []),
			});
			capturedRecorder = r;
			return r;
		},
	});
	const unsub = projection.subscribe(() => { calls += 1; });
	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	assert.strictEqual(calls, 1);
	unsub();
	recorder.recordStatus('running');
	recorder.finish('completed');
	assert.strictEqual(calls, 1, `expected no further notifications, got ${calls}`);
	console.log('PASS: unsubscribeStopsCallbacks');
}

async function testMultipleSubscribersAllFire(): Promise<void> {
	let a = 0, b = 0;
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory('multi-test'),
				onEvent: (event) => onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []),
			});
			capturedRecorder = r;
			return r;
		},
	});
	projection.subscribe(() => { a += 1; });
	projection.subscribe(() => { b += 1; });
	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	assert.strictEqual(a, 1);
	assert.strictEqual(b, 1);
	console.log('PASS: multipleSubscribersAllFire');
}

async function testGetSnapshotReturnsSameArrayWhenUnchanged(): Promise<void> {
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory('ref-test'),
				onEvent: (event) => onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []),
			});
			capturedRecorder = r;
			return r;
		},
	});
	const empty1 = projection.getSnapshot();
	const empty2 = projection.getSnapshot();
	assert.strictEqual(empty1, empty2, 'getSnapshot must return the same reference when unchanged');
	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	const first = projection.getSnapshot();
	const firstAgain = projection.getSnapshot();
	assert.strictEqual(first, firstAgain, 'getSnapshot must be referentially stable between mutations');
	assert.notStrictEqual(empty1, first, 'a mutation must yield a different reference');
	void recorder;
	void projection.subscribe;
	// Also verify events look like RunEvent.
	const ev = first[0]!;
	assert.strictEqual((ev as RunEvent).type, 'status');
	console.log('PASS: getSnapshotReturnsSameArrayWhenUnchanged');
}

async function run(): Promise<void> {
	await testProjectionAccumulatesEvents();
	await testSubscribeFiresOnEveryEvent();
	await testUnsubscribeStopsCallbacks();
	await testMultipleSubscribersAllFire();
	await testGetSnapshotReturnsSameArrayWhenUnchanged();
	console.log('run-envelope-projection: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
