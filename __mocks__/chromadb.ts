/**
 * Mock implementation of the ChromaDB package for testing
 * This mock provides in-memory implementations of ChromaClient and Collection
 */

// Type definitions
type CollectionConfig = {
  name: string;
  metadata?: Record<string, any>;
};

type CollectionGetParams = {
  ids: string[];
  include?: string[];
};

type CollectionAddParams = {
  ids: string[];
  embeddings: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
};

type CollectionUpdateParams = {
  ids: string[];
  embeddings?: number[][];
  metadatas?: Record<string, any>[];
  documents?: string[];
};

type CollectionDeleteParams = {
  ids: string[];
};

type CollectionQueryParams = {
  queryEmbeddings: number[][];
  nResults?: number;
  where?: Record<string, any>;
  include?: string[];
};

type ClientOptions = {
  path?: string;
};

// In-memory storage
const collections = new Map<string, Collection>();

/**
 * Mock Collection class
 */
export class Collection {
  name: string;
  metadata: Record<string, any>;
  items: Map<string, {
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }>;

  constructor(name: string, metadata: Record<string, any> = {}) {
    this.name = name;
    this.metadata = metadata;
    this.items = new Map();
  }

  /**
   * Add items to the collection
   */
  async add(params: CollectionAddParams): Promise<void> {
    const { ids, embeddings, metadatas = [], documents = [] } = params;
    
    for (let i = 0; i < ids.length; i++) {
      this.items.set(ids[i], {
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      });
    }
  }

  /**
   * Get items by ID
   */
  async get(params: CollectionGetParams): Promise<{
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

  /**
   * Update items in the collection
   */
  async update(params: CollectionUpdateParams): Promise<void> {
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

  /**
   * Delete items from the collection
   */
  async delete(params: CollectionDeleteParams): Promise<void> {
    const { ids } = params;
    
    for (const id of ids) {
      this.items.delete(id);
    }
  }

  /**
   * Query the collection
   */
  async query(params: CollectionQueryParams): Promise<{
    ids: string[][];
    embeddings?: number[][][];
    metadatas?: Record<string, any>[][];
    documents?: string[][];
    distances?: number[][];
  }> {
    const { queryEmbeddings, nResults = 10, include = ['embeddings', 'metadatas', 'documents', 'distances'] } = params;
    
    // For each query embedding, return the top n results
    // In a real implementation, this would compute distances and sort by similarity
    // Here we just return the first n items for each query
    
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
          // Mock distance is a random value between 0 and 1
          distances.push(Math.random());
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

  /**
   * Get the number of items in the collection
   */
  async count(): Promise<number> {
    return this.items.size;
  }
}

/**
 * Mock ChromaClient class
 */
export class ChromaClient {
  options: ClientOptions;
  
  constructor(options: ClientOptions = {}) {
    this.options = options;
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[] | { name: string; metadata?: Record<string, any> }[]> {
    return Array.from(collections.values()).map(collection => ({
      name: collection.name,
      metadata: collection.metadata
    }));
  }

  /**
   * Get a collection by name
   */
  async getCollection(params: { name: string }): Promise<Collection> {
    const { name } = params;
    
    if (!collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    return collections.get(name)!;
  }

  /**
   * Create a new collection
   */
  async createCollection(params: CollectionConfig): Promise<Collection> {
    const { name, metadata = {} } = params;
    
    if (collections.has(name)) {
      throw new Error(`Collection '${name}' already exists`);
    }
    
    const collection = new Collection(name, metadata);
    collections.set(name, collection);
    
    return collection;
  }

  /**
   * Delete a collection
   */
  async deleteCollection(params: { name: string }): Promise<void> {
    const { name } = params;
    
    if (!collections.has(name)) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    collections.delete(name);
  }
}

// Export the mocked components
export default {
  ChromaClient,
  Collection
};