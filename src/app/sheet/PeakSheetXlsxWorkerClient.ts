import path from 'node:path';

import type { PeakSheetXlsxPort } from '@/core/ports/PeakSheetToolPort';
import type { PeakSheetDatasetSnapshot, PeakSheetWorkbookDraft } from '@/core/sheet';
import { DisposableWorkerTaskClient } from '@/app/platform/worker/DisposableWorkerTaskClient';

export const PEAK_SHEET_XLSX_WORKER_FILENAME = 'peak-sheet-xlsx-worker.js';

/**
 * Runs one XLSX operation per Node Worker isolate. The result is not exposed
 * until terminate() completes, so ExcelJS and its zip/fs dependency graph
 * cannot become long-lived renderer state.
 */
export class PeakSheetXlsxWorkerClient extends DisposableWorkerTaskClient implements PeakSheetXlsxPort {
	static fromPluginDirectory(pluginDirectory: string): PeakSheetXlsxWorkerClient {
		return new PeakSheetXlsxWorkerClient(path.join(pluginDirectory, PEAK_SHEET_XLSX_WORKER_FILENAME));
	}

	constructor(private readonly workerScriptPath: string) {
		super();
	}

	preview(buffer: ArrayBuffer, name?: string): Promise<PeakSheetWorkbookDraft> {
		return this.runWorkerTask(this.workerScriptPath, { kind: 'preview', buffer, name }, [buffer]);
	}

	export(snapshot: PeakSheetDatasetSnapshot): Promise<ArrayBuffer> {
		return this.runWorkerTask(this.workerScriptPath, { kind: 'export', snapshot });
	}
}
