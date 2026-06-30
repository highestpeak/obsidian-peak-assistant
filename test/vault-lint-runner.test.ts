// T4 Vault Lint RunEnvelope vertical slice — runner tests.
//
// Two parallel disciplines:
//   1. Behavior tests: assert that `runVaultLintManualScan` emits the
//      expected RunEvent trace, including the recorder-minted runId,
//      progress events from the injected scan function, the artifact
//      reference, and the terminal status.
//   2. Source-scan guards: assert that the runner does not import the UI
//      store, AppContext, obsidian, or any singleton registry, and that
//      the UI panel no longer imports VaultLintService directly. These
//      guards are dependency-free regex scans, matching the discipline
//      established by `test/run-envelope-core.test.ts` and
//      `test/vault-lint-contract.test.ts`.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	runVaultLintManualScan,
	type VaultLintRunCallbacks,
} from '@/service/lint/VaultLintRun';
import { VAULT_LINT_CAPABILITY_ID } from '@/service/lint/VaultLintContract';
import {
	InMemoryRunRecorder,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
} from '@/service/run-envelope';
import type { LintScanResult } from '@/service/lint/types';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakeClock(start = 1000): RunClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIdFactory(prefix = 'id'): RunIdFactory {
	let n = 0;
	return {
		next: () => {
			n += 1;
			return `${prefix}-${n}`;
		},
	};
}

function fakeRecorder(): InMemoryRunRecorder {
	return new InMemoryRunRecorder({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory(),
	});
}

function fakeScanResult(overrides: Partial<LintScanResult> = {}): LintScanResult {
	const base: LintScanResult = {
		id: 'scan-fixture',
		scanType: 'full',
		startedAt: 100,
		completedAt: 200,
		durationMs: 100,
		totalNotes: 42,
		healthScore: 88,
		dimensionScores: {
			structural: 90,
			content: 85,
			temporal: 80,
			semantic: 92,
			tags: 87,
		},
		findings: [],
		signalCounts: {},
	};
	return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Behavior tests
// ---------------------------------------------------------------------------

async function testHappyPathProducesDeterministicEventTrace(): Promise<void> {
	const recorder = fakeRecorder();
	const result = fakeScanResult();

	const out = await runVaultLintManualScan({
		recorder,
		scan: async (callbacks: VaultLintRunCallbacks) => {
			callbacks.onProgress?.({ phase: 'init' });
			callbacks.onProgress?.({
				phase: 'scanning',
				detector: 'non-llm',
				processed: 0,
				total: 5,
			});
			callbacks.onProgress?.({ phase: 'cleared' });
			return result;
		},
	});

	assert.strictEqual(out.result, result, 'runner should return the scan result by reference');
	assert.strictEqual(out.session.capabilityId, VAULT_LINT_CAPABILITY_ID);
	assert.strictEqual(out.session.runId, 'id-1', 'runId should be minted by the injected id factory');
	assert.strictEqual(out.session.trigger, 'manual');
	assert.strictEqual(out.session.status, 'completed');
	assert.ok(typeof out.session.endedAt === 'number', 'completed session must have endedAt');

	assert.strictEqual(out.artifact.kind, 'result');
	assert.strictEqual(out.artifact.runId, out.session.runId);
	assert.ok(out.artifact.artifactId.length > 0, 'artifactId should be minted');
	assert.ok(out.artifact.title?.includes('Vault Lint scan'), 'artifact title should describe the scan');
	assert.ok(out.artifact.uri?.includes(result.id), 'artifact uri should reference the scan id');

	// Event types in emission order:
	//   queued status      (from recorder.start)
	//   running status     (from recorder.recordStatus)
	//   init progress      (from callbacks)
	//   scanning progress
	//   cleared progress
	//   artifact event
	//   completed status   (from recorder.finish)
	const types = out.events.map((e) => e.type);
	assert.deepStrictEqual(types, [
		'status',
		'status',
		'progress',
		'progress',
		'progress',
		'artifact',
		'status',
	], 'unexpected event sequence');

	const statuses = out.events
		.filter((e): e is Extract<RunEvent, { type: 'status' }> => e.type === 'status')
		.map((e) => e.status);
	assert.deepStrictEqual(statuses, ['queued', 'running', 'completed']);

	const progressPhases = out.events
		.filter((e): e is Extract<RunEvent, { type: 'progress' }> => e.type === 'progress')
		.map((e) => e.phase);
	assert.deepStrictEqual(progressPhases, ['init', 'scanning', 'cleared']);

	const scanningEvent = out.events.find(
		(e): e is Extract<RunEvent, { type: 'progress' }> =>
			e.type === 'progress' && e.phase === 'scanning',
	);
	assert.ok(scanningEvent, 'scanning progress event must exist');
	assert.strictEqual(scanningEvent.total, 5);
	assert.strictEqual(scanningEvent.processed, 0);
	assert.strictEqual(scanningEvent.label, 'non-llm');

	console.log('PASS: happyPathProducesDeterministicEventTrace');
}

async function testFailurePathRecordsErrorAndFailedStatusThenRethrows(): Promise<void> {
	const recorder = fakeRecorder();
	const boom = new Error('scan exploded');

	let thrown: unknown;
	try {
		await runVaultLintManualScan({
			recorder,
			scan: async (callbacks) => {
				callbacks.onProgress?.({ phase: 'init' });
				throw boom;
			},
		});
	} catch (e) {
		thrown = e;
	}

	assert.strictEqual(thrown, boom, 'runner must rethrow the original error');

	const events = recorder.getEvents();
	const types = events.map((e) => e.type);
	assert.deepStrictEqual(types, [
		'status',
		'status',
		'progress',
		'error',
		'status',
	], 'failure path event sequence');

	const errorEvent = events.find((e): e is Extract<RunEvent, { type: 'error' }> => e.type === 'error');
	assert.ok(errorEvent);
	assert.strictEqual(errorEvent.message, 'scan exploded');
	assert.strictEqual(errorEvent.recoverable, false);

	const finalStatus = events
		.filter((e): e is Extract<RunEvent, { type: 'status' }> => e.type === 'status')
		.pop();
	assert.ok(finalStatus);
	assert.strictEqual(finalStatus.status, 'failed');

	const finalSession = recorder.getSession();
	assert.strictEqual(finalSession.status, 'failed');
	assert.ok(typeof finalSession.endedAt === 'number', 'failed session must have endedAt');

	console.log('PASS: failurePathRecordsErrorAndFailedStatusThenRethrows');
}

async function testDetectorWarningCallbackBecomesWarnLogEvent(): Promise<void> {
	const recorder = fakeRecorder();

	await runVaultLintManualScan({
		recorder,
		scan: async (callbacks) => {
			callbacks.onProgress?.({ phase: 'init' });
			callbacks.onProgress?.({
				phase: 'scanning',
				detector: 'non-llm',
				processed: 0,
				total: 3,
			});
			callbacks.onDetectorWarning?.('S-ORPHAN', new Error('orphan detector failed'));
			callbacks.onProgress?.({ phase: 'cleared' });
			return fakeScanResult({ id: 'scan-with-warning' });
		},
	});

	const events = recorder.getEvents();
	const logEvent = events.find((e): e is Extract<RunEvent, { type: 'log' }> => e.type === 'log');
	assert.ok(logEvent, 'detector warning should become a log event');
	assert.strictEqual(logEvent.level, 'warn');
	assert.ok(logEvent.message.includes('S-ORPHAN'), 'log message should name the failing detector');
	assert.ok(logEvent.message.includes('orphan detector failed'), 'log message should include underlying error');

	console.log('PASS: detectorWarningCallbackBecomesWarnLogEvent');
}

async function testEachInvocationConstructsItsOwnRecorderWhenNoneProvided(): Promise<void> {
	// We cannot inspect the internal recorder when one is not injected, but
	// we CAN assert that two invocations produce distinct runIds, which is
	// proof there is no shared recorder/registry between calls.
	const a = await runVaultLintManualScan({
		clock: makeFakeClock(10),
		idFactory: makeFakeIdFactory('run-a'),
		scan: async () => fakeScanResult({ id: 'a' }),
	});
	const b = await runVaultLintManualScan({
		clock: makeFakeClock(20),
		idFactory: makeFakeIdFactory('run-b'),
		scan: async () => fakeScanResult({ id: 'b' }),
	});
	assert.notStrictEqual(a.session.runId, b.session.runId);
	assert.strictEqual(a.session.runId, 'run-a-1');
	assert.strictEqual(b.session.runId, 'run-b-1');

	console.log('PASS: eachInvocationConstructsItsOwnRecorderWhenNoneProvided');
}

// ---------------------------------------------------------------------------
// Source-scan guards
// ---------------------------------------------------------------------------

const RUNNER_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintRun.ts',
);
const SERVICE_PATH = path.resolve(
	process.cwd(),
	'src/service/lint/VaultLintService.ts',
);
function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

const RUNNER_FORBIDDEN_IMPORTS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /^obsidian(\/.*)?$/, reason: 'runner must not import Obsidian' },
	{ pattern: /^@\/app\//, reason: 'runner must not import AppContext / commands' },
	{ pattern: /^@\/ui\//, reason: 'runner must not import the UI layer or stores' },
	{ pattern: /^@\/core\/storage\//, reason: 'runner must not import storage adapters' },
	{ pattern: /^@\/service\/capabilities\//, reason: 'runner must not pull Settings readiness registry' },
	{ pattern: /^zustand(\/.*)?$/, reason: 'runner must not import zustand' },
	{ pattern: /^react(\/.*)?$/, reason: 'runner must not import React' },
	{ pattern: /^better-sqlite3$/, reason: 'runner must not import the SQLite driver' },
];

function testRunnerImportsAreBoundaryClean(): void {
	const source = fs.readFileSync(RUNNER_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	assert.ok(specifiers.length > 0, 'runner should have at least one import');

	for (const spec of specifiers) {
		// `./VaultLintService` is allowed as a static import only if it is
		// type-only. The production path uses a dynamic `await import` so
		// the runner does not pull the full service graph at module load.
		if (spec === './VaultLintService') {
			assert.fail(
				"runner must not statically import './VaultLintService' — use a dynamic import inside the default scan path",
			);
		}
		for (const { pattern, reason } of RUNNER_FORBIDDEN_IMPORTS) {
			if (pattern.test(spec)) {
				assert.fail(`forbidden import '${spec}' in VaultLintRun.ts: ${reason}`);
			}
		}
	}
	console.log(`PASS: runnerImportsAreBoundaryClean (${specifiers.length} import(s) checked)`);
}

function testRunnerHasNoModuleLevelMutableDefaults(): void {
	const source = fs.readFileSync(RUNNER_PATH, 'utf8');
	const lines = source.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const stripped = line.replace(/\/\/.*$/, '');
		// Top-level `let` at column 0 — module-level mutable state.
		if (/^let\b/.test(stripped)) {
			assert.fail(
				`runner introduces a module-level mutable binding at line ${i + 1}: ${line}`,
			);
		}
		// Singleton registry shapes the modernization plan forbids.
		if (/getInstance\(\)/.test(stripped) && !/VaultLintService/.test(stripped)) {
			assert.fail(
				`runner uses unexpected singleton at line ${i + 1}: ${line}`,
			);
		}
		if (/static\s+instance\b/.test(stripped)) {
			assert.fail(
				`runner declares a static instance field at line ${i + 1}: ${line}`,
			);
		}
	}
	console.log('PASS: runnerHasNoModuleLevelMutableDefaults');
}

function testServiceAcceptsCallbacksAndHasNoUiStoreCoupling(): void {
	const source = fs.readFileSync(SERVICE_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);

	assert.ok(
		/runFullScan\s*\(\s*callbacks\?\s*:\s*VaultLintRunCallbacks\s*\)/.test(source),
		'VaultLintService.runFullScan must accept optional VaultLintRunCallbacks',
	);
	assert.ok(
		/callbacks\?\.onProgress\?\.\(\{\s*phase:\s*'init'/.test(source),
		"service must emit onProgress({ phase: 'init' })",
	);
	assert.ok(
		/callbacks\?\.onProgress\?\.\(\{\s*phase:\s*'scanning'/.test(source),
		"service must emit onProgress({ phase: 'scanning' })",
	);
	assert.ok(
		/callbacks\?\.onProgress\?\.\(\{\s*phase:\s*'cleared'/.test(source),
		"service must emit onProgress({ phase: 'cleared' })",
	);
	assert.ok(
		/callbacks\?\.onDetectorWarning\?\.\(\s*\w+\.id\s*,\s*err\s*\)/.test(source),
		'service must forward detector failures to onDetectorWarning',
	);

	// T5 closure proof: the service must no longer touch the UI store.
	// Strip comments before scanning so historical references in JSDoc
	// (e.g. "T5: this method no longer writes useVaultLintStore") do not
	// count as live couplings.
	const code = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	for (const spec of specifiers) {
		assert.ok(
			!/^@\/ui\//.test(spec),
			`T5 closure: VaultLintService.ts must not import from '@/ui/', found '${spec}'`,
		);
	}
	assert.ok(
		!/useVaultLintStore/.test(code),
		'T5 closure: VaultLintService.ts must not reference useVaultLintStore in code',
	);
	assert.ok(
		!/setScanProgress|setScanResult/.test(code),
		'T5 closure: VaultLintService.ts must not call setScanProgress / setScanResult',
	);

	// T6 closure proof: the service must no longer reach service
	// locators. All dependencies must come through the constructor
	// ports.
	for (const forbidden of [
		'AppContext.getInstance',
		'sqliteStoreManager',
		'SignalRegistry.getInstance',
		'static instance',
		'getInstance(',
	]) {
		assert.ok(
			!code.includes(forbidden),
			`T6 closure: VaultLintService.ts must not contain '${forbidden}'`,
		);
	}
	for (const spec of specifiers) {
		assert.ok(
			!/^@\/app\//.test(spec),
			`T6 closure: VaultLintService.ts must not import from '@/app/', found '${spec}'`,
		);
		assert.ok(
			spec !== '@/core/storage/sqlite/SqliteStoreManager',
			'T6 closure: VaultLintService.ts must not import SqliteStoreManager',
		);
	}

	console.log('PASS: serviceAcceptsCallbacksAndHasNoUiStoreCoupling');
}

async function testRunnerOnEventSinkReceivesEveryEventWithSnapshot(): Promise<void> {
	const captured: Array<{ type: string; snapshotLength: number }> = [];
	const out = await runVaultLintManualScan({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('obs'),
		onEvent: (event, snapshot) => {
			captured.push({ type: event.type, snapshotLength: snapshot.length });
		},
		scan: async (callbacks) => {
			callbacks.onProgress?.({ phase: 'init' });
			callbacks.onProgress?.({ phase: 'scanning', total: 2 });
			callbacks.onProgress?.({ phase: 'cleared' });
			return fakeScanResult({ id: 'sink-test' });
		},
	});

	const types = captured.map((c) => c.type);
	assert.deepStrictEqual(types, [
		'status',     // queued
		'status',     // running
		'progress',   // init
		'progress',   // scanning
		'progress',   // cleared
		'artifact',
		'status',     // completed
	], 'onEvent sink must observe every event in emission order');

	// Snapshot length should grow by exactly 1 per event, matching the
	// internal trace as it is built.
	const lengths = captured.map((c) => c.snapshotLength);
	assert.deepStrictEqual(lengths, [1, 2, 3, 4, 5, 6, 7]);

	// Final out.events must match the final snapshot length.
	assert.strictEqual(out.events.length, 7);
	console.log('PASS: runnerOnEventSinkReceivesEveryEventWithSnapshot');
}

async function testRunnerRejectsCallWithNeitherRuntimeNorScan(): Promise<void> {
	// T6R: the runner no longer has a fallback that looks the
	// runtime up via `getVaultLintRuntime()` — that function has
	// been deleted along with the service-layer runtime binding.
	// Callers MUST pass `runtime` (production) or `scan` (tests).
	let thrown: unknown;
	try {
		await runVaultLintManualScan({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('no-deps'),
		});
	} catch (e) {
		thrown = e;
	}
	assert.ok(thrown instanceof Error, 'runner must reject calls with no runtime and no scan');
	assert.ok(
		/options\.runtime or options\.scan/.test((thrown as Error).message),
		`runner error must explain the missing argument, got '${(thrown as Error).message}'`,
	);
	console.log('PASS: runnerRejectsCallWithNeitherRuntimeNorScan');
}

async function testRunnerInvokesInjectedRuntimeRunFullScan(): Promise<void> {
	// T6R: passing `runtime` is how the production UI hook drives
	// scans. Asserts the runner forwards callbacks to runtime.runFullScan.
	let runtimeCalls = 0;
	let receivedCallbacks = false;
	const fakeRuntime = {
		async runFullScan(callbacks?: VaultLintRunCallbacks) {
			runtimeCalls += 1;
			if (callbacks?.onProgress) receivedCallbacks = true;
			callbacks?.onProgress?.({ phase: 'init' });
			callbacks?.onProgress?.({ phase: 'cleared' });
			return fakeScanResult({ id: 'from-injected-runtime' });
		},
		async loadLatestScan() {
			return null;
		},
	};
	const out = await runVaultLintManualScan({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('inj'),
		runtime: fakeRuntime,
	});
	assert.strictEqual(runtimeCalls, 1);
	assert.ok(receivedCallbacks, 'runner must forward its callbacks object to the runtime');
	assert.strictEqual(out.result.id, 'from-injected-runtime');
	console.log('PASS: runnerInvokesInjectedRuntimeRunFullScan');
}

async function testRunnerOnEventSinkSeesFailureEvents(): Promise<void> {
	const captured: string[] = [];
	const boom = new Error('detector crash');
	try {
		await runVaultLintManualScan({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('obs-fail'),
			onEvent: (event) => captured.push(event.type),
			scan: async (callbacks) => {
				callbacks.onProgress?.({ phase: 'init' });
				throw boom;
			},
		});
		assert.fail('runner should rethrow scan failure');
	} catch (e) {
		assert.strictEqual(e, boom);
	}

	assert.deepStrictEqual(captured, [
		'status',     // queued
		'status',     // running
		'progress',   // init
		'error',
		'status',     // failed
	], 'onEvent sink must observe the error + failed sequence on failure path');
	console.log('PASS: runnerOnEventSinkSeesFailureEvents');
}

async function testTwoConcurrentRunsHaveIsolatedSinks(): Promise<void> {
	const a: string[] = [];
	const b: string[] = [];
	const [outA, outB] = await Promise.all([
		runVaultLintManualScan({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('a'),
			onEvent: (event) => a.push(`${event.type}@a`),
			scan: async () => fakeScanResult({ id: 'concurrent-a' }),
		}),
		runVaultLintManualScan({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('b'),
			onEvent: (event) => b.push(`${event.type}@b`),
			scan: async () => fakeScanResult({ id: 'concurrent-b' }),
		}),
	]);
	assert.notStrictEqual(outA.session.runId, outB.session.runId);
	assert.ok(a.length > 0 && a.every((t) => t.endsWith('@a')), "sink A must only receive run A's events");
	assert.ok(b.length > 0 && b.every((t) => t.endsWith('@b')), "sink B must only receive run B's events");
	console.log('PASS: twoConcurrentRunsHaveIsolatedSinks');
}

// ---------------------------------------------------------------------------
// Test driver
// ---------------------------------------------------------------------------

function testUiStoreFileIsDeleted(): void {
	const storePath = path.resolve(process.cwd(), 'src/ui/store/vaultLintStore.ts');
	assert.ok(
		!fs.existsSync(storePath),
		'T5 closure: src/ui/store/vaultLintStore.ts must be deleted',
	);
	console.log('PASS: uiStoreFileIsDeleted');
}

function testVaultXRaySurfaceIsRetired(): void {
	// T11Y-1: the standalone Vault X-Ray surface (view, panel, hook) was
	// hard-retired. The lint runtime remains as an internal provider for
	// the Vault Intelligence loop.
	const retired = [
		'src/ui/view/vault-lint/VaultXRayPanel.tsx',
		'src/ui/view/vault-lint/hooks/useVaultLintRunState.ts',
		'src/app/view/VaultXRayView.ts',
	];
	for (const rel of retired) {
		const full = path.resolve(process.cwd(), rel);
		assert.ok(!fs.existsSync(full), `T11Y-1: ${rel} must be deleted`);
	}
	console.log('PASS: vaultXRaySurfaceIsRetired');
}

async function main(): Promise<void> {
	await testHappyPathProducesDeterministicEventTrace();
	await testFailurePathRecordsErrorAndFailedStatusThenRethrows();
	await testDetectorWarningCallbackBecomesWarnLogEvent();
	await testEachInvocationConstructsItsOwnRecorderWhenNoneProvided();
	await testRunnerOnEventSinkReceivesEveryEventWithSnapshot();
	await testRunnerRejectsCallWithNeitherRuntimeNorScan();
	await testRunnerInvokesInjectedRuntimeRunFullScan();
	await testRunnerOnEventSinkSeesFailureEvents();
	await testTwoConcurrentRunsHaveIsolatedSinks();
	testRunnerImportsAreBoundaryClean();
	testRunnerHasNoModuleLevelMutableDefaults();
	testServiceAcceptsCallbacksAndHasNoUiStoreCoupling();
	testUiStoreFileIsDeleted();
	testVaultXRaySurfaceIsRetired();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
