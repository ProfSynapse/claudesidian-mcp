/**
 * Constants for the IndexedDB vector store
 */

/**
 * Default database name
 */
export const DEFAULT_DB_NAME = 'memory-store';

/**
 * Store names
 */
export const STORE_NAMES = {
    EMBEDDINGS: 'embeddings'
};

/**
 * Index names
 */
export const INDEX_NAMES = {
    BY_FILE: 'by-file',
    BY_TIMESTAMP: 'by-timestamp'
};

/**
 * Database schema version
 */
export const DB_VERSION = 1;

/**
 * Default similarity threshold for vector search
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Default limit for search results
 */
export const DEFAULT_SEARCH_LIMIT = 10;

/**
 * Default graph boost factor
 */
export const DEFAULT_GRAPH_BOOST_FACTOR = 0.3;

/**
 * Default max distance for graph boosting
 */
export const DEFAULT_GRAPH_MAX_DISTANCE = 1;

/**
 * Estimated size per embedding in KB
 * Used for database size estimation
 */
export const EMBEDDING_SIZE_KB = 20;