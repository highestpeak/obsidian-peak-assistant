import assert from 'node:assert/strict';

import {
	AtomicJsonSnapshotStore, GeneratedArtifactBodyStore, GeneratedOutputMigrationJournal,
	PartitionedJsonlStore, ProjectionRebuildRegistry, buildGeneratedOutputSyncManifest,
	createDefaultGeneratedOutputRegistry,
	type GeneratedOutputDataAdapter, type GeneratedOutputPersistenceRuntime,
} from '@/core/storage/generated-output';
import { applyPeakSheetPatch } from '@/core/sheet';
import type { PeakSheetCommitEvent, PeakSheetDatasetPatch, PeakSheetDatasetSnapshot } from '@/core/sheet';
import { AppPeakSheetRepository } from '@/app/sheet/AppPeakSheetRepository';

class MemoryAdapter implements GeneratedOutputDataAdapter {
	readonly files = new Map<string, Uint8Array>();
	readonly directories = new Set<string>();
	failSnapshotWrites = false;
	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.directories.has(path); }
	async readText(path: string): Promise<string> { return new TextDecoder().decode(this.require(path)); }
	async writeText(path: string, content: string): Promise<void> {
		if (this.failSnapshotWrites && path.includes('/artifacts/peak-sheets/') && path.endsWith('.tmp')) throw new Error('simulated snapshot interruption');
		this.files.set(path, new TextEncoder().encode(content));
	}
	async appendText(path: string, content: string): Promise<void> {
		const before = this.files.get(path) ?? new Uint8Array();
		const after = new Uint8Array(before.length + new TextEncoder().encode(content).length);
		after.set(before); after.set(new TextEncoder().encode(content), before.length); this.files.set(path, after);
	}
	async readBinary(path: string): Promise<Uint8Array> { return this.require(path); }
	async writeBinary(path: string, content: Uint8Array): Promise<void> { this.files.set(path, content); }
	async rename(from: string, to: string): Promise<void> { this.files.set(to, this.require(from)); this.files.delete(from); }
	async remove(path: string): Promise<void> { this.files.delete(path); }
	async ensureDirectory(path: string): Promise<void> { this.directories.add(path); }
	async listFiles(path: string): Promise<readonly string[]> { const prefix = `${path.replace(/\/$/, '')}/`; return [...this.files.keys()].filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes('/')); }
	async listFilesRecursive(path: string): Promise<readonly string[]> { const prefix = `${path.replace(/\/$/, '')}/`; return [...this.files.keys()].filter((file) => file.startsWith(prefix)); }
	private require(path: string): Uint8Array { const value = this.files.get(path); if (!value) throw new Error(`missing ${path}`); return value; }
}

function runtime(adapter: MemoryAdapter): GeneratedOutputPersistenceRuntime {
	const registry = createDefaultGeneratedOutputRegistry();
	const roots = { aiRoot: 'ChatFolder', dataStore: 'ChatFolder/DataStore', pluginData: '.obsidian/plugins/peak' };
	const events = new PartitionedJsonlStore(adapter, registry, roots);
	return {
		snapshots: new AtomicJsonSnapshotStore(adapter, registry, roots), events,
		artifactBodies: new GeneratedArtifactBodyStore(adapter, registry, roots),
		migrations: new GeneratedOutputMigrationJournal(events), projections: new ProjectionRebuildRegistry(registry),
		syncManifest: buildGeneratedOutputSyncManifest(registry),
		resolvePath: (outputId, variables = {}) => registry.resolvePath(outputId, roots, variables),
	};
}

async function testEventFirstRecovery(): Promise<void> {
	const adapter = new MemoryAdapter();
	const repository = new AppPeakSheetRepository(runtime(adapter));
	const snapshot: PeakSheetDatasetSnapshot = {
		schemaVersion: 1, datasetId: 'sheet-recovery', name: 'Recovery', revision: 1,
		fields: [{ id: 'task', name: 'Task', type: 'text' }], rows: [{ id: 'r1', cells: { task: 'Before' } }],
		views: [{ id: 'table', name: 'Table', type: 'table' }],
		createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
	};
	const createEvent: PeakSheetCommitEvent = {
		eventId: 'create-1', datasetId: snapshot.datasetId, kind: 'create', baseRevision: 0, nextRevision: 1,
		snapshot, recordedAt: snapshot.createdAt,
	};
	adapter.failSnapshotWrites = true;
	assert.equal((await repository.create(snapshot, createEvent)).snapshotLag, true);
	assert.deepEqual(await repository.listDatasetIds(), [snapshot.datasetId], 'event-only datasets stay discoverable');
	assert.equal((await repository.load(snapshot.datasetId))?.rows[0].cells.task, 'Before');

	adapter.failSnapshotWrites = false;
	const patch: PeakSheetDatasetPatch = {
		patchId: 'patch-2', datasetId: snapshot.datasetId, baseRevision: 1,
		operations: [{ type: 'setCell', rowId: 'r1', fieldId: 'task', value: 'After' }],
		actor: { kind: 'user' }, createdAt: '2026-08-10T01:00:00.000Z',
	};
	const applied = applyPeakSheetPatch(snapshot, patch);
	await repository.commit(applied.snapshot, {
		eventId: 'event-2', datasetId: snapshot.datasetId, kind: 'apply', baseRevision: 1, nextRevision: 2,
		patch, inverse: applied.inverse, recordedAt: patch.createdAt,
	});
	assert.equal((await new AppPeakSheetRepository(runtime(adapter)).load(snapshot.datasetId))?.rows[0].cells.task, 'After');
	console.log('PASS: Peak Sheet event-first persistence recovers event-only creation and later snapshots');
}

testEventFirstRecovery().catch((error) => { console.error(error); process.exit(1); });
