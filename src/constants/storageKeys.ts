/**
 * Storage key constants for localStorage
 * These are the base keys that will be namespaced with vault/plugin IDs
 */

// Token usage related keys
export const STORAGE_KEYS = {
  // Token tracking
  TOKENS_USED: 'claudesidian-tokens-used',
  TOKEN_USAGE: 'claudesidian-token-usage',
  TOKENS_ALL_TIME: 'claudesidian-tokens-all-time',
  
  // Collection events
  COLLECTION_DELETED: 'claudesidian-collection-deleted',
  COLLECTIONS_PURGED: 'claudesidian-collections-purged',
  
  // Embeddings progress
  EMBEDDINGS_PROGRESS: 'claudesidian_embeddings_progress',
  
  // Indexing state
  INDEXING_STATE: 'claudesidian-indexing-state',
  INDEXING_OPERATION: 'claudesidian-indexing-operation',
  
  // Session tracking
  ACTIVE_SESSION: 'claudesidian-active-session',
  
  // Usage stats
  USAGE_STATS: 'claudesidian-usage-stats',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];