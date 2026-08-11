import mammoth from 'mammoth';

import { runBinaryDocumentTextWorker } from './runBinaryDocumentTextWorker';

runBinaryDocumentTextWorker(async (arrayBuffer) => {
	const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
	return result.value;
});
