import { parentPort } from 'node:worker_threads';

import type {
	PeakSheetXlsxWorkerRequest,
	PeakSheetXlsxWorkerResponse,
} from './PeakSheetXlsxWorkerProtocol';
import { exportPeakSheetXlsx } from '@/service/sheet/export/PeakSheetXlsxExporter';
import { parsePeakSheetXlsx } from '@/service/sheet/import/PeakSheetXlsxImporter';

if (!parentPort) throw new Error('Peak Sheet XLSX worker requires a parent port.');

const port = parentPort;
port.once('message', (request: PeakSheetXlsxWorkerRequest) => {
	void execute(request)
		.then((value) => {
			const response: PeakSheetXlsxWorkerResponse = { ok: true, value };
			if (value instanceof ArrayBuffer) {
				port.postMessage(response, [value]);
				return;
			}
			port.postMessage(response);
		})
		.catch((error) => {
			const normalized = normalizeError(error);
			const response: PeakSheetXlsxWorkerResponse = { ok: false, error: normalized };
			port.postMessage(response);
		});
});

function execute(request: PeakSheetXlsxWorkerRequest) {
	if (request.kind === 'preview') return parsePeakSheetXlsx(request.buffer, request.name);
	if (request.kind === 'export') return exportPeakSheetXlsx(request.snapshot);
	throw new Error('Unknown Peak Sheet XLSX worker request.');
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
	if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
	return { name: 'Error', message: String(error) };
}
