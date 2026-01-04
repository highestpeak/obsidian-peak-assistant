/**
 * Database schema definition for type safety.
 */
export interface Database {
	doc_meta: {
		id: string;
		// path almost is the primary key
		path: string;
		type: string | null;
		title: string | null;
		size: number | null;
		mtime: number | null;
		ctime: number | null;
		content_hash: string | null;
		summary: string | null;
		tags: string | null;
		last_processed_at: number | null;
		frontmatter_json?: string | null;
	};
	index_state: {
		key: string;
		value: string | null;
	};
	embedding: {
		id: string;
		doc_id: string;
		chunk_id: string | null;
		chunk_index: number | null;
		content_hash: string;
		ctime: number;
		mtime: number;
		embedding: Buffer; // BLOB: binary format for efficient storage
		embedding_model: string;
		embedding_len: number;
	};
	doc_statistics: {
		doc_id: string;
		word_count: number | null;
		char_count: number | null;
		language: string | null;
		richness_score: number | null;
		last_open_ts: number | null;
		open_count: number | null;
		updated_at: number;
	};
	graph_nodes: {
		/**
		 * Node ID - normalized path (for document nodes) or prefixed identifier (for tags, categories, etc.).
		 * For document nodes, this should be the normalized file path relative to vault root. 
		 *     Because we can not ensure the document id during indexing as the target node may not be created yet.
		 */
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at: number;
		updated_at: number;
	};
	graph_edges: {
		id: string;
		from_node_id: string;
		to_node_id: string;
		type: string;
		weight: number;
		attributes: string;
		created_at: number;
		updated_at: number;
	};
	doc_chunk: {
		chunk_id: string;
		doc_id: string;
		chunk_index: number;
		title: string | null;
		mtime: number | null;
		content_raw: string | null;
		content_fts_norm: string | null;
	};
	/**
	 * FTS5 virtual table.
	 *
	 * Notes:
	 * - This is a virtual table; schema here is used for typing only.
	 * - Some operations (MATCH/bm25) still require raw SQL.
	 * - doc_id is stored for association, path is kept for display purposes only.
	 */
	doc_fts: {
		chunk_id: string;
		doc_id: string;
		path: string;
		title: string | null;
		content: string | null;
	};
	chat_project: {
		project_id: string;
		name: string;
		folder_rel_path: string;
		created_at_ts: number;
		updated_at_ts: number;
		archived_rel_path: string | null;
		meta_json: string | null;
	};
	chat_conversation: {
		conversation_id: string;
		project_id: string | null;
		title: string;
		file_rel_path: string;
		created_at_ts: number;
		updated_at_ts: number;
		active_model: string | null;
		active_provider: string | null;
		token_usage_total: number | null;
		title_manually_edited: number;
		title_auto_updated: number;
		context_last_updated_ts: number | null;
		context_last_message_index: number | null;
		archived_rel_path: string | null;
		meta_json: string | null;
	};
	chat_message: {
		message_id: string;
		conversation_id: string;
		role: string;
		content_hash: string | null;
		created_at_ts: number;
		created_at_zone: string | null;
		model: string | null;
		provider: string | null;
		starred: number;
		is_error: number;
		is_visible: number;
		gen_time_ms: number | null;
		token_usage_json: string | null;
		thinking: string | null;
		content_preview: string | null;
		attachment_summary: string | null;
	};
	chat_message_resource: {
		id: string;
		message_id: string;
		source: string;
		kind: string | null;
		summary_note_rel_path: string | null;
		meta_json: string | null;
	};
	chat_star: {
		/**
		 * The source message id (stable key).
		 */
		source_message_id: string;
		/**
		 * Separate id for UI/reference needs.
		 */
		id: string;
		conversation_id: string;
		project_id: string | null;
		created_at_ts: number;
		active: number;
	};
}


/**
 * Database interface that supports both sql.js and better-sqlite3.
 * Both libraries provide an `exec()` method for running SQL statements.
 */
interface SqliteDatabaseLike {
	exec(sql: string): void;
}

/**
 * Apply schema migrations. Keep this idempotent.
 *
 * Supports both:
 * - sql.js Database (from @/core/storage/sqlite/SqliteMetadataStore - deprecated)
 * - better-sqlite3 Database (from @/core/storage/sqlite/BetterSqliteStore)
 *
 * Both implement the `exec()` method, so this migration works with either.
 * Uses raw SQL for simplicity and full SQLite feature support (FTS5, etc.).
 */
export function migrateSqliteSchema(db: SqliteDatabaseLike): void {
	const tryExec = (sql: string) => {
		try {
			db.exec(sql);
		} catch (error) {
			// Ignore migration errors for idempotency (e.g., "duplicate column name").
			// For vec_embeddings, if creation fails, we log a warning but don't throw
			// The SqliteStoreManager tracks whether vector search is available via a flag
			if (sql.includes('vec_embeddings')) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.warn(
					'[DDL] Failed to create vec_embeddings virtual table. ' +
					'Vector similarity search will not be available. ' +
					'This requires sqlite-vec extension to be loaded. ' +
					`Error: ${errorMsg}`
				);
				// Don't throw - allow database to continue without vector search
				return;
			}
			// For other errors, ignore for idempotency
		}
	};

	db.exec(`
		CREATE TABLE IF NOT EXISTS doc_meta (
			id TEXT PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			type TEXT,
			title TEXT,
			size INTEGER,
			mtime INTEGER,
			ctime INTEGER,
			content_hash TEXT,
			summary TEXT,
			tags TEXT,
			last_processed_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_doc_meta_path ON doc_meta(path);
		CREATE INDEX IF NOT EXISTS idx_doc_meta_content_hash ON doc_meta(content_hash);
		CREATE TABLE IF NOT EXISTS index_state (
			key TEXT PRIMARY KEY,
			value TEXT
		);
		CREATE TABLE IF NOT EXISTS embedding (
			id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_id TEXT,
			chunk_index INTEGER,
			content_hash TEXT NOT NULL,
			ctime INTEGER NOT NULL,
			mtime INTEGER NOT NULL,
			embedding BLOB NOT NULL,
			embedding_model TEXT NOT NULL,
			embedding_len INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_embedding_doc_id ON embedding(doc_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_chunk_id ON embedding(chunk_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_content_hash ON embedding(content_hash);
		CREATE TABLE IF NOT EXISTS doc_statistics (
			doc_id TEXT PRIMARY KEY,
			word_count INTEGER,
			char_count INTEGER,
			language TEXT,
			richness_score REAL,
			last_open_ts INTEGER,
			open_count INTEGER,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_doc_statistics_doc_id ON doc_statistics(doc_id);
		CREATE INDEX IF NOT EXISTS idx_doc_statistics_last_open_ts ON doc_statistics(last_open_ts);
		CREATE TABLE IF NOT EXISTS graph_nodes (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			label TEXT NOT NULL,
			attributes TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);
		CREATE INDEX IF NOT EXISTS idx_graph_nodes_updated_at ON graph_nodes(updated_at);
		CREATE TABLE IF NOT EXISTS graph_edges (
			id TEXT PRIMARY KEY,
			from_node_id TEXT NOT NULL,
			to_node_id TEXT NOT NULL,
			type TEXT NOT NULL,
			weight REAL NOT NULL DEFAULT 1.0,
			attributes TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (from_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
			FOREIGN KEY (to_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_graph_edges_from_node ON graph_edges(from_node_id);
		CREATE INDEX IF NOT EXISTS idx_graph_edges_to_node ON graph_edges(to_node_id);
		CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(type);
		CREATE INDEX IF NOT EXISTS idx_graph_edges_from_to ON graph_edges(from_node_id, to_node_id);
	`);

	// USKE extensions (idempotent adds).
	// Dynamic metadata storage (frontmatter JSON).
	tryExec(`ALTER TABLE doc_meta ADD COLUMN frontmatter_json TEXT;`);

	// Chunk storage for FTS/vector/search snippets.
	db.exec(`
		CREATE TABLE IF NOT EXISTS doc_chunk (
			chunk_id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			title TEXT,
			mtime INTEGER,
			content_raw TEXT,
			content_fts_norm TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id ON doc_chunk(doc_id);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id_chunk ON doc_chunk(doc_id, chunk_index);
	`);


	// FTS5 virtual table for document content (stores normalized text).
	// Note: tokenize options may vary by SQLite build; keep it simple for compatibility.
	// Kysely doesn't support virtual tables, so we use raw SQL.
	tryExec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);

	// FTS5 virtual table for document metadata (title/path).
	// Separate from content FTS to avoid redundant storage and enable weighted search.
	tryExec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
			doc_id UNINDEXED,
			path,
			title
		);
	`);

	// sqlite-vec virtual table for vector similarity search.
	// 
	// WHY IS VEC0 VIRTUAL TABLE REQUIRED?
	// ====================================
	// SQLite's standard indexes (B-tree, Hash) can only handle scalar values (numbers, strings).
	// They cannot efficiently handle vector similarity search (KNN) which requires:
	// 1. Multi-dimensional distance calculations (cosine similarity, euclidean distance)
	// 2. Approximate Nearest Neighbor (ANN) indexes (HNSW, IVF, etc.)
	// 3. Custom operators like MATCH for KNN queries
	//
	// vec0 virtual table provides:
	// - Custom storage optimized for vectors
	// - Built-in ANN indexes (HNSW) for O(log n) search complexity
	// - MATCH operator for efficient KNN queries
	//
	// SQLite's architecture does NOT allow:
	// - Using virtual table indexes on regular tables
	// - Adding custom operators to regular tables
	// - Modifying regular table's index algorithms
	//
	// Therefore, vec0 virtual table is the ONLY way to achieve efficient vector search in SQLite.
	//
	// For detailed explanation, see: VEC0_VIRTUAL_TABLE_EXPLANATION.md
	//
	// Note: This requires sqlite-vec extension to be loaded first.
	// vec_embeddings virtual table is created lazily on first insert in EmbeddingRepo.upsert()
	// This ensures the table dimension matches the actual embedding model dimension.
	// We don't create it here to avoid hardcoding a dimension that might not match the model.
	//
	// Important: vec_embeddings.rowid corresponds to embedding table's implicit rowid (integer).
	// This allows direct association without a mapping table.
	// When inserting into vec_embeddings, we use embedding table's rowid as vec_embeddings.rowid.
	// tryExec(`
	// 	CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
	// 		embedding float[1536]
	// 	);
	// `);

	// Chat storage tables (metadata-only, markdown files store plain text)
	db.exec(`
		CREATE TABLE IF NOT EXISTS chat_project (
			project_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			folder_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
			archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_project_folder_path ON chat_project(folder_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_project_updated_at ON chat_project(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_conversation (
			conversation_id TEXT PRIMARY KEY,
			project_id TEXT,
			title TEXT NOT NULL,
			file_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
		active_model TEXT,
		active_provider TEXT,
		token_usage_total INTEGER,
		title_manually_edited INTEGER NOT NULL DEFAULT 0,
		title_auto_updated INTEGER NOT NULL DEFAULT 0,
		context_last_updated_ts INTEGER,
		context_last_message_index INTEGER,
		archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_project_id ON chat_conversation(project_id);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_file_path ON chat_conversation(file_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_updated_at ON chat_conversation(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_message (
			message_id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content_hash TEXT,
			created_at_ts INTEGER NOT NULL,
			created_at_zone TEXT,
			model TEXT,
			provider TEXT,
			starred INTEGER NOT NULL DEFAULT 0,
			is_error INTEGER NOT NULL DEFAULT 0,
			is_visible INTEGER NOT NULL DEFAULT 1,
			gen_time_ms INTEGER,
			token_usage_json TEXT,
			thinking TEXT,
			content_preview TEXT,
			attachment_summary TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_id ON chat_message(conversation_id);
		CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(created_at_ts);
	`);
	tryExec(`
		ALTER TABLE chat_message ADD COLUMN content_preview TEXT;
	`);
	tryExec(`
		ALTER TABLE chat_message ADD COLUMN attachment_summary TEXT;
	`);
	tryExec(`
		ALTER TABLE chat_conversation ADD COLUMN context_last_updated_ts INTEGER;
	`);
	tryExec(`
		ALTER TABLE chat_conversation ADD COLUMN context_last_message_index INTEGER;
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS chat_message_resource (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			source TEXT NOT NULL,
			kind TEXT,
			summary_note_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_resource_message_id ON chat_message_resource(message_id);
		CREATE TABLE IF NOT EXISTS chat_star (
			source_message_id TEXT PRIMARY KEY,
			id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			project_id TEXT,
			created_at_ts INTEGER NOT NULL,
			active INTEGER NOT NULL DEFAULT 1
		);
		CREATE INDEX IF NOT EXISTS idx_chat_star_active ON chat_star(active);
		CREATE INDEX IF NOT EXISTS idx_chat_star_conversation_id ON chat_star(conversation_id);
	`);
}


