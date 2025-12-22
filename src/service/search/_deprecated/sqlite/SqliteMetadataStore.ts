/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * SqliteStore (sql.js) has been replaced by BetterSqliteStore (better-sqlite3) for file-backed persistence.
 * See: src/core/storage/README.md
 */

import initSqlJs from 'sql.js';
// Force bundler to emit the wasm asset for worker runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import wasmAssetPath from 'sql.js/dist/sql-wasm.wasm';
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';

type SqlJsDatabase = any;

/**
 * SQLite database lifecycle manager backed by sql.js (WASM SQLite).
 *
 * Runs inside worker thread to avoid blocking the UI thread.
 * The main thread is responsible for persisting its exported bytes.
 *
 * @deprecated QueryBuilder has been removed. This class is deprecated and should not be used.
 * Use BetterSqliteStore with Kysely instead.
 */
export class SqliteStore {
	private constructor(private readonly db: SqlJsDatabase) {}

	/**
	 * Create and initialize the database with schema migrations.
	 * If `sqliteBytes` is provided, it will be used to restore the database.
	 */
	static async getInstance(params?: { sqliteBytes?: ArrayBuffer | null }): Promise<SqliteStore> {
		const SQL = await initSqlJs({
			locateFile: () => new URL(wasmAssetPath, (self as any).location?.href ?? '').toString(),
		});

		const bytes = params?.sqliteBytes ?? null;
		const db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
		migrateSqliteSchema(db);
		return new SqliteStore(db);
	}

	/**
	 * Export current database snapshot to bytes for persistence.
	 */
	exportBytes(): ArrayBuffer {
		return this.exportSqliteBytes(this.db);
	}

	/**
	 * Export a sql.js database to bytes.
	 */	
	private exportSqliteBytes(db: SqlJsDatabase): ArrayBuffer {
		const bytes = db.export() as Uint8Array;
		// Slice to ensure the returned ArrayBuffer contains only the meaningful region.
		const buffer = bytes.buffer;
		if (buffer instanceof SharedArrayBuffer) {
			// Convert SharedArrayBuffer to ArrayBuffer by copying
			const arrayBuffer = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(arrayBuffer).set(bytes);
			return arrayBuffer;
		}
		return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	}

}
