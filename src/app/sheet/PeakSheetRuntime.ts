import type { PeakSheetUiPort, PeakSheetQueryInput, PeakSheetXlsxPort } from '@/core/ports/PeakSheetToolPort';
import {
	applyPeakSheetPatch,
	executePeakSheetAnalysis,
	projectPeakSheetRows,
	stableSortRows,
	parsePeakSheetCsv,
	parsePeakSheetJson,
	serializePeakSheetCsv,
	serializePeakSheetFile,
} from '@/core/sheet';
import type {
	PeakSheetAnalysisPlan,
	PeakSheetAnalysisResult,
	PeakSheetCommitEvent,
	PeakSheetCreateOptions,
	PeakSheetDatasetDraft,
	PeakSheetDatasetPatch,
	PeakSheetDatasetSnapshot,
	PeakSheetDatasetSummary,
	PeakSheetPatchOperation,
	PeakSheetPatchPair,
	PeakSheetLegacyMigrationRequest,
	PeakSheetViewDefinition,
	PeakSheetWorkbookDraft,
} from '@/core/sheet';
import type { PeakSheetRepository } from '@/service/sheet/PeakSheetRepository';
import type { PeakSheetFileChange, PeakSheetFileRepository } from '@/service/sheet/PeakSheetRepository';
import { HyperFormulaPeakSheetEngine } from '@/service/sheet/formula/HyperFormulaPeakSheetEngine';
import { createPeakSheetStarterDrafts } from './PeakSheetStarterDatasets';

type PeakSheetListener = () => void;

type PeakSheetRuntimeDependencies = {
	readonly xlsxRuntime?: PeakSheetXlsxPort;
};

export class PeakSheetRuntime implements PeakSheetUiPort {
	private readonly datasets = new Map<string, PeakSheetDatasetSnapshot>();
	private readonly undoStacks = new Map<string, PeakSheetPatchPair[]>();
	private readonly redoStacks = new Map<string, PeakSheetPatchPair[]>();
	private readonly listeners = new Set<PeakSheetListener>();
	private readonly queues = new Map<string, Promise<unknown>>();
	private requestedDatasetId: string | null = null;
	private unsubscribeFiles: (() => void) | null = null;
	private disposed = false;
	private readonly xlsxRuntime: PeakSheetXlsxPort | null;

	constructor(
		private readonly repository: PeakSheetRepository,
		private readonly formulaEngine = new HyperFormulaPeakSheetEngine(),
		private readonly now: () => string = () => new Date().toISOString(),
		private readonly idFactory: () => string = () => crypto.randomUUID(),
		dependencies: PeakSheetRuntimeDependencies = {},
	) {
		this.xlsxRuntime = dependencies.xlsxRuntime ?? null;
	}

	async initialize(): Promise<void> {
		for (const datasetId of await this.repository.listDatasetIds()) {
			const snapshot = await this.repository.load(datasetId);
			if (!snapshot) continue;
			this.datasets.set(datasetId, snapshot);
			await this.restoreHistory(datasetId);
		}
		if (isFileRepository(this.repository)) {
			this.unsubscribeFiles = this.repository.subscribeFiles((change) => void this.handleFileChange(change));
		}
		this.emit();
	}

	async ensureStarterDatasets(): Promise<void> {
		if ([...this.datasets.values()].some((dataset) => !dataset.deletedAt)) return;
		for (const draft of createPeakSheetStarterDrafts(this.now())) await this.createDataset(draft);
	}

	createBlankDataset(options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset({
			name: 'Untitled sheet',
			fields: [{ id: `field-${this.idFactory()}`, name: 'Name', type: 'text', width: 240 }],
			rows: [],
			diagnostics: [],
			source: 'manual',
		}, options);
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
				filePath: this.getFilePath(dataset.datasetId) ?? undefined,
			}));
	}

	getDataset(datasetId: string): PeakSheetDatasetSnapshot {
		const snapshot = this.datasets.get(datasetId);
		if (!snapshot || snapshot.deletedAt) throw new Error(`Unknown Peak Sheet dataset ${datasetId}.`);
		return this.formulaEngine.resolve(snapshot);
	}

	async openFile(path: string): Promise<PeakSheetDatasetSnapshot> {
		if (!isFileRepository(this.repository)) throw new Error('This Peak Sheet runtime is not file-native.');
		const snapshot = await this.repository.loadPath(path);
		this.datasets.set(snapshot.datasetId, snapshot);
		await this.restoreHistory(snapshot.datasetId);
		this.emit();
		return this.formulaEngine.resolve(snapshot);
	}

	getFilePath(datasetId: string): string | null {
		if (!isFileRepository(this.repository)) return null;
		return this.repository.getPath(datasetId);
	}

	async renameFile(datasetId: string, title: string): Promise<string> {
		if (!isFileRepository(this.repository)) {
			await this.mutate(datasetId, [{ type: 'renameDataset', name: title }]);
			return '';
		}
		const path = await this.repository.renameFile(datasetId, title);
		const snapshot = this.requireCanonicalDataset(datasetId);
		this.datasets.set(datasetId, { ...snapshot, name: title.trim() || snapshot.name });
		this.emit();
		return path;
	}

	async trashFile(datasetId: string): Promise<void> {
		if (!isFileRepository(this.repository)) {
			await this.mutate(datasetId, [{ type: 'setDatasetDeleted', deletedAt: this.now() }]);
			return;
		}
		await this.repository.trashFile(datasetId);
		this.removeDataset(datasetId);
		this.emit();
	}

	async listLegacyDatasets(): Promise<readonly PeakSheetDatasetSummary[]> {
		if (!isFileRepository(this.repository)) return [];
		const summaries: PeakSheetDatasetSummary[] = [];
		for (const datasetId of await this.repository.listLegacyDatasetIds()) {
			const snapshot = await this.repository.loadLegacyDataset(datasetId);
			if (!snapshot || snapshot.deletedAt) continue;
			summaries.push(summary(snapshot));
		}
		return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	}

	async migrateLegacyDatasets(request: PeakSheetLegacyMigrationRequest): Promise<readonly PeakSheetDatasetSnapshot[]> {
		if (!isFileRepository(this.repository)) return [];
		const migrated: PeakSheetDatasetSnapshot[] = [];
		for (const datasetId of request.datasetIds) {
			const snapshot = await this.repository.loadLegacyDataset(datasetId);
			if (!snapshot || snapshot.deletedAt) continue;
			const event: PeakSheetCommitEvent = {
				eventId: `event-migrate-${this.idFactory()}`,
				datasetId,
				kind: 'create',
				baseRevision: 0,
				nextRevision: snapshot.revision,
				snapshot,
				recordedAt: this.now(),
			};
			const path = createTargetPath(snapshot.name, request.folderPath);
			await this.repository.createAt(path, snapshot, event);
			this.datasets.set(datasetId, snapshot);
			await this.restoreHistory(datasetId);
			migrated.push(this.formulaEngine.resolve(snapshot));
		}
		this.emit();
		return migrated;
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

	async createDataset(draft: PeakSheetDatasetDraft, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot> {
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
		const event: PeakSheetCommitEvent = {
			eventId,
			datasetId,
			kind: 'create',
			baseRevision: 0,
			nextRevision: 1,
			snapshot,
			recordedAt: createdAt,
		};
		if (isFileRepository(this.repository)) {
			await this.repository.createAt(options?.filePath ?? createTargetPath(snapshot.name, options?.folderPath), snapshot, event);
		} else {
			await this.repository.create(snapshot, event);
		}
		this.datasets.set(datasetId, snapshot);
		this.undoStacks.set(datasetId, []);
		this.redoStacks.set(datasetId, []);
		this.emit();
		return this.formulaEngine.resolve(snapshot);
	}

	importCsv(text: string, name?: string, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset(parsePeakSheetCsv(text, name), options);
	}

	importJson(text: string, name?: string, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot> {
		return this.createDataset(parsePeakSheetJson(text, name), options);
	}

	async previewXlsx(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft> {
		this.assertActive();
		return this.requireXlsxRuntime().preview(buffer, name);
	}

	async importWorkbook(workbook: PeakSheetWorkbookDraft, sheetIndexes: readonly number[], options?: PeakSheetCreateOptions): Promise<readonly PeakSheetDatasetSnapshot[]> {
		const created: PeakSheetDatasetSnapshot[] = [];
		for (const index of [...new Set(sheetIndexes)].sort((left, right) => left - right)) {
			const sheet = workbook.sheets[index];
			if (!sheet) throw new Error(`Unknown workbook sheet index ${index}.`);
			created.push(await this.createDataset(sheet.draft, options));
		}
		return created;
	}

	async importXlsx(buffer: ArrayBuffer, name?: string, options?: PeakSheetCreateOptions): Promise<readonly PeakSheetDatasetSnapshot[]> {
		const workbook = await this.previewXlsx(buffer, name);
		return this.importWorkbook(workbook, workbook.sheets.map((_, index) => index), options);
	}

	exportCsv(datasetId: string): string {
		return serializePeakSheetCsv(this.getDataset(datasetId));
	}

	async exportXlsx(datasetId: string): Promise<ArrayBuffer> {
		this.assertActive();
		return this.requireXlsxRuntime().export(this.getDataset(datasetId));
	}

	exportNative(datasetId: string): string {
		return serializePeakSheetFile(this.requireCanonicalDataset(datasetId));
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
		if (this.disposed) return;
		this.disposed = true;
		this.xlsxRuntime?.dispose();
		this.unsubscribeFiles?.();
		this.unsubscribeFiles = null;
		if (isFileRepository(this.repository)) this.repository.dispose();
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
		const revision = this.datasets.get(datasetId)?.revision ?? 0;
		let coveredRevision = 0;
		for (const event of await this.repository.readEvents(datasetId)) {
			if (event.nextRevision > revision) continue;
			coveredRevision = Math.max(coveredRevision, event.nextRevision);
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
		this.undoStacks.set(datasetId, coveredRevision === revision ? undo : []);
		this.redoStacks.set(datasetId, coveredRevision === revision ? redo : []);
	}

	private async handleFileChange(change: PeakSheetFileChange): Promise<void> {
		if (this.disposed || !isFileRepository(this.repository)) return;
		try {
			if (change.type === 'delete') {
				if (change.datasetId) this.removeDataset(change.datasetId);
				this.emit();
				return;
			}
			if (change.type === 'rename' && change.datasetId && !this.repository.getPath(change.datasetId)) {
				this.removeDataset(change.datasetId);
				this.emit();
				return;
			}
			const snapshot = await this.repository.loadPath(change.path);
			this.datasets.set(snapshot.datasetId, snapshot);
			await this.restoreHistory(snapshot.datasetId);
			this.emit();
		} catch (error) {
			console.error(`[Peak Sheet] Could not refresh ${change.path}.`, error);
		}
	}

	private removeDataset(datasetId: string): void {
		this.datasets.delete(datasetId);
		this.undoStacks.delete(datasetId);
		this.redoStacks.delete(datasetId);
		this.queues.delete(datasetId);
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

	private requireXlsxRuntime(): PeakSheetXlsxPort {
		if (this.xlsxRuntime) return this.xlsxRuntime;
		throw new Error('Peak Sheet XLSX worker is unavailable. Rebuild the plugin to restore XLSX support.');
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

function isFileRepository(repository: PeakSheetRepository): repository is PeakSheetFileRepository {
	return 'loadPath' in repository && 'createAt' in repository;
}

function createTargetPath(title: string, folderPath?: string): string {
	const name = title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ') || 'Untitled sheet';
	return folderPath ? `${folderPath.replace(/\/$/, '')}/${name}.peaksheet` : `${name}.peaksheet`;
}

function summary(snapshot: PeakSheetDatasetSnapshot): PeakSheetDatasetSummary {
	return {
		datasetId: snapshot.datasetId,
		name: snapshot.name,
		revision: snapshot.revision,
		rowCount: snapshot.rows.length,
		fieldCount: snapshot.fields.length,
		updatedAt: snapshot.updatedAt,
	};
}
