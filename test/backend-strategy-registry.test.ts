// T4 / T9 — BackendStrategyRegistry dispatch semantics.

import assert from 'assert';
import type { BackendKind, CapabilityManifest } from '@/core/types/capability';
import {
	resolveBackendStrategy,
	composeExecuteFromPolicy,
	makeEchoStrategy,
	makeUnavailableStrategy,
	type BackendStrategy,
	type BackendStrategyRegistry,
} from '@/service/capabilities/BackendStrategyRegistry';
import { runCapability } from '@/service/capabilities/CapabilityRunner';

function makeManifest(preferred: BackendKind, fallback: BackendKind[]): CapabilityManifest {
	return {
		id: 'test.strategy',
		title: 'Strategy Test',
		description: 'unit',
		inputContract: { kind: 'object', description: 'input' },
		outputContract: { kind: 'object', description: 'output' },
		permissionKind: 'read',
		costTier: 'fast',
		backendPolicy: { preferred, fallback },
		skillRef: 'test.skill',
		surfaceBinding: ['chat'],
	};
}

// ---------------------------------------------------------------------------
// Test 1 — preferred wins when registered.
// ---------------------------------------------------------------------------

function testPreferredWins(): void {
	const registry: BackendStrategyRegistry = {
		'hermes-harness': makeEchoStrategy(),
		'provider-direct': makeUnavailableStrategy('should not be called'),
	};
	const { backend } = resolveBackendStrategy(
		{ preferred: 'hermes-harness', fallback: ['provider-direct'] },
		registry,
	);
	assert.strictEqual(backend, 'hermes-harness');
	console.log('PASS: preferredWins');
}

// ---------------------------------------------------------------------------
// Test 2 — configured fallback is metadata only; runtime refuses to downgrade.
// ---------------------------------------------------------------------------

function testFallbackRejected(): void {
	const registry: BackendStrategyRegistry = {
		'provider-direct': makeEchoStrategy(),
	};
	assert.throws(
		() => resolveBackendStrategy(
			{ preferred: 'hermes-harness', fallback: ['provider-direct'] },
			registry,
		),
		/Runtime fallback is disabled/,
	);
	console.log('PASS: fallbackRejected');
}

// ---------------------------------------------------------------------------
// Test 3 — fail-loud when nothing registered.
// ---------------------------------------------------------------------------

function testFailLoud(): void {
	let thrown: unknown = null;
	try {
		resolveBackendStrategy(
			{ preferred: 'hermes-harness', fallback: ['provider-direct'] },
			{},
		);
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error, 'must throw');
	assert.match((thrown as Error).message, /Runtime fallback is disabled/);
	console.log('PASS: failLoud');
}

// ---------------------------------------------------------------------------
// Test 4 — composeExecuteFromPolicy returns a callable dispatched to
// the resolved strategy.
// ---------------------------------------------------------------------------

async function testComposeExecute(): Promise<void> {
	let called = 0;
	const captured: BackendStrategy = async (input, ctx) => {
		called += 1;
		return { result: { echoed: input, cap: ctx.manifest.id } };
	};
	const registry: BackendStrategyRegistry = { 'hermes-harness': captured };
	const manifest = makeManifest('hermes-harness', []);
	const execute = composeExecuteFromPolicy(manifest, registry);

	const result = await runCapability({
		manifest,
		compiledSkill: {
			skillId: 'test.skill',
			allowedTools: ['tool.a'],
			systemPrompt: 'hi',
			quarantine: 'strict',
		},
		execute,
		input: { hello: 'world' },
	});

	assert.strictEqual(called, 1);
	assert.deepStrictEqual((result.result as any).echoed, { hello: 'world' });
	assert.strictEqual((result.result as any).cap, 'test.strategy');
	console.log('PASS: composeExecute');
}

// ---------------------------------------------------------------------------
// Test 5 — stub echo strategy.
// ---------------------------------------------------------------------------

async function testEchoStrategy(): Promise<void> {
	const echo = makeEchoStrategy<{ n: number }>();
	const out = await echo({ n: 7 }, {
		runId: 'r-1',
		manifest: makeManifest('hermes-harness', []),
		compiledSkill: { skillId: 'test.skill', allowedTools: [], systemPrompt: '', quarantine: 'strict' },
		recorder: undefined as any,
	});
	assert.deepStrictEqual(out.result, { n: 7 });
	console.log('PASS: echoStrategy');
}

async function run(): Promise<void> {
	testPreferredWins();
	testFallbackRejected();
	testFailLoud();
	await testComposeExecute();
	await testEchoStrategy();
	console.log('backend-strategy-registry: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
