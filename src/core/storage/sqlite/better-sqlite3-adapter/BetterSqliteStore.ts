/**
 * File-based SQLite store backed by better-sqlite3 (native module).
 * 
 * Advantages:
 * - Native performance, no WASM overhead
 * - Synchronous API, no async/sync bridging needed
 * - Mature and stable
 * 
 * Requirements:
 * - better-sqlite3 must be installed in node_modules
 * - Native module (.node file) must be available at runtime
 */
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import { Kysely, SqliteDialect, type CompiledQuery, type TransactionSettings } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { SqliteDatabase, SqliteStatement } from '../types';
import type { App } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { executeCompiledQuery } from '../utils';

/**
 * Custom SQLite driver that intercepts all execute operations
 */
class CustomSqliteDriver {
	private rawDb: BetterSqliteAdapter;

	constructor(rawDb: BetterSqliteAdapter) {
		this.rawDb = rawDb;
	}

	async init(): Promise<void> {
		// No initialization needed
	}

	async acquireConnection(): Promise<{ executeQuery: (query: CompiledQuery) => Promise<any> }> {
		return {
			executeQuery: this.executeQuery.bind(this)
		};
	}

	async beginTransaction(connection: any, settings: TransactionSettings): Promise<void> {
		// Execute BEGIN TRANSACTION SQL command
		this.rawDb.exec('BEGIN TRANSACTION');
	}

	async commitTransaction(connection: any): Promise<void> {
		// Execute COMMIT SQL command
		this.rawDb.exec('COMMIT');
	}

	async rollbackTransaction(connection: any): Promise<void> {
		// Execute ROLLBACK SQL command
		this.rawDb.exec('ROLLBACK');
	}

	async releaseConnection(): Promise<void> {
		// Connection pooling not needed for better-sqlite3
	}

	async destroy(): Promise<void> {
		// Cleanup if needed
	}

	/**
	 * Custom executeQuery that uses our executeCompiledQuery logic
	 * This intercepts all SQL execution at the driver level
	 */
	async executeQuery(compiledQuery: CompiledQuery): Promise<any> {
		// Use our custom execution logic that bypasses Kysely's default behavior
		return executeCompiledQuery(compiledQuery, this.rawDb);
	}
}

/**
 * Custom SQLite dialect that uses our custom driver
 */
class CustomSqliteDialect extends SqliteDialect {
	private rawDb: BetterSqliteAdapter;

	constructor(rawDb: BetterSqliteAdapter) {
		super({
			database: rawDb as any
		});
		this.rawDb = rawDb;
	}

	createDriver(): any {
		return new CustomSqliteDriver(this.rawDb);
	}
}

// Don't import better-sqlite3 at the top level - load it dynamically to avoid module resolution errors

/**
 * Adapter implementation for better-sqlite3.
 * Implements the unified SqliteDatabase interface.
 */
export interface BetterSqliteAdapter extends SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): BetterSqliteStatement;
}

/**
 * Statement implementation for better-sqlite3.
 * Implements the unified SqliteStatement interface.
 */
interface BetterSqliteStatement extends SqliteStatement {
	bind(...params: any[]): BetterSqliteStatement;
	run(...params: any[]): { changes: number; lastInsertRowid: number };
	get(...params: any[]): any;
	all(...params: any[]): any[];
	finalize(): void;
}

/**
 * Type definition for better-sqlite3 Database.
 * We don't import it at the top level to avoid module resolution errors.
 */
type BetterSqlite3Database = {
	exec(sql: string): void;
	prepare(sql: string): any;
	pragma(sql: string): any;
	close(): void;
	open: boolean;
	loadExtension?(path: string): void;
};

/**
 * File-based SQLite store using better-sqlite3.
 * 
 * This implementation uses better-sqlite3's native SQLite bindings,
 * providing better performance than WebAssembly-based solutions.
 * 
 * Note: better-sqlite3 is loaded dynamically to avoid module resolution errors
 * in Obsidian plugin environment.
 */
export class BetterSqliteStore {
	private db: BetterSqlite3Database;
	public readonly kysely: Kysely<DbSchema>;
	public readonly rawDb: BetterSqliteAdapter;
	
	// Cache for better-sqlite3 module if successfully loaded
	private static cachedBetterSqlite3: typeof import('better-sqlite3') | null = null;

	private constructor(db: BetterSqlite3Database, adapter: BetterSqliteAdapter) {
		this.db = db;
		this.rawDb = adapter;

		// Create Kysely instance with custom dialect that intercepts all execute operations
		this.kysely = new Kysely<DbSchema>({
			dialect: new CustomSqliteDialect(adapter),
		});
	}

	/**
	 * Check if better-sqlite3 is available and working.
	 * 
	 * Note: In Obsidian (Electron) environment, better-sqlite3 may fail to load
	 * if the native module (.node file) is not compatible with Electron's Node.js version.
	 * 
	 * @param app - Obsidian app instance (optional, used for vault path resolution)
	 * @returns Promise resolving to true if better-sqlite3 is available and working
	 */
	static async checkAvailable(app?: App): Promise<boolean> {
		try {
			let betterSqlite3;

			// Strategy 1: Try normal require (works if node_modules is in require path)
			try {
				betterSqlite3 = require('better-sqlite3');
			} catch (requireError: any) {
				console.log('[BetterSqliteStore] Failed to require better-sqlite3. Trying to load from possible paths...',
					'Error message:', requireError.message,
					'Code:', requireError.code,
				);
				// Strategy 2: Try using absolute paths to plugin's node_modules
				if (requireError.code === 'MODULE_NOT_FOUND') {
					const possiblePaths = BetterSqliteStore.getPossiblePaths(app);

					for (const modulePath of possiblePaths) {
						betterSqlite3 = BetterSqliteStore.loadFromPath(modulePath);
						if (betterSqlite3) {
							console.log(`[BetterSqliteStore] Loaded better-sqlite3 from: ${modulePath}`);
							break;
						}
					}

					if (!betterSqlite3) {
						console.warn(
							[
								'[BetterSqliteStore] better-sqlite3 is not installed or not accessible.',
								`Tried paths: ${JSON.stringify(possiblePaths)}`,
								'To use better-sqlite3:',
								'1. Navigate to: .obsidian/plugins/obsidian-peak-assistant/',
								'2. Run: npm install better-sqlite3',
								'3. Rebuild for Electron (see README.md for details)',
								'Falling back to sql.js (default, works out of the box).'
							].join('\n')
						);
						return false;
					}
				} else {
					return false;
				}
			}

			const Database = betterSqlite3.default || betterSqlite3;

			// Check if it's a function (constructor)
			if (typeof Database !== 'function') {
				console.warn('[BetterSqliteStore] better-sqlite3 is not a function');
				return false;
			}

			// Try to create a temporary in-memory database to verify the native module works
			try {
				const testDb = new Database(':memory:');
				testDb.close();
				console.log('[BetterSqliteStore] better-sqlite3 native module is working');
				
				// Cache the module only after successful verification
				BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
				return true;
			} catch (error) {
				console.warn(
					'[BetterSqliteStore] better-sqlite3 module found but native binding failed. ' +
					'This is usually because the native module is missing or incompatible with Electron\'s Node.js version. ' +
					'To fix: Rebuild better-sqlite3 for Electron using electron-rebuild. ' +
					'See src/core/storage/README.md for detailed instructions. ' +
					'Falling back to sql.js (default, works out of the box).',
					error
				);
				return false;
			}
		} catch (error) {
			console.warn('[BetterSqliteStore] Unexpected error checking better-sqlite3:', error);
			return false;
		}
	}

	/**
	 * Get possible paths to better-sqlite3 module.
	 * Tries multiple strategies to find the plugin's node_modules directory.
	 */
	private static getPossiblePaths(app?: App): string[] {
		const paths: string[] = [];

		// Strategy 1: Try relative to vault base path (most reliable in Obsidian)
		if (app) {
			const basePath = (app.vault.adapter as any)?.basePath;
			if (basePath) {
				paths.push(path.join(basePath, '.obsidian', 'plugins', 'obsidian-peak-assistant', 'node_modules', 'better-sqlite3'));
			}
		}

		// Strategy 2: Try relative to current working directory
		if (typeof process !== 'undefined' && process.cwd) {
			const cwd = process.cwd();
			if (cwd && cwd !== '/') {
				paths.push(path.join(cwd, 'node_modules', 'better-sqlite3'));
			}
		}

		// Strategy 3: Try common Obsidian plugin locations
		if (typeof process !== 'undefined' && process.env) {
			if (process.env.HOME) {
				paths.push(path.join(process.env.HOME, '.obsidian', 'plugins', 'obsidian-peak-assistant', 'node_modules', 'better-sqlite3'));
			}
			if (process.env.USERPROFILE) {
				paths.push(path.join(process.env.USERPROFILE, '.obsidian', 'plugins', 'obsidian-peak-assistant', 'node_modules', 'better-sqlite3'));
			}
		}

		return paths;
	}

	/**
	 * Load better-sqlite3 from a specific path.
	 * Returns the module if successful, null otherwise.
	 */
	private static loadFromPath(modulePath: string): typeof import('better-sqlite3') | null {
		try {
			const packageJsonPath = path.join(modulePath, 'package.json');
			if (!fs.existsSync(packageJsonPath)) {
				return null;
			}

			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
			const mainFile = packageJson.main || 'index.js';
			const mainPath = path.join(modulePath, mainFile);

			if (fs.existsSync(mainPath)) {
				return require(mainPath);
			}
		} catch (error) {
			// Ignore errors, try next path
		}
		return null;
	}

	/**
	 * Dynamically load better-sqlite3 module.
	 * 
	 * Priority:
	 * 1. Use cached module (if available)
	 * 2. Try normal require (works if node_modules is in require path)
	 * 3. Try loading from require.cache (if already loaded)
	 * 4. Try loading from absolute paths (fallback)
	 */
	private static loadBetterSqlite3(app?: App): typeof import('better-sqlite3') {
		// Strategy 1: Use cached module
		if (BetterSqliteStore.cachedBetterSqlite3) {
			console.log('[BetterSqliteStore] Using cached better-sqlite3');
			return BetterSqliteStore.cachedBetterSqlite3;
		}
		
		// Strategy 2: Try normal require
		try {
			const module = require('better-sqlite3');
			BetterSqliteStore.cachedBetterSqlite3 = module;
			return module;
		} catch (requireError: any) {
			// Strategy 3: Check require.cache for already loaded module
			if (typeof require !== 'undefined' && require.cache) {
				for (const modulePath in require.cache) {
					if (modulePath.includes('better-sqlite3') && modulePath.includes('node_modules')) {
						const cachedModule = require.cache[modulePath];
						if (cachedModule && cachedModule.exports) {
							const exports = cachedModule.exports;
							// Extract Database constructor
							let Database = null;
							if (typeof exports === 'function') {
								Database = exports;
							} else if (exports && typeof exports === 'object') {
								Database = exports.default || exports.Database;
							}
							if (Database && typeof Database === 'function') {
								const module = { default: Database, Database: Database } as any;
								BetterSqliteStore.cachedBetterSqlite3 = module;
								console.log(`[BetterSqliteStore] Using better-sqlite3 from require.cache: ${modulePath}`);
								return module;
							}
						}
					}
				}
			}
			
			// Strategy 4: Try loading from absolute paths (only if MODULE_NOT_FOUND)
			if (requireError.code === 'MODULE_NOT_FOUND') {
				const possiblePaths = BetterSqliteStore.getPossiblePaths(app);
				
				for (const modulePath of possiblePaths) {
					const betterSqlite3 = BetterSqliteStore.loadFromPath(modulePath);
					if (betterSqlite3) {
						BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
						console.log(`[BetterSqliteStore] Loaded better-sqlite3 from: ${modulePath}`);
						return betterSqlite3;
					}
				}
				
				throw new Error(
					'better-sqlite3 is not installed or not accessible. ' +
					'Please install it in the plugin directory: .obsidian/plugins/obsidian-peak-assistant/ ' +
					'Run: npm install better-sqlite3'
				);
			}
			throw requireError;
		}
	}

	/**
	 * Get the cached better-sqlite3 module if available.
	 */
	static getCachedModule(): typeof import('better-sqlite3') | null {
		return BetterSqliteStore.cachedBetterSqlite3;
	}

	/**
	 * Open a new database connection.
	 * 
	 * @param params - Database parameters
	 * @param params.dbFilePath - Path to the SQLite database file
	 * @returns Promise resolving to object with store instance and sqliteVecAvailable flag
	 * @throws Error if better-sqlite3 native module cannot be loaded
	 */
	static async open(params: { dbFilePath: string; app?: App }): Promise<{ store: BetterSqliteStore; sqliteVecAvailable: boolean }> {
		// Dynamically load better-sqlite3 to avoid module resolution errors at import time
		const BetterSqlite3 = BetterSqliteStore.loadBetterSqlite3(params.app);
		const Database = BetterSqlite3.default || BetterSqlite3;
		
		let db: BetterSqlite3Database;
		try {
			db = new Database(params.dbFilePath, {
				// Enable WAL mode for better concurrency
				// This is the default, but we make it explicit
			}) as BetterSqlite3Database;

			// Immediately attempt to recover from any potential lock issues
			try {
				// Force a WAL checkpoint to clear any pending transactions
				db.pragma('wal_checkpoint(TRUNCATE)');
				console.log('[BetterSqliteStore] Initial WAL checkpoint completed');
			} catch (checkpointError) {
				console.warn('[BetterSqliteStore] Initial WAL checkpoint failed:', checkpointError);
			}
		} catch (error) {
			// If native module loading fails, provide a helpful error message
			if (error instanceof Error && (error.message.includes('indexOf') || error.message.includes('bindings'))) {
				throw new Error(
					'better-sqlite3 native module failed to load. ' +
					'This usually means the .node file is missing or incompatible. ' +
					'Please ensure better-sqlite3 is properly installed in the plugin directory, ' +
					'or use sql.js instead (set sqliteBackend to "sql.js" in settings). ' +
					`Original error: ${error.message}`
				);
			}
			throw error;
		}

		// Enable foreign keys
		db.pragma('foreign_keys = ON');

		// Set busy timeout to prevent infinite blocking on locked database
		// When database is locked (e.g., concurrent read/write operations),
		// operations will fail after 5 seconds instead of blocking indefinitely
		db.pragma('busy_timeout = 5000');

		// Attempt to recover from potential lock issues
		try {
			// Check if database is in a locked state and try to recover
			const walCheckpoint = db.pragma('wal_checkpoint(TRUNCATE)');
			console.log('[BetterSqliteStore] WAL checkpoint result:', walCheckpoint);
		} catch (error) {
			console.warn('[BetterSqliteStore] WAL checkpoint failed (may be normal):', error);
		}

		console.log('[BetterSqliteStore] Set busy_timeout to 5000ms');

		// Try to load sqlite-vec extension for vector similarity search
		const sqliteVecAvailable = BetterSqliteStore.tryLoadSqliteVec(db, params.app);

		// Create adapter
		const adapter = BetterSqliteStore.createKyselyAdapter(db);

		// Run migrations
		// better-sqlite3's Database has exec() method, so we can use it directly
		migrateSqliteSchema(adapter);

		return { store: new BetterSqliteStore(db, adapter), sqliteVecAvailable };
	}

	/**
	 * Finds the path to sqlite-vec extension file.
	 * Tries getLoadablePath() first, then falls back to manual path resolution.
	 */
	private static findSqliteVecExtensionPath(sqliteVec: any, app?: App): string | null {
		// Try getLoadablePath() first
		if (sqliteVec.getLoadablePath && typeof sqliteVec.getLoadablePath === 'function') {
			try {
				const extensionPath = sqliteVec.getLoadablePath();
				if (fs.existsSync(extensionPath)) {
					console.log(`[BetterSqliteStore] getLoadablePath() returned: ${extensionPath}`);
					return extensionPath;
				}
			} catch (pathError: any) {
				console.debug(`[BetterSqliteStore] getLoadablePath() failed: ${pathError instanceof Error ? pathError.message : String(pathError)}`);
			}
		}

		// Determine platform-specific package name and file extension
		const platform = process.platform;
		const arch = process.arch;
		let packageName: string;
		let fileExt: string;

		if (platform === 'darwin') {
			packageName = arch === 'arm64' ? 'sqlite-vec-darwin-arm64' : 'sqlite-vec-darwin-x64';
			fileExt = 'dylib';
		} else if (platform === 'linux') {
			packageName = arch === 'arm64' ? 'sqlite-vec-linux-arm64' : 'sqlite-vec-linux-x64';
			fileExt = 'so';
		} else if (platform === 'win32') {
			packageName = 'sqlite-vec-windows-x64';
			fileExt = 'dll';
		} else {
			throw new Error(`Unsupported platform: ${platform}-${arch}`);
		}

		// Build possible paths (without require.resolve, not available in Obsidian bundled environment)
		const possiblePaths: string[] = [];

		// Primary: Use Obsidian vault-based path (most reliable in plugin environment)
		if (app) {
			const basePath = (app.vault.adapter as any)?.basePath;
			if (basePath) {
				possiblePaths.push(
					path.join(basePath, '.obsidian', 'plugins', 'obsidian-peak-assistant', 'node_modules', packageName, `vec0.${fileExt}`)
				);
			}
		}

		// Fallback: Try process.cwd() based path
		try {
			possiblePaths.push(
				path.join(process.cwd(), 'node_modules', packageName, `vec0.${fileExt}`)
			);
		} catch {
			// process.cwd() may fail in some environments
		}

		console.log(`[BetterSqliteStore] Trying alternative paths: ${possiblePaths.join(', ')}`);
		for (const altPath of possiblePaths) {
			if (fs.existsSync(altPath)) {
				console.log(`[BetterSqliteStore] Found extension at: ${altPath}`);
				return altPath;
			}
		}

		return null;
	}

	/**
	 * Attempts to manually load sqlite-vec extension using db.loadExtension().
	 */
	private static tryManualLoadExtension(
		db: BetterSqlite3Database,
		sqliteVec: any,
		app?: App
	): boolean {
		if (!db.loadExtension) {
			return false;
		}

		try {
			const extensionPath = this.findSqliteVecExtensionPath(sqliteVec, app);
			if (!extensionPath) {
				console.warn(`[BetterSqliteStore] Could not find extension file.`);
				return false;
			}

			console.log(`[BetterSqliteStore] Loading extension manually from: ${extensionPath}`);
			db.loadExtension(extensionPath);

			// Verify extension is loaded
			const versionResult = db.prepare('SELECT vec_version() as version').get() as { version: string } | undefined;
			if (versionResult) {
				console.log(`[BetterSqliteStore] sqlite-vec extension loaded manually (version: ${versionResult.version})`);
				return true;
			}

			return false;
		} catch (manualError: any) {
			console.warn(`[BetterSqliteStore] Manual loading failed: ${manualError instanceof Error ? manualError.message : String(manualError)}`);
			return false;
		}
	}

	/**
	 * Try to load sqlite-vec extension for vector similarity search.
	 * If loading fails, returns false but doesn't throw error.
	 * This allows database to work without vector search (fulltext search still works).
	 * 
	 * @param db - Database instance to load extension into
	 * @returns true if extension loaded successfully, false otherwise
	 */
	private static tryLoadSqliteVec(db: BetterSqlite3Database, app?: App): boolean {
		try {
			// Dynamically load sqlite-vec to avoid module resolution errors
			// According to sqlite-vec docs, it should automatically handle platform-specific packages
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const sqliteVec = require('sqlite-vec');
			
			// sqlite-vec exports a load function that takes the database instance
			// It internally handles finding and loading the platform-specific extension
			const loadFn = sqliteVec.load || sqliteVec.default?.load;
			if (typeof loadFn !== 'function') {
				console.warn(
					'[BetterSqliteStore] sqlite-vec.load function not found. ' +
					'Vector similarity search will not be available.'
				);
				return false;
			}

			try {
				loadFn(db);
				// Verify extension is loaded by checking vec_version()
				const versionResult = db.prepare('SELECT vec_version() as version').get() as { version: string } | undefined;
				if (versionResult) {
					console.log(`[BetterSqliteStore] sqlite-vec extension loaded successfully (version: ${versionResult.version})`);
					return true;
				}
				// If vec_version() failed, extension may not be fully loaded
				console.warn('[BetterSqliteStore] sqlite-vec.load() succeeded but vec_version() failed. Extension may not be fully loaded.');
			} catch (loadError: any) {
				// Error during load() call - sqlite-vec.load() internally uses getLoadablePath() and db.loadExtension()
				// In Obsidian plugin environment, path resolution may fail due to __dirname pointing to bundled location
				const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
				
				// Try manual loading as fallback
				if (this.tryManualLoadExtension(db, sqliteVec, app)) {
					return true;
				}

				// Report the error
				console.warn(
					'[BetterSqliteStore] Failed to load sqlite-vec extension. ' +
					'Vector similarity search will not be available. ' +
					'According to sqlite-vec docs, platform packages should be automatically handled. ' +
					'If this error persists, ensure sqlite-vec and platform-specific packages are installed. ' +
					`Error: ${errorMsg}. Fulltext search will still work.`
				);
			}

			return false;
		} catch (requireError: any) {
			if (requireError.code === 'MODULE_NOT_FOUND') {
				console.warn(
					'[BetterSqliteStore] sqlite-vec extension is not installed. ' +
					'Vector similarity search will not be available. ' +
					'To enable it, install: npm install sqlite-vec'
				);
			} else {
				const errorMsg = requireError instanceof Error ? requireError.message : String(requireError);
				console.warn(
					'[BetterSqliteStore] Failed to require sqlite-vec. ' +
					'Vector similarity search will not be available. ' +
					`Error: ${errorMsg}. Fulltext search will still work.`
				);
			}
			return false;
		}
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null as any;
		}
	}

	/**
	 * Check if the database is open.
	 */
	isOpen(): boolean {
		return this.db !== null && this.db.open;
	}

	/**
	 * Execute a raw SQL string
	 */
	exec(sql: string): void {
		this.rawDb.exec(sql);
	}

    /**
     * Create adapter to make better-sqlite3 compatible with Kysely's SqliteDialect
     */
    private static createKyselyAdapter(db: BetterSqlite3Database): BetterSqliteAdapter {
        return {
            exec: (sql: string) => {
                db.exec(sql);
            },
            prepare: (sql: string): BetterSqliteStatement => {
                const stmt = db.prepare(sql);
                
                // Create a wrapper that properly handles bind() and preserves reader property
                // Kysely uses the reader property to determine if it's a SELECT query
                const createWrapper = (statement: any): BetterSqliteStatement => {
                    const wrapper: any = {
                        // Preserve the reader property so Kysely can determine if it's a SELECT query
                        get reader() {
                            return statement.reader;
                        },
                        bind: (...params: any[]) => {
                            // better-sqlite3 bind() returns a new bound statement
                            if (params.length > 0) {
                                const boundStmt = statement.bind(...params);
                                return createWrapper(boundStmt);
                            }
                            return createWrapper(statement);
                        },
                        run: (...params: any[]) => {
                            // better-sqlite3 run() accepts parameters directly
                            return statement.run(...params) as { changes: number; lastInsertRowid: number };
                        },
                        get: (...params: any[]) => {
                            // better-sqlite3 get() accepts parameters directly, or uses bound params if already bound
                            return params.length > 0 ? statement.get(...params) : statement.get();
                        },
                        all: (...params: any[]) => {
                            // better-sqlite3 all() accepts parameters directly, or uses bound params if already bound
                            return (params.length > 0 ? statement.all(...params) : statement.all()) as any[];
                        },
                        finalize: () => {
                            // better-sqlite3 statements are automatically finalized when garbage collected
                            // This is a no-op for compatibility with unified interface
                        },
                    };
                    return wrapper;
                };
                return createWrapper(stmt);
            },
        };
    }
}

