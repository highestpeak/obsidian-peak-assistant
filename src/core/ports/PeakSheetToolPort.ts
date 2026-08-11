import type {
	PeakSheetAnalysisPlan,
	PeakSheetAnalysisResult,
	PeakSheetCreateOptions,
	PeakSheetDatasetDraft,
	PeakSheetDatasetPatch,
	PeakSheetDatasetSnapshot,
	PeakSheetDatasetSummary,
	PeakSheetPatchOperation,
	PeakSheetFileRef,
	PeakSheetLegacyMigrationRequest,
	PeakSheetWorkbookDraft,
} from '@/core/sheet';

export interface PeakSheetQueryInput {
	readonly datasetId: string;
	readonly viewId?: string;
	readonly limit?: number;
}

export interface PeakSheetToolPort {
	listDatasets(): readonly PeakSheetDatasetSummary[];
	query(input: PeakSheetQueryInput): PeakSheetDatasetSnapshot;
	analyze(plan: PeakSheetAnalysisPlan): PeakSheetAnalysisResult;
	applyPatch(patch: PeakSheetDatasetPatch): Promise<PeakSheetDatasetSnapshot>;
	createDataset(draft: PeakSheetDatasetDraft, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot>;
}

export interface PeakSheetUiPort extends PeakSheetToolPort {
	initialize(): Promise<void>;
	ensureStarterDatasets(): Promise<void>;
	createBlankDataset(options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot>;
	requestDatasetFocus(datasetId: string): void;
	takeDatasetFocusRequest(): string | null;
	getDataset(datasetId: string): PeakSheetDatasetSnapshot;
	openFile(path: string): Promise<PeakSheetDatasetSnapshot>;
	getFilePath(datasetId: string): string | null;
	renameFile(datasetId: string, title: string): Promise<string>;
	trashFile(datasetId: string): Promise<void>;
	listLegacyDatasets(): Promise<readonly PeakSheetDatasetSummary[]>;
	migrateLegacyDatasets(request: PeakSheetLegacyMigrationRequest): Promise<readonly PeakSheetDatasetSnapshot[]>;
	mutate(
		datasetId: string,
		operations: readonly PeakSheetPatchOperation[],
		actor?: PeakSheetDatasetPatch['actor'],
	): Promise<PeakSheetDatasetSnapshot>;
	undo(datasetId: string): Promise<PeakSheetDatasetSnapshot>;
	redo(datasetId: string): Promise<PeakSheetDatasetSnapshot>;
	canUndo(datasetId: string): boolean;
	canRedo(datasetId: string): boolean;
	importCsv(text: string, name?: string, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot>;
	importJson(text: string, name?: string, options?: PeakSheetCreateOptions): Promise<PeakSheetDatasetSnapshot>;
	previewXlsx(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft>;
	importWorkbook(workbook: PeakSheetWorkbookDraft, sheetIndexes: readonly number[], options?: PeakSheetCreateOptions): Promise<readonly PeakSheetDatasetSnapshot[]>;
	importXlsx(buffer: ArrayBuffer, name?: string, options?: PeakSheetCreateOptions): Promise<readonly PeakSheetDatasetSnapshot[]>;
	exportCsv(datasetId: string): string;
	exportXlsx(datasetId: string): Promise<ArrayBuffer>;
	exportNative(datasetId: string): string;
	subscribe(listener: () => void): () => void;
}

/**
 * Optional heavyweight spreadsheet codec boundary.
 *
 * Production owns this at the app layer so ExcelJS can run in a disposable
 * isolate instead of becoming permanent state in the Obsidian renderer.
 */
export interface PeakSheetXlsxPort {
	preview(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft>;
	export(snapshot: PeakSheetDatasetSnapshot): Promise<ArrayBuffer>;
	dispose(): void;
}

export interface PeakSheetAttachmentPort {
	copyExternalFile(input: {
		readonly name: string;
		readonly mediaType?: string;
		readonly bytes: Uint8Array;
	}): Promise<PeakSheetFileRef>;
}
