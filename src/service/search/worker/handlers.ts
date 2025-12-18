import type { AiAnalyzeRequest, AiAnalyzeResult, SearchQuery, SearchResponse } from '@/service/search/types';
import type { WorkerContext } from '@/service/search/worker/context';
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
	OkResponse,
	RecordOpenRequest,
	ResetIndexRequest,
	StorageType,
} from '@/service/search/worker/types-rpc';

const INDEX_STATE_KEYS = {
	builtAt: 'index_built_at',
	indexedDocs: 'indexed_docs',
} as const;

/**
 * Worker request handlers. Each handler is pure-ish and only talks to WorkerContext + SearchEngine.
 */
export class WorkerHandlers {
	private readonly ctx: WorkerContext;

	constructor(ctx: WorkerContext) {
		this.ctx = ctx;
	}

	async init(payload: InitRequest): Promise<OkResponse> {
		this.ctx.setVaultId(payload?.vaultId ?? null);
		await this.ctx.initDatabase({ storageBytes: payload?.storageBytes });
		await this.ctx.initRepos();
		return { ok: true } as const;
	}

	async indexDocuments(payload: IndexDocumentsRequest): Promise<OkResponse> {
		const orama = await this.ctx.getOrama();
		const graph = this.ctx.getGraph();
		const docMetaRepo = this.ctx.getDocMetaRepo();
		const indexState = this.ctx.getIndexStateRepo();

		const docs = (payload?.docs ?? []).map((d) => ({
			id: d.path,
			path: d.path,
			title: d.title,
			type: d.type ?? 'markdown',
			content: d.content ?? '',
			mtime: d.mtime ?? 0,
		}));
		if (docs.length) {
			await orama.insertDocuments(docs);
			this.ctx.markIndexed(docs.length);
			for (const d of docs) docMetaRepo.upsert(d);
			for (const d of docs) {
				if (d.type === 'markdown') {
					graph.upsertMarkdownDocument({ path: d.path, content: d.content ?? '' });
				}
			}
			// Persist minimal index status for startup prompt decisions.
			const now = Date.now();
			const prevBuiltAt = indexState.get(INDEX_STATE_KEYS.builtAt);
			if (!prevBuiltAt) {
				indexState.set(INDEX_STATE_KEYS.builtAt, String(now));
			}
			const prevCount = Number(indexState.get(INDEX_STATE_KEYS.indexedDocs) ?? 0);
			indexState.set(INDEX_STATE_KEYS.indexedDocs, String(prevCount + docs.length));
		}
		return { ok: true } as const;
	}

	async deleteDocuments(payload: DeleteDocumentsRequest): Promise<OkResponse> {
		await this.ctx.initRepos();
		const orama = await this.ctx.getOrama();
		const graph = this.ctx.getGraph();
		const paths = (payload?.paths ?? []) as string[];
		await orama.removeDocuments(paths);
		// Keep sqlite + graph consistent.
		this.ctx.getDocMetaRepo().deleteByPaths(paths);
		this.ctx.getRecentOpenRepo().deleteByPaths(paths);
		for (const p of paths) {
			graph.removeFile({ path: p });
		}
		return { ok: true } as const;
	}

	async recordOpen(payload: RecordOpenRequest): Promise<OkResponse> {
		const path = payload?.path as string;
		if (path) {
			this.ctx.getRecentOpenRepo().recordOpen(path, Number(payload?.ts ?? Date.now()));
		}
		return { ok: true } as const;
	}

	async getRecent(payload: GetRecentRequest): Promise<GetRecentResponse> {
		const rows = this.ctx.getRecentOpenRepo().getRecentWithMeta(Number(payload?.topK ?? 20));
		const items = rows.map((r) => ({
			id: r.path,
			type: r.type as any,
			title: r.title,
			path: r.path,
			lastModified: r.mtime,
			snippet: null,
		}));
		return { items };
	}

	async getIndexStatus(): Promise<GetIndexStatusResponse> {
		await this.ctx.initRepos();
		const repo = this.ctx.getIndexStateRepo();
		const builtAtRaw = repo.get(INDEX_STATE_KEYS.builtAt);
		const indexedRaw = repo.get(INDEX_STATE_KEYS.indexedDocs);
		const indexBuiltAt = builtAtRaw != null ? Number(builtAtRaw) : null;
		const indexedDocs = indexedRaw != null ? Number(indexedRaw) : null;
		return {
			indexBuiltAt: Number.isFinite(indexBuiltAt as any) ? indexBuiltAt : null,
			indexedDocs: Number.isFinite(indexedDocs as any) ? indexedDocs : null,
			isReady: this.ctx.getIndexReady() || Boolean(builtAtRaw),
		};
	}

	async getIndexedPaths(): Promise<GetIndexedPathsResponse> {
		await this.ctx.initRepos();
		const docMetaRepo = this.ctx.getDocMetaRepo();
		const indexedMap = docMetaRepo.getAllIndexedPaths();
		const paths = Array.from(indexedMap.entries()).map(([path, mtime]) => ({ path, mtime }));
		return { paths };
	}

	async resetIndex(payload: ResetIndexRequest): Promise<OkResponse> {
		await this.ctx.initRepos();
		await this.ctx.resetIndex({ clearRecent: payload?.clearRecent ?? true });
		return { ok: true } as const;
	}

	async search(payload: SearchQuery): Promise<SearchResponse> {
		const engine = await this.ctx.getSearchEngine();
		return await engine.search({ query: payload });
	}

	async aiAnalyze(payload: AiAnalyzeRequest): Promise<AiAnalyzeResult> {
		const engine = await this.ctx.getSearchEngine();
		return await engine.aiAnalyze({ req: payload });
	}

	async exportStorage(payload: ExportStorageRequest): Promise<ExportStorageResponse> {
		const types = payload?.types ?? ['sqlite', 'orama', 'graph'];
		const result: ExportStorageResponse = {};

		if (types.includes('sqlite')) {
			const sqlite = await this.ctx.getSqlite();
			result.sqlite = sqlite.exportBytes();
		}

		if (types.includes('orama')) {
			const orama = await this.ctx.getOrama();
			result.orama = await orama.save();
		}

		if (types.includes('graph')) {
			const graph = this.ctx.getGraph();
			result.graph = graph.save();
		}

		return result;
	}
}


