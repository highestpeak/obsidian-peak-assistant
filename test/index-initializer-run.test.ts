// T3 Wave 2.A — golden trace for IndexInitializer adoption.
//
// Locks the RunEvent sequence emitted by `runIndexInitializer` so that
// UI store projections (T7) and cross-backend conformance tests (T10)
// can rely on the byte-exact shape. Uses injected clock + idFactory so
// timestamps and ids are deterministic.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	runIndexInitializer,
	INDEX_INITIALIZER_CAPABILITY_ID,
} from '@/service/search/index/indexInitializerRun';
import type { RunClock, RunIdFactory, RunEvent } from '@/service/run-envelope';

// ---------------------------------------------------------------------------
// Fakes (byte-deterministic).
// ---------------------------------------------------------------------------

function makeFakeClock(start = 5000): RunClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return {
		next(): string {
			seq += 1;
			return `${prefix}-${seq}`;
		},
	};
}

// ---------------------------------------------------------------------------
// Case 1 — happy path: initialize resolves; expect status/artifact/status.
// ---------------------------------------------------------------------------

async function testHappyPathTrace(): Promise<void> {
	const clock = makeFakeClock();
	const idFactory = makeFakeIdFactory('idx-init-test');
	const result = await runIndexInitializer({
		clock,
		idFactory,
		trigger: 'startup',
		initialize: async () => {
			// no-op — represents a successful check-and-update
		},
	});

	// Sanity on the returned pieces.
	assert.strictEqual(result.session.capabilityId, INDEX_INITIALIZER_CAPABILITY_ID);
	assert.strictEqual(result.session.trigger, 'startup');
	assert.strictEqual(result.session.status, 'completed');
	assert.ok(result.session.endedAt !== undefined, 'endedAt must be set on completion');
	assert.strictEqual(result.artifact.kind, 'result');
	assert.strictEqual(result.artifact.contentType, 'application/vnd.peak.index-initialize+json');

	// Golden trace: start() emits status(queued); recordStatus('running')
	// then artifact; finish('completed') emits status(completed).
	assertEventSequence(result.events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'artifact' },
		{ type: 'status', status: 'completed' },
	]);
	console.log('PASS: happyPathTrace');
}

// ---------------------------------------------------------------------------
// Case 2 — failure path: initialize throws; expect status/error/status,
// no artifact, and the original error propagates.
// ---------------------------------------------------------------------------

async function testFailureTrace(): Promise<void> {
	const clock = makeFakeClock();
	const idFactory = makeFakeIdFactory('idx-init-fail');
	const raised = new Error('boom: sqlite locked');
	let thrown: unknown = null;
	let events: readonly RunEvent[] = [];
	let recorder: any = null;

	// Capture events via onEvent since we won't get the normal return
	// on the failure path.
	try {
		await runIndexInitializer({
			clock,
			idFactory,
			initialize: async () => { throw raised; },
			onEvent: (_ev, snapshot) => {
				events = snapshot;
				void recorder;
			},
		});
	} catch (err) {
		thrown = err;
	}

	assert.strictEqual(thrown, raised, 'original error must propagate unchanged');
	assertEventSequence(events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'error' },
		{ type: 'status', status: 'failed' },
	]);
	// No artifact on failure.
	const hasArtifact = events.some((e) => e.type === 'artifact');
	assert.strictEqual(hasArtifact, false, 'failure trace must not contain an artifact event');
	console.log('PASS: failureTrace');
}

// ---------------------------------------------------------------------------
// Case 3 — rejects when neither initializer nor initialize supplied.
// ---------------------------------------------------------------------------

async function testRejectsWithoutTarget(): Promise<void> {
	let thrown: unknown = null;
	try {
		await runIndexInitializer({ clock: makeFakeClock(), idFactory: makeFakeIdFactory('x') });
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof Error, 'expected an error');
	assert.match((thrown as Error).message, /initializer or options\.initialize/);
	console.log('PASS: rejectsWithoutTarget');
}

// ---------------------------------------------------------------------------
// Case 4 — accepts `initializer` handle (production shape) and calls its
// checkAndUpdateIndex().
// ---------------------------------------------------------------------------

async function testAcceptsInitializerHandle(): Promise<void> {
	let called = 0;
	const handle = {
		async checkAndUpdateIndex() { called += 1; },
	};
	await runIndexInitializer({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('idx-init-handle'),
		initializer: handle,
	});
	assert.strictEqual(called, 1, 'initializer.checkAndUpdateIndex must be invoked exactly once');
	console.log('PASS: acceptsInitializerHandle');
}

// ---------------------------------------------------------------------------
// Case 5 — source-scan boundary guard: runner MUST NOT import from app/ui.
// ---------------------------------------------------------------------------

const RUNNER_PATH = path.resolve(
	process.cwd(),
	'src/service/search/index/indexInitializerRun.ts',
);
const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');

function testRunnerBoundary(): void {
	// Strip comments so documentation prose that names forbidden APIs
	// (e.g. "MUST NOT touch sqliteStoreManager") does not false-positive.
	const stripped = runnerSource
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	const forbidden: Array<{ pattern: RegExp; reason: string }> = [
		{ pattern: /from ['"]@\/app\//, reason: 'runner must not import app-shell' },
		{ pattern: /from ['"]@\/ui\//, reason: 'runner must not import UI layer' },
		{ pattern: /from ['"]obsidian(\/|['"])/, reason: 'runner must not import Obsidian' },
		{ pattern: /AppContext\.getInstance/, reason: 'runner must not use AppContext.getInstance' },
		{ pattern: /sqliteStoreManager\b/, reason: 'runner must not touch sqliteStoreManager directly' },
	];
	for (const { pattern, reason } of forbidden) {
		assert.ok(!pattern.test(stripped), `boundary violation: ${reason}`);
	}
	console.log('PASS: runnerBoundary');
}

// ---------------------------------------------------------------------------
// Helper: assert event sequence matches an expected type/status pattern.
// ---------------------------------------------------------------------------

interface ExpectedEvent {
	type: RunEvent['type'];
	status?: string;
}

function assertEventSequence(events: readonly RunEvent[], expected: ExpectedEvent[]): void {
	assert.strictEqual(events.length, expected.length, `expected ${expected.length} events, got ${events.length}: ${JSON.stringify(events.map((e) => e.type))}`);
	for (let i = 0; i < expected.length; i++) {
		const exp = expected[i]!;
		const got = events[i]!;
		assert.strictEqual(got.type, exp.type, `event[${i}].type mismatch (expected ${exp.type}, got ${got.type})`);
		if (exp.status !== undefined) {
			assert.strictEqual((got as { status?: string }).status, exp.status, `event[${i}].status mismatch`);
		}
	}
}

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	testRunnerBoundary();
	await testHappyPathTrace();
	await testFailureTrace();
	await testRejectsWithoutTarget();
	await testAcceptsInitializerHandle();
	console.log('index-initializer-run: all guards passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
