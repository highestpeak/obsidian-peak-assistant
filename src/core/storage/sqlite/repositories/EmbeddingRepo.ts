import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { SqliteDatabase } from '../wa-sqlite-adapter/WaSqliteStore';
import type { SearchScopeMode, SearchScopeValue } from '@/service/search/types';

/**
 * CRUD repository for `embedding` table.
 */
export class EmbeddingRepo {
	constructor(
		private readonly db: Kysely<DbSchema>,
		private readonly rawDb: SqliteDatabase,
	) {}

	/**
	 * Convert number[] to Buffer (BLOB format).
	 */
	private arrayToBuffer(arr: number[]): Buffer {
		const buffer = Buffer.allocUnsafe(arr.length * 4); // 4 bytes per float32
		for (let i = 0; i < arr.length; i++) {
			buffer.writeFloatLE(arr[i], i * 4);
		}
		return buffer;
	}

	/**
	 * Convert Buffer (BLOB format) to number[].
	 */
	private bufferToArray(buffer: Buffer): number[] {
		const arr: number[] = [];
		for (let i = 0; i < buffer.length; i += 4) {
			arr.push(buffer.readFloatLE(i));
		}
		return arr;
	}

	/**
	 * Upsert an embedding record.
	 * 
	 * Also syncs the embedding vector to vec_embeddings virtual table for KNN search.
	 * vec_embeddings.rowid corresponds to embedding table's implicit rowid (integer).
	 * This allows direct association: we get embedding.rowid after insert, then use it as vec_embeddings.rowid.
	 * 
	 * Note: embedding table stores vectors as BLOB (binary format), while vec_embeddings virtual table
	 * uses JSON format (as required by sqlite-vec vec0).
	 */
	async upsert(embedding: {
		id: string;
		doc_id: string;
		chunk_id?: string | null;
		chunk_index?: number | null;
		path?: string | null;
		content_hash: string;
		ctime: number;
		mtime: number;
		embedding: number[]; // Accept number[] directly, convert to BLOB for storage
		embedding_model: string;
		embedding_len: number;
	}): Promise<void> {
		// Convert number[] to Buffer (BLOB)
		const embeddingBuffer = this.arrayToBuffer(embedding.embedding);
		
		// Check if embedding already exists
		const existingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE id = ?
		`);
		const existing = existingStmt.get(embedding.id) as { rowid: number } | undefined;

		let embeddingRowid: number;
		if (existing) {
			// Update existing embedding
			embeddingRowid = existing.rowid;
			await this.db
				.updateTable('embedding')
				.set({
					doc_id: embedding.doc_id,
					chunk_id: embedding.chunk_id ?? null,
					chunk_index: embedding.chunk_index ?? null,
					path: embedding.path ?? null,
					content_hash: embedding.content_hash,
					mtime: embedding.mtime,
					embedding: embeddingBuffer,
					embedding_model: embedding.embedding_model,
					embedding_len: embedding.embedding_len,
				})
				.where('id', '=', embedding.id)
				.execute();
		} else {
			// Insert new embedding
		await this.db
			.insertInto('embedding')
			.values({
				id: embedding.id,
				doc_id: embedding.doc_id,
				chunk_id: embedding.chunk_id ?? null,
				chunk_index: embedding.chunk_index ?? null,
				path: embedding.path ?? null,
				content_hash: embedding.content_hash,
				ctime: embedding.ctime,
				mtime: embedding.mtime,
				embedding: embeddingBuffer,
				embedding_model: embedding.embedding_model,
				embedding_len: embedding.embedding_len,
			})
				.execute();
			
			// Get the rowid of the newly inserted row
			const rowidStmt = this.rawDb.prepare(`
				SELECT rowid FROM embedding WHERE id = ?
			`);
			const row = rowidStmt.get(embedding.id) as { rowid: number };
			embeddingRowid = row.rowid;
		}

		// Sync to vec_embeddings virtual table using embedding.rowid as vec_embeddings.rowid
		// vec0 virtual table stores vectors as float[], we pass the same BLOB buffer
		// This avoids JSON serialization/deserialization overhead
		try {
			const vecStmt = this.rawDb.prepare(`
				INSERT INTO vec_embeddings(rowid, embedding)
				VALUES (?, ?)
				ON CONFLICT(rowid) DO UPDATE SET embedding = excluded.embedding
			`);
			// Pass BLOB directly - vec0 accepts binary format for float[]
			vecStmt.run(embeddingRowid, embeddingBuffer);
		} catch (error) {
			// Ignore errors if vec_embeddings table doesn't exist or sqlite-vec is not loaded
			console.warn('Failed to sync embedding to vec_embeddings:', error);
		}
	}

	/**
	 * Get embedding by ID.
	 */
	async getById(id: string): Promise<DbSchema['embedding'] | null> {
		const row = await this.db.selectFrom('embedding').selectAll().where('id', '=', id).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get embeddings by file ID.
	 */
	async getByDocId(docId: string): Promise<DbSchema['embedding'][]> {
		return await this.db.selectFrom('embedding').selectAll().where('doc_id', '=', docId).execute();
	}

	/**
	 * Get embeddings by IDs (batch).
	 * Used to fetch embedding records by their primary key (id).
	 * Returns embedding as Buffer (BLOB format).
	 */
	async getByIds(ids: string[]): Promise<Array<{ id: string; doc_id: string; chunk_id: string; embedding: Buffer }>> {
		if (!ids.length) return [];
		const rows = await this.db
			.selectFrom('embedding')
			.select(['id', 'doc_id', 'chunk_id', 'embedding'])
			.where('id', 'in', ids)
			.where('chunk_id', 'is not', null)
			.execute();
		return rows.filter((r): r is { id: string; doc_id: string; chunk_id: string; embedding: Buffer } => r.chunk_id != null);
	}

	/**
	 * Get embeddings by chunk IDs (batch).
	 * Returns embedding as Buffer (BLOB format).
	 */
	async getByChunkIds(chunkIds: string[]): Promise<Array<{ id: string; doc_id: string; chunk_id: string; embedding: Buffer }>> {
		if (!chunkIds.length) return [];
		const rows = await this.db
			.selectFrom('embedding')
			.select(['id', 'doc_id', 'chunk_id', 'embedding'])
			.where('chunk_id', 'in', chunkIds)
			.execute();
		return rows.filter((r): r is { id: string; doc_id: string; chunk_id: string; embedding: Buffer } => r.chunk_id != null);
	}

	/**
	 * Vector similarity search using sqlite-vec KNN search.
	 * 
	 * This uses the vec0 virtual table with MATCH operator for efficient KNN search
	 * without loading all embeddings into memory.
	 * 
	 * Explanation of rowid:
	 * - `rowid` is SQLite's implicit integer primary key for each table
	 * - vec_embeddings.rowid = embedding.rowid (they share the same rowid)
	 * - This allows direct association: we can use vec_embeddings.rowid to query embedding table
	 * 
	 * Why do we need vec_embeddings virtual table?
	 * - sqlite-vec requires a vec0 virtual table for KNN search (it provides optimized vector indexing)
	 * - vec_embeddings stores vectors as native float[] format for efficient KNN search
	 * - Both embedding table and vec_embeddings use BLOB format (binary float[]) for efficiency
	 * 
	 * @param queryEmbedding The query embedding vector (as number[] or Buffer)
	 * @param limit Maximum number of results to return
	 * @param scopeMode Optional scope mode for filtering
	 * @param scopeValue Optional scope value for filtering
	 * @returns Array of results with embedding_id (from embedding table) and distance
	 */
	searchSimilar(
		queryEmbedding: number[] | Buffer,
		limit: number,
		scopeMode?: SearchScopeMode,
		scopeValue?: SearchScopeValue,
	): Array<{
		embedding_id: string;
		distance: number;
	}> {
		// Convert to Buffer if needed (BLOB format for float[])
		const embeddingBuffer = Buffer.isBuffer(queryEmbedding)
			? queryEmbedding
			: this.arrayToBuffer(queryEmbedding);

		// Build path filter condition based on scope
		let pathFilter = '';
		const pathParams: string[] = [];

		if (scopeMode === 'inFile' && scopeValue?.currentFilePath) {
			pathFilter = 'AND e.path = ?';
			pathParams.push(scopeValue.currentFilePath);
		} else if (scopeMode === 'inFolder' && scopeValue?.folderPath) {
			const folderPath = scopeValue.folderPath;
			pathFilter = 'AND (e.path = ? OR e.path LIKE ?)';
			pathParams.push(folderPath, `${folderPath}/%`);
		}

		// Step 1: KNN search on vec_embeddings with JOIN to embedding table for path filtering
		// Returns vec_embeddings.rowid (integer) and distance
		// vec_embeddings.rowid = embedding.rowid
		// vec0 MATCH operator accepts BLOB format for float[]
		// We JOIN embedding table to filter by path before limiting results
		const sql = `
			SELECT
				ve.rowid,
				ve.distance
			FROM vec_embeddings ve
			INNER JOIN embedding e ON ve.rowid = e.rowid
			WHERE ve.embedding MATCH ?
			${pathFilter}
			ORDER BY ve.distance
			LIMIT ?
		`;
		const knnStmt = this.rawDb.prepare(sql);
		const knnResults = knnStmt.all(embeddingBuffer, ...pathParams, limit) as Array<{
			rowid: number;
			distance: number;
		}>;

		if (!knnResults.length) {
			return [];
		}

		// Step 2: Batch lookup embedding table to get embedding.id from rowid
		const rowids = knnResults.map((r) => r.rowid);
		const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid, id FROM embedding
			WHERE rowid IN (${rowids.map(() => '?').join(',')})
		`);
		const embeddings = embeddingStmt.all(...rowids) as Array<{
			rowid: number;
			id: string;
		}>;

		// Create map: rowid -> embedding.id
		const rowidToEmbeddingId = new Map(embeddings.map((e) => [e.rowid, e.id]));

		// Combine results
		return knnResults
			.map((r) => {
				const embeddingId = rowidToEmbeddingId.get(r.rowid);
				return embeddingId
					? {
							embedding_id: embeddingId,
							distance: r.distance,
						}
					: null;
			})
			.filter((r): r is { embedding_id: string; distance: number } => r !== null);
	}

	/**
	 * Get embeddings by file IDs (batch).
	 */
	async getByDocIds(docIds: string[]): Promise<Map<string, DbSchema['embedding'][]>> {
		if (!docIds.length) return new Map();
		const rows = await this.db.selectFrom('embedding').selectAll().where('doc_id', 'in', docIds).execute();
		const result = new Map<string, DbSchema['embedding'][]>();
		for (const row of rows) {
			const arr = result.get(row.doc_id) ?? [];
			arr.push(row);
			result.set(row.doc_id, arr);
		}
		return result;
	}

	/**
	 * Get embedding by chunk ID.
	 */
	async getByChunkId(chunkId: string): Promise<DbSchema['embedding'] | null> {
		const row = await this.db.selectFrom('embedding').selectAll().where('chunk_id', '=', chunkId).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get embedding by content hash.
	 */
	async getByContentHash(contentHash: string): Promise<DbSchema['embedding'] | null> {
		const row = await this.db.selectFrom('embedding').selectAll().where('content_hash', '=', contentHash).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Delete embeddings by file ID.
	 */
	async deleteByDocId(docId: string): Promise<void> {
		await this.db.deleteFrom('embedding').where('doc_id', '=', docId).execute();
	}

	/**
	 * Delete embeddings by doc IDs (batch).
	 */
	async deleteByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;
		await this.db.deleteFrom('embedding').where('doc_id', 'in', docIds).execute();
	}

	/**
	 * Delete embedding by ID.
	 */
	async deleteById(id: string): Promise<void> {
		await this.db.deleteFrom('embedding').where('id', '=', id).execute();
	}

	/**
	 * Delete embeddings by IDs (batch).
	 */
	async deleteByIds(ids: string[]): Promise<void> {
		if (!ids.length) return;
		await this.db.deleteFrom('embedding').where('id', 'in', ids).execute();
	}
}

