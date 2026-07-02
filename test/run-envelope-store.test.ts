// T7 — RunEnvelopeStore + deriveEvents memoization semantics.

import assert from 'assert';
import {
	InMemoryRunRecorder,
	RunEnvelopeStore,
	createProjectingRecorder,
	defaultClock,
	deriveEvents,
} from '@/service/run-envelope';
import type { RunEvent, RunIdFactory } from '@/service/run-envelope';

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

function makePair(prefix: string) {
	let capturedRecorder: InMemoryRunRecorder | null = null;
	const { recorder, projection } = createProjectingRecorder({
		buildRecorder: (onEvent) => {
			const r = new InMemoryRunRecorder({
				clock: defaultClock(),
				idFactory: makeFakeIdFactory(prefix),
				onEvent: (event) => onEvent(event, capturedRecorder ? capturedRecorder.getEvents() : []),
			});
			capturedRecorder = r;
			return r;
		},
	});
	return { recorder, projection };
}

// ---------------------------------------------------------------------------
// Rule 1 — deriveEvents caches by projection snapshot ref.
// ---------------------------------------------------------------------------

async function testDeriveCachesUntilChange(): Promise<void> {
	const { recorder, projection } = makePair('cache');

	let computeCount = 0;
	const count = deriveEvents(projection, (events) => {
		computeCount += 1;
		return events.length;
	});

	assert.strictEqual(count.get(), 0);
	const cached = computeCount;
	count.get(); count.get(); count.get();
	assert.strictEqual(computeCount, cached, 'derive must not recompute when snapshot ref unchanged');

	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	assert.strictEqual(count.get(), 1, 'after event: derive updates');
	assert.ok(computeCount > cached, 'derive recomputes when snapshot ref changes');
	console.log('PASS: deriveCachesUntilChange');
}

// ---------------------------------------------------------------------------
// Rule 2 — subscribers fire only when derive value changes by ref.
// ---------------------------------------------------------------------------

async function testSubscribersFireOnValueChange(): Promise<void> {
	const { recorder, projection } = makePair('subs');

	// Selector returns a constant → no downstream subscribers should fire.
	const constDerive = deriveEvents(projection, (_events) => 42);
	let constFires = 0;
	constDerive.subscribe(() => { constFires += 1; });

	recorder.start({ capabilityId: 'x', trigger: 'manual' });
	recorder.recordStatus('running');
	recorder.recordArtifact({ kind: 'result' });
	assert.strictEqual(constFires, 0, 'stable value must not fire subscribers');

	// Selector that changes each new event → subscribers fire on next mutation.
	const lenDerive = deriveEvents(projection, (events) => events.length);
	let lenFires = 0;
	let lastLen = -1;
	lenDerive.subscribe((v) => { lenFires += 1; lastLen = v; });

	recorder.finish('completed');
	assert.ok(lenFires >= 1, 'value-changing selector must fire at least once');
	assert.ok(lastLen > 0, 'last observed length must be positive');
	console.log('PASS: subscribersFireOnValueChange');
}

// ---------------------------------------------------------------------------
// Rule 3 — RunEnvelopeStore register/get/subscribe.
// ---------------------------------------------------------------------------

async function testStoreLifecycle(): Promise<void> {
	const { recorder, projection } = makePair('store');
	const store = new RunEnvelopeStore(projection);

	store.register<number>('artifactCount', (events) => events.filter((e) => e.type === 'artifact').length);
	store.register<string | null>('lastStatus', (events) => {
		for (let i = events.length - 1; i >= 0; i--) {
			const e = events[i]!;
			if (e.type === 'status') return e.status;
		}
		return null;
	});

	assert.strictEqual(store.get<number>('artifactCount'), 0);
	assert.strictEqual(store.get<string | null>('lastStatus'), null);

	let notified: number | null = null;
	const unsub = store.subscribe<number>('artifactCount', (n) => { notified = n; });

	recorder.start({ capabilityId: 'cap', trigger: 'manual' });
	assert.strictEqual(store.get<string | null>('lastStatus'), 'queued');
	assert.strictEqual(notified, null, 'artifactCount still 0 → subscriber did not fire');

	recorder.recordArtifact({ kind: 'result', title: 'r' });
	assert.strictEqual(store.get<number>('artifactCount'), 1);
	assert.strictEqual(notified, 1, 'artifact event → subscriber fired');

	unsub();
	recorder.recordArtifact({ kind: 'result', title: 'r2' });
	assert.strictEqual(notified, 1, 'after unsub, no further notifications');
	console.log('PASS: storeLifecycle');
}

// ---------------------------------------------------------------------------
// Rule 4 — duplicate register + unknown get/subscribe → fail-loud.
// ---------------------------------------------------------------------------

function testStoreErrorHandling(): void {
	const { projection } = makePair('errs');
	const store = new RunEnvelopeStore(projection);
	store.register('x', (e) => e.length);

	let thrown: unknown = null;
	try { store.register('x', (e) => e.length); } catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error && /already registered/.test(thrown.message));

	thrown = null;
	try { store.get('y'); } catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error && /no derive registered/.test(thrown.message));

	thrown = null;
	try { store.subscribe('y', () => {}); } catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error && /no derive registered/.test(thrown.message));

	console.log('PASS: storeErrorHandling');
}

// ---------------------------------------------------------------------------
// Rule 5 — dispose releases everything.
// ---------------------------------------------------------------------------

function testDispose(): void {
	const { projection } = makePair('disp');
	const store = new RunEnvelopeStore(projection);
	store.register('a', (e) => e.length);
	store.register('b', (e) => e.length);
	store.dispose();
	let thrown: unknown = null;
	try { store.get('a'); } catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error, 'after dispose, derives gone');
	console.log('PASS: dispose');
}

async function run(): Promise<void> {
	testStoreErrorHandling();
	testDispose();
	await testDeriveCachesUntilChange();
	await testSubscribersFireOnValueChange();
	await testStoreLifecycle();
	console.log('run-envelope-store: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
