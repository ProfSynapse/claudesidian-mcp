import { IVectorStore } from '../../interfaces/IVectorStore';
import { ChromaCollectionManager } from '../../providers/chroma/ChromaCollectionManager';

/**
 * Service responsible for managing ChromaDB collections.
 * Provides a clean abstraction over the ChromaCollectionManager
 * and handles all collection-level operations.
 * 
 * @remarks
 * This service follows the Single Responsibility Principle by focusing
 * solely on collection management operations. It acts as a facade
 * over the ChromaCollectionManager, providing type-safe methods
 * and consistent error handling.
 */
export class CollectionManagerService {
  private readonly collectionManager: ChromaCollectionManager;

  /**
   * Creates a new CollectionManagerService instance
   * @param vectorStore - Vector store instance to manage collections for
   */
  constructor(private readonly vectorStore: IVectorStore) {
    this.collectionManager = new ChromaCollectionManager(vectorStore);
  }

  /**
   * Initialize the collection manager
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    try {
      await this.collectionManager.initialize();
    } catch (error) {
      console.warn(`Failed to initialize collection manager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the raw ChromaDB collection manager instance
   * @returns ChromaCollectionManager instance
   * @deprecated Use the typed methods instead of accessing the raw manager
   */
  getCollectionManager(): ChromaCollectionManager {
    return this.collectionManager;
  }

  /**
   * Get the vector store instance
   * @returns The vector store used by this service
   */
  getVectorStore(): IVectorStore {
    return this.vectorStore;
  }

  /**
   * Create a new collection in ChromaDB
   * @param name - Collection name
   * @param metadata - Optional collection metadata
   * @returns Promise resolving to the created collection
   * @throws Error if collection creation fails
   */
  async createCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    return this.collectionManager.createCollection(name, metadata);
  }

  /**
   * Get a collection from ChromaDB
   * @param name - Collection name
   * @returns Promise resolving to the collection or null if not found
   */
  async getCollection(name: string): Promise<any> {
    return this.collectionManager.getCollection(name);
  }

  /**
   * Get or create a collection in ChromaDB
   * @param name - Collection name
   * @param metadata - Optional collection metadata
   * @returns Promise resolving to the collection
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    return this.collectionManager.getOrCreateCollection(name, metadata);
  }

  /**
   * Check if a collection exists in ChromaDB
   * @param name - Collection name
   * @returns Promise resolving to whether the collection exists
   */
  async hasCollection(name: string): Promise<boolean> {
    return this.collectionManager.hasCollection(name);
  }

  /**
   * List all collections in ChromaDB
   * @returns Promise resolving to array of collection names
   */
  async listCollections(): Promise<string[]> {
    return this.collectionManager.listCollections();
  }

  /**
   * Get detailed information about all collections
   * @returns Promise resolving to array of collection details
   */
  async getCollectionDetails(): Promise<Array<{ name: string; metadata?: Record<string, any> }>> {
    return this.collectionManager.getCollectionDetails();
  }

  /**
   * Delete a collection from ChromaDB
   * @param name - Collection name
   * @returns Promise that resolves when deletion is complete
   * @throws Error if collection deletion fails
   */
  async deleteCollection(name: string): Promise<void> {
    return this.collectionManager.deleteCollection(name);
  }

  /**
   * Add items to a collection in ChromaDB
   * @param name - Collection name
   * @param items - Items to add with IDs, embeddings, metadata, and documents
   * @returns Promise that resolves when items are added
   * @throws Error if adding items fails
   */
  async addItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    return this.collectionManager.addItems(name, items);
  }

  /**
   * Query a collection in ChromaDB using vector similarity
   * @param name - Collection name
   * @param queryEmbedding - Query embedding vector
   * @param options - Query options including result count and filters
   * @returns Promise resolving to query results
   */
  async query(name: string, queryEmbedding: number[], options?: {
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    return this.collectionManager.query(name, {
      queryEmbeddings: [queryEmbedding],
      nResults: options?.nResults || 10,
      where: options?.where,
      include: options?.include || ['embeddings', 'metadatas', 'documents', 'distances']
    });
  }

  /**
   * Get specific items from a collection by their IDs
   * @param name - Collection name
   * @param ids - Array of item IDs to retrieve
   * @param include - What fields to include in the response
   * @returns Promise resolving to the requested items
   */
  async getItems(name: string, ids: string[], include?: string[]): Promise<any> {
    return this.collectionManager.getItems(name, { 
      ids,
      include: include || ['embeddings', 'metadatas', 'documents']
    });
  }

  /**
   * Update existing items in a collection
   * @param name - Collection name
   * @param items - Items to update with new data
   * @returns Promise that resolves when items are updated
   * @throws Error if updating items fails
   */
  async updateItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    return this.collectionManager.updateItems(name, items);
  }

  /**
   * Delete specific items from a collection by their IDs
   * @param name - Collection name
   * @param ids - Array of item IDs to delete
   * @returns Promise that resolves when items are deleted
   * @throws Error if deleting items fails
   */
  async deleteItems(name: string, ids: string[]): Promise<void> {
    return this.collectionManager.deleteItems(name, { ids });
  }

  /**
   * Get the number of items in a collection
   * @param name - Collection name
   * @returns Promise resolving to the count of items
   */
  async countItems(name: string): Promise<number> {
    return this.collectionManager.count(name);
  }
}