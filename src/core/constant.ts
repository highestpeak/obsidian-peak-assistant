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
 * YAML frontmatter keys used when resolving document timestamps during indexing.
 * Prefer these constants over string literals so renames stay consistent.
 */
export const INDEX_FRONTMATTER_KEYS = {
	updatedAt: 'updated_at',
	updated: 'updated',
	createdAt: 'created_at',
	created: 'created',
} as const;

/** Frontmatter keys for auto-generated Hub summary notes (YAML). */
export const HUB_FRONTMATTER_KEYS = {
	/** When false, maintenance skips overwriting body (user-edited hub). */
	autoHub: 'peak_auto_hub',
	/** When true, full auto-updates are disabled (user takeover). */
	userOwned: 'peak_user_owned',
	/** LLM fill outcome: `pending` (skeleton), `ok`, or `failed`. */
	fillStatus: 'hub_fill_status',
	/** Human-readable hub title (mirrors first H1 when LLM succeeds). */
	hubTitle: 'hub_title',
} as const;

/**
 * H1 title for the machine-readable JSON block at the end of auto-generated HubDoc bodies.
 * Parsed by tooling; excluded from Hub LLM draft body preview.
 */
export const HUB_DOC_METADATA_SECTION_TITLE = 'Hub Metadata';

/**
 * Optional YAML on user-authored hubs under `Hub-Summaries/Manual/`. Read-only for discovery; never auto-written.
 */
export const MANUAL_HUB_FRONTMATTER_KEYS = {
	/** Overrides semantic hub role when value is a known hub role string. */
	hubRole: 'hub_role',
	/**
	 * Extra member note paths for coverage / assembly hints (string[] or single string).
	 * Resolved like cluster member paths.
	 */
	hubSourcePaths: 'hub_source_paths',
} as const;

/**
 * Concurrent HubDoc writes during maintenance (LLM fill + vault + index per candidate).
 * Limits parallel LLM calls and SQLite pressure; increase cautiously.
 */
export const HUB_MATERIALIZE_CONCURRENCY = 4;

/** Keyset page size when building hub coverage ordinal index (avoids one huge SQLite result set). */
export const HUB_COVERAGE_INDEX_PAGE_SIZE = 2000;

/**
 * Parallel document passes for deferred LLM index enrichment (`llm_pending`).
 * Caps concurrent `indexDocument` + LLM work; raise slowly to avoid provider 429s and SQLite contention.
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
 * Greedy selection policy for multi-round hub discovery (`selectHubCandidatesMultiRound` in hubDiscover).
 * Picks up to `limitTotal` hubs from a merged candidate pool: high rank first, but skips redundant coverage.
 * Not exposed in plugin settings; tune here for global behavior.
 */
export const HUB_DISCOVER_GREEDY_SELECTION = {
	/** First N selected hubs use looser rules so the running coverage union is not empty too early. */
	earlyFillSlots: 8,
	/** After this many hubs are selected, reject weak candidates unless they are strong or add coverage. */
	strictFilterStartCount: 6,
	/** `rankingScore` at or above this still passes when marginal coverage gain is low. */
	strongHubScore: 0.48,
	/**
	 * Cluster hubs use a lower strong threshold in the main greedy pass (their `rankingScore` scale
	 * is below folder hubs; reserve still guarantees thematic slots).
	 */
	clusterStrongHubScore: 0.33,
	/** Marginal gain must be at least `minCoverageGain * usefulGainFactor` to count as “useful new coverage”. */
	usefulGainFactor: 0.45,
} as const;

/**
 * Weight applied to each unselected candidate's `rankingScore` when estimating remaining pool mass
 * (`estimateRemainingCandidateScore` in hubDiscover). Not graph coverage; heuristic only.
 */
export const HUB_DISCOVER_REMAINING_CANDIDATE_SCORE_WEIGHT = 0.15;

/** Default max folder-hub candidates per fetch in hub discovery (`discoverFolderHubCandidates`). */
export const HUB_DISCOVER_FOLDER_MAX_CANDIDATES = 15;

/**
 * Max share of final hub slots that may be folder hubs (reduces parent/child redundancy vs thematic clusters).
 * Applied in `selectHubCandidatesMultiRound` after `seedSelected`.
 */
export const HUB_DISCOVER_FOLDER_MAX_SELECTED_FRACTION = 0.4;

/**
 * Hard cap on folder hubs in final selection (applied with {@link HUB_DISCOVER_FOLDER_MAX_SELECTED_FRACTION}).
 * Reduces parent/child redundancy when the fraction alone allows too many folder slots.
 */
export const HUB_DISCOVER_FOLDER_MAX_SELECTED_ABS = 24;

/**
 * Max share of final hub slots that may be document hubs (greedy pass; seeds count toward this).
 * Prevents low-diversity “all document hubs” when graph scores are noisy.
 */
export const HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION = 0.45;

/** Hard cap on document hubs (used with {@link HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION}). */
export const HUB_DISCOVER_DOCUMENT_MAX_SELECTED_ABS = 100;

/** Floor for document hub cap on very small `limitTotal` values. */
export const HUB_DISCOVER_DOCUMENT_MAX_SELECTED_MIN = 24;

/**
 * After SQL recall of top documents by hub graph score, shrink to representative document-hub candidates
 * by one-hop reference coverage overlap (see `thinDocumentHubCandidatesRepresentative` in hubDiscover).
 * Thresholds align with {@link HUB_DISCOVER_GREEDY_SELECTION.strongHubScore} in code where applicable.
 */
export const DOCUMENT_HUB_REPRESENTATIVE_THINNING = {
	/** Top-ranked seeds kept before overlap filtering (capped by target limit). */
	seedKeepCount: 12,
	/** Min fraction of a candidate's coverage that is new vs union of already-selected centers. */
	noveltyHigh: 0.012,
	/** Weaker novelty floor when overlap vs any selected center is below {@link overlapHigh}. */
	noveltyLow: 0.006,
	/** Above this overlap coefficient vs a selected center, weak-novelty picks are rejected. */
	overlapHigh: 0.72,
	/** Above this overlap vs a selected center, strong hubs are still rejected unless novelty is high. */
	overlapVeryHigh: 0.85,
} as const;

/**
 * Document-hub representative pool cap vs final document slots (`maxDocumentSlots` from
 * {@link HUB_DISCOVER_DOCUMENT_MAX_SELECTED_FRACTION}): `max + extra` vs `ceil(max * mult)`.
 * Smaller than the older 1.6x buffer so DevTools / intermediate lists are less noisy.
 */
export const DOCUMENT_HUB_REPRESENTATIVE_POOL_CAP = {
	extraOverMaxSlots: 12,
	multipleOfMaxSlots: 1.25,
} as const;

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

/**
 * Second-phase selection in hub discovery: maximize union document coverage toward this ratio.
 */
export const HUB_DISCOVER_COVERAGE_FILL_TARGET_RATIO = 0.95;

/** Stop fill when the best remaining pick adds fewer than this many new documents (unless ratio threshold below applies). */
export const HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOCS = 8;

/** Stop fill when the best remaining pick adds fewer than this fraction of vault docs (and {@link HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOCS}). */
export const HUB_DISCOVER_COVERAGE_FILL_MIN_NEW_DOC_RATIO = 0.005;

/** Extra folder hub slots allowed only in the coverage-fill phase (after greedy + cluster reserve). */
export const HUB_DISCOVER_FOLDER_FILL_EXTRA_SLOTS = 20;

/** Extra document hub slots allowed only in the coverage-fill phase. */
export const HUB_DISCOVER_DOCUMENT_FILL_EXTRA_SLOTS = 25;

/**
 * In coverage-fill, skip nested folder picks unless they add at least this many new documents.
 */
export const HUB_DISCOVER_COVERAGE_FILL_MIN_NESTED_FOLDER_NEW_DOCS = 12;

/**
 * In coverage-fill, if a cluster conflicts with an already-selected cluster, require at least this many new docs to keep it.
 */
export const HUB_DISCOVER_COVERAGE_FILL_MIN_CLUSTER_NEW_DOCS_WHEN_CONFLICT = 15;

/** Minimum cluster member count (including seed) to emit a cluster hub candidate. */
export const HUB_DISCOVER_CLUSTER_MIN_SIZE = 3;

/** Cap on 1-hop semantic neighbors collected per cluster seed. */
export const HUB_DISCOVER_CLUSTER_SEMANTIC_NEIGHBOR_CAP = 30;

/** Max reference-link neighbors merged into cluster recall (per seed). */
export const HUB_DISCOVER_CLUSTER_REFERENCE_NEIGHBOR_CAP = 10;

/**
 * Fetch `seedFetchLimit * this` rows from DB, rank by composite seed quality in TS, then iterate.
 */
export const HUB_DISCOVER_CLUSTER_SEED_FETCH_MULTIPLIER = 3;

/**
 * Soft overlap with top document hubs: multiply cluster `graphScore` by this when the seed is in
 * `excludeNodeIds` (replaces hard skip so clusters can still form around strong topical centers).
 */
export const HUB_DISCOVER_CLUSTER_SEED_TOP_DOC_SCORE_FACTOR = 0.82;

/**
 * After emitting cluster hubs, drop near-duplicates by coarse theme family + member-path Jaccard
 * before applying `limit` (keeps pool diversity).
 */
export const HUB_DISCOVER_CLUSTER_EMIT_DEDUPE_MAX_JACCARD = 0.52;

/**
 * Max cluster candidates per coarse theme family (see hubDiscover `clusterThemeFamilyKey`) during raw emit
 * (before coarse dedupe). Reduces sibling clusters (e.g. many GOF pattern notes under one folder). Set to 0 to disable.
 */
export const HUB_DISCOVER_CLUSTER_RAW_MAX_PER_THEME = 2;

/**
 * Cluster V2: multi-signal member affinity + cohesion gate (deterministic hub discovery).
 * Weights sum to 1; semantic recall + tags/keywords/title + light structure.
 */
export const HUB_CLUSTER_V11_MEMBER_WEIGHTS = {
	semantic: 0.3,
	topic: 0.22,
	functional: 0.1,
	keyword: 0.24,
	titleLexical: 0.06,
	structural: 0.08,
} as const;

/** Minimum per-member affinity to keep a neighbor (after recall). Seed is never dropped. */
export const HUB_CLUSTER_V11_MIN_MEMBER_AFFINITY = 0.26;
/** When semantic edge weight maps to support >= this, a slightly weaker member may pass. */
export const HUB_CLUSTER_V11_SEMANTIC_STRONG_THRESHOLD = 0.68;
export const HUB_CLUSTER_V11_RELAXED_MEMBER_AFFINITY = 0.22;
/** Moderate semantic support + minimum affinity (weak semantic edges, some lexical/tag overlap). */
export const HUB_CLUSTER_V11_SEMANTIC_BRIDGE_THRESHOLD = 0.52;
export const HUB_CLUSTER_V11_BRIDGE_MEMBER_AFFINITY = 0.22;

/** Cluster-level gate: require cohesion score >= this to emit a cluster hub candidate. */
export const HUB_CLUSTER_V11_MIN_COHESION_SCORE = 0.32;
/** Require mean member affinity (filtered set, including seed) >= this. */
export const HUB_CLUSTER_V11_MIN_AVG_AFFINITY = 0.27;

/**
 * Default weight for reference-only neighbors (no semantic edge): maps to ~0.74 support at cap 1.35,
 * so structural recall is not over-penalized vs weak semantic edges.
 */
export const HUB_CLUSTER_V11_REFERENCE_EDGE_DEFAULT_WEIGHT = 1.0;

/**
 * After greedy hub selection, reserve up to this many slots for strong cluster hubs
 * (so thematic clusters are not always dropped by coverage overlap with doc/folder hubs).
 */
export const HUB_DISCOVER_CLUSTER_RESERVE_MIN = 2;
/** Upper bound for cluster slots after greedy + reserve (scales with `limitTotal` below). */
export const HUB_DISCOVER_CLUSTER_RESERVE_MAX = 8;
/**
 * Minimum `graphScore` for reserve pool (cluster scores are ~0.2–0.35 for typical emitted clusters;
 * 0.38 matched folder/doc scale and filtered out all clusters). If none pass, selection falls back
 * to all unselected cluster candidates by `rankingScore`.
 */
export const HUB_DISCOVER_CLUSTER_RESERVE_MIN_GRAPH_SCORE = 0.24;

/**
 * When filling cluster reserve slots, skip a candidate if its member paths overlap an already-kept
 * cluster (Jaccard index) above this — reduces duplicate “same island” clusters.
 */
export const HUB_DISCOVER_CLUSTER_RESERVE_MAX_MEMBER_JACCARD = 0.65;

/**
 * Max cluster hubs per coarse theme family in the reserve pass (from first anchor topic tag or label).
 */
export const HUB_DISCOVER_CLUSTER_RESERVE_MAX_PER_THEME = 1;

/** Minimum length for a follow-up path prefix after sanitization (shorter strings are dropped). */
export const HUB_DISCOVER_PREFIX_MIN_LENGTH = 3;

/** Map raw semantic edge weight to 0..1 support (weights often ~0.3–1.5). */
export const HUB_CLUSTER_V11_SEMANTIC_WEIGHT_CAP = 1.35;

/** Log verbose cluster V1.1 decisions to console (dev only). */
export const HUB_CLUSTER_V11_CONSOLE_DEBUG = false;

/**
 * Bonus when the same hub `stableKey` is contributed by multiple discovery pipelines (merge).
 * `sourceConsensusScore = min(HUB_SOURCE_CONSENSUS_MAX, max(0, (distinctKinds - 1) * HUB_SOURCE_CONSENSUS_PER_EXTRA))`.
 */
export const HUB_SOURCE_CONSENSUS_MAX = 0.12;
export const HUB_SOURCE_CONSENSUS_PER_EXTRA = 0.04;

/** Min LLM confidence to accept a semantic hub merge group (single-source kind). */
export const HUB_SEMANTIC_MERGE_MIN_CONFIDENCE = 0.6;
/** Min confidence when merging hubs of different primary `sourceKind`. */
export const HUB_SEMANTIC_MERGE_CROSS_KIND_MIN_CONFIDENCE = 0.85;

/** Minimum distinct documents under a folder path for folder hub candidates. */
export const FOLDER_HUB_MIN_DOCS = 4;

/** Keyset page size when scanning documents to rebuild folder hub materialized stats. */
export const FOLDER_HUB_STATS_DOC_PAGE_SIZE = 200;

/** Max documents per folder sampled for {@link computeFolderCohesionScore} during folder hub stats rebuild. */
export const FOLDER_COHESION_MAX_DOCS = 200;

/** Max semantic_related rows loaded when measuring intra-folder edge density. */
export const FOLDER_COHESION_INTRA_EDGE_LIMIT = 1200;

/**
 * Folder `hub_graph_score` blend in {@link MobiusNodeRepo.listTopFolderNodesForHubDiscovery} (SQL). Sum = 1.
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
 * Folder hub discovery: SQL fetch batch size = ceil(limit * {@link FOLDER_HUB_DISCOVER_FETCH_BATCH_MULTIPLIER}).
 * After nested-path compression, more rows may be fetched until enough representatives or max scan.
 */
export const FOLDER_HUB_DISCOVER_FETCH_BATCH_MULTIPLIER = 2;
/** Max rows read from SQL relative to target limit (limit * this) before stopping pagination. */
export const FOLDER_HUB_DISCOVER_MAX_SCAN_MULTIPLIER = 6;

/** Nested folder compression: child wins if score is at least this much above parent. */
export const FOLDER_HUB_DISCOVER_NEST_SCORE_CHILD_WIN = 0.03;
/** Nested folder compression: child wins if cohesion is this much higher and child has enough docs. */
export const FOLDER_HUB_DISCOVER_NEST_COHESION_CHILD_WIN = 0.1;
export const FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_STRONG = 6;
/** Large independent subtree: min docs and min share of parent's doc count. */
export const FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_DOCS_LARGE = 10;
export const FOLDER_HUB_DISCOVER_NEST_CHILD_MIN_RATIO = 0.35;
export const FOLDER_HUB_DISCOVER_NEST_SCORE_NEAR = 0.01;
/** Prefer parent: small child by doc count and share of parent. */
export const FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_DOCS = 6;
export const FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_MAX_RATIO = 0.2;
export const FOLDER_HUB_DISCOVER_NEST_SMALL_CHILD_SCORE_EPS = 0.015;
export const FOLDER_HUB_DISCOVER_NEST_COHESION_NEAR = 0.06;
/** Prefer parent: weak boundary degree vs parent. */
export const FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_MAX_DOCS = 8;
export const FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_BOUNDARY_RATIO = 0.35;
export const FOLDER_HUB_DISCOVER_NEST_WEAK_CHILD_SCORE_EPS = 0.02;

/**
 * Nested folder resolution: parent keeps docs outside the child subtree (heuristic), or has other
 * direct children in the candidate pool → prefer keeping both; {@link FOLDER_HUB_NEST_SHELL_*} flags a hollow parent.
 */
export const FOLDER_HUB_NEST_PARENT_RESIDUAL_MIN_DOCS = 8;
export const FOLDER_HUB_NEST_PARENT_RESIDUAL_RATIO = 0.22;
export const FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_DOCS = 4;
export const FOLDER_HUB_NEST_SHELL_MAX_RESIDUAL_RATIO = 0.12;

/**
 * Structural "broad folder" soft penalty (no name lists): many docs + low effective cohesion,
 * or org-heavy / sem-light profile vs cohesion. Capped by {@link FOLDER_HUB_BROAD_PENALTY_MAX}.
 */
export const FOLDER_HUB_BROAD_MIN_TAG_DOCS = 48;
export const FOLDER_HUB_BROAD_MAX_EFFECTIVE_COHESION = 0.12;
export const FOLDER_HUB_BROAD_PENALTY_BASE = 0.018;
export const FOLDER_HUB_BROAD_PENALTY_DOC_SCALE = 0.045;
export const FOLDER_HUB_BROAD_ORG_MIN = 0.48;
export const FOLDER_HUB_BROAD_SEM_MAX = 0.3;
export const FOLDER_HUB_BROAD_MISMATCH_PENALTY = 0.042;
export const FOLDER_HUB_BROAD_PENALTY_MAX = 0.085;

/** Stop SQL pagination once compressed rows reach this multiple of `limit` (pool for top-root quota). */
export const FOLDER_HUB_DISCOVER_QUOTA_POOL_MULTIPLIER = 2.4;
/** Max share of the final folder hub slots from one top-level vault root (first path segment). */
export const FOLDER_HUB_TOP_ROOT_MAX_FRACTION = 0.38;

/**
 * Indexing / search policy: long-range edges, rerank boosts.
 * Not exposed in plugin JSON — tune here.
 */

/** Reference edge marked long-range when LCA depth <= this and paths cross top-level folder. */
export const INDEX_LONG_RANGE_LCA_MAX_DEPTH = 1;

/** Hybrid rerank: boost for hub-tier incoming reference counts. */
export const INDEX_SEARCH_HUB_INCOMING_BOOST = 0.08;

/** Hybrid rerank: boost when incoming is secondary band (below hub, above none). */
export const INDEX_SEARCH_SECONDARY_INCOMING_BOOST = 0.04;

/** Anti-explosion: max new neighbor nodes to add in one expansion step (search-side). */
export const HUB_ANTI_EXPLOSION_MAX_NEW_NODES = 32;

/** Anti-explosion: stop when novelty ratio (new unique tokens / added nodes) falls below this. */
export const HUB_ANTI_EXPLOSION_MIN_NOVELTY_RATIO = 0.05;

/**
 * Hub-local weighted subgraph (`localGraphAssembler`): BFS caps, SQLite edge fetch size, scoring, and role heuristics.
 * Not exposed in plugin JSON; tune here for global behavior.
 */
export const LOCAL_HUB_GRAPH = {
	maxNodes: 80,
	maxEdges: 400,
	defaultMaxDepth: 4,
	/** Row cap for `listEdgesByTypesIncidentToAnyNode` per BFS layer. */
	edgeQueryLimit: 12_000,
	crossFolderPenalty: {
		incompletePaths: 0.15,
		acrossSubtree: 0.45,
	},
	folderCohesion: {
		defaultWhenMissing: 0.5,
		insideCenterFolder: 1,
		outsideCenterFolder: 0.35,
	},
	bridgeDegree: {
		/** Treat as “high hub connectivity” when both inc/out reach this (bridge penalty). */
		highThreshold: 10,
		penalty: 0.35,
	},
	nodeWeight: {
		depthDecayPerHop: 0.35,
		defaultTagAlignment: 0.5,
		cohesionBlendCohesion: 0.55,
		cohesionBlendAlignment: 0.45,
		quarter: 0.25,
		pagerankScale: 3,
		semanticPagerankScale: 1.2,
		bridgePenaltyScale: 0.15,
	},
	edgeWeight: {
		defaultBase: 0.5,
		references: 1,
		contains: 0.85,
		semanticRelated: 0.7,
		other: 0.5,
		crossPenaltyScale: 0.35,
	},
	tagAlignmentBlend: {
		neutralEmptyAnchors: 0.5,
		topics: 0.5,
		functionals: 0.3,
		keywords: 0.2,
	},
	roleHint: {
		boundaryMinDepth: 3,
		bridgeMinInc: 8,
		bridgeMinOut: 8,
		leafMaxTotalDegree: 2,
		bridgeMinTotalDegree: 12,
	},
	clusterHub: {
		memberDepth: 1,
		memberDistancePenalty: 0.3,
		memberCohesion: 0.9,
		memberWeightBase: 0.5,
		memberWeightSpread: 0.5,
		centerHubWeight: 1,
		stoppedAtDepth: 1,
	},
	/** Extra downweight for hints.deprioritizedBridgeNodeIds. */
	deprioritizedBridgeMultiplier: 0.65,
} as const;

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
 * As we may filter some results, we need to multiply the top K value by this factor. And get more results.
 * Also, we want to get more results to improve the quality of the search.
 */
export const DEFAULT_SEARCH_TOP_K_MULTI_FACTOR = 2;

/**
 * Default search mode.
 * Used when query.mode is not specified.
 */
export const DEFAULT_SEARCH_MODE = 'vault';

/**
 * RRF (Reciprocal Rank Fusion) configuration constants.
 */
export const RRF_K = 60;
// Two-stage RRF weights for hybrid search
// Stage 1: Content sources (fulltext + vector) merged with combined weight
export const RRF_CONTENT_WEIGHT = 0.6; // Combined weight for content hits (text + vector)
// Stage 2: Content vs Meta with equal weights
export const RRF_CONTENT_VS_META_WEIGHT = 0.5; // Weight for content hits vs meta hits

/**
 * Search scoring constants for keyword matching.
 * Used to boost search results based on keyword diversity and density.
 */
export const SEARCH_SCORING_DIVERSITY_BOOST_CONTENT = 0.5; // Up to 50% boost for diversity in content matches
export const SEARCH_SCORING_DENSITY_BOOST_CONTENT = 0.3; // Up to 30% boost for density in content matches
export const SEARCH_SCORING_MAX_OCCURRENCES_CONTENT = 10; // Max reasonable occurrences per keyword in content

export const SEARCH_SCORING_DIVERSITY_BOOST_META = 0.8; // Up to 80% boost for diversity in meta matches
export const SEARCH_SCORING_DENSITY_BOOST_META = 0.4; // Up to 40% boost for density in meta matches
export const SEARCH_SCORING_MAX_OCCURRENCES_META = 5; // Max reasonable occurrences per keyword in meta

/**
 * TODO: Turn these constants into configuration options, or make them optional parameters for tools.
 * 	This will allow the AI Agent to adjust them according to the specific scenario.
 * 	Different tasks require different "exploration scales". If the Agent can fine-tune PHYSICAL_CONNECTION_BONUS,
 * 	its ability to explore and discover will be significantly improved.
 * 
 * Graph Inspector RRF weights for document node ranking.
 * Weights are applied to each ranking dimension in the RRF formula.
 * Higher weight gives more importance to that dimension.
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
 * AI Search graph generation constants.
 */
export const AI_SEARCH_GRAPH_MAX_NODES_PER_SOURCE = 50; // Max nodes per source when building graph
export const AI_SEARCH_GRAPH_MAX_HOPS = 2; // Max hops from each source
export const AI_SEARCH_GRAPH_FINAL_MAX_NODES = 30; // Final max nodes in merged graph

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
 * Default suggestions for chat input when no conversation context is available.
 */
export const DEFAULT_CHAT_SUGGESTIONS = [
	'What are the latest trends in AI?',
	'How does machine learning work?',
	'Explain quantum computing',
	'Best practices for React development',
	'How to optimize database queries?',
	'What is the difference between REST and GraphQL?',
	'Explain the concept of clean code',
	'What are design patterns?',
] as const;

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

export const DEFAULT_TOOL_ERROR_RETRY_TIMES = 3;

/**
 * Central caps for `.slice(0, n)` and similar truncation (arrays, strings, previews).
 * Tune here instead of scattering magic numbers across call sites.
 */
export const SLICE_CAPS = {
	hub: {
		/** Cluster / member path lists in hub discovery, assembly, YAML, and local graph. */
		clusterMemberPaths: 48,
		/** Hex prefix length for stable cluster id from SHA256 (and MD5 UUID grouping below). */
		clusterHashHexPrefix: 16,
		/** Merged folder + local-graph member path sample. */
		memberPathsMergedSample: 48,
		/** Weighted document paths in hub assembly from local graph nodes. */
		assemblyMemberPathsSample: 32,
		/** Wiki-style member list lines in hub markdown skeleton. */
		markdownMemberWikiLines: 24,
		/** Max `hub_cluster_members` entries in Hub body JSON (`# Hub Metadata`). */
		hubBodyMetadataClusterMembers: 48,
		/** Routes / cluster paths embedded in Hub LLM metadata JSON. */
		llmMetadataRoutes: 24,
		/** Member notes to read snippets from for Hub LLM excerpts. */
		llmClusterMemberSnippets: 6,
		/** Hub draft markdown body chars sent to LLM. */
		llmDraftBodyChars: 28_000,
		/** Paths processed per discover round. */
		discoverRoundPaths: 120,
		/** Top folder-prefix buckets in local hub graph coverage. */
		localGraphTopFolderPrefixes: 8,
		/** Boundary node ids in frontier summary. */
		localGraphBoundaryNodes: 48,
		/** Path segment depth for folder aggregation (e.g. `a/b`). */
		pathFolderSegmentParts: 2,
	},
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