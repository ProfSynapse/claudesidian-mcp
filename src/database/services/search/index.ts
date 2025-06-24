export { ScoringService, type SearchWeights, type ScoreResult, DEFAULT_SEARCH_WEIGHTS } from '../ScoringService';
export { 
    MetadataSearchService, 
    type MetadataSearchOptions, 
    type PropertySearchResult, 
    type PropertyFilter,
    type MetadataSearchCriteria 
} from '../MetadataSearchService';

// Hybrid search components
export { QueryAnalyzer, type QueryAnalysis, type SearchWeights as HybridSearchWeights } from './QueryAnalyzer';
export { KeywordSearchService, type KeywordSearchResult, type SearchableDocument } from './KeywordSearchService';
export { FuzzySearchService, type FuzzySearchResult, type FuzzyDocument } from './FuzzySearchService';
export { HybridSearchService, type HybridSearchResult, type HybridSearchOptions } from './HybridSearchService';