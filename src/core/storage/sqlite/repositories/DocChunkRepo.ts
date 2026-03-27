import type { Kysely } from 'kysely';
import { GraphNodeType, GRAPH_INDEXED_NOTE_NODE_TYPES } from '@/core/po/graph.po';
import type { Database as DbSchema } from '../ddl';
import type { SqliteDatabase } from '../types';
import type { DocChunkInput, DocChunkOutput, FtsInsertParams, FtsMetaInsertParams, FtsSearchResult } from './types';
import type { SearchScopeMode, SearchScopeValue } from '@/service/search/types';

/**
 * CRUD repository for `doc_chunk` table and FTS5 virtual table.
 */
export class DocChunkRepo {
	constructor(
		private readonly db: Kysely<DbSchema>,
		private readonly rawDb: SqliteDatabase,
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
	 * Delete all chunks.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('doc_chunk').execute();
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
	 * Delete meta FTS row by doc_id.
	 */
	deleteMetaFtsByDocId(docId: string): void {
		const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
		stmt.run(docId);
	}

	/**
	 * Delete meta FTS rows by doc_ids (batch).
	 */
	deleteMetaFtsByDocIds(docIds: string[]): void {
		if (!docIds.length) return;
		const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id IN (${docIds.map(() => '?').join(',')})`);
		stmt.run(...docIds);
	}

	/**
	 * Delete all FTS rows.
	 */
	deleteAllFts(): void {
		const stmt = this.rawDb.prepare(`DELETE FROM doc_fts`);
		stmt.run();
	}

	/**
	 * Delete all meta FTS rows.
	 */
	deleteAllMetaFts(): void {
		const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts`);
		stmt.run();
	}

	/**
	 * Remove orphan doc_meta_fts rows (doc_id not linked to a document mobius node).
	 */
	cleanupOrphanMetaFts(): number {
		const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => '?').join(', ');
		const stmt = this.rawDb.prepare(
			`DELETE FROM doc_meta_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`,
		);
		const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
		return result.changes;
	}

	/**
	 * Remove orphan doc_fts rows (doc_id not linked to a document mobius node).
	 */
	cleanupOrphanFts(): number {
		const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => '?').join(', ');
		const stmt = this.rawDb.prepare(
			`DELETE FROM doc_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`,
		);
		const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
		return result.changes;
	}

	/**
	 * Remove orphan doc_chunk rows (doc_id not linked to a document mobius node).
	 */
	async cleanupOrphanChunks(): Promise<number> {
		const result = await this.db
			.deleteFrom('doc_chunk')
			.where(
				'doc_id',
				'not in',
				this.db
					.selectFrom('mobius_node')
					.select('node_id')
					.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES]),
			)
			.executeTakeFirst();
		return Number((result as { numDeletedRows: bigint })?.numDeletedRows ?? 0);
	}

	/**
	 * Insert FTS row.
	 */
	/**
	 * Insert FTS row for content.
	 */
	insertFts(params: FtsInsertParams): void {
		const stmt = this.rawDb.prepare(`
			INSERT INTO doc_fts (chunk_id, doc_id, content)
			VALUES (@chunk_id, @doc_id, @content)
		`);
		stmt.run(params);
	}

	/**
	 * Insert FTS row for document metadata (title/path).
	 * Only one row per document.
	 */
	insertMetaFts(params: FtsMetaInsertParams): void {
		const stmt = this.rawDb.prepare(`
			INSERT INTO doc_meta_fts (doc_id, path, title)
			VALUES (@doc_id, @path, @title)
		`);
		stmt.run(params);
	}

	/**
	 * Replace meta FTS row for a document (e.g. after vault rename). FTS5 has no in-place path update.
	 */
	replaceMetaFts(params: FtsMetaInsertParams): void {
		const del = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
		del.run(params.doc_id);
		this.insertMetaFts(params);
	}

	/**
	 * Check if chunk exists by chunk_id.
	 */
	async existsByChunkId(chunkId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('doc_chunk')
			.select('chunk_id')
			.where('chunk_id', '=', chunkId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new chunk.
	 */
	async insert(chunk: DocChunkInput): Promise<void> {
		await this.db
			.insertInto('doc_chunk')
			.values({
				chunk_id: chunk.chunk_id,
				doc_id: chunk.doc_id,
				chunk_index: chunk.chunk_index,
				chunk_type: chunk.chunk_type,
				chunk_meta_json: chunk.chunk_meta_json,
				title: chunk.title,
				mtime: chunk.mtime,
				content_raw: chunk.content_raw,
				content_fts_norm: chunk.content_fts_norm,
			})
			.execute();
	}

	/**
	 * Update existing chunk by chunk_id.
	 */
	async updateByChunkId(
		chunkId: string,
		updates: Partial<
			Pick<
				DbSchema['doc_chunk'],
				'doc_id' | 'chunk_index' | 'chunk_type' | 'chunk_meta_json' | 'title' | 'mtime' | 'content_raw' | 'content_fts_norm'
			>
		>,
	): Promise<void> {
		await this.db
			.updateTable('doc_chunk')
			.set(updates)
			.where('chunk_id', '=', chunkId)
			.execute();
	}

	/**
	 * Upsert chunk.
	 */
	async upsertChunk(chunk: DocChunkInput): Promise<void> {
		const exists = await this.existsByChunkId(chunk.chunk_id);

		if (exists) {
			// Update existing chunk
			await this.updateByChunkId(chunk.chunk_id, {
				doc_id: chunk.doc_id,
				chunk_index: chunk.chunk_index,
				chunk_type: chunk.chunk_type,
				chunk_meta_json: chunk.chunk_meta_json,
				title: chunk.title,
				mtime: chunk.mtime,
				content_raw: chunk.content_raw,
				content_fts_norm: chunk.content_fts_norm,
			});
		} else {
			// Insert new chunk
			await this.insert(chunk);
		}
	}

	/**
	 * Chunk rows for resolving vector hits. Prefers `doc_chunk` (SSOT); falls back to `doc_fts` for legacy rows.
	 */
	async getByChunkIds(chunkIds: string[]): Promise<
		Array<{
			chunk_id: string;
			doc_id: string;
			chunk_type: string;
			title: string | null;
			content_raw: string;
			mtime: number | null;
		}>
	> {
		if (!chunkIds.length) return [];
		const rows = await this.db
			.selectFrom('doc_chunk')
			.select(['chunk_id', 'doc_id', 'chunk_type', 'title', 'content_raw', 'mtime'])
			.where('chunk_id', 'in', chunkIds)
			.execute();
		const map = new Map(
			rows.map((r) => [
				r.chunk_id,
				{
					...r,
					content_raw: r.content_raw ?? '',
				},
			]),
		);
		const missing = chunkIds.filter((id) => !map.has(id));
		if (missing.length) {
			const placeholders = missing.map(() => '?').join(',');
			const stmt = this.rawDb.prepare(`
				SELECT chunk_id, doc_id, content AS content_raw
				FROM doc_fts
				WHERE chunk_id IN (${placeholders})
			`);
			const ftsRows = stmt.all(...missing) as Array<{
				chunk_id: string;
				doc_id: string;
				content_raw: string;
			}>;
			for (const fr of ftsRows) {
				map.set(fr.chunk_id, {
					chunk_id: fr.chunk_id,
					doc_id: fr.doc_id,
					chunk_type: 'body_raw',
					title: null,
					content_raw: fr.content_raw,
					mtime: null,
				});
			}
		}
		return chunkIds
			.map((id) => map.get(id))
			.filter((x): x is NonNullable<typeof x> => x != null);
	}

	/**
	 * Search FTS (full-text search).
	 * Returns chunk_id, doc_id, and path. Caller should fetch indexed document path/title separately to avoid JOIN.
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
		excludeFolderPrefixes?: string[],
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
			pathFilter = 'AND dm.path = ?';
			pathParams.push(scopeValue.currentFilePath);
		} else if (scopeMode === 'inFolder' && scopeValue?.folderPath) {
			const folderPath = (scopeValue.folderPath ?? '').trim().replace(/\/+$/, '') || undefined;
			if (folderPath) {
				pathFilter = 'AND (dm.path = ? OR dm.path LIKE ?)';
				pathParams.push(folderPath, `${folderPath}/%`);
			}
		}

		// Exclude paths under given folder prefixes (path = exact or path LIKE prefix/%)
		if (excludeFolderPrefixes?.length) {
			for (const p of excludeFolderPrefixes) {
				const folderLike = p.endsWith('/') ? p : p + '/';
				const exact = folderLike.slice(0, -1);
				pathFilter += ' AND NOT (dm.path LIKE ? OR dm.path = ?)';
				pathParams.push(`${folderLike}%`, exact);
			}
		}

		const sql = `
			SELECT
				f.chunk_id as chunkId,
				f.doc_id as docId,
				dm.path as path,
				dm.title as title,
				f.content as content,
				bm25(doc_fts) as bm25
			FROM doc_fts f
			INNER JOIN mobius_node dm ON f.doc_id = dm.node_id AND dm.type IN ('${GraphNodeType.Document}', '${GraphNodeType.HubDoc}')
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

	/**
	 * Search document metadata (title/path) using FTS5.
	 *
	 * @param term - Search term (normalized for FTS)
	 * @param limit - Maximum number of results
	 * @param scopeMode - Scope mode for filtering
	 * @param scopeValue - Scope value for filtering
	 */
	searchMetaFts(
		term: string,
		limit: number,
		scopeMode?: SearchScopeMode,
		scopeValue?: SearchScopeValue,
		excludeFolderPrefixes?: string[],
	): Array<{
		docId: string;
		path: string;
		title: string | null;
		bm25: number;
	}> {
		// Build path filter condition based on scope
		let pathFilter = '';
		const pathParams: string[] = [];

		if (scopeMode === 'inFile' && scopeValue?.currentFilePath) {
			pathFilter = 'AND mf.path = ?';
			pathParams.push(scopeValue.currentFilePath);
		} else if (scopeMode === 'inFolder' && scopeValue?.folderPath) {
			const folderPath = (scopeValue.folderPath ?? '').trim().replace(/\/+$/, '') || undefined;
			if (folderPath) {
				pathFilter = 'AND (mf.path = ? OR mf.path LIKE ?)';
				pathParams.push(folderPath, `${folderPath}/%`);
			}
		}

		// Exclude paths under given folder prefixes
		if (excludeFolderPrefixes?.length) {
			for (const p of excludeFolderPrefixes) {
				const folderLike = p.endsWith('/') ? p : p + '/';
				const exact = folderLike.slice(0, -1);
				pathFilter += ' AND NOT (mf.path LIKE ? OR mf.path = ?)';
				pathParams.push(`${folderLike}%`, exact);
			}
		}

		const sql = `
			SELECT
				mf.doc_id as docId,
				mf.path as path,
				mf.title as title,
				bm25(doc_meta_fts) as bm25
			FROM doc_meta_fts mf
			WHERE doc_meta_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
		const stmt = this.rawDb.prepare(sql);
		return stmt.all(term, ...pathParams, limit) as Array<{
			docId: string;
			path: string;
			title: string | null;
			bm25: number;
		}>;
	}
}

