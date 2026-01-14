import type { Database as DbSchema } from './ddl';
import { Kysely } from 'kysely';

/**
 * Database adapter interface compatible with Kysely's SqliteDialect.
 * 
 * All backends (better-sqlite3, sql.js) must implement this interface through adapters.
 * This is the type used by repositories (DocChunkRepo, EmbeddingRepo, etc.)
 * to work with raw SQL operations.
 */


/**
 * Supported SQLite backend types.
 */
export type SqliteStoreType = 'better-sqlite3' | 'sql.js';

export interface SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): any;
	kysely<T>(): Kysely<T>;
	close(): void;
	databaseType(): SqliteStoreType;
}
