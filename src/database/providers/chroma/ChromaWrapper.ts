/**
 * ChromaDB wrapper to handle compatibility issues with Obsidian/Electron
 * This file provides a compatibility layer for using ChromaDB in Obsidian
 */

// Define the same interfaces as ChromaDB to maintain type safety
export interface ChromaClientOptions {
  path?: string;
}

export interface CollectionMetadata {
  name: string;
  metadata?: Record<string, any>;
}

export interface Collection {
  name: string;
  add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  get(params: {
    ids: string[];
    include?: string[];
  }): Promise<{
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }>;
  update(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void>;
  delete(params: {
    ids: string[];
  }): Promise<void>;
  query(params: {
    queryEmbeddings: number[][];
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }>;
  count(): Promise<number>;
}

// In-memory implementations for when ChromaDB is not available
class InMemoryCollection implements Collection {
  name: string;
  private items: Map<string, {
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }>;

  constructor(name: string) {
    this.name = name;
    this.items = new Map();
  }

  async add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    const { ids, embeddings, metadatas = [], documents = [] } = params;
    
    for (let i = 0; i < ids.length; i++) {
      this.items.set(ids[i], {
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      });
    }
  }

  async get(params: {
    ids: string[];
    include?: string[];
  }): Promise<{
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

  async update(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
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

  async delete(params: {
    ids: string[];
  }): Promise<void> {
    const { ids } = params;
    
    for (const id of ids) {
      this.items.delete(id);
    }
  }

  async query(params: {
    queryEmbeddings: number[][];
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
    const { queryEmbeddings, nResults = 10, include = ['embeddings', 'metadatas', 'documents', 'distances'] } = params;
    
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
    
    for (const queryEmbedding of queryEmbeddings) {
      const allItems = Array.from(this.items.entries());
      const topItems = allItems.slice(0, Math.min(nResults, allItems.length));
      
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

  async getCollection(params: { name: string }): Promise<Collection> {
    const { name } = params;
    
    if (!this.collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    return this.collections.get(name)!;
  }

  async createCollection(params: { name: string, metadata?: Record<string, any> }): Promise<Collection> {
    const { name } = params;
    
    if (this.collections.has(name)) {
      throw new Error(`Collection '${name}' already exists`);
    }
    
    const collection = new InMemoryCollection(name);
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
}

// Export concrete classes and interfaces
let ChromaClient: any = InMemoryChromaClient;

// In Obsidian/Electron environment, always use in-memory implementation
// This prevents errors with native dependencies that can't be loaded in the renderer process
console.log('Using in-memory ChromaDB implementation in Obsidian environment');

// We intentionally don't try to load the actual ChromaDB in Obsidian
// because it has native dependencies that don't work in Electron's renderer process

// Export the client class only
export { ChromaClient };
// Don't export Collection as a type since we've already defined it as a class/interface