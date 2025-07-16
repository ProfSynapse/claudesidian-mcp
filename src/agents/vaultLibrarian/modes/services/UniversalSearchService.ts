/**
 * UniversalSearchService - Refactored following SOLID principles
 * 
 * Main entry point that exports the refactored UniversalSearchService
 * and maintains backward compatibility
 */

// Export the refactored UniversalSearchService
export { UniversalSearchService } from './universal/UniversalSearchService';

// Export individual services if needed
export { QueryParser } from './universal/query/QueryParser';
export { ContentSearchStrategy } from './universal/strategies/ContentSearchStrategy';
export { FileSearchStrategy } from './universal/strategies/FileSearchStrategy';
export { MetadataSearchStrategy } from './universal/strategies/MetadataSearchStrategy';
export { ResultConsolidator } from './universal/results/ResultConsolidator';
export { ResultFormatter } from './universal/results/ResultFormatter';
export { ServiceInitializer } from './universal/initialization/ServiceInitializer';

// Export types for external use
export type { ParsedSearchQuery } from './universal/query/QueryParser';
export type { ConsolidatedSearchResult, SearchSnippet } from './universal/results/ResultConsolidator';
export type { FormattingOptions } from './universal/results/ResultFormatter';
export type { ServiceAvailability } from './universal/initialization/ServiceInitializer';