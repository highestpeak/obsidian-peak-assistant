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
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { SqliteDatabase, SqliteStatement } from '../types';
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
 * Adapter implementation for sql.js.
 * Implements the unified SqliteDatabase interface.
 */
export interface SqlJsAdapter extends SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): SqlJsStatement;
}

/**
 * Statement implementation for sql.js.
 * Implements the unified SqliteStatement interface.
 */
interface SqlJsStatement extends SqliteStatement {
	bind(...params: any[]): SqlJsStatement;
	run(...params: any[]): { changes: number; lastInsertRowid: number };
	get(...params: any[]): any;
	all(...params: any[]): any[];
	finalize(): void;
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
export class SqlJsStore {
	private db: SqlJsDatabase;
	private dbFilePath: string;
	public readonly kysely: Kysely<DbSchema>;
	public readonly rawDb: SqlJsAdapter;

	private constructor(db: SqlJsDatabase, adapter: SqlJsAdapter, dbFilePath: string) {
		this.db = db;
		this.rawDb = adapter;
		this.dbFilePath = dbFilePath;
		
		// Create Kysely instance with sql.js adapter
		this.kysely = new Kysely<DbSchema>({
			dialect: new SqliteDialect({
				database: adapter as any,
			}),
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

		// Note: sql.js (WASM) does not support loading SQLite extensions like sqlite-vec
		// Vector similarity search will not be available when using sql.js backend
		// To enable vector search, use better-sqlite3 backend instead
		console.warn(
			'[SqlJsStore] sql.js backend does not support SQLite extensions. ' +
			'vec_embeddings virtual table and vector similarity search will not be available. ' +
			'To enable vector search, use better-sqlite3 backend (set sqliteBackend to "better-sqlite3" in settings).'
		);

		// Create adapter
		const adapter = SqlJsStore.createKyselyAdapter(db);

		// Run migrations
		// Note: vec_embeddings table creation will fail with sql.js, but that's expected
		migrateSqliteSchema(adapter);

		return new SqlJsStore(db, adapter, params.dbFilePath);
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
	 * Close the database connection.
	 * 
	 * Note: This will save the database to disk before closing.
	 * 
	 * @param saveBeforeClose - If true, save before closing (default: true)
	 */
	close(saveBeforeClose: boolean = true): void {
		if (this.db) {
			if (saveBeforeClose) {
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

	/**
	 * Execute a raw SQL string
	 */
	exec(sql: string): void {
		this.rawDb.exec(sql);
	}

    /**
     * Create adapter to make sql.js compatible with Kysely's SqliteDialect
     */
    private static createKyselyAdapter(db: SqlJsDatabase): SqlJsAdapter {
        return {
            exec: (sql: string) => {
                db.run(sql);
            },
            prepare: (sql: string): SqlJsStatement => {
                const stmt = db.prepare(sql);
                return {
                    bind: (...params: any[]) => {
                        // sql.js uses bind() with array or individual parameters
                        if (params.length > 0) {
                            stmt.bind(params);
                        }
                        return stmt as any;
                    },
                    run: (...params: any[]) => {
                        stmt.bind(params);
                        stmt.step();
                        const changes = db.getRowsModified();
                        // Get last insert rowid
                        const lastInsertRowidResult = db.exec("SELECT last_insert_rowid()");
                        const lastInsertRowid = lastInsertRowidResult.length > 0 && lastInsertRowidResult[0].values.length > 0
                            ? (lastInsertRowidResult[0].values[0][0] as number)
                            : 0;
                        stmt.reset();
                        return { changes, lastInsertRowid };
                    },
                    get: (...params: any[]) => {
                        stmt.bind(params);
                        const hasRow = stmt.step();
                        const result = hasRow ? stmt.getAsObject({}) : null;
                        stmt.reset();
                        return result;
                    },
                    all: (...params: any[]) => {
                        stmt.bind(params);
                        const results: any[] = [];
                        while (stmt.step()) {
                            results.push(stmt.getAsObject({}));
                        }
                        stmt.reset();
                        return results;
                    },
                    finalize: () => {
                        stmt.free();
                    },
                };
            },
        };
    }
}

