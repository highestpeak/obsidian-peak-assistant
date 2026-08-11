import type { DisposableWorkerResponse } from '@/app/platform/worker/DisposableWorkerTaskClient';

export type BinaryDocumentTextWorkerRequest = { readonly buffer: ArrayBuffer };
export type BinaryDocumentTextWorkerResponse = DisposableWorkerResponse<string>;
