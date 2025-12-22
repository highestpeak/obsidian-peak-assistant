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

