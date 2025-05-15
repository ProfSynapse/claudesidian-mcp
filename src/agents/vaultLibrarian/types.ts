import { TFile } from 'obsidian';
import { SearchWeights } from './utils/SearchOperations';

/**
 * Search content arguments
 */
export interface SearchContentArgs {
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
export interface SearchContentResult {
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
export interface SearchTagArgs {
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
export interface SearchTagResult {
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
export interface SearchPropertyArgs {
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
export interface SearchPropertyResult {
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
export interface ListFolderArgs {
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
export interface ListFolderResult {
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
export interface ListNoteArgs {
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
export interface ListNoteResult {
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
export interface ListTagArgs {
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
export interface ListTagResult {
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
export interface ListPropertiesArgs {
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
export interface ListPropertiesResult {
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
export interface ListRecursiveArgs {
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
export interface BatchSearchArgs {
  /**
   * Array of search queries
   */
  queries: SearchContentArgs[];
}

/**
 * Batch search result
 */
export interface BatchSearchResult {
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
export interface ListRecursiveResult {
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