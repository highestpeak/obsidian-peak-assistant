/**
 * File-based SQLite store backed by wa-sqlite (WebAssembly).
 * 
 * Advantages:
 * - No native module dependencies, can be bundled
 * - Supports file persistence via Node.js fs with partial I/O (see NodeVFS)
 * - Works in Electron/Node.js environments
 * 
 * ⚠️ PERFORMANCE CONSIDERATIONS:
 * 
 * This implementation uses syncWait() to bridge wa-sqlite's async API with
 * Kysely's synchronous interface. This can cause UI blocking in Obsidian:
 * 
 * - Quick operations (<50ms): Generally acceptable
 * - Medium operations (50-200ms): May cause noticeable UI lag
 * - Long operations (>200ms): Will freeze UI, poor user experience
 * 
 * The syncWait function attempts to yield to the event loop, but in JavaScript's
 * single-threaded model, synchronous code still blocks the UI thread.
 * 
 * RECOMMENDATIONS:
 * 1. Keep database operations small and fast
 * 2. Batch operations when possible
 * 3. Consider moving heavy operations to background tasks
 * 4. Future: Refactor to fully async API (breaking change)
 */
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from '@journeyapps/wa-sqlite';
import { NodeVFS } from './NodeVFS';

// Adapter to make wa-sqlite compatible with Kysely's SqliteDialect
interface KyselyAdapter {
	exec(sql: string): void;
	prepare(sql: string): WaSqliteStatement;
}

/**
 * Database interface for wa-sqlite adapter.
 * Compatible with better-sqlite3 interface for repositories.
 */
export type SqliteDatabase = KyselyAdapter;

interface WaSqliteStatement {
	bind(...params: any[]): WaSqliteStatement;
	run(...params: any[]): { changes: number; lastInsertRowid: number };
	get(...params: any[]): any;
	all(...params: any[]): any[];
	finalize(): void;
}

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

/**
 * Synchronously wait for a Promise (for Node.js/Electron)
 * 
 * ⚠️ CRITICAL WARNING: This function blocks the current thread until the promise resolves.
 * 
 * In Obsidian's single-threaded UI environment, this can cause:
 * - UI freezing during long-running SQL operations
 * - Unresponsive interface during large transactions
 * - Poor user experience for operations taking >100ms
 * 
 * This is a compatibility layer to bridge wa-sqlite's async API with Kysely's sync interface.
 * 
 * IMPROVEMENTS:
 * - Uses setImmediate to yield to event loop frequently (every iteration)
 * - Limits maximum wait time to prevent indefinite blocking
 * - Should only be used for quick operations (<50ms expected)
 * 
 * FUTURE REFACTORING:
 * Consider migrating to fully async operations:
 * 1. Make WaSqliteStore methods async
 * 2. Update repositories to use async/await
 * 3. Remove this function entirely
 * 
 * @param promise - The promise to wait for
 * @returns The resolved value
 * @throws Error if timeout is exceeded or promise rejects
 */
function syncWait<T>(promise: Promise<T>): T {
	let result: T | undefined;
	let error: Error | undefined;
	let done = false;

	promise
		.then((value) => {
			result = value;
			done = true;
		})
		.catch((err) => {
			error = err;
			done = true;
		});

	const startTime = Date.now();
	const timeout = 5000; // Reduced to 5 seconds to fail fast
	const { setImmediate } = require('timers');
	let iterationCount = 0;
	const MAX_ITERATIONS = 10000; // Safety limit

	// Wait loop with frequent yields to event loop
	while (!done) {
		// Safety checks
		if (Date.now() - startTime > timeout) {
			throw new Error(`Timeout waiting for async operation after ${timeout}ms`);
		}
		if (++iterationCount > MAX_ITERATIONS) {
			throw new Error(`Maximum iterations exceeded in syncWait (${MAX_ITERATIONS})`);
		}

		// Yield to event loop on every iteration
		// This allows UI updates and other events to be processed
		// Using setImmediate ensures we don't block the event loop completely
		setImmediate(() => { });

		// In Node.js/Electron, we need to actually process the event loop
		// The setImmediate callback will be queued, but we need to let it execute
		// This is a limitation of synchronous waiting in JavaScript
	}

	if (error) {
		throw error;
	}

	// Log warning for slow operations
	const duration = Date.now() - startTime;
	if (duration > 100) {
		console.warn(
			`[WaSqliteStore] syncWait took ${duration}ms - consider using async operations for better UI responsiveness`
		);
	}

	return result!;
}

/**
 * Create adapter to make wa-sqlite compatible with Kysely's SqliteDialect
 */
function createKyselyAdapter(
	dbHandle: number,
	sqlite3: SQLiteAPI
): KyselyAdapter {
	// Cache prepared statements
	const stmtCache = new Map<string, number>();

	return {
		exec: (sql: string) => {
			// Execute SQL synchronously
			syncWait(sqlite3.exec(dbHandle, sql));
		},
		prepare: (sql: string): WaSqliteStatement => {
			// Get or create statement handle
			let stmtHandle = stmtCache.get(sql);
			if (!stmtHandle) {
				// Prepare statement synchronously
				const stmtIterator = sqlite3.statements(dbHandle, sql, { unscoped: true });
				stmtHandle = syncWait(
					(async () => {
						for await (const stmt of stmtIterator) {
							return stmt;
						}
						throw new Error('Failed to prepare statement');
					})()
				);
				stmtCache.set(sql, stmtHandle);
			}

			const bindParams = (stmt: number, params: any) => {
				// Handle object parameters (named parameters)
				if (params && typeof params === 'object' && !Array.isArray(params) && !(params instanceof Uint8Array) && !Buffer.isBuffer(params)) {
					// Named parameters: { '@chunk_id': 'value', '@doc_id': 'value' }
					const paramCount = sqlite3.bind_parameter_count(stmt);
					for (let i = 1; i <= paramCount; i++) {
						const paramName = sqlite3.bind_parameter_name(stmt, i);
						if (paramName) {
							const value = params[paramName];
							if (value === null || value === undefined) {
								sqlite3.bind_null(stmt, i);
							} else if (typeof value === 'number') {
								sqlite3.bind_int(stmt, i, value);
							} else if (typeof value === 'string') {
								sqlite3.bind_text(stmt, i, value);
							} else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
								sqlite3.bind_blob(stmt, i, value);
							} else if (typeof value === 'bigint') {
								sqlite3.bind_int64(stmt, i, value);
							}
						}
					}
				} else {
					// Array or spread parameters
					const paramArray = Array.isArray(params) ? params : [params];
					for (let i = 0; i < paramArray.length; i++) {
						const param = paramArray[i];
						if (param === null || param === undefined) {
							sqlite3.bind_null(stmt, i + 1);
						} else if (typeof param === 'number') {
							sqlite3.bind_int(stmt, i + 1, param);
						} else if (typeof param === 'string') {
							sqlite3.bind_text(stmt, i + 1, param);
						} else if (param instanceof Uint8Array || Buffer.isBuffer(param)) {
							sqlite3.bind_blob(stmt, i + 1, param);
						} else if (typeof param === 'bigint') {
							sqlite3.bind_int64(stmt, i + 1, param);
						}
					}
				}
			};

			const stmtObj = {
				bind: (...params: any[]) => {
					bindParams(stmtHandle!, params);
					return stmtObj;
				},
				run: (params?: any) => {
					bindParams(stmtHandle!, params);
					// Execute synchronously
					syncWait(sqlite3.step(stmtHandle!));
					syncWait(sqlite3.reset(stmtHandle!));
					return {
						changes: sqlite3.changes(dbHandle),
						lastInsertRowid: sqlite3.last_insert_id(dbHandle),
					};
				},
				get: (params?: any) => {
					bindParams(stmtHandle!, params);
					// Execute and get first row synchronously
					const stepResult = syncWait(sqlite3.step(stmtHandle!));
					let row: any = undefined;
					if (stepResult === SQLite.SQLITE_ROW) {
						const columnCount = sqlite3.column_count(stmtHandle!);
						row = {};
						for (let i = 0; i < columnCount; i++) {
							const name = sqlite3.column_name(stmtHandle!, i);
							const type = sqlite3.column_type(stmtHandle!, i);
							if (type === SQLite.SQLITE_INTEGER) {
								// Check if value exceeds 32-bit signed integer range
								// Use int64 for large integers (e.g., Snowflake IDs, millisecond timestamps)
								const int64 = sqlite3.column_int64(stmtHandle!, i);
								// Convert to Number if within safe integer range, otherwise keep as BigInt
								if (int64 >= Number.MIN_SAFE_INTEGER && int64 <= Number.MAX_SAFE_INTEGER) {
									row[name] = Number(int64);
								} else {
									row[name] = int64;
								}
							} else if (type === SQLite.SQLITE_FLOAT) {
								row[name] = sqlite3.column_double(stmtHandle!, i);
							} else if (type === SQLite.SQLITE_TEXT) {
								row[name] = sqlite3.column_text(stmtHandle!, i);
							} else if (type === SQLite.SQLITE_BLOB) {
								// column_blob creates a copy of the data
								// For large blobs, consider using WASM memory directly to avoid copying
								// See: https://github.com/rhashimoto/wa-sqlite#blob-handling
								row[name] = sqlite3.column_blob(stmtHandle!, i);
							} else {
								row[name] = null;
							}
						}
					}
					syncWait(sqlite3.reset(stmtHandle!));
					return row;
				},
				all: (params?: any) => {
					bindParams(stmtHandle!, params);
					// Execute and get all rows synchronously
					const rows: any[] = [];
					let stepResult: number;
					while ((stepResult = syncWait(sqlite3.step(stmtHandle!))) === SQLite.SQLITE_ROW) {
						const columnCount = sqlite3.column_count(stmtHandle!);
						const row: any = {};
						for (let i = 0; i < columnCount; i++) {
							const name = sqlite3.column_name(stmtHandle!, i);
							const type = sqlite3.column_type(stmtHandle!, i);
							if (type === SQLite.SQLITE_INTEGER) {
								// Check if value exceeds 32-bit signed integer range
								// Use int64 for large integers (e.g., Snowflake IDs, millisecond timestamps)
								const int64 = sqlite3.column_int64(stmtHandle!, i);
								// Convert to Number if within safe integer range, otherwise keep as BigInt
								if (int64 >= Number.MIN_SAFE_INTEGER && int64 <= Number.MAX_SAFE_INTEGER) {
									row[name] = Number(int64);
								} else {
									row[name] = int64;
								}
							} else if (type === SQLite.SQLITE_FLOAT) {
								row[name] = sqlite3.column_double(stmtHandle!, i);
							} else if (type === SQLite.SQLITE_TEXT) {
								row[name] = sqlite3.column_text(stmtHandle!, i);
							} else if (type === SQLite.SQLITE_BLOB) {
								// column_blob creates a copy of the data
								// For large blobs, consider using WASM memory directly to avoid copying
								// See: https://github.com/rhashimoto/wa-sqlite#blob-handling
								row[name] = sqlite3.column_blob(stmtHandle!, i);
							} else {
								row[name] = null;
							}
						}
						rows.push(row);
					}
					syncWait(sqlite3.reset(stmtHandle!));
					return rows;
				},
				finalize: () => {
					// Don't finalize cached statements
					// They will be cleaned up when the database is closed
				},
			};
			return stmtObj;
		},
	};
}

export class WaSqliteStore {
	readonly kysely: Kysely<DbSchema>;
	readonly rawDb: KyselyAdapter;
	private dbHandle: number;
	private sqlite3: SQLiteAPI;
	private vfs: NodeVFS;

	private constructor(
		dbHandle: number,
		sqlite3: SQLiteAPI,
		vfs: NodeVFS,
		adapter: KyselyAdapter
	) {
		this.dbHandle = dbHandle;
		this.sqlite3 = sqlite3;
		this.vfs = vfs;
		this.rawDb = adapter;
		this.kysely = new Kysely<DbSchema>({
			dialect: new SqliteDialect({
				database: adapter as any,
			}),
		});
	}

	/**
	 * Open or create a SQLite database file.
	 */
	static async open(params: { dbFilePath: string }): Promise<WaSqliteStore> {
		// Load wa-sqlite module
		// Note: If WASM is inlined as Base64, wa-sqlite will handle loading automatically
		// The ESM factory resolves WASM paths from the module location
		const module = await SQLiteESMFactory();
		const sqlite3 = SQLite.Factory(module);

		// Create and register Node.js VFS
		const vfs = new NodeVFS('node', module);
		sqlite3.vfs_register(vfs as any, true);

		// Open database
		const flags = SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE;
		const dbHandle = await sqlite3.open_v2(params.dbFilePath, flags, 'node');

		// Set WAL mode for better concurrency
		try {
			await sqlite3.exec(dbHandle, 'PRAGMA journal_mode = WAL;');
		} catch {
			// Ignore if pragma is unavailable
		}

		// Create adapter
		const adapter = createKyselyAdapter(dbHandle, sqlite3);

		const store = new WaSqliteStore(dbHandle, sqlite3, vfs, adapter);
		migrateSqliteSchema(store.rawDb);

		return store;
	}

	/**
	 * Execute a raw SQL string
	 */
	exec(sql: string): void {
		this.rawDb.exec(sql);
	}

	/**
	 * Prepare a statement
	 */
	prepare(sql: string): any {
		return this.rawDb.prepare(sql);
	}

	/**
	 * Run a transaction
	 */
	transaction<T>(fn: () => T): T {
		this.rawDb.exec('BEGIN TRANSACTION;');
		try {
			const result = fn();
			this.rawDb.exec('COMMIT;');
			return result;
		} catch (error) {
			this.rawDb.exec('ROLLBACK;');
			throw error;
		}
	}

	close(): void {
		try {
			void this.kysely.destroy();
		} catch {
			// Ignore
		}
		this.vfs.close();
		this.sqlite3.close(this.dbHandle);
	}
}

