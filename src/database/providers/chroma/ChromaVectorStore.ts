import { ChromaClient } from './ChromaWrapper';
// Define the Collection interface inline based on what we need
interface Collection {
  add(params: any): Promise<void>;
  get(params: any): Promise<any>;
  query(params: any): Promise<any>;
  update(params: any): Promise<void>;
  delete(params: any): Promise<void>;
  count(): Promise<number>;
}
import { BaseVectorStore } from '../base/BaseVectorStore';
import { IStorageOptions } from '../../interfaces/IStorageOptions';
import { existsSync, mkdirSync } from 'fs';
import { Plugin } from 'obsidian';

// Define standard include types for vector store compatibility
type StoreIncludeType = 'embeddings' | 'metadatas' | 'documents' | 'distances';

// Define a type for embedding results
type Embeddings = number[][];

// Define a type for metadata results
type Metadata = Record<string, any>;

/**
 * ChromaDB implementation of vector store
 * Provides persistent vector storage using ChromaDB
 */
export class ChromaVectorStore extends BaseVectorStore {
  /**
   * ChromaDB client
   */
  private client: InstanceType<typeof ChromaClient> | null = null;
  
  /**
   * Collection cache for performance
   */
  private collectionCache: Map<string, Collection> = new Map();
  
  /**
   * Plugin instance for accessing paths
   */
  private plugin: Plugin;

  /**
   * Create a new ChromaDB vector store
   * @param plugin The Obsidian plugin instance
   * @param options Storage options
   */
  constructor(plugin: Plugin, options?: Partial<IStorageOptions>) {
    super(options);
    this.plugin = plugin;
    
    // Set default persistent path if not provided
    if (!this.config.persistentPath) {
      this.config.persistentPath = `${this.plugin.manifest.dir}/data/chroma-db`;
    }
  }
  
  /**
   * Ensure a directory exists, creating it if it doesn't
   * @param path Directory path to ensure exists
   */
  protected ensureDirectoryExists(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  /**
   * Initialize the ChromaDB client
   */
  async initialize(): Promise<void> {
    try {
      // Ensure the data directory exists for persistent storage
      if (!this.config.inMemory && this.config.persistentPath) {
        this.ensureDirectoryExists(this.config.persistentPath);
      }
      
      // Create ChromaDB client
      if (this.config.inMemory) {
        // In-memory client
        this.client = new ChromaClient();
      } else if (this.config.server?.host) {
        // Remote server client
        const protocol = this.config.server.protocol || 'http';
        const port = this.config.server.port || 8000;
        const host = this.config.server.host;
        
        this.client = new ChromaClient({
          path: `${protocol}://${host}:${port}`
        });
      } else {
        // Local persistent client
        this.client = new ChromaClient({
          path: this.config.persistentPath
        });
      }
      
      // Load existing collections
      await this.refreshCollections();
      
      this.initialized = true;
      console.log(`ChromaDB vector store initialized with path: ${this.config.persistentPath || 'in-memory'}`);
    } catch (error) {
      console.error('Failed to initialize ChromaDB:', error);
      throw new Error(`ChromaDB initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Refresh the list of collections
   */
  private async refreshCollections(): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collections = await this.client.listCollections();
      this.collections.clear();
      
      for (const collection of collections) {
        // Handle both string and object cases
        let collectionName = '';
        
        if (typeof collection === 'string') {
          collectionName = collection;
        } else if (typeof collection === 'object' && collection !== null) {
          // Direct access to avoid property existence check
          const collObj = collection as any;
          if (collObj.name) {
            collectionName = String(collObj.name);
          }
        }
        
        if (collectionName) {
          this.collections.add(collectionName);
        }
      }
      
      console.log(`Loaded ${this.collections.size} collections from ChromaDB`);
    } catch (error) {
      console.error('Failed to refresh collections:', error);
      throw new Error(`Collection refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get a collection instance, creating it if needed
   * @param collectionName Collection name
   * @returns Collection instance
   */
  private async getOrCreateCollection(collectionName: string): Promise<Collection> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    // Check cache first
    if (this.collectionCache.has(collectionName)) {
      return this.collectionCache.get(collectionName)!;
    }
    
    try {
      let collection: Collection;
      
      if (this.collections.has(collectionName)) {
        // Get existing collection
        collection = await this.client.getCollection({ name: collectionName });
      } else {
        // Create new collection
        collection = await this.client.createCollection({
          name: collectionName,
          metadata: { createdAt: new Date().toISOString() }
        });
        
        this.collections.add(collectionName);
      }
      
      // Cache the collection
      this.collectionCache.set(collectionName, collection);
      
      return collection;
    } catch (error) {
      console.error(`Failed to get/create collection '${collectionName}':`, error);
      throw new Error(`Collection operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Close the ChromaDB client
   */
  async close(): Promise<void> {
    this.collectionCache.clear();
    this.collections.clear();
    this.client = null;
    this.initialized = false;
  }
  
  /**
   * Create a new collection
   * @param collectionName Collection name
   * @param metadata Optional collection metadata
   */
  async createCollection(collectionName: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    // Skip if collection already exists
    if (this.collections.has(collectionName)) {
      return;
    }
    
    try {
      await this.client.createCollection({
        name: collectionName,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        }
      });
      
      this.collections.add(collectionName);
    } catch (error) {
      // If the collection already exists, just add it to our known collections and return
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`Collection '${collectionName}' already exists, adding to known collections`);
        this.collections.add(collectionName);
        return;
      }
      
      // Otherwise, log and re-throw the error
      console.error(`Failed to create collection '${collectionName}':`, error);
      throw new Error(`Collection creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if a collection exists
   * @param collectionName Collection name
   * @returns Whether the collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    return this.collections.has(collectionName);
  }
  
  /**
   * List all collections
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    return Array.from(this.collections);
  }
  
  /**
   * Delete a collection
   * @param collectionName Collection name
   */
  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    if (!this.collections.has(collectionName)) {
      return; // Collection doesn't exist, nothing to delete
    }
    
    try {
      await this.client.deleteCollection({ name: collectionName });
      
      this.collections.delete(collectionName);
      this.collectionCache.delete(collectionName);
    } catch (error) {
      console.error(`Failed to delete collection '${collectionName}':`, error);
      throw new Error(`Collection deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Add items to a collection
   * @param collectionName Collection name
   * @param items Items to add
   */
  async addItems(collectionName: string, items: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // ChromaDB requires equal length arrays for all fields
      if (items.metadatas && items.metadatas.length !== items.ids.length) {
        throw new Error('Metadatas array length must match IDs array length');
      }
      
      if (items.documents && items.documents.length !== items.ids.length) {
        throw new Error('Documents array length must match IDs array length');
      }
      
      // Add items to the collection
      await collection.add({
        ids: items.ids,
        embeddings: items.embeddings,
        metadatas: items.metadatas,
        documents: items.documents
      });
    } catch (error) {
      console.error(`Failed to add items to collection '${collectionName}':`, error);
      throw new Error(`Item addition failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get items by ID from a collection
   * @param collectionName Collection name
   * @param ids IDs of the items to retrieve
   * @param include What to include in the response
   */
  async getItems(collectionName: string, ids: string[], include?: StoreIncludeType[]): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Get items from the collection
      const results = await collection.get({
        ids,
        include: include || ['embeddings', 'metadatas', 'documents']
      } as any);
      
      // Handle null and undefined values in the results
      // Cast the results to the correct types
      return {
        ids: results.ids,
        embeddings: Array.isArray(results.embeddings) 
          ? results.embeddings.map(e => e === null ? [] : e) as number[][] 
          : undefined,
        metadatas: Array.isArray(results.metadatas) 
          ? results.metadatas.map(m => m === null ? {} : m) as Record<string, any>[] 
          : undefined,
        documents: Array.isArray(results.documents) 
          ? results.documents.map(d => d === null ? '' : d) as string[] 
          : undefined
      };
    } catch (error) {
      console.error(`Failed to get items from collection '${collectionName}':`, error);
      throw new Error(`Item retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update items in a collection
   * @param collectionName Collection name
   * @param items Items to update
   */
  async updateItems(collectionName: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // ChromaDB update requires at least one of embeddings, metadatas, or documents
      if (!items.embeddings && !items.metadatas && !items.documents) {
        throw new Error('At least one of embeddings, metadatas, or documents must be provided');
      }
      
      // Update items in the collection
      await collection.update({
        ids: items.ids,
        embeddings: items.embeddings,
        metadatas: items.metadatas,
        documents: items.documents
      });
    } catch (error) {
      console.error(`Failed to update items in collection '${collectionName}':`, error);
      throw new Error(`Item update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete items from a collection
   * @param collectionName Collection name
   * @param ids IDs of the items to delete
   */
  async deleteItems(collectionName: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Delete items from the collection
      await collection.delete({
        ids
      });
    } catch (error) {
      console.error(`Failed to delete items from collection '${collectionName}':`, error);
      throw new Error(`Item deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Query a collection by embeddings
   * @param collectionName Collection name
   * @param query Query parameters
   */
  async query(collectionName: string, query: {
    queryEmbeddings: number[][];
    nResults?: number;
    where?: Record<string, any>;
    include?: StoreIncludeType[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Query the collection
      const results = await collection.query({
        queryEmbeddings: query.queryEmbeddings,
        nResults: query.nResults || 10,
        where: query.where,
        include: query.include || ['embeddings', 'metadatas', 'documents', 'distances']
      } as any);
      
      // Handle null and undefined values in the results
      // Cast the results to the correct types
      const resultIds = results.ids || [];
      const resultEmbeddings = results.embeddings || [];
      const resultMetadatas = results.metadatas || [];
      const resultDocuments = results.documents || [];
      const resultDistances = results.distances || [];

      return {
        ids: resultIds,
        embeddings: resultEmbeddings.length > 0 
          ? resultEmbeddings.map(batch => 
              Array.isArray(batch) 
                ? batch.map(e => e === null ? [] : Array.isArray(e) ? e : []) 
                : []
            ) 
          : undefined,
        metadatas: resultMetadatas.length > 0 
          ? resultMetadatas.map(batch => 
              Array.isArray(batch) 
                ? batch.map(m => m === null ? {} : (typeof m === 'object' ? m : {})) 
                : []
            ) 
          : undefined,
        documents: resultDocuments.length > 0 
          ? resultDocuments.map(batch => 
              Array.isArray(batch) 
                ? batch.map(d => d === null ? '' : (typeof d === 'string' ? d : '')) 
                : []
            ) 
          : undefined,
        distances: resultDistances.length > 0 ? resultDistances : undefined
      };
    } catch (error) {
      console.error(`Failed to query collection '${collectionName}':`, error);
      throw new Error(`Collection query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get count of items in a collection
   * @param collectionName Collection name
   */
  async count(collectionName: string): Promise<number> {
    if (!this.client) {
      throw new Error('ChromaDB client not initialized');
    }
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // Get count of items in the collection
      const count = await collection.count();
      
      return count;
    } catch (error) {
      console.error(`Failed to get count for collection '${collectionName}':`, error);
      throw new Error(`Collection count failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}