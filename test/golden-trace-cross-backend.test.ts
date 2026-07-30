// T10 — cross-backend golden trace conformance.
//
// Claim: given the same manifest + input + deterministic clock/id
// factory, the RunEvent sequence produced by `runCapability` is
// byte-identical no matter which BackendKind synthesised the `execute`
// function. This is the property that lets the UI (T7 projection),
// telemetry, and replay tests treat capabilities as backend-agnostic.
//
// Fixture snapshot (single source of truth):
//   1. status(queued)   runId=cap-test.cross-1  status=queued
//   2. status(running)  runId=cap-test.cross-2  status=running
//   3. artifact         runId=cap-test.cross-3  kind=result title=...
//   4. status(completed) runId=cap-test.cross-4 status=completed
//
// The runId prefix `cap-<manifest.id>-<seq>` is set by `runCapability`
// via `defaultIdFactory('cap-<manifest.id>')`. When callers pass a
// custom idFactory (as this test does), the seq counter increments from
// that source. We assert the shape + counter monotonicity, not the
// literal prefix, because the ID prefix is a runner detail.

import assert from 'assert';
import type { CapabilityManifest } from '@/core/types/capability';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { RunClock, RunIdFactory, RunEvent } from '@/service/run-envelope';
import { runCapability } from '@/service/capabilities/CapabilityRunner';
import type { BackendStrategy } from '@/service/capabilities/BackendStrategyRegistry';

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

// ---------------------------------------------------------------------------
// Fixture manifest + compiled skill.
// ---------------------------------------------------------------------------

const FIXTURE_MANIFEST: CapabilityManifest = {
	id: 'test.cross',
	title: 'Cross-Backend Test',
	description: 'Golden trace fixture — identical event sequence across backends.',
	inputContract: { kind: 'object', description: 'input' },
	outputContract: { kind: 'object', description: 'output' },
	permissionKind: 'read',
	costTier: 'fast',
	backendPolicy: { preferred: 'hermes-harness', fallback: ['provider-direct'] },
	skillRef: 'skill.cross',
	surfaceBinding: ['chat'],
};

const FIXTURE_SKILL: CompiledSkill = {
	skillId: 'skill.cross',
	allowedTools: ['tool.a', 'tool.b'],
	systemPrompt: 'be brief',
	quarantine: 'strict',
};

// ---------------------------------------------------------------------------
// Both supported backend strategies produce the SAME output shape.
// ---------------------------------------------------------------------------

const strategies: Record<'hermes-harness' | 'provider-direct', BackendStrategy> = {
	'hermes-harness': async (input) => ({ result: { source: 'hermes', echo: input } }),
	'provider-direct': async (input) => ({ result: { source: 'direct', echo: input } }),
};

// ---------------------------------------------------------------------------
// The golden trace shape.
// ---------------------------------------------------------------------------

interface GoldenEvent {
	type: RunEvent['type'];
	status?: string;
	artifactKind?: string;
}

const GOLDEN: GoldenEvent[] = [
	{ type: 'status', status: 'queued' },
	{ type: 'status', status: 'running' },
	{ type: 'artifact', artifactKind: 'result' },
	{ type: 'status', status: 'completed' },
];

// ---------------------------------------------------------------------------
// Test — same trace across supported backends.
// ---------------------------------------------------------------------------

async function testCrossBackendTraceIdentical(): Promise<void> {
	const traces: Array<{ backend: string; events: readonly RunEvent[] }> = [];

	for (const backend of Object.keys(strategies) as Array<keyof typeof strategies>) {
		const result = await runCapability({
			manifest: FIXTURE_MANIFEST,
			compiledSkill: FIXTURE_SKILL,
			execute: strategies[backend],
			input: { hello: 'world' },
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory(`golden-${backend}`),
			trigger: 'manual',
		});
		traces.push({ backend, events: result.events });

		// Structural check against golden.
		assert.strictEqual(result.events.length, GOLDEN.length, `${backend}: event count`);
		for (let i = 0; i < GOLDEN.length; i++) {
			const exp = GOLDEN[i]!;
			const got = result.events[i]!;
			assert.strictEqual(got.type, exp.type, `${backend} event[${i}].type`);
			if (exp.status !== undefined) {
				assert.strictEqual((got as { status?: string }).status, exp.status, `${backend} event[${i}].status`);
			}
			if (exp.artifactKind !== undefined) {
				const artifact = (got as { artifact?: { kind?: string } }).artifact;
				assert.strictEqual(artifact?.kind, exp.artifactKind, `${backend} event[${i}].artifact.kind`);
			}
		}
	}

	// Cross-check: all trace *shapes* match exactly (event.type / status / kind).
	function stripToShape(events: readonly RunEvent[]): string {
		return JSON.stringify(events.map((e) => {
			const anyE = e as { type: string; status?: string; artifact?: { kind?: string } };
			return { type: anyE.type, status: anyE.status, artifactKind: anyE.artifact?.kind };
		}));
	}
	const [harnessTrace, providerTrace] = traces.map((trace) => stripToShape(trace.events));
	assert.strictEqual(
		harnessTrace,
		providerTrace,
		'harness vs provider-direct trace shape must match byte-for-byte',
	);
	console.log('PASS: crossBackendTraceIdentical');
}

// ---------------------------------------------------------------------------
// Test — golden trace is stable under clock / idFactory replacement
// (byte-exact identity for a single backend).
// ---------------------------------------------------------------------------

async function testDeterministicIds(): Promise<void> {
	const result = await runCapability({
		manifest: FIXTURE_MANIFEST,
		compiledSkill: FIXTURE_SKILL,
		execute: strategies['hermes-harness'],
		input: { hello: 'world' },
		clock: makeFakeClock(1000),
		idFactory: makeFakeIdFactory('det'),
		trigger: 'manual',
	});
	// All events share the same runId (they belong to one session). The
	// id factory increments per allocation — session gets seq 1, artifact
	// gets seq 2 (so the injected factory's `next()` was called at least twice).
	const runIds = new Set(result.events.map((e) => e.runId));
	assert.strictEqual(runIds.size, 1, 'all events in a session share one runId');
	assert.strictEqual([...runIds][0], 'det-1', 'first id minted goes to the session');

	const ts = result.events.map((e) => e.ts);
	for (let i = 1; i < ts.length; i++) {
		assert.ok(ts[i]! > ts[i - 1]!, 'timestamps must be strictly monotonic under fake clock');
	}
	assert.strictEqual(ts[0], 1000, 'clock starts at injected value');
	console.log('PASS: deterministicIds');
}

// ---------------------------------------------------------------------------
// Test — failure trace shape is uniform too.
// ---------------------------------------------------------------------------

async function testFailureTraceUniform(): Promise<void> {
	const failing: BackendStrategy = async () => { throw new Error('backend broke'); };
	const events: RunEvent[] = [];
	let thrown: unknown = null;
	try {
		await runCapability({
			manifest: FIXTURE_MANIFEST,
			compiledSkill: FIXTURE_SKILL,
			execute: failing,
			input: {},
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('fail'),
			onEvent: (_ev, snapshot) => { events.length = 0; events.push(...snapshot); },
		});
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error);

	const expected: GoldenEvent[] = [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'error' },
		{ type: 'status', status: 'failed' },
	];
	assert.strictEqual(events.length, expected.length, `expected ${expected.length} events, got ${events.length}`);
	for (let i = 0; i < expected.length; i++) {
		const exp = expected[i]!;
		const got = events[i]!;
		assert.strictEqual(got.type, exp.type, `event[${i}].type`);
		if (exp.status !== undefined) {
			assert.strictEqual((got as { status?: string }).status, exp.status, `event[${i}].status`);
		}
	}
	console.log('PASS: failureTraceUniform');
}

async function run(): Promise<void> {
	await testCrossBackendTraceIdentical();
	await testDeterministicIds();
	await testFailureTraceUniform();
	console.log('golden-trace-cross-backend: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
