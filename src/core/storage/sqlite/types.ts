/**
 * Unified type definitions for SQLite storage backends.
 * 
 * This file provides the common interface that all SQLite adapters must implement.
 * This ensures type safety and consistency across different backends (better-sqlite3, sql.js).
 */

/**
 * Statement interface for prepared SQL queries.
 * 
 * All backend adapters return statements that implement this interface.
 */
export interface SqliteStatement {
	bind(...params: any[]): SqliteStatement;
	run(...params: any[]): { changes: number; lastInsertRowid: number };
	get(...params: any[]): any;
	all(...params: any[]): any[];
	finalize(): void;
}

/**
 * Database adapter interface compatible with Kysely's SqliteDialect.
 * 
 * All backends (better-sqlite3, sql.js) must implement this interface through adapters.
 * This is the type used by repositories (DocChunkRepo, EmbeddingRepo, etc.)
 * to work with raw SQL operations.
 */
export interface SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
}

/**
 * Supported SQLite backend types.
 */
export type SqliteStoreType = 'better-sqlite3' | 'sql.js';

/**
 * Union type for all SQLite store implementations.
 * This allows switching between different backends (better-sqlite3, sql.js).
 */
import type { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import type { SqlJsStore } from './sqljs-adapter/SqlJsStore';

export type SqliteStore = BetterSqliteStore | SqlJsStore;

