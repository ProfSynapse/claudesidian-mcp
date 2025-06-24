import { IEmbeddingProvider } from '../../interfaces/IEmbeddingProvider';

/**
 * Abstract base class for embedding provider implementations
 * Provides common functionality and type-safety for embedding providers
 */
export abstract class BaseEmbeddingProvider implements IEmbeddingProvider {
  /**
   * Embedding dimension
   */
  protected dimension: number;
  
  /**
   * Provider type identifier
   */
  protected type: string;
  
  /**
   * Create a new base embedding provider
   * @param dimension Embedding dimension
   * @param type Provider type identifier
   */
  constructor(dimension: number, type: string = 'default') {
    this.dimension = dimension;
    this.type = type;
  }
  
  /**
   * Initialize the embedding provider
   */
  abstract initialize(): Promise<void>;
  
  /**
   * Generate embeddings for text content
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  abstract generateEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * Calculate cosine similarity between two vectors
   * @param a First vector
   * @param b Second vector
   * @returns Similarity score between 0 and 1
   */
  calculateSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  /**
   * Normalize a vector to unit length
   * @param vector Vector to normalize
   * @returns Normalized vector
   */
  normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (norm === 0) {
      return new Array(vector.length).fill(0);
    }
    
    return vector.map(val => val / norm);
  }
  
  /**
   * Get the dimension of embeddings produced by this provider
   * @returns Embedding dimension
   */
  getDimension(): number {
    return this.dimension;
  }
  
  /**
   * Get the type/model of the embedding provider
   * @returns Provider type identifier
   */
  getType(): string {
    return this.type;
  }
}