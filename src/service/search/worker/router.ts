/// <reference lib="webworker" />

import type { RpcAnyResponse, RpcErrorEnvelope, RpcRequestEnvelope, RpcResponseEnvelope, WorkerRequest } from '@/service/search/worker/types-rpc';
import { WorkerContext } from '@/service/search/worker/context';
import { WorkerHandlers } from '@/service/search/worker/handlers';

function postError(id: string, error: { message: string; code?: string; stack?: string }): void {
	const msg: RpcErrorEnvelope = { id, kind: 'error', error };
	(self as any).postMessage(msg);
}

function postResponse(
	id: string,
	kind: RpcResponseEnvelope['kind'],
	payload: any,
): void {
	const msg: RpcResponseEnvelope = { id, kind, payload } as any;
	(self as any).postMessage(msg);
}

/**
 * Install worker RPC router on global `self`.
 */
export function installWorkerRouter(): void {
	const ctx = new WorkerContext();
	const handlers = new WorkerHandlers(ctx);

	(self as any).onmessage = async (ev: MessageEvent<RpcRequestEnvelope>) => {
		const msg = ev.data;
		const id = msg?.id;
		if (!id) return;

		try {
			switch (msg.kind) {
				case 'init': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'init' }>['payload'];
					await handlers.init(payload);
					postResponse(id, 'ok', { ok: true });
					return;
				}
				case 'indexDocuments': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'indexDocuments' }>['payload'];
					await handlers.indexDocuments(payload);
					postResponse(id, 'ok', { ok: true });
					return;
				}
				case 'deleteDocuments': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'deleteDocuments' }>['payload'];
					await handlers.deleteDocuments(payload);
					postResponse(id, 'ok', { ok: true });
					return;
				}
				case 'recordOpen': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'recordOpen' }>['payload'];
					await handlers.recordOpen(payload);
					postResponse(id, 'ok', { ok: true });
					return;
				}
				case 'getRecent': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'getRecent' }>['payload'];
					const result = await handlers.getRecent(payload);
					postResponse(id, 'recent', result);
					return;
				}
				case 'getIndexStatus': {
					const result = await handlers.getIndexStatus();
					postResponse(id, 'indexStatus', result);
					return;
				}
				case 'getIndexedPaths': {
					const result = await handlers.getIndexedPaths();
					postResponse(id, 'indexedPaths', result);
					return;
				}
				case 'resetIndex': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'resetIndex' }>['payload'];
					await handlers.resetIndex(payload);
					postResponse(id, 'ok', { ok: true });
					return;
				}
				case 'search': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'search' }>['payload'];
					const result = await handlers.search(payload);
					postResponse(id, 'search', result);
					return;
				}
				case 'aiAnalyze': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'aiAnalyze' }>['payload'];
					const result = await handlers.aiAnalyze(payload);
					postResponse(id, 'aiAnalyze', result);
					return;
				}
				case 'exportStorage': {
					const payload = msg.payload as Extract<WorkerRequest, { kind: 'exportStorage' }>['payload'];
					const result = await handlers.exportStorage(payload);
					postResponse(id, 'exportStorage', result);
					return;
				}
				default: {
					postError(id, { message: `Unknown worker request kind: ${(msg as any).kind}` });
					return;
				}
			}
		} catch (e) {
			const err = e instanceof Error ? e : new Error('Worker error');
			postError(id, { message: err.message, stack: err.stack });
		}
	};
}


