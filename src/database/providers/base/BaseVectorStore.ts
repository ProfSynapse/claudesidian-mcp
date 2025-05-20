import { IVectorStore } from '../../interfaces/IVectorStore';
import { IStorageOptions } from '../../interfaces/IStorageOptions';
import { VectorStoreConfig } from '../../models/VectorStoreConfig';
import { existsSync, mkdirSync } from 'fs';

/**
 * Abstract base class for vector store implementations
 * Provides common functionality and type-safety for vector stores
 */
export abstract class BaseVectorStore implements IVectorStore {
  /**
   * Storage configuration
   */
  protected config: VectorStoreConfig;
  
  /**
   * Collection cache
   */
  protected collections: Set<string> = new Set<string>();
  
  /**
   * Initialization status
   */
  protected initialized: boolean = false;
  
  /**
   * Create a new base vector store
   * @param options Storage options
   */
  constructor(options?: Partial<IStorageOptions>) {
    this.config = new VectorStoreConfig(options);
  }
  
  /**
   * Ensure storage directory exists
   * @param path Directory path
   */
  protected ensureDirectoryExists(path: string): void {
    if (!this.config.inMemory && path && !existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
  
  /**
   * Initialize the vector store
   */
  abstract initialize(): Promise<void>;
  
  /**
   * Close the vector store connection
   */
  abstract close(): Promise<void>;
  
  /**
   * Create a collection to store vectors
   * @param collectionName Name of the collection to create
   * @param metadata Optional metadata for the collection
   */
  abstract createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void>;
  
  /**
   * Check if a collection exists
   * @param collectionName Name of the collection to check
   */
  abstract hasCollection(collectionName: string): Promise<boolean>;
  
  /**
   * List all collections
   */
  abstract listCollections(): Promise<string[]>;
  
  /**
   * Delete a collection
   * @param collectionName Name of the collection to delete
   */
  abstract deleteCollection(collectionName: string): Promise<void>;
  
  /**
   * Add items to a collection
   * @param collectionName Name of the collection
   * @param items Items to add
   */
  abstract addItems(collectionName: string, items: {
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
  abstract getItems(collectionName: string, ids: string[], include?: Array<'embeddings' | 'metadatas' | 'documents'>): Promise<{
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
  abstract updateItems(collectionName: string, items: {
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
  abstract deleteItems(collectionName: string, ids: string[]): Promise<void>;
  
  /**
   * Query a collection by embeddings or text
   * @param collectionName Name of the collection
   * @param query Query parameters
   */
  abstract query(collectionName: string, query: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
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
  abstract count(collectionName: string): Promise<number>;
  
  /**
   * Get diagnostics about the vector store
   * Base implementation with minimal information
   * @returns Diagnostic information about the vector store
   */
  async getDiagnostics(): Promise<Record<string, any>> {
    return {
      initialized: this.initialized,
      storageMode: this.config.inMemory ? 'in-memory' : 'persistent',
      persistentPath: this.config.persistentPath || 'none',
      totalCollections: this.collections.size,
    };
  }
  
  /**
   * Repair and reload collections from disk
   * Base implementation that returns no-op result
   * Should be overridden by subclasses that support repair
   * @returns Result of the repair operation
   */
  async repairCollections(): Promise<{
    success: boolean;
    repairedCollections: string[];
    errors: string[];
  }> {
    return {
      success: false,
      repairedCollections: [],
      errors: ['Repair not supported by this vector store implementation']
    };
  }
  
  /**
   * Validate collections to ensure they are in sync with disk storage
   * Base implementation that returns no-op result
   * Should be overridden by subclasses that support validation
   * @returns Result of the validation operation
   */
  async validateCollections(): Promise<{
    success: boolean;
    validatedCollections: string[];
    errors: string[];
  }> {
    return {
      success: false,
      validatedCollections: [],
      errors: ['Validation not supported by this vector store implementation']
    };
  }
}