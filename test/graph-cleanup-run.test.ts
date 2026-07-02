// T3 Adopter 4 — golden trace for GraphCleanupService.run() adoption.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	runGraphCleanup,
	GRAPH_CLEANUP_CAPABILITY_ID,
} from '@/service/search/index/maintenance/GraphCleanupRun';
import type { GraphCleanupResult } from '@/service/search/index/maintenance/GraphCleanupService';
import type { RunClock, RunIdFactory, RunEvent } from '@/service/run-envelope';

function makeFakeClock(start = 4000): RunClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

interface ExpectedEvent { type: RunEvent['type']; status?: string; }

function assertEventSequence(events: readonly RunEvent[], expected: ExpectedEvent[]): void {
	assert.strictEqual(events.length, expected.length, `expected ${expected.length} events, got ${events.length}`);
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(events[i]!.type, expected[i]!.type);
		if (expected[i]!.status !== undefined) {
			assert.strictEqual((events[i]! as { status?: string }).status, expected[i]!.status);
		}
	}
}

async function testHappyPath(): Promise<void> {
	const canned: GraphCleanupResult = { orphanEdgesDeleted: 7, nodesWithoutIndexedDocumentDeleted: 3 };
	const result = await runGraphCleanup({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('gc-test'),
		trigger: 'manual',
		clean: async () => canned,
	});
	assert.strictEqual(result.session.capabilityId, GRAPH_CLEANUP_CAPABILITY_ID);
	assert.strictEqual(result.session.trigger, 'manual');
	assert.strictEqual(result.session.status, 'completed');
	assert.deepStrictEqual(result.result, canned);
	assertEventSequence(result.events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'artifact' },
		{ type: 'status', status: 'completed' },
	]);
	assert.match(result.artifact.title!, /^Graph cleanup \(7 orphan edges, 3 stale nodes\)$/);
	console.log('PASS: happyPath');
}

async function testFailurePath(): Promise<void> {
	const raised = new Error('sqlite disk I/O error');
	let events: readonly RunEvent[] = [];
	let thrown: unknown = null;
	try {
		await runGraphCleanup({
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('gc-fail'),
			clean: async () => { throw raised; },
			onEvent: (_, snapshot) => { events = snapshot; },
		});
	} catch (err) { thrown = err; }
	assert.strictEqual(thrown, raised);
	assertEventSequence(events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'error' },
		{ type: 'status', status: 'failed' },
	]);
	console.log('PASS: failurePath');
}

async function testAcceptsCleaner(): Promise<void> {
	let called = 0;
	const cleaner = {
		async run(): Promise<GraphCleanupResult> {
			called += 1;
			return { orphanEdgesDeleted: 0, nodesWithoutIndexedDocumentDeleted: 0 };
		},
	};
	await runGraphCleanup({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('gc-cleaner'),
		cleaner,
	});
	assert.strictEqual(called, 1);
	console.log('PASS: acceptsCleaner');
}

const RUNNER_PATH = path.resolve(process.cwd(), 'src/service/search/index/maintenance/GraphCleanupRun.ts');
const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');

function testRunnerBoundary(): void {
	const stripped = runnerSource
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
	const forbidden: Array<{ pattern: RegExp; reason: string }> = [
		{ pattern: /from ['"]@\/app\//, reason: 'app-shell import' },
		{ pattern: /from ['"]@\/ui\//, reason: 'ui import' },
		{ pattern: /from ['"]obsidian(\/|['"])/, reason: 'obsidian import' },
		{ pattern: /AppContext\.getInstance/, reason: 'AppContext usage' },
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
	await testAcceptsCleaner();
	console.log('graph-cleanup-run: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
