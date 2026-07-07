/**
 * Indexed vault document fields (DTO). Persisted on `mobius_node` where `type = document`; not a separate table.
 */
export interface IndexedDocumentRecord {
	id: string;
	path: string;
	type: string | null;
	title: string | null;
	size: number | null;
	mtime: number | null;
	ctime: number | null;
	content_hash: string | null;
	summary: string | null;
	/** Long summary from `attributes_json.full_summary` when present (not a separate column). */
	full_summary?: string | null;
	tags: string | null;
	last_processed_at: number | null;
	frontmatter_json?: string | null;
	/** Same-row statistics on `mobius_node` (optional; filled during indexing). */
	word_count?: number | null;
	char_count?: number | null;
	last_open_ts?: number | null;
	/** When set, written to `mobius_node.updated_at` for this document row. */
	row_updated_at?: number | null;
	/** LLM / frontmatter-derived creation estimate; persisted as `mobius_node.infer_created_at` (not filesystem `ctime`). */
	infer_created_at?: number | null;
}

/**
 * Database schema definition for type safety.
 */
export interface Database {
	/** Logical graph node DTO (rows live in `mobius_node`). */
	graph_nodes: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at: number;
		updated_at: number;
	};
	/** Logical graph edge DTO (rows live in `mobius_edge`). */
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
	/** Logical doc statistics DTO (columns on `mobius_node` for document rows). */
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
	index_state: {
		key: string;
		value: string | null;
	};
	embedding: {
		id: string;
		doc_id: string;
		chunk_id: string | null;
		chunk_index: number | null;
		/** Redundant copy of `doc_chunk.chunk_type` for fast KNN filtering; SSOT is `doc_chunk`. */
		chunk_type: string | null;
		content_hash: string;
		ctime: number;
		mtime: number;
		embedding: Buffer; // BLOB: binary format for efficient storage
		embedding_model: string;
		embedding_len: number;
	};
	doc_chunk: {
		chunk_id: string;
		doc_id: string;
		chunk_index: number;
		chunk_type: string;
		chunk_meta_json: string | null;
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
	/** FTS5 virtual table for stemmed content (Porter Stemmer morphological matching). */
	doc_fts_stem: {
		chunk_id: string;
		doc_id: string;
		content: string;
	};
	/** Search click-through log for learning-to-rank signals. */
	search_click: {
		query_stems: string;
		path: string;
		rank: number;
		ts: number;
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
		topic: string | null;
		suggested_followups_json: string | null;
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
	/**
	 * Hashes of documents already summarized for user profile.
	 * Compare by content hash to skip unchanged docs; all data in this table are hashes.
	 */
	user_profile_processed_hash: {
		content_hash: string;
		processed_at: number;
	};
	/**
	 * AI analysis records generated from the Quick Search AI tab.
	 *
	 * Design:
	 * - Large content lives in a vault markdown file (vault_rel_path)
	 * - This table stores lightweight metadata for listing/pagination
	 */
	ai_analysis_record: {
		id: string;
		vault_rel_path: string;
		query: string | null;
		/** Short display title (from AI at end of analysis). */
		title: string | null;
		created_at_ts: number;
		web_enabled: number;
		estimated_tokens: number | null;
		sources_count: number | null;
		topics_count: number | null;
		graph_nodes_count: number | null;
		graph_edges_count: number | null;
		duration: number | null;
		/** Analysis preset for history icon and restore: vaultFull | aiGraph. */
		analysis_preset: string | null;
	};
	query_pattern: {
		id: string;
		template: string;
		variables: string;       // JSON string array
		conditions: string;      // JSON MatchCondition
		source: string;          // "default" | "discovered"
		confidence: number;
		usage_count: number;
		discovered_at: number;
		last_used_at: number | null;
		deprecated: number;      // 0 = active, 1 = deprecated
	};
	/**
	 * Unified graph + doc meta node store (no FKs). Tag stats live on type=tag rows.
	 * Tag-specific extras (e.g. quality flags) use `attributes_json`, not dedicated columns.
	 */
	mobius_node: {
		node_id: string;
		type: string;
		label: string;
		created_at: number;
		infer_created_at: number | null;
		updated_at: number;
		last_open_ts: number | null;
		open_count: number | null;
		path: string | null;
		title: string | null;
		size: number | null;
		mtime: number | null;
		ctime: number | null;
		content_hash: string | null;
		summary: string | null;
		tags_json: string | null;
		word_count: number | null;
		char_count: number | null;
		language: string | null;
		richness_score: number | null;
		doc_incoming_cnt: number | null;
		doc_outgoing_cnt: number | null;
		other_incoming_cnt: number | null;
		other_outgoing_cnt: number | null;
		tag_doc_count: number | null;
		/** Vault PageRank score (reference subgraph); not stored in `attributes_json`. */
		pagerank: number | null;
		pagerank_updated_at: number | null;
		pagerank_version: number | null;
		/** Weighted PageRank on `semantic_related` subgraph. */
		semantic_pagerank: number | null;
		semantic_pagerank_updated_at: number | null;
		semantic_pagerank_version: number | null;
		/**
		 * Folder-only: mean intra-folder cohesion (tags/titles + semantic_related density), 0..1.
		 * Populated by {@link IndexService} folder hub stats rebuild; null for non-folder rows.
		 */
		folder_cohesion_score: number | null;
		/** Timestamp when hub was last marked stale (ms since epoch); null = not stale. */
		hub_stale_since: number | null;
		/** Monotonic counter incremented each time semantic edges are rebuilt for this node. */
		semantic_edges_version: number;
		attributes_json: string;
		/** Brandes betweenness centrality, normalized [0,1]. */
		betweenness_centrality: number | null;
		/** Burt structural constraint coefficient. */
		structural_constraint: number | null;
		/** Louvain community assignment (e.g. "c_0"). */
		community_id: string | null;
		/** Monotonic version of the last structural analysis run that touched this row. */
		structural_analysis_version: number | null;
	};
	/** Graph edges without foreign keys (parallel to graph_edges). */
	mobius_edge: {
		id: string;
		from_node_id: string;
		to_node_id: string;
		type: string;
		label: string | null;
		weight: number;
		attributes_json: string;
		created_at: number;
		updated_at: number;
	};
	/** User / product operation log (meta DB primary insert target). */
	mobius_operation: {
		id: string;
		operation_type: string;
		operation_desc: string;
		created_at: number;
		related_kind: string | null;
		related_id: string | null;
		important_level: number | null;
		continuous_group_id: string | null;
		meta_json: string | null;
	};
	/** Ambient push log: records proactive note suggestions and user responses. */
	ambient_push_log: {
		id: number | undefined; // AUTOINCREMENT — omit on insert
		timestamp: number;
		trigger_type: string;
		source_file_path: string;
		context_paragraph: string | null;
		pushed_file_path: string;
		pushed_score: number;
		explanation_type: string;
		explanation_text: string;
		user_action: string | null;
		user_action_ts: number | null;
	};
	/** Hub membership tracking: which notes belong to which hub doc (S6 path-based schema). */
	hub_constituent: {
		hub_node_id: string;
		hub_path: string;
		member_path: string;
		member_node_id: string | null;
		source_kind: string;
		added_at: number;
	};
	/** Hub regeneration queue: tracks stale hubs pending background regeneration. */
	hub_regen_queue: {
		hub_node_id: string;
		hub_path: string;
		queued_at: number;
		trigger_paths: string;
		priority: number;
		status: string;
		last_attempt: number | null;
		fail_count: number;
		error_message: string | null;
	};
	/** Hub Curator agent output: one plan per curator run, retained ~20. */
	hub_curation_plan: {
		plan_id: string;
		curated_at: number;
		trigger: string;
		coverage_pct: number;
		confidence: number;
		iterations: number;
		total_hubs: number;
		decisions_json: string;
		world_summary: string | null;
		executor_status: string;
		executor_error: string | null;
	};
	/** Cascade update debt tracking: pending side-effect work after document index changes. */
	cascade_debt: {
		id: number | undefined; // AUTOINCREMENT — omit on insert
		tenant: string;
		source_path: string;
		target_id: string;
		debt_type: string;
		priority: number;
		change_magnitude: number | null;
		created_at: number;
		processed_at: number | null;
	};
	/** Vault lint scan results (vault DB). */
	vault_lint_scan: {
		id: string;
		scan_type: string;
		started_at: number;
		completed_at: number | null;
		duration_ms: number | null;
		total_notes: number;
		health_score: number | null;
		dim_structural: number | null;
		dim_content: number | null;
		dim_temporal: number | null;
		dim_semantic: number | null;
		dim_tags: number | null;
		signal_counts: string;
		config_hash: string | null;
	};
	/** Individual lint findings per scan (vault DB). */
	vault_lint_finding: {
		id: string;
		scan_id: string;
		signal_id: string;
		severity: string;
		file_path: string | null;
		title: string;
		description: string | null;
		fix_actions: string;
		metadata: string;
		status: string;
		dismissed_at: number | null;
		fixed_at: number | null;
	};
	/** User dismissals of lint signals (vault DB). */
	vault_lint_dismissal: {
		signal_id: string;
		file_path: string;
		dismissed_at: number;
		reason: string | null;
		snooze_until: number | null;
	};
	tag_suggestion: {
		id: string;
		doc_path: string;
		tag: string;
		category: string;
		confidence: number;
		sources: string;
		reason: string;
		is_existing: number;
		status: string;
		edited_tag: string | null;
		created_at: number;
		resolved_at: number | null;
		batch_id: string | null;
	};
	structural_analysis_state: {
		key: string;
		value: string;
	};
	community_metadata: {
		community_id: string;
		label: string;
		member_count: number;
		dominant_topics_json: string;
		top_nodes_json: string;
		internal_density: number;
		centroid_embedding: Buffer | null;
		analysis_version: number;
	};
	structural_holes: {
		id: string;
		community_a_id: string;
		community_b_id: string;
		gap_type: string;
		gap_score: number;
		semantic_bridge_potential: number;
		inter_density: number;
		existing_bridge_count: number;
		potential_bridges_json: string;
		explanation: string | null;
		status: string;
		analysis_version: number;
		created_at: number;
	};
	usage_log: {
		id: number;
		session_id: string;
		feature: string;
		action: string;
		provider: string;
		model: string;
		input_tokens: number;
		output_tokens: number;
		cached_tokens: number;
		reasoning_tokens: number;
		cost_usd: number;
		duration_ms: number;
		is_streaming: number;
		created_at: number;
		metadata_json: string | null;
	};
	usage_daily: {
		id: number;
		date: string;
		feature: string;
		action: string;
		provider: string;
		model: string;
		call_count: number;
		total_input_tokens: number;
		total_output_tokens: number;
		total_cached_tokens: number;
		total_reasoning_tokens: number;
		total_cost_usd: number;
		avg_duration_ms: number;
		max_duration_ms: number;
	};
	/**
	 * Outcome events that follow a usage_log row (vault save, copilot accept,
	 * search click, agent file emit, continuation). Telemetry layer for the
	 * Usage Dashboard's "useful message" / MPG metric — also reusable by
	 * agent-trace / copilot-review / search-analytics surfaces.
	 */
	usage_outcome: {
		id: number | undefined; // AUTOINCREMENT — omit on insert
		message_id: string;
		session_id: string;
		event_type: string;
		occurred_at: number;
		target: string | null;
		metadata_json: string | null;
	};
	/**
	 * Harness procedural memory: distilled insights from past agent loops.
	 * Written by an offline batch job (M5+); M3 only ships the storage layer.
	 */
	harness_reflection: {
		id: number | undefined; // AUTOINCREMENT — omit on insert
		loop_id: string;
		agent_name: string;
		insight: string;
		created_at: number;
		metadata_json: string | null;
	};
}

export type UsageLogRow = Database['usage_log'];
export type UsageDailyRow = Database['usage_daily'];
export type UsageOutcomeRow = Database['usage_outcome'];

/**
 * Database interface for schema creation (exec + optional prepare for migrations).
 */
interface SqliteDatabaseLike {
	exec(sql: string): void;
	prepare?(sql: string): { all(): unknown[] };
}

function tableColumns(db: SqliteDatabaseLike, tableName: string): Set<string> | null {
	const rows = db.prepare?.(`PRAGMA table_info(${tableName})`)?.all() as Array<{ name?: unknown }> | undefined;
	if (!rows || rows.length === 0) return null;
	return new Set(rows.map(row => String(row.name)));
}

function resetDerivedTableWhenColumnsDiffer(
	db: SqliteDatabaseLike,
	tableName: string,
	requiredColumns: string[],
): void {
	try {
		const columns = tableColumns(db, tableName);
		if (!columns) return;
		if (requiredColumns.every(column => columns.has(column))) return;
		db.exec(`DROP TABLE IF EXISTS ${tableName}`);
	} catch {
		/* table does not exist yet or PRAGMA is unavailable */
	}
}

/**
 * Create all tables and indexes. Idempotent (uses IF NOT EXISTS throughout).
 * Uses raw SQL for full SQLite feature support (FTS5, etc.).
 */
export function migrateSqliteSchema(db: SqliteDatabaseLike): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS index_state (
			key TEXT PRIMARY KEY,
			value TEXT
		);
		CREATE TABLE IF NOT EXISTS embedding (
			id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_id TEXT,
			chunk_index INTEGER,
			chunk_type TEXT,
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
		CREATE TABLE IF NOT EXISTS user_profile_processed_hash (
			content_hash TEXT PRIMARY KEY,
			processed_at INTEGER NOT NULL
		);
	`);

	// Chunk storage for FTS/vector/search snippets.
	db.exec(`
		CREATE TABLE IF NOT EXISTS doc_chunk (
			chunk_id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			chunk_type TEXT NOT NULL DEFAULT 'body_raw',
			chunk_meta_json TEXT,
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
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);

	// FTS5 virtual table for stemmed document content (Porter Stemmer morphological matching).
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts_stem USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);

	// FTS5 virtual table for document metadata (title/path/tags).
	// Separate from content FTS to avoid redundant storage and enable weighted search.
	// Schema migration: if doc_meta_fts exists without tags column, drop and recreate.
	try {
		const cols = db.prepare?.(`PRAGMA table_info(doc_meta_fts)`)?.all() as Array<{ name: string }> | undefined;
		if (cols && cols.length > 0 && !cols.some(c => c.name === 'tags')) {
			db.exec(`DROP TABLE IF EXISTS doc_meta_fts;`);
		}
	} catch { /* table doesn't exist yet */ }
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
			doc_id UNINDEXED,
			path,
			title,
			tags
		);
	`);

	// Search click-through log for learning-to-rank signals.
	db.exec(`
		CREATE TABLE IF NOT EXISTS search_click (
			query_stems TEXT NOT NULL,
			path TEXT NOT NULL,
			rank INTEGER NOT NULL,
			ts INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_search_click_query ON search_click(query_stems);
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
			attachment_summary TEXT,
			suggested_followups_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_id ON chat_message(conversation_id);
		CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(created_at_ts);
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

	db.exec(`
		CREATE TABLE IF NOT EXISTS ai_analysis_record (
			id TEXT PRIMARY KEY,
			vault_rel_path TEXT NOT NULL UNIQUE,
			query TEXT,
			title TEXT,
			created_at_ts INTEGER NOT NULL,
			web_enabled INTEGER NOT NULL DEFAULT 0,
			estimated_tokens INTEGER,
			sources_count INTEGER,
			topics_count INTEGER,
			graph_nodes_count INTEGER,
			graph_edges_count INTEGER,
			duration INTEGER,
			analysis_preset TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_created_at ON ai_analysis_record(created_at_ts);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_vault_path ON ai_analysis_record(vault_rel_path);
	`);

	db.exec(`
		CREATE TABLE IF NOT EXISTS query_pattern (
			id              TEXT PRIMARY KEY,
			template        TEXT NOT NULL,
			variables       TEXT NOT NULL,
			conditions      TEXT NOT NULL,
			source          TEXT NOT NULL,
			confidence      REAL DEFAULT 1.0,
			usage_count     INTEGER DEFAULT 0,
			discovered_at   INTEGER NOT NULL,
			last_used_at    INTEGER,
			deprecated      INTEGER DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_query_pattern_deprecated ON query_pattern(deprecated);
		CREATE INDEX IF NOT EXISTS idx_query_pattern_source ON query_pattern(source);
	`);

	// Mobius layer: merged nodes + edges without FKs; operations log.
	// No DROP INDEX here: assume greenfield; indexes are defined once below.
	db.exec(`
		CREATE TABLE IF NOT EXISTS mobius_node (
			node_id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			label TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			infer_created_at INTEGER,
			updated_at INTEGER NOT NULL,
			last_open_ts INTEGER,
			open_count INTEGER,
			path TEXT UNIQUE,
			title TEXT,
			size INTEGER,
			mtime INTEGER,
			ctime INTEGER,
			content_hash TEXT,
			summary TEXT,
			tags_json TEXT,
			word_count INTEGER,
			char_count INTEGER,
			language TEXT,
			richness_score REAL,
			doc_incoming_cnt INTEGER,
			doc_outgoing_cnt INTEGER,
			other_incoming_cnt INTEGER,
			other_outgoing_cnt INTEGER,
			tag_doc_count INTEGER,
			pagerank REAL,
			pagerank_updated_at INTEGER,
			pagerank_version INTEGER,
			semantic_pagerank REAL,
			semantic_pagerank_updated_at INTEGER,
			semantic_pagerank_version INTEGER,
			folder_cohesion_score REAL,
			hub_stale_since INTEGER,
			semantic_edges_version INTEGER DEFAULT 0,
			attributes_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_type_node_id ON mobius_node(type, node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_path ON mobius_node(path);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_updated_at ON mobius_node(updated_at);
		CREATE TABLE IF NOT EXISTS mobius_edge (
			id TEXT PRIMARY KEY,
			from_node_id TEXT NOT NULL,
			to_node_id TEXT NOT NULL,
			type TEXT NOT NULL,
			label TEXT,
			weight REAL NOT NULL DEFAULT 1.0,
			attributes_json TEXT NOT NULL DEFAULT '{}',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_type ON mobius_edge(from_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_to_type ON mobius_edge(to_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_type_to ON mobius_edge(type, to_node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_to_type ON mobius_edge(from_node_id, to_node_id, type);
		CREATE TABLE IF NOT EXISTS mobius_operation (
			id TEXT PRIMARY KEY,
			operation_type TEXT NOT NULL,
			operation_desc TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			related_kind TEXT,
			related_id TEXT,
			important_level INTEGER,
			continuous_group_id TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_created_at ON mobius_operation(created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_type_created_at ON mobius_operation(operation_type, created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_group ON mobius_operation(continuous_group_id);
	`);

	// ── Ambient push log ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS ambient_push_log (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp        INTEGER NOT NULL,
			trigger_type     TEXT NOT NULL,
			source_file_path TEXT NOT NULL,
			context_paragraph TEXT,
			pushed_file_path TEXT NOT NULL,
			pushed_score     REAL NOT NULL,
			explanation_type TEXT NOT NULL,
			explanation_text TEXT NOT NULL,
			user_action      TEXT,
			user_action_ts   INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_ambient_push_source ON ambient_push_log(source_file_path, timestamp);
		CREATE INDEX IF NOT EXISTS idx_ambient_push_pushed ON ambient_push_log(pushed_file_path, timestamp);
	`);

	// ── Cascade debt tracking ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS cascade_debt (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			tenant          TEXT    NOT NULL DEFAULT 'vault',
			source_path     TEXT    NOT NULL,
			target_id       TEXT    NOT NULL,
			debt_type       TEXT    NOT NULL,
			priority        INTEGER NOT NULL DEFAULT 5,
			change_magnitude REAL,
			created_at      INTEGER NOT NULL,
			processed_at    INTEGER
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_debt_dedup ON cascade_debt(tenant, target_id, debt_type) WHERE processed_at IS NULL;
		CREATE INDEX IF NOT EXISTS idx_cascade_debt_pending ON cascade_debt(tenant, processed_at, priority);
	`);

	// ── Precompiled knowledge layer: constituent membership + regeneration queue ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS hub_constituent (
			hub_node_id    TEXT NOT NULL,
			hub_path       TEXT NOT NULL,
			member_path    TEXT NOT NULL,
			member_node_id TEXT,
			source_kind    TEXT NOT NULL,
			added_at       INTEGER NOT NULL,
			PRIMARY KEY (hub_node_id, member_path)
		);
		CREATE INDEX IF NOT EXISTS idx_hub_constituent_member ON hub_constituent(member_path);
		CREATE INDEX IF NOT EXISTS idx_hub_constituent_hub    ON hub_constituent(hub_node_id);
		CREATE INDEX IF NOT EXISTS idx_hub_constituent_member_node ON hub_constituent(member_node_id);
		CREATE TABLE IF NOT EXISTS hub_regen_queue (
			hub_node_id    TEXT PRIMARY KEY,
			hub_path       TEXT NOT NULL,
			queued_at      INTEGER NOT NULL,
			trigger_paths  TEXT NOT NULL,
			priority       INTEGER NOT NULL DEFAULT 0,
			status         TEXT NOT NULL DEFAULT 'pending',
			last_attempt   INTEGER,
			fail_count     INTEGER NOT NULL DEFAULT 0,
			error_message  TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_hub_regen_queue_status ON hub_regen_queue(status, priority DESC);
		CREATE TABLE IF NOT EXISTS hub_curation_plan (
			plan_id         TEXT PRIMARY KEY,
			curated_at      INTEGER NOT NULL,
			trigger         TEXT NOT NULL,
			coverage_pct    REAL NOT NULL,
			confidence      REAL NOT NULL,
			iterations      INTEGER NOT NULL,
			total_hubs      INTEGER NOT NULL,
			decisions_json  TEXT NOT NULL,
			world_summary   TEXT,
			executor_status TEXT NOT NULL DEFAULT 'pending',
			executor_error  TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_hub_curation_plan_curated_at ON hub_curation_plan(curated_at DESC);
	`);

	// ── Vault lint / health-check tables ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_scan (
			id             TEXT PRIMARY KEY,
			scan_type      TEXT NOT NULL,
			started_at     INTEGER NOT NULL,
			completed_at   INTEGER,
			duration_ms    INTEGER,
			total_notes    INTEGER NOT NULL,
			health_score   INTEGER,
			dim_structural INTEGER,
			dim_content    INTEGER,
			dim_temporal   INTEGER,
			dim_semantic   INTEGER,
			dim_tags       INTEGER,
			signal_counts  TEXT NOT NULL DEFAULT '{}',
			config_hash    TEXT
		);
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_finding (
			id           TEXT PRIMARY KEY,
			scan_id      TEXT NOT NULL REFERENCES vault_lint_scan(id),
			signal_id    TEXT NOT NULL,
			severity     TEXT NOT NULL,
			file_path    TEXT,
			title        TEXT NOT NULL,
			description  TEXT,
			fix_actions  TEXT NOT NULL DEFAULT '[]',
			metadata     TEXT NOT NULL DEFAULT '{}',
			status       TEXT NOT NULL DEFAULT 'open',
			dismissed_at INTEGER,
			fixed_at     INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_scan ON vault_lint_finding(scan_id);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_signal ON vault_lint_finding(signal_id);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_status ON vault_lint_finding(status);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_path ON vault_lint_finding(file_path);
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_dismissal (
			signal_id    TEXT NOT NULL,
			file_path    TEXT NOT NULL,
			dismissed_at INTEGER NOT NULL,
			reason       TEXT,
			snooze_until INTEGER,
			PRIMARY KEY (signal_id, file_path)
		);
	`);

	// ── Token usage tracking tables ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS usage_log (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id      TEXT NOT NULL,
			feature         TEXT NOT NULL,
			action          TEXT NOT NULL,
			provider        TEXT NOT NULL,
			model           TEXT NOT NULL,
			input_tokens    INTEGER NOT NULL DEFAULT 0,
			output_tokens   INTEGER NOT NULL DEFAULT 0,
			cached_tokens   INTEGER DEFAULT 0,
			reasoning_tokens INTEGER DEFAULT 0,
			cost_usd        REAL NOT NULL DEFAULT 0,
			duration_ms     INTEGER NOT NULL DEFAULT 0,
			is_streaming    INTEGER NOT NULL DEFAULT 0,
			created_at      INTEGER NOT NULL,
			metadata_json   TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
		CREATE INDEX IF NOT EXISTS idx_usage_log_feature ON usage_log(feature);
		CREATE INDEX IF NOT EXISTS idx_usage_log_session ON usage_log(session_id);

		CREATE TABLE IF NOT EXISTS usage_daily (
			id                     INTEGER PRIMARY KEY AUTOINCREMENT,
			date                   TEXT NOT NULL,
			feature                TEXT NOT NULL,
			action                 TEXT NOT NULL,
			provider               TEXT NOT NULL,
			model                  TEXT NOT NULL,
			call_count             INTEGER NOT NULL DEFAULT 0,
			total_input_tokens     INTEGER NOT NULL DEFAULT 0,
			total_output_tokens    INTEGER NOT NULL DEFAULT 0,
			total_cached_tokens    INTEGER NOT NULL DEFAULT 0,
			total_reasoning_tokens INTEGER NOT NULL DEFAULT 0,
			total_cost_usd         REAL NOT NULL DEFAULT 0,
			avg_duration_ms        REAL NOT NULL DEFAULT 0,
			max_duration_ms        INTEGER NOT NULL DEFAULT 0,
			UNIQUE(date, feature, action, provider, model)
		);
		CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(date);

		CREATE TABLE IF NOT EXISTS usage_outcome (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id    TEXT NOT NULL,
			session_id    TEXT NOT NULL,
			event_type    TEXT NOT NULL,
			occurred_at   INTEGER NOT NULL,
			target        TEXT,
			metadata_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_outcome_message ON usage_outcome(message_id);
		CREATE INDEX IF NOT EXISTS idx_outcome_session_time ON usage_outcome(session_id, occurred_at);
	`);

	// ── Harness procedural memory (reflections) ──
	// Spec §3.8: written by an offline batch job (M5+); M3 ships storage only.
	db.exec(`
		CREATE TABLE IF NOT EXISTS harness_reflection (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			loop_id       TEXT NOT NULL,
			agent_name    TEXT NOT NULL,
			insight       TEXT NOT NULL,
			created_at    INTEGER NOT NULL,
			metadata_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_harness_reflection_agent ON harness_reflection(agent_name, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_harness_reflection_loop ON harness_reflection(loop_id);
	`);

	// ── Tag suggestion feedback table ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS tag_suggestion (
			id              TEXT PRIMARY KEY,
			doc_path        TEXT NOT NULL,
			tag             TEXT NOT NULL,
			category        TEXT NOT NULL,
			confidence      REAL NOT NULL,
			sources         TEXT NOT NULL,
			reason          TEXT NOT NULL,
			is_existing     INTEGER NOT NULL DEFAULT 0,
			status          TEXT NOT NULL DEFAULT 'pending',
			edited_tag      TEXT,
			created_at      INTEGER NOT NULL,
			resolved_at     INTEGER,
			batch_id        TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_tag_suggestion_doc ON tag_suggestion(doc_path);
		CREATE INDEX IF NOT EXISTS idx_tag_suggestion_status ON tag_suggestion(status);
		CREATE INDEX IF NOT EXISTS idx_tag_suggestion_tag ON tag_suggestion(tag);
	`);

	// ── Schema evolution: add columns (idempotent) ──
	try { db.exec('ALTER TABLE chat_message ADD COLUMN topic TEXT'); } catch { /* column already exists */ }
	try { db.exec('ALTER TABLE chat_message ADD COLUMN suggested_followups_json TEXT'); } catch { /* column already exists */ }

	// ── Structural analysis columns on mobius_node (idempotent) ──
	try { db.exec('ALTER TABLE mobius_node ADD COLUMN betweenness_centrality REAL'); } catch { /* column already exists */ }
	try { db.exec('ALTER TABLE mobius_node ADD COLUMN structural_constraint REAL'); } catch { /* column already exists */ }
	try { db.exec('ALTER TABLE mobius_node ADD COLUMN community_id TEXT'); } catch { /* column already exists */ }
	try { db.exec('ALTER TABLE mobius_node ADD COLUMN structural_analysis_version INTEGER'); } catch { /* column already exists */ }
	db.exec('CREATE INDEX IF NOT EXISTS idx_mobius_node_community_id ON mobius_node(community_id)');

	resetDerivedTableWhenColumnsDiffer(db, 'community_metadata', [
		'community_id',
		'label',
		'member_count',
		'dominant_topics_json',
		'top_nodes_json',
		'internal_density',
		'centroid_embedding',
		'analysis_version',
	]);
	resetDerivedTableWhenColumnsDiffer(db, 'structural_holes', [
		'id',
		'community_a_id',
		'community_b_id',
		'gap_type',
		'gap_score',
		'semantic_bridge_potential',
		'inter_density',
		'existing_bridge_count',
		'potential_bridges_json',
		'explanation',
		'status',
		'analysis_version',
		'created_at',
	]);

	// ── Structural analysis tables ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS structural_analysis_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS community_metadata (
			community_id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			member_count INTEGER NOT NULL,
			dominant_topics_json TEXT NOT NULL,
			top_nodes_json TEXT NOT NULL,
			internal_density REAL NOT NULL,
			centroid_embedding BLOB,
			analysis_version INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS structural_holes (
			id TEXT PRIMARY KEY,
			community_a_id TEXT NOT NULL,
			community_b_id TEXT NOT NULL,
			gap_type TEXT NOT NULL,
			gap_score REAL NOT NULL,
			semantic_bridge_potential REAL NOT NULL,
			inter_density REAL NOT NULL,
			existing_bridge_count INTEGER NOT NULL,
			potential_bridges_json TEXT NOT NULL,
			explanation TEXT,
			status TEXT NOT NULL DEFAULT 'open',
			analysis_version INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_structural_holes_score ON structural_holes(gap_score DESC);
		CREATE INDEX IF NOT EXISTS idx_structural_holes_version ON structural_holes(analysis_version);
	`);

	// ── One-time migration: drop redundant content in doc_chunk ──
	// Rationale (spec: 2026-07-07-search-highlight-vault-first):
	//   - `content_fts_norm` is unconditionally redundant with `doc_fts.content`
	//     and has no runtime consumers.
	//   - `content_raw` for Vault-readable types (markdown / txt / canvas /
	//     excalidraw / html / json / xml / csv) duplicates the Vault file on
	//     disk; the highlight resolver now reads the file live. Binary /
	//     derived types (PDF / DOCX / PPTX / image / URL) keep `content_raw`
	//     because their extracted text has no re-parseable source.
	// Idempotent: guarded by an `index_state` key so it runs only once per DB.
	try {
		const rows = db.prepare?.(
			`SELECT value FROM index_state WHERE key = 'phase3_null_readable_content_raw_v1'`,
		)?.all() as Array<{ value?: string }> | undefined;
		if (!rows || rows.length === 0) {
			db.exec(`
				UPDATE doc_chunk
				   SET content_fts_norm = NULL
				 WHERE content_fts_norm IS NOT NULL;
				UPDATE doc_chunk
				   SET content_raw = NULL
				 WHERE doc_id IN (
				   SELECT node_id FROM mobius_node
				    WHERE json_extract(attributes_json, '$.docType') IN
				      ('markdown','txt','csv','json','html','xml','canvas','excalidraw')
				 );
				INSERT OR REPLACE INTO index_state (key, value)
				VALUES ('phase3_null_readable_content_raw_v1', '1');
			`);
			// VACUUM must run outside a transaction; ddl invocations are
			// unwrapped so this is safe. Skip on failure — worst case is
			// deferred space reclamation, not correctness.
			try { db.exec('VACUUM'); } catch { /* vacuum optional */ }
		}
	} catch {
		// index_state may not exist on very old schemas; the CREATE above runs
		// first inside the same migrate call, so this shouldn't fire, but we
		// swallow to keep migration side-effect-safe.
	}
}

