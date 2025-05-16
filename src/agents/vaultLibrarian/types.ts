import { TFile } from 'obsidian';
import { SearchWeights } from './utils/SearchOperations';
import { CommonParameters, CommonResult } from '../../types';
import { WorkspaceParameters, WorkspaceResult } from './workspace-types';

/**
 * Search content arguments
 */
export interface SearchContentArgs extends CommonParameters {
  /**
   * Query to search for
   */
  query: string;
  
  /**
   * Paths to search in (optional)
   */
  paths?: string[];
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;

  /**
   * Whether to include metadata in the search (optional, default: true)
   */
  includeMetadata?: boolean;

  /**
   * Fields to search in (optional, default: ["title", "content", "tags"])
   */
  searchFields?: string[];

  /**
   * Custom weights for different search factors (optional)
   */
  weights?: Partial<SearchWeights>;

  /**
   * Whether to include content in the results (optional, default: false)
   */
  includeContent?: boolean;
}

/**
 * Search content result
 */
export interface SearchContentResult extends CommonResult {
  /**
   * List of search results
   */
  results: SearchResult[];
  
  /**
   * Total number of results
   */
  total: number;
  
  /**
   * Average score of results (optional)
   */
  averageScore?: number;
  
  /**
   * Path to the top result (optional)
   */
  topResult?: string;
}

/**
 * Search result
 */
export interface SearchResult {
  /**
   * Path to the file
   */
  path: string;
  
  /**
   * Content snippet
   */
  snippet: string;
  
  /**
   * Line number
   */
  line: number;
  
  /**
   * Character position
   */
  position: number;
  
  /**
   * Result score (optional)
   */
  score?: number;
}

/**
 * Search tag arguments
 */
export interface SearchTagArgs extends CommonParameters {
  /**
   * Tag to search for
   */
  tag: string;
  
  /**
   * Paths to search in (optional)
   */
  paths?: string[];
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;
}

/**
 * Search tag result
 */
export interface SearchTagResult extends CommonResult {
  /**
   * List of files with the tag
   */
  files: string[];
  
  /**
   * Total number of files
   */
  total: number;
}

/**
 * Search property arguments
 */
export interface SearchPropertyArgs extends CommonParameters {
  /**
   * Property key
   */
  key: string;
  
  /**
   * Property value (optional)
   */
  value?: string;
  
  /**
   * Paths to search in (optional)
   */
  paths?: string[];
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;
}

/**
 * Search property result
 */
export interface SearchPropertyResult extends CommonResult {
  /**
   * List of files with the property
   */
  files: PropertyMatch[];
  
  /**
   * Total number of files
   */
  total: number;
}

/**
 * Property match
 */
export interface PropertyMatch {
  /**
   * Path to the file
   */
  path: string;
  
  /**
   * Property value
   */
  value: string;
}

/**
 * List folder arguments
 */
export interface ListFolderArgs extends CommonParameters {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * Whether to include files (default: true)
   */
  includeFiles?: boolean;
  
  /**
   * Whether to include folders (default: true)
   */
  includeFolders?: boolean;
  
  /**
   * Whether to include hidden files (default: false)
   */
  includeHidden?: boolean;
}

/**
 * List folder result
 */
export interface ListFolderResult extends CommonResult {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * List of files in the folder
   */
  files: string[];
  
  /**
   * List of folders in the folder
   */
  folders: string[];
}

/**
 * List note arguments
 */
export interface ListNoteArgs extends CommonParameters {
  /**
   * Path to search in (optional)
   */
  path?: string;
  
  /**
   * Filter by extension (optional)
   */
  extension?: string;
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;
}

/**
 * List note result
 */
export interface ListNoteResult extends CommonResult {
  /**
   * List of notes
   */
  notes: string[];
  
  /**
   * Total number of notes
   */
  total: number;
}

/**
 * List tag arguments
 */
export interface ListTagArgs extends CommonParameters {
  /**
   * Filter by prefix (optional)
   */
  prefix?: string;
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;
}

/**
 * List tag result
 */
export interface ListTagResult extends CommonResult {
  /**
   * List of tags
   */
  tags: string[];
  
  /**
   * Total number of tags
   */
  total: number;
}

/**
 * List properties arguments
 */
export interface ListPropertiesArgs extends CommonParameters {
  /**
   * Filter by key (optional)
   */
  key?: string;
  
  /**
   * Maximum number of results to return (optional)
   */
  limit?: number;
}

/**
 * List properties result
 */
export interface ListPropertiesResult extends CommonResult {
  /**
   * Map of property keys to values
   */
  properties: Record<string, string[]>;
  
  /**
   * Total number of properties
   */
  total: number;
}

/**
 * List recursive arguments
 */
export interface ListRecursiveArgs extends CommonParameters {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * Whether to include files (default: true)
   */
  includeFiles?: boolean;
  
  /**
   * Whether to include folders (default: true)
   */
  includeFolders?: boolean;
  
  /**
   * Whether to include hidden files (default: false)
   */
  includeHidden?: boolean;
}

/**
 * Batch search arguments
 */
export interface BatchSearchArgs extends CommonParameters {
  /**
   * Array of search queries
   */
  queries: SearchContentArgs[];
}

/**
 * Batch search result
 */
export interface BatchSearchResult extends CommonResult {
  /**
   * Array of search results
   */
  results: SearchContentResult[];
  
  /**
   * Total number of queries processed
   */
  total: number;
  
  /**
   * Any errors that occurred during processing
   */
  errors?: Record<string, string>;
}

/**
 * List recursive result
 */
export interface ListRecursiveResult extends CommonResult {
  /**
   * Path to the folder
   */
  path: string;
  
  /**
   * List of files in the folder and subfolders
   */
  files: string[];
  
  /**
   * List of folders in the folder and subfolders
   */
  folders: string[];
}

/**
 * Semantic search parameters
 */
export interface SemanticSearchParams extends WorkspaceParameters {
  /**
   * The query to search for
   */
  query: string;
  
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Similarity threshold (0-1)
   */
  threshold?: number;

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
 * Combined search parameters (combines semantic search with metadata filtering)
 */
export interface CombinedSearchParams extends SemanticSearchParams {
  /**
   * Optional filters to apply to the search
   */
  filters?: {
    /**
     * Filter by file tags
     */
    tags?: string[];
    
    /**
     * Filter by file paths
     */
    paths?: string[];
    
    /**
     * Filter by frontmatter properties
     */
    properties?: Record<string, any>;
    
    /**
     * Filter by date range
     */
    dateRange?: {
      start?: string;
      end?: string;
    };
    
    /**
     * Graph boosting options
     */
    graphOptions?: {
      /**
       * Whether to use graph-based relevance boosting
       */
      useGraphBoost?: boolean;
      
      /**
       * Graph boost factor (0-1)
       */
      boostFactor?: number;
      
      /**
       * Maximum distance for graph connections
       */
      maxDistance?: number;
      
      /**
       * List of seed note paths to prioritize in results
       */
      seedNotes?: string[];
    };
  };
}

/**
 * Semantic search result
 */
export interface SemanticSearchResult extends CommonResult {
  data?: {
    matches: Array<{
      similarity: number;
      content: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      metadata?: any;
    }>;
  };
}

/**
 * Create embeddings parameters
 */
export interface CreateEmbeddingsParams extends WorkspaceParameters {
  /**
   * Path to the file to index
   */
  filePath: string;
  
  /**
   * Whether to force re-indexing even if the file has not changed
   */
  force?: boolean;
}

/**
 * Create embeddings result
 */
export interface CreateEmbeddingsResult extends CommonResult {
  data?: {
    filePath: string;
    chunks?: number;
  };
}

/**
 * Batch create embeddings parameters
 */
export interface BatchCreateEmbeddingsParams extends WorkspaceParameters {
  /**
   * Paths to the files to index
   */
  filePaths: string[];
  
  /**
   * Whether to force re-indexing even if files have not changed
   */
  force?: boolean;
}

/**
 * Batch create embeddings result
 */
export interface BatchCreateEmbeddingsResult extends CommonResult {
  data?: {
    results: Array<{
      success: boolean;
      filePath: string;
      chunks?: number;
      error?: string;
    }>;
    processed: number;
    failed: number;
  };
}