import { parentPort } from 'node:worker_threads';

import type {
	BinaryDocumentTextWorkerRequest,
	BinaryDocumentTextWorkerResponse,
} from './BinaryDocumentTextWorkerProtocol';

export function runBinaryDocumentTextWorker(
	extract: (buffer: ArrayBuffer) => Promise<string>,
): void {
	if (!parentPort) throw new Error('Binary document text worker requires a parent port.');
	const port = parentPort;
	port.once('message', (request: BinaryDocumentTextWorkerRequest) => {
		void extract(request.buffer)
			.then((value) => {
				const response: BinaryDocumentTextWorkerResponse = { ok: true, value };
				port.postMessage(response);
			})
			.catch((error) => {
				const normalized = normalizeError(error);
				const response: BinaryDocumentTextWorkerResponse = { ok: false, error: normalized };
				port.postMessage(response);
			});
	});
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
	if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
	return { name: 'Error', message: String(error) };
}
