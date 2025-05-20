/**
 * StrictPersistenceChromaClient
 * 
 * This is a completely rewritten version of ChromaWrapper that prioritizes
 * persistent storage and eliminates all in-memory fallback options.
 */

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
 * A database item to store in persistent storage
 */
interface DatabaseItem {
  id: string;
  embedding: number[];
  metadata: Record<string, any>;
  document: string;
}

// No need for this interface
// export interface CollectionStorage {
//   items: DatabaseItem[];
//   metadata: Record<string, any>;
// }

/**
 * Collection implementation with strict persistence
 */
class StrictPersistentCollection implements Collection {
  private items: Map<string, DatabaseItem>;
  public name: string;
  private storageDir: string;
  private fs: any;
  private collectionMetadata: Record<string, any>;
  private dataFilePath: string;
  private metaFilePath: string;
  private saveDebounceMs: number = 250; // Save after 250ms of no activity
  private saveTimeout: NodeJS.Timeout | null = null;
  
  /**
   * Calculate cosine distance between two vectors
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Cosine distance (1 - similarity)
   */
  private cosineDistance(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0.99; // High distance for mismatched dimensions
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0.99; // High distance for zero vectors
    
    // Calculate cosine similarity and convert to distance
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Convert to distance (0 = identical, 2 = opposite)
  }
  
  constructor(name: string, storageDir: string, fs: any, metadata: Record<string, any> = {}, _parent: StrictPersistenceChromaClient) {
    this.name = name;
    this.items = new Map();
    this.storageDir = storageDir;
    this.fs = fs;
    this.collectionMetadata = {
      ...metadata,
      createdAt: metadata.createdAt || new Date().toISOString()
    };
    this.dataFilePath = `${storageDir}/${name}/items.json`;
    this.metaFilePath = `${storageDir}/${name}/metadata.json`;
    // We don't need to use parent
    
    // Create the collection directory if it doesn't exist
    const collectionDir = `${storageDir}/${name}`;
    if (!this.fs.existsSync(collectionDir)) {
      try {
        console.log(`Creating collection directory: ${collectionDir}`);
        this.fs.mkdirSync(collectionDir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create collection directory ${collectionDir}:`, error);
        throw new Error(`Failed to create collection directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * Queue a save operation to be executed after a short delay
   * This prevents excessive disk I/O when many operations happen in sequence
   */
  private queueSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.saveCollectionToDisk().catch(err => {
        console.error(`Failed to save collection ${this.name} on queue:`, err);
      });
    }, this.saveDebounceMs);
  }
  
  /**
   * Save the collection to disk immediately
   */
  async saveCollectionToDisk(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    try {
      console.log(`Saving collection ${this.name} to disk at ${this.storageDir}...`);
      
      // Ensure the collection directory exists
      const collectionDir = `${this.storageDir}/${this.name}`;
      if (!this.fs.existsSync(collectionDir)) {
        console.log(`Creating collection directory: ${collectionDir}`);
        this.fs.mkdirSync(collectionDir, { recursive: true });
      }
      
      // Collect items for storage
      const items: DatabaseItem[] = Array.from(this.items.values());
      
      // Add timestamp to metadata
      const metadata = {
        ...this.collectionMetadata,
        collectionName: this.name,
        itemCount: items.length,
        savedAt: new Date().toISOString(),
        version: "1.0.0"
      };
      
      // Save metadata to disk
      console.log(`Writing metadata to ${this.metaFilePath}...`);
      this.fs.writeFileSync(this.metaFilePath, JSON.stringify(metadata, null, 2));
      
      // Save items to disk using a temp file for atomicity
      const tempFile = `${this.dataFilePath}.tmp`;
      
      // First write to temp file
      console.log(`Writing ${items.length} items to temporary file ${tempFile}...`);
      this.fs.writeFileSync(tempFile, JSON.stringify({ 
        items,
        metadata
      }, null, 2));
      
      // Then rename to final file (more atomic operation)
      console.log(`Moving temporary file to final location ${this.dataFilePath}...`);
      if (this.fs.existsSync(this.dataFilePath)) {
        // Create a backup of the previous file
        const backupFile = `${this.dataFilePath}.bak`;
        this.fs.renameSync(this.dataFilePath, backupFile);
      }
      
      this.fs.renameSync(tempFile, this.dataFilePath);
      
      // Verify the file was written
      if (this.fs.existsSync(this.dataFilePath)) {
        const stats = this.fs.statSync(this.dataFilePath);
        console.log(`Successfully saved collection ${this.name} with ${items.length} items to disk (size: ${stats.size} bytes)`);
      } else {
        console.error(`File write verification failed - file ${this.dataFilePath} doesn't exist after write`);
      }
    } catch (error) {
      console.error(`Failed to save collection ${this.name} to disk:`, error);
      throw error;
    }
  }
  
  /**
   * Load collection data from disk
   */
  async loadFromDisk(): Promise<void> {
    try {
      // Check if the data file exists
      if (!this.fs.existsSync(this.dataFilePath)) {
        console.log(`No data file found for collection ${this.name}, starting with empty collection`);
        return;
      }
      
      console.log(`Loading collection ${this.name} from ${this.dataFilePath}...`);
      
      // Read the data file
      const fileContents = this.fs.readFileSync(this.dataFilePath, 'utf8');
      if (!fileContents || fileContents.trim().length === 0) {
        console.log(`Data file for collection ${this.name} is empty`);
        return;
      }
      
      // Parse the JSON data
      const data = JSON.parse(fileContents);
      
      // Load metadata if present
      if (data.metadata) {
        this.collectionMetadata = data.metadata;
        console.log(`Loaded metadata for collection ${this.name}`);
      }
      
      // Check for items array
      if (data.items && Array.isArray(data.items)) {
        // Clear existing items
        this.items.clear();
        
        // Load items
        for (const item of data.items) {
          if (item && item.id) {
            this.items.set(item.id, {
              id: item.id,
              embedding: item.embedding || [],
              metadata: item.metadata || {},
              document: item.document || ''
            });
          }
        }
        
        console.log(`Loaded ${this.items.size} items for collection ${this.name}`);
      } else {
        console.warn(`No items found in data file for collection ${this.name}`);
      }
    } catch (error) {
      console.error(`Failed to load collection ${this.name} from disk:`, error);
      throw new Error(`Failed to load collection from disk: ${error instanceof Error ? error.message : String(error)}`);
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
    
    // Add each item to the collection
    for (let i = 0; i < ids.length; i++) {
      this.items.set(ids[i], {
        id: ids[i],
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      });
    }
    
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
    const { ids = [], where, limit, offset, include = ['embeddings', 'metadatas', 'documents'] } = params;
    const foundIds: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Record<string, any>[] = [];
    const documents: string[] = [];
    
    // If ids are provided, get those specific items
    if (ids.length > 0) {
      for (const id of ids) {
        const item = this.items.get(id);
        if (item) {
          foundIds.push(id);
          if (include.includes('embeddings')) {
            embeddings.push(item.embedding);
          }
          if (include.includes('metadatas')) {
            metadatas.push(item.metadata);
          }
          if (include.includes('documents')) {
            documents.push(item.document);
          }
        }
      }
    } else {
      // Otherwise, get all items subject to where/limit/offset
      const allItems = Array.from(this.items.entries());
      
      // Filter by where clause if provided
      let filteredItems = allItems;
      if (where) {
        filteredItems = allItems.filter(([_, item]) => {
          for (const [key, value] of Object.entries(where)) {
            if (item.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }
      
      // Apply offset and limit if provided
      const paginatedItems = filteredItems.slice(offset || 0, limit ? (offset || 0) + limit : undefined);
      
      for (const [id, item] of paginatedItems) {
        foundIds.push(id);
        if (include.includes('embeddings')) {
          embeddings.push(item.embedding);
        }
        if (include.includes('metadatas')) {
          metadatas.push(item.metadata);
        }
        if (include.includes('documents')) {
          documents.push(item.document);
        }
      }
    }
    
    // Construct the result object
    const result: any = { ids: foundIds };
    
    if (include.includes('embeddings')) {
      result.embeddings = embeddings;
    }
    
    if (include.includes('metadatas')) {
      result.metadatas = metadatas;
    }
    
    if (include.includes('documents')) {
      result.documents = documents;
    }
    
    return result;
  }
  
  /**
   * Update items in the collection
   */
  async update(params: ChromaUpdateParams): Promise<void> {
    const { ids, embeddings, metadatas, documents } = params;
    
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const item = this.items.get(id);
      
      if (item) {
        if (embeddings && embeddings[i]) {
          item.embedding = embeddings[i];
        }
        
        if (metadatas && metadatas[i]) {
          item.metadata = { ...item.metadata, ...metadatas[i] };
        }
        
        if (documents && documents[i]) {
          item.document = documents[i];
        }
        
        this.items.set(id, item);
      }
    }
    
    // Queue a save after updating items
    this.queueSave();
  }
  
  /**
   * Delete items from the collection
   */
  async delete(params: ChromaDeleteParams): Promise<void> {
    const { ids, where } = params;
    
    if (ids) {
      for (const id of ids) {
        this.items.delete(id);
      }
    } else if (where) {
      // Delete by where filter
      for (const [id, item] of Array.from(this.items.entries())) {
        let matches = true;
        for (const [key, value] of Object.entries(where)) {
          if (item.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        
        if (matches) {
          this.items.delete(id);
        }
      }
    }
    
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
    
    // Initialize results
    const results: {
      ids: string[][];
      embeddings?: number[][][];
      metadatas?: Record<string, any>[][];
      documents?: string[][];
      distances?: number[][];
    } = {
      ids: [],
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
    
    // Use query embeddings, or just return top results if no query provided
    const queries = queryEmbeddings.length > 0 ? queryEmbeddings : [[]]; // Empty query = return anything
    
    for (const queryEmbedding of queries) {
      // Filter items by where clause if provided
      let filteredItems = Array.from(this.items.values());
      
      if (where) {
        filteredItems = filteredItems.filter((item: DatabaseItem) => {
          for (const [key, value] of Object.entries(where)) {
            if (item.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }
      
      // Calculate "distances" - compute actual cosine similarity
      const itemsWithDistances = filteredItems.map(item => {
        let distance = 0;
        
        // If we have a query embedding and the item has an embedding, compute cosine distance
        if (queryEmbedding.length > 0 && item.embedding.length > 0) {
          // Compute cosine distance (1 - similarity)
          // Implemented directly here instead of using a separate method
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          
          for (let i = 0; i < queryEmbedding.length; i++) {
            dotProduct += queryEmbedding[i] * item.embedding[i];
            normA += queryEmbedding[i] * queryEmbedding[i];
            normB += item.embedding[i] * item.embedding[i];
          }
          
          if (normA === 0 || normB === 0) {
            distance = 0.99; // High distance for zero vectors
          } else {
            // Calculate cosine similarity and convert to distance
            const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            distance = 1 - similarity; // Convert to distance (0 = identical, 2 = opposite)
          }
        } else {
          // If no embeddings to compare, use a high distance
          distance = 0.99;
        }
        
        return { item, distance };
      });
      
      // Sort by distance (lower is better)
      itemsWithDistances.sort((a, b) => a.distance - b.distance);
      
      // Take the top N results
      const topItems = itemsWithDistances.slice(0, Math.min(nResults, itemsWithDistances.length));
      
      // Process results
      const ids: string[] = [];
      const embeddings: number[][] = [];
      const metadatas: Record<string, any>[] = [];
      const documents: string[] = [];
      const distances: number[] = [];
      
      for (const { item, distance } of topItems) {
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
        results.embeddings!.push(embeddings);
      }
      
      if (include.includes('metadatas')) {
        results.metadatas!.push(metadatas);
      }
      
      if (include.includes('documents')) {
        results.documents!.push(documents);
      }
      
      if (include.includes('distances')) {
        results.distances!.push(distances);
      }
    }
    
    return results;
  }
  
  /**
   * Count items in the collection
   */
  async count(): Promise<number> {
    return this.items.size;
  }
  
  /**
   * Get collection metadata
   */
  async metadata(): Promise<Record<string, any>> {
    return this.collectionMetadata;
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
  private fs: any = null;
  private collectionsLoaded: boolean = false;
  
  /**
   * Create a new StrictPersistenceChromaClient
   * @param options Client options
   */
  constructor(options: ChromaClientOptions = {}) {
    console.log('Creating StrictPersistenceChromaClient - GUARANTEES PERSISTENCE');
    
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
          console.log(`StrictPersistenceChromaClient using absolute path: ${this.storagePath}`);
        } else {
          // Use the path as-is WITHOUT resolving
          this.storagePath = options.path;
          console.log(`StrictPersistenceChromaClient using relative path directly: ${this.storagePath}`);
        }
        
        // Create the storage directory if it doesn't exist
        if (!this.fs.existsSync(this.storagePath)) {
          console.log(`Creating storage directory: ${this.storagePath}`);
          this.fs.mkdirSync(this.storagePath, { recursive: true });
        }
        
        // Create the collections directory if it doesn't exist
        const collectionsDir = `${this.storagePath}/collections`;
        if (!this.fs.existsSync(collectionsDir)) {
          console.log(`Creating collections directory: ${collectionsDir}`);
          this.fs.mkdirSync(collectionsDir, { recursive: true });
        }
        
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
    if (!this.fs || !this.storagePath) {
      throw new Error('Cannot load collections: storage not configured');
    }
    
    try {
      console.log(`Loading collections from disk: ${this.storagePath}`);
      
      // Ensure storage directory exists
      if (!this.fs.existsSync(this.storagePath)) {
        console.log(`Storage directory doesn't exist, creating: ${this.storagePath}`);
        this.fs.mkdirSync(this.storagePath, { recursive: true });
      }
      
      // Check for collections directory
      const collectionsDir = `${this.storagePath}/collections`;
      if (!this.fs.existsSync(collectionsDir)) {
        console.log(`Collections directory doesn't exist, creating: ${collectionsDir}`);
        this.fs.mkdirSync(collectionsDir, { recursive: true });
        this.collectionsLoaded = true;
        return; // No collections to load yet
      }
      
      // Read the collections directory
      const dirContents = this.fs.readdirSync(collectionsDir);
      const collectionDirs = dirContents.filter((item: string) => {
        const fullPath = `${collectionsDir}/${item}`;
        return this.fs.statSync(fullPath).isDirectory() && !item.startsWith('.');
      });
      
      console.log(`Found ${collectionDirs.length} collection directories: ${collectionDirs.join(', ')}`);
      
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
          console.log(`Successfully loaded collection: ${collectionName}`);
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
      if (!this.fs.existsSync(collectionsDir)) {
        console.log(`Creating collections directory: ${collectionsDir}`);
        this.fs.mkdirSync(collectionsDir, { recursive: true });
      }
      
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
    
    if (!this.fs || !this.storagePath) {
      throw new Error('Cannot delete collection: storage not configured');
    }
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Remove from our collections map
    this.collections.delete(name);
    
    // Delete from disk
    const collectionDir = `${this.storagePath}/collections/${name}`;
    if (this.fs.existsSync(collectionDir)) {
      try {
        const removeDir = (path: string) => {
          if (!this.fs) return;
          
          if (this.fs.existsSync(path)) {
            this.fs.readdirSync(path).forEach((file: string) => {
              const curPath = `${path}/${file}`;
              if (this.fs.statSync(curPath).isDirectory()) {
                removeDir(curPath);
              } else {
                this.fs.unlinkSync(curPath);
              }
            });
            this.fs.rmdirSync(path);
          }
        };
        
        removeDir(collectionDir);
        console.log(`Removed collection ${name} directory from disk`);
      } catch (error) {
        console.error(`Failed to remove collection ${name} directory:`, error);
        throw new Error(`Failed to delete collection: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
}

// Export the strict persistence client as ChromaClient
export const ChromaClient = StrictPersistenceChromaClient;