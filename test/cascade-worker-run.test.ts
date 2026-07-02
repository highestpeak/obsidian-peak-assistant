// T3 Adopter 3 — golden trace for CascadeWorker.drainDebt() adoption.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	runCascadeDrain,
	CASCADE_WORKER_CAPABILITY_ID,
	type CascadeDrainSummary,
} from '@/service/search/index/cascade/CascadeWorkerRun';
import type { RunClock, RunIdFactory, RunEvent } from '@/service/run-envelope';

function makeFakeClock(start = 3000): RunClock {
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

interface ExpectedEvent {
	type: RunEvent['type'];
	status?: string;
}

function assertEventSequence(events: readonly RunEvent[], expected: ExpectedEvent[]): void {
	assert.strictEqual(events.length, expected.length, `expected ${expected.length} events, got ${events.length}: ${JSON.stringify(events.map((e) => e.type))}`);
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(events[i]!.type, expected[i]!.type, `event[${i}].type mismatch`);
		if (expected[i]!.status !== undefined) {
			assert.strictEqual((events[i]! as { status?: string }).status, expected[i]!.status);
		}
	}
}

async function testHappyPath(): Promise<void> {
	const summary: CascadeDrainSummary = { processedCount: 3, affectedDocCount: 2, remainingCount: 5 };
	const result = await runCascadeDrain({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('drain-test'),
		trigger: 'scheduled',
		drain: async (cb) => {
			cb.onProgress?.({ phase: 'semantic_edge', label: 'doc-1', processed: 1, total: 3 });
			cb.onProgress?.({ phase: 'semantic_edge', label: 'doc-2', processed: 2, total: 3 });
			cb.onProgress?.({ phase: 'semantic_edge', label: 'doc-3', processed: 3, total: 3 });
			return summary;
		},
	});
	assert.strictEqual(result.session.capabilityId, CASCADE_WORKER_CAPABILITY_ID);
	assert.strictEqual(result.session.status, 'completed');
	assert.deepStrictEqual(result.summary, summary);
	assertEventSequence(result.events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'progress' },
		{ type: 'progress' },
		{ type: 'progress' },
		{ type: 'artifact' },
		{ type: 'status', status: 'completed' },
	]);
	assert.match(result.artifact.title!, /^Cascade drain \(3 processed, 5 remaining\)$/);
	console.log('PASS: happyPath');
}

async function testFailurePath(): Promise<void> {
	const raised = new Error('cascade repo unavailable');
	let events: readonly RunEvent[] = [];
	let thrown: unknown = null;
	try {
		await runCascadeDrain({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('drain-fail'),
			drain: async () => { throw raised; },
			onEvent: (_, snapshot) => { events = snapshot; },
		});
	} catch (err) {
		thrown = err;
	}
	assert.strictEqual(thrown, raised);
	assertEventSequence(events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'error' },
		{ type: 'status', status: 'failed' },
	]);
	console.log('PASS: failurePath');
}

async function testRejectsWithoutDrain(): Promise<void> {
	let thrown: unknown = null;
	try {
		await runCascadeDrain({ clock: makeFakeClock(), idFactory: makeFakeIdFactory('x') });
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error);
	assert.match((thrown as Error).message, /drain must be provided/);
	console.log('PASS: rejectsWithoutDrain');
}

const RUNNER_PATH = path.resolve(process.cwd(), 'src/service/search/index/cascade/CascadeWorkerRun.ts');
const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');

function testRunnerBoundary(): void {
	const stripped = runnerSource
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	const forbidden: Array<{ pattern: RegExp; reason: string }> = [
		{ pattern: /from ['"]@\/app\//, reason: 'runner must not import app-shell' },
		{ pattern: /from ['"]@\/ui\//, reason: 'runner must not import UI layer' },
		{ pattern: /from ['"]obsidian(\/|['"])/, reason: 'runner must not import Obsidian' },
		{ pattern: /AppContext\.getInstance/, reason: 'runner must not use AppContext' },
		{ pattern: /sqliteStoreManager\b/, reason: 'runner must not touch sqliteStoreManager' },
	];
	for (const { pattern, reason } of forbidden) {
		assert.ok(!pattern.test(stripped), `boundary violation: ${reason}`);
	}
	console.log('PASS: runnerBoundary');
}

async function run(): Promise<void> {
	testRunnerBoundary();
	await testHappyPath();
	await testFailurePath();
	await testRejectsWithoutDrain();
	console.log('cascade-worker-run: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
