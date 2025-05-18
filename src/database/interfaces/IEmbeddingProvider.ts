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