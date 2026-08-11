import type { PeakSheetDatasetSnapshot, PeakSheetWorkbookDraft } from '@/core/sheet';
import type { DisposableWorkerResponse } from '@/app/platform/worker/DisposableWorkerTaskClient';

export type PeakSheetXlsxWorkerRequest =
	| { readonly kind: 'preview'; readonly buffer: ArrayBuffer; readonly name?: string }
	| { readonly kind: 'export'; readonly snapshot: PeakSheetDatasetSnapshot };

export type PeakSheetXlsxWorkerResponse = DisposableWorkerResponse<PeakSheetWorkbookDraft | ArrayBuffer>;
