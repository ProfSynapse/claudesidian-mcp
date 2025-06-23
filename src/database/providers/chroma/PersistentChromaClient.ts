/**
 * PersistentChromaClient
 * 
 * A ChromaDB-compatible client implementation that prioritizes persistent storage
 * and follows SOLID principles through service composition.
 */

import { 
  VectorCalculator, 
  FilterEngine, 
  PersistenceManager, 
  CollectionRepository,
  type FileSystemInterface,
  type DatabaseItem 
} from './services';

// Interface definitions
export interface ChromaClientOptions {
  path?: string;
  fetchOptions?: Record<string, any>;
}

export interface ChromaEmbeddingFunction {
  generate(texts: string[]): Promise<number[][]>;
}

export interface CollectionMetadata {
  name: string;
  metadata?: Record<string, any>;
}

// Collection operation parameter interfaces
export interface ChromaAddParams {
  ids: string | string[];
  embeddings?: number[] | number[][];
  metadatas?: Record<string, any> | Record<string, any>[];
  documents?: string | string[];
}

export interface ChromaGetParams {
  ids?: string[];
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  include?: string[];
}

export interface ChromaQueryParams {
  queryEmbeddings?: number[][];
  queryTexts?: string[];
  nResults?: number;
  where?: Record<string, any>;
  include?: string[];
}

export interface ChromaDeleteParams {
  ids?: string[];
  where?: Record<string, any>;
}

export interface ChromaUpdateParams {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
}

export interface ChromaCollectionOptions {
  name: string;
  metadata?: Record<string, any>;
  embeddingFunction?: ChromaEmbeddingFunction;
}

export interface Collection {
  name: string;
  
  add(params: ChromaAddParams): Promise<void>;
  get(params: ChromaGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
  update(params: ChromaUpdateParams): Promise<void>;
  delete(params: ChromaDeleteParams): Promise<void>;
  query(params: ChromaQueryParams): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }>;
  count(): Promise<number>;
  metadata?(): Promise<Record<string, any>>;
}

/**
 * Collection implementation with strict persistence
 * Refactored to use service composition following SOLID principles
 */
class StrictPersistentCollection implements Collection {
  public name: string;
  private dataFilePath: string;
  private metaFilePath: string;
  
  // Composed services following Dependency Injection principle
  private repository: CollectionRepository;
  private persistenceManager: PersistenceManager;
  
  constructor(name: string, storageDir: string, fs: FileSystemInterface, metadata: Record<string, any> = {}, _parent: StrictPersistenceChromaClient) {
    this.name = name;
    this.dataFilePath = `${storageDir}/${name}/items.json`;
    this.metaFilePath = `${storageDir}/${name}/metadata.json`;
    
    // Initialize services
    this.repository = new CollectionRepository(metadata);
    this.persistenceManager = new PersistenceManager(fs);
    
    // Create the collection directory if it doesn't exist
    const collectionDir = `${storageDir}/${name}`;
    this.persistenceManager.ensureDirectory(collectionDir);
  }
  
  /**
   * Queue a save operation to be executed after a short delay
   * This prevents excessive disk I/O when many operations happen in sequence
   */
  private queueSave(): void {
    this.persistenceManager.queueSave(this.name, () => this.saveCollectionToDisk());
  }
  
  /**
   * Save the collection to disk immediately
   */
  async saveCollectionToDisk(): Promise<void> {
    this.persistenceManager.cancelQueuedSave(this.name);
    
    const collectionData = this.repository.getCollectionData();
    const persistenceData = {
      items: Array.from(collectionData.items.values()),
      metadata: {
        ...collectionData.metadata,
        collectionName: this.name
      }
    };
    
    await this.persistenceManager.saveToFile(this.dataFilePath, this.metaFilePath, persistenceData);
  }
  
  /**
   * Load collection data from disk
   */
  async loadFromDisk(): Promise<void> {
    const persistenceData = await this.persistenceManager.loadFromFile(this.dataFilePath);
    
    if (persistenceData) {
      this.repository.loadCollectionData({
        items: persistenceData.items as any, // Will be converted to Map in loadCollectionData
        metadata: persistenceData.metadata
      });
    }
  }
  
  /**
   * Add items to the collection
   */
  async add(params: ChromaAddParams): Promise<void> {
    // Convert all params to arrays for consistent handling
    const ids = Array.isArray(params.ids) ? params.ids : [params.ids];
    const embeddings = params.embeddings ? (Array.isArray(params.embeddings[0]) 
      ? params.embeddings as number[][] 
      : [params.embeddings as number[]]) : [];
    
    const metadatas = params.metadatas ? (Array.isArray(params.metadatas) 
      ? params.metadatas as Record<string, any>[] 
      : [params.metadatas as Record<string, any>]) : [];
    
    const documents = params.documents ? (Array.isArray(params.documents) 
      ? params.documents as string[] 
      : [params.documents as string]) : [];
    
    // Add items through the repository
    this.repository.addItems(ids, embeddings, metadatas, documents);
    
    // Queue a save after adding items
    this.queueSave();
  }
  
  /**
   * Get items from the collection
   */
  async get(params: ChromaGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    const { ids, where, limit, offset, include = ['embeddings', 'metadatas', 'documents'] } = params;
    
    // Get items through the repository
    const items = this.repository.getItems(ids, where, limit, offset);
    
    // Build result based on included fields
    const result: any = {
      ids: items.map(item => item.id)
    };
    
    if (include.includes('embeddings')) {
      result.embeddings = items.map(item => item.embedding);
    }
    
    if (include.includes('metadatas')) {
      result.metadatas = items.map(item => item.metadata);
    }
    
    if (include.includes('documents')) {
      result.documents = items.map(item => item.document);
    }
    
    return result;
  }
  
  /**
   * Update items in the collection
   */
  async update(params: ChromaUpdateParams): Promise<void> {
    const { ids, embeddings, metadatas, documents } = params;
    
    // Update items through the repository
    this.repository.updateItems(ids, embeddings, metadatas, documents);
    
    // Queue a save after updating items
    this.queueSave();
  }
  
  /**
   * Delete items from the collection
   */
  async delete(params: ChromaDeleteParams): Promise<void> {
    const { ids, where } = params;
    
    // Delete items through the repository
    this.repository.deleteItems(ids, where);
    
    // Queue a save after deleting items
    this.queueSave();
  }
  
  /**
   * Query the collection
   */
  async query(params: ChromaQueryParams): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    const { queryEmbeddings = [], nResults = 10, where, include = ['embeddings', 'metadatas', 'documents', 'distances'] } = params;
    
    // Query items through the repository
    const queryResults = this.repository.queryItems(queryEmbeddings, nResults, where);
    
    // Initialize results
    const results: any = {
      ids: []
    };
    
    if (include.includes('embeddings')) {
      results.embeddings = [];
    }
    
    if (include.includes('metadatas')) {
      results.metadatas = [];
    }
    
    if (include.includes('documents')) {
      results.documents = [];
    }
    
    if (include.includes('distances')) {
      results.distances = [];
    }
    
    // Process each query result
    for (const queryResult of queryResults) {
      const ids: string[] = [];
      const embeddings: number[][] = [];
      const metadatas: Record<string, any>[] = [];
      const documents: string[] = [];
      const distances: number[] = [];
      
      for (const { item, distance } of queryResult) {
        ids.push(item.id);
        
        if (include.includes('embeddings')) {
          embeddings.push(item.embedding);
        }
        
        if (include.includes('metadatas')) {
          metadatas.push(item.metadata);
        }
        
        if (include.includes('documents')) {
          documents.push(item.document);
        }
        
        if (include.includes('distances')) {
          distances.push(distance);
        }
      }
      
      // Add to results
      results.ids.push(ids);
      
      if (include.includes('embeddings')) {
        results.embeddings.push(embeddings);
      }
      
      if (include.includes('metadatas')) {
        results.metadatas.push(metadatas);
      }
      
      if (include.includes('documents')) {
        results.documents.push(documents);
      }
      
      if (include.includes('distances')) {
        results.distances.push(distances);
      }
    }
    
    return results;
  }
  
  /**
   * Count items in the collection
   */
  async count(): Promise<number> {
    return this.repository.count();
  }
  
  /**
   * Get collection metadata
   */
  async metadata(): Promise<Record<string, any>> {
    return this.repository.getMetadata();
  }
  
  /**
   * Force an immediate save to disk
   */
  async forceSave(): Promise<void> {
    await this.saveCollectionToDisk();
  }
}

/**
 * Strict persistence ChromaClient implementation
 * Never uses in-memory fallback, always persists to disk
 */
export class StrictPersistenceChromaClient {
  private collections: Map<string, StrictPersistentCollection> = new Map();
  private storagePath: string | null = null;
  private fs: FileSystemInterface | null = null;
  private collectionsLoaded: boolean = false;
  private persistenceManager: PersistenceManager | null = null;
  
  /**
   * Create a new StrictPersistenceChromaClient
   * @param options Client options
   */
  constructor(options: ChromaClientOptions = {}) {
    
    try {
      // Use Node.js fs module
      this.fs = require('fs');
      const path = require('path');
      
      // Set storage path
      if (options.path) {
        // Check if the path is absolute
        const isAbsolutePath = path.isAbsolute(options.path);
        
        if (isAbsolutePath) {
          this.storagePath = options.path;
        } else {
          // Use the path as-is WITHOUT resolving
          this.storagePath = options.path;
        }
        
        // Initialize persistence manager
        this.persistenceManager = new PersistenceManager(this.fs as FileSystemInterface);
        
        // Create the storage directory if it doesn't exist
        this.persistenceManager.ensureDirectory(this.storagePath);
        
        // Create the collections directory if it doesn't exist
        const collectionsDir = `${this.storagePath}/collections`;
        this.persistenceManager.ensureDirectory(collectionsDir);
        
        // Load collections (async but immediate)
        this.loadCollectionsFromDisk()
          .then(() => console.log(`Collection loading complete`))
          .catch(err => console.error('Error in async collection loading:', err));
      } else {
        throw new Error('Storage path is required for StrictPersistenceChromaClient');
      }
    } catch (error) {
      console.error('Failed to initialize StrictPersistenceChromaClient:', error);
      throw error; // Rethrow to make initialization fail
    }
  }
  
  /**
   * Load collections from disk
   */
  private async loadCollectionsFromDisk(): Promise<void> {
    if (!this.fs || !this.storagePath || !this.persistenceManager) {
      throw new Error('Cannot load collections: storage not configured');
    }
    
    try {
      // Loading collections from disk
      
      const collectionsDir = `${this.storagePath}/collections`;
      
      // Read the collections directory
      const collectionDirs = this.persistenceManager.listSubdirectories(collectionsDir);
      
      // Found collection directories
      
      // Load each collection
      for (const collectionName of collectionDirs) {
        try {
          // Create collection
          const collection = new StrictPersistentCollection(
            collectionName,
            collectionsDir,
            this.fs,
            { createdAt: new Date().toISOString() },
            this
          );
          
          // Load from disk
          await collection.loadFromDisk();
          
          // Store in our collections map
          this.collections.set(collectionName, collection);
        } catch (error) {
          console.error(`Failed to load collection ${collectionName}:`, error);
          // Continue with other collections
        }
      }
      
      this.collectionsLoaded = true;
      console.log(`Finished loading ${this.collections.size} collections from disk`);
    } catch (error) {
      console.error('Failed to load collections from disk:', error);
      throw error;
    }
  }
  
  /**
   * Wait for collections to be loaded
   */
  private async ensureCollectionsLoaded(): Promise<void> {
    if (this.collectionsLoaded) return;
    
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!this.collectionsLoaded && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.collectionsLoaded) {
      throw new Error('Collections failed to load in time');
    }
  }
  
  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionMetadata[]> {
    await this.ensureCollectionsLoaded();
    
    return Array.from(this.collections.values()).map(collection => ({
      name: collection.name
    }));
  }
  
  /**
   * Get a collection by name
   */
  async getCollection(params: { name: string, embeddingFunction?: ChromaEmbeddingFunction }): Promise<Collection> {
    await this.ensureCollectionsLoaded();
    
    const { name } = params;
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    return this.collections.get(name)!;
  }
  
  /**
   * Get a collection by name, creating it if it doesn't exist
   */
  async getOrCreateCollection(params: ChromaCollectionOptions): Promise<Collection> {
    await this.ensureCollectionsLoaded();
    
    const { name, metadata } = params;
    
    // First check if collection exists
    if (this.collections.has(name)) {
      console.log(`Using existing collection: ${name}`);
      return this.collections.get(name)!;
    }
    
    // Create the collection
    console.log(`Creating new collection: ${name}`);
    return await this.createCollection({ name, metadata });
  }
  
  /**
   * Create a new collection
   */
  async createCollection(params: ChromaCollectionOptions): Promise<Collection> {
    await this.ensureCollectionsLoaded();
    
    const { name, metadata } = params;
    
    if (!this.fs || !this.storagePath) {
      throw new Error('Cannot create collection: storage not configured');
    }
    
    if (this.collections.has(name)) {
      throw new Error(`Collection '${name}' already exists`);
    }
    
    // Create the collection directory
    const collectionsDir = `${this.storagePath}/collections`;
    
    try {
      // Create the collection
      const collection = new StrictPersistentCollection(
        name,
        collectionsDir,
        this.fs,
        metadata || { createdAt: new Date().toISOString() },
        this
      );
      
      // Save to disk immediately
      await collection.saveCollectionToDisk();
      
      // Store in our collections map
      this.collections.set(name, collection);
      
      return collection;
    } catch (error) {
      console.error(`Failed to create collection ${name}:`, error);
      throw new Error(`Failed to create collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a collection
   */
  async deleteCollection(params: { name: string }): Promise<void> {
    await this.ensureCollectionsLoaded();
    
    const { name } = params;
    
    if (!this.fs || !this.storagePath || !this.persistenceManager) {
      throw new Error('Cannot delete collection: storage not configured');
    }
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Remove from our collections map
    this.collections.delete(name);
    
    // Delete from disk
    const collectionDir = `${this.storagePath}/collections/${name}`;
    this.persistenceManager.removeDirectory(collectionDir);
  }
  
  /**
   * Reset all collections
   */
  async reset(): Promise<void> {
    await this.ensureCollectionsLoaded();
    
    // Get list of all collections
    const collections = Array.from(this.collections.keys());
    
    // Delete each collection
    for (const name of collections) {
      await this.deleteCollection({ name });
    }
    
    this.collections.clear();
  }
  
  /**
   * Heartbeat function (returns current timestamp)
   */
  async heartbeat(): Promise<number> {
    return Date.now();
  }
  
  /**
   * Save all collections to disk
   */
  async saveAllCollections(): Promise<{
    success: boolean;
    savedCollections: string[];
    errors: string[];
  }> {
    await this.ensureCollectionsLoaded();
    
    if (!this.fs || !this.storagePath) {
      return {
        success: false,
        savedCollections: [],
        errors: ['No storage path configured for persistence']
      };
    }
    
    console.log('Starting explicit save of all collections to disk...');
    
    const result = {
      success: true,
      savedCollections: [] as string[],
      errors: [] as string[]
    };
    
    try {
      // Get all collections
      const collectionNames = Array.from(this.collections.keys());
      
      console.log(`Found ${collectionNames.length} collections to save: ${collectionNames.join(', ')}`);
      
      // Save each collection
      for (const name of collectionNames) {
        try {
          const collection = this.collections.get(name);
          if (collection) {
            await collection.forceSave();
            result.savedCollections.push(name);
            console.log(`Successfully saved collection ${name} to disk`);
          } else {
            result.errors.push(`Collection ${name} exists in map but is undefined`);
            result.success = false;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to save collection ${name}: ${errorMsg}`);
          console.error(`Failed to save collection ${name}:`, error);
          result.success = false;
        }
      }
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        savedCollections: result.savedCollections,
        errors: [...result.errors, `Failed to save collections: ${errorMsg}`]
      };
    }
  }
  
  /**
   * Force a reload of all collections from disk
   */
  async repairAndReloadCollections(): Promise<{
    success: boolean;
    repairedCollections: string[];
    errors: string[];
  }> {
    if (!this.fs || !this.storagePath) {
      return {
        success: false,
        repairedCollections: [],
        errors: ['No storage path configured for persistence']
      };
    }
    
    console.log('Starting collection repair and reload from disk...');
    
    const result = {
      success: true,
      repairedCollections: [] as string[],
      errors: [] as string[]
    };
    
    try {
      // Clear existing collections
      this.collections.clear();
      
      // Reset loaded flag
      this.collectionsLoaded = false;
      
      // Load all collections from disk
      await this.loadCollectionsFromDisk();
      
      // Report success
      result.repairedCollections = Array.from(this.collections.keys());
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        repairedCollections: [],
        errors: [`Failed to repair collections: ${errorMsg}`]
      };
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.persistenceManager) {
      this.persistenceManager.cleanup();
    }
  }
}

// Export the strict persistence client as ChromaClient
export const ChromaClient = StrictPersistenceChromaClient;