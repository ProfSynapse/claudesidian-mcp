/**
 * Defines the core vector store operations for embedding storage and retrieval
 * Interface for vector database operations that all implementations must follow
 */
export interface IVectorStore {
  /**
   * Initialize the vector store
   */
  initialize(): Promise<void>;
  
  /**
   * Close the vector store connection
   */
  close(): Promise<void>;
  
  /**
   * Create a collection to store vectors
   * @param collectionName Name of the collection to create
   * @param metadata Optional metadata for the collection
   */
  createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void>;
  
  /**
   * Get a collection by name
   * @param collectionName Name of the collection to retrieve
   * @returns Whether the collection exists
   */
  hasCollection(collectionName: string): Promise<boolean>;
  
  /**
   * List all collections
   * @returns Array of collection names
   */
  listCollections(): Promise<string[]>;
  
  /**
   * Delete a collection
   * @param collectionName Name of the collection to delete
   */
  deleteCollection(collectionName: string): Promise<void>;
  
  /**
   * Add items to a collection
   * @param collectionName Name of the collection
   * @param items Items to add
   */
  addItems(collectionName: string, items: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  
  /**
   * Get items by ID from a collection
   * @param collectionName Name of the collection
   * @param ids IDs of the items to retrieve
   * @param include What to include in the response
   */
  getItems(collectionName: string, ids: string[], include?: Array<'embeddings' | 'metadatas' | 'documents'>): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
  
  /**
   * Update items in a collection
   * @param collectionName Name of the collection
   * @param items Items to update
   */
  updateItems(collectionName: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  
  /**
   * Delete items from a collection
   * @param collectionName Name of the collection
   * @param ids IDs of the items to delete
   */
  deleteItems(collectionName: string, ids: string[]): Promise<void>;
  
  /**
   * Query a collection by embeddings
   * @param collectionName Name of the collection
   * @param query Query parameters
   */
  query(collectionName: string, query: {
    queryEmbeddings: number[][];
    nResults?: number;
    where?: Record<string, any>;
    include?: Array<'embeddings' | 'metadatas' | 'documents' | 'distances'>;
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }>;
  
  /**
   * Get count of items in a collection
   * @param collectionName Name of the collection
   */
  count(collectionName: string): Promise<number>;
}