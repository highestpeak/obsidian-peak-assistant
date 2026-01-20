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
export const SEARCH_DB_FILENAME = 'search.sqlite';

/**
 * Meta database filename for chat and project data.
 */
export const META_DB_FILENAME = 'meta.sqlite';

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
	DEFAULT_ITERATIONS: 3,

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