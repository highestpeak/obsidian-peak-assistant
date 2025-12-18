/**
 * Lightweight RPC protocol between main thread and the Search Worker.
 *
 * Design goals:
 * - Typed request/response payloads
 * - No dependency on any specific RPC framework
 * - Friendly to large payload batching
 */

import type { AiAnalyzeRequest, AiAnalyzeResult, SearchQuery, SearchResponse } from '@/service/search/types';

/**
 * Document metadata for indexing.
 */
export interface IndexableDocument {
	path: string;
	title: string;
	type: string;
	content: string;
	mtime: number;
}

/**
 * Request payload types for each handler.
 */
export interface InitRequest {
	vaultId: string;
	settings?: Record<string, unknown>;
	storageBytes?: {
		sqlite?: ArrayBuffer | null;
		orama?: string | null;
		graph?: string | null;
	};
}

export interface IndexDocumentsRequest {
	docs: IndexableDocument[];
}

export interface DeleteDocumentsRequest {
	paths: string[];
}

export interface RecordOpenRequest {
	path: string;
	ts?: number;
}

export interface GetRecentRequest {
	topK?: number;
}

/**
 * Index status response payload.
 *
 * Notes:
 * - `indexBuiltAt` is persisted in sqlite `index_state` so it survives restarts.
 * - `indexedDocs` is best-effort and may be missing if index was built by older versions.
 */
export interface GetIndexStatusResponse {
	indexBuiltAt: number | null;
	indexedDocs: number | null;
	isReady: boolean;
}

export interface ResetIndexRequest {
	/**
	 * If true, also clears recent_open signals.
	 */
	clearRecent?: boolean;
}

export type StorageType = 'sqlite' | 'orama' | 'graph';

export interface ExportStorageRequest {
	types?: StorageType[]; // If not specified or empty, export all types
}

/**
 * Response payload types for each handler.
 */
export interface OkResponse {
	ok: true;
}

export interface GetRecentResponse {
	items: SearchResponse['items'];
}

export interface GetIndexedPathsResponse {
	paths: Array<{ path: string; mtime: number }>;
}

export interface ExportStorageResponse {
	sqlite?: ArrayBuffer;
	orama?: string;
	graph?: string;
}

/**
 * Union type of all worker requests.
 */
export type WorkerRequest =
	| { kind: 'init'; payload: InitRequest }
	| { kind: 'indexDocuments'; payload: IndexDocumentsRequest }
	| { kind: 'deleteDocuments'; payload: DeleteDocumentsRequest }
	| { kind: 'search'; payload: SearchQuery }
	| { kind: 'aiAnalyze'; payload: AiAnalyzeRequest }
	| { kind: 'recordOpen'; payload: RecordOpenRequest }
	| { kind: 'getRecent'; payload: GetRecentRequest }
	| { kind: 'getIndexStatus'; payload: Record<string, never> }
	| { kind: 'getIndexedPaths'; payload: Record<string, never> }
	| { kind: 'resetIndex'; payload: ResetIndexRequest }
	| { kind: 'exportStorage'; payload: ExportStorageRequest };

/**
 * Union type of all worker responses.
 */
export type WorkerResponse =
	| { kind: 'ok'; payload: OkResponse }
	| { kind: 'search'; payload: SearchResponse }
	| { kind: 'aiAnalyze'; payload: AiAnalyzeResult }
	| { kind: 'recent'; payload: GetRecentResponse }
	| { kind: 'indexStatus'; payload: GetIndexStatusResponse }
	| { kind: 'indexedPaths'; payload: GetIndexedPathsResponse }
	| { kind: 'exportStorage'; payload: ExportStorageResponse };

export interface RpcEnvelope<T> {
	/**
	 * Correlation id for request/response matching.
	 */
	id: string;
	/**
	 * Discriminator for request/response routing.
	 */
	kind: T extends WorkerRequest ? WorkerRequest['kind'] : WorkerResponse['kind'];
	/**
	 * Typed payload.
	 */
	payload: any;
}

export type RpcRequestEnvelope = RpcEnvelope<WorkerRequest> & { kind: WorkerRequest['kind']; payload: WorkerRequest['payload'] };
export type RpcResponseEnvelope = RpcEnvelope<WorkerResponse> & { kind: WorkerResponse['kind']; payload: WorkerResponse['payload'] };

/**
 * Standard RPC error envelope. The worker should prefer returning this over throwing.
 */
export interface RpcErrorEnvelope {
	id: string;
	kind: 'error';
	error: {
		message: string;
		code?: string;
		stack?: string;
	};
}

export type RpcAnyResponse = RpcResponseEnvelope | RpcErrorEnvelope;


