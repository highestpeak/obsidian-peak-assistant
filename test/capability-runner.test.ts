// T4/T9 pilot — CapabilityRunner end-to-end guard.
//
// Uses the T1 doc.review.current fixture as the manifest, a hand-rolled
// CompiledSkill, and a canned `execute` function to drive one run of
// the runner. Locks:
//   - RunEvent sequence: status(queued) → status(running) → artifact → status(completed)
//   - artifact title falls back to `${manifest.title} run` when execute
//     doesn't override it
//   - skillRef / compiledSkill.skillId mismatch throws fail-loud
//   - failure path propagates the original error and finishes 'failed'
//   - CapabilityManifestRegistry stores manifests by id

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { runCapability } from '@/service/capabilities/CapabilityRunner';
import { CapabilityManifestRegistry as ImportedRegistry } from '@/service/capabilities/CapabilityManifestRegistry';
import type { CapabilityManifest } from '@/core/types/capability';
import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { RunClock, RunIdFactory, RunEvent } from '@/service/run-envelope';
import { DOC_REVIEW_CURRENT_FIXTURE } from './fixtures/capabilities/doc-review-current.fixture';

function makeFakeClock(start = 7000): RunClock {
	let t = start;
	return { now: () => t++ };
}

function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

function makeCompiledSkill(skillId: string, allowedTools: string[]): CompiledSkill {
	return {
		skillId,
		allowedTools: Object.freeze([...allowedTools]),
		systemPrompt: 'Perform the review.',
		quarantine: allowedTools.length > 0 ? 'strict' : 'permissive',
	};
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

// ---------------------------------------------------------------------------
// Test 1 — happy path with default artifact title.
// ---------------------------------------------------------------------------

async function testHappyPathWithFixture(): Promise<void> {
	const manifest = DOC_REVIEW_CURRENT_FIXTURE;
	const compiled = makeCompiledSkill(manifest.skillRef, ['read-file', 'search-vault']);
	const result = await runCapability({
		manifest,
		compiledSkill: compiled,
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('cap-test'),
		input: { activeFilePath: '/x/y.md' },
		trigger: 'manual',
		execute: async (input, ctx) => {
			assert.strictEqual(ctx.manifest.id, manifest.id);
			assert.strictEqual(ctx.compiledSkill.skillId, manifest.skillRef);
			assert.strictEqual(input.activeFilePath, '/x/y.md');
			return {
				result: { artifactId: 'a-1', summary: 'reviewed', findingCount: 0 },
			};
		},
	});
	assert.strictEqual(result.session.capabilityId, manifest.id);
	assert.strictEqual(result.session.status, 'completed');
	assert.strictEqual(result.artifact.title, `${manifest.title} run`);
	assertEventSequence(result.events, [
		{ type: 'status', status: 'queued' },
		{ type: 'status', status: 'running' },
		{ type: 'artifact' },
		{ type: 'status', status: 'completed' },
	]);
	console.log('PASS: happyPathWithFixture');
}

// ---------------------------------------------------------------------------
// Test 2 — execute may override artifact title / uri.
// ---------------------------------------------------------------------------

async function testArtifactOverride(): Promise<void> {
	const result = await runCapability({
		manifest: DOC_REVIEW_CURRENT_FIXTURE,
		compiledSkill: makeCompiledSkill(DOC_REVIEW_CURRENT_FIXTURE.skillRef, []),
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('cap-override'),
		input: null,
		execute: async () => ({
			result: 42,
			artifactTitle: 'custom title',
			artifactUri: 'peak://doc/x',
			artifactContentType: 'application/vnd.custom',
		}),
	});
	assert.strictEqual(result.artifact.title, 'custom title');
	assert.strictEqual(result.artifact.uri, 'peak://doc/x');
	assert.strictEqual(result.artifact.contentType, 'application/vnd.custom');
	console.log('PASS: artifactOverride');
}

// ---------------------------------------------------------------------------
// Test 3 — mismatched skillRef fails fast.
// ---------------------------------------------------------------------------

async function testSkillMismatchFailsFast(): Promise<void> {
	const manifest: CapabilityManifest = {
		...DOC_REVIEW_CURRENT_FIXTURE,
		skillRef: 'doc-review.v1',
	};
	const wrongSkill = makeCompiledSkill('other-skill', []);
	let thrown: unknown = null;
	try {
		await runCapability({
			manifest,
			compiledSkill: wrongSkill,
			input: null,
			execute: async () => ({ result: null }),
		});
	} catch (err) { thrown = err; }
	assert.ok(thrown instanceof Error);
	assert.match((thrown as Error).message, /manifest 'doc.review.current' references skill 'doc-review.v1' but received compiled skill 'other-skill'/);
	console.log('PASS: skillMismatchFailsFast');
}

// ---------------------------------------------------------------------------
// Test 4 — failure path propagates + finishes 'failed'.
// ---------------------------------------------------------------------------

async function testFailurePath(): Promise<void> {
	const raised = new Error('provider timeout');
	let events: readonly RunEvent[] = [];
	let thrown: unknown = null;
	try {
		await runCapability({
			manifest: DOC_REVIEW_CURRENT_FIXTURE,
			compiledSkill: makeCompiledSkill(DOC_REVIEW_CURRENT_FIXTURE.skillRef, []),
			input: null,
			clock: makeFakeClock(),
			idFactory: makeFakeIdFactory('cap-fail'),
			execute: async () => { throw raised; },
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

// ---------------------------------------------------------------------------
// Test 5 — CapabilityManifestRegistry basic ops.
// ---------------------------------------------------------------------------

function testRegistryBasics(): void {
	const registry = new ImportedRegistry();
	assert.strictEqual(registry.size(), 0);
	registry.register(DOC_REVIEW_CURRENT_FIXTURE);
	assert.strictEqual(registry.size(), 1);
	assert.strictEqual(registry.getById(DOC_REVIEW_CURRENT_FIXTURE.id)?.id, DOC_REVIEW_CURRENT_FIXTURE.id);
	assert.strictEqual(registry.getById('missing'), null);
	assert.strictEqual(registry.getAll().length, 1);
	// Re-register replaces.
	registry.register({ ...DOC_REVIEW_CURRENT_FIXTURE, title: 'New Title' });
	assert.strictEqual(registry.size(), 1);
	assert.strictEqual(registry.getById(DOC_REVIEW_CURRENT_FIXTURE.id)?.title, 'New Title');
	console.log('PASS: registryBasics');
}

// ---------------------------------------------------------------------------
// Test 6 — runner boundary source scan.
// ---------------------------------------------------------------------------

const RUNNER_PATH = path.resolve(process.cwd(), 'src/service/capabilities/CapabilityRunner.ts');
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

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
	testRunnerBoundary();
	testRegistryBasics();
	await testHappyPathWithFixture();
	await testArtifactOverride();
	await testSkillMismatchFailsFast();
	await testFailurePath();
	console.log('capability-runner: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
