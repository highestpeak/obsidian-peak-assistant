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