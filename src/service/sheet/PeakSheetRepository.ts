import type {
	PeakSheetCommitEvent,
	PeakSheetDatasetSnapshot,
} from '@/core/sheet';

export interface PeakSheetCommitResult {
	readonly snapshotLag: boolean;
}

export interface PeakSheetRepository {
	listDatasetIds(): Promise<readonly string[]>;
	load(datasetId: string): Promise<PeakSheetDatasetSnapshot | null>;
	readEvents(datasetId: string): Promise<readonly PeakSheetCommitEvent[]>;
	create(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult>;
	commit(snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult>;
}
