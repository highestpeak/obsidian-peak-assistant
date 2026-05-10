/*
 * Common constants for the plugin. Some of them are configurable in Settings, while others are not -- so they are here.
 */

/**
 * Embedding vector dimension.
 * Can be configured based on the external embedding model used.
 * Common dimensions: 384, 512, 768, 1536, etc.
 * Must match the dimension of embeddings provided externally.
 */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Batch size for checking indexed status during index scanning.
 * Used to balance memory usage and query efficiency.
 */
export const INDEX_CHECK_BATCH_SIZE = 100;

/**
 * Search database filename.
 */
export const VAULT_DB_FILENAME = 'vault.sqlite';

/**
 * Meta database filename for chat and project data.
 */
export const CHAT_DB_FILENAME = 'chat.sqlite';

/**
 * Progress update interval in milliseconds for indexing operations.
 * Used to control how frequently progress notifications are updated.
 */
export const INDEX_PROGRESS_UPDATE_INTERVAL = 3000; // Update every 3 seconds

/**
 * Index state keys for storing index metadata.
 */
export const INDEX_STATE_KEYS = {
	builtAt: 'index_built_at',
	indexedDocs: 'indexed_docs',
} as const;

/**
 * Keys in `index_state` for Mobius full-maintenance debt (per SQLite tenant DB).
 */
export const MOBIUS_MAINTENANCE_STATE_KEYS = {
	dirtyScore: 'mobius_maintenance_dirty_score',
	needed: 'mobius_maintenance_needed',
	lastFullAt: 'mobius_maintenance_last_full_at',
	// Cascade tracking
	cascadePendingCount: 'cascade_pending_count',
	lastCascadeAt: 'last_cascade_at',
	cascadeTotalProcessed: 'cascade_total_processed',
} as const;

/** Debt points added per successful indexed document upsert. */
export const MOBIUS_MAINTENANCE_DEBT_INDEX_DOC = 1;
/** Debt points per deleted document (per tenant batch). */
export const MOBIUS_MAINTENANCE_DEBT_PER_DELETE = 2;
/** Debt points per successful path rename in index. */
export const MOBIUS_MAINTENANCE_DEBT_RENAME = 1;
/** When cumulative debt reaches this, `needed` is set so UI can suggest full maintenance. */
export const MOBIUS_MAINTENANCE_DIRTY_THRESHOLD = 30;

/**
 * Default vault folder for user-defined skills (markdown-based agent workflows).
 */
export const DEFAULT_SKILLS_FOLDER = '_skills';

// ── OpenAI-compatible endpoint presets ──
export const OPENAI_COMPATIBLE_PRESETS = {
	lmstudio: {
		name: 'LM Studio',
		baseUrl: 'http://localhost:1234/v1',
		icon: 'server',
	},
	litellm: {
		name: 'LiteLLM Proxy',
		baseUrl: 'http://localhost:4000/v1',
		icon: 'server',
	},
	vllm: {
		name: 'vLLM',
		baseUrl: 'http://localhost:8000/v1',
		icon: 'server',
	},
} as const;

// ── Cascade update constants ──
export const CASCADE_IDLE_DELAY_MS = 5000;
export const CASCADE_MAX_ITEMS_PER_WINDOW = 20;
export const CASCADE_ITEM_TIMEOUT_MS = 500;
export const CASCADE_CHANGE_THRESHOLD_MINOR = 0.05;
export const CASCADE_CHANGE_THRESHOLD_MODERATE = 0.15;
export const CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY = 1;
export const CASCADE_DEBT_DEGREE_REFRESH_PRIORITY = 2;
export const CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY = 3;
export const CASCADE_DEBT_FOLDER_STATS_PRIORITY = 4;
/** Priority for hub_invalidate debt items (must run after degree_refresh). */
export const CASCADE_DEBT_HUB_INVALIDATE_PRIORITY = 3;
/** Priority for hub_regen debt items (lowest; runs last in window). */
export const CASCADE_DEBT_HUB_REGEN_PRIORITY = 5;

/**
 * YAML frontmatter keys used when resolving document timestamps during indexing.
 * Prefer these constants over string literals so renames stay consistent.
 */
export const INDEX_FRONTMATTER_KEYS = {
	updatedAt: 'updated_at',
	updated: 'updated',
	createdAt: 'created_at',
	created: 'created',
} as const;

/**
 * Starting hint for adaptive concurrency during deferred LLM index enrichment (`llm_pending`).
 * Used as the `initial` level for `AdaptiveConcurrencyPool`; actual concurrency adjusts at runtime
 * based on observed task latency and error rate (floor: 1, ceiling: this value * 2).
 * Raise slowly to avoid provider 429s and SQLite contention.
 */
export const LLM_PENDING_ENRICH_CONCURRENCY = 12;

/**
 * Default hub candidate cap scales sublinearly with document count: clamp(sqrt(docs) * scale, min, max).
 * Sub-pools (document/folder/cluster fetch, top-doc exclude) scale with this total; see `computeHubDiscoverBudgets`.
 */
export const HUB_DISCOVER_LIMIT_MIN = 40;
export const HUB_DISCOVER_LIMIT_MAX = 320;
export const HUB_DISCOVER_LIMIT_SQRT_SCALE = 5;

/**
 * Document hub `hub_organizational_score` in {@link MobiusNodeRepo.listTopDocumentNodesForHubDiscovery} and
 * `HubCandidateDiscoveryService.scoreDocumentRow`: `min(1, inc * incomingWeight + out * outgoingWeight)`.
 * Slightly favors incoming links vs outgoing vs the older 0.035 / 0.055 weights so “pure high-out” pages do not
 * dominate; index notes with many outgoing links still score strongly (linear in out, capped at 1).
 */
export const DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS = {
	incoming: 0.045,
	outgoing: 0.048,
} as const;

/** When true, hub maintenance writes compiled hub .md files to the vault (S6 precompiled knowledge). */
export const HUB_MAINTENANCE_MATERIALIZE_DOCS = true;

/** Minimum distinct documents under a folder path for folder hub candidates. */
export const FOLDER_HUB_MIN_DOCS = 4;

/** Keyset page size when scanning documents to rebuild folder hub materialized stats. */
export const FOLDER_HUB_STATS_DOC_PAGE_SIZE = 200;

/** Max documents per folder sampled for {@link computeFolderCohesionScore} during folder hub stats rebuild. */
export const FOLDER_COHESION_MAX_DOCS = 200;

/** Max semantic_related rows loaded when measuring intra-folder edge density. */
export const FOLDER_COHESION_INTRA_EDGE_LIMIT = 1200;

/**
 * Folder `hub_graph_score` blend weights. Sum = 1.
 * Cohesion is multiplied by size reliability: min(1, ln(1+tag_doc_count)/ln(1+FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT)).
 */
export const FOLDER_HUB_GRAPH_WEIGHT_PHYSICAL = 0.25;
export const FOLDER_HUB_GRAPH_WEIGHT_ORGANIZATIONAL = 0.35;
export const FOLDER_HUB_GRAPH_WEIGHT_SEMANTIC = 0.15;
export const FOLDER_HUB_GRAPH_WEIGHT_COHESION = 0.25;
/** Doc-count reference for cohesion reliability cap (12 docs → R_size = 1). */
export const FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT = 12;

/** Batch size when scanning all `mobius_edge` rows with endpoint metadata for folder boundary degrees. */
export const FOLDER_HUB_BOUNDARY_EDGE_BATCH_SIZE = 800;

/**
 * Indexing / search policy: long-range edges, rerank boosts.
 */

/** Reference edge marked long-range when LCA depth <= this and paths cross top-level folder. */
export const INDEX_LONG_RANGE_LCA_MAX_DEPTH = 1;

/** Hybrid rerank: boost for hub-tier incoming reference counts. */
export const INDEX_SEARCH_HUB_INCOMING_BOOST = 0.08;

/** Hybrid rerank: boost when incoming is secondary band (below hub, above none). */
export const INDEX_SEARCH_SECONDARY_INCOMING_BOOST = 0.04;

/** Additive score boost applied when a search result is a hub_doc type (compiled knowledge summary). */
export const INDEX_SEARCH_HUB_DOC_TYPE_BOOST = 0.12;

/** Incoming/outgoing degree bands for hybrid rerank anchor boosts. */
export const INDEX_HUB_TIER_THRESHOLDS = {
	hubIncomingMin: 5,
	secondaryIncomingMin: 2,
	secondaryOutgoingMin: 8,
} as const;

/** Bumped when vault PageRank formula or persistence shape changes. */
export const PAGERANK_ALGORITHM_VERSION = 1;

/** Version bump when weighted semantic PageRank on `semantic_related` changes. */
export const SEMANTIC_PAGERANK_ALGORITHM_VERSION = 1;

/** Keyset batch size when scanning `mobius_edge` for vault PageRank (no JOIN). */
export const PAGERANK_EDGE_BATCH_SIZE = 5000;

/**
 * Default top K value for search results.
 * Used when query.topK is not specified.
 */
export const DEFAULT_SEARCH_TOP_K = 50;

/**
 * Default search mode.
 * Used when query.mode is not specified.
 */
export const DEFAULT_SEARCH_MODE = 'vault';

/**
 * RRF (Reciprocal Rank Fusion) configuration constants.
 */
export const RRF_K = 60;

/**
 * PPR (Personalized PageRank) Search configuration constants.
 * Parameters for the Forward Push PPR algorithm used in semantic graph-based search.
 */
export const PPR_ALPHA = 0.15;
export const PPR_EPSILON = 1e-6;
export const PPR_MAX_PUSH_OPS = 50_000;
export const PPR_MAX_MS = 200;
export const PPR_SEED_K = 10;
export const PPR_LAYER_WEIGHT_REFERENCE = 0.35;
export const PPR_LAYER_WEIGHT_SEMANTIC = 0.40;
export const PPR_LAYER_WEIGHT_TAG = 0.10;
export const PPR_RRF_WEIGHT = 0.3;
export const PPR_CM_RRF_WEIGHT = 0.7;
export const PPR_GLOBAL_PR_DAMPENING = 0.3;
export const PPR_MAX_EXPANSION_RESULTS = 20;

// PPR query-node seeding
/** Max FTS-matched nodes to add to seed distribution alongside top-K RRF results. */
export const PPR_QUERY_NODE_SEED_K = 5;
/**
 * Fraction of the total seed weight budget allocated to query-node seeds.
 * RRF seeds get (1 - PPR_QUERY_NODE_WEIGHT_FRACTION), query nodes get this fraction.
 * Set to 0 to disable query-node seeding.
 */
export const PPR_QUERY_NODE_WEIGHT_FRACTION = 0.25;

// PPR co-citation layer
/** Layer weight for co-citation edges. Reference + Semantic + Tag + CoCitation must sum to 1.0. */
export const PPR_LAYER_WEIGHT_COCITATION = 0.15;

/**
 * Search scoring constants for keyword matching.
 * Used to boost search results based on keyword diversity.
 */
export const SEARCH_SCORING_DIVERSITY_BOOST_CONTENT = 0.5; // Up to 50% boost for diversity in content matches
export const SEARCH_SCORING_DIVERSITY_BOOST_META = 0.8; // Up to 80% boost for diversity in meta matches

/**
 * Graph Inspector RRF weights for document node ranking.
 * Compiled defaults; not runtime-configurable by design.
 * Weights are applied to each ranking dimension in the RRF formula.
 */
export const GRAPH_RRF_WEIGHTS = {
	// Connection density (how well connected a node is)
	density: 1.0,
	// Update time (how recently the node was modified)
	updateTime: 1.2, // Slightly higher weight for recency
	// Richness score (content quality indicator)
	richness: 0.8,
	// Open count (how often the user accesses this node)
	openCount: 0.9,
	// Last open time (how recently the user accessed this node)
	lastOpen: 0.7,
	// Similarity score (only for semantic neighbors, measures semantic closeness)
	similarity: 1.1, // Higher weight for semantic relevance in BFS traversal
} as const;

/**
 * Base score bonus for physically connected nodes vs semantic neighbors.
 * Physical connections are considered more reliable than semantic similarity.
 */
export const PHYSICAL_CONNECTION_BONUS = 0.1;

/**
 * Path finding algorithm constants for bidirectional hybrid BFS.
 */
export const PATH_FINDING_CONSTANTS = {
	/**
	 * Default number of iterations for hybrid path discovery.
	 * Balances diversity and computational cost.
	 * - 1st iteration: Finds most direct path
	 * - 2nd iteration: Discovers one alternative path
	 * - 3rd iteration: Provides additional exploration perspective
	 */
	DEFAULT_ITERATIONS: 5,

	/**
	 * Maximum hop limit to prevent semantic drift.
	 * Limits path length to maintain result relevance and prevent excessive computation.
	 */
	MAX_HOPS_LIMIT: 5,
} as const;

/** Per-node edge query limit for graph traversal (decoupled from user-facing `limit`). */
export const GRAPH_TRAVERSAL_EDGES_PER_NODE = 50;

/**
 * Semantic neighbor limit for BFS depth > 0. Index = depth-1.
 * depth=0 uses the full `limit` param; depth=1 -> 3; depth=2 -> 1.
 */
export const GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY = [3, 1] as const;

/** Internal fetch size for orphan candidate pool (decoupled from user-facing `limit`). */
export const ORPHAN_FETCH_LIMIT = 200;

/** Default per-folder item cap for explore_folder tool. */
export const EXPLORE_FOLDER_DEFAULT_LIMIT = 50;

export const KEY_NODES_RRF_K = 60;

/**
 * for each step of graph inspection, limit their duration to avoid no response for a long time.
 */
export const GRAPH_INSPECT_STEP_TIME_LIMIT = 10000; // 10 seconds

// Use a reasonable limit to balance performance and ranking accuracy
// RRF works well with top-ranked nodes since low-degree nodes contribute little to the score
// Consider top 500 nodes by degree for RRF fusion
export const RRF_RANKING_POOL_SIZE = 500;

/**
 * Minimum confidence threshold for user profile candidate items.
 */
export const USER_PROFILE_MIN_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Default summary text when no summary is available.
 */
export const DEFAULT_SUMMARY = 'defaultSummary';

/**
 * Number of messages to accumulate before triggering summary update for conversation.
 */
export const CONVERSATION_SUMMARY_UPDATE_THRESHOLD = 3;

/**
 * Number of messages to accumulate before triggering summary update for project.
 */
export const PROJECT_SUMMARY_UPDATE_THRESHOLD = 5;

/**
 * Debounce delay in milliseconds before triggering summary update.
 */
export const SUMMARY_UPDATE_DEBOUNCE_MS = 5000;

/**
 * Typing speed for typewriter effect in milliseconds per character.
 * Used for displaying conversation titles with animation.
 */
export const TYPEWRITER_EFFECT_SPEED_MS = 30;

export const CHAT_PROJECT_SUMMARY_FILENAME = 'Project-Summary.md';

/**
 * Default title for new conversations.
 */
export const DEFAULT_NEW_CONVERSATION_TITLE = 'New Conversation';

/**
 * Character limit for collapsed user messages in chat view.
 * Messages longer than this limit will be truncated with an expand button.
 */
export const COLLAPSED_USER_MESSAGE_CHAR_LIMIT = 200;

/**
 * Maximum number of conversations to display in conversation sections before showing "See more" button.
 */
export const MAX_CONVERSATIONS_DISPLAY = 50;

/**
 * Maximum number of projects to display in project sections before showing "See more" button.
 * This is smaller than MAX_CONVERSATIONS_DISPLAY since projects are typically fewer in number.
 */
export const MAX_PROJECTS_DISPLAY = 10;

/**
 * Maximum number of conversations to display under each project item in the project list.
 * This is much smaller than MAX_CONVERSATIONS_DISPLAY since it's shown within a nested structure.
 */
export const MAX_CONVERSATIONS_PER_PROJECT = 10;

/**
 * Minimum number of messages required for title generation.
 * Need at least user message + assistant response to generate a meaningful title.
 */
export const MIN_MESSAGES_FOR_TITLE_GENERATION = 2;

/**
 * Vault description filename in the prompt folder.
 * Best practice: be sure to write down the key notes. and the overall structure of the vault.
 */
export const VAULT_DESCRIPTION_FILENAME = 'vault-description.md';

/**
 * Top tags count for global tag cloud when get system info.
 */
export const GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT = 50;

/**
 * Default recent search results count.
 */
export const DEFAULT_RECENT_SEARCH_RESULTS_COUNT = 30;

/**
 * Central caps for `.slice(0, n)` and similar truncation (arrays, strings, previews).
 * Tune here instead of scattering magic numbers across call sites.
 */
export const SLICE_CAPS = {
	indexing: {
		structuredChunkTop: 8,
	},
	semanticEdges: {
		mermaidSafeLabel: 56,
		items: 14,
		nodeIdFallbackLabel: 12,
	},
	aiSearch: {
		graphNodeLabels: 20,
		topicSources: 5,
		topicGraphLabels: 20,
		topicResults: 10,
	},
	vaultDoc: {
		aiSearchAnalysisGraphNodes: 40,
		aiSearchAnalysisGraphEdges: 80,
	},
	sqlite: {
		operationDescription: 500,
	},
	utils: {
		logExpressionPreview: 80,
		chunkSlugFallback: 24,
		mermaidQuotedLabel: 80,
	},
	modelId: {
		openaiPrefixSegments: 2,
		claudePrefixSegments: 3,
	},
	date: {
		/** `toISOString().slice(0, n)` for `YYYY-MM-DD`. */
		isoDateChars: 10,
	},
	/** Cumulative end indices for MD5 hex → UUID-style `8-4-4-4-12` grouping. */
	hash: {
		md5UuidSliceEnds: [8, 12, 16, 20, 32] as const,
	},
	agent: {
		sourcePathsSample: 30,
		claimKey: 80,
		tacticalSummary: 400,
		dimensionIntent: 80,
		groupFocus: 200,
		sharedContext: 300,
		evidencePaths: 12,
		extractionTasks: 30,
		extractionFocus: 120,
		slotRecallDimensions: 10,
		summaryFacts: 500,
		docSimpleTitle: 80,
		suggestQuestions: 2,
		dashboardBlocks: 10,
		reportPlanMarkdown: 200,
	},
	highlight: {
		fallbackShort: 200,
		fallbackLong: 220,
	},
	inspector: {
		exploreFolderPaths: 2000,
		pathFindQueueLevel: 5,
		pathFindHubs: 3,
		pathFindCommonParents: 3,
	},
	searchWeb: {
		snippetShort: 200,
		snippetLong: 300,
	},
	chat: {
		sourcesList: 10,
	},
	graphViz: {
		candidatePathsToolbar: 30,
		candidatePathsPanel: 20,
		formatItems: 80,
		formatDocs: 80,
		formatEdges: 120,
		formatNodes: 60,
		debugTouchSample: 3,
		graphPatchFocus: 8,
		shortestPathNeighbors: 6,
		shortestPathDebugIds: 10,
	},
	ui: {
		promptOptions: 20,
		resourcePreviewLines: 10,
		followupMarkdown: 300,
		followupAnswer: 200,
		tabSearchLabel: 48,
		saveAnalyzeMd: 120,
		knowledgeGraphItems: 120,
		searchPipelineBlocks: 12,
		sourcesSummaries: 3,
		sourcesFacts: 8,
		topicMenuSources: 6,
		analysisTitleSanitize: 80,
		analysisTitlePath: 200,
		analysisSearchText: 300,
		analysisSummary: 500,
		analysisSummaryInSearch: 400,
		analysisGraphNodes: 8,
		analysisSourcesSummary: 6,
		analysisBlocksSummary: 5,
		analysisNodeLabels: 30,
		analysisItemsPreview: 5,
		analysisBlockMarkdown: 200,
		analysisSourcesList: 10,
		analysisDisplayTitle: 48,
		analysisDisplayTitleTrim: 60,
	},
	mocks: {
		mockTitle: 45,
		mockQuery: 50,
		mockQueryShort: 30,
		mockAIServiceSummary: 300,
		mockAIServiceTitle: 40,
	},
	build: {
		esbuildLogInputs: 50,
	},
} as const;

// ---------------------------------------------------------------------------
// AI Search Pipeline Config
// ---------------------------------------------------------------------------

/** Visual type labels for plan review section cards. */
export const VISUAL_TYPE_LABELS: Record<string, string> = {
	table: 'Table',
	quadrantChart: 'Quadrant',
	flowchart: 'Flowchart',
	timeline: 'Timeline',
	mindmap: 'Mindmap',
	none: '',
};

/**
 * Capability suggestion detection patterns.
 * Used by CapabilitySuggestion component to detect when the assistant
 * indicates it lacks a capability that could be enabled.
 */
export const CAPABILITY_SUGGESTION_PATTERNS = {
	webSearch: [
		/I don't have access to real-time/i,
		/I can't browse/i,
		/I don't have internet/i,
		/no access to the internet/i,
		/cannot access the internet/i,
		/unable to access the internet/i,
		/I cannot browse/i,
		/unable to browse/i,
		/I don't have access to the web/i,
		/cannot access (?:the )?web/i,
		/unable to search the web/i,
		/I can't search the web/i,
		/my training data/i,
		/my knowledge cutoff/i,
	],
	vaultSearch: [
		/I don't have access to your/i,
		/I can't search your notes/i,
		/I don't have access to your vault/i,
		/I cannot search your notes/i,
		/unable to search your notes/i,
		/I can't access your vault/i,
		/I cannot access your vault/i,
		/unable to access your vault/i,
		/I don't have access to your files/i,
		/I can't read your notes/i,
	],
} as const;

/** Mission role definitions for plan review section grouping. */
// ── Structural analysis thresholds (Burt + Brandes + Louvain) ──
export const STRUCTURAL_ANALYSIS_APPROX_THRESHOLD = 10_000;
export const STRUCTURAL_ANALYSIS_APPROX_K = 500;
export const LOUVAIN_RESOLUTION = 1.0;
export const LOUVAIN_MIN_COMMUNITY_SIZE = 3;
export const GAP_DENSITY_THRESHOLD = 0.01;
export const GAP_INTRA_DENSITY_MIN = 0.05;
export const GAP_COMMUNITY_SIZE_MIN = 5;
export const GAP_SEMANTIC_THRESHOLD = 0.3;
export const STRUCTURAL_HOLE_OCCUPANT_BC_MIN = 0.1;
export const STRUCTURAL_HOLE_OCCUPANT_CONSTRAINT_MAX = 0.3;

// Gap scoring weights (sum to 1.0)
export const GAP_WEIGHT_SEMANTIC = 0.5;
export const GAP_WEIGHT_SIZE = 0.2;
export const GAP_WEIGHT_ISOLATION = 0.3;

// Structural analysis UI constants
export const COMMUNITY_NODE_SIZE_MIN = 24;
export const COMMUNITY_NODE_SIZE_MAX = 64;
export const COMMUNITY_COLORS_FALLBACK = [
	'#89b4fa', '#a6e3a1', '#f9e2af', '#cba6f7',
	'#fab387', '#94e2d5', '#f38ba8', '#74c7ec',
	'#b4befe', '#eba0ac', '#a6adc8', '#9399b2',
];

export const MISSION_ROLES: Array<{ key: string; label: string; icon: string; color: string; bgColor: string; required: boolean }> = [
	{ key: 'synthesis', label: 'Synthesis', icon: 'Microscope', color: 'pktw-text-emerald-700', bgColor: 'pktw-bg-emerald-50 pktw-border-emerald-200', required: true },
	{ key: 'contradictions', label: 'Contradictions', icon: 'Zap', color: 'pktw-text-red-700', bgColor: 'pktw-bg-red-50 pktw-border-red-200', required: false },
	{ key: 'trade_off', label: 'Trade-off', icon: 'Scale', color: 'pktw-text-amber-700', bgColor: 'pktw-bg-amber-50 pktw-border-amber-200', required: false },
	{ key: 'action_plan', label: 'Action Plan', icon: 'Target', color: 'pktw-text-blue-700', bgColor: 'pktw-bg-blue-50 pktw-border-blue-200', required: true },
	{ key: 'risk_audit', label: 'Risk Audit', icon: 'ShieldAlert', color: 'pktw-text-orange-700', bgColor: 'pktw-bg-orange-50 pktw-border-orange-200', required: false },
	{ key: 'roadmap', label: 'Roadmap', icon: 'Map', color: 'pktw-text-indigo-700', bgColor: 'pktw-bg-indigo-50 pktw-border-indigo-200', required: false },
	{ key: 'decomposition', label: 'Decomposition', icon: 'Layers', color: 'pktw-text-violet-700', bgColor: 'pktw-bg-violet-50 pktw-border-violet-200', required: false },
	{ key: 'blindspots', label: 'Blindspots', icon: 'Eye', color: 'pktw-text-pink-700', bgColor: 'pktw-bg-pink-50 pktw-border-pink-200', required: false },
	{ key: 'probing_horizon', label: 'Probing Horizon', icon: 'Telescope', color: 'pktw-text-cyan-700', bgColor: 'pktw-bg-cyan-50 pktw-border-cyan-200', required: false },
];