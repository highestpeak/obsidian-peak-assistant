import path from 'node:path';

import { DisposableWorkerTaskClient } from '@/app/platform/worker/DisposableWorkerTaskClient';
import type {
	BinaryDocumentKind,
	BinaryDocumentTextExtractorPort,
} from '@/core/ports/BinaryDocumentTextExtractorPort';

const WORKER_FILENAMES: Readonly<Record<BinaryDocumentKind, string>> = {
	docx: 'document-docx-text-worker.js',
	pptx: 'document-pptx-text-worker.js',
};

export class BinaryDocumentTextWorkerClient
	extends DisposableWorkerTaskClient
	implements BinaryDocumentTextExtractorPort {

	constructor(private readonly pluginDirectory: string) {
		super();
	}

	extract(kind: BinaryDocumentKind, buffer: ArrayBuffer): Promise<string> {
		const workerScriptPath = path.join(this.pluginDirectory, WORKER_FILENAMES[kind]);
		return this.runWorkerTask(workerScriptPath, { buffer }, [buffer]);
	}
}
