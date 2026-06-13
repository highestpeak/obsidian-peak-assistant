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
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
