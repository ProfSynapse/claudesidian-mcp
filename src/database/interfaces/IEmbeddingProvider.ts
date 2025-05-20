/**
 * Interface for embedding generation services
 * Handles creating and managing vector embeddings from content
 */
export interface IEmbeddingProvider {
  /**
   * Initialize the embedding provider
   */
  initialize(): Promise<void>;
  
  /**
   * Generate embeddings for text content
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * Calculate cosine similarity between two vectors
   * @param a First vector
   * @param b Second vector
   * @returns Similarity score between 0 and 1
   */
  calculateSimilarity(a: number[], b: number[]): number;
  
  /**
   * Normalize a vector to unit length
   * @param vector Vector to normalize
   * @returns Normalized vector
   */
  normalizeVector(vector: number[]): number[];
  
  /**
   * Get the dimension of embeddings produced by this provider
   * @returns Embedding dimension
   */
  getDimension(): number;
  
  /**
   * Get the type/model of the embedding provider
   * @returns Provider type identifier
   */
  getType(): string;
}

/**
 * Extended interface for embedding providers that track token usage
 */
export interface ITokenTrackingProvider extends IEmbeddingProvider {
  /**
   * Get total tokens used this month
   */
  getTokensThisMonth(): number;
  
  /**
   * Get model usage stats
   */
  getModelUsage(): {[key: string]: number};
  
  /**
   * Get the total estimated cost based on token usage
   */
  getTotalCost(): number;
  
  /**
   * Update token usage stats
   * @param tokenCount Number of tokens to add
   * @param model Optional model name
   */
  updateUsageStats(tokenCount: number, model?: string): Promise<void>;
  
  /**
   * Reset usage stats to zero
   */
  resetUsageStats(): Promise<void>;
}