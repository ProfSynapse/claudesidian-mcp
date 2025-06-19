/**
 * ChromaDB wrapper to handle compatibility issues with Obsidian/Electron
 * This file provides a compatibility layer for using ChromaDB in Obsidian
 * with improved type definitions
 */

// Enhanced type definitions for ChromaDB operations
export interface ChromaClientOptions {
  path?: string;
  fetchOptions?: Record<string, any>;
  forcePersistence?: boolean; // Custom property to force persistence mode
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

export interface ChromaBatchGetParams {
  ids: string[];
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
  // Batch operations
  batchGet?(params: ChromaBatchGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
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

  async batchGet(params: ChromaBatchGetParams): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }> {
    const { ids, include = ['embeddings', 'metadatas', 'documents'] } = params;
    const foundIds: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Record<string, any>[] = [];
    const documents: string[] = [];

    // Get specific items by IDs
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
    
    // First check if collection exists
    if (this.collections.has(name)) {
      console.log(`Using existing collection: ${name}`);
      return this.collections.get(name)!;
    }
    
    // Try to create, but handle if it was created in a race condition
    try {
      console.log(`Creating new collection: ${name}`);
      return await this.createCollection({ name, metadata });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // If the error is that the collection already exists, just get it
      if (errorMsg.includes('already exists') && this.collections.has(name)) {
        console.log(`Collection ${name} was created by another process, using existing collection`);
        return this.collections.get(name)!;
      }
      
      // Otherwise rethrow
      throw error;
    }
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
  // Flag to force persistence mode - used in saveCollectionToDisk
  private forcePersistence: boolean = false;
  
  constructor(_options: ChromaClientOptions = {}) {
    super(_options);
    
    console.log('Initializing PersistentChromaClient - this SHOULD override in-memory');
    
    try {
      // Use Node.js fs module if available
      this.fs = require('fs');
      const path = require('path');
      
      // Check for forcePersistence flag (custom option)
      if (_options.hasOwnProperty('forcePersistence')) {
        this.forcePersistence = true;
        console.log('PERSISTENCE MODE FORCED ENABLED');
      }
      
      // Convert path to absolute if provided
      if (_options.path) {
        // Important: We need to get a proper absolute path based on the current working directory
        // path.resolve() uses the current working directory, which might not be what we want
        
        // So first we detect if this is already an absolute path
        const isAbsolutePath = path.isAbsolute(_options.path);
        
        if (isAbsolutePath) {
          // If it's already absolute, use it as is
          this.storagePath = _options.path;
          console.log(`PersistentChromaClient using existing absolute path: ${this.storagePath}`);
        } else {
          // Use relative path as-is without resolving against CWD
          this.storagePath = _options.path;
          console.log(`PersistentChromaClient using relative path directly: ${this.storagePath}`);
          console.log(`IMPORTANT: NOT resolving to absolute path - this is intentional!`);
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
        
        // Note: We can't await here since constructors can't be async
        // We'll immediately schedule loading collections from disk
        // The collections will be loaded asynchronously
        setTimeout(() => {
          this.loadCollectionsFromDisk()
            .then(() => console.log('Asynchronous collection loading complete'))
            .catch(err => console.error('Error in async collection loading:', err));
        }, 0);
      } else {
        this.storagePath = null;
        console.log('PersistentChromaClient initialized without storage path (in-memory only)');
      }
    } catch (error) {
      console.warn('Failed to initialize fs module, falling back to in-memory only:', error);
      this.storagePath = null;
    }
  }
  
  /**
   * Repair function to force reload collections from disk
   * This can be used to recover from situations where in-memory state is lost
   * @returns Promise that resolves when collections are reloaded
   */
  async repairAndReloadCollections(): Promise<{
    repairedCollections: string[],
    errors: string[]
  }> {
    if (!this.fs || !this.storagePath) {
      return { 
        repairedCollections: [],
        errors: ['No storage path configured for persistence'] 
      };
    }
    
    console.log('Starting collection repair and reload from disk...');
    
    const result = {
      repairedCollections: [] as string[],
      errors: [] as string[]
    };
    
    try {
      // First check if the storage directory exists
      if (!this.fs.existsSync(this.storagePath)) {
        result.errors.push(`Storage path does not exist: ${this.storagePath}`);
        return result;
      }
      
      // Check for collections subdirectory
      const collectionsDir = `${this.storagePath}/collections`;
      if (!this.fs.existsSync(collectionsDir)) {
        result.errors.push(`Collections directory does not exist: ${collectionsDir}`);
        return result;
      }
      
      // Get current collections in memory
      const currentCollections = new Set(
        (await super.listCollections()).map(c => typeof c === 'string' ? c : c.name)
      );
      
      // Read the collections directory
      const collections = this.fs.readdirSync(collectionsDir);
      console.log(`Found ${collections.length} potential collections in: ${collectionsDir}`);
      
      // Track collection loading tasks to await them all
      const collectionLoadingTasks: Array<Promise<void>> = [];
      
      for (const collectionName of collections) {
        // Skip non-directories or hidden files
        const collectionPath = `${collectionsDir}/${collectionName}`;
        if (!this.fs.statSync(collectionPath).isDirectory() || collectionName.startsWith('.')) {
          continue;
        }
        
        // Check if the collection has a valid data file
        const dataFile = `${collectionPath}/items.json`;
        if (!this.fs.existsSync(dataFile)) {
          result.errors.push(`No data file found for collection: ${collectionName}`);
          continue;
        }
        
        // Create a task for repairing this collection
        const repairTask = (async () => {
          try {
            console.log(`Repairing collection: ${collectionName}`);
            
            // If the collection exists in memory, we'll recreate it
            if (currentCollections.has(collectionName)) {
              try {
                console.log(`Deleting existing collection: ${collectionName}`);
                await super.deleteCollection({ name: collectionName });
              } catch (deleteError) {
                console.error(`Error deleting existing collection ${collectionName}:`, deleteError);
                // Continue anyway and try to recreate
              }
            }
            
            // Create a new collection
            const collection = await super.createCollection({ name: collectionName });
            console.log(`Created collection: ${collectionName}`);
            
            // Get the items from the data file
            try {
              const data = JSON.parse(this.fs.readFileSync(dataFile, 'utf8'));
              
              if (data && data.items && Array.isArray(data.items)) {
                // Extract the items
                const ids: string[] = [];
                const embeddings: number[][] = [];
                const metadatas: Record<string, any>[] = [];
                const documents: string[] = [];
                
                // Process items in batches to avoid memory issues
                const batchSize = 100;
                const items = data.items;
                
                for (let i = 0; i < items.length; i += batchSize) {
                  const batch = items.slice(i, i + batchSize);
                  
                  // Clear arrays for this batch
                  ids.length = 0;
                  embeddings.length = 0;
                  metadatas.length = 0;
                  documents.length = 0;
                  
                  // Fill arrays for this batch
                  for (const item of batch) {
                    ids.push(item.id);
                    embeddings.push(item.embedding || []);
                    metadatas.push(item.metadata || {});
                    documents.push(item.document || '');
                  }
                  
                  if (ids.length > 0) {
                    console.log(`Adding batch of ${ids.length} items to collection ${collectionName} (batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)})`);
                    
                    // Wrap the collection for persistence to avoid double-saving
                    const wrappedCollection = this.wrapCollectionWithPersistence(collection);
                    
                    // Add batch of items
                    await wrappedCollection.add({
                      ids,
                      embeddings,
                      metadatas,
                      documents
                    });
                  }
                }
                
                console.log(`Successfully repaired collection ${collectionName} with ${data.items.length} items`);
                result.repairedCollections.push(collectionName);
              } else {
                result.errors.push(`Invalid data format for collection: ${collectionName}`);
              }
            } catch (dataError) {
              console.error(`Failed to parse data for collection ${collectionName}:`, dataError);
              result.errors.push(`Failed to parse data for collection ${collectionName}: ${dataError instanceof Error ? dataError.message : String(dataError)}`);
            }
          } catch (error) {
            console.error(`Failed to repair collection ${collectionName}:`, error);
            result.errors.push(`Failed to repair collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        })();
        
        collectionLoadingTasks.push(repairTask);
      }
      
      // Wait for all collections to be repaired
      await Promise.all(collectionLoadingTasks);
      
      return result;
    } catch (error) {
      console.error('Failed to repair collections:', error);
      result.errors.push(`Failed to repair collections: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }
  
  /**
   * Load collections from disk storage, properly handling async operations
   * @returns Promise that resolves when all collections are loaded
   */
  private async loadCollectionsFromDisk(): Promise<void> {
    if (!this.fs || !this.storagePath) return;
    
    try {
      // Use the storage path directly without resolving
      // Loading collections from disk
      
      // Ensure the storage directory exists
      if (!this.fs.existsSync(this.storagePath)) {
        console.log(`Storage directory doesn't exist, creating: ${this.storagePath}`);
        this.fs.mkdirSync(this.storagePath, { recursive: true });
        console.log(`Created directory: ${this.storagePath}`);
        return; // New directory, no collections to load
      }
      
      // Check for collections subdirectory
      const collectionsDir = `${this.storagePath}/collections`;
      if (!this.fs.existsSync(collectionsDir)) {
        console.log(`Collections directory doesn't exist, creating: ${collectionsDir}`);
        this.fs.mkdirSync(collectionsDir, { recursive: true });
        console.log(`Created collections directory: ${collectionsDir}`);
        return; // New directory, no collections to load
      }
      
      // Read the collections directory
      const collections = this.fs.readdirSync(collectionsDir);
      console.log(`Found ${collections.length} potential collections in: ${collectionsDir}`);
      
      // Verify directory contents
      console.log(`Collections directory contents: ${JSON.stringify(collections)}`);
      
      // Track collection loading tasks to await them all
      const collectionLoadingTasks: Promise<void>[] = [];
      const loadedCollections: string[] = [];
      
      for (const collectionName of collections) {
        // Skip non-directories or hidden files
        const collectionPath = `${collectionsDir}/${collectionName}`;
        
        try {
          // Check if it's a directory
          const stat = this.fs.statSync(collectionPath);
          if (!stat.isDirectory() || collectionName.startsWith('.')) {
            console.log(`Skipping non-directory or hidden file: ${collectionPath}`);
            continue;
          }
          
          console.log(`Processing collection directory: ${collectionPath}`);
          
          // Create a task for loading this collection
          const loadTask = (async () => {
            try {
              // Check if items.json exists
              const dataFile = `${collectionPath}/items.json`;
              const dataFileExists = this.fs.existsSync(dataFile);
              console.log(`Checking for data file ${dataFile}: ${dataFileExists ? 'Exists' : 'Not found'}`);
              
              // Try to get collection or create it if it doesn't exist
              let collection;
              try {
                // First try to get the existing collection
                collection = await super.getCollection({ name: collectionName });
                console.log(`Using existing collection: ${collectionName}`);
              } catch (e) {
                // Collection doesn't exist, create it
                collection = await super.createCollection({ name: collectionName });
                console.log(`Created new collection: ${collectionName}`);
              }
              
              // Wrap the collection to ensure persistence
              collection = this.wrapCollectionWithPersistence(collection);
              
              // Load collection data if the file exists
              if (dataFileExists) {
                try {
                  console.log(`Reading data file: ${dataFile}`);
                  const fileContents = this.fs.readFileSync(dataFile, 'utf8');
                  console.log(`File contents length: ${fileContents.length} bytes`);
                  
                  // Parse the JSON data
                  const data = JSON.parse(fileContents);
                  console.log(`Successfully parsed JSON data for ${collectionName}`);
                  
                  // Check for items array
                  if (data && data.items && Array.isArray(data.items)) {
                    console.log(`Found ${data.items.length} items to load for collection ${collectionName}`);
                    
                    // Process items in batches to avoid memory issues
                    const batchSize = 100;
                    
                    for (let i = 0; i < data.items.length; i += batchSize) {
                      const batch = data.items.slice(i, i + batchSize);
                      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.items.length / batchSize)} with ${batch.length} items`);
                      
                      // Prepare arrays for this batch
                      const ids: string[] = [];
                      const embeddings: number[][] = [];
                      const metadatas: Record<string, any>[] = [];
                      const documents: string[] = [];
                      
                      // Fill arrays with batch data
                      for (const item of batch) {
                        ids.push(item.id);
                        embeddings.push(item.embedding || []);
                        metadatas.push(item.metadata || {});
                        documents.push(item.document || '');
                      }
                      
                      if (ids.length > 0) {
                        console.log(`Adding batch of ${ids.length} items to collection ${collectionName}`);
                        await collection.add({
                          ids,
                          embeddings,
                          metadatas,
                          documents
                        });
                      }
                    }
                    
                    console.log(`Successfully loaded ${data.items.length} items for collection: ${collectionName}`);
                  } else {
                    console.warn(`Invalid data format in file ${dataFile} - missing items array`);
                  }
                  
                  // Record successful load regardless of item count
                  loadedCollections.push(collectionName);
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
              // Check if this is the "already exists" error - if so, we can ignore it as it's already handled
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (errorMsg.includes('already exists')) {
                console.log(`Collection ${collectionName} already exists and is being handled elsewhere`);
              } else {
                console.error(`Failed to load collection ${collectionName}:`, error);
              }
              // Don't re-throw, we want to continue with other collections
            }
          })();
          
          // Add this task to our array
          collectionLoadingTasks.push(loadTask);
        } catch (statError) {
          console.error(`Error checking collection path ${collectionPath}:`, statError);
          // Skip this item and continue with others
        }
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
    if (!this.fs || !this.storagePath) {
      console.error(`CRITICAL ERROR: Cannot save collection ${name} to disk: storage path not configured`);
      return;
    }
    
    // Log persistence mode status
    if (this.forcePersistence) {
      console.log(`Saving collection ${name} with forced persistence mode enabled`);
    }
    
    try {
      // Use the storage path as-is without resolving
      console.log(`Attempting to save collection ${name} to disk at ${this.storagePath}...`);
      
      // Get the collection
      let collection;
      try {
        collection = await super.getCollection({ name });
      } catch (getError) {
        console.error(`Failed to get collection ${name}:`, getError);
        throw new Error(`Cannot save collection ${name} - unable to retrieve it: ${getError instanceof Error ? getError.message : String(getError)}`);
      }
      
      if (!collection) {
        throw new Error(`Cannot save collection ${name} - collection is null or undefined`);
      }
      
      // Force the persistence flag to true
      this.forcePersistence = true;
      
      // Ensure the parent collections directory exists
      const collectionsDir = `${this.storagePath}/collections`;
      if (!this.fs.existsSync(collectionsDir)) {
        console.log(`Creating main collections directory: ${collectionsDir}`);
        this.fs.mkdirSync(collectionsDir, { recursive: true });
      }
      
      // Ensure the specific collection directory exists
      const collectionDir = `${collectionsDir}/${name}`;
      if (!this.fs.existsSync(collectionDir)) {
        console.log(`Creating collection directory: ${collectionDir}`);
        this.fs.mkdirSync(collectionDir, { recursive: true });
      }
      
      // Get all items
      console.log(`Retrieving items from collection ${name}...`);
      let result;
      try {
        result = await collection.get({
          ids: [],
          include: ['embeddings', 'metadatas', 'documents']
        });
        console.log(`Successfully retrieved items from collection ${name}`);
      } catch (getError) {
        console.error(`Failed to get items from collection ${name}:`, getError);
        throw new Error(`Failed to get items from collection ${name}: ${getError instanceof Error ? getError.message : String(getError)}`);
      }
      
      if (!result || !result.ids) {
        console.warn(`No items or invalid result format for collection ${name}`);
        // Create an empty result structure to avoid errors
        result = { ids: [], embeddings: [], metadatas: [], documents: [] };
      }
      
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
      
      console.log(`Processed ${items.length} items for collection ${name}`);
      
      // Create a metadata object with timestamp and stats
      const metadata = {
        collectionName: name,
        itemCount: items.length,
        savedAt: new Date().toISOString(),
        version: "1.0.0"
      };
      
      // Double check collection directory before writing
      if (!this.fs.existsSync(collectionDir)) {
        console.error(`Collection directory still doesn't exist after creation: ${collectionDir}`);
        
        // Try one more time with full permissions
        this.fs.mkdirSync(collectionDir, { recursive: true, mode: 0o777 });
        
        if (!this.fs.existsSync(collectionDir)) {
          throw new Error(`Failed to create collection directory despite multiple attempts: ${collectionDir}`);
        }
      }
      
      // Save metadata to disk
      const metaFile = `${collectionDir}/metadata.json`;
      console.log(`Writing metadata to ${metaFile}...`);
      this.fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2));
      
      // Save items to disk with a temp file approach for atomicity
      const dataFile = `${collectionDir}/items.json`;
      const tempFile = `${dataFile}.tmp`;
      
      // First write to temp file
      console.log(`Writing ${items.length} items to temporary file ${tempFile}...`);
      this.fs.writeFileSync(tempFile, JSON.stringify({ 
        items,
        metadata
      }, null, 2));
      
      // Then rename to final file (more atomic operation)
      console.log(`Moving temporary file to final location ${dataFile}...`);
      if (this.fs.existsSync(dataFile)) {
        // Create a backup of the previous file
        const backupFile = `${dataFile}.bak`;
        this.fs.renameSync(dataFile, backupFile);
      }
      
      this.fs.renameSync(tempFile, dataFile);
      
      // Verify the file was written
      if (this.fs.existsSync(dataFile)) {
        const stats = this.fs.statSync(dataFile);
        console.log(`Successfully saved collection ${name} with ${items.length} items to disk at ${dataFile} (size: ${stats.size} bytes)`);
        
        // Log sample item IDs if there are any (but limit to 5 for brevity)
        if (items.length > 0) {
          const sampleIds = items.slice(0, Math.min(5, items.length)).map(item => item.id);
          console.log(`Sample IDs saved: ${sampleIds.join(', ')}${items.length > 5 ? ' (and more...)' : ''}`);
        }
      } else {
        console.error(`File write verification failed - file ${dataFile} doesn't exist after write operation`);
      }
    } catch (error) {
      console.error(`Failed to save collection ${name} to disk:`, error);
      throw error; // Re-throw to ensure callers know there was an error
    }
  }
  
  // Override collection methods to persist changes
  async createCollection(params: ChromaCollectionOptions): Promise<Collection> {
    const collection = await super.createCollection(params);
    
    // Save to disk
    if (this.storagePath) {
      await this.saveCollectionToDisk(params.name);
    }
    
    return this.wrapCollectionWithPersistence(collection);
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
  
  // Helper to wrap a collection with persistence methods
  private wrapCollectionWithPersistence(collection: Collection): Collection {
    // Check if this collection is already wrapped (avoid double-wrapping)
    if ((collection as any).__isPersistenceWrapped) {
      return collection;
    }
    
    console.log(`Wrapping collection ${collection.name} with persistence methods`);
    
    // Wrap the collection's methods to save changes
    const originalAdd = collection.add.bind(collection);
    const originalUpdate = collection.update.bind(collection);
    const originalDelete = collection.delete.bind(collection);
    
    // Create a proxy to track modifications and trigger disk saves
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

    // Add batchGet if the underlying collection supports it
    if ('batchGet' in collection && collection.batchGet) {
      collection.batchGet = collection.batchGet.bind(collection);
    }
    
    // Mark as wrapped to avoid re-wrapping
    (collection as any).__isPersistenceWrapped = true;
    
    return collection;
  }
  
  // Wrap the InMemoryCollection methods to save after modifications
  async getCollection(params: { name: string, embeddingFunction?: ChromaEmbeddingFunction }): Promise<Collection> {
    const collection = await super.getCollection(params);
    return this.wrapCollectionWithPersistence(collection);
  }
  
  /**
   * Explicitly save all collections to disk
   * This should be called when shutting down to ensure everything is saved
   */
  async saveAllCollections(): Promise<{
    success: boolean;
    savedCollections: string[];
    errors: string[];
  }> {
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
      const collections = await super.listCollections();
      const collectionNames = collections.map(c => typeof c === 'string' ? c : c.name);
      
      console.log(`Found ${collectionNames.length} collections to save: ${collectionNames.join(', ')}`);
      
      // Save each collection
      for (const name of collectionNames) {
        try {
          await this.saveCollectionToDisk(name);
          result.savedCollections.push(name);
          console.log(`Successfully saved collection ${name} to disk`);
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
}

// Export concrete classes and interfaces
let ChromaClient: any = PersistentChromaClient;

// Use the persistent implementation that can work both with persistence and in-memory
console.log('Using file-backed ChromaDB implementation for Obsidian');

// Export the client class and interfaces
export { ChromaClient };