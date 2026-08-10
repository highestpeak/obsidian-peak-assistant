import type { PeakSheetUiPort, PeakSheetQueryInput } from '@/core/ports/PeakSheetToolPort';
import {
	applyPeakSheetPatch,
	executePeakSheetAnalysis,
	projectPeakSheetRows,
	stableSortRows,
	parsePeakSheetCsv,
	parsePeakSheetJson,
} from '@/core/sheet';
import type {
	PeakSheetAnalysisPlan,
	PeakSheetAnalysisResult,
	PeakSheetDatasetDraft,
	PeakSheetDatasetPatch,
	PeakSheetDatasetSnapshot,
	PeakSheetDatasetSummary,
	PeakSheetPatchOperation,
	PeakSheetPatchPair,
	PeakSheetViewDefinition,
	PeakSheetWorkbookDraft,
} from '@/core/sheet';
import type { PeakSheetRepository } from '@/service/sheet/PeakSheetRepository';
import { HyperFormulaPeakSheetEngine } from '@/service/sheet/formula/HyperFormulaPeakSheetEngine';
import { createPeakSheetStarterDrafts } from './PeakSheetStarterDatasets';
import { parsePeakSheetXlsx } from '@/service/sheet/import/PeakSheetXlsxImporter';

type PeakSheetListener = () => void;

export class PeakSheetRuntime implements PeakSheetUiPort {
	private readonly datasets = new Map<string, PeakSheetDatasetSnapshot>();
	private readonly undoStacks = new Map<string, PeakSheetPatchPair[]>();
	private readonly redoStacks = new Map<string, PeakSheetPatchPair[]>();
	private readonly listeners = new Set<PeakSheetListener>();
	private readonly queues = new Map<string, Promise<unknown>>();
	private requestedDatasetId: string | null = null;
	private disposed = false;

	constructor(
		private readonly repository: PeakSheetRepository,
		private readonly formulaEngine = new HyperFormulaPeakSheetEngine(),
		private readonly now: () => string = () => new Date().toISOString(),
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

	async initialize(): Promise<void> {
		for (const datasetId of await this.repository.listDatasetIds()) {
			const snapshot = await this.repository.load(datasetId);
			if (!snapshot) continue;
			this.datasets.set(datasetId, snapshot);
			await this.restoreHistory(datasetId);
		}
		this.emit();
	}

	async ensureStarterDatasets(): Promise<void> {
		if ([...this.datasets.values()].some((dataset) => !dataset.deletedAt)) return;
		for (const draft of createPeakSheetStarterDrafts(this.now())) await this.createDataset(draft);
	}

	createBlankDataset(): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset({
			name: 'Untitled sheet',
			fields: [{ id: `field-${this.idFactory()}`, name: 'Name', type: 'text', width: 240 }],
			rows: [],
			diagnostics: [],
			source: 'manual',
		});
	}

	requestDatasetFocus(datasetId: string): void {
		this.requireCanonicalDataset(datasetId);
		this.requestedDatasetId = datasetId;
		this.emit();
	}

	takeDatasetFocusRequest(): string | null {
		const datasetId = this.requestedDatasetId;
		this.requestedDatasetId = null;
		return datasetId;
	}

	listDatasets(): readonly PeakSheetDatasetSummary[] {
		return [...this.datasets.values()]
			.filter((dataset) => !dataset.deletedAt)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.map((dataset) => ({
				datasetId: dataset.datasetId,
				name: dataset.name,
				revision: dataset.revision,
				rowCount: dataset.rows.length,
				fieldCount: dataset.fields.length,
				updatedAt: dataset.updatedAt,
			}));
	}

	getDataset(datasetId: string): PeakSheetDatasetSnapshot {
		const snapshot = this.datasets.get(datasetId);
		if (!snapshot || snapshot.deletedAt) throw new Error(`Unknown Peak Sheet dataset ${datasetId}.`);
		return this.formulaEngine.resolve(snapshot);
	}

	query(input: PeakSheetQueryInput): PeakSheetDatasetSnapshot {
		const snapshot = this.getDataset(input.datasetId);
		const view = input.viewId ? snapshot.views.find((candidate) => candidate.id === input.viewId) : undefined;
		let rows = projectPeakSheetRows(snapshot, view?.filters);
		rows = stableSortRows(rows, snapshot.fields, view?.sorts ?? []);
		const limit = Math.max(1, Math.min(5_000, input.limit ?? 500));
		return { ...snapshot, rows: rows.slice(0, limit) };
	}

	analyze(plan: PeakSheetAnalysisPlan): PeakSheetAnalysisResult {
		const snapshot = this.requireCanonicalDataset(plan.datasetId);
		return executePeakSheetAnalysis(snapshot, plan, this.formulaEngine);
	}

	async createDataset(draft: PeakSheetDatasetDraft): Promise<PeakSheetDatasetSnapshot> {
		this.assertActive();
		const createdAt = this.now();
		const datasetId = `sheet-${this.idFactory()}`;
		const snapshot: PeakSheetDatasetSnapshot = {
			schemaVersion: 1,
			datasetId,
			name: draft.name.trim() || 'Untitled sheet',
			revision: 1,
			fields: draft.fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
			rows: draft.rows.map((row) => ({ ...row, cells: { ...row.cells } })),
			views: deriveDefaultViews(draft),
			createdAt,
			updatedAt: createdAt,
		};
		const eventId = `event-${this.idFactory()}`;
		await this.repository.create(snapshot, {
			eventId,
			datasetId,
			kind: 'create',
			baseRevision: 0,
			nextRevision: 1,
			snapshot,
			recordedAt: createdAt,
		});
		this.datasets.set(datasetId, snapshot);
		this.undoStacks.set(datasetId, []);
		this.redoStacks.set(datasetId, []);
		this.emit();
		return this.formulaEngine.resolve(snapshot);
	}

	importCsv(text: string, name?: string): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset(parsePeakSheetCsv(text, name));
	}

	importJson(text: string, name?: string): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset(parsePeakSheetJson(text, name));
	}

	previewXlsx(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft> {
		return parsePeakSheetXlsx(buffer, name);
	}

	async importWorkbook(workbook: PeakSheetWorkbookDraft, sheetIndexes: readonly number[]): Promise<readonly PeakSheetDatasetSnapshot[]> {
		const created: PeakSheetDatasetSnapshot[] = [];
		for (const index of [...new Set(sheetIndexes)].sort((left, right) => left - right)) {
			const sheet = workbook.sheets[index];
			if (!sheet) throw new Error(`Unknown workbook sheet index ${index}.`);
			created.push(await this.createDataset(sheet.draft));
		}
		return created;
	}

	async importXlsx(buffer: ArrayBuffer, name?: string): Promise<readonly PeakSheetDatasetSnapshot[]> {
		const workbook = await this.previewXlsx(buffer, name);
		return this.importWorkbook(workbook, workbook.sheets.map((_, index) => index));
	}

	applyPatch(patch: PeakSheetDatasetPatch): Promise<PeakSheetDatasetSnapshot> {
		return this.enqueue(patch.datasetId, () => this.commitPatch(patch, 'apply'));
	}

	mutate(
		datasetId: string,
		operations: readonly PeakSheetPatchOperation[],
		actor: PeakSheetDatasetPatch['actor'] = { kind: 'user' },
	): Promise<PeakSheetDatasetSnapshot> {
		return this.enqueue(datasetId, () => {
			const snapshot = this.requireCanonicalDataset(datasetId);
			return this.commitPatch({
				patchId: `patch-${this.idFactory()}`,
				datasetId,
				baseRevision: snapshot.revision,
				operations,
				actor,
				createdAt: this.now(),
			}, 'apply');
		});
	}

	undo(datasetId: string): Promise<PeakSheetDatasetSnapshot> {
		return this.enqueue(datasetId, async () => {
			const pair = this.undoStacks.get(datasetId)?.pop();
			if (!pair) return this.getDataset(datasetId);
			const current = this.requireCanonicalDataset(datasetId);
			const patch = rebasePatch(pair.inverse, current.revision, `undo-${this.idFactory()}`, this.now());
			try {
				const next = await this.commitPatch(patch, 'undo', pair.forward.patchId, false);
				this.redoStack(datasetId).push(pair);
				return next;
			} catch (error) {
				this.undoStack(datasetId).push(pair);
				throw error;
			}
		});
	}

	redo(datasetId: string): Promise<PeakSheetDatasetSnapshot> {
		return this.enqueue(datasetId, async () => {
			const pair = this.redoStacks.get(datasetId)?.pop();
			if (!pair) return this.getDataset(datasetId);
			const current = this.requireCanonicalDataset(datasetId);
			const patch = rebasePatch(pair.forward, current.revision, `redo-${this.idFactory()}`, this.now());
			try {
				const next = await this.commitPatch(patch, 'redo', pair.forward.patchId, false);
				this.undoStack(datasetId).push(pair);
				return next;
			} catch (error) {
				this.redoStack(datasetId).push(pair);
				throw error;
			}
		});
	}

	canUndo(datasetId: string): boolean {
		return (this.undoStacks.get(datasetId)?.length ?? 0) > 0;
	}

	canRedo(datasetId: string): boolean {
		return (this.redoStacks.get(datasetId)?.length ?? 0) > 0;
	}

	subscribe(listener: PeakSheetListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
		this.datasets.clear();
		this.queues.clear();
		this.requestedDatasetId = null;
	}

	private async commitPatch(
		patch: PeakSheetDatasetPatch,
		kind: 'apply' | 'undo' | 'redo',
		targetPatchId?: string,
		updateHistory = true,
	): Promise<PeakSheetDatasetSnapshot> {
		this.assertActive();
		const current = this.requireCanonicalDataset(patch.datasetId);
		const result = applyPeakSheetPatch(current, patch);
		const eventId = `event-${this.idFactory()}`;
		await this.repository.commit(result.snapshot, {
			eventId,
			datasetId: patch.datasetId,
			kind,
			baseRevision: current.revision,
			nextRevision: result.snapshot.revision,
			patch,
			inverse: result.inverse,
			targetPatchId,
			recordedAt: patch.createdAt,
		});
		this.datasets.set(patch.datasetId, result.snapshot);
		if (updateHistory) {
			this.undoStack(patch.datasetId).push({ forward: patch, inverse: result.inverse });
			this.redoStacks.set(patch.datasetId, []);
		}
		this.emit();
		return this.formulaEngine.resolve(result.snapshot);
	}

	private async restoreHistory(datasetId: string): Promise<void> {
		const undo: PeakSheetPatchPair[] = [];
		const redo: PeakSheetPatchPair[] = [];
		for (const event of await this.repository.readEvents(datasetId)) {
			if (event.kind === 'apply' && event.patch && event.inverse) {
				undo.push({ forward: event.patch, inverse: event.inverse });
				redo.length = 0;
				continue;
			}
			if (event.kind === 'undo' && event.targetPatchId) {
				const index = findHistoryPair(undo, event.targetPatchId);
				if (index >= 0) redo.push(...undo.splice(index, 1));
				continue;
			}
			if (event.kind === 'redo' && event.targetPatchId) {
				const index = findHistoryPair(redo, event.targetPatchId);
				if (index >= 0) undo.push(...redo.splice(index, 1));
			}
		}
		this.undoStacks.set(datasetId, undo);
		this.redoStacks.set(datasetId, redo);
	}

	private requireCanonicalDataset(datasetId: string): PeakSheetDatasetSnapshot {
		const snapshot = this.datasets.get(datasetId);
		if (!snapshot || snapshot.deletedAt) throw new Error(`Unknown Peak Sheet dataset ${datasetId}.`);
		return snapshot;
	}

	private undoStack(datasetId: string): PeakSheetPatchPair[] {
		const stack = this.undoStacks.get(datasetId) ?? [];
		this.undoStacks.set(datasetId, stack);
		return stack;
	}

	private redoStack(datasetId: string): PeakSheetPatchPair[] {
		const stack = this.redoStacks.get(datasetId) ?? [];
		this.redoStacks.set(datasetId, stack);
		return stack;
	}

	private enqueue<T>(datasetId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(datasetId) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(operation);
		this.queues.set(datasetId, current);
		return current.finally(() => {
			if (this.queues.get(datasetId) === current) this.queues.delete(datasetId);
		});
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('Peak Sheet runtime has been disposed.');
	}
}

function deriveDefaultViews(draft: PeakSheetDatasetDraft): PeakSheetViewDefinition[] {
	const text = draft.fields.find((field) => field.type === 'text') ?? draft.fields[0];
	const select = draft.fields.find((field) => field.type === 'singleSelect');
	const category = select ?? text;
	const numeric = draft.fields.find((field) => field.type === 'number');
	const date = draft.fields.find((field) => field.type === 'date');
	const views: PeakSheetViewDefinition[] = [{ id: 'table-main', name: 'Table', type: 'table' }];
	if (select && text?.type === 'text') {
		views.push({ id: 'board-main', name: 'Board', type: 'board', laneFieldId: select.id, titleFieldId: text.id });
	}
	if (category) {
		views.push({
			id: 'chart-main', name: 'Chart', type: 'chart', chartType: 'bar', categoryFieldId: category.id,
			series: [{ fieldId: numeric?.id ?? category.id, aggregate: numeric ? 'sum' : 'count' }],
		});
	}
	if (date && text?.type === 'text') views.push({ id: 'calendar-main', name: 'Calendar', type: 'calendar', dateFieldId: date.id, titleFieldId: text.id });
	return views;
}

function rebasePatch(
	patch: PeakSheetDatasetPatch,
	baseRevision: number,
	patchId: string,
	createdAt: string,
): PeakSheetDatasetPatch {
	return { ...patch, patchId, baseRevision, createdAt, actor: { kind: 'user' } };
}

function findHistoryPair(stack: readonly PeakSheetPatchPair[], patchId: string): number {
	for (let index = stack.length - 1; index >= 0; index--) {
		if (stack[index].forward.patchId === patchId) return index;
	}
	return -1;
}
