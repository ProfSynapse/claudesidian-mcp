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
   * Supports metadata filtering syntax: "tag:javascript priority:high content query"
   */
  query: string;

  /**
   * Search strategy type - controls weighting of semantic/keyword/fuzzy search methods
   * - 'exact': 70% keyword, 20% semantic, 10% fuzzy (for specific terms)
   * - 'conceptual': 60% semantic, 30% keyword, 10% fuzzy (for topics)
   * - 'exploratory': 80% semantic, 15% fuzzy, 5% keyword (for questions)
   * - 'mixed': 40% semantic, 40% keyword, 20% fuzzy (balanced)
   */
  queryType?: 'exact' | 'conceptual' | 'exploratory' | 'mixed';
  
  /**
   * Maximum number of results per category (default: 10)
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
   * Additional metadata filters (alternative to query syntax)
   */
  metadataFilters?: {
    /**
     * Tags to filter by (AND logic if multiple)
     */
    tags?: string[];
    
    /**
     * Properties to filter by (field: value pairs)
     */
    properties?: Record<string, any>;
    
    /**
     * Logic operator for combining filters ('AND' | 'OR')
     */
    operator?: 'AND' | 'OR';
  };
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
   * File metadata (tags, properties) if applicable
   */
  fileMetadata?: {
    tags?: string[];
    properties?: Record<string, any>;
    aliases?: string[];
  };
  
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
    metadataFiltersApplied?: {
      tags?: string[];
      properties?: Record<string, any>;
      operator?: 'AND' | 'OR';
      filesFilteredByMetadata?: number;
    };
  };
  
  /**
   * Suggested prompt for using ContentManager's batchContent mode to read the most relevant files
   * This encourages deeper exploration of search results by reading full file contents
   */
  contextPrompt?: string;
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
    totalExecutionTimeMS: number;
    queriesExecuted: number;
    queriesFailed: number;
    avgExecutionTimeMS: number;
  };
}

