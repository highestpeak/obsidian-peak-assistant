import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { SqliteDatabase } from '../types';
import type { SearchScopeMode, SearchScopeValue } from '@/service/search/types';
import { BusinessError, ErrorCode } from '@/core/errors';
import { DocMetaRepo } from './DocMetaRepo';

/**
 * CRUD repository for `embedding` table.
 */
export class EmbeddingRepo {
	// Cache for vec_embeddings table state (checked once on plugin startup)
	private vecEmbeddingsTableExists: boolean | null = null;
	private vecEmbeddingsTableDimension: number | null = null;

	constructor(
		private readonly db: Kysely<DbSchema>,
		private readonly rawDb: SqliteDatabase,
		private readonly docMetaRepo: DocMetaRepo,
	) { }

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
	 * Get embedding rowids by specific file paths.
	 */
	private async getEmbeddingRowidsByPath(paths: string[]): Promise<number[]> {
		const docIds = (await this.docMetaRepo.getIdsByPaths(paths)).map(d => d.id);
		return this.getEmbeddingRowidsByDocIds(docIds);
	}

	/**
	 * Get embedding rowids by folder path (including subfolders).
	 */
	private async getEmbeddingRowidsByFolder(folderPath: string): Promise<number[]> {
		const docIds = (await this.docMetaRepo.getByFolderPath(folderPath)).map(d => d.id);
		return this.getEmbeddingRowidsByDocIds(docIds);
	}

	/**
	 * Get embedding rowids by embedding IDs.
	 */
	private getEmbeddingRowidsByIds(ids: string[]): number[] {
		if (!ids.length) return [];

		const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE id IN (${ids.map(() => '?').join(',')})
		`);
		const embeddings = embeddingStmt.all(...ids) as Array<{ rowid: number }>;
		return embeddings.map(e => e.rowid);
	}

	/**
	 * Get embedding rowids by document IDs.
	 */
	private getEmbeddingRowidsByDocIds(docIds: string[]): number[] {
		if (!docIds.length) return [];

		const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE doc_id IN (${docIds.map(() => '?').join(',')})
		`);
		const embeddings = embeddingStmt.all(...docIds) as Array<{ rowid: number }>;
		return embeddings.map(e => e.rowid);
	}

	/**
	 * Initialize vec_embeddings table state cache.
	 * Should be called once on plugin startup to avoid frequent table checks.
	 */
	initializeVecEmbeddingsTableCache(): void {
		const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
		this.vecEmbeddingsTableExists = checkStmt.get() !== undefined;

		// If table exists, try to get dimension from table definition
		// Note: sqlite-vec doesn't expose dimension directly, so we'll check it during first insert
		if (this.vecEmbeddingsTableExists) {
			// Dimension will be validated on first insert attempt
			this.vecEmbeddingsTableDimension = null; // Unknown until first insert
		}
	}

	/**
	 * Re-check vec_embeddings table state (fallback when error occurs).
	 */
	private recheckVecEmbeddingsTableState(): void {
		const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
		this.vecEmbeddingsTableExists = checkStmt.get() !== undefined;
		this.vecEmbeddingsTableDimension = null; // Reset dimension cache
	}

	/**
	 * Recreate vec_embeddings table with new dimension.
	 * This will delete all existing vector data in vec_embeddings.
	 * Note: This does NOT delete embedding records from the embedding table.
	 * 
	 * @param dimension - New dimension for the table
	 */
	recreateVecEmbeddingsTable(dimension: number): void {
		console.warn(
			`[EmbeddingRepo] Recreating vec_embeddings table with dimension ${dimension}. ` +
			'All existing vector data in vec_embeddings will be lost (embedding table records are preserved).'
		);

		// Drop existing table
		this.rawDb.exec(`DROP TABLE IF EXISTS vec_embeddings`);

		// Create new table with correct dimension
		this.rawDb.exec(`
			CREATE VIRTUAL TABLE vec_embeddings USING vec0(
				embedding float[${dimension}]
			)
		`);

		// Update cache
		this.vecEmbeddingsTableExists = true;
		this.vecEmbeddingsTableDimension = dimension;

		console.log(`[EmbeddingRepo] Recreated vec_embeddings table with dimension ${dimension}`);
	}

	/**
	 * Ensure vec_embeddings table exists with correct dimension.
	 * Uses cached state to avoid frequent table checks.
	 * If table doesn't exist, create it with the specified dimension.
	 */
	private ensureVecEmbeddingsTable(dimension: number): void {
		// Use cached state if available
		if (this.vecEmbeddingsTableExists === null) {
			// Cache not initialized, check now
			this.initializeVecEmbeddingsTableCache();
		}

		if (!this.vecEmbeddingsTableExists) {
			// Create table with correct dimension on first insert
			// This ensures the table dimension matches the actual embedding model dimension
			this.rawDb.exec(`
				CREATE VIRTUAL TABLE vec_embeddings USING vec0(
					embedding float[${dimension}]
				)
			`);
			console.log(`[EmbeddingRepo] Created vec_embeddings table with dimension ${dimension}`);
			// Update cache
			this.vecEmbeddingsTableExists = true;
			this.vecEmbeddingsTableDimension = dimension;
		}
		// If table exists, dimension will be validated during insert
		// If mismatch, we'll catch the error and throw a clear error message
	}

	/**
	 * Get embedding rowid by id.
	 * Returns null if not found.
	 */
	private getEmbeddingRowid(id: string): number | null {
		const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE id = ?
		`);
		const result = stmt.get(id) as { rowid: number } | undefined;
		return result?.rowid ?? null;
	}

	/**
	 * Sync embedding to vec_embeddings virtual table.
	 * This performs DELETE then INSERT (virtual tables don't support UPDATE).
	 */
	private syncToVecEmbeddings(embeddingRowid: number, embeddingBuffer: Buffer, logContext?: string): void {
		// Check if row exists in vec_embeddings
		const checkStmt = this.rawDb.prepare(`
			SELECT rowid FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
		`);
		const existing = checkStmt.get(embeddingRowid);

		// If exists, delete first (virtual tables don't support UPDATE)
		if (existing) {
			const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
			`);
			deleteStmt.run(embeddingRowid);
		}

		// Insert (or re-insert) the embedding
		const insertStmt = this.rawDb.prepare(`
			INSERT INTO vec_embeddings(rowid, embedding)
			VALUES (CAST(? AS INTEGER), ?)
		`);
		// const logMsg = logContext
		// 	? `[EmbeddingRepo] Inserting into vec_embeddings with rowid: ${embeddingRowid} (${logContext})`
		// 	: `[EmbeddingRepo] Inserting into vec_embeddings with rowid: ${embeddingRowid}`;
		// console.debug(logMsg);
		insertStmt.run(embeddingRowid, embeddingBuffer);
	}

	/**
	 * Handle errors from syncToVecEmbeddings and retry if needed.
	 */
	private handleSyncError(
		error: unknown,
		embeddingRowid: number,
		embeddingBuffer: Buffer,
		embeddingDimension: number,
	): void {
		const errorMsg = error instanceof Error ? error.message : String(error);
		const cause = error instanceof Error ? error : new Error(String(error));

		// Handle table missing error
		if (errorMsg.includes('no such table: vec_embeddings')) {
			this.recheckVecEmbeddingsTableState();
			if (!this.vecEmbeddingsTableExists) {
				throw new BusinessError(
					ErrorCode.VEC_EMBEDDINGS_TABLE_MISSING,
					'vec_embeddings virtual table does not exist. This requires sqlite-vec extension to be loaded. Please ensure sqlite-vec is installed and the extension is loaded during database initialization.',
					cause
				);
			}
			// Retry after table state recheck
			this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, 'retry after table missing');
			return;
		}

		// Handle dimension mismatch error
		if (errorMsg.includes('Dimension mismatch')) {
			const dimensionMatch = errorMsg.match(/Expected (\d+) dimensions/);
			const expectedDimension = dimensionMatch ? dimensionMatch[1] : 'unknown';
			console.warn(
				`[EmbeddingRepo] Dimension mismatch detected: table expects ${expectedDimension} dimensions, ` +
				`but received ${embeddingDimension} dimensions. ` +
				`This usually happens when the embedding model was changed. ` +
				`Automatically recreating vec_embeddings table with correct dimension...`
			);
			this.recreateVecEmbeddingsTable(embeddingDimension);
			this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, 'retry after dimension mismatch');
			console.log(`[EmbeddingRepo] Successfully inserted embedding after recreating table`);
			return;
		}

		// Handle other errors
		this.recheckVecEmbeddingsTableState();
		throw new BusinessError(
			ErrorCode.UNKNOWN_ERROR,
			`Failed to sync embedding to vec_embeddings: ${errorMsg}`,
			cause
		);
	}

	/**
	 * Check if embedding exists by id.
	 */
	async existsById(id: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('embedding')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new embedding record.
	 */
	async insert(embedding: {
		id: string;
		doc_id: string;
		chunk_id: string | null;
		chunk_index: number | null;
		content_hash: string;
		ctime: number;
		mtime: number;
		embedding: Buffer;
		embedding_model: string;
		embedding_len: number;
	}): Promise<number> {
		// Use raw SQL to get the rowid after insert
		const insertStmt = this.rawDb.prepare(`
			INSERT INTO embedding (
				id, doc_id, chunk_id, chunk_index,
				content_hash, ctime, mtime, embedding,
				embedding_model, embedding_len
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		const result = insertStmt.run(
			embedding.id,
			embedding.doc_id,
			embedding.chunk_id,
			embedding.chunk_index,
			embedding.content_hash,
			embedding.ctime,
			embedding.mtime,
			embedding.embedding,
			embedding.embedding_model,
			embedding.embedding_len
		);
		return result.lastInsertRowid as number;
	}

	/**
	 * Update existing embedding record by id.
	 */
	async updateById(id: string, updates: {
		doc_id: string;
		chunk_id: string | null;
		chunk_index: number | null;
		content_hash: string;
		mtime: number;
		embedding: Buffer;
		embedding_model: string;
		embedding_len: number;
	}): Promise<void> {
		await this.db
			.updateTable('embedding')
			.set(updates)
			.where('id', '=', id)
			.execute();
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

		const exists = await this.existsById(embedding.id);

		let embeddingRowid: number;
		if (exists) {
			// Update existing embedding
			embeddingRowid = this.getEmbeddingRowid(embedding.id)!;
			await this.updateById(embedding.id, {
				doc_id: embedding.doc_id,
				chunk_id: embedding.chunk_id ?? null,
				chunk_index: embedding.chunk_index ?? null,
				content_hash: embedding.content_hash,
				mtime: embedding.mtime,
				embedding: embeddingBuffer,
				embedding_model: embedding.embedding_model,
				embedding_len: embedding.embedding_len,
			});
		} else {
			// Insert new embedding
			embeddingRowid = await this.insert({
				id: embedding.id,
				doc_id: embedding.doc_id,
				chunk_id: embedding.chunk_id ?? null,
				chunk_index: embedding.chunk_index ?? null,
				content_hash: embedding.content_hash,
				ctime: embedding.ctime,
				mtime: embedding.mtime,
				embedding: embeddingBuffer,
				embedding_model: embedding.embedding_model,
				embedding_len: embedding.embedding_len,
			});
		}

		// Sync to vec_embeddings virtual table using embedding.rowid as vec_embeddings.rowid
		// vec0 virtual table stores vectors as float[], we pass the same BLOB buffer
		// This avoids JSON serialization/deserialization overhead
		// Note: vec_embeddings requires sqlite-vec extension to be loaded
		// Virtual tables don't support UPSERT, so we need to DELETE then INSERT

		const embeddingDimension = embedding.embedding.length;

		// Ensure table exists with correct dimension
		this.ensureVecEmbeddingsTable(embeddingDimension);

		try {
			this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer);
		} catch (error) {
			this.handleSyncError(error, embeddingRowid, embeddingBuffer, embeddingDimension);
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

	async searchSimilarAndGetId(
		queryEmbedding: number[] | Buffer,
		limit: number,
		scopeMode?: SearchScopeMode,
		scopeValue?: SearchScopeValue,
	): Promise<Array<
		{ id: string; doc_id: string; chunk_id: string; embedding: Buffer, distance: number; similarity: number }
	>> {
		// Perform semantic search
		const searchResults = await this.searchSimilar(queryEmbedding, limit, scopeMode, scopeValue);
		if (!searchResults.length) {
			return [];
		}
		// embedding_id -> distance
		const distanceMap = new Map<string, number>();
		for (const result of searchResults) {
			distanceMap.set(result.embedding_id, result.distance);
		}

		// Get embeddings by their IDs to find corresponding doc_ids
		const embeddingRows = await this.getByIds(searchResults.map(r => r.embedding_id));

		return embeddingRows.map(row => {
			const embeddingId = row.id
			const distance = distanceMap.get(embeddingId) ?? Number.MAX_SAFE_INTEGER;
			return {
				...row,
				distance,
				// Convert distance to similarity score: 1 / (1 + distance)
				similarity: 1 / (1 + distance),
			};
		});
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
	async searchSimilar(
		queryEmbedding: number[] | Buffer,
		limit: number,
		scopeMode?: SearchScopeMode,
		scopeValue?: SearchScopeValue,
	): Promise<Array<{
		embedding_id: string;
		distance: number;
	}>> {
		const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
		const result = checkStmt.get();
		if (!result) {
			throw new BusinessError(
				ErrorCode.VEC_EMBEDDINGS_TABLE_MISSING,
				'vec_embeddings virtual table does not exist. Vector similarity search requires sqlite-vec extension. ' +
				'Please ensure sqlite-vec is installed (npm install sqlite-vec) and the extension is loaded during database initialization.',
			);
		}

		// Convert to Buffer if needed (BLOB format for float[])
		const embeddingBuffer = Buffer.isBuffer(queryEmbedding)
			? queryEmbedding
			: this.arrayToBuffer(queryEmbedding);

		// Handle scope filtering - pre-fetch constrained rowids to avoid JOIN in KNN query
		let scopedRowids: number[] | null = null;

		if (scopeMode === 'inFile' && scopeValue?.currentFilePath) {
			scopedRowids = await this.getEmbeddingRowidsByPath([scopeValue.currentFilePath]);
		} else if (scopeMode === 'inFolder' && scopeValue?.folderPath) {
			scopedRowids = await this.getEmbeddingRowidsByFolder(scopeValue.folderPath);
		} else if (scopeMode === 'limitIdsSet' && scopeValue?.limitIdsSet) {
			scopedRowids = this.getEmbeddingRowidsByIds(Array.from(scopeValue.limitIdsSet));
		}
		// Build KNN query with optional rowid filter
		let rowidFilter = scopedRowids && scopedRowids.length > 0
			? `AND ve.rowid IN (${scopedRowids.map(() => '?').join(',')})`
			: '';
		if (scopeMode === 'excludeDocIdsSet' && scopeValue?.excludeDocIdsSet && scopeValue.excludeDocIdsSet.size > 0) {
			scopedRowids = this.getEmbeddingRowidsByDocIds(Array.from(scopeValue.excludeDocIdsSet));
			rowidFilter = `AND ve.rowid NOT IN (${scopedRowids.map(() => '?').join(',')})`;
		}

		// Step 1: KNN search - always direct on vec_embeddings table
		let sql: string;
		let knnParams: any[];

		sql = `
			SELECT
				ve.rowid,
				ve.distance
			FROM vec_embeddings ve
			WHERE ve.embedding MATCH ?
				AND k = ?
				${rowidFilter}
			ORDER BY ve.distance
		`;

		knnParams = [embeddingBuffer, limit];
		if (scopedRowids && scopedRowids.length > 0) {
			knnParams.push(...scopedRowids);
		}

		const knnStmt = this.rawDb.prepare(sql);
		const knnResults = knnStmt.all(...knnParams) as Array<{
			rowid: number;
			distance: number;
		}>;

		if (!knnResults.length) {
			return [];
		}

		// Step 2: Batch lookup embedding table to get embedding.id from rowid
		const rowids = knnResults.map((r) => r.rowid);
		const embeddingSql = `
			SELECT rowid, id FROM embedding
			WHERE rowid IN (${rowids.map(() => '?').join(',')})
		`;
		const embeddingStmt = this.rawDb.prepare(embeddingSql);
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
	 * Delete embeddings and their corresponding vec_embeddings records by rowids.
	 * This is a private helper method that ensures both tables stay in sync.
	 */
	private async deleteEmbeddingsAndVecEmbeddingsByRowids(rowids: number[]): Promise<void> {
		if (!rowids.length) return;

		// Delete from embedding table using raw SQL
		const placeholders = rowids.map(() => '?').join(',');
		const deleteEmbeddingStmt = this.rawDb.prepare(`
			DELETE FROM embedding WHERE rowid IN (${placeholders})
		`);
		deleteEmbeddingStmt.run(...rowids);

		// Delete from vec_embeddings table
		if (this.vecEmbeddingsTableExists) {
			const deleteVecStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);
			deleteVecStmt.run(...rowids);
		}
	}

	/**
	 * Delete embeddings by file ID.
	 */
	async deleteByDocId(docId: string): Promise<void> {
		// Get rowids of embeddings to delete
		const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id = ?
		`);
		const rows = stmt.all(docId) as Array<{ rowid: number }>;

		if (rows.length > 0) {
			const rowids = rows.map(r => r.rowid);
			await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
		}
	}

	/**
	 * Delete embeddings by doc IDs (batch).
	 */
	async deleteByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;

		// Get rowids of embeddings to delete
		const placeholders = docIds.map(() => '?').join(',');
		const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id IN (${placeholders})
		`);
		const rows = stmt.all(...docIds) as Array<{ rowid: number }>;

		if (rows.length > 0) {
			const rowids = rows.map(r => r.rowid);
			await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
		}
	}

	/**
	 * Delete all embeddings.
	 */
	async deleteAll(): Promise<void> {
		// Get all embedding rowids
		const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
		`);
		const rows = stmt.all() as Array<{ rowid: number }>;

		if (rows.length > 0) {
			const rowids = rows.map(r => r.rowid);
			await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
		}
	}

	/**
	 * Delete embedding by ID.
	 */
	async deleteById(id: string): Promise<void> {
		const rowid = this.getEmbeddingRowid(id);
		if (rowid !== null) {
			await this.deleteEmbeddingsAndVecEmbeddingsByRowids([rowid]);
		}
	}

	/**
	 * Delete embeddings by IDs (batch).
	 */
	async deleteByIds(ids: string[]): Promise<void> {
		if (!ids.length) return;

		const rowids: number[] = [];
		for (const id of ids) {
			const rowid = this.getEmbeddingRowid(id);
			if (rowid !== null) {
				rowids.push(rowid);
			}
		}

		if (rowids.length > 0) {
			await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
		}
	}

	/**
	 * Computes the global mean semantic embedding vector for a document (Global Mean Pooling).
	 *
	 * [Mathematical Principle & Representational Power]
	 * This method operates under the "semantic centroid" assumption: in vector space, the arithmetic mean of a set of vectors represents their geometric centroid.
	 * When a document's theme is highly coherent (such as a single-topic technical doc or focused essay), this mean vector effectively captures and compresses the document's essential theme,
	 * providing a single, summary-level vector fingerprint for the document.
	 *
	 * [Semantic Dilution Risk]
	 * For long or heterogeneous documents containing multiple unrelated semantic centers, averaging can cause "semantic collapse."
	 * The resulting mean vector may fall in a region of vector space that doesn't exist in reality, significantly reducing retrieval accuracy.
	 *   Common failure cases:
	 *   1. Extreme topic shifts: If the first half discusses "pasta recipes" and the second half "Java multithreading," the mean vector drifts to a noisy space 
	 *      that represents neither cooking nor programming, causing both keyword searches to miss.
	 *   2. Localized key info: In a 5000-word annual report with only a short mention of "company layoffs," the mean dilutes this signal among ordinary content, 
	 *      masking critical features.
	 *   3. Contradictory semantics: Discussing both "extreme heat" and "extreme cold" may yield a mean vector closer to "moderate climate," losing the extremes.
	 *
	 * [Optimization Suggestions] todo implement
	 * 1. Head-Chunk pooling: For overly long documents, compute average on the first N chunks (where title/intro often concentrates core context).
	 * 2. Salience weighting: Use chunk position or IDF to weight the mean.
	 * 3. Multi-center representation: For long/heterogeneous docs, store multiple cluster centroids or raw chunk embeddings instead of a single mean.
	 *
	 * @param docId - Unique document identifier
	 * @returns High-dimensional vector (number[]) representing the document's global semantics, or null if none found
	 */
	async getAverageEmbeddingForDoc(docId: string): Promise<number[] | null> {
		const embeddings = await this.getByDocId(docId);

		if (!embeddings.length) {
			return null;
		}

		const embeddingDim = embeddings[0].embedding_len;
		const averageVector = new Array(embeddingDim).fill(0);

		// Sum all vectors
		for (const embedding of embeddings) {
			const buffer = embedding.embedding;
			for (let i = 0; i < buffer.length; i += 4) {
				const floatValue = buffer.readFloatLE(i);
				averageVector[i / 4] += floatValue;
			}
		}

		// Calculate average
		for (let i = 0; i < averageVector.length; i++) {
			averageVector[i] /= embeddings.length;
		}

		return averageVector;
	}

	/**
	 * Clean up orphaned vec_embeddings records that exist in vec_embeddings table
	 * but not in embedding table. This fixes data inconsistency issues.
	 *
	 * @returns Object with cleanup statistics: { found: number, deleted: number }
	 */
	async cleanupOrphanedVecEmbeddings(): Promise<{ found: number; deleted: number }> {
		let found = 0;
		let deleted = 0;

		try {
			// Check if vec_embeddings table exists
			const checkStmt = this.rawDb.prepare(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='vec_embeddings'
			`);
			const tableExists = checkStmt.get() !== undefined;

			if (!tableExists) {
				console.log('[EmbeddingRepo] vec_embeddings table does not exist, nothing to clean up');
				return { found: 0, deleted: 0 };
			}

			// Find vec_embeddings records that don't have corresponding embedding records
			const orphanedStmt = this.rawDb.prepare(`
				SELECT ve.rowid
				FROM vec_embeddings ve
				LEFT JOIN embedding e ON ve.rowid = e.rowid
				WHERE e.rowid IS NULL
			`);

			const orphanedRecords = orphanedStmt.all() as Array<{ rowid: number }>;
			found = orphanedRecords.length;

			if (found === 0) {
				console.log('[EmbeddingRepo] No orphaned vec_embeddings records found');
				return { found: 0, deleted: 0 };
			}

			console.log(`[EmbeddingRepo] Found ${found} orphaned vec_embeddings records`);

			// Delete orphaned records
			const rowids = orphanedRecords.map(r => r.rowid);
			const placeholders = rowids.map(() => '?').join(',');
			const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);

			deleteStmt.run(...rowids);
			deleted = rowids.length;

			console.log(`[EmbeddingRepo] Successfully deleted ${deleted} orphaned vec_embeddings records`);

		} catch (error) {
			console.error('[EmbeddingRepo] Error during cleanup:', error);
			throw error;
		}

		return { found, deleted };
	}
}

