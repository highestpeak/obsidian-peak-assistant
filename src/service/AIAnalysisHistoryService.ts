import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { onAnalysisComplete } from '@/service/context/PatternDiscoveryTrigger';

/** Record shape for AI analysis history list (matches ai_analysis_record). */
export type AIAnalysisHistoryRecord = DbSchema['ai_analysis_record'];

/** Sqlite-backed AI analysis history service. Instance is provided via AppContext. */
export class AIAnalysisHistoryService {
	async list(params: { limit: number; offset: number }): Promise<AIAnalysisHistoryRecord[]> {
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.list(params) as Promise<AIAnalysisHistoryRecord[]>;
	}

	async count(): Promise<number> {
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.count();
	}

	async insertOrIgnore(record: AIAnalysisHistoryRecord): Promise<void> {
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		await repo.insertOrIgnore(record as any);
		onAnalysisComplete();
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
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		return repo.frequentQueries(limit);
	}

	async deleteAll(): Promise<void> {
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		await repo.deleteAll();
	}

	/**
	 * Finds the most relevant AI Graph analysis for the given query.
	 * Filters to aiGraph preset, scores by keyword overlap, returns best match.
	 */
	async findRelatedAIGraph(query: string): Promise<AIAnalysisHistoryRecord | null> {
		if (!query.trim()) return null;
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
