import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

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

	async deleteAll(): Promise<void> {
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		await repo.deleteAll();
	}
}
