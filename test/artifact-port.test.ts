// T2 ArtifactPort — shape guard + in-memory impl round-trip.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import type { ArtifactPort, ArtifactRefShape } from '@/core/ports/ArtifactPort';
import type { ArtifactRef, RunClock, RunIdFactory } from '@/service/run-envelope';
import { InMemoryArtifactStore } from '@/service/run-envelope';

const PORT_PATH = path.resolve(process.cwd(), 'src/core/ports/ArtifactPort.ts');
const portSource = fs.readFileSync(PORT_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Rule 1 — port declares the three methods and no writer surface leakage.
// ---------------------------------------------------------------------------

function testPortShape(): void {
	for (const m of ['putArtifact(', 'getArtifactBody(', 'listByRun(']) {
		assert.ok(portSource.includes(m), `ArtifactPort missing '${m}'`);
	}
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	for (const forbidden of ['deleteArtifact(', 'clearAll(', 'compact(']) {
		assert.ok(!stripped.includes(forbidden), `ArtifactPort must not include '${forbidden}'`);
	}
	console.log('PASS: portShape');
}

// ---------------------------------------------------------------------------
// Rule 2 — boundary.
// ---------------------------------------------------------------------------

function testBoundary(): void {
	const stripped = portSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
	assert.ok(!/from ['"]@\/service\//.test(stripped), 'port must not import service');
	assert.ok(!/from ['"]@\/app\//.test(stripped), 'port must not import app');
	assert.ok(!/from ['"]@\/ui\//.test(stripped), 'port must not import ui');
	assert.ok(!/from ['"]obsidian(\/|['"])/.test(stripped), 'port must not import obsidian');
	console.log('PASS: boundary');
}

// ---------------------------------------------------------------------------
// Rule 3 — `ArtifactRefShape` matches the run-envelope's `ArtifactRef`
// keys. If run-envelope grows a field, this test surfaces the drift.
// ---------------------------------------------------------------------------

function testArtifactRefShapeMatchesEnvelope(): void {
	const sample: ArtifactRef = {
		artifactId: 'a-1',
		runId: 'r-1',
		kind: 'result',
		title: 't',
		uri: 'peak://a-1',
		contentType: 'text/plain',
		createdAt: 1,
	};
	const guarded: ArtifactRefShape = sample; // must type-check.
	assert.strictEqual(guarded.kind, 'result');
	console.log('PASS: artifactRefShapeMatchesEnvelope');
}

// ---------------------------------------------------------------------------
// Rule 4 — InMemoryArtifactStore round-trip.
// ---------------------------------------------------------------------------

function makeFakeClock(start = 1000): RunClock {
	let t = start;
	return { now: () => t++ };
}
function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

async function testInMemoryRoundTrip(): Promise<void> {
	const store: ArtifactPort = new InMemoryArtifactStore({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('art'),
	});

	const ref1 = await store.putArtifact({
		runId: 'run-A',
		kind: 'result',
		body: { hello: 'world' },
		title: 'first',
	});
	assert.strictEqual(ref1.artifactId, 'art-1');
	assert.strictEqual(ref1.createdAt, 1000);

	const ref2 = await store.putArtifact({
		runId: 'run-A',
		kind: 'report',
		body: 'markdown body',
		contentType: 'text/markdown',
	});
	assert.strictEqual(ref2.artifactId, 'art-2');

	const body1 = await store.getArtifactBody<{ hello: string }>('art-1');
	assert.deepStrictEqual(body1, { hello: 'world' });

	const body2 = await store.getArtifactBody<string>('art-2');
	assert.strictEqual(body2, 'markdown body');

	const missing = await store.getArtifactBody('art-nope');
	assert.strictEqual(missing, undefined);

	const refs = await store.listByRun('run-A');
	assert.strictEqual(refs.length, 2);
	assert.deepStrictEqual(refs.map((r) => r.artifactId).sort(), ['art-1', 'art-2']);

	const empty = await store.listByRun('run-nope');
	assert.deepStrictEqual(empty, []);
	console.log('PASS: inMemoryRoundTrip');
}

// ---------------------------------------------------------------------------
// Rule 5 — optional fields (title/uri/contentType) are only present when
// supplied. This mirrors the recorder's `exactOptionalPropertyTypes` habit.
// ---------------------------------------------------------------------------

async function testOptionalFieldsOmittedWhenAbsent(): Promise<void> {
	const store = new InMemoryArtifactStore({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('opt'),
	});
	const ref = await store.putArtifact({
		runId: 'run-B',
		kind: 'trace',
		body: null,
	});
	assert.strictEqual(ref.title, undefined);
	assert.strictEqual(ref.uri, undefined);
	assert.strictEqual(ref.contentType, undefined);
	console.log('PASS: optionalFieldsOmittedWhenAbsent');
}

async function run(): Promise<void> {
	testPortShape();
	testBoundary();
	testArtifactRefShapeMatchesEnvelope();
	await testInMemoryRoundTrip();
	await testOptionalFieldsOmittedWhenAbsent();
	console.log('artifact-port: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
