import assert from 'node:assert/strict';

import type { PeakSheetCommitEvent, PeakSheetDatasetSnapshot } from '@/core/sheet';
import { PeakSheetRuntime } from '@/app/sheet/PeakSheetRuntime';
import type { PeakSheetCommitResult, PeakSheetRepository } from '@/service/sheet/PeakSheetRepository';
import { buildPeakSheetTools } from '@/service/chat/tools/peakSheetTools';

class MemoryRepository implements PeakSheetRepository {
	readonly snapshots = new Map<string, PeakSheetDatasetSnapshot>();
	readonly events = new Map<string, PeakSheetCommitEvent[]>();
	async listDatasetIds(): Promise<readonly string[]> { return [...this.snapshots.keys()]; }
	async load(id: string): Promise<PeakSheetDatasetSnapshot | null> { return this.snapshots.get(id) ?? null; }
	async readEvents(id: string): Promise<readonly PeakSheetCommitEvent[]> { return this.events.get(id) ?? []; }
	async create(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> { return this.commit(snapshot, event); }
	async commit(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult> {
		this.snapshots.set(snapshot.datasetId, snapshot);
		this.events.set(snapshot.datasetId, [...(this.events.get(snapshot.datasetId) ?? []), event]);
		return { snapshotLag: false };
	}
}

async function testTools(): Promise<void> {
	const runtime = new PeakSheetRuntime(new MemoryRepository());
	await runtime.initialize();
	const tools = buildPeakSheetTools(runtime);
	assert.deepEqual(tools.map((tool) => tool.name), ['peak_sheet_list', 'peak_sheet_query', 'peak_sheet_analyze', 'peak_sheet_script', 'peak_sheet_patch', 'peak_sheet_create']);
	assert.deepEqual(tools.map((tool) => tool.kind), ['read', 'read', 'read', 'read', 'edit', 'edit']);
	const create = tools.find((tool) => tool.name === 'peak_sheet_create')!;
	const context = { loopId: 'run-1', stepIndex: 0, tier: 'balanced', signal: new AbortController().signal } as never;
	const created = await create.execute({
		name: 'AI Tasks',
		fields: [{ id: 'task', name: 'Task', type: 'text' }, { id: 'score', name: 'Score', type: 'number' }],
		rows: [{ id: 'r1', cells: { task: 'Ship', score: 8 } }],
	}, context);
	assert.equal(created.ok, true);
	const dataset = created.data as PeakSheetDatasetSnapshot;
	const query = tools.find((tool) => tool.name === 'peak_sheet_query')!;
	const queried = await query.execute({ datasetId: dataset.datasetId }, context);
	assert.equal(queried.ok, true);
	const analyze = tools.find((tool) => tool.name === 'peak_sheet_analyze')!;
	const analysis = await analyze.execute({
		planId: 'plan-1', datasetId: dataset.datasetId, baseRevision: dataset.revision,
		steps: [{ op: 'aggregate', metrics: [{ id: 'sum', fieldId: 'score', operation: 'sum' }] }],
	}, context);
	assert.equal(analysis.ok, true);
	if (analysis.ok) assert.equal((analysis.data as { metrics: Record<string, number> }).metrics.sum, 8);
	const script = tools.find((tool) => tool.name === 'peak_sheet_script')!;
	const scripted = await script.execute({ scriptId: 'script-1', datasetId: dataset.datasetId, baseRevision: dataset.revision, steps: [{ op: 'chart', chartType: 'bar', categoryFieldId: 'task', metrics: [{ id: 'score', fieldId: 'score', operation: 'sum' }] }] }, context);
	assert.equal(scripted.ok, true);
	const patch = tools.find((tool) => tool.name === 'peak_sheet_patch')!;
	const changed = await patch.execute({ datasetId: dataset.datasetId, baseRevision: dataset.revision, operations: [{ type: 'setCell', rowId: 'r1', fieldId: 'score', value: 10 }] }, context);
	assert.equal(changed.ok, true);
	const stale = await patch.execute({ datasetId: dataset.datasetId, baseRevision: dataset.revision, operations: [{ type: 'setCell', rowId: 'r1', fieldId: 'score', value: 11 }] }, context);
	assert.equal(stale.ok, false);
	if (!stale.ok) assert.match(stale.error, /Stale dataset revision/);
	console.log('PASS: Peak Sheet AI list/query/analyze/create/edit tools and revision conflict');
}

testTools().catch((error) => { console.error(error); process.exit(1); });
