/**
 * File-based SQLite store backed by sql.js (WebAssembly-based).
 * 
 * Why sql.js needs WASM:
 * - SQLite is written in C, which cannot run directly in JavaScript
 * - sql.js uses Emscripten to compile SQLite's C code to WebAssembly (WASM)
 * - WASM provides near-native performance in browser/Node.js environments
 * - This is the standard way to run SQLite in JavaScript environments
 * 
 * Advantages:
 * - No native dependencies (no .node files, no compilation needed)
 * - Cross-platform compatible (works on all platforms that support WASM)
 * - Can be bundled into a single file
 * - Full SQLite feature support
 * 
 * Disadvantages:
 * - Slower than native modules (better-sqlite3)
 * - Higher memory usage (loads entire database into memory)
 * - Requires manual save to persist changes to disk
 * - WASM file needs to be loaded at runtime
 * 
 * This is the default implementation for Obsidian plugin marketplace compatibility.
 */
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import { Kysely, SqliteQueryCompiler, SqliteIntrospector, SqliteAdapter, type CompiledQuery } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { SqliteDatabase, SqliteStoreType } from '../types';
import initSqlJs, { Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

// Import inlined WASM binary (provided by esbuild plugin at build time)
// This is a virtual module that esbuild resolves to the actual WASM file
// Use dynamic import to handle both build-time and runtime scenarios
let sqlJsWasmBase64: string | undefined;

// Try to import the virtual module (will be resolved by esbuild at build time)
// In CommonJS output, we need to use require, but esbuild should inline it
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const wasmModule = require('sqljs-wasm');
	sqlJsWasmBase64 = wasmModule.wasmBase64;
} catch (error) {
	// If virtual module is not available (e.g., in development), we'll try to load from file system
	// This is expected in development mode
	sqlJsWasmBase64 = undefined;
}

/**
 * Custom SQLite driver that intercepts all execute operations for sql.js
 */
class CustomSqliteDriver {
	private db: SqlJsDatabase;

	constructor(db: SqlJsDatabase) {
		this.db = db;
	}

	async init(): Promise<void> {}
	async acquireConnection(): Promise<{ executeQuery: (query: CompiledQuery) => Promise<any>; streamQuery: (query: CompiledQuery, chunkSize?: number) => AsyncIterableIterator<any> }> {
		return {
			executeQuery: this.executeQuery.bind(this),
			streamQuery: this.streamQuery.bind(this)
		};
	}
	async beginTransaction(): Promise<void> { this.db.run('BEGIN TRANSACTION'); }
	async commitTransaction(): Promise<void> { this.db.run('COMMIT'); }
	async rollbackTransaction(): Promise<void> { this.db.run('ROLLBACK'); }
	async releaseConnection(): Promise<void> {}
	async destroy(): Promise<void> {}

	async executeQuery(compiledQuery: CompiledQuery): Promise<any> {
		const { sql, parameters } = compiledQuery;
		const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

		if (isSelect) {
			// For SELECT queries, use exec which returns results
			const results = parameters && parameters.length > 0
				? this.db.exec(sql, parameters as unknown as any[])
				: this.db.exec(sql);
			if (results.length > 0) {
				return {
					rows: results[0].values.map((row: any[]) => {
						const obj: any = {};
						results[0].columns.forEach((col: string, idx: number) => {
							obj[col] = row[idx];
						});
						return obj;
					}),
					insertId: undefined,
					numAffectedRows: undefined
				};
			} else {
				return {
					rows: [],
					insertId: undefined,
					numAffectedRows: undefined
				};
			}
		} else {
			// For non-SELECT queries, use run
			const result = parameters && parameters.length > 0
				? this.db.run(sql, parameters as unknown as any[]) as any
				: this.db.run(sql) as any;
			return {
				rows: [],
				insertId: result.insertId ? BigInt(result.insertId) : undefined,
				numAffectedRows: result.changes ? BigInt(result.changes) : undefined
			};
		}
	}

	async *streamQuery(compiledQuery: CompiledQuery, chunkSize?: number): AsyncIterableIterator<any> {
		const result = await this.executeQuery(compiledQuery);
		if (result.rows && Array.isArray(result.rows)) {
			if (chunkSize && chunkSize > 0) {
				for (let i = 0; i < result.rows.length; i += chunkSize) {
					const chunk = result.rows.slice(i, i + chunkSize);
					yield { ...result, rows: chunk };
				}
			} else {
				yield result;
			}
		} else {
			yield result;
		}
	}
}

/**
 * Minimal SQLite dialect using our custom driver for sql.js
 */
class CustomSqliteDialect {
	private db: SqlJsDatabase;

	constructor(db: SqlJsDatabase) {
		this.db = db;
	}

	createDriver() { return new CustomSqliteDriver(this.db); }
	createQueryCompiler() { return new SqliteQueryCompiler(); }
	createAdapter() { return new SqliteAdapter(); }
	createIntrospector(db: any) { return new SqliteIntrospector(db); }
}



/**
 * File-based SQLite store using sql.js.
 * 
 * This implementation uses sql.js (pure JavaScript SQLite),
 * providing cross-platform compatibility without native dependencies.
 * 
 * Note: sql.js loads the entire database into memory, so for large databases,
 * this may consume significant memory. Changes must be explicitly saved to disk.
 */
export class SqlJsStore implements SqliteDatabase {
	private db: SqlJsDatabase;
	private dbFilePath: string;
	private kyselyInstance: Kysely<DbSchema>;

	private constructor(db: SqlJsDatabase, dbFilePath: string) {
		this.db = db;
		this.dbFilePath = dbFilePath;

		// Create Kysely instance with custom dialect that intercepts all execute operations
		this.kyselyInstance = new Kysely<DbSchema>({
			dialect: new CustomSqliteDialect(db),
		});
	}

	/**
	 * Initialize sql.js library.
	 * This loads the WASM module and returns the SQL.js factory.
	 * 
	 * In Obsidian plugin environment, we use inlined WASM binary (from build time)
	 * to avoid Electron's file:// URL restrictions and file system access issues.
	 * 
	 * @param wasmBinary - Optional WASM binary data (ArrayBuffer). If not provided, will use inlined WASM or try file system.
	 */
	private static async initSqlJs(wasmBinary?: ArrayBuffer): Promise<SqlJsStatic> {
		if (wasmBinary) {
			// Use provided WASM binary
			return await initSqlJs({
				wasmBinary: wasmBinary,
			});
		}
		
		// Priority 1: Use inlined WASM binary (from build time)
		if (sqlJsWasmBase64) {
			try {
				// Convert Base64 to ArrayBuffer
				const binaryString = Buffer.from(sqlJsWasmBase64, 'base64');
				const wasmBinary = new Uint8Array(binaryString).buffer;
				
				console.log('[SqlJsStore] Using inlined WASM binary');
				return await initSqlJs({
					wasmBinary: wasmBinary as ArrayBuffer,
				});
			} catch (error) {
				console.warn('[SqlJsStore] Failed to use inlined WASM, trying file system:', error);
			}
		}
		
		// Priority 2: Try to load WASM file from file system (for development)
		try {
			const possiblePaths: string[] = [];
			
			// Try require.resolve if available (works in development)
			if (typeof require !== 'undefined' && typeof require.resolve === 'function') {
				try {
					possiblePaths.push(require.resolve('sql.js/dist/sql-wasm.wasm'));
				} catch (e) {
					// require.resolve failed, continue
				}
			}
			
			// Try path relative to current working directory (if node_modules exists)
			if (typeof process !== 'undefined' && process.cwd) {
				const cwd = process.cwd();
				if (cwd && cwd !== '/') {
					possiblePaths.push(path.join(cwd, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
				}
			}
			
			// Try to find WASM file in any of the possible paths
			for (const wasmPath of possiblePaths) {
				try {
					if (fs.existsSync(wasmPath)) {
						const wasmBuffer = fs.readFileSync(wasmPath);
						const wasmBinary = new Uint8Array(wasmBuffer).buffer;
						
						console.log('[SqlJsStore] Successfully loaded WASM file from:', wasmPath);
						return await initSqlJs({
							wasmBinary: wasmBinary as ArrayBuffer,
						});
					}
				} catch (error) {
					// Try next path
					continue;
				}
			}
			
			// If all paths failed, try default method (will likely fail in Electron)
			console.warn('[SqlJsStore] Could not find WASM file in expected locations, trying default method');
			console.warn('[SqlJsStore] Tried paths:', possiblePaths);
			return await initSqlJs({
				// Use default configuration
				// sql.js will try to locate WASM file automatically (may fail in Electron)
			});
		} catch (error) {
			// Fallback: let sql.js try to load WASM automatically
			// This will likely fail in Electron, but worth trying
			console.warn('[SqlJsStore] Failed to load WASM file, trying default method:', error);
			return await initSqlJs({
				// Use default configuration
				// sql.js will try to locate WASM file automatically
			});
		}
	}

	/**
	 * Open a new database connection.
	 * 
	 * @param params - Database parameters
	 * @param params.dbFilePath - Path to the SQLite database file
	 * @param params.wasmBinary - Optional WASM binary data (ArrayBuffer). If not provided, will try to load from file system.
	 * @returns Promise resolving to SqlJsStore instance
	 */
	static async open(params: { dbFilePath: string; wasmBinary?: ArrayBuffer }): Promise<SqlJsStore> {
		// Initialize sql.js with optional WASM binary
		const SQL = await SqlJsStore.initSqlJs(params.wasmBinary);
		
		// Load existing database or create new one
		let db: SqlJsDatabase;
		if (fs.existsSync(params.dbFilePath)) {
			try {
				const buffer = fs.readFileSync(params.dbFilePath);
				db = new SQL.Database(buffer);
			} catch (error) {
				console.warn('[SqlJsStore] Failed to load existing database, creating new one:', error);
				db = new SQL.Database();
			}
		} else {
			// Create new database
			db = new SQL.Database();
		}

		// Enable foreign keys
		db.run('PRAGMA foreign_keys = ON');

		// Set busy timeout to prevent infinite blocking on locked database
		// When database is locked (e.g., concurrent read/write operations),
		// operations will fail after 5 seconds instead of blocking indefinitely
		db.run('PRAGMA busy_timeout = 5000');

		console.log('[SqlJsStore] Set busy_timeout to 5000ms');

		// Note: sql.js (WASM) does not support loading SQLite extensions like sqlite-vec
		// Vector similarity search will not be available when using sql.js backend
		// To enable vector search, use better-sqlite3 backend instead
		console.warn(
			'[SqlJsStore] sql.js backend does not support SQLite extensions. ' +
			'vec_embeddings virtual table and vector similarity search will not be available. ' +
			'To enable vector search, use better-sqlite3 backend (set sqliteBackend to "better-sqlite3" in settings).'
		);

		// Run migrations directly with db (has exec method)
		migrateSqliteSchema(db);

		return new SqlJsStore(db, params.dbFilePath);
	}

	/**
	 * Save the database to disk.
	 * 
	 * sql.js keeps the database in memory, so changes must be explicitly saved.
	 * This method writes the current state to the file.
	 * 
	 * @param force - If true, save even if no changes were made
	 */
	save(force: boolean = false): void {
		if (!this.db) {
			throw new Error('Database is closed');
		}

		try {
			// Ensure directory exists
			const dir = path.dirname(this.dbFilePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Write database to file
			const data = this.db.export();
			fs.writeFileSync(this.dbFilePath, Buffer.from(data));
		} catch (error) {
			console.error('[SqlJsStore] Failed to save database:', error);
			throw error;
		}
	}

	/**
	 * Close the database connection with save option.
	 *
	 * Note: This will save the database to disk before closing, unless it's an in-memory database.
	 *
	 * @param saveBeforeClose - If true, save before closing (default: true)
	 */
	closeWithSave(saveBeforeClose: boolean = true): void {
		if (this.db) {
			// Don't save in-memory databases
			if (saveBeforeClose && this.dbFilePath !== ':memory:') {
				this.save();
			}
			this.db.close();
			this.db = null as any;
		}
	}

	/**
	 * Check if the database is open.
	 */
	isOpen(): boolean {
		return this.db !== null;
	}


	exec(sql: string): void {
		this.db.run(sql);
	}

	prepare(sql: string): any {
		return this.db.prepare(sql);
	}

	kysely<T = DbSchema>(): Kysely<T> {
		// This cast is safe because kyselyInstance is created with DbSchema.
		// For full type-safety, callers should only use the default type parameter.
		return this.kyselyInstance as unknown as Kysely<T>;
	}

	close(): void {
		this.closeWithSave(true);
	}

	databaseType(): SqliteStoreType {
		return 'sql.js';
	}
}

