import type { Database as DbSchema } from './ddl';
import { Kysely } from 'kysely';

/** Index tenant: vault = search.sqlite, chat = meta.sqlite (ChatFolder index). */
export type IndexTenant = 'vault' | 'chat';

/**
 * Database adapter interface compatible with Kysely's SqliteDialect.
 * Used by repositories (DocChunkRepo, EmbeddingRepo, etc.) for raw SQL.
 */

/** Supported SQLite backend (only better-sqlite3). */
export type SqliteStoreType = 'better-sqlite3';

export interface SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): any;
	kysely<T>(): Kysely<T>;
	close(): void;
	databaseType(): SqliteStoreType;
}
