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
    const { queryEmbeddings = [], queryTexts = [], nResults = 10, where, include = ['embeddings', 'metadatas', 'documents', 'distances'] } = params;
    
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
  
  constructor(options: ChromaClientOptions = {}) {
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

// Export concrete classes and interfaces
let ChromaClient: any = InMemoryChromaClient;

// In Obsidian/Electron environment, always use in-memory implementation
// This prevents errors with native dependencies that can't be loaded in the renderer process
console.log('Using in-memory ChromaDB implementation in Obsidian environment');

// We intentionally don't try to load the actual ChromaDB in Obsidian
// because it has native dependencies that don't work in Electron's renderer process

// Export the client class and interfaces
export { ChromaClient };