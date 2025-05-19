/**
 * ChromaDB wrapper to handle compatibility issues with Obsidian/Electron
 * This file provides a compatibility layer for using ChromaDB in Obsidian
 * with improved type definitions
 */

// Enhanced type definitions for ChromaDB operations
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

// Enhanced type definitions for collection operations
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
  
  // Collection operations
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
  // Optional metadata method that some collections might have
  metadata?(): Promise<Record<string, any>>;
}

// In-memory implementations for when ChromaDB is not available
class InMemoryCollection implements Collection {
  name: string;
  private items: Map<string, {
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }>;
  private collectionMetadata?: Record<string, any>;

  constructor(name: string, metadata?: Record<string, any>) {
    this.name = name;
    this.items = new Map();
    this.collectionMetadata = metadata;
  }

  // Optional metadata method
  async metadata(): Promise<Record<string, any>> {
    return this.collectionMetadata || {};
  }

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
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      });
    }
  }

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
      // Otherwise, get all items
      const allItems = Array.from(this.items.entries());
      
      // Apply offset and limit if provided
      const paginatedItems = allItems.slice(offset || 0, limit ? (offset || 0) + limit : undefined);
      
      for (const [id, item] of paginatedItems) {
        // Apply where filter if provided
        if (where) {
          let matches = true;
          for (const [key, value] of Object.entries(where)) {
            if (item.metadata[key] !== value) {
              matches = false;
              break;
            }
          }
          if (!matches) continue;
        }
        
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
  }

  async delete(params: ChromaDeleteParams): Promise<void> {
    const { ids, where } = params;
    
    if (ids) {
      for (const id of ids) {
        this.items.delete(id);
      }
    } else if (where) {
      // Delete by where filter
      for (const [id, item] of this.items.entries()) {
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
  }

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
    
    for (const _ of queries) {
      // Filter items by where clause if provided
      let filteredItems = Array.from(this.items.entries());
      
      if (where) {
        filteredItems = filteredItems.filter(([_, item]) => {
          for (const [key, value] of Object.entries(where)) {
            if (item.metadata[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }
      
      // Sort by random for now (mock implementation)
      filteredItems.sort(() => Math.random() - 0.5);
      
      // Take the top N results
      const topItems = filteredItems.slice(0, Math.min(nResults, filteredItems.length));
      
      // Process results
      const ids: string[] = [];
      const embeddings: number[][] = [];
      const metadatas: Record<string, any>[] = [];
      const documents: string[] = [];
      const distances: number[] = [];
      
      for (const [id, item] of topItems) {
        ids.push(id);
        
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
          distances.push(Math.random()); // Mock distance
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

  async count(): Promise<number> {
    return this.items.size;
  }
}

// Improved InMemoryChromaClient with better type definitions
class InMemoryChromaClient {
  private collections: Map<string, InMemoryCollection> = new Map();
  
  constructor(_options: ChromaClientOptions = {}) {
    console.log('Using In-Memory ChromaDB fallback');
  }

  async listCollections(): Promise<CollectionMetadata[]> {
    return Array.from(this.collections.values()).map(collection => ({
      name: collection.name
    }));
  }

  async getCollection(params: { name: string, embeddingFunction?: ChromaEmbeddingFunction }): Promise<Collection> {
    const { name } = params;
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    return this.collections.get(name)!;
  }

  async getOrCreateCollection(params: ChromaCollectionOptions): Promise<Collection> {
    const { name, metadata } = params;
    
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }
    
    return this.createCollection({ name, metadata });
  }

  async createCollection(params: ChromaCollectionOptions): Promise<Collection> {
    const { name, metadata } = params;
    
    if (this.collections.has(name)) {
      throw new Error(`Collection '${name}' already exists`);
    }
    
    const collection = new InMemoryCollection(name, metadata);
    this.collections.set(name, collection);
    
    return collection;
  }

  async deleteCollection(params: { name: string }): Promise<void> {
    const { name } = params;
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    this.collections.delete(name);
  }

  async reset(): Promise<void> {
    this.collections.clear();
  }

  async heartbeat(): Promise<number> {
    return Date.now(); // Mock heartbeat
  }
}

// Create a hybrid ChromaClient class that can work both as in-memory and persistent storage
class PersistentChromaClient extends InMemoryChromaClient {
  private storagePath: string | null = null;
  private fs: any = null;
  
  constructor(_options: ChromaClientOptions = {}) {
    super(_options);
    
    try {
      // Use Node.js fs module if available
      this.fs = require('fs');
      this.storagePath = _options.path || null;
      
      if (this.storagePath) {
        console.log(`PersistentChromaClient initialized with storage path: ${this.storagePath}`);
        
        // Note: We can't await here since constructors can't be async
        // We'll immediately schedule loading collections from disk
        // The collections will be loaded asynchronously
        setTimeout(() => {
          this.loadCollectionsFromDisk()
            .then(() => console.log('Asynchronous collection loading complete'))
            .catch(err => console.error('Error in async collection loading:', err));
        }, 0);
      } else {
        console.log('PersistentChromaClient initialized without storage path (in-memory only)');
      }
    } catch (error) {
      console.warn('Failed to initialize fs module, falling back to in-memory only:', error);
    }
  }
  
  /**
   * Load collections from disk storage, properly handling async operations
   * @returns Promise that resolves when all collections are loaded
   */
  private async loadCollectionsFromDisk(): Promise<void> {
    if (!this.fs || !this.storagePath) return;
    
    try {
      // Ensure the storage directory exists
      if (!this.fs.existsSync(this.storagePath)) {
        this.fs.mkdirSync(this.storagePath, { recursive: true });
        console.log(`Created directory: ${this.storagePath}`);
        return; // New directory, no collections to load
      }
      
      // Check for collections subdirectory
      const collectionsDir = `${this.storagePath}/collections`;
      if (!this.fs.existsSync(collectionsDir)) {
        this.fs.mkdirSync(collectionsDir, { recursive: true });
        console.log(`Created collections directory: ${collectionsDir}`);
        return; // New directory, no collections to load
      }
      
      // Read the collections directory
      const collections = this.fs.readdirSync(collectionsDir);
      console.log(`Found ${collections.length} potential collections in: ${collectionsDir}`);
      
      // Track collection loading tasks to await them all
      const collectionLoadingTasks: Promise<void>[] = [];
      const loadedCollections: string[] = [];
      
      for (const collectionName of collections) {
        // Skip non-directories or hidden files
        const collectionPath = `${collectionsDir}/${collectionName}`;
        if (!this.fs.statSync(collectionPath).isDirectory() || collectionName.startsWith('.')) {
          continue;
        }
        
        // Create a task for loading this collection
        const loadTask = (async () => {
          try {
            // Create the collection in memory
            const collection = await super.createCollection({ name: collectionName });
            
            // Load collection data
            const dataFile = `${collectionPath}/items.json`;
            if (this.fs.existsSync(dataFile)) {
              try {
                const data = JSON.parse(this.fs.readFileSync(dataFile, 'utf8'));
                
                // Load items into the collection
                if (data && data.items && Array.isArray(data.items)) {
                  const ids: string[] = [];
                  const embeddings: number[][] = [];
                  const metadatas: Record<string, any>[] = [];
                  const documents: string[] = [];
                  
                  for (const item of data.items) {
                    ids.push(item.id);
                    embeddings.push(item.embedding || []);
                    metadatas.push(item.metadata || {});
                    documents.push(item.document || '');
                  }
                  
                  if (ids.length > 0) {
                    await collection.add({
                      ids,
                      embeddings,
                      metadatas,
                      documents
                    });
                    console.log(`Loaded ${ids.length} items for collection: ${collectionName}`);
                  }
                  
                  // Record successful load
                  loadedCollections.push(collectionName);
                }
              } catch (dataError) {
                console.error(`Failed to parse data for collection ${collectionName}:`, dataError);
                // Continue with the collection, even if items failed to load
                loadedCollections.push(collectionName);
              }
            } else {
              console.log(`No items.json found for collection: ${collectionName}`);
              // Still a successful load of the collection (just empty)
              loadedCollections.push(collectionName);
            }
          } catch (error) {
            console.error(`Failed to load collection ${collectionName}:`, error);
            // Don't re-throw, we want to continue with other collections
          }
        })();
        
        // Add this task to our array
        collectionLoadingTasks.push(loadTask);
      }
      
      // Wait for all collections to load
      await Promise.all(collectionLoadingTasks);
      console.log(`Successfully loaded ${loadedCollections.length} collections from disk`);
    } catch (error) {
      console.error('Failed to load collections from disk:', error);
      // We don't throw here to ensure the client can still function even if disk loading fails
    }
  }
  
  private async saveCollectionToDisk(name: string): Promise<void> {
    if (!this.fs || !this.storagePath) return;
    
    try {
      // Get the collection
      const collection = await super.getCollection({ name });
      
      // Ensure the collection directory exists
      const collectionDir = `${this.storagePath}/collections/${name}`;
      if (!this.fs.existsSync(collectionDir)) {
        this.fs.mkdirSync(collectionDir, { recursive: true });
      }
      
      // Get all items
      const result = await collection.get({
        ids: [],
        include: ['embeddings', 'metadatas', 'documents']
      });
      
      // Convert to a format suitable for storage
      const items: Array<{
        id: string;
        embedding: number[];
        metadata: Record<string, any>;
        document: string;
      }> = [];
      for (let i = 0; i < result.ids.length; i++) {
        items.push({
          id: result.ids[i],
          embedding: result.embeddings?.[i] || [],
          metadata: result.metadatas?.[i] || {},
          document: result.documents?.[i] || ''
        });
      }
      
      // Save to disk
      const dataFile = `${collectionDir}/items.json`;
      this.fs.writeFileSync(dataFile, JSON.stringify({ items }, null, 2));
      
      console.log(`Saved collection ${name} with ${items.length} items to disk`);
    } catch (error) {
      console.error(`Failed to save collection ${name} to disk:`, error);
    }
  }
  
  // Override collection methods to persist changes
  async createCollection(params: ChromaCollectionOptions): Promise<Collection> {
    const collection = await super.createCollection(params);
    
    // Save to disk
    if (this.storagePath) {
      await this.saveCollectionToDisk(params.name);
    }
    
    return collection;
  }
  
  async deleteCollection(params: { name: string }): Promise<void> {
    await super.deleteCollection(params);
    
    // Remove from disk
    if (this.fs && this.storagePath) {
      try {
        const collectionDir = `${this.storagePath}/collections/${params.name}`;
        if (this.fs.existsSync(collectionDir)) {
          // Simple recursive directory removal (could use a more robust solution in production)
          const removeDir = (path: string) => {
            if (this.fs!.existsSync(path)) {
              this.fs!.readdirSync(path).forEach((file: string) => {
                const curPath = `${path}/${file}`;
                if (this.fs!.statSync(curPath).isDirectory()) {
                  removeDir(curPath);
                } else {
                  this.fs!.unlinkSync(curPath);
                }
              });
              this.fs!.rmdirSync(path);
            }
          };
          
          removeDir(collectionDir);
          console.log(`Removed collection ${params.name} from disk`);
        }
      } catch (error) {
        console.error(`Failed to remove collection ${params.name} from disk:`, error);
      }
    }
  }
  
  // Wrap the InMemoryCollection methods to save after modifications
  async getCollection(params: { name: string, embeddingFunction?: ChromaEmbeddingFunction }): Promise<Collection> {
    const collection = await super.getCollection(params);
    
    // Wrap the collection's methods to save changes
    const originalAdd = collection.add.bind(collection);
    const originalUpdate = collection.update.bind(collection);
    const originalDelete = collection.delete.bind(collection);
    
    collection.add = async (params: ChromaAddParams): Promise<void> => {
      await originalAdd(params);
      if (this.storagePath) {
        await this.saveCollectionToDisk(collection.name);
      }
    };
    
    collection.update = async (params: ChromaUpdateParams): Promise<void> => {
      await originalUpdate(params);
      if (this.storagePath) {
        await this.saveCollectionToDisk(collection.name);
      }
    };
    
    collection.delete = async (params: ChromaDeleteParams): Promise<void> => {
      await originalDelete(params);
      if (this.storagePath) {
        await this.saveCollectionToDisk(collection.name);
      }
    };
    
    return collection;
  }
}

// Export concrete classes and interfaces
let ChromaClient: any = PersistentChromaClient;

// Use the persistent implementation that can work both with persistence and in-memory
console.log('Using file-backed ChromaDB implementation for Obsidian');

// Export the client class and interfaces
export { ChromaClient };