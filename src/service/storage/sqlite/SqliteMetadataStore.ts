import initSqlJs from 'sql.js';
// Force bundler to emit the wasm asset for worker runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import wasmAssetPath from 'sql.js/dist/sql-wasm.wasm';
import { migrateSqliteSchema } from '@/service/storage/sqlite/database';
import { QueryBuilder } from '@/service/storage/sqlite/query-builder';

type SqlJsDatabase = any;

/**
 * SQLite database lifecycle manager backed by sql.js (WASM SQLite).
 *
 * Runs inside worker thread to avoid blocking the UI thread.
 * The main thread is responsible for persisting its exported bytes.
 *
 * Provides access to QueryBuilder for creating repositories.
 */
export class SqliteStore {
	readonly queryBuilder: QueryBuilder;

	private constructor(private readonly db: SqlJsDatabase, qb: QueryBuilder) {
		this.queryBuilder = qb;
	}

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
		const qb = new QueryBuilder(db);
		return new SqliteStore(db, qb);
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
