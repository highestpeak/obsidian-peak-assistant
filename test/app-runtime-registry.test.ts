// T6R: app-owned runtime registry tests.
//
// These tests move the runtime binding fail-loud / double-bind / clear
// semantics from `test/vault-lint-service-ports.test.ts` (where they
// targeted a service-layer module singleton) onto
// `AppRuntimeRegistry`. The registry is the new home for per-capability
// runtime bindings; T6R wires Vault Lint as the first user.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { AppRuntimeRegistry } from '@/app/runtime/AppRuntimeRegistry';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { LintScanResult } from '@/service/lint/types';

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

async function main(): Promise<void> {
	testGetVaultLintRuntimeFailsLoudBeforeSet();
	testTryGetVaultLintRuntimeReturnsNullBeforeSet();
	await testSetVaultLintRuntimeStoresInstanceAndAllowsScans();
	testSetVaultLintRuntimeRejectsDoubleBindWithoutClear();
	testClearVaultLintRuntimeAllowsRebind();
	testRegistryFileDoesNotReachAppShellOrObsidian();
	testAppContextDelegatesStaticAccessorsToRegistry();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
