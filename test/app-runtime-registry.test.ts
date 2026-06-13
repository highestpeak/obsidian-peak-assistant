// T6R / T8: app-owned runtime registry tests.
//
// T6R moved Vault Lint runtime binding semantics out of a service-layer
// module singleton onto `AppRuntimeRegistry`. T8 adds Ambient as the
// second capability — these tests assert the registry treats both
// capabilities the same way (fail-loud get, soft tryGet, double-bind
// rejection, clear-then-rebind, idempotent clear) and that
// `clearAmbientRuntime` disposes the bound runtime.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { AppRuntimeRegistry } from '@/app/runtime/AppRuntimeRegistry';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { LintScanResult } from '@/service/lint/types';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';

function fakeRuntime(stamp: string): VaultLintRuntime {
	return {
		async runFullScan() {
			return {
				id: `${stamp}-result`,
				scanType: 'full',
				startedAt: 0,
				completedAt: 0,
				durationMs: 0,
				totalNotes: 0,
				healthScore: 0,
				dimensionScores: { structural: 0, content: 0, temporal: 0, semantic: 0, tags: 0 },
				findings: [],
				signalCounts: {},
			} satisfies LintScanResult;
		},
		async loadLatestScan() {
			return null;
		},
	};
}

function testGetVaultLintRuntimeFailsLoudBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.throws(
		() => registry.getVaultLintRuntime(),
		/no runtime is bound/,
		'getVaultLintRuntime must fail-loud before composition runs',
	);
	console.log('PASS: getVaultLintRuntimeFailsLoudBeforeSet');
}

function testTryGetVaultLintRuntimeReturnsNullBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.strictEqual(
		registry.tryGetVaultLintRuntime(),
		null,
		'tryGetVaultLintRuntime must return null before composition runs',
	);
	console.log('PASS: tryGetVaultLintRuntimeReturnsNullBeforeSet');
}

async function testSetVaultLintRuntimeStoresInstanceAndAllowsScans(): Promise<void> {
	const registry = new AppRuntimeRegistry();
	const runtime = fakeRuntime('binding-roundtrip');
	registry.setVaultLintRuntime(runtime);

	assert.strictEqual(
		registry.getVaultLintRuntime(),
		runtime,
		'registry must return the exact instance that was set',
	);
	assert.strictEqual(
		registry.tryGetVaultLintRuntime(),
		runtime,
		'tryGet must agree with get when bound',
	);
	const result = await registry.getVaultLintRuntime().runFullScan();
	assert.strictEqual(result.id, 'binding-roundtrip-result');
	console.log('PASS: setVaultLintRuntimeStoresInstanceAndAllowsScans');
}

function testSetVaultLintRuntimeRejectsDoubleBindWithoutClear(): void {
	const registry = new AppRuntimeRegistry();
	registry.setVaultLintRuntime(fakeRuntime('first'));
	assert.throws(
		() => registry.setVaultLintRuntime(fakeRuntime('second')),
		/already bound/,
		'setVaultLintRuntime must reject a second bind without an intervening clear',
	);
	console.log('PASS: setVaultLintRuntimeRejectsDoubleBindWithoutClear');
}

function testClearVaultLintRuntimeAllowsRebind(): void {
	const registry = new AppRuntimeRegistry();
	registry.setVaultLintRuntime(fakeRuntime('one'));
	registry.clearVaultLintRuntime();
	// After clear, fail-loud again.
	assert.throws(() => registry.getVaultLintRuntime(), /no runtime is bound/);
	// Idempotent clear: second clear is a no-op.
	registry.clearVaultLintRuntime();
	// Can re-bind a fresh runtime.
	registry.setVaultLintRuntime(fakeRuntime('two'));
	assert.ok(registry.tryGetVaultLintRuntime() !== null);
	console.log('PASS: clearVaultLintRuntimeAllowsRebind');
}

function testRegistryFileDoesNotReachAppShellOrObsidian(): void {
	const registryPath = path.resolve(
		process.cwd(),
		'src/app/runtime/AppRuntimeRegistry.ts',
	);
	const source = fs.readFileSync(registryPath, 'utf8');
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');

	// The registry is owned by AppContext but does NOT itself reach
	// Obsidian, sqlite, the service singleton zoo, or AppContext.
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	const specs: string[] = [];
	while ((m = re.exec(source)) !== null) specs.push(m[1]!);

	for (const spec of specs) {
		assert.ok(
			!/^obsidian/.test(spec),
			`AppRuntimeRegistry must not import obsidian, found '${spec}'`,
		);
		assert.ok(
			!/SqliteStoreManager/.test(spec),
			'AppRuntimeRegistry must not import SqliteStoreManager',
		);
		assert.ok(
			!/AppContext/.test(spec),
			'AppRuntimeRegistry must not import AppContext (the relationship is owner -> owned, not the reverse)',
		);
	}
	assert.ok(
		/let\s+/.test(code) === false,
		'AppRuntimeRegistry must not declare top-level `let` bindings — runtime state lives on the instance',
	);
	console.log('PASS: registryFileDoesNotReachAppShellOrObsidian');
}

function testAppContextDelegatesStaticAccessorsToRegistry(): void {
	// Source-scan only — instantiating AppContext requires the full
	// Obsidian/AIServiceManager graph, which is heavier than this
	// guard needs. The assertion confirms AppContext exposes the
	// expected static delegators and routes them through the
	// registry instance.
	const acPath = path.resolve(process.cwd(), 'src/app/context/AppContext.ts');
	const source = fs.readFileSync(acPath, 'utf8');
	for (const symbol of [
		'public readonly runtimeRegistry',
		'public static setVaultLintRuntime',
		'public static getVaultLintRuntime',
		'public static tryGetVaultLintRuntime',
		'public static clearVaultLintRuntime',
	]) {
		assert.ok(
			source.includes(symbol),
			`AppContext.ts must declare '${symbol}'`,
		);
	}
	assert.ok(
		/runtimeRegistry\.setVaultLintRuntime/.test(source),
		'AppContext.setVaultLintRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/runtimeRegistry\.getVaultLintRuntime/.test(source),
		'AppContext.getVaultLintRuntime must delegate to runtimeRegistry',
	);
	console.log('PASS: appContextDelegatesStaticAccessorsToRegistry');
}

// ---------------------------------------------------------------------------
// T8: Ambient runtime binding semantics.
// ---------------------------------------------------------------------------

interface AmbientStubState {
	disposed: boolean;
	startCalls: number;
	manualCalls: number;
	briefingCalls: number;
	recordedActions: Array<{ source: string; pushed: string; action: string }>;
}

function fakeAmbientRuntime(state: AmbientStubState): AmbientRuntime {
	return {
		start() {
			state.startCalls += 1;
		},
		triggerManual() {
			state.manualCalls += 1;
		},
		async tryShowMorningBriefing() {
			state.briefingCalls += 1;
			return true;
		},
		async recordAction(source, pushed, action) {
			state.recordedActions.push({ source, pushed, action });
		},
		dispose() {
			state.disposed = true;
		},
	};
}

function newAmbientState(): AmbientStubState {
	return {
		disposed: false,
		startCalls: 0,
		manualCalls: 0,
		briefingCalls: 0,
		recordedActions: [],
	};
}

function testGetAmbientRuntimeFailsLoudBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.throws(
		() => registry.getAmbientRuntime(),
		/no runtime is bound/,
		'getAmbientRuntime must fail-loud before composition runs',
	);
	console.log('PASS: getAmbientRuntimeFailsLoudBeforeSet');
}

function testTryGetAmbientRuntimeReturnsNullBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.strictEqual(
		registry.tryGetAmbientRuntime(),
		null,
		'tryGetAmbientRuntime must return null before composition runs',
	);
	console.log('PASS: tryGetAmbientRuntimeReturnsNullBeforeSet');
}

async function testSetAmbientRuntimeStoresInstanceAndAllowsCalls(): Promise<void> {
	const registry = new AppRuntimeRegistry();
	const state = newAmbientState();
	const runtime = fakeAmbientRuntime(state);
	registry.setAmbientRuntime(runtime);

	assert.strictEqual(
		registry.getAmbientRuntime(),
		runtime,
		'registry must return the exact instance that was set',
	);
	assert.strictEqual(
		registry.tryGetAmbientRuntime(),
		runtime,
		'tryGet must agree with get when bound',
	);
	registry.getAmbientRuntime().start();
	registry.getAmbientRuntime().triggerManual();
	await registry.getAmbientRuntime().recordAction('src.md', 'dst.md', 'opened');
	assert.strictEqual(state.startCalls, 1);
	assert.strictEqual(state.manualCalls, 1);
	assert.deepStrictEqual(state.recordedActions, [
		{ source: 'src.md', pushed: 'dst.md', action: 'opened' },
	]);
	console.log('PASS: setAmbientRuntimeStoresInstanceAndAllowsCalls');
}

function testSetAmbientRuntimeRejectsDoubleBindWithoutClear(): void {
	const registry = new AppRuntimeRegistry();
	registry.setAmbientRuntime(fakeAmbientRuntime(newAmbientState()));
	assert.throws(
		() => registry.setAmbientRuntime(fakeAmbientRuntime(newAmbientState())),
		/already bound/,
		'setAmbientRuntime must reject a second bind without an intervening clear',
	);
	console.log('PASS: setAmbientRuntimeRejectsDoubleBindWithoutClear');
}

function testClearAmbientRuntimeDisposesAndAllowsRebind(): void {
	const registry = new AppRuntimeRegistry();
	const state = newAmbientState();
	registry.setAmbientRuntime(fakeAmbientRuntime(state));
	registry.clearAmbientRuntime();
	assert.strictEqual(state.disposed, true, 'clearAmbientRuntime must dispose the bound runtime');
	assert.throws(() => registry.getAmbientRuntime(), /no runtime is bound/);
	// Second clear is a no-op (idempotent — no throw, no second dispose).
	registry.clearAmbientRuntime();
	// Can re-bind a fresh runtime.
	const second = newAmbientState();
	registry.setAmbientRuntime(fakeAmbientRuntime(second));
	assert.ok(registry.tryGetAmbientRuntime() !== null);
	console.log('PASS: clearAmbientRuntimeDisposesAndAllowsRebind');
}

function testAppContextDeclaresAmbientDelegators(): void {
	const acPath = path.resolve(process.cwd(), 'src/app/context/AppContext.ts');
	const source = fs.readFileSync(acPath, 'utf8');
	for (const symbol of [
		'public static setAmbientRuntime',
		'public static getAmbientRuntime',
		'public static tryGetAmbientRuntime',
		'public static clearAmbientRuntime',
	]) {
		assert.ok(
			source.includes(symbol),
			`AppContext.ts must declare '${symbol}'`,
		);
	}
	assert.ok(
		/runtimeRegistry\.setAmbientRuntime/.test(source),
		'AppContext.setAmbientRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/runtimeRegistry\.getAmbientRuntime/.test(source),
		'AppContext.getAmbientRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/clearAmbientRuntime/.test(source),
		'AppContext.clearForUnload must release the Ambient runtime',
	);
	console.log('PASS: appContextDeclaresAmbientDelegators');
}

// ─── T9: Vault Review runtime binding tests ────────────────────────────

interface VaultReviewStubState {
	disposed: boolean;
	runCalls: number;
	saveCalls: number;
	listCalls: number;
	loadCalls: number;
	deleteCalls: number;
	clusterCalls: number;
	fingerprintCalls: number;
}

function newVaultReviewState(): VaultReviewStubState {
	return {
		disposed: false,
		runCalls: 0,
		saveCalls: 0,
		listCalls: 0,
		loadCalls: 0,
		deleteCalls: 0,
		clusterCalls: 0,
		fingerprintCalls: 0,
	};
}

function fakeVaultReviewRuntime(state: VaultReviewStubState): VaultReviewRuntime {
	return {
		async *run() {
			state.runCalls += 1;
			// Yield zero snapshots — the registry test only cares about
			// dispatch, not the multi-round loop.
			return undefined as never;
		},
		async saveReport(_snap, _existing) {
			state.saveCalls += 1;
			return {
				id: 'fake-id',
				storagePath: 'peak-system/vault-reviews/fake.md',
				mode: 'complete',
				startedAt: 0,
				completedAt: 0,
				status: 'completed',
				noteCount: 0,
				wordCount: 0,
				clusterCount: 0,
				insightCount: 0,
				gapCount: 0,
				actionCount: 0,
				sourceCount: 0,
				roundCount: 0,
				turnCount: 0,
				fingerprint: '',
			};
		},
		async listReports() {
			state.listCalls += 1;
			return [];
		},
		async loadReport() {
			state.loadCalls += 1;
			return null;
		},
		async deleteReport() {
			state.deleteCalls += 1;
		},
		async listClusterMembers() {
			state.clusterCalls += 1;
			return [];
		},
		async getVaultFingerprint() {
			state.fingerprintCalls += 1;
			return null;
		},
		dispose() {
			state.disposed = true;
		},
	};
}

function testGetVaultReviewRuntimeFailsLoudBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.throws(
		() => registry.getVaultReviewRuntime(),
		/no runtime is bound/,
		'getVaultReviewRuntime must fail-loud before composition runs',
	);
	console.log('PASS: getVaultReviewRuntimeFailsLoudBeforeSet');
}

function testTryGetVaultReviewRuntimeReturnsNullBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.strictEqual(
		registry.tryGetVaultReviewRuntime(),
		null,
		'tryGetVaultReviewRuntime must return null before composition runs',
	);
	console.log('PASS: tryGetVaultReviewRuntimeReturnsNullBeforeSet');
}

async function testSetVaultReviewRuntimeStoresInstanceAndAllowsCalls(): Promise<void> {
	const registry = new AppRuntimeRegistry();
	const state = newVaultReviewState();
	const runtime = fakeVaultReviewRuntime(state);
	registry.setVaultReviewRuntime(runtime);

	assert.strictEqual(
		registry.getVaultReviewRuntime(),
		runtime,
		'registry must return the exact instance that was set',
	);
	assert.strictEqual(
		registry.tryGetVaultReviewRuntime(),
		runtime,
		'tryGet must agree with get when bound',
	);
	await registry.getVaultReviewRuntime().listReports();
	await registry.getVaultReviewRuntime().getVaultFingerprint?.(true);
	await registry.getVaultReviewRuntime().listClusterMembers('community-1');
	assert.strictEqual(state.listCalls, 1);
	assert.strictEqual(state.fingerprintCalls, 1);
	assert.strictEqual(state.clusterCalls, 1);
	console.log('PASS: setVaultReviewRuntimeStoresInstanceAndAllowsCalls');
}

function testSetVaultReviewRuntimeRejectsDoubleBindWithoutClear(): void {
	const registry = new AppRuntimeRegistry();
	registry.setVaultReviewRuntime(fakeVaultReviewRuntime(newVaultReviewState()));
	assert.throws(
		() => registry.setVaultReviewRuntime(fakeVaultReviewRuntime(newVaultReviewState())),
		/already bound/,
		'setVaultReviewRuntime must reject a second bind without an intervening clear',
	);
	console.log('PASS: setVaultReviewRuntimeRejectsDoubleBindWithoutClear');
}

function testClearVaultReviewRuntimeDisposesAndAllowsRebind(): void {
	const registry = new AppRuntimeRegistry();
	const state = newVaultReviewState();
	registry.setVaultReviewRuntime(fakeVaultReviewRuntime(state));
	registry.clearVaultReviewRuntime();
	assert.strictEqual(state.disposed, true, 'clearVaultReviewRuntime must dispose the bound runtime');
	assert.throws(() => registry.getVaultReviewRuntime(), /no runtime is bound/);
	// Idempotent second clear.
	registry.clearVaultReviewRuntime();
	// Can re-bind a fresh runtime.
	const second = newVaultReviewState();
	registry.setVaultReviewRuntime(fakeVaultReviewRuntime(second));
	assert.ok(registry.tryGetVaultReviewRuntime() !== null);
	console.log('PASS: clearVaultReviewRuntimeDisposesAndAllowsRebind');
}

function testAppContextDeclaresVaultReviewDelegators(): void {
	const acPath = path.resolve(process.cwd(), 'src/app/context/AppContext.ts');
	const source = fs.readFileSync(acPath, 'utf8');
	for (const symbol of [
		'public static setVaultReviewRuntime',
		'public static getVaultReviewRuntime',
		'public static tryGetVaultReviewRuntime',
		'public static clearVaultReviewRuntime',
	]) {
		assert.ok(
			source.includes(symbol),
			`AppContext.ts must declare '${symbol}'`,
		);
	}
	assert.ok(
		/runtimeRegistry\.setVaultReviewRuntime/.test(source),
		'AppContext.setVaultReviewRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/runtimeRegistry\.tryGetVaultReviewRuntime/.test(source),
		'AppContext.tryGetVaultReviewRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/clearVaultReviewRuntime/.test(source),
		'AppContext.clearForUnload must release the Vault Review runtime',
	);
	console.log('PASS: appContextDeclaresVaultReviewDelegators');
}

function testAllThreeRuntimeBindingsAreIndependent(): void {
	const registry = new AppRuntimeRegistry();
	const ambientState = newAmbientState();
	const vaultReviewState = newVaultReviewState();
	registry.setVaultLintRuntime(fakeRuntime('three-way'));
	registry.setAmbientRuntime(fakeAmbientRuntime(ambientState));
	registry.setVaultReviewRuntime(fakeVaultReviewRuntime(vaultReviewState));
	// Clear vault lint — ambient + vault review must remain bound.
	registry.clearVaultLintRuntime();
	assert.strictEqual(registry.tryGetAmbientRuntime() !== null, true);
	assert.strictEqual(registry.tryGetVaultReviewRuntime() !== null, true);
	// Clear vault review — ambient must remain bound, ambient state untouched.
	registry.clearVaultReviewRuntime();
	assert.strictEqual(vaultReviewState.disposed, true);
	assert.strictEqual(ambientState.disposed, false);
	assert.strictEqual(registry.tryGetAmbientRuntime() !== null, true);
	registry.clearAmbientRuntime();
	assert.strictEqual(ambientState.disposed, true);
	console.log('PASS: allThreeRuntimeBindingsAreIndependent');
}

// ─── T10: Quick Search Background runtime binding tests ──────────────────

interface QuickSearchBackgroundStubState {
	disposed: boolean;
	subscribeCalls: number;
	getSessionsCalls: number;
	detachCalls: number;
	restoreCalls: number;
	requestRestoreCalls: number;
	consumePendingCalls: number;
	openAndRestoreCalls: number;
	cancelCalls: number;
	abortAllCalls: number;
}

function newQuickSearchState(): QuickSearchBackgroundStubState {
	return {
		disposed: false,
		subscribeCalls: 0,
		getSessionsCalls: 0,
		detachCalls: 0,
		restoreCalls: 0,
		requestRestoreCalls: 0,
		consumePendingCalls: 0,
		openAndRestoreCalls: 0,
		cancelCalls: 0,
		abortAllCalls: 0,
	};
}

function fakeQuickSearchBackgroundRuntime(state: QuickSearchBackgroundStubState): QuickSearchBackgroundRuntime {
	return {
		subscribe(_listener) {
			state.subscribeCalls += 1;
			return () => {};
		},
		getSessions() {
			state.getSessionsCalls += 1;
			return [];
		},
		getActiveCount() {
			return 0;
		},
		detachForeground() {
			state.detachCalls += 1;
			return null;
		},
		restoreToForeground(_sessionId) {
			state.restoreCalls += 1;
			return null;
		},
		requestRestore(_sessionId) {
			state.requestRestoreCalls += 1;
		},
		consumePendingRestore() {
			state.consumePendingCalls += 1;
			return null;
		},
		openAndRestore(_sessionId) {
			state.openAndRestoreCalls += 1;
		},
		cancelSession(_sessionId) {
			state.cancelCalls += 1;
		},
		abortAll() {
			state.abortAllCalls += 1;
		},
		dispose() {
			state.disposed = true;
		},
	};
}

function testGetQuickSearchBackgroundRuntimeFailsLoudBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.throws(
		() => registry.getQuickSearchBackgroundRuntime(),
		/no runtime is bound/,
		'getQuickSearchBackgroundRuntime must fail-loud before composition runs',
	);
	console.log('PASS: getQuickSearchBackgroundRuntimeFailsLoudBeforeSet');
}

function testTryGetQuickSearchBackgroundRuntimeReturnsNullBeforeSet(): void {
	const registry = new AppRuntimeRegistry();
	assert.strictEqual(
		registry.tryGetQuickSearchBackgroundRuntime(),
		null,
		'tryGetQuickSearchBackgroundRuntime must return null before composition runs',
	);
	console.log('PASS: tryGetQuickSearchBackgroundRuntimeReturnsNullBeforeSet');
}

function testSetQuickSearchBackgroundRuntimeStoresInstanceAndAllowsCalls(): void {
	const registry = new AppRuntimeRegistry();
	const state = newQuickSearchState();
	const runtime = fakeQuickSearchBackgroundRuntime(state);
	registry.setQuickSearchBackgroundRuntime(runtime);

	assert.strictEqual(
		registry.getQuickSearchBackgroundRuntime(),
		runtime,
		'registry must return the exact instance that was set',
	);
	assert.strictEqual(
		registry.tryGetQuickSearchBackgroundRuntime(),
		runtime,
		'tryGet must agree with get when bound',
	);
	registry.getQuickSearchBackgroundRuntime().detachForeground();
	registry.getQuickSearchBackgroundRuntime().requestRestore('bg-1');
	registry.getQuickSearchBackgroundRuntime().consumePendingRestore();
	registry.getQuickSearchBackgroundRuntime().cancelSession('bg-1');
	assert.strictEqual(state.detachCalls, 1);
	assert.strictEqual(state.requestRestoreCalls, 1);
	assert.strictEqual(state.consumePendingCalls, 1);
	assert.strictEqual(state.cancelCalls, 1);
	console.log('PASS: setQuickSearchBackgroundRuntimeStoresInstanceAndAllowsCalls');
}

function testSetQuickSearchBackgroundRuntimeRejectsDoubleBindWithoutClear(): void {
	const registry = new AppRuntimeRegistry();
	registry.setQuickSearchBackgroundRuntime(fakeQuickSearchBackgroundRuntime(newQuickSearchState()));
	assert.throws(
		() => registry.setQuickSearchBackgroundRuntime(fakeQuickSearchBackgroundRuntime(newQuickSearchState())),
		/already bound/,
		'setQuickSearchBackgroundRuntime must reject a second bind without an intervening clear',
	);
	console.log('PASS: setQuickSearchBackgroundRuntimeRejectsDoubleBindWithoutClear');
}

function testClearQuickSearchBackgroundRuntimeDisposesAndAllowsRebind(): void {
	const registry = new AppRuntimeRegistry();
	const state = newQuickSearchState();
	registry.setQuickSearchBackgroundRuntime(fakeQuickSearchBackgroundRuntime(state));
	registry.clearQuickSearchBackgroundRuntime();
	assert.strictEqual(state.disposed, true, 'clearQuickSearchBackgroundRuntime must dispose the bound runtime');
	assert.throws(() => registry.getQuickSearchBackgroundRuntime(), /no runtime is bound/);
	// Idempotent second clear.
	registry.clearQuickSearchBackgroundRuntime();
	// Can re-bind a fresh runtime.
	const second = newQuickSearchState();
	registry.setQuickSearchBackgroundRuntime(fakeQuickSearchBackgroundRuntime(second));
	assert.ok(registry.tryGetQuickSearchBackgroundRuntime() !== null);
	console.log('PASS: clearQuickSearchBackgroundRuntimeDisposesAndAllowsRebind');
}

function testAppContextDeclaresQuickSearchBackgroundDelegators(): void {
	const acPath = path.resolve(process.cwd(), 'src/app/context/AppContext.ts');
	const source = fs.readFileSync(acPath, 'utf8');
	for (const symbol of [
		'public static setQuickSearchBackgroundRuntime',
		'public static getQuickSearchBackgroundRuntime',
		'public static tryGetQuickSearchBackgroundRuntime',
		'public static clearQuickSearchBackgroundRuntime',
	]) {
		assert.ok(
			source.includes(symbol),
			`AppContext.ts must declare '${symbol}'`,
		);
	}
	assert.ok(
		/runtimeRegistry\.setQuickSearchBackgroundRuntime/.test(source),
		'AppContext.setQuickSearchBackgroundRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/runtimeRegistry\.tryGetQuickSearchBackgroundRuntime/.test(source),
		'AppContext.tryGetQuickSearchBackgroundRuntime must delegate to runtimeRegistry',
	);
	assert.ok(
		/clearQuickSearchBackgroundRuntime/.test(source),
		'AppContext.clearForUnload must release the Quick Search background runtime',
	);
	console.log('PASS: appContextDeclaresQuickSearchBackgroundDelegators');
}

function testAllFourRuntimeBindingsAreIndependent(): void {
	const registry = new AppRuntimeRegistry();
	const ambientState = newAmbientState();
	const vaultReviewState = newVaultReviewState();
	const quickSearchState = newQuickSearchState();
	registry.setVaultLintRuntime(fakeRuntime('four-way'));
	registry.setAmbientRuntime(fakeAmbientRuntime(ambientState));
	registry.setVaultReviewRuntime(fakeVaultReviewRuntime(vaultReviewState));
	registry.setQuickSearchBackgroundRuntime(fakeQuickSearchBackgroundRuntime(quickSearchState));

	// Clear quick search — other three must remain bound + undisposed.
	registry.clearQuickSearchBackgroundRuntime();
	assert.strictEqual(quickSearchState.disposed, true);
	assert.strictEqual(ambientState.disposed, false);
	assert.strictEqual(vaultReviewState.disposed, false);
	assert.strictEqual(registry.tryGetAmbientRuntime() !== null, true);
	assert.strictEqual(registry.tryGetVaultReviewRuntime() !== null, true);
	assert.strictEqual(registry.tryGetVaultLintRuntime() !== null, true);

	// Sweep the remaining three.
	registry.clearVaultLintRuntime();
	registry.clearAmbientRuntime();
	registry.clearVaultReviewRuntime();
	assert.strictEqual(ambientState.disposed, true);
	assert.strictEqual(vaultReviewState.disposed, true);
	console.log('PASS: allFourRuntimeBindingsAreIndependent');
}

function testVaultLintAndAmbientBindingsAreIndependent(): void {
	const registry = new AppRuntimeRegistry();
	const ambientState = newAmbientState();
	registry.setVaultLintRuntime(fakeRuntime('coexist'));
	registry.setAmbientRuntime(fakeAmbientRuntime(ambientState));
	// Clearing one capability must not disturb the other.
	registry.clearVaultLintRuntime();
	assert.strictEqual(registry.tryGetAmbientRuntime() !== null, true);
	registry.clearAmbientRuntime();
	assert.strictEqual(ambientState.disposed, true);
	console.log('PASS: vaultLintAndAmbientBindingsAreIndependent');
}

async function main(): Promise<void> {
	testGetVaultLintRuntimeFailsLoudBeforeSet();
	testTryGetVaultLintRuntimeReturnsNullBeforeSet();
	await testSetVaultLintRuntimeStoresInstanceAndAllowsScans();
	testSetVaultLintRuntimeRejectsDoubleBindWithoutClear();
	testClearVaultLintRuntimeAllowsRebind();
	testRegistryFileDoesNotReachAppShellOrObsidian();
	testAppContextDelegatesStaticAccessorsToRegistry();
	testGetAmbientRuntimeFailsLoudBeforeSet();
	testTryGetAmbientRuntimeReturnsNullBeforeSet();
	await testSetAmbientRuntimeStoresInstanceAndAllowsCalls();
	testSetAmbientRuntimeRejectsDoubleBindWithoutClear();
	testClearAmbientRuntimeDisposesAndAllowsRebind();
	testAppContextDeclaresAmbientDelegators();
	testVaultLintAndAmbientBindingsAreIndependent();
	testGetVaultReviewRuntimeFailsLoudBeforeSet();
	testTryGetVaultReviewRuntimeReturnsNullBeforeSet();
	await testSetVaultReviewRuntimeStoresInstanceAndAllowsCalls();
	testSetVaultReviewRuntimeRejectsDoubleBindWithoutClear();
	testClearVaultReviewRuntimeDisposesAndAllowsRebind();
	testAppContextDeclaresVaultReviewDelegators();
	testAllThreeRuntimeBindingsAreIndependent();
	testGetQuickSearchBackgroundRuntimeFailsLoudBeforeSet();
	testTryGetQuickSearchBackgroundRuntimeReturnsNullBeforeSet();
	testSetQuickSearchBackgroundRuntimeStoresInstanceAndAllowsCalls();
	testSetQuickSearchBackgroundRuntimeRejectsDoubleBindWithoutClear();
	testClearQuickSearchBackgroundRuntimeDisposesAndAllowsRebind();
	testAppContextDeclaresQuickSearchBackgroundDelegators();
	testAllFourRuntimeBindingsAreIndependent();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
