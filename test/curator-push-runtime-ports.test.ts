// T11E (2026-06-25): Curator Push runtime fake-port tests.
//
// These tests prove the runtime exercises every threshold + suppression
// rule without touching Obsidian, EventBus, AppContext, or Zustand. The
// composer in `src/app/usage/composeCuratorPushRuntime.ts` is the only
// place that wires real adapters; this test wires hand-rolled ports.

import assert from 'assert';
import { CuratorPushRuntime } from '@/service/usage/curator/CuratorPushRuntime';
import type {
	CuratorPushPorts,
	ContextUtilizationSnapshot,
} from '@/service/usage/curator/CuratorPushPorts';
import type { CuratorPushPayload } from '@/service/usage/curator/types';

interface FakeProjection {
	port: CuratorPushPorts['projection'];
	shown: CuratorPushPayload[];
	resetCount: number;
	setPushed(value: boolean): void;
	setDismissed(keys: string[]): void;
}

function makeFakeProjection(): FakeProjection {
	const shown: CuratorPushPayload[] = [];
	let resetCount = 0;
	let pushed = false;
	const dismissed = new Set<string>();
	return {
		shown,
		get resetCount() {
			return resetCount;
		},
		setPushed(value: boolean) {
			pushed = value;
		},
		setDismissed(keys: string[]) {
			keys.forEach((k) => dismissed.add(k));
		},
		port: {
			show(payload) {
				shown.push(payload);
				pushed = true;
			},
			reset() {
				resetCount++;
				pushed = false;
				dismissed.clear();
				shown.length = 0;
			},
			hasPushedThisSession() {
				return pushed;
			},
			isDismissed(key) {
				return dismissed.has(key);
			},
		},
	};
}

interface FakeUsageEvents {
	port: CuratorPushPorts['usageEvents'];
	emit(costUsd: number): void;
	subscriberCount(): number;
	disposeCalls: number;
}

function makeFakeUsageEvents(): FakeUsageEvents {
	let handler: ((e: { costUsd: number }) => void) | null = null;
	let disposeCalls = 0;
	return {
		get disposeCalls() {
			return disposeCalls;
		},
		emit(costUsd: number) {
			if (handler) handler({ costUsd });
		},
		subscriberCount() {
			return handler ? 1 : 0;
		},
		port: {
			onUsageRecorded(h) {
				handler = h;
				return () => {
					handler = null;
					disposeCalls++;
				};
			},
		},
	};
}

function makeFakeContext(initial: ContextUtilizationSnapshot): {
	port: CuratorPushPorts['context'];
	set(next: ContextUtilizationSnapshot): void;
} {
	let snap = initial;
	return {
		set(next) {
			snap = next;
		},
		port: {
			get() {
				return snap;
			},
		},
	};
}

interface FakeSettings {
	port: CuratorPushPorts['settings'];
	set(next: { usagePreviewEnabled: boolean }): void;
}

function makeFakeSettings(initial: boolean): FakeSettings {
	let value = initial;
	return {
		set(next) {
			value = next.usagePreviewEnabled;
		},
		port: {
			get() {
				return { usagePreviewEnabled: value };
			},
		},
	};
}

function buildRuntime(overrides: {
	usageEvents?: FakeUsageEvents;
	context?: ReturnType<typeof makeFakeContext>;
	projection?: FakeProjection;
	settings?: FakeSettings;
} = {}) {
	const usageEvents = overrides.usageEvents ?? makeFakeUsageEvents();
	const context = overrides.context ?? makeFakeContext({ used: 0, max: 0, ratio: 0 });
	const projection = overrides.projection ?? makeFakeProjection();
	const settings = overrides.settings ?? makeFakeSettings(true);
	const ports: CuratorPushPorts = {
		usageEvents: usageEvents.port,
		context: context.port,
		projection: projection.port,
		settings: settings.port,
	};
	const runtime = new CuratorPushRuntime(ports);
	return { runtime, usageEvents, context, projection, settings };
}

function testHighContextRatioProducesContextNearLimit(): void {
	const { runtime, usageEvents, context, projection } = buildRuntime({
		context: makeFakeContext({ used: 160_000, max: 200_000, ratio: 0.8 }),
	});
	runtime.start();
	usageEvents.emit(0.01);

	assert.strictEqual(projection.shown.length, 1, 'expected exactly one push');
	assert.strictEqual(projection.shown[0]!.reason, 'context-near-limit');
	assert.strictEqual(projection.shown[0]!.dismissKey, 'context-near-limit');
	assert.match(projection.shown[0]!.body, /80%/);

	void context;
	runtime.dispose();
	console.log('PASS: highContextRatioProducesContextNearLimit');
}

function testHighSpendProducesHighSpendPush(): void {
	const { runtime, usageEvents, projection } = buildRuntime();
	runtime.start();
	usageEvents.emit(0.6);
	assert.strictEqual(projection.shown.length, 0, 'sub-threshold spend must not push');
	usageEvents.emit(0.6); // cumulative $1.2 ≥ threshold
	assert.strictEqual(projection.shown.length, 1, 'expected high-spend push after threshold');
	assert.strictEqual(projection.shown[0]!.reason, 'high-spend');
	assert.strictEqual(projection.shown[0]!.dismissKey, 'high-spend');
	runtime.dispose();
	console.log('PASS: highSpendProducesHighSpendPush');
}

function testUsagePreviewDisabledSuppressesPushes(): void {
	const { runtime, usageEvents, projection } = buildRuntime({
		settings: makeFakeSettings(false),
		context: makeFakeContext({ used: 195_000, max: 200_000, ratio: 0.975 }),
	});
	runtime.start();
	usageEvents.emit(5);
	assert.strictEqual(projection.shown.length, 0, 'gate off must suppress all pushes');
	runtime.dispose();
	console.log('PASS: usagePreviewDisabledSuppressesPushes');
}

function testFirstPushThrottlesLaterPushes(): void {
	const { runtime, usageEvents, projection, context } = buildRuntime({
		context: makeFakeContext({ used: 180_000, max: 200_000, ratio: 0.9 }),
	});
	runtime.start();
	usageEvents.emit(0.01);
	assert.strictEqual(projection.shown.length, 1);
	// Push a second event with high spend — runtime should suppress because
	// projection.hasPushedThisSession() is true.
	context.set({ used: 0, max: 0, ratio: 0 });
	usageEvents.emit(5);
	assert.strictEqual(projection.shown.length, 1, 'second push must be throttled within one session');
	runtime.dispose();
	console.log('PASS: firstPushThrottlesLaterPushes');
}

function testDismissedKeySuppressesSameSignal(): void {
	const { runtime, usageEvents, projection } = buildRuntime({
		context: makeFakeContext({ used: 180_000, max: 200_000, ratio: 0.9 }),
	});
	projection.setDismissed(['context-near-limit']);
	runtime.start();
	usageEvents.emit(0.01);
	assert.strictEqual(projection.shown.length, 0, 'dismissed key must suppress that signal');
	// High-spend should still fire because its dismissKey is independent.
	usageEvents.emit(5);
	assert.strictEqual(projection.shown.length, 1);
	assert.strictEqual(projection.shown[0]!.reason, 'high-spend');
	runtime.dispose();
	console.log('PASS: dismissedKeySuppressesSameSignal');
}

function testDisposeUnsubscribesAndResets(): void {
	const { runtime, usageEvents, projection } = buildRuntime({
		context: makeFakeContext({ used: 180_000, max: 200_000, ratio: 0.9 }),
	});
	runtime.start();
	usageEvents.emit(0.01);
	assert.strictEqual(projection.shown.length, 1);
	assert.strictEqual(usageEvents.subscriberCount(), 1);

	runtime.dispose();
	assert.strictEqual(usageEvents.disposeCalls, 1, 'dispose must unsubscribe');
	assert.strictEqual(usageEvents.subscriberCount(), 0);
	assert.strictEqual(projection.resetCount, 1, 'dispose must reset projection');
	assert.strictEqual(projection.shown.length, 0, 'reset clears prior shown list');

	// Idempotent: a second dispose must not throw.
	runtime.dispose();
	console.log('PASS: disposeUnsubscribesAndResets');
}

function testDoubleStartFailsLoud(): void {
	const { runtime } = buildRuntime();
	runtime.start();
	assert.throws(() => runtime.start(), /already started/i);
	runtime.dispose();
	console.log('PASS: doubleStartFailsLoud');
}

function testZeroCtxMaxDoesNotMisfireContextPush(): void {
	// When chat hook can't resolve maxCtx (mobile bootstrap, custom model)
	// the snapshot is {0,0,0}. Runtime must not push context-near-limit.
	const { runtime, usageEvents, projection } = buildRuntime({
		context: makeFakeContext({ used: 999_999, max: 0, ratio: 0 }),
	});
	runtime.start();
	usageEvents.emit(0.01);
	assert.strictEqual(projection.shown.length, 0);
	runtime.dispose();
	console.log('PASS: zeroCtxMaxDoesNotMisfireContextPush');
}

function testRuntimeAcceptsOnlyHandRolledPorts(): void {
	// Smoke: constructing the runtime + running through start/emit/dispose
	// with hand-rolled ports proves the runtime has no hidden dependency on
	// Obsidian, EventBus, AppContext, or Zustand. If any of those were
	// reached, the test would fail at runtime (the bare Node env does not
	// load them).
	const { runtime, usageEvents } = buildRuntime();
	runtime.start();
	usageEvents.emit(0);
	runtime.dispose();
	console.log('PASS: runtimeAcceptsOnlyHandRolledPorts');
}

function main(): void {
	testHighContextRatioProducesContextNearLimit();
	testHighSpendProducesHighSpendPush();
	testUsagePreviewDisabledSuppressesPushes();
	testFirstPushThrottlesLaterPushes();
	testDismissedKeySuppressesSameSignal();
	testDisposeUnsubscribesAndResets();
	testDoubleStartFailsLoud();
	testZeroCtxMaxDoesNotMisfireContextPush();
	testRuntimeAcceptsOnlyHandRolledPorts();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
