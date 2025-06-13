import { CommonParameters, CommonResult } from '../../types';





/**
 * Graph boost options for enhancing search results using graph connections
 */
export interface GraphBoostOptions {
  /**
   * Whether to use graph-based relevance boosting
   */
  useGraphBoost?: boolean;

  /**
   * Graph boost factor (0-1)
   */
  graphBoostFactor?: number;

  /**
   * Maximum distance for graph connections
   */
  graphMaxDistance?: number;

  /**
   * List of seed note paths to prioritize in results
   */
  seedNotes?: string[];
}


/**
 * Universal search category types
 */
export type CategoryType = 
  | 'files'
  | 'folders' 
  | 'content'
  | 'workspaces'
  | 'sessions'
  | 'snapshots'
  | 'memory_traces'
  | 'tags'
  | 'properties';

/**
 * Universal search parameters
 */
export interface UniversalSearchParams extends CommonParameters, GraphBoostOptions {
  /**
   * Search query across all content types
   */
  query: string;
  
  /**
   * Maximum number of results per category (default: 5)
   */
  limit?: number;
  
  /**
   * Categories to exclude from search
   */
  excludeCategories?: CategoryType[];
  
  /**
   * Categories to prioritize (return more results)
   */
  prioritizeCategories?: CategoryType[];
  
  /**
   * Paths to restrict search to
   */
  paths?: string[];
  
  /**
   * Whether to include content snippets in results (default: true)
   */
  includeContent?: boolean;
  
  /**
   * Force semantic search even if traditional might be better (default: auto-detect)
   */
  forceSemanticSearch?: boolean;
  
  /**
   * Similarity threshold for semantic search (0-1, default: 0.7)
   */
  semanticThreshold?: number;
}

/**
 * Search result item for any category
 */
export interface UniversalSearchResultItem {
  /**
   * Item identifier (file path, workspace id, etc.)
   */
  id: string;
  
  /**
   * Display title/name
   */
  title: string;
  
  /**
   * Content snippet or description
   */
  snippet?: string;
  
  /**
   * Search relevance score (0-1)
   */
  score: number;
  
  /**
   * Search method used for this result
   */
  searchMethod: 'semantic' | 'fuzzy' | 'exact' | 'hybrid';
  
  /**
   * Category-specific metadata
   */
  metadata?: Record<string, any>;
  
  /**
   * Full content (if includeContent is true)
   */
  content?: string;
}

/**
 * Search results for a specific category
 */
export interface SearchResultCategory {
  /**
   * Total number of results found in this category
   */
  count: number;
  
  /**
   * Top results (up to limit)
   */
  results: UniversalSearchResultItem[];
  
  /**
   * Whether more results are available beyond the limit
   */
  hasMore: boolean;
  
  /**
   * Primary search method used for this category
   */
  searchMethod: 'semantic' | 'fuzzy' | 'exact' | 'hybrid';
  
  /**
   * Whether semantic search was available for this category
   */
  semanticAvailable: boolean;
}

/**
 * Universal search results organized by category
 */
export interface UniversalSearchResult extends CommonResult {
  /**
   * Original search query
   */
  query: string;
  
  /**
   * Total number of results across all categories
   */
  totalResults: number;
  
  /**
   * Search execution time in milliseconds
   */
  executionTime: number;
  
  /**
   * Results organized by category
   */
  categories: {
    files?: SearchResultCategory;
    folders?: SearchResultCategory;
    content?: SearchResultCategory;
    workspaces?: SearchResultCategory;
    sessions?: SearchResultCategory;
    snapshots?: SearchResultCategory;
    memory_traces?: SearchResultCategory;
    tags?: SearchResultCategory;
    properties?: SearchResultCategory;
  };
  
  /**
   * Overall search strategy information
   */
  searchStrategy: {
    semanticAvailable: boolean;
    categoriesSearched: CategoryType[];
    categoriesExcluded: CategoryType[];
    fallbacksUsed: CategoryType[];
  };
}

/**
 * Batch universal search parameters
 */
export interface BatchUniversalSearchParams extends CommonParameters {
  /**
   * Array of universal search queries to execute
   */
  searches: UniversalSearchParams[];
  
  /**
   * Whether to merge all results into a single response
   */
  mergeResults?: boolean;
  
  /**
   * Maximum concurrent searches to execute (default: 5)
   */
  maxConcurrency?: number;
}

/**
 * Batch universal search results
 */
export interface BatchUniversalSearchResult extends CommonResult {
  /**
   * Individual search results (if mergeResults is false)
   */
  searches?: UniversalSearchResult[];
  
  /**
   * Merged search results (if mergeResults is true)
   */
  merged?: {
    totalQueries: number;
    totalResults: number;
    combinedCategories: {
      files?: SearchResultCategory;
      folders?: SearchResultCategory;
      content?: SearchResultCategory;
      workspaces?: SearchResultCategory;
      sessions?: SearchResultCategory;
      snapshots?: SearchResultCategory;
      memory_traces?: SearchResultCategory;
      tags?: SearchResultCategory;
      properties?: SearchResultCategory;
    };
  };
  
  /**
   * Execution statistics
   */
  stats: {
    totalExecutionTime: number;
    queriesExecuted: number;
    queriesFailed: number;
    avgExecutionTime: number;
  };
}

