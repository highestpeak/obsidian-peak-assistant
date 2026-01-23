import type { App } from 'obsidian';
import type {
	AiAnalyzeRequest,
	AiAnalyzeResult,
	SearchQuery,
	SearchResponse,
} from '@/service/search/types';
import type { StorageType } from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { QueryService } from './query/queryService';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';
import { AISearchService } from './aiSearch/aiSearchService';
import { StreamingCallbacks } from '../chat/types';

/**
 * SearchClient (main thread, Desktop-only).
 *
 * This replaces the old worker-based design so we can use file-backed SQLite
 * without importing/exporting the entire DB bytes.
 */
export class SearchClient {
	private queryService: QueryService | null = null;
	private aiSearchService: AISearchService | null = null;

	constructor(
		private readonly app: App,
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) { }

	/**
	 * Initialize the file-backed SQLite database.
	 * Note: sqliteStoreManager must be initialized before calling this method.
	 */
	async init(): Promise<void> {
		this.queryService = new QueryService(this.aiServiceManager, this.searchSettings);
		this.aiSearchService = new AISearchService(this.aiServiceManager, this.searchSettings);
	}

	async search(query: SearchQuery, enableLLMRerank: boolean = false): Promise<SearchResponse & { duration: number }> {
		if (!this.queryService) {
			throw new Error('SearchClient not initialized. Call init() first.');
		}

		// Execute search using the query service (ranking boosts are applied internally)
		return await this.queryService.textSearch(query, enableLLMRerank);
	}

	async vectorSearch(query: SearchQuery): Promise<SearchResponse & { duration: number }> {
		if (!this.queryService) {
			throw new Error('SearchClient not initialized. Call init() first.');
		}

		return await this.queryService.vectorSearch(query);
	}

	/**
	 * Execute AI analysis with optional streaming callbacks.
	 * @param req - AI analysis request
	 * @param callbacks - Optional streaming callbacks for progressive updates
	 * @returns AI analysis result with duration
	 * @deprecated use AISearchAgent instead.
	 */
	async aiAnalyze(
		req: AiAnalyzeRequest,
		callbacks?: StreamingCallbacks
	): Promise<AiAnalyzeResult & { duration: number }> {
		if (!this.aiSearchService) {
			throw new Error('SearchClient not initialized. Call init() first.');
		}

		const q = req?.query ?? '';
		const topK = Number(req?.topK ?? 8);
		const webEnabled = req?.webEnabled ?? false;

		try {
			// 1. Execute search with LLM reranking enabled for AI analysis
			const results = await this.search({ text: q, topK, searchMode: 'fulltext' } as any, true);
			// Mark all results as 'local' source (web results would be added separately)
			const sources = results.items.map(item => ({ ...item, source: 'local' as const }));
			const searchDuration = results.duration;

			// Notify sources are available immediately via callback
			callbacks?.onComplete?.('other', '', { sources, duration: searchDuration });

			// 2. Generate AI analysis (summary, graph, topics) - parallel execution where possible
			// Supports optional streaming callbacks for progressive updates
			const analysis = await this.aiSearchService.analyze({
				query: q,
				sources,
				webEnabled,
				callbacks,
			});

			const result = {
				...analysis,
				sources,
				duration: searchDuration,
			};

			return result;
		} catch (error) {
			callbacks?.onError?.('other', error);
			throw error;
		}
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

		// Create a map of docId to lastOpenTs for quick lookup
		const lastOpenTsById = new Map(recent.map((r) => [r.docId, r.lastOpenTs]));

		return recent.map((r) => {
			const meta = metaById.get(r.docId);
			return {
				id: r.docId,
				type: (meta?.type ?? 'markdown') as any,
				title: meta?.title ?? r.docId,
				path: meta?.path ?? r.docId,
				// Use lastOpenTs as lastModified for recently accessed files
				lastModified: lastOpenTsById.get(r.docId) ?? Number(meta?.mtime ?? 0),
				highlight: null,
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


