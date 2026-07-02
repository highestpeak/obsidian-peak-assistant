// B6 VaultArtifactStore — behaviour parity with InMemoryArtifactStore,
// plus vault-write assertions (folder scaffolding, index registry).

import assert from 'assert';
import type { ArtifactPort, ArtifactRefShape } from '@/core/ports/ArtifactPort';
import type { VaultWriterPort } from '@/core/ports/VaultWriterPort';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import type { RunClock, RunIdFactory } from '@/service/run-envelope';
import { InMemoryArtifactStore, VaultArtifactStore } from '@/service/run-envelope';

function makeFakeClock(start = 1000): RunClock {
	let t = start;
	return { now: () => t++ };
}
function makeFakeIdFactory(prefix: string): RunIdFactory {
	let seq = 0;
	return { next: () => `${prefix}-${++seq}` };
}

class FakeVaultWriter implements VaultWriterPort {
	files = new Map<string, string>();
	binaryFiles = new Map<string, ArrayBuffer>();
	folders = new Set<string>();
	createCalls = 0;
	modifyCalls = 0;
	ensureFolderCalls: string[] = [];

	async read(target: VaultFileRef | string): Promise<string> {
		const p = typeof target === 'string' ? target : target.path;
		const v = this.files.get(p);
		if (v === undefined) throw new Error(`ENOENT ${p}`);
		return v;
	}
	async cachedRead(target: VaultFileRef | string): Promise<string> {
		return this.read(target);
	}
	async readBinary(target: VaultFileRef | string): Promise<ArrayBuffer> {
		const p = typeof target === 'string' ? target : target.path;
		const v = this.binaryFiles.get(p);
		if (v === undefined) throw new Error(`ENOENT ${p}`);
		return v;
	}
	async modify(target: VaultFileRef | string, content: string): Promise<void> {
		const p = typeof target === 'string' ? target : target.path;
		if (!this.files.has(p)) throw new Error(`ENOENT ${p}`);
		this.files.set(p, content);
		this.modifyCalls++;
	}
	async create(path: string, content: string): Promise<VaultFileRef> {
		if (this.files.has(path)) throw new Error(`EEXIST ${path}`);
		this.files.set(path, content);
		this.createCalls++;
		return { path, name: path.split('/').pop() ?? path };
	}
	async createBinary(path: string, data: ArrayBuffer): Promise<VaultFileRef> {
		this.binaryFiles.set(path, data);
		return { path, name: path.split('/').pop() ?? path };
	}
	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}
	async ensureFolder(path: string): Promise<void> {
		this.folders.add(path);
		this.ensureFolderCalls.push(path);
	}
	async trash(_target: VaultFileRef | VaultFolderRef | string, _systemTrash: boolean): Promise<void> {
		/* no-op */
	}
	async rename(_target: VaultFileRef | VaultFolderRef | string, _newPath: string): Promise<void> {
		/* no-op */
	}
}

async function testRoundTripParityWithMemory(): Promise<void> {
	const vaultWriter = new FakeVaultWriter();
	const store: ArtifactPort = new VaultArtifactStore({
		vaultWriter,
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('art'),
	});
	const memory: ArtifactPort = new InMemoryArtifactStore({
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('art'),
	});

	async function putAll(target: ArtifactPort): Promise<ArtifactRefShape[]> {
		const r1 = await target.putArtifact({
			runId: 'run-A',
			kind: 'result',
			body: { hello: 'world' },
			title: 'first',
		});
		const r2 = await target.putArtifact({
			runId: 'run-A',
			kind: 'report',
			body: 'markdown body',
			contentType: 'text/markdown',
		});
		const r3 = await target.putArtifact({
			runId: 'run-B',
			kind: 'trace',
			body: { steps: 3 },
			contentType: 'application/x.peak.trace+json',
		});
		return [r1, r2, r3];
	}

	const vaultRefs = await putAll(store);
	const memoryRefs = await putAll(memory);

	// Refs match (same clock/idFactory sequence).
	assert.deepStrictEqual(vaultRefs, memoryRefs);

	// Round-trip bodies.
	assert.deepStrictEqual(
		await store.getArtifactBody<{ hello: string }>('art-1'),
		await memory.getArtifactBody('art-1'),
	);
	assert.strictEqual(
		await store.getArtifactBody<string>('art-2'),
		await memory.getArtifactBody('art-2'),
	);
	assert.deepStrictEqual(
		await store.getArtifactBody<{ steps: number }>('art-3'),
		await memory.getArtifactBody('art-3'),
	);

	// listByRun parity.
	const vaultRunA = await store.listByRun('run-A');
	const memoryRunA = await memory.listByRun('run-A');
	assert.deepStrictEqual(vaultRunA, memoryRunA);
	const vaultRunB = await store.listByRun('run-B');
	assert.strictEqual(vaultRunB.length, 1);
	assert.strictEqual((await store.listByRun('run-nope')).length, 0);

	// Vault side-effects: index + per-run folder scaffolding.
	assert.ok(vaultWriter.folders.has('.peak/artifacts'), 'root folder ensured');
	assert.ok(vaultWriter.folders.has('.peak/artifacts/run-A'), 'run-A folder ensured');
	assert.ok(vaultWriter.folders.has('.peak/artifacts/run-B'), 'run-B folder ensured');
	assert.ok(vaultWriter.files.has('.peak/artifacts/artifact-index.json'), 'index file written');
	assert.ok(vaultWriter.files.has('.peak/artifacts/run-A/art-1.json'), 'result body written');
	assert.ok(vaultWriter.files.has('.peak/artifacts/run-A/art-2.md'), 'markdown body written');
	assert.ok(vaultWriter.files.has('.peak/artifacts/run-B/art-3.trace.json'), 'trace body written');

	// Index shape holds inverse lookup.
	const indexRaw = vaultWriter.files.get('.peak/artifacts/artifact-index.json')!;
	const index = JSON.parse(indexRaw) as {
		artifacts: Record<string, { runId: string; filename: string }>;
		byRun: Record<string, string[]>;
	};
	assert.deepStrictEqual(index.byRun['run-A'], ['art-1', 'art-2']);
	assert.deepStrictEqual(index.byRun['run-B'], ['art-3']);
	assert.strictEqual(index.artifacts['art-2']!.filename, 'art-2.md');
	console.log('PASS: roundTripParityWithMemory');
}

async function testColdReadFromExistingVault(): Promise<void> {
	// Simulate a second plugin session: the vault already has an index +
	// bodies from a previous run. A fresh VaultArtifactStore should be
	// able to read them without any prior put.
	const vaultWriter = new FakeVaultWriter();
	vaultWriter.folders.add('.peak/artifacts');
	vaultWriter.folders.add('.peak/artifacts/run-Z');
	vaultWriter.files.set('.peak/artifacts/run-Z/art-1.md', '# hello');
	vaultWriter.files.set(
		'.peak/artifacts/artifact-index.json',
		JSON.stringify({
			artifacts: {
				'art-1': {
					runId: 'run-Z',
					kind: 'report',
					filename: 'art-1.md',
					createdAt: 42,
					contentType: 'text/markdown',
				},
			},
			byRun: { 'run-Z': ['art-1'] },
		}),
	);

	const store = new VaultArtifactStore({ vaultWriter });
	const body = await store.getArtifactBody<string>('art-1');
	assert.strictEqual(body, '# hello');
	const refs = await store.listByRun('run-Z');
	assert.strictEqual(refs.length, 1);
	assert.strictEqual(refs[0]!.kind, 'report');
	assert.strictEqual(refs[0]!.contentType, 'text/markdown');
	console.log('PASS: coldReadFromExistingVault');
}

async function testConcurrentPutsPreserveIndex(): Promise<void> {
	// Verify the internal write queue serializes concurrent puts so the
	// index doesn't lose entries. Real vault IO is async — a naive
	// implementation would race.
	const vaultWriter = new FakeVaultWriter();
	const store = new VaultArtifactStore({
		vaultWriter,
		clock: makeFakeClock(),
		idFactory: makeFakeIdFactory('c'),
	});

	await Promise.all([
		store.putArtifact({ runId: 'run-P', kind: 'result', body: 'a' }),
		store.putArtifact({ runId: 'run-P', kind: 'result', body: 'b' }),
		store.putArtifact({ runId: 'run-P', kind: 'result', body: 'c' }),
	]);

	const refs = await store.listByRun('run-P');
	assert.strictEqual(refs.length, 3, 'all three concurrent puts landed');
	console.log('PASS: concurrentPutsPreserveIndex');
}

async function run(): Promise<void> {
	await testRoundTripParityWithMemory();
	await testColdReadFromExistingVault();
	await testConcurrentPutsPreserveIndex();
	console.log('vault-artifact-store: all guards passed');
}

run().catch((err) => { console.error(err); process.exit(1); });
