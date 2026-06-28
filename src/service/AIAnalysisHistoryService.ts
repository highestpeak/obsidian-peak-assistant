import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { onAnalysisComplete } from '@/service/context/PatternDiscoveryTrigger';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';

/** Record shape for AI analysis history list (matches ai_analysis_record). */
export type AIAnalysisHistoryRecord = DbSchema['ai_analysis_record'];

/** Sqlite-backed AI analysis history service. Instance is provided via AppContext. */
export class AIAnalysisHistoryService {
	/**
	 * Lazy prompter resolver — boot order means the AIServiceManager doesn't
	 * exist when this service is constructed (it's wired before the manager
	 * so the manager can take a narrow `AnalysisHistoryPort`). The caller
	 * sets a getter once the manager exists; `null` means the manager isn't
	 * wired yet (skips pattern discovery for that round).
	 */
	private prompterProvider: () => IAgentPrompter | null = () => null;

	setPrompterProvider(provider: () => IAgentPrompter | null): void {
		this.prompterProvider = provider;
	}

	private get dbReady(): boolean {
		return sqliteStoreManager.isInitialized();
	}

	async list(params: { limit: number; offset: number }): Promise<AIAnalysisHistoryRecord[]> {
		if (!this.dbReady) return [];
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.list(params) as Promise<AIAnalysisHistoryRecord[]>;
	}

	async count(): Promise<number> {
		if (!this.dbReady) return 0;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.count();
	}

	async search(query: string, params: { limit: number; offset: number }): Promise<AIAnalysisHistoryRecord[]> {
		if (!this.dbReady) return [];
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.search(query, params) as Promise<AIAnalysisHistoryRecord[]>;
	}

	async searchCount(query: string): Promise<number> {
		if (!this.dbReady) return 0;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.searchCount(query);
	}

	async insertOrIgnore(record: AIAnalysisHistoryRecord): Promise<void> {
		if (!this.dbReady) return;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		await repo.insertOrIgnore(record as any);
		onAnalysisComplete(this.prompterProvider());
		try {
			await sqliteStoreManager.getMobiusOperationRepo().insertAiAnalysisOperation({
				recordId: record.id,
				createdAtTs: record.created_at_ts,
				vaultRelPath: record.vault_rel_path,
				query: record.query,
				title: record.title,
			});
		} catch (e) {
			console.debug('[AIAnalysisHistoryService] mobius_operation insert skipped:', e);
		}
	}

	async frequentQueries(limit = 5): Promise<Array<{ query: string; count: number }>> {
		if (!this.dbReady) return [];
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.frequentQueries(limit);
	}

	async deleteAll(): Promise<void> {
		if (!this.dbReady) return;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		await repo.deleteAll();
	}

	/**
	 * Finds the most relevant AI Graph analysis for the given query.
	 * Filters to aiGraph preset, scores by keyword overlap, returns best match.
	 */
	async findRelatedAIGraph(query: string): Promise<AIAnalysisHistoryRecord | null> {
		if (!query.trim() || !this.dbReady) return null;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		const rows = await repo.list({ limit: 20, offset: 0 }) as AIAnalysisHistoryRecord[];
		const graphRows = rows.filter((r) => r.analysis_preset === 'aiGraph');
		if (graphRows.length === 0) return null;
		const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
		for (const row of graphRows) {
			const rq = (row.query ?? '').toLowerCase();
			if (keywords.some((kw) => rq.includes(kw))) return row;
		}
		return graphRows[0] ?? null;
	}
}
