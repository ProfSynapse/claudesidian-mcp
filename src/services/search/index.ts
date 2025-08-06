/**
 * Search Services Barrel Export
 * Location: src/services/search/index.ts
 * Purpose: Provides centralized exports for all search-related services
 */

// Search metrics service
export { SearchMetrics, type SearchMetricsInterface } from './SearchMetrics';

// Hybrid search cache service
export { HybridSearchCache, type HybridSearchCacheInterface } from './HybridSearchCache';

// Result fusion service
export { ResultFusion, type ResultFusionInterface } from './ResultFusion';

// Query coordination service
export { QueryCoordinator, type QueryCoordinatorInterface, type SearchProvider, type SearchCapabilities, type SearchStrategy } from './QueryCoordinator';