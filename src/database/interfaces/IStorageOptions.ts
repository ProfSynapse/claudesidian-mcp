/**
 * Interface for vector store configuration options
 */
export interface IStorageOptions {
  /**
   * Path for persistent storage (if applicable)
   */
  persistentPath?: string;
  
  /**
   * Whether to use ephemeral/in-memory storage
   */
  inMemory?: boolean;
  
  /**
   * Server configuration when using client-server mode
   */
  server?: {
    /**
     * Server host
     */
    host?: string;
    
    /**
     * Server port
     */
    port?: number;
    
    /**
     * Protocol to use (http or https)
     */
    protocol?: 'http' | 'https';
    
    /**
     * API key for authentication
     */
    apiKey?: string;
  };
  
  /**
   * Cache configuration
   */
  cache?: {
    /**
     * Whether to enable caching
     */
    enabled: boolean;
    
    /**
     * Maximum number of items to keep in memory cache
     */
    maxItems?: number;
    
    /**
     * Time-to-live for cached items in milliseconds
     */
    ttl?: number;
  };
  
  /**
   * Embedding settings
   */
  embedding?: {
    /**
     * Embedding dimension
     */
    dimension?: number;
    
    /**
     * Embedding model to use
     */
    model?: string;
  };
}