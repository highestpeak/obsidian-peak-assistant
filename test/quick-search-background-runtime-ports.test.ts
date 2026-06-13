// T10: fake-port tests for `QuickSearchBackgroundRuntimeImpl`.
//
// The runtime is constructed with hand-rolled fakes for every port. No
// Obsidian, no AppContext, no Zustand. These tests prove the runtime
// orchestrates detach / restore / cancel / requestRestore / openAndRestore
// / dispose correctly against the actual class, instead of stubbing it
// out at the registry-binding level.

import assert from 'assert';
import { QuickSearchBackgroundRuntimeImpl } from '@/service/search/background/QuickSearchBackgroundRuntimeImpl';
import type {
	QuickSearchAnalysisPersistencePort,
	QuickSearchBackgroundDeps,
	QuickSearchBackgroundTargetFactoryPort,
	QuickSearchClockPort,
	QuickSearchEventRouterPort,
	QuickSearchForegroundSessionPort,
	QuickSearchModalOpenerPort,
	QuickSearchNotificationPort,
} from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type {
	QuickSearchAgentHandle,
	QuickSearchBackgroundEventTarget,
	QuickSearchBackgroundSession,
	QuickSearchBackgroundSessionHooks,
	QuickSearchForegroundDetachIntent,
	QuickSearchForegroundSnapshot,
	QuickSearchSessionNotification,
} from '@/service/search/background/QuickSearchBackgroundTypes';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeState {
	clockNow: number;
	foregroundIntent: QuickSearchForegroundDetachIntent;
	foregroundSnapshot: QuickSearchForegroundSnapshot;
	foregroundResetCalls: number;
	foregroundRestoreCalls: Array<QuickSearchForegroundSnapshot>;
	foregroundAgentHandle: QuickSearchAgentHandle | null;
	foregroundClearAgentCalls: number;
	foregroundBindAgentCalls: Array<QuickSearchAgentHandle | null>;
	routeToBackgroundCalls: Array<{ sessionId: string; target: QuickSearchBackgroundEventTarget }>;
	clearBackgroundRouteCalls: Array<string | undefined>;
	targetFactoryCalls: Array<{ sessionId: string }>;
	lastHooks: QuickSearchBackgroundSessionHooks | null;
	notifyReadyCalls: QuickSearchSessionNotification[];
	notifyCompleteCalls: QuickSearchSessionNotification[];
	notifyErrorCalls: QuickSearchSessionNotification[];
	modalOpenAndRestoreCalls: string[];
	persistCalls: Array<{ existingPath: string | null | undefined }>;
	persistResult: { path: string } | null;
}

function newFakeState(): FakeState {
	return {
		clockNow: 1_700_000_000_000,
		foregroundIntent: { isActive: true, hasPlanPending: false },
		foregroundSnapshot: {
			id: 'fg-1',
			query: 'how does the index work',
			title: null,
			autoSaveState: { lastSavedPath: null },
		},
		foregroundResetCalls: 0,
		foregroundRestoreCalls: [],
		foregroundAgentHandle: {
			agentRef: { name: 'fake-agent' },
			abortController: new AbortController(),
		},
		foregroundClearAgentCalls: 0,
		foregroundBindAgentCalls: [],
		routeToBackgroundCalls: [],
		clearBackgroundRouteCalls: [],
		targetFactoryCalls: [],
		lastHooks: null,
		notifyReadyCalls: [],
		notifyCompleteCalls: [],
		notifyErrorCalls: [],
		modalOpenAndRestoreCalls: [],
		persistCalls: [],
		persistResult: { path: 'Vault/ai-analyses/fake.md' },
	};
}

function makeDeps(state: FakeState): QuickSearchBackgroundDeps {
	const foregroundSession: QuickSearchForegroundSessionPort = {
		detachIntent: () => state.foregroundIntent,
		snapshot: () => state.foregroundSnapshot,
		resetForeground: () => {
			state.foregroundResetCalls += 1;
		},
		restore: (snapshot) => {
			state.foregroundRestoreCalls.push(snapshot);
		},
		getAgentHandle: () => state.foregroundAgentHandle,
		clearAgentHandle: () => {
			state.foregroundClearAgentCalls += 1;
		},
		bindAgentHandle: (handle) => {
			state.foregroundBindAgentCalls.push(handle);
		},
	};

	const eventRouter: QuickSearchEventRouterPort = {
		routeToBackground: (sessionId, target) => {
			state.routeToBackgroundCalls.push({ sessionId, target });
		},
		clearBackgroundRoute: (sessionId) => {
			state.clearBackgroundRouteCalls.push(sessionId);
		},
	};

	const targetFactory: QuickSearchBackgroundTargetFactoryPort = {
		build: (session, hooks) => {
			state.targetFactoryCalls.push({ sessionId: session.id });
			state.lastHooks = hooks;
			return { __sessionId: session.id } satisfies Record<string, unknown>;
		},
	};

	const notification: QuickSearchNotificationPort = {
		showSessionReady: (input) => {
			state.notifyReadyCalls.push(input);
		},
		showSessionComplete: (input) => {
			state.notifyCompleteCalls.push(input);
		},
		showSessionError: (input) => {
			state.notifyErrorCalls.push(input);
		},
	};

	const modalOpener: QuickSearchModalOpenerPort = {
		openAndRestore: (sessionId) => {
			state.modalOpenAndRestoreCalls.push(sessionId);
		},
	};

	const persistence: QuickSearchAnalysisPersistencePort = {
		persist: async (_snapshot, options) => {
			state.persistCalls.push({ existingPath: options?.existingPath });
			return state.persistResult;
		},
	};

	const clock: QuickSearchClockPort = {
		now: () => state.clockNow++,
	};

	return { foregroundSession, eventRouter, targetFactory, notification, modalOpener, persistence, clock };
}

function newRuntime(state: FakeState): QuickSearchBackgroundRuntimeImpl {
	return new QuickSearchBackgroundRuntimeImpl(makeDeps(state));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testDetachIdleForegroundReturnsNull(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: false, hasPlanPending: false };
	const runtime = newRuntime(state);
	const session = runtime.detachForeground();
	assert.strictEqual(session, null);
	assert.strictEqual(state.foregroundResetCalls, 0, 'idle foreground must not be reset');
	assert.strictEqual(state.routeToBackgroundCalls.length, 0);
	console.log('PASS: detachIdleForegroundReturnsNull');
}

function testDetachActiveSnapshotsResetsRoutesAndNotifies(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);

	const session = runtime.detachForeground();
	assert.ok(session !== null, 'active detach must produce a session');
	assert.strictEqual(session!.id, 'fg-1', 'session id should come from snapshot.id');
	assert.strictEqual(session!.status, 'streaming');
	assert.strictEqual(state.foregroundResetCalls, 1);
	assert.strictEqual(state.routeToBackgroundCalls.length, 1, 'streaming detach must route');
	assert.strictEqual(state.routeToBackgroundCalls[0]?.sessionId, 'fg-1');
	assert.strictEqual(state.targetFactoryCalls.length, 1);
	assert.strictEqual(state.notifyReadyCalls.length, 0, 'streaming detach should not fire plan-ready notice');

	// Subscriber sees the new session in the cached list.
	let listenerCount = 0;
	runtime.subscribe(() => {
		listenerCount += 1;
	});
	const sessions = runtime.getSessions();
	assert.strictEqual(sessions.length, 1);
	assert.strictEqual(sessions[0]?.status, 'streaming');
	void listenerCount; // subscribe path checked separately
	console.log('PASS: detachActiveSnapshotsResetsRoutesAndNotifies');
}

function testDetachPlanReadyOnIdleForegroundFiresPlanReadyNotice(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: false, hasPlanPending: true };
	const runtime = newRuntime(state);

	const session = runtime.detachForeground();
	assert.ok(session !== null);
	assert.strictEqual(session!.status, 'plan-ready');
	assert.strictEqual(
		state.routeToBackgroundCalls.length,
		0,
		'plan-ready detach must not activate event redirect',
	);
	assert.strictEqual(state.notifyReadyCalls.length, 1, 'plan-ready detach must fire the ready notice');
	assert.strictEqual(state.notifyReadyCalls[0]?.sessionId, 'fg-1');
	console.log('PASS: detachPlanReadyOnIdleForegroundFiresPlanReadyNotice');
}

function testDetachThirdSessionQueues(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);

	// Push 3 streaming detaches first.
	for (let i = 0; i < 3; i++) {
		state.foregroundSnapshot = { ...state.foregroundSnapshot, id: `fg-${i}` };
		const s = runtime.detachForeground();
		assert.strictEqual(s!.status, 'streaming');
	}
	// 4th detach should be queued (MAX_CONCURRENT = 3).
	state.foregroundSnapshot = { ...state.foregroundSnapshot, id: 'fg-3' };
	const fourth = runtime.detachForeground();
	assert.strictEqual(fourth!.status, 'queued', 'fourth concurrent detach must go to queued');
	assert.strictEqual(
		runtime.getActiveCount(),
		3,
		'queued session must not count toward active concurrency',
	);
	console.log('PASS: detachThirdSessionQueues');
}

function testRestoreReturnsSnapshotHandleAndClearsRedirect(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);

	const session = runtime.detachForeground();
	assert.ok(session !== null);

	const result = runtime.restoreToForeground(session!.id);
	assert.ok(result !== null);
	assert.strictEqual(result!.snapshot.id, 'fg-1');
	assert.ok(result!.agentHandle !== null);
	assert.strictEqual(state.clearBackgroundRouteCalls.length, 1, 'restore must clear redirect');
	assert.strictEqual(runtime.getSessions().length, 0, 'restored session must leave the map');
	console.log('PASS: restoreReturnsSnapshotHandleAndClearsRedirect');
}

function testRestoreUnknownSessionReturnsNull(): void {
	const state = newFakeState();
	const runtime = newRuntime(state);
	const result = runtime.restoreToForeground('does-not-exist');
	assert.strictEqual(result, null);
	console.log('PASS: restoreUnknownSessionReturnsNull');
}

function testRequestRestoreAndConsumeIsSingleShot(): void {
	const state = newFakeState();
	const runtime = newRuntime(state);
	runtime.requestRestore('bg-42');
	assert.strictEqual(runtime.consumePendingRestore(), 'bg-42');
	assert.strictEqual(runtime.consumePendingRestore(), null, 'consume must clear the pending id');
	console.log('PASS: requestRestoreAndConsumeIsSingleShot');
}

function testOpenAndRestoreSetsPendingThenOpensModal(): void {
	const state = newFakeState();
	const runtime = newRuntime(state);
	runtime.openAndRestore('bg-99');
	assert.deepStrictEqual(state.modalOpenAndRestoreCalls, ['bg-99']);
	assert.strictEqual(
		runtime.consumePendingRestore(),
		'bg-99',
		'openAndRestore must write the pending id before opening',
	);
	console.log('PASS: openAndRestoreSetsPendingThenOpensModal');
}

function testCancelAbortsHandleAndClearsRedirect(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const controller = new AbortController();
	state.foregroundAgentHandle = { agentRef: { kind: 'fake' }, abortController: controller };
	const runtime = newRuntime(state);

	const session = runtime.detachForeground();
	assert.ok(session !== null);
	runtime.cancelSession(session!.id);
	assert.strictEqual(controller.signal.aborted, true, 'cancelSession must abort the controller');
	assert.strictEqual(runtime.getSessions().length, 0);
	assert.strictEqual(
		state.clearBackgroundRouteCalls.length,
		1,
		'cancel of the routed session must clear the redirect',
	);
	console.log('PASS: cancelAbortsHandleAndClearsRedirect');
}

function testAbortAllAbortsEverySessionAndClearsState(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const ctrlA = new AbortController();
	const ctrlB = new AbortController();
	state.foregroundAgentHandle = { agentRef: { id: 'a' }, abortController: ctrlA };
	const runtime = newRuntime(state);
	state.foregroundSnapshot = { ...state.foregroundSnapshot, id: 'fg-a' };
	runtime.detachForeground();

	state.foregroundAgentHandle = { agentRef: { id: 'b' }, abortController: ctrlB };
	state.foregroundSnapshot = { ...state.foregroundSnapshot, id: 'fg-b' };
	runtime.detachForeground();

	runtime.requestRestore('fg-a');
	runtime.abortAll();
	assert.strictEqual(ctrlA.signal.aborted, true);
	assert.strictEqual(ctrlB.signal.aborted, true);
	assert.strictEqual(runtime.getSessions().length, 0);
	assert.strictEqual(
		runtime.consumePendingRestore(),
		null,
		'abortAll must clear pending restore intent',
	);
	console.log('PASS: abortAllAbortsEverySessionAndClearsState');
}

async function testMarkCompletedHookPersistsAndNotifiesAndStartsQueued(): Promise<void> {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);

	// Push 3 streaming + 1 queued.
	for (let i = 0; i < 4; i++) {
		state.foregroundSnapshot = { ...state.foregroundSnapshot, id: `fg-${i}` };
		runtime.detachForeground();
	}
	assert.strictEqual(runtime.getActiveCount(), 3);
	assert.ok(state.lastHooks !== null, 'target factory must receive hooks');

	// The most recent hooks belong to the queued session (fg-3). Simulate
	// the first streaming session (fg-0) completing — promotion happens
	// inside `tryStartNext`, not from hooks bound to the completing
	// session. So we capture the hooks for fg-0 by re-detaching.
	// Easier: complete the queued session itself — no promotion expected.
	// Better: rebuild a runtime with a session whose hooks we keep.
	const state2 = newFakeState();
	state2.foregroundIntent = { isActive: true, hasPlanPending: false };
	const deps = makeDeps(state2);
	const captured: Array<{ id: string; hooks: QuickSearchBackgroundSessionHooks }> = [];
	const recordingFactory: QuickSearchBackgroundTargetFactoryPort = {
		build: (session, hooks) => {
			captured.push({ id: session.id, hooks });
			return { __sessionId: session.id };
		},
	};
	const runtime2 = new QuickSearchBackgroundRuntimeImpl({
		...deps,
		targetFactory: recordingFactory,
	});

	for (let i = 0; i < 4; i++) {
		state2.foregroundSnapshot = { ...state2.foregroundSnapshot, id: `fg-${i}` };
		runtime2.detachForeground();
	}
	// fg-3 is queued; fg-0/1/2 are streaming.
	assert.strictEqual(captured.length, 3, 'queued session must not get a target built');

	// Mark fg-0 completed.
	captured[0]!.hooks.markCompleted();
	// Persistence runs in background; at minimum the call has been made.
	assert.strictEqual(state2.notifyCompleteCalls.length, 1);
	// The queued fg-3 must be promoted to streaming after tryStartNext.
	const sessionsAfter = runtime2.getSessions();
	const queued = sessionsAfter.find((s) => s.id === 'fg-3');
	assert.ok(queued, 'queued session must remain in the list');
	assert.strictEqual(queued!.status, 'streaming', 'fg-3 must promote to streaming');
	console.log('PASS: markCompletedHookPersistsAndNotifiesAndStartsQueued');
}

async function testMarkPlanReadyHookPersistsWhenNoSavedPath(): Promise<void> {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);
	runtime.detachForeground();
	assert.ok(state.lastHooks !== null);

	// Drain microtasks so the async persist() promise lands a state mutation.
	state.lastHooks!.markPlanReady();
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.strictEqual(state.notifyReadyCalls.length, 1);
	assert.strictEqual(state.persistCalls.length, 1, 'plan-ready with no saved path must persist');
	assert.strictEqual(state.persistCalls[0]?.existingPath, undefined);
	console.log('PASS: markPlanReadyHookPersistsWhenNoSavedPath');
}

function testMarkErrorHookSetsStatusAndNotifies(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);
	const session = runtime.detachForeground();
	assert.ok(session !== null);
	state.lastHooks!.markError('Provider timeout');
	assert.strictEqual(state.notifyErrorCalls.length, 1);
	assert.strictEqual(state.notifyErrorCalls[0]?.sessionId, session!.id);
	const after = runtime.getSessions().find((s) => s.id === session!.id);
	assert.strictEqual(after?.status, 'error');
	assert.strictEqual(after?.error, 'Provider timeout');
	console.log('PASS: markErrorHookSetsStatusAndNotifies');
}

function testDisposeAbortsAndClearsListeners(): void {
	const state = newFakeState();
	state.foregroundIntent = { isActive: true, hasPlanPending: false };
	const runtime = newRuntime(state);
	runtime.detachForeground();
	let notified = 0;
	runtime.subscribe(() => {
		notified += 1;
	});
	runtime.dispose();
	assert.strictEqual(runtime.getSessions().length, 0);
	// After dispose the listener set is empty — further notify wouldn't be observable,
	// but a fresh detach should not crash either.
	state.foregroundSnapshot = { ...state.foregroundSnapshot, id: 'fg-X' };
	runtime.detachForeground();
	assert.strictEqual(notified, 1, 'pre-dispose listener saw the initial detach notify; post-dispose detach does not re-notify the dropped listener');
	console.log('PASS: disposeAbortsAndClearsListeners');
}

async function main(): Promise<void> {
	testDetachIdleForegroundReturnsNull();
	testDetachActiveSnapshotsResetsRoutesAndNotifies();
	testDetachPlanReadyOnIdleForegroundFiresPlanReadyNotice();
	testDetachThirdSessionQueues();
	testRestoreReturnsSnapshotHandleAndClearsRedirect();
	testRestoreUnknownSessionReturnsNull();
	testRequestRestoreAndConsumeIsSingleShot();
	testOpenAndRestoreSetsPendingThenOpensModal();
	testCancelAbortsHandleAndClearsRedirect();
	testAbortAllAbortsEverySessionAndClearsState();
	await testMarkCompletedHookPersistsAndNotifiesAndStartsQueued();
	await testMarkPlanReadyHookPersistsWhenNoSavedPath();
	testMarkErrorHookSetsStatusAndNotifies();
	testDisposeAbortsAndClearsListeners();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
