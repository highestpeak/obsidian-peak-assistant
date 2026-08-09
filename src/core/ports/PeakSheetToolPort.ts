import type {
	PeakSheetAnalysisPlan,
	PeakSheetAnalysisResult,
	PeakSheetDatasetDraft,
	PeakSheetDatasetPatch,
	PeakSheetDatasetSnapshot,
	PeakSheetDatasetSummary,
	PeakSheetPatchOperation,
	PeakSheetFileRef,
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
	createDataset(draft: PeakSheetDatasetDraft): Promise<PeakSheetDatasetSnapshot>;
}

export interface PeakSheetUiPort extends PeakSheetToolPort {
	initialize(): Promise<void>;
	ensureStarterDatasets(): Promise<void>;
	getDataset(datasetId: string): PeakSheetDatasetSnapshot;
	mutate(
		datasetId: string,
		operations: readonly PeakSheetPatchOperation[],
		actor?: PeakSheetDatasetPatch['actor'],
	): Promise<PeakSheetDatasetSnapshot>;
	undo(datasetId: string): Promise<PeakSheetDatasetSnapshot>;
	redo(datasetId: string): Promise<PeakSheetDatasetSnapshot>;
	canUndo(datasetId: string): boolean;
	canRedo(datasetId: string): boolean;
	importCsv(text: string, name?: string): Promise<PeakSheetDatasetSnapshot>;
	importJson(text: string, name?: string): Promise<PeakSheetDatasetSnapshot>;
	previewXlsx(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft>;
	importWorkbook(workbook: PeakSheetWorkbookDraft, sheetIndexes: readonly number[]): Promise<readonly PeakSheetDatasetSnapshot[]>;
	importXlsx(buffer: ArrayBuffer, name?: string): Promise<readonly PeakSheetDatasetSnapshot[]>;
	subscribe(listener: () => void): () => void;
}

export interface PeakSheetAttachmentPort {
	copyExternalFile(input: {
		readonly name: string;
		readonly mediaType?: string;
		readonly bytes: Uint8Array;
	}): Promise<PeakSheetFileRef>;
}
