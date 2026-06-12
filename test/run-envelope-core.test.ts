import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	InMemoryRunRecorder,
	type ArtifactRef,
	type RunClock,
	type RunEvent,
	type RunIdFactory,
	type RunSession,
} from '@/service/run-envelope';

// ---------------------------------------------------------------------------
// Fakes (deterministic by construction)
// ---------------------------------------------------------------------------

function makeFakeClock(start = 1000): RunClock {
	let t = start;
	return {
		now(): number {
			return t++;
		},
	};
}

function makeFakeIdFactory(prefix = 'id'): RunIdFactory {
	let n = 0;
	return {
		next(): string {
			n += 1;
			return `${prefix}-${n}`;
		},
	};
}

function newRecorder(): InMemoryRunRecorder {
	return new InMemoryRunRecorder({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory(),
	});
}

// ---------------------------------------------------------------------------
// Source-scan guards (boundary discipline)
// ---------------------------------------------------------------------------

const TYPES_PATH = path.resolve(
	process.cwd(),
	'src/service/run-envelope/types.ts',
);
const RECORDER_PATH = path.resolve(
	process.cwd(),
	'src/service/run-envelope/InMemoryRunRecorder.ts',
);
const INDEX_PATH = path.resolve(
	process.cwd(),
	'src/service/run-envelope/index.ts',
);

const FORBIDDEN_IMPORT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /^obsidian(\/.*)?$/, reason: 'envelope core must not import Obsidian' },
	{ pattern: /^@\/app\//, reason: 'envelope core must not depend on the app shell' },
	{ pattern: /^@\/ui\//, reason: 'envelope core must not depend on the UI layer' },
	{ pattern: /^@\/core\/storage\//, reason: 'envelope core must not depend on storage adapters' },
	{ pattern: /^@\/service\/ports\//, reason: 'envelope core must not depend on T2 ports yet (T4 will introduce ports)' },
	{ pattern: /^@\/service\/capabilities\//, reason: 'envelope core must not pull the Settings readiness registry into the runtime' },
	{ pattern: /^@\/service\/lint\//, reason: 'envelope core must not import VaultLintContract directly (T4 wires Vault Lint, not T3A)' },
	{ pattern: /^zustand(\/.*)?$/, reason: 'envelope core must not depend on zustand' },
	{ pattern: /^react(\/.*)?$/, reason: 'envelope core must not depend on React' },
	{ pattern: /^better-sqlite3$/, reason: 'envelope core must not depend on the SQLite driver' },
];

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

function testTypesFileIsPureTypeOnly(): void {
	const source = fs.readFileSync(TYPES_PATH, 'utf8');
	assert.strictEqual(
		extractImportSpecifiers(source).length,
		0,
		'types.ts must have zero imports (pure type module)',
	);
	// No class. No function. No top-level let/const/var. Comments and
	// type/interface/type-alias declarations only.
	const stripped = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	assert.ok(!/\bclass\s+\w+/.test(stripped), 'types.ts must not declare a class');
	assert.ok(!/\bfunction\s+\w+/.test(stripped), 'types.ts must not declare a function');
	assert.ok(
		!/^\s*(?:const|let|var)\s+\w+/m.test(stripped),
		'types.ts must not declare a top-level const/let/var (type aliases only)',
	);
	console.log('PASS: typesFileIsPureTypeOnly');
}

function testRecorderFileHasNoForbiddenImports(): void {
	const source = fs.readFileSync(RECORDER_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	for (const spec of specifiers) {
		for (const { pattern, reason } of FORBIDDEN_IMPORT_PATTERNS) {
			if (pattern.test(spec)) {
				assert.fail(`forbidden import '${spec}' in InMemoryRunRecorder.ts: ${reason}`);
			}
		}
		assert.strictEqual(
			spec,
			'./types',
			`InMemoryRunRecorder.ts may only import from './types'; found '${spec}'`,
		);
	}
	console.log(`PASS: recorderFileHasNoForbiddenImports (${specifiers.length} import(s) checked)`);
}

function testIndexFileIsBarrelOnly(): void {
	const source = fs.readFileSync(INDEX_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	for (const spec of specifiers) {
		assert.ok(
			spec === './types' || spec === './InMemoryRunRecorder',
			`index.ts may only re-export local files; found '${spec}'`,
		);
	}
	const stripped = source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	// Barrel must only contain `export ... from ...` statements (plus
	// `export type ... from ...`). No class/function/let/const at top
	// level.
	assert.ok(!/\bclass\s+\w+/.test(stripped), 'index.ts barrel must not declare a class');
	assert.ok(!/\bfunction\s+\w+/.test(stripped), 'index.ts barrel must not declare a function');
	console.log('PASS: indexFileIsBarrelOnly');
}

function testNoModuleLevelMutableDefaultsInEnvelopeFiles(): void {
	for (const filePath of [TYPES_PATH, RECORDER_PATH, INDEX_PATH]) {
		const source = fs.readFileSync(filePath, 'utf8');
		const stripped = source
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/[^\n]*/g, '');
		assert.ok(
			!/^\s*let\s+default[A-Z]/m.test(stripped),
			`${path.basename(filePath)} must not declare a module-level \`let default...\` mutable global`,
		);
		assert.ok(
			!/\bstatic\s+instance\b/.test(stripped),
			`${path.basename(filePath)} must not declare a \`static instance\` singleton`,
		);
		assert.ok(
			!/\bgetInstance\s*\(/.test(stripped),
			`${path.basename(filePath)} must not expose a \`getInstance(...)\` method`,
		);
		// Top-level `new Map(` / `new Set(` would indicate a module-level
		// registry. Class field initializers are fine and live indented.
		assert.ok(
			!/^[^\s][^\n]*new\s+(?:Map|Set)\s*\(/m.test(stripped),
			`${path.basename(filePath)} must not instantiate a module-level Map/Set registry`,
		);
	}
	console.log('PASS: noModuleLevelMutableDefaultsInEnvelopeFiles');
}

function testRecorderDoesNotImportProgressReporterPort(): void {
	const source = fs.readFileSync(RECORDER_PATH, 'utf8');
	assert.ok(
		!/ProgressReporterPort/.test(source),
		'InMemoryRunRecorder.ts must not reference ProgressReporterPort (T3A defers ports to T4)',
	);
	console.log('PASS: recorderDoesNotImportProgressReporterPort');
}

// ---------------------------------------------------------------------------
// Deterministic runtime behavior
// ---------------------------------------------------------------------------

function testStartEmitsQueuedStatusAndStampsIdentity(): void {
	const r = newRecorder();
	const session = r.start({ capabilityId: 'vault.lint.scan', trigger: 'manual' });
	assert.strictEqual(session.runId, 'id-1');
	assert.strictEqual(session.capabilityId, 'vault.lint.scan');
	assert.strictEqual(session.status, 'queued');
	assert.strictEqual(session.trigger, 'manual');
	assert.strictEqual(session.startedAt, 1000);
	assert.strictEqual(session.endedAt, undefined);
	const events = r.getEvents();
	assert.strictEqual(events.length, 1);
	assert.deepStrictEqual(events[0], {
		type: 'status',
		runId: 'id-1',
		status: 'queued',
		ts: 1000,
	});
	console.log('PASS: startEmitsQueuedStatusAndStampsIdentity');
}

function testCallingStartTwiceThrows(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	assert.throws(() => r.start({ capabilityId: 'c', trigger: 'test' }), /already owns a run/);
	console.log('PASS: callingStartTwiceThrows');
}

function testRecordingBeforeStartThrows(): void {
	const r = newRecorder();
	assert.throws(() => r.recordProgress({ phase: 'x' }), /no active run/);
	assert.throws(() => r.recordError('e', false), /no active run/);
	assert.throws(() => r.recordLog('info', 'm'), /no active run/);
	assert.throws(() => r.recordArtifact({ kind: 'result' }), /no active run/);
	assert.throws(() => r.recordStatus('running'), /no active run/);
	assert.throws(() => r.finish('completed'), /no active run/);
	assert.throws(() => r.getSession(), /no active run/);
	console.log('PASS: recordingBeforeStartThrows');
}

function testRecordStatusRejectsTerminalStatuses(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	for (const final of ['completed', 'failed', 'cancelled'] as const) {
		assert.throws(() => r.recordStatus(final), /use finish/);
	}
	console.log('PASS: recordStatusRejectsTerminalStatuses');
}

function testHappyPathProducesByteExactEventTrace(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'vault.lint.scan', trigger: 'manual' }); // t=1000, id-1
	r.recordStatus('running'); // t=1001
	r.recordProgress({ phase: 'init' }); // t=1002
	r.recordProgress({ phase: 'scanning', processed: 0, total: 100 }); // t=1003
	const artifact = r.recordArtifact({ kind: 'result', title: 'X' }); // t=1004, id-2
	r.recordLog('info', 'ok'); // t=1005
	const finalSession = r.finish('completed'); // t=1006

	assert.strictEqual(artifact.artifactId, 'id-2');
	assert.strictEqual(artifact.runId, 'id-1');
	assert.strictEqual(artifact.createdAt, 1004);
	assert.strictEqual(finalSession.status, 'completed');
	assert.strictEqual(finalSession.endedAt, 1006);

	const events = r.getEvents();
	assert.deepStrictEqual(events, [
		{ type: 'status', runId: 'id-1', status: 'queued', ts: 1000 },
		{ type: 'status', runId: 'id-1', status: 'running', ts: 1001 },
		{ type: 'progress', runId: 'id-1', phase: 'init', ts: 1002 },
		{ type: 'progress', runId: 'id-1', phase: 'scanning', processed: 0, total: 100, ts: 1003 },
		{
			type: 'artifact',
			runId: 'id-1',
			artifact: {
				artifactId: 'id-2',
				runId: 'id-1',
				kind: 'result',
				title: 'X',
				createdAt: 1004,
			} as ArtifactRef,
			ts: 1004,
		},
		{ type: 'log', runId: 'id-1', level: 'info', message: 'ok', ts: 1005 },
		{ type: 'status', runId: 'id-1', status: 'completed', ts: 1006 },
	]);
	console.log('PASS: happyPathProducesByteExactEventTrace');
}

function testFailurePathRecordsErrorAndFailedStatus(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	r.recordError('disk full', false);
	const finalSession = r.finish('failed');
	assert.strictEqual(finalSession.status, 'failed');
	assert.ok(typeof finalSession.endedAt === 'number');
	const events = r.getEvents();
	const errEv = events.find((e) => e.type === 'error');
	assert.ok(errEv, 'expected an error event in the trace');
	assert.strictEqual((errEv as { recoverable: boolean }).recoverable, false);
	const finalStatus = events.at(-1) as { type: string; status: string };
	assert.strictEqual(finalStatus.type, 'status');
	assert.strictEqual(finalStatus.status, 'failed');
	console.log('PASS: failurePathRecordsErrorAndFailedStatus');
}

function testCancellationPathEmitsOnlyTwoStatusEvents(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	const finalSession = r.finish('cancelled');
	assert.strictEqual(finalSession.status, 'cancelled');
	const events = r.getEvents();
	assert.strictEqual(events.length, 2);
	assert.strictEqual(events[0]!.type, 'status');
	assert.strictEqual(events[1]!.type, 'status');
	assert.strictEqual((events[1] as { status: string }).status, 'cancelled');
	console.log('PASS: cancellationPathEmitsOnlyTwoStatusEvents');
}

function testFinishTwiceThrows(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	r.finish('completed');
	assert.throws(() => r.finish('failed'), /already finished/);
	console.log('PASS: finishTwiceThrows');
}

function testArtifactIdsAreUniqueAndShareRunId(): void {
	const r = newRecorder();
	const session = r.start({ capabilityId: 'c', trigger: 'test' });
	const a1 = r.recordArtifact({ kind: 'result' });
	const a2 = r.recordArtifact({ kind: 'trace' });
	const a3 = r.recordArtifact({ kind: 'report' });
	assert.notStrictEqual(a1.artifactId, a2.artifactId);
	assert.notStrictEqual(a2.artifactId, a3.artifactId);
	for (const a of [a1, a2, a3]) assert.strictEqual(a.runId, session.runId);
	console.log('PASS: artifactIdsAreUniqueAndShareRunId');
}

function testGetSessionReturnsSnapshotNotLiveReference(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	const s1 = r.getSession();
	// Mutate the returned snapshot — the recorder must not pick it up.
	(s1 as { status: string }).status = 'completed';
	const s2 = r.getSession();
	assert.strictEqual(s2.status, 'queued', 'recorder must not be affected by mutating a returned snapshot');
	console.log('PASS: getSessionReturnsSnapshotNotLiveReference');
}

function testGetEventsReturnsIndependentArray(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	const e1 = r.getEvents();
	(e1 as RunEvent[]).pop();
	const e2 = r.getEvents();
	assert.strictEqual(e2.length, 1, 'mutating the returned events array must not affect the recorder');
	console.log('PASS: getEventsReturnsIndependentArray');
}

function testRunEventUnionIsExhaustive(): void {
	// Pull-mode validation that the discriminated union has the exact
	// five members T3A locked in. This is a compile-time + runtime
	// belt-and-braces check.
	const samples: RunEvent[] = [
		{ type: 'status', runId: 'r', status: 'queued', ts: 0 },
		{ type: 'progress', runId: 'r', phase: 'p', ts: 0 },
		{
			type: 'artifact',
			runId: 'r',
			artifact: { artifactId: 'a', runId: 'r', kind: 'result', createdAt: 0 },
			ts: 0,
		},
		{ type: 'error', runId: 'r', message: 'm', recoverable: true, ts: 0 },
		{ type: 'log', runId: 'r', level: 'info', message: 'm', ts: 0 },
	];
	const seen = new Set<RunEvent['type']>();
	for (const ev of samples) {
		switch (ev.type) {
			case 'status': seen.add('status'); break;
			case 'progress': seen.add('progress'); break;
			case 'artifact': seen.add('artifact'); break;
			case 'error': seen.add('error'); break;
			case 'log': seen.add('log'); break;
			default: {
				const exhaustive: never = ev;
				throw new Error(`non-exhaustive RunEvent switch: ${JSON.stringify(exhaustive)}`);
			}
		}
	}
	assert.strictEqual(seen.size, 5);
	console.log('PASS: runEventUnionIsExhaustive');
}

function testRecorderHasNoSubscribeApi(): void {
	const r = newRecorder() as unknown as Record<string, unknown>;
	for (const forbidden of ['on', 'emit', 'subscribe', 'addListener', 'off']) {
		assert.strictEqual(
			typeof r[forbidden],
			'undefined',
			`InMemoryRunRecorder must not expose '${forbidden}' (T3A is pull-mode only; subscription is T7)`,
		);
	}
	console.log('PASS: recorderHasNoSubscribeApi');
}

function testRecorderHasNoPortsField(): void {
	const r = newRecorder();
	r.start({ capabilityId: 'c', trigger: 'test' });
	const session = r.getSession() as RunSession & { ports?: unknown };
	assert.strictEqual(
		session.ports,
		undefined,
		'RunSession must not expose a `ports` field in T3A (deferred to T4)',
	);
	console.log('PASS: recorderHasNoPortsField');
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

try {
	testTypesFileIsPureTypeOnly();
	testRecorderFileHasNoForbiddenImports();
	testIndexFileIsBarrelOnly();
	testNoModuleLevelMutableDefaultsInEnvelopeFiles();
	testRecorderDoesNotImportProgressReporterPort();
	testStartEmitsQueuedStatusAndStampsIdentity();
	testCallingStartTwiceThrows();
	testRecordingBeforeStartThrows();
	testRecordStatusRejectsTerminalStatuses();
	testHappyPathProducesByteExactEventTrace();
	testFailurePathRecordsErrorAndFailedStatus();
	testCancellationPathEmitsOnlyTwoStatusEvents();
	testFinishTwiceThrows();
	testArtifactIdsAreUniqueAndShareRunId();
	testGetSessionReturnsSnapshotNotLiveReference();
	testGetEventsReturnsIndependentArray();
	testRunEventUnionIsExhaustive();
	testRecorderHasNoSubscribeApi();
	testRecorderHasNoPortsField();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
