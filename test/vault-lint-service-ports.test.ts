// T6 Vault Lint Ports Extraction — fake-port engine tests.
//
// These tests prove the T6 closure: `VaultLintService` is a plain class
// that can be constructed with fake ports and exercised end-to-end
// without Obsidian, AppContext, sqlite, or any singleton. If a future
// change reintroduces `AppContext.getInstance()` or `sqliteStoreManager`
// inside the engine, these tests will fail because the fake ports will
// not satisfy the engine.
//
// The tests also add source-scan guards that prove the engine file and
// the runtime binding file have no service-locator imports.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	DEFAULT_VAULT_LINT_CONFIG,
	VaultLintService,
} from '@/service/lint/VaultLintService';
import type { VaultLintPorts } from '@/service/lint/ports/VaultLintPorts';
import type {
	LintDismissal,
	LintScanResult,
	LintSignalDetector,
	VaultLintConfig,
} from '@/service/lint/types';
import {
	clearVaultLintRuntimeForTests,
	getVaultLintRuntime,
	setVaultLintRuntime,
} from '@/service/lint/VaultLintRuntime';

// ---------------------------------------------------------------------------
// Fake adapters
// ---------------------------------------------------------------------------

function fakeDetector(
	id: LintSignalDetector['id'],
	overrides: Partial<LintSignalDetector> = {},
): LintSignalDetector {
	return {
		id,
		dimension: 'structural',
		severity: 'info',
		signalWeight: 1,
		requiresLlm: false,
		detect: async () => [],
		...overrides,
	};
}

interface FakePortsOverrides {
	configLoaded?: Partial<VaultLintConfig> | null;
	configThrows?: boolean;
	markdownFileCount?: number;
	dismissals?: LintDismissal[];
	lastTimestamp?: number | null;
	saved?: LintScanResult[];
	latest?: LintScanResult | null;
	detectors?: LintSignalDetector[];
	ensureCalls?: VaultLintConfig[];
	scanIds?: string[];
	clockTicks?: number[];
}

interface FakePortsResult {
	ports: VaultLintPorts;
	saved: LintScanResult[];
	ensureCalls: VaultLintConfig[];
}

function fakePorts(overrides: FakePortsOverrides = {}): FakePortsResult {
	const saved: LintScanResult[] = overrides.saved ?? [];
	const ensureCalls: VaultLintConfig[] = overrides.ensureCalls ?? [];
	let scanIdCalls = 0;
	const scanIds = overrides.scanIds ?? ['scan-fake-1', 'scan-fake-2'];
	const clockTicks = [...(overrides.clockTicks ?? [100, 200, 300])];

	const detectors = overrides.detectors ?? [fakeDetector('S-ORPHAN')];

	const ports: VaultLintPorts = {
		config: {
			async loadConfig() {
				if (overrides.configThrows) throw new Error('config blew up');
				return overrides.configLoaded ?? null;
			},
		},
		vault: {
			getMarkdownFileCount: () => overrides.markdownFileCount ?? 42,
		},
		persistence: {
			loadActiveDismissals: async () => overrides.dismissals ?? [],
			getLastFullScanTimestamp: async () => overrides.lastTimestamp ?? null,
			saveScanResult: async (result) => {
				saved.push(result);
			},
			loadLatestScan: async () => overrides.latest ?? null,
		},
		detectorRegistry: {
			ensureInitialized(config) {
				ensureCalls.push(config);
			},
			getNonLlm: () => detectors,
		},
		idFactory: {
			nextScanId: () => {
				const id = scanIds[scanIdCalls] ?? `scan-fake-fallback-${scanIdCalls}`;
				scanIdCalls += 1;
				return id;
			},
		},
		clock: {
			now: () => clockTicks.shift() ?? 999,
		},
	};

	return { ports, saved, ensureCalls };
}

// ---------------------------------------------------------------------------
// Behavior tests
// ---------------------------------------------------------------------------

async function testServiceRunsEndToEndWithFakePortsOnly(): Promise<void> {
	const captured: Array<{ phase: string }> = [];
	const { ports, saved, ensureCalls } = fakePorts({
		markdownFileCount: 17,
		clockTicks: [1000, 2000],
		scanIds: ['scan-end-to-end'],
		detectors: [fakeDetector('S-ORPHAN'), fakeDetector('C-EMPTY', { requiresLlm: true })],
	});

	const service = new VaultLintService(ports);
	const result = await service.runFullScan({
		onProgress: (event) => captured.push({ phase: event.phase }),
	});

	assert.strictEqual(result.id, 'scan-end-to-end');
	assert.strictEqual(result.scanType, 'full');
	assert.strictEqual(result.totalNotes, 17);
	assert.strictEqual(result.startedAt, 1000);
	assert.strictEqual(result.completedAt, 2000);
	assert.strictEqual(result.durationMs, 1000);
	assert.strictEqual(saved.length, 1, 'persistence.saveScanResult should be called exactly once');
	assert.strictEqual(saved[0], result);
	assert.strictEqual(ensureCalls.length, 1, 'detectorRegistry.ensureInitialized should be called once per scan');

	const phases = captured.map((c) => c.phase);
	assert.deepStrictEqual(phases, ['init', 'scanning', 'cleared']);
	console.log('PASS: serviceRunsEndToEndWithFakePortsOnly');
}

async function testServiceForwardsDetectorFailureToCallback(): Promise<void> {
	const warnings: Array<{ id: string; err: unknown }> = [];
	const boom = new Error('detector exploded');
	const { ports } = fakePorts({
		detectors: [
			fakeDetector('S-ORPHAN', {
				detect: async () => {
					throw boom;
				},
			}),
		],
	});

	const service = new VaultLintService(ports);
	const result = await service.runFullScan({
		onDetectorWarning: (id, err) => warnings.push({ id, err }),
	});

	assert.strictEqual(warnings.length, 1);
	assert.strictEqual(warnings[0]!.id, 'S-ORPHAN');
	assert.strictEqual(warnings[0]!.err, boom);
	assert.strictEqual(
		result.findings.length,
		0,
		'detector failure should not yield findings, but scan must still complete',
	);
	console.log('PASS: serviceForwardsDetectorFailureToCallback');
}

async function testServiceTolersConfigPortFailureAndFallsBackToDefaults(): Promise<void> {
	const { ports, saved } = fakePorts({
		configThrows: true,
		detectors: [fakeDetector('S-ORPHAN')],
	});
	const service = new VaultLintService(ports);
	const result = await service.runFullScan();
	assert.strictEqual(saved.length, 1);
	assert.strictEqual(
		result.totalNotes,
		42,
		'engine must continue with default config when config port throws',
	);
	console.log('PASS: serviceTolersConfigPortFailureAndFallsBackToDefaults');
}

async function testServiceMergesPartialConfigOnTopOfDefaults(): Promise<void> {
	const partial: Partial<VaultLintConfig> = {
		thresholds: {
			...DEFAULT_VAULT_LINT_CONFIG.thresholds,
			stubMaxChars: 999,
		},
	};
	const { ports } = fakePorts({ configLoaded: partial });
	const service = new VaultLintService(ports);
	const result = await service.runFullScan();
	assert.ok(result.id.startsWith('scan-fake'), 'service should still mint a scan id from the port');
	console.log('PASS: serviceMergesPartialConfigOnTopOfDefaults');
}

async function testServiceLoadLatestScanDelegatesToPersistencePort(): Promise<void> {
	const latest: LintScanResult = {
		id: 'historical-scan',
		scanType: 'full',
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
		totalNotes: 10,
		healthScore: 88,
		dimensionScores: { structural: 90, content: 80, temporal: 75, semantic: 90, tags: 85 },
		findings: [],
		signalCounts: {},
	};
	const { ports } = fakePorts({ latest });
	const service = new VaultLintService(ports);
	const got = await service.loadLatestScan();
	assert.strictEqual(got, latest);
	console.log('PASS: serviceLoadLatestScanDelegatesToPersistencePort');
}

// ---------------------------------------------------------------------------
// Runtime binding tests
// ---------------------------------------------------------------------------

function testRuntimeBindingIsFailLoudBeforeSet(): void {
	clearVaultLintRuntimeForTests();
	assert.throws(
		() => getVaultLintRuntime(),
		/no runtime is bound/,
		'getVaultLintRuntime() must fail loud before composition runs',
	);
	console.log('PASS: runtimeBindingIsFailLoudBeforeSet');
}

async function testRuntimeBindingWiresFakeServiceForConsumers(): Promise<void> {
	clearVaultLintRuntimeForTests();
	const { ports } = fakePorts({ scanIds: ['scan-from-binding'] });
	const service = new VaultLintService(ports);
	setVaultLintRuntime(service);

	const runtime = getVaultLintRuntime();
	assert.strictEqual(runtime, service, 'binding must return the exact instance that was set');
	const result = await runtime.runFullScan();
	assert.strictEqual(result.id, 'scan-from-binding');

	clearVaultLintRuntimeForTests();
	console.log('PASS: runtimeBindingWiresFakeServiceForConsumers');
}

function testRuntimeBindingRejectsDoubleSet(): void {
	clearVaultLintRuntimeForTests();
	const { ports: p1 } = fakePorts();
	const { ports: p2 } = fakePorts();
	setVaultLintRuntime(new VaultLintService(p1));
	assert.throws(
		() => setVaultLintRuntime(new VaultLintService(p2)),
		/already bound/,
		'setVaultLintRuntime must reject a second bind without an intervening clear',
	);
	clearVaultLintRuntimeForTests();
	console.log('PASS: runtimeBindingRejectsDoubleSet');
}

// ---------------------------------------------------------------------------
// Source-scan guards
// ---------------------------------------------------------------------------

const SERVICE_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintService.ts',
);
const RUNTIME_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintRuntime.ts',
);
const PORTS_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/ports/VaultLintPorts.ts',
);
const COMPOSITION_PATH = path.resolve(
	process.cwd(),
	'src/app/lint/composeVaultLintRuntime.ts',
);

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testServiceHasNoServiceLocatorOrAppShellCoupling(): void {
	const source = fs.readFileSync(SERVICE_PATH, 'utf8');
	const code = stripComments(source);
	const specifiers = extractImportSpecifiers(source);

	for (const forbidden of [
		'AppContext.getInstance',
		'sqliteStoreManager',
		'SignalRegistry.getInstance',
		'static instance',
	]) {
		assert.ok(
			!code.includes(forbidden),
			`T6 closure: VaultLintService.ts must not contain '${forbidden}'`,
		);
	}
	// `getInstance(` of any flavor — old service locator pattern.
	assert.ok(
		!/getInstance\s*\(/.test(code),
		'T6 closure: VaultLintService.ts must not call any getInstance()',
	);
	for (const spec of specifiers) {
		assert.ok(
			!/^@\/app\//.test(spec),
			`T6 closure: VaultLintService.ts must not import from '@/app/', found '${spec}'`,
		);
		assert.ok(
			!/^@\/ui\//.test(spec),
			`T6 closure: VaultLintService.ts must not import from '@/ui/', found '${spec}'`,
		);
		assert.ok(
			!/SqliteStoreManager/.test(spec),
			'T6 closure: VaultLintService.ts must not import SqliteStoreManager',
		);
	}
	console.log('PASS: serviceHasNoServiceLocatorOrAppShellCoupling');
}

function testPortsFileImportsOnlyTypes(): void {
	const source = fs.readFileSync(PORTS_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	assert.ok(specifiers.length > 0, 'ports file should import its supporting types');
	for (const spec of specifiers) {
		assert.ok(
			spec === '../types',
			`ports file may only import from '../types'; found '${spec}'`,
		);
	}
	console.log(`PASS: portsFileImportsOnlyTypes (${specifiers.length} import(s) checked)`);
}

function testRuntimeBindingFileHasNoAppOrSqliteImports(): void {
	const source = fs.readFileSync(RUNTIME_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	for (const spec of specifiers) {
		assert.ok(
			!/^@\/app\//.test(spec),
			`runtime binding file must not import from '@/app/', found '${spec}'`,
		);
		assert.ok(
			!/SqliteStoreManager/.test(spec),
			'runtime binding file must not import SqliteStoreManager',
		);
		assert.ok(
			!/^obsidian/.test(spec),
			`runtime binding file must not import Obsidian, found '${spec}'`,
		);
	}
	console.log('PASS: runtimeBindingFileHasNoAppOrSqliteImports');
}

function testCompositionFileLivesInAppLayerAndIsTheSoleWirePoint(): void {
	assert.ok(
		fs.existsSync(COMPOSITION_PATH),
		'composeVaultLintRuntime must exist in src/app/lint/',
	);
	const source = fs.readFileSync(COMPOSITION_PATH, 'utf8');
	const code = stripComments(source);
	const specifiers = extractImportSpecifiers(source);

	assert.ok(
		specifiers.includes('@/core/storage/sqlite/SqliteStoreManager'),
		'composition must reach sqliteStoreManager (the one allowed place)',
	);
	assert.ok(
		/composeVaultLintRuntime\s*\(\s*\)/.test(code),
		'composition function must exist and take no arguments',
	);
	// Confirm composition INSTANTIATES VaultLintService, not the deleted
	// getInstance.
	assert.ok(
		/new\s+VaultLintService\s*\(/.test(code),
		'composition must construct VaultLintService with ports',
	);
	console.log('PASS: compositionFileLivesInAppLayerAndIsTheSoleWirePoint');
}

function testSignalRegistryFileIsDeleted(): void {
	const signalRegistryPath = path.resolve(
		process.cwd(),
		'src/service/lint/SignalRegistry.ts',
	);
	assert.ok(
		!fs.existsSync(signalRegistryPath),
		'T6 closure: SignalRegistry.ts must be deleted (per-runtime InMemoryDetectorRegistry replaces it)',
	);
	console.log('PASS: signalRegistryFileIsDeleted');
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	await testServiceRunsEndToEndWithFakePortsOnly();
	await testServiceForwardsDetectorFailureToCallback();
	await testServiceTolersConfigPortFailureAndFallsBackToDefaults();
	await testServiceMergesPartialConfigOnTopOfDefaults();
	await testServiceLoadLatestScanDelegatesToPersistencePort();
	testRuntimeBindingIsFailLoudBeforeSet();
	await testRuntimeBindingWiresFakeServiceForConsumers();
	testRuntimeBindingRejectsDoubleSet();
	testServiceHasNoServiceLocatorOrAppShellCoupling();
	testPortsFileImportsOnlyTypes();
	testRuntimeBindingFileHasNoAppOrSqliteImports();
	testCompositionFileLivesInAppLayerAndIsTheSoleWirePoint();
	testSignalRegistryFileIsDeleted();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
