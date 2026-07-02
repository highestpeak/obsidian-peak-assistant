// T3 Wave 3 — golden traces + boundary guards for the four Chat /
// Copilot / Analysis / Harness adopters.
//
// Each adopter is a thin RunSession wrapper around a caller-supplied
// worker. We verify:
//   1. capability id constant matches handbook §8 vocabulary
//   2. session status is 'completed' on happy path
//   3. golden trace = [status(queued), status(running), artifact, status(completed)]
//   4. failure trace = [status(queued), status(running), error, status(failed)]
//   5. source-scan boundary: no app/ui/obsidian/AppContext imports
//
// Sharing one test file keeps the four adopters visibly uniform. If a
// future adopter drifts (e.g. adds a `progress` mid-trace) the shared
// assertion set will surface the drift immediately.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
	runChatConversation,
	CHAT_CONVERSATION_CAPABILITY_ID,
} from '@/service/chat/ChatConversationRun';
import {
	runCopilotReview,
	COPILOT_REVIEW_CAPABILITY_ID,
} from '@/service/copilot/CopilotReviewRun';
import {
	runAnalysisReport,
	ANALYSIS_REPORT_CAPABILITY_ID,
} from '@/service/agents/report/AnalysisReportRun';
import {
	runHarnessAgent,
	HARNESS_AGENT_CAPABILITY_ID,
} from '@/service/agents/harness/HarnessAgentRun';
import type { RunClock, RunEvent, RunIdFactory } from '@/service/run-envelope';

// ---------------------------------------------------------------------------
// Deterministic fakes.
// ---------------------------------------------------------------------------

function makeFakeClock(start = 5000): RunClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

interface ExpectedEvent {
	type: RunEvent['type'];
	status?: string;
}

function assertEventSequence(events: readonly RunEvent[], expected: ExpectedEvent[]): void {
	assert.strictEqual(events.length, expected.length, `expected ${expected.length} events, got ${events.length}: ${JSON.stringify(events.map((e) => e.type))}`);
	for (let i = 0; i < expected.length; i++) {
		const exp = expected[i]!;
		const got = events[i]!;
		assert.strictEqual(got.type, exp.type, `event[${i}].type mismatch`);
		if (exp.status !== undefined) {
			assert.strictEqual((got as { status?: string }).status, exp.status, `event[${i}].status mismatch`);
		}
	}
}

// ---------------------------------------------------------------------------
// Uniform table of adopters. Each entry stands up its own run and asserts
// the shared skeleton.
// ---------------------------------------------------------------------------

interface AdopterSpec {
	name: string;
	capabilityId: string;
	runnerPath: string;
	run(workerHappy: () => Promise<unknown>, opts: { clock: RunClock; idFactory: RunIdFactory }): Promise<{ session: any; events: readonly RunEvent[]; artifact: any }>;
	runFailing(worker: () => Promise<never>, opts: { clock: RunClock; idFactory: RunIdFactory; onEvent: (e: RunEvent, s: readonly RunEvent[]) => void }): Promise<unknown>;
}

const ADOPTERS: AdopterSpec[] = [
	{
		name: 'chat.conversation.run',
		capabilityId: CHAT_CONVERSATION_CAPABILITY_ID,
		runnerPath: 'src/service/chat/ChatConversationRun.ts',
		run: (worker, { clock, idFactory }) => runChatConversation({ clock, idFactory, send: worker }),
		runFailing: (worker, { clock, idFactory, onEvent }) => runChatConversation({ clock, idFactory, send: worker, onEvent }),
	},
	{
		name: 'copilot.review.run',
		capabilityId: COPILOT_REVIEW_CAPABILITY_ID,
		runnerPath: 'src/service/copilot/CopilotReviewRun.ts',
		run: (worker, { clock, idFactory }) => runCopilotReview({ clock, idFactory, review: worker }),
		runFailing: (worker, { clock, idFactory, onEvent }) => runCopilotReview({ clock, idFactory, review: worker, onEvent }),
	},
	{
		name: 'analysis.report.run',
		capabilityId: ANALYSIS_REPORT_CAPABILITY_ID,
		runnerPath: 'src/service/agents/report/AnalysisReportRun.ts',
		run: (worker, { clock, idFactory }) => runAnalysisReport({ clock, idFactory, generate: worker }),
		runFailing: (worker, { clock, idFactory, onEvent }) => runAnalysisReport({ clock, idFactory, generate: worker, onEvent }),
	},
	{
		name: 'harness.agent.loop',
		capabilityId: HARNESS_AGENT_CAPABILITY_ID,
		runnerPath: 'src/service/agents/harness/HarnessAgentRun.ts',
		run: (worker, { clock, idFactory }) => runHarnessAgent({ clock, idFactory, execute: worker }),
		runFailing: (worker, { clock, idFactory, onEvent }) => runHarnessAgent({ clock, idFactory, execute: worker, onEvent }),
	},
];

// ---------------------------------------------------------------------------
// Test 1 — capability ids are stable strings (handbook §8).
// ---------------------------------------------------------------------------

function testCapabilityIds(): void {
	for (const a of ADOPTERS) {
		assert.strictEqual(typeof a.capabilityId, 'string', `${a.name}: capability id must be a string`);
		assert.ok(a.capabilityId.includes('.'), `${a.name}: capability id must use dotted-domain form`);
		assert.strictEqual(a.capabilityId, a.name, `${a.name}: capability constant must match declared name`);
	}
	console.log('PASS: capabilityIds');
}

// ---------------------------------------------------------------------------
// Test 2 — happy trace.
// ---------------------------------------------------------------------------

async function testHappyPathTraces(): Promise<void> {
	for (const a of ADOPTERS) {
		const result = await a.run(async () => ({ ok: true }), {
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory(a.name),
		});
		assert.strictEqual((result.session as { capabilityId: string }).capabilityId, a.capabilityId, `${a.name}: capabilityId`);
		assert.strictEqual((result.session as { status: string }).status, 'completed', `${a.name}: status`);
		assert.strictEqual((result.artifact as { kind: string }).kind, 'result', `${a.name}: artifact kind`);
		assertEventSequence(result.events, [
			{ type: 'status', status: 'queued' },
			{ type: 'status', status: 'running' },
			{ type: 'artifact' },
			{ type: 'status', status: 'completed' },
		]);
	}
	console.log('PASS: happyPathTraces');
}

// ---------------------------------------------------------------------------
// Test 3 — failure trace.
// ---------------------------------------------------------------------------

async function testFailureTraces(): Promise<void> {
	for (const a of ADOPTERS) {
		const raised = new Error(`fail:${a.name}`);
		let events: readonly RunEvent[] = [];
		let thrown: unknown = null;
		try {
			await a.runFailing(async () => { throw raised; }, {
				clock: makeFakeClock(),
				idFactory: makeFakeIdFactory(`${a.name}-fail`),
				onEvent: (_e, snapshot) => { events = snapshot; },
			});
		} catch (err) {
			thrown = err;
		}
		assert.strictEqual(thrown, raised, `${a.name}: original error must propagate`);
		assertEventSequence(events, [
			{ type: 'status', status: 'queued' },
			{ type: 'status', status: 'running' },
			{ type: 'error' },
			{ type: 'status', status: 'failed' },
		]);
	}
	console.log('PASS: failureTraces');
}

// ---------------------------------------------------------------------------
// Test 4 — source boundary: adopters must not touch app/ui/obsidian/AppContext.
// ---------------------------------------------------------------------------

function testBoundary(): void {
	const forbidden: Array<{ pattern: RegExp; reason: string }> = [
		{ pattern: /from ['"]@\/app\//, reason: 'must not import app-shell' },
		{ pattern: /from ['"]@\/ui\//, reason: 'must not import UI layer' },
		{ pattern: /from ['"]obsidian(\/|['"])/, reason: 'must not import Obsidian' },
		{ pattern: /AppContext\.getInstance/, reason: 'must not use AppContext.getInstance' },
	];
	for (const a of ADOPTERS) {
		const src = fs.readFileSync(path.resolve(process.cwd(), a.runnerPath), 'utf8');
		const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		for (const { pattern, reason } of forbidden) {
			assert.ok(!pattern.test(stripped), `${a.name}: ${reason}`);
		}
	}
	console.log('PASS: boundary');
}

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	testCapabilityIds();
	testBoundary();
	await testHappyPathTraces();
	await testFailureTraces();
	console.log('wave3-adopter-runs: all guards passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
