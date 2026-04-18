import type { App } from 'obsidian';
import type {
	SearchQuery,
	SearchResponse,
} from '@/service/search/types';
import type { StorageType } from '@/service/search/index/indexService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { QueryService } from './query/queryService';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchSettings } from '@/app/settings/types';

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
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) { }

	/**
	 * Initialize the file-backed SQLite database.
	 * Note: sqliteStoreManager must be initialized before calling this method.
	 */
	async init(): Promise<void> {
		this.queryService = new QueryService(this.aiServiceManager, this.searchSettings);
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

	async getRecent(topK?: number): Promise<SearchResponse['items']> {
		const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
		const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
		const limit = Math.max(1, Number(topK ?? 20));
		const recent = await mobiusNodeRepo.getRecent(limit);
		if (!recent.length) return [];

		// Fetch metadata separately (avoid JOIN)
		const docIds = recent.map((r) => r.docId);
		const metaRows = await indexedDocumentRepo.getByIds(docIds);
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

	/**
	 * Release resources and services.
	 */
	dispose(): void {
		this.queryService = null;
	}
}


