import { v4 as uuidv4 } from 'uuid';
import type { App } from 'obsidian';
import type { AiAnalyzeRequest, AiAnalyzeResult, SearchQuery, SearchResponse } from '@/service/search/types';
import type {
	DeleteDocumentsRequest,
	ExportStorageRequest,
	ExportStorageResponse,
	GetIndexStatusResponse,
	GetIndexedPathsResponse,
	GetRecentRequest,
	GetRecentResponse,
	IndexDocumentsRequest,
	InitRequest,
	IndexableDocument,
	RecordOpenRequest,
	RpcAnyResponse,
	RpcRequestEnvelope,
	RpcResponseEnvelope,
	StorageType,
	WorkerRequest,
	WorkerResponse,
} from '@/service/search/worker/types-rpc';

const PLUGIN_ID = 'obsidian-peak-assistant';

/**
 * SearchClient runs in the main thread and talks to the Search Worker via postMessage.
 * It provides a typed async API for UI and services.
 */
export class SearchClient {
	private worker: Worker | null = null;
	private readonly pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

	constructor(
		private readonly app: App,
		private readonly onAfterMutation?: (types: StorageType[]) => void,
	) {}

	/**
	 * Create a Web Worker pointing to the bundled `search-worker.js` file in the plugin folder.
	 */
	private createWorker(): Worker {
		const plugin = (this.app as any)?.plugins?.getPlugin?.(PLUGIN_ID);
		const pluginDir = plugin?.manifest?.dir as string | undefined;
		if (!pluginDir) {
			throw new Error(`Search worker cannot be created: plugin '${PLUGIN_ID}' not found`);
		}

		const workerPath = `${pluginDir}/search-worker.js`;
		const workerUrl = this.app.vault.adapter.getResourcePath(workerPath);

		// Use classic worker for maximal compatibility in Obsidian desktop/mobile.
		return new Worker(workerUrl);
	}

	/**
	 * Ensure the underlying worker is created and message handlers are registered.
	 */
	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = this.createWorker();
		worker.onmessage = (ev: MessageEvent<RpcAnyResponse>) => {
			const msg = ev.data;
			const id = (msg as any)?.id;
			if (!id) return;
			const pending = this.pending.get(id);
			if (!pending) return;
			this.pending.delete(id);

			if ((msg as any).kind === 'error') {
				const err = (msg as any).error;
				pending.reject(new Error(err?.message ?? 'Search worker error'));
				return;
			}
			pending.resolve((msg as RpcResponseEnvelope).payload);
		};
		worker.onerror = (ev) => {
			// Reject all inflight requests if the worker crashes.
			const error = new Error((ev as any)?.message ?? 'Search worker crashed');
			for (const [, pending] of this.pending) pending.reject(error);
			this.pending.clear();
		};
		this.worker = worker;
		return worker;
	}

	/**
	 * Send a request to worker and wait for the typed response payload.
	 */
	private call<K extends WorkerRequest['kind']>(
		kind: K,
		payload: Extract<WorkerRequest, { kind: K }>['payload'],
	): Promise<Extract<WorkerResponse, { kind: any }>['payload']> {
		const worker = this.ensureWorker();
		const id = uuidv4();
		const envelope: RpcRequestEnvelope = { id, kind, payload } as any;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			worker.postMessage(envelope);
		});
	}

	/**
	 * Initialize worker-side resources.
	 */
	async init(params: InitRequest): Promise<void> {
		await this.call('init', params);
	}

	/**
	 * Index a batch of documents. The main thread is responsible for reading vault content.
	 */
	async indexDocuments(docs: IndexableDocument[]): Promise<void> {
		const payload: IndexDocumentsRequest = { docs };
		await this.call('indexDocuments', payload);
		this.onAfterMutation?.(['sqlite', 'orama', 'graph']);
	}

	/**
	 * Remove documents by path.
	 */
	async deleteDocuments(paths: string[]): Promise<void> {
		const payload: DeleteDocumentsRequest = { paths };
		await this.call('deleteDocuments', payload);
		this.onAfterMutation?.(['sqlite', 'orama', 'graph']);
	}

	/**
	 * Execute a vault search query.
	 */
	async search(query: SearchQuery): Promise<SearchResponse> {
		const payload = (await this.call('search', query)) as SearchResponse;
		return payload;
	}

	/**
	 * Run AI analysis (RAG + optional web).
	 * The returned summary may be populated later by main thread LLM call in later phases.
	 */
	async aiAnalyze(req: AiAnalyzeRequest): Promise<AiAnalyzeResult> {
		return (await this.call('aiAnalyze', req)) as AiAnalyzeResult;
	}

	/**
	 * Record a file open event for ranking signals (recent/frequency).
	 */
	async recordOpen(path: string, ts?: number): Promise<void> {
		const payload: RecordOpenRequest = { path, ts };
		await this.call('recordOpen', payload);
		this.onAfterMutation?.(['sqlite']);
	}

	/**
	 * Fetch recent items (from SQLite signals inside worker).
	 */
	async getRecent(topK?: number): Promise<SearchResponse['items']> {
		const payload: GetRecentRequest = { topK };
		const result = (await this.call('getRecent', payload)) as GetRecentResponse;
		return result.items;
	}

	/**
	 * Get index status (built time, indexed count, ready state).
	 */
	async getIndexStatus(): Promise<GetIndexStatusResponse> {
		return (await this.call('getIndexStatus', {})) as GetIndexStatusResponse;
	}

	/**
	 * Get all indexed file paths with modification times.
	 */
	async getIndexedPaths(): Promise<Array<{ path: string; mtime: number }>> {
		const result = (await this.call('getIndexedPaths', {})) as GetIndexedPathsResponse;
		return result.paths;
	}

	/**
	 * Export worker-side storage bytes for persistence on main thread.
	 * @param types - Array of storage types to export. If not specified or empty, exports all types.
	 */
	async exportStorage(types?: StorageType[]): Promise<ExportStorageResponse> {
		const payload: ExportStorageRequest = { types };
		return (await this.call('exportStorage', payload)) as ExportStorageResponse;
	}

	/**
	 * Terminate the worker and reject inflight requests.
	 */
	dispose(): void {
		if (this.worker) {
			try {
				this.worker.terminate();
			} finally {
				this.worker = null;
			}
		}
		const error = new Error('Search client disposed');
		for (const [, pending] of this.pending) pending.reject(error);
		this.pending.clear();
	}
}


