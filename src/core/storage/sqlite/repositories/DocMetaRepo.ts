import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { sql } from 'kysely';

/**
 * CRUD repository for `doc_meta` table.
 */
export class DocMetaRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Check if document metadata exists by path.
	 */
	async existsByPath(path: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('doc_meta')
			.select('id')
			.where('path', '=', path)
			.executeTakeFirst();
		return row !== undefined;
	}

	/**
	 * Insert new document metadata.
	 */
	async insert(doc: DbSchema['doc_meta']): Promise<void> {
		await this.db
			.insertInto('doc_meta')
			.values(doc)
			.execute();
	}

	/**
	 * Update existing document metadata by id.
	 */
	async updateById(id: string, updates: Partial<Omit<DbSchema['doc_meta'], 'id' | 'path' | 'created_at'>>): Promise<void> {
		await this.db
			.updateTable('doc_meta')
			.set(updates)
			.where('id', '=', id)
			.execute();
	}

	/**
	 * Update existing document metadata by path.
	 */
	async updateByPath(path: string, updates: Partial<Omit<DbSchema['doc_meta'], 'id' | 'path' | 'created_at'>>): Promise<void> {
		await this.db
			.updateTable('doc_meta')
			.set(updates)
			.where('path', '=', path)
			.execute();
	}

	/**
	 * Upsert document metadata.
	 * Supports both full Document metadata and minimal fields for backward compatibility.
	 */
	async upsert(doc: Partial<DbSchema['doc_meta']> & { path: string }): Promise<void> {
		// Ensure id is provided (should be generated from path if not provided)
		if (!doc.id) {
			throw new Error(`doc.id is required for doc_meta.upsert. Path: ${doc.path}`);
		}

		const exists = await this.existsByPath(doc.path);

		if (exists) {
			// Update existing record using id (more efficient and accurate)
			await this.updateById(doc.id, {
				type: doc.type ?? null,
				title: doc.title ?? null,
				size: doc.size ?? null,
				mtime: doc.mtime ?? null,
				ctime: doc.ctime ?? null,
				content_hash: doc.content_hash ?? null,
				summary: doc.summary ?? null,
				tags: doc.tags ?? null,
				last_processed_at: doc.last_processed_at ?? null,
				frontmatter_json: doc.frontmatter_json ?? null,
			});
		} else {
			// Insert new record
			await this.insert({
				id: doc.id,
				path: doc.path,
				type: doc.type ?? null,
				title: doc.title ?? null,
				size: doc.size ?? null,
				mtime: doc.mtime ?? null,
				ctime: doc.ctime ?? null,
				content_hash: doc.content_hash ?? null,
				summary: doc.summary ?? null,
				tags: doc.tags ?? null,
				last_processed_at: doc.last_processed_at ?? null,
				frontmatter_json: doc.frontmatter_json ?? null,
			});
		}
	}

	/**
	 * Delete metadata rows for the given paths.
	 */
	async deleteByPaths(paths: string[]): Promise<void> {
		if (!paths.length) return;
		await this.db.deleteFrom('doc_meta').where('path', 'in', paths).execute();
	}

	/**
	 * Delete all document metadata.
	 */
	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('doc_meta').execute();
	}

	/**
	 * Get all indexed file paths with their modification times.
	 * Returns a map of path -> mtime for efficient lookup.
	 */
	async getAllIndexedPaths(): Promise<Map<string, number>> {
		const rows = await this.db.selectFrom('doc_meta').select(['path', 'mtime']).execute();
		const result = new Map<string, number>();
		for (const row of rows) {
			const mtime = row.mtime ?? 0;
			result.set(row.path, mtime);
		}
		return result;
	}

	/**
	 * Batch get indexed paths with pagination.
	 * Useful for processing large numbers of indexed paths without loading all at once.
	 * 
	 * @param offset - Number of rows to skip
	 * @param limit - Maximum number of rows to return
	 * @returns Array of { path, mtime } pairs
	 */
	async getIndexedPathsBatch(offset: number, limit: number): Promise<Array<{ path: string; mtime: number }>> {
		const rows = await this.db
			.selectFrom('doc_meta')
			.select(['path', 'mtime'])
			.offset(offset)
			.limit(limit)
			.execute();
		return rows.map(row => ({
			path: row.path,
			mtime: row.mtime ?? 0,
		}));
	}

	/**
	 * Batch check indexed status for multiple paths.
	 * Returns a map of path -> { mtime, content_hash } for paths that are indexed.
	 */
	async batchCheckIndexed(paths: string[]): Promise<Map<string, { mtime: number; content_hash: string | null }>> {
		if (!paths.length) return new Map();
		const rows = await this.db
			.selectFrom('doc_meta')
			.select(['path', 'mtime', 'content_hash'])
			.where('path', 'in', paths)
			.execute();
		const result = new Map<string, { mtime: number; content_hash: string | null }>();
		for (const row of rows) {
			const mtime = row.mtime ?? 0;
			result.set(row.path, {
				mtime,
				content_hash: row.content_hash ?? null,
			});
		}
		return result;
	}

	/**
	 * Get document metadata by path.
	 */
	async getByPath(path: string): Promise<DbSchema['doc_meta'] | null> {
		const row = await this.db.selectFrom('doc_meta').selectAll().where('path', '=', path).executeTakeFirst();
		return row ?? null;
	}

	/**
	 * Get document metadata by paths (batch).
	 */
	async getByPaths(paths: string[]): Promise<Map<string, DbSchema['doc_meta']>> {
		if (!paths.length) return new Map();
		const rows = await this.db.selectFrom('doc_meta').selectAll().where('path', 'in', paths).execute();
		const result = new Map<string, DbSchema['doc_meta']>();
		for (const row of rows) {
			result.set(row.path, row);
		}
		return result;
	}

	/**
	 * Get document IDs by paths (batch).
	 */
	async getIdsByPaths(paths: string[]): Promise<{ id: string, path: string }[]> {
		if (!paths.length) return [];
		const rows = await this.db
			.selectFrom('doc_meta')
			.select(['id', 'path'])
			.where('path', 'in', paths)
			.execute();
		return rows.map(row => ({ id: row.id, path: row.path }));
	}

	/**
	 * Get document metadata by IDs (batch).
	 */
	async getByIds(ids: string[]): Promise<DbSchema['doc_meta'][]> {
		if (!ids.length) return [];
		return await this.db.selectFrom('doc_meta').selectAll().where('id', 'in', ids).execute();
	}

	/**
	 * Get document metadata by content hash.
	 */
	async getByContentHash(contentHash: string): Promise<DbSchema['doc_meta'][]> {
		return await this.db.selectFrom('doc_meta').selectAll().where('content_hash', '=', contentHash).execute();
	}

	/**
	 * Batch get document metadata by content hashes.
	 * Returns a set of content hashes that exist in doc_meta.
	 */
	async batchGetByContentHashes(contentHashes: string[]): Promise<Set<string>> {
		if (!contentHashes.length) return new Set();
		const rows = await this.db
			.selectFrom('doc_meta')
			.select(['content_hash'])
			.where('content_hash', 'in', contentHashes)
			.where('content_hash', 'is not', null)
			.execute();
		return new Set(rows.map(row => row.content_hash!).filter(Boolean));
	}
}


