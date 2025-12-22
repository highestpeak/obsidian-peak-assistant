import Database from 'better-sqlite3';
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';

/**
 * File-based SQLite store backed by better-sqlite3 (Desktop-only).
 *
 * Why this exists:
 * - Avoids the sql.js "import/export full bytes" model that scales memory with DB size.
 * - Persists directly to a user-configured path (e.g. plugin setting `dataStorageFolder`).
 *
 * Notes:
 * - This is an interim driver to unblock USKE rollout. It can be swapped to wa-sqlite later
 *   if we keep repo/search logic SQL-centric.
 * - Runs on the main thread. Callers should batch writes to avoid UI stalls.
 */
export class BetterSqliteStore {
	readonly kysely: Kysely<DbSchema>;
	readonly rawDb: Database.Database;

	private constructor(db: Database.Database) {
		this.rawDb = db;
		this.kysely = new Kysely<DbSchema>({
			dialect: new SqliteDialect({
				database: db,
			}),
		});
	}

	static open(params: { dbFilePath: string }): BetterSqliteStore {
		const db = new Database(params.dbFilePath);
		// WAL improves concurrency and write performance for typical indexing workloads.
		try {
			db.pragma('journal_mode = WAL');
		} catch {
			// Ignore if pragma is unavailable in the current build.
		}
		migrateSqliteSchema(db);
		return new BetterSqliteStore(db);
	}

	/**
	 * Execute a raw SQL string (useful for schema/pragma/FTS setup).
	 */
	exec(sql: string): void {
		this.rawDb.exec(sql);
	}

	/**
	 * Prepare a statement. Use `.run/.get/.all` on the returned statement.
	 */
	prepare(sql: string): Database.Statement {
		return this.rawDb.prepare(sql);
	}

	/**
	 * Run a transaction. Keep the body synchronous.
	 */
	transaction<T>(fn: () => T): T {
		return this.rawDb.transaction(fn)();
	}

	close(): void {
		// Ensure Kysely releases internal resources.
		try {
			void this.kysely.destroy();
		} catch {
			// Ignore
		}
		this.rawDb.close();
	}
}


