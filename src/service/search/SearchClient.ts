import type { App } from 'obsidian';
import type {
	AiAnalyzeRequest,
	AiAnalyzeResult,
	SearchQuery,
	SearchResponse,
} from '@/service/search/types';
import type { StorageType } from '@/service/search/_deprecated/worker/types-rpc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { QueryService } from './query/queryService';
import { buildRagSources } from './query/ranking/rag-builder';

/**
 * SearchClient (main thread, Desktop-only).
 *
 * This replaces the old worker-based design so we can use file-backed SQLite
 * without importing/exporting the entire DB bytes.
 */
export class SearchClient {
	private queryService: QueryService | null = null;

	constructor(
		private readonly app: App,
		private readonly onAfterMutation?: (types: StorageType[]) => void,
	) {}

	/**
	 * Initialize the file-backed SQLite database.
	 * Note: sqliteStoreManager must be initialized before calling this method.
	 */
	async init(): Promise<void> {
		this.queryService = new QueryService();
	}
	
	async search(query: SearchQuery): Promise<SearchResponse> {
		if (!this.queryService) {
			throw new Error('SearchClient not initialized. Call init() first.');
		}

		const termRaw = query?.text ?? '';
		if (!termRaw) {
			return { query, items: [] };
		}

		// Execute search using the query service (ranking boosts are applied internally)
		return await this.queryService.executeSearch({ query });
	}

	async aiAnalyze(req: AiAnalyzeRequest): Promise<AiAnalyzeResult> {
		const q = req?.query ?? '';
		const topK = Number(req?.topK ?? 8);
		const results = await this.search({ text: q, topK, searchMode: 'fulltext' } as any);

		const hits = results.items.map((i) => ({
			path: i.path,
			title: i.title,
			content: i.snippet?.text ?? '',
			score: i.score ?? 0,
		}));

		const sources = buildRagSources({ hits, query: q });
		return {
			summary: '',
			sources,
			insights: { graph: { nodes: [], edges: [] } },
			usage: { estimatedTokens: 0 },
		};
	}

	async getRecent(topK?: number): Promise<SearchResponse['items']> {
		const docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const limit = Math.max(1, Number(topK ?? 20));
		const recent = await docStatisticsRepo.getRecent(limit);
		if (!recent.length) return [];
		
		// Fetch metadata separately (avoid JOIN)
		const docIds = recent.map((r) => r.docId);
		const metaRows = await docMetaRepo.getByIds(docIds);
		const metaById = new Map(metaRows.map((m) => [m.id, m]));
		
		return recent.map((r) => {
			const meta = metaById.get(r.docId);
			return {
				id: meta?.path ?? r.docId,
				type: (meta?.type ?? 'markdown') as any,
				title: meta?.title ?? r.docId,
				path: meta?.path ?? r.docId,
				lastModified: Number(meta?.mtime ?? 0),
				snippet: null,
				score: 0,
				finalScore: 0,
			};
		});
	}

	dispose(): void {
		// Note: We don't close the global singleton here as it may be used by other components.
		// The singleton should be closed at plugin unload.
	}
}


