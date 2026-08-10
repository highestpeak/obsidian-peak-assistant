import assert from 'node:assert/strict';

import type { PeakSheetCommitEvent, PeakSheetDatasetSnapshot, PeakSheetWorkbookDraft } from '@/core/sheet';
import { PeakSheetRuntime } from '@/app/sheet/PeakSheetRuntime';
import type { PeakSheetCommitResult, PeakSheetRepository } from '@/service/sheet/PeakSheetRepository';

class MemoryRepository implements PeakSheetRepository {
	readonly snapshots = new Map<string, PeakSheetDatasetSnapshot>();
	readonly events = new Map<string, PeakSheetCommitEvent[]>();
	async listDatasetIds(): Promise<readonly string[]> { return [...new Set([...this.snapshots.keys(), ...this.events.keys()])]; }
	async load(datasetId: string): Promise<PeakSheetDatasetSnapshot | null> { return this.snapshots.get(datasetId) ?? this.events.get(datasetId)?.find((event) => event.snapshot)?.snapshot ?? null; }
	async readEvents(datasetId: string): Promise<readonly PeakSheetCommitEvent[]> { return this.events.get(datasetId) ?? []; }
	async create(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> { return this.commit(snapshot, event); }
	async commit(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		this.events.set(snapshot.datasetId, [...(this.events.get(snapshot.datasetId) ?? []), event]);
		this.snapshots.set(snapshot.datasetId, snapshot);
		return { snapshotLag: false };
	}
}

async function testRuntimeHistoryAndReload(): Promise<void> {
	const repository = new MemoryRepository();
	let id = 0;
	const idFactory = () => `id-${++id}`;
	const now = () => `2026-08-10T00:00:${String(id).padStart(2, '0')}.000Z`;
	const runtime = new PeakSheetRuntime(repository, undefined, now, idFactory);
	await runtime.initialize();
	await runtime.ensureStarterDatasets();
	assert.equal(runtime.listDatasets().length, 3);
	const launch = runtime.listDatasets().find((dataset) => dataset.name.includes('Launch Tracker'))!;
	const before = runtime.getDataset(launch.datasetId);
	const onboarding = before.rows.find((row) => row.cells.task === 'Polish onboarding')!;
	await runtime.mutate(launch.datasetId, [{ type: 'setCell', rowId: onboarding.id, fieldId: 'status', value: 'Doing' }]);
	assert.equal(runtime.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.status, 'Doing');
	assert.equal(runtime.canUndo(launch.datasetId), true);
	await runtime.undo(launch.datasetId);
	assert.equal(runtime.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.status, 'Backlog');
	await runtime.redo(launch.datasetId);
	assert.equal(runtime.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.status, 'Doing');
	await Promise.all([
		runtime.mutate(launch.datasetId, [{ type: 'setCell', rowId: onboarding.id, fieldId: 'notes', value: 'First rapid edit' }]),
		runtime.mutate(launch.datasetId, [{ type: 'setCell', rowId: onboarding.id, fieldId: 'blocker', value: 'Second rapid edit' }]),
	]);
	assert.equal(runtime.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.notes, 'First rapid edit');
	assert.equal(runtime.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.blocker, 'Second rapid edit');

	const reloaded = new PeakSheetRuntime(repository, undefined, now, idFactory);
	await reloaded.initialize();
	assert.equal(reloaded.getDataset(launch.datasetId).rows.find((row) => row.id === onboarding.id)?.cells.status, 'Doing');
	assert.equal(reloaded.canUndo(launch.datasetId), true);
	await assert.rejects(
		reloaded.applyPatch({
			patchId: 'stale', datasetId: launch.datasetId, baseRevision: 1,
			operations: [{ type: 'renameDataset', name: 'Stale' }], actor: { kind: 'ai', runId: 'run' }, createdAt: now(),
		}),
		/Stale dataset revision/,
	);
	assert.ok(repository.events.get(launch.datasetId)!.every((event, index, events) => index === 0 || event.nextRevision >= events[index - 1].nextRevision));
	const workbook: PeakSheetWorkbookDraft = {
		workbookName: 'Review workbook', diagnostics: ['Styles are ignored.'],
		sheets: [
			{ name: 'Skip', compatibility: [], draft: { name: 'Skip', fields: [{ id: 'name', name: 'Name', type: 'text' }], rows: [], diagnostics: [], source: 'xlsx' } },
			{ name: 'Keep', compatibility: ['Formula cached value only.'], draft: { name: 'Keep', fields: [{ id: 'name', name: 'Name', type: 'text' }], rows: [{ id: 'r1', cells: { name: 'Accepted' } }], diagnostics: [], source: 'xlsx' } },
		],
	};
	const accepted = await reloaded.importWorkbook(workbook, [1]);
	assert.equal(accepted.length, 1);
	assert.equal(accepted[0].name, 'Keep');
	const blank = await reloaded.createBlankDataset();
	assert.equal(blank.name, 'Untitled sheet');
	assert.equal(blank.fields[0].name, 'Name');
	reloaded.requestDatasetFocus(blank.datasetId);
	assert.equal(reloaded.takeDatasetFocusRequest(), blank.datasetId);
	assert.equal(reloaded.takeDatasetFocusRequest(), null, 'focus requests are consumed exactly once');
	console.log('PASS: Peak Sheet starter datasets, undo/redo, reload and stale revision defense');
}

testRuntimeHistoryAndReload().catch((error) => { console.error(error); process.exit(1); });
