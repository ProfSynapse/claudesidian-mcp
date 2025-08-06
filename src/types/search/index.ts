/**
 * Search-related types export barrel
 * Centralizes all search and memory query type exports
 */

// Original search types
export type {
  EmbeddingRecord,
  MemoryQueryParams,
  MemoryQueryResult,
  MemoryUsageStats
} from './SearchTypes';

// New search result types
export * from './SearchResults';

// New search metadata and performance types
export * from './SearchMetadata';