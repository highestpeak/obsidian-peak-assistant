import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export type DocumentAnalysisSummary = {
	id: string;
	vaultRelPath: string;
	query: string | null;
	title: string | null;
	createdAtTs: number;
	sourcesCount: number | null;
};

export class DocumentAnalysisAggregator {
	/**
	 * Find analyses related to a document path.
	 * Searches by document filename in the query field.
	 */
	async findForDocument(docPath: string, limit = 10): Promise<DocumentAnalysisSummary[]> {
		if (!sqliteStoreManager.isInitialized()) return [];
		const docName = docPath.split('/').pop() ?? docPath;
		const repo = sqliteStoreManager.getAIAnalysisRepo();
		const records = await repo.listByDocumentHint(docName, limit);
		return records.map(r => ({
			id: r.id,
			vaultRelPath: r.vault_rel_path,
			query: r.query,
			title: r.title,
			createdAtTs: r.created_at_ts,
			sourcesCount: r.sources_count,
		}));
	}
}
