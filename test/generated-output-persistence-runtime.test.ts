import assert from 'node:assert/strict';
import {
	AtomicJsonSnapshotStore,
	GeneratedArtifactBodyStore,
	GeneratedOutputMigrationJournal,
	PartitionedJsonlStore,
	ProjectionRebuildRegistry,
	buildGeneratedOutputSyncManifest,
	createDefaultGeneratedOutputRegistry,
	type GeneratedOutputDataAdapter,
	sha256Bytes,
} from '@/core/storage/generated-output';

class MemoryGeneratedOutputAdapter implements GeneratedOutputDataAdapter {
	readonly files = new Map<string, Uint8Array>();
	readonly directories = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.directories.has(path);
	}

	async readText(path: string): Promise<string> {
		return new TextDecoder().decode(this.requireFile(path));
	}

	async writeText(path: string, content: string): Promise<void> {
		this.files.set(path, new TextEncoder().encode(content));
	}

	async appendText(path: string, content: string): Promise<void> {
		const before = this.files.get(path) ?? new Uint8Array();
		const addition = new TextEncoder().encode(content);
		const merged = new Uint8Array(before.byteLength + addition.byteLength);
		merged.set(before);
		merged.set(addition, before.byteLength);
		this.files.set(path, merged);
	}

	async readBinary(path: string): Promise<Uint8Array> {
		return new Uint8Array(this.requireFile(path));
	}

	async writeBinary(path: string, content: Uint8Array): Promise<void> {
		this.files.set(path, new Uint8Array(content));
	}

	async rename(fromPath: string, toPath: string): Promise<void> {
		const value = this.requireFile(fromPath);
		if (this.files.has(toPath)) throw new Error(`target exists: ${toPath}`);
		this.files.set(toPath, value);
		this.files.delete(fromPath);
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}

	async ensureDirectory(path: string): Promise<void> {
		this.directories.add(path);
	}

	private requireFile(path: string): Uint8Array {
		const value = this.files.get(path);
		if (!value) throw new Error(`missing file: ${path}`);
		return value;
	}
}

const ROOTS = {
	aiRoot: 'ChatFolder',
	dataStore: 'ChatFolder/DataStore',
	pluginData: '.obsidian/plugins/obsidian-peak-assistant',
} as const;

async function testAtomicSnapshotAndCorruptionRecovery(): Promise<void> {
	const adapter = new MemoryGeneratedOutputAdapter();
	const registry = createDefaultGeneratedOutputRegistry();
	let tick = 0;
	const store = new AtomicJsonSnapshotStore(adapter, registry, ROOTS, () => `2026-08-02T00:00:0${tick++}.000Z`);
	const input = {
		outputId: 'chat.project-state',
		recordKey: 'project-1',
		pathVariables: { projectId: 'project-1' },
	};
	await store.writeSnapshot({ ...input, payload: { title: 'first', nested: { b: 2, a: 1 } } });
	await store.writeSnapshot({ ...input, payload: { title: 'second' } });

	const path = 'ChatFolder/DataStore/records/chat/projects/project-1/state.json';
	assert.ok(adapter.files.has(`${path}.backup`), 'atomic updates retain the previous verified snapshot');
	await adapter.writeText(path, '{"tampered":true}\n');
	const recovered = await store.readSnapshot<{ title: string }>(input);
	assert.equal(recovered?.envelope.payload.title, 'first');
	assert.equal(recovered?.recoveredFromBackup, true);
	assert.ok(recovered?.quarantinedPath?.includes('.corrupt-'));
	assert.ok(adapter.files.has(recovered!.quarantinedPath!));
	console.log('PASS: atomic JSON snapshots verify, backup, quarantine, and recover');
}

async function testJsonlIdempotenceAndExplicitQuarantine(): Promise<void> {
	const adapter = new MemoryGeneratedOutputAdapter();
	const registry = createDefaultGeneratedOutputRegistry();
	const events = new PartitionedJsonlStore(adapter, registry, ROOTS, () => '2026-08-02T01:00:00.000Z');
	const stream = {
		outputId: 'chat.conversation-events',
		streamKey: 'conversation-1',
		pathVariables: { conversationId: 'conversation-1' },
	};
	assert.equal(await events.appendEvent({ ...stream, eventId: 'message-1', payload: { text: 'hello' } }), true);
	assert.equal(await events.appendEvent({ ...stream, eventId: 'message-1', payload: { text: 'hello' } }), false);
	assert.equal(await events.appendEvent({ ...stream, eventId: 'message-2', payload: { text: 'world' } }), true);
	const path = 'ChatFolder/DataStore/records/chat/conversations/conversation-1.jsonl';
	await adapter.appendText(path, '{broken-tail');
	const corrupt = await events.readEvents(stream);
	assert.equal(corrupt.events.length, 2);
	assert.equal(corrupt.corruption?.lineNumber, 3);
	await assert.rejects(
		() => events.appendEvent({ ...stream, eventId: 'message-3', payload: { text: 'blocked' } }),
		/quarantine it before appending/,
	);
	const repaired = await events.quarantineCorruptTail(stream);
	assert.equal(repaired.events.length, 2);
	assert.ok(repaired.quarantinedPath && adapter.files.has(repaired.quarantinedPath));
	assert.equal((await events.readEvents(stream)).corruption, undefined);
	console.log('PASS: partitioned JSONL is idempotent and quarantines corrupt tails explicitly');
}

async function testImmutableArtifactBodies(): Promise<void> {
	const adapter = new MemoryGeneratedOutputAdapter();
	const bodies = new GeneratedArtifactBodyStore(
		adapter,
		createDefaultGeneratedOutputRegistry(),
		ROOTS,
		() => '2026-08-02T02:00:00.000Z',
	);
	const input = {
		outputId: 'run.artifact-body',
		filename: 'answer.md',
		pathVariables: { runId: 'run-1' },
		contentType: 'text/markdown',
		body: '# Answer',
	};
	const first = await bodies.putTextBody(input);
	const again = await bodies.putTextBody(input);
	assert.deepEqual(again, first, 'same immutable body is an idempotent write');
	assert.equal(first.checksum, sha256Bytes(new TextEncoder().encode('# Answer')));
	await assert.rejects(
		() => bodies.putTextBody({ ...input, body: '# Different' }),
		/immutable body already exists with different bytes/,
	);
	assert.equal(new TextDecoder().decode(await bodies.getBody(first)), '# Answer');
	console.log('PASS: artifact bodies are immutable, checksummed, and content-addressable by receipt');
}

async function testMigrationJournalSyncManifestAndProjectionRegistry(): Promise<void> {
	const adapter = new MemoryGeneratedOutputAdapter();
	const outputs = createDefaultGeneratedOutputRegistry();
	const jsonl = new PartitionedJsonlStore(adapter, outputs, ROOTS, () => '2026-08-02T03:00:00.000Z');
	const journal = new GeneratedOutputMigrationJournal(jsonl);
	const migration = {
		migrationId: 'resource-summary-v1',
		sourceOutputId: 'legacy.resource-summary-markdown',
		targetOutputId: 'resource.summary-snapshot',
		sourcePath: 'ChatFolder/resources-summary-cache/Resource-1.md',
		targetPath: 'ChatFolder/DataStore/records/resources/1.json',
		status: 'validated' as const,
	};
	assert.equal(await journal.append(migration), true);
	assert.equal(await journal.append(migration), false);
	assert.equal((await journal.list()).length, 1);

	const manifest = buildGeneratedOutputSyncManifest(outputs);
	assert.equal(manifest.entries.length, outputs.list().length);
	assert.ok(manifest.include.some((entry) => entry.outputId === 'migration.journal'));
	assert.ok(manifest.exclude.some((entry) => entry.outputId === 'projection.chat'));
	assert.ok(manifest.preserveLegacy.some((entry) => entry.outputId === 'legacy.chat-markdown'));
	assert.equal(new Set(manifest.entries.map((entry) => entry.outputId)).size, manifest.entries.length);

	const projections = new ProjectionRebuildRegistry(outputs);
	projections.register({
		projectionId: 'projection.chat',
		sourceOutputIds: ['chat.conversation-events', 'chat.project-state'],
		rebuild: async () => ({
			projectionId: 'projection.chat',
			sourceOutputIds: ['chat.conversation-events', 'chat.project-state'],
			recordsRead: 3,
			recordsWritten: 3,
			startedAt: '2026-08-02T03:00:00.000Z',
			completedAt: '2026-08-02T03:00:01.000Z',
			warnings: [],
		}),
	});
	const report = await projections.rebuild({ projectionId: 'projection.chat', reason: 'test' });
	assert.equal(report.recordsWritten, 3);
	assert.throws(
		() => projections.register({ projectionId: 'chat.project-state', sourceOutputIds: [], rebuild: async () => report }),
		/not a projection output/,
	);
	console.log('PASS: migration journal, sync manifest, and projection rebuild contracts are complete');
}

async function main(): Promise<void> {
	await testAtomicSnapshotAndCorruptionRecovery();
	await testJsonlIdempotenceAndExplicitQuarantine();
	await testImmutableArtifactBodies();
	await testMigrationJournalSyncManifestAndProjectionRegistry();
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
