import { CommonResult } from '../../types';
import { WorkspaceParameters } from '../../database/workspace-types';

/**
 * Base parameters for vector operations
 */
export interface VectorParameters extends WorkspaceParameters {
  /**
   * Optional context depth for vector operations
   * - minimal: Just basic information
   * - standard: Regular level of detail (default)
   * - comprehensive: Maximum detail and context
   */
  contextDepth?: 'minimal' | 'standard' | 'comprehensive';
}

/**
 * Base result for vector operations
 */
export interface VectorResult extends CommonResult {
  /**
   * Overrides the context string from CommonResult
   */
  context?: string;
}

/**
 * Collection-related parameter and result types
 */

// Parameters for creating a collection
export interface CreateCollectionParams extends VectorParameters {
  /**
   * Name of the collection to create
   */
  name: string;
  
  /**
   * Optional metadata for the collection
   */
  metadata?: Record<string, any>;
}

// Parameters for listing collections
export interface ListCollectionsParams extends VectorParameters {
  /**
   * Optional filter pattern for collection names
   */
  pattern?: string;
}

// Parameters for getting collection details
export interface GetCollectionParams extends VectorParameters {
  /**
   * Name of the collection to get
   */
  name: string;
  
  /**
   * Whether to include detailed statistics about the collection
   */
  includeStats?: boolean;
}

// Parameters for deleting a collection
export interface DeleteCollectionParams extends VectorParameters {
  /**
   * Name of the collection to delete
   */
  name: string;
  
  /**
   * Whether to force deletion even if collection contains items
   */
  force?: boolean;
}

// Result for collection operations
export interface CollectionResult extends VectorResult {
  data?: {
    /**
     * Collection name
     */
    name?: string;
    
    /**
     * Collection metadata
     */
    metadata?: Record<string, any>;
    
    /**
     * Collection creation status
     */
    created?: boolean;
    
    /**
     * Collection deletion status
     */
    deleted?: boolean;
    
    /**
     * List of collections
     */
    collections?: Array<{
      name: string;
      itemCount?: number;
      metadata?: Record<string, any>;
    }>;
    
    /**
     * Collection statistics
     */
    stats?: {
      itemCount: number;
      totalEmbeddings: number;
      dimensionality: number;
      lastUpdated?: string;
    };
  };
}

/**
 * Embedding-related parameter and result types
 */

// Parameters for adding embeddings to a collection
export interface AddEmbeddingsParams extends VectorParameters {
  /**
   * Collection name
   */
  collectionName: string;
  
  /**
   * Items to add (can provide either text or embeddings)
   */
  items: Array<{
    /**
     * Unique identifier for the embedding
     */
    id: string;
    
    /**
     * Text content to be embedded (optional if embedding is provided)
     */
    text?: string;
    
    /**
     * Pre-computed embedding vector (optional if text is provided)
     */
    embedding?: number[];
    
    /**
     * Metadata to associate with the embedding
     */
    metadata?: Record<string, any>;
  }>;
  
  /**
   * Whether to overwrite existing embeddings with the same IDs
   */
  overwrite?: boolean;
}

// Parameters for getting embeddings
export interface GetEmbeddingsParams extends VectorParameters {
  /**
   * Collection name
   */
  collectionName: string;
  
  /**
   * IDs of the embeddings to get
   */
  ids: string[];
  
  /**
   * Whether to include the actual embedding vectors in the result
   */
  includeEmbeddings?: boolean;
}

// Parameters for deleting embeddings
export interface DeleteEmbeddingsParams extends VectorParameters {
  /**
   * Collection name
   */
  collectionName: string;
  
  /**
   * IDs of the embeddings to delete
   */
  ids: string[];
}

// Parameters for querying embeddings
export interface QueryEmbeddingsParams extends VectorParameters {
  /**
   * Collection name
   */
  collectionName: string;
  
  /**
   * Text query (optional if embedding is provided)
   */
  query?: string;
  
  /**
   * Pre-computed embedding vector (optional if query is provided)
   */
  embedding?: number[];
  
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Minimum similarity threshold (0-1)
   */
  threshold?: number;
  
  /**
   * Optional ChromaDB where clause for filtering
   */
  where?: Record<string, any>;
  
  /**
   * Whether to include the actual embedding vectors in the result
   */
  includeEmbeddings?: boolean;
}

// Result for embedding operations
export interface EmbeddingResult extends VectorResult {
  data?: {
    /**
     * Collection name
     */
    collectionName?: string;
    
    /**
     * Added embeddings count
     */
    added?: number;
    
    /**
     * Deleted embeddings count
     */
    deleted?: number;
    
    /**
     * List of embedding items
     */
    items?: Array<{
      id: string;
      text?: string;
      embedding?: number[];
      metadata?: Record<string, any>;
    }>;
    
    /**
     * Query results
     */
    matches?: Array<{
      id: string;
      text?: string;
      embedding?: number[];
      metadata?: Record<string, any>;
      similarity: number;
    }>;
  };
}

/**
 * Batch operations types
 */

// Parameters for batch embedding operation
export interface BatchEmbeddingsParams extends VectorParameters {
  /**
   * Collection name
   */
  collectionName: string;
  
  /**
   * Type of batch operation to perform
   */
  operation: 'add' | 'update' | 'delete' | 'query';
  
  /**
   * Text items to process
   */
  items: Array<{
    id: string;
    text?: string;
    embedding?: number[];
    metadata?: Record<string, any>;
  }>;
  
  /**
   * Whether to overwrite existing embeddings with the same IDs
   * Only applicable for add/update operations
   */
  overwrite?: boolean;
  
  /**
   * Options for query operation
   */
  queryOptions?: {
    limit?: number;
    threshold?: number;
    where?: Record<string, any>;
    includeEmbeddings?: boolean;
  };
}

// Result for batch operations
export interface BatchResult extends VectorResult {
  data?: {
    /**
     * Collection name
     */
    collectionName?: string;
    
    /**
     * Operation performed
     */
    operation?: 'add' | 'update' | 'delete' | 'query';
    
    /**
     * Number of items processed
     */
    processed?: number;
    
    /**
     * Number of items that failed processing
     */
    failed?: number;
    
    /**
     * Individual results for each item
     */
    results?: Array<{
      id: string;
      success: boolean;
      error?: string;
      matches?: Array<{
        id: string;
        similarity: number;
        text?: string;
        metadata?: Record<string, any>;
      }>;
    }>;
  };
}