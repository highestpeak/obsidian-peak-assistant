import assert from 'node:assert/strict';
import { TFile } from 'obsidian';

import { AppPeakSheetFileRepository } from '@/app/sheet/AppPeakSheetFileRepository';
import { parsePeakSheetFile, serializePeakSheetFile } from '@/core/sheet';
import type { PeakSheetCommitEvent, PeakSheetDatasetSnapshot } from '@/core/sheet';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';

type Listener = (...args: any[]) => void;

class MemoryVault {
	readonly files = new Map<string, { file: TFile; content: string }>();
	readonly listeners = new Map<string, Set<Listener>>();

	getFiles(): TFile[] { return [...this.files.values()].map((entry) => entry.file); }
	getAbstractFileByPath(path: string): TFile | null { return this.files.get(path)?.file ?? null; }
	async read(file: TFile): Promise<string> { return this.files.get(file.path)?.content ?? ''; }
	async create(path: string, content: string): Promise<TFile> {
		const file = makeFile(path);
		this.files.set(path, { file, content });
		this.emit('create', file);
		return file;
	}
	async process(file: TFile, fn: (content: string) => string): Promise<string> {
		const entry = this.files.get(file.path);
		if (!entry) throw new Error(`missing ${file.path}`);
		entry.content = fn(entry.content);
		this.emit('modify', file);
		return entry.content;
	}
	on(name: string, listener: Listener): object {
		const listeners = this.listeners.get(name) ?? new Set();
		listeners.add(listener);
		this.listeners.set(name, listeners);
		return { name, listener };
	}
	offref(ref: { name: string; listener: Listener }): void { this.listeners.get(ref.name)?.delete(ref.listener); }
	emit(name: string, ...args: any[]): void { for (const listener of this.listeners.get(name) ?? []) listener(...args); }
}

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.slice(path.lastIndexOf('/') + 1);
	file.extension = file.name.slice(file.name.lastIndexOf('.') + 1);
	file.basename = file.name.slice(0, -(file.extension.length + 1));
	return file;
}

function snapshot(datasetId: string, name: string, revision = 1): PeakSheetDatasetSnapshot {
	return {
		schemaVersion: 1, datasetId, name, revision,
		fields: [{ id: 'task', name: 'Task', type: 'text' }],
		rows: [{ id: 'r1', cells: { task: revision === 1 ? 'Before' : 'After' } }],
		views: [{ id: 'table', name: 'Table', type: 'table' }],
		createdAt: '2026-08-11T00:00:00.000Z', updatedAt: `2026-08-11T00:00:0${revision}.000Z`,
	};
}

function event(datasetId: string, nextRevision: number): PeakSheetCommitEvent {
	return {
		eventId: `event-${datasetId}-${nextRevision}`, datasetId,
		kind: nextRevision === 1 ? 'create' : 'apply', baseRevision: nextRevision - 1, nextRevision,
		snapshot: nextRevision === 1 ? snapshot(datasetId, 'Launch') : undefined,
		recordedAt: '2026-08-11T00:00:00.000Z',
	};
}

async function run(): Promise<void> {
	const vault = new MemoryVault();
	const appended: PeakSheetCommitEvent[] = [];
	const outputs = {
		events: { appendEvent: async (input: { payload: PeakSheetCommitEvent }) => { appended.push(input.payload); }, readEvents: async () => ({ events: [] }) },
		resolvePath: () => 'DataStore/artifacts/peak-sheets/__sample__/dataset.json',
		snapshots: { listSnapshotFilesRecursive: async () => [], readSnapshot: async () => null },
	} as unknown as GeneratedOutputPersistenceRuntime;
	const app = {
		vault,
		fileManager: {
			renameFile: async (file: TFile, path: string) => {
				const entry = vault.files.get(file.path)!;
				const oldPath = file.path;
				vault.files.delete(oldPath);
				const renamed = makeFile(path);
				vault.files.set(path, { file: renamed, content: entry.content });
				vault.emit('rename', renamed, oldPath);
			},
			trashFile: async (file: TFile) => { vault.files.delete(file.path); vault.emit('delete', file); },
		},
	} as never;
	const repository = new AppPeakSheetFileRepository(app, outputs);
	assert.deepEqual(await repository.listDatasetIds(), []);

	await repository.createAt('Projects/Launch.peaksheet', snapshot('sheet-1', 'Launch'), event('sheet-1', 1));
	assert.equal(repository.getPath('sheet-1'), 'Projects/Launch.peaksheet');
	const createdText = vault.files.get('Projects/Launch.peaksheet')!.content;
	assert.equal((JSON.parse(createdText) as Record<string, unknown>).name, undefined, 'filename owns the title');

	await repository.commit(snapshot('sheet-1', 'Launch', 2), event('sheet-1', 2));
	assert.equal((await repository.load('sheet-1'))?.revision, 2);
	assert.equal((await repository.load('sheet-1'))?.rows[0].cells.task, 'After');

	const renamedPath = await repository.renameFile('sheet-1', 'Launch tracker');
	assert.equal(renamedPath, 'Projects/Launch tracker.peaksheet');
	assert.equal((await repository.loadPath(renamedPath)).name, 'Launch tracker');

	await repository.createAt('Projects/Launch tracker.peaksheet', snapshot('sheet-2', 'Launch tracker'), event('sheet-2', 1));
	assert.equal(repository.getPath('sheet-2'), 'Projects/Launch tracker 2.peaksheet', 'file collisions get a stable suffix');

	const canonicalPath = repository.getPath('sheet-1')!;
	const external = { ...parsePeakSheetFile(vault.files.get(canonicalPath)!.content, canonicalPath), revision: 9 };
	vault.files.get(canonicalPath)!.content = serializePeakSheetFile(external);
	await assert.rejects(repository.commit(snapshot('sheet-1', 'Launch tracker', 3), event('sheet-1', 3)), /changed externally/);
	assert.equal(appended.at(-1)?.nextRevision, 3, 'recovery event is durable before a guarded file write');
	assert.equal((await repository.load('sheet-1'))?.revision, 9, 'visible file remains canonical after a conflict');

	await repository.trashFile('sheet-2');
	assert.equal(repository.getPath('sheet-2'), null);
	repository.dispose();
	console.log('PASS: file-native repository create, atomic commit, rename, collision, conflict and trash');
}

void run();
