import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import Database from 'better-sqlite3';
import type { DocChunkInput, DocChunkOutput, FtsInsertParams, FtsSearchResult } from './types';
import type { SearchScopeMode, SearchScopeValue } from '@/service/search/types';

type BetterSqlite3Database = Database.Database;

/**
 * CRUD repository for `doc_chunk` table and FTS5 virtual table.
 */
export class DocChunkRepo {
	constructor(
		private readonly db: Kysely<DbSchema>,
		private readonly rawDb: BetterSqlite3Database,
	) {}

	/**
	 * Delete chunks by doc_id.
	 */
	async deleteByDocId(docId: string): Promise<void> {
		await this.db.deleteFrom('doc_chunk').where('doc_id', '=', docId).execute();
	}

	/**
	 * Delete chunks by doc_ids (batch).
	 */
	async deleteByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;
		await this.db.deleteFrom('doc_chunk').where('doc_id', 'in', docIds).execute();
	}

	/**
	 * Delete FTS rows by doc_id.
	 */
	deleteFtsByDocId(docId: string): void {
		const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id = ?`);
		stmt.run(docId);
	}

	/**
	 * Delete FTS rows by doc_ids (batch).
	 */
	deleteFtsByDocIds(docIds: string[]): void {
		if (!docIds.length) return;
		const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id IN (${docIds.map(() => '?').join(',')})`);
		stmt.run(...docIds);
	}

	/**
	 * Insert FTS row.
	 */
	insertFts(params: FtsInsertParams): void {
		const stmt = this.rawDb.prepare(`
			INSERT INTO doc_fts (chunk_id, doc_id, path, title, content)
			VALUES (@chunk_id, @doc_id, @path, @title, @content)
		`);
		stmt.run(params);
	}

	/**
	 * Upsert chunk.
	 */
	async upsertChunk(chunk: DocChunkInput): Promise<void> {
		await this.db
			.insertInto('doc_chunk')
			.values({
				chunk_id: chunk.chunk_id,
				doc_id: chunk.doc_id,
				chunk_index: chunk.chunk_index,
				title: chunk.title,
				mtime: chunk.mtime,
				content_raw: chunk.content_raw,
				content_fts_norm: chunk.content_fts_norm,
			})
			.onConflict((oc) =>
				oc.column('chunk_id').doUpdateSet({
					doc_id: (eb) => eb.ref('excluded.doc_id'),
					chunk_index: (eb) => eb.ref('excluded.chunk_index'),
					title: (eb) => eb.ref('excluded.title'),
					mtime: (eb) => eb.ref('excluded.mtime'),
					content_raw: (eb) => eb.ref('excluded.content_raw'),
					content_fts_norm: (eb) => eb.ref('excluded.content_fts_norm'),
				}),
			)
			.execute();
	}

	/**
	 * Get chunk data by chunk IDs from FTS table.
	 * Note: This returns normalized content from FTS table, not raw content from doc_chunk.
	 */
	async getByChunkIds(chunkIds: string[]): Promise<Array<{
		chunk_id: string;
		doc_id: string;
		title: string | null;
		content_raw: string;
		mtime: number | null;
	}>> {
		if (!chunkIds.length) return [];
		const placeholders = chunkIds.map(() => '?').join(',');
		const stmt = this.rawDb.prepare(`
			SELECT
				f.chunk_id,
				f.doc_id,
				f.title,
				f.content as content_raw,
				NULL as mtime
			FROM doc_fts f
			WHERE f.chunk_id IN (${placeholders})
		`);
		const rows = stmt.all(...chunkIds) as Array<{
			chunk_id: string;
			doc_id: string;
			title: string | null;
			content_raw: string;
			mtime: number | null;
		}>;
		return rows;
	}

	/**
	 * Search FTS (full-text search).
	 * Returns chunk_id, doc_id, and path. Caller should fetch doc_meta separately to avoid JOIN.
	 * 
	 * @param term - Search term (normalized for FTS)
	 * @param limit - Maximum number of results
	 * @param scopeMode - Scope mode for filtering
	 * @param scopeValue - Scope value for filtering
	 */
	searchFts(
		term: string,
		limit: number,
		scopeMode?: SearchScopeMode,
		scopeValue?: SearchScopeValue,
	): Array<{
		chunkId: string;
		docId: string;
		path: string;
		title: string | null;
		content: string;
		bm25: number;
	}> {
		// Build path filter condition based on scope
		let pathFilter = '';
		const pathParams: string[] = [];

		if (scopeMode === 'inFile' && scopeValue?.currentFilePath) {
			pathFilter = 'AND f.path = ?';
			pathParams.push(scopeValue.currentFilePath);
		} else if (scopeMode === 'inFolder' && scopeValue?.folderPath) {
			const folderPath = scopeValue.folderPath;
			pathFilter = 'AND (f.path = ? OR f.path LIKE ?)';
			pathParams.push(folderPath, `${folderPath}/%`);
		}

		const sql = `
			SELECT
				f.chunk_id as chunkId,
				f.doc_id as docId,
				f.path as path,
				f.title as title,
				f.content as content,
				bm25(doc_fts) as bm25
			FROM doc_fts f
			WHERE doc_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
		const stmt = this.rawDb.prepare(sql);
		return stmt.all(term, ...pathParams, limit) as Array<{
			chunkId: string;
			docId: string;
			path: string;
			title: string | null;
			content: string;
			bm25: number;
		}>;
	}
}

