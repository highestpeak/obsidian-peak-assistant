import officeParser from 'officeparser';

import { runBinaryDocumentTextWorker } from './runBinaryDocumentTextWorker';

runBinaryDocumentTextWorker((arrayBuffer) => officeParser.parseOfficeAsync(Buffer.from(arrayBuffer)));
