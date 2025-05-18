/**
 * Types related to vector embeddings and similarity search
 */

/**
 * Supported embedding models
 */
export type EmbeddingModel = 'default' | 'openai' | 'local' | 'custom';

/**
 * Structure for basic embedding data
 */
export interface BaseEmbedding {
  /**
   * Unique identifier
   */
  id: string;
  
  /**
   * Embedding vector
   */
  vector: number[];
  
  /**
   * Creation timestamp
   */
  timestamp: number;
}

/**
 * Structure for content embedding
 */
export interface ContentEmbedding extends BaseEmbedding {
  /**
   * The text content that was embedded
   */
  content: string;
  
  /**
   * Content type
   */
  contentType: 'text' | 'markdown' | 'html' | 'code';
  
  /**
   * Optional file path if this embedding is associated with a file
   */
  filePath?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Structure for file embedding
 */
export interface FileEmbedding extends BaseEmbedding {
  /**
   * Path to the file
   */
  filePath: string;
  
  /**
   * Associated workspace ID (optional)
   */
  workspaceId?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Structure for query result with similarity
 */
export interface SimilarityResult<T> {
  /**
   * The retrieved item
   */
  item: T;
  
  /**
   * Similarity score (0-1)
   */
  similarity: number;
  
  /**
   * Distance metric (if available)
   */
  distance?: number;
}

/**
 * Query options for similarity search
 */
export interface SimilarityQueryOptions {
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Minimum similarity threshold (0-1)
   */
  threshold?: number;
  
  /**
   * Metadata filter conditions
   */
  where?: Record<string, any>;
  
  /**
   * What to include in the results
   */
  include?: Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>;
}