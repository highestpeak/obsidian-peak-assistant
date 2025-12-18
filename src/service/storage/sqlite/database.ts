/**
 * Database schema definition for type safety.
 */
export interface Database {
	doc_meta: {
		path: string;
		title: string | null;
		type: string | null;
		mtime: number | null;
	};
	recent_open: {
		path: string;
		last_open_ts: number | null;
		open_count: number | null;
	};
	index_state: {
		key: string;
		value: string | null;
	};
}

type SqlJsDatabase = any;

/**
 * Apply schema migrations. Keep this idempotent.
 */
export function migrateSqliteSchema(db: SqlJsDatabase): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS doc_meta (
			path TEXT PRIMARY KEY,
			title TEXT,
			type TEXT,
			mtime INTEGER
		);
		CREATE TABLE IF NOT EXISTS recent_open (
			path TEXT PRIMARY KEY,
			last_open_ts INTEGER,
			open_count INTEGER
		);
		CREATE TABLE IF NOT EXISTS index_state (
			key TEXT PRIMARY KEY,
			value TEXT
		);
	`);
}

