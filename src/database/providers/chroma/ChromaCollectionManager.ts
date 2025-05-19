/**
 * ChromaCollectionManager
 * Direct interface to ChromaDB collections with enhanced type safety
 */

import { ChromaClient } from './ChromaWrapper';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { getErrorMessage } from '../../../utils/errorUtils';

/**
 * Manager for ChromaDB collections
 * Provides methods for creating, getting, listing, and deleting collections
 */
export class ChromaCollectionManager {
  /**
   * ChromaDB client
   */
  private client: InstanceType<typeof ChromaClient>;
  
  /**
   * Collection cache for performance
   */
  private collections: Map<string, any> = new Map();

  /**
   * Create a new ChromaCollectionManager
   * @param vectorStore Vector store implementation
   */
  constructor(vectorStore: IVectorStore) {
    // Extract ChromaClient from the vector store implementation
    // This is specifically for ChromaVectorStore which has a client property
    this.client = (vectorStore as any).client;
    
    if (!this.client) {
      throw new Error('ChromaClient not available in the provided vector store');
    }
  }

  /**
   * Initialize the collection manager
   */
  async initialize(): Promise<void> {
    await this.refreshCollections();
  }

  /**
   * Refresh the collection cache from ChromaDB
   */
  async refreshCollections(): Promise<void> {
    try {
      const collections = await this.client.listCollections();
      this.collections.clear();
      
      for (const collection of collections) {
        // Handle both string and object representations
        const name = typeof collection === 'string' ? collection : collection.name;
        
        if (name) {
          try {
            // Get collection instance from ChromaDB
            const collectionObj = await this.client.getCollection({ name });
            this.collections.set(name, collectionObj);
          } catch (error) {
            console.error(`Failed to get collection ${name}:`, error);
          }
        }
      }
      
      console.log(`Loaded ${this.collections.size} collections from ChromaDB`);
    } catch (error) {
      console.error('Failed to refresh ChromaDB collections:', error);
      throw new Error(`Collection refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create a new collection
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The created collection
   */
  async createCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    try {
      // Merge provided metadata with default metadata
      const collectionMetadata = {
        ...metadata,
        createdAt: new Date().toISOString()
      };
      
      // Create collection in ChromaDB
      const collection = await this.client.createCollection({
        name,
        metadata: collectionMetadata
      });
      
      // Cache the collection
      this.collections.set(name, collection);
      
      return collection;
    } catch (error) {
      // Special handling for "already exists" errors
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`Collection '${name}' already exists, getting existing collection`);
        return this.getCollection(name);
      }
      
      console.error(`Failed to create collection '${name}':`, error);
      throw new Error(`Collection creation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get an existing collection
   * @param name Collection name
   * @returns The collection or null if not found
   */
  async getCollection(name: string): Promise<any> {
    // First check the cache
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }
    
    try {
      // Get collection from ChromaDB
      const collection = await this.client.getCollection({ name });
      
      // Cache the collection
      this.collections.set(name, collection);
      
      return collection;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null; // Return null if collection not found
      }
      
      console.error(`Failed to get collection '${name}':`, error);
      throw new Error(`Collection retrieval failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get or create a collection
   * @param name Collection name
   * @param metadata Optional collection metadata
   * @returns The collection
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<any> {
    // First try to get the collection
    const existingCollection = await this.getCollection(name);
    
    if (existingCollection) {
      return existingCollection;
    }
    
    // If not found, create it
    return this.createCollection(name, metadata);
  }

  /**
   * Check if a collection exists
   * @param name Collection name
   * @returns Whether the collection exists
   */
  async hasCollection(name: string): Promise<boolean> {
    return (await this.getCollection(name)) !== null;
  }

  /**
   * List all collections
   * @returns Array of collection names
   */
  async listCollections(): Promise<string[]> {
    await this.refreshCollections();
    return Array.from(this.collections.keys());
  }

  /**
   * Get collection details with metadata
   * @returns Array of collection objects with name and metadata
   */
  async getCollectionDetails(): Promise<Array<{ name: string; metadata?: Record<string, any> }>> {
    // First refresh collections to ensure we have the latest
    await this.refreshCollections();
    
    // Get details for each collection
    const details: Array<{ name: string; metadata?: Record<string, any> }> = [];
    
    for (const [name, collection] of this.collections.entries()) {
      try {
        // Some collections might have a metadata property
        const metadata = collection.metadata ? await collection.metadata() : undefined;
        details.push({ name, metadata });
      } catch (error) {
        details.push({ name });
      }
    }
    
    return details;
  }

  /**
   * Delete a collection
   * @param name Collection name
   */
  async deleteCollection(name: string): Promise<void> {
    try {
      // First check if the collection exists
      if (!(await this.hasCollection(name))) {
        return; // Nothing to delete
      }
      
      // Delete from ChromaDB
      await this.client.deleteCollection({ name });
      
      // Remove from cache
      this.collections.delete(name);
    } catch (error) {
      console.error(`Failed to delete collection '${name}':`, error);
      throw new Error(`Collection deletion failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Add items to a collection
   * @param name Collection name
   * @param items Items to add
   */
  async addItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    // Get the collection
    const collection = await this.getOrCreateCollection(name);
    
    // Add items to the collection
    await collection.add({
      ids: items.ids,
      embeddings: items.embeddings,
      metadatas: items.metadatas,
      documents: items.documents
    });
  }

  /**
   * Get items from a collection
   * @param name Collection name
   * @param params Get parameters
   */
  async getItems(name: string, params: {
    ids?: string[];
    where?: Record<string, any>;
    limit?: number;
    offset?: number;
    include?: string[];
  }): Promise<any> {
    // Get the collection
    const collection = await this.getCollection(name);
    
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Get items from the collection
    return await collection.get(params);
  }

  /**
   * Query a collection
   * @param name Collection name
   * @param params Query parameters
   */
  async query(name: string, params: {
    queryEmbeddings?: number[][];
    queryTexts?: string[];
    nResults?: number;
    where?: Record<string, any>;
    include?: string[];
  }): Promise<any> {
    // Get the collection
    const collection = await this.getCollection(name);
    
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Query the collection
    return await collection.query(params);
  }

  /**
   * Update items in a collection
   * @param name Collection name
   * @param items Items to update
   */
  async updateItems(name: string, items: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
    documents?: string[];
  }): Promise<void> {
    // Get the collection
    const collection = await this.getCollection(name);
    
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Update items in the collection
    await collection.update(items);
  }

  /**
   * Delete items from a collection
   * @param name Collection name
   * @param params Delete parameters
   */
  async deleteItems(name: string, params: {
    ids?: string[];
    where?: Record<string, any>;
  }): Promise<void> {
    // Get the collection
    const collection = await this.getCollection(name);
    
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Delete items from the collection
    await collection.delete(params);
  }

  /**
   * Get item count in a collection
   * @param name Collection name
   * @returns Number of items in the collection
   */
  async count(name: string): Promise<number> {
    // Get the collection
    const collection = await this.getCollection(name);
    
    if (!collection) {
      throw new Error(`Collection '${name}' not found`);
    }
    
    // Get count from the collection
    return await collection.count();
  }
}