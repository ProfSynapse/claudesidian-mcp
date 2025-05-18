import { BaseEmbeddingProvider } from '../base/BaseEmbeddingProvider';

/**
 * Embedding provider for ChromaDB
 * Handles vector embedding generation for text content
 */
export class ChromaEmbeddingProvider extends BaseEmbeddingProvider {
  /**
   * External embedding function for flexibility
   */
  private embeddingFunction: (texts: string[]) => Promise<number[][]>;
  
  /**
   * Create a new ChromaDB embedding provider
   * @param embeddingFunction Optional external embedding function
   * @param dimension Embedding vector dimension
   */
  constructor(
    embeddingFunction?: (texts: string[]) => Promise<number[][]>,
    dimension: number = 1536
  ) {
    super(dimension, 'chroma');
    
    // Use provided embedding function or create a default one
    this.embeddingFunction = embeddingFunction || this.defaultEmbeddingFunction.bind(this);
  }
  
  /**
   * Initialize the embedding provider
   */
  async initialize(): Promise<void> {
    // Nothing specific to initialize for the default provider
    console.log(`ChromaDB embedding provider initialized with dimension: ${this.dimension}`);
    return Promise.resolve();
  }
  
  /**
   * Generate embeddings for text content
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      return await this.embeddingFunction(texts);
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }
  
  /**
   * Default embedding function that uses a simple hashing approach
   * This is a fallback that should be replaced with a proper embedding model in production
   * @param texts Array of text content to embed
   * @returns Array of embedding vectors
   */
  private async defaultEmbeddingFunction(texts: string[]): Promise<number[][]> {
    return texts.map(text => {
      // Simple hash-based embedding - NOT FOR PRODUCTION USE
      // This is just a placeholder that creates vectors with the right dimension
      const vector = new Array(this.dimension).fill(0);
      
      // Generate some variation based on the text content
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const position = i % this.dimension;
        vector[position] += charCode / 1000;
      }
      
      // Normalize to unit length
      return this.normalizeVector(vector);
    });
  }
  
  /**
   * Set a custom embedding function
   * @param embeddingFunction Custom embedding function
   */
  setEmbeddingFunction(embeddingFunction: (texts: string[]) => Promise<number[][]>): void {
    this.embeddingFunction = embeddingFunction;
  }
}