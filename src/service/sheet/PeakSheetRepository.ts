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

export type PeakSheetFileChange =
	| { readonly type: 'create' | 'modify' | 'rename'; readonly path: string; readonly oldPath?: string; readonly datasetId?: string }
	| { readonly type: 'delete'; readonly path: string; readonly datasetId?: string };

/** Optional file-native capabilities. Runtime callers feature-detect this port. */
export interface PeakSheetFileRepository extends PeakSheetRepository {
	loadPath(path: string): Promise<PeakSheetDatasetSnapshot>;
	getPath(datasetId: string): string | null;
	createAt(path: string, snapshot: PeakSheetDatasetSnapshot, event: PeakSheetCommitEvent): Promise<PeakSheetCommitResult>;
	renameFile(datasetId: string, title: string): Promise<string>;
	trashFile(datasetId: string): Promise<void>;
	listLegacyDatasetIds(): Promise<readonly string[]>;
	loadLegacyDataset(datasetId: string): Promise<PeakSheetDatasetSnapshot | null>;
	subscribeFiles(listener: (change: PeakSheetFileChange) => void): () => void;
	dispose(): void;
}
