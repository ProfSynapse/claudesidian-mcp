import { ICollectionManager } from '../../interfaces/ICollectionManager';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { SimilarityResult } from '../../models/EmbeddingTypes';

/**
 * Base collection manager for ChromaDB collections
 * Provides common functionality for managing specific collections
 */
export abstract class BaseChromaCollection<T> implements ICollectionManager<T> {
  /**
   * Collection name
   */
  readonly collectionName: string;
  
  /**
   * Vector store instance
   */
  protected vectorStore: IVectorStore;
  
  /**
   * Create a new base collection manager
   * @param vectorStore Vector store instance
   * @param collectionName Collection name
   */
  constructor(vectorStore: IVectorStore, collectionName: string) {
    this.vectorStore = vectorStore;
    this.collectionName = collectionName;
  }
  
  /**
   * Initialize the collection
   */
  async initialize(): Promise<void> {
    try {
      // First check if the collection exists
      const exists = await this.vectorStore.hasCollection(this.collectionName);
      
      if (!exists) {
        // If not, create it - this will now handle "already exists" errors gracefully
        await this.vectorStore.createCollection(this.collectionName, {
          description: `Collection for ${this.collectionName} data`,
          createdAt: new Date().toISOString(),
          distance: 'cosine'            // Use cosine distance for better text embedding performance
        });
      }
    } catch (error) {
      // Log the error but don't throw, as we want to keep initialization as robust as possible
      console.error(`Error initializing collection ${this.collectionName}:`, error);
    }
  }
  
  /**
   * Extract ID from an item
   * @param item Item object
   * @returns Item ID
   */
  protected abstract extractId(item: T): string;
  
  /**
   * Convert an item to storage format
   * @param item Item object
   * @returns Storage object with ID, embedding, metadata, and document
   */
  protected abstract itemToStorage(item: T): {
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document?: string;
  } | Promise<{
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document?: string;
  }>;
  
  /**
   * Convert from storage format to item
   * @param storage Storage object
   * @returns Item object
   */
  protected abstract storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): T;
  
  /**
   * Add an item to the collection
   * @param item Item to add
   * @returns ID of the added item
   */
  async add(item: T): Promise<string> {
    const storage = await this.itemToStorage(item);
    
    await this.vectorStore.addItems(this.collectionName, {
      ids: [storage.id],
      embeddings: [storage.embedding],
      metadatas: [storage.metadata],
      documents: storage.document ? [storage.document] : undefined
    });
    
    return storage.id;
  }
  
  /**
   * Add multiple items to the collection
   * @param items Items to add
   * @returns Array of added item IDs
   */
  async addBatch(items: T[]): Promise<string[]> {
    if (items.length === 0) {
      return [];
    }
    
    const storageItems = await Promise.all(items.map(item => this.itemToStorage(item)));
    
    await this.vectorStore.addItems(this.collectionName, {
      ids: storageItems.map(item => item.id),
      embeddings: storageItems.map(item => item.embedding),
      metadatas: storageItems.map(item => item.metadata),
      documents: storageItems.some(item => item.document) 
        ? storageItems.map(item => item.document || '')
        : undefined
    });
    
    return storageItems.map(item => item.id);
  }
  
  /**
   * Get an item by ID
   * @param id ID of the item to retrieve
   * @returns Retrieved item or undefined if not found
   */
  async get(id: string): Promise<T | undefined> {
    try {
      const result = await this.vectorStore.getItems(this.collectionName, [id], ['embeddings', 'metadatas', 'documents']);
      
      if (!result.ids.length) {
        return undefined;
      }
      
      return this.storageToItem({
        id: result.ids[0],
        embedding: result.embeddings?.[0],
        metadata: result.metadatas?.[0],
        document: result.documents?.[0]
      });
    } catch (error) {
      console.error(`Failed to get item ${id} from collection ${this.collectionName}:`, error);
      return undefined;
    }
  }
  
  /**
   * Get multiple items by their IDs
   * @param ids IDs of the items to retrieve
   * @returns Array of retrieved items
   */
  async getBatch(ids: string[]): Promise<T[]> {
    if (ids.length === 0) {
      return [];
    }
    
    try {
      const result = await this.vectorStore.getItems(this.collectionName, ids, ['embeddings', 'metadatas', 'documents']);
      
      return result.ids.map((id, index) => this.storageToItem({
        id,
        embedding: result.embeddings?.[index],
        metadata: result.metadatas?.[index],
        document: result.documents?.[index]
      }));
    } catch (error) {
      console.error(`Failed to get batch items from collection ${this.collectionName}:`, error);
      return [];
    }
  }
  
  /**
   * Update an item
   * @param id ID of the item to update
   * @param updates Partial item data for updating
   */
  async update(id: string, updates: Partial<T>): Promise<void> {
    // First get the current item
    const currentItem = await this.get(id);
    
    if (!currentItem) {
      throw new Error(`Item with ID ${id} not found in collection ${this.collectionName}`);
    }
    
    // Merge updates with current item
    const updatedItem = { ...currentItem, ...updates } as T;
    
    // Convert to storage format
    const storage = await this.itemToStorage(updatedItem);
    
    // Update in vector store
    await this.vectorStore.updateItems(this.collectionName, {
      ids: [id],
      embeddings: [storage.embedding],
      metadatas: [storage.metadata],
      documents: storage.document ? [storage.document] : undefined
    });
  }
  
  /**
   * Delete an item
   * @param id ID of the item to delete
   */
  async delete(id: string): Promise<void> {
    await this.vectorStore.deleteItems(this.collectionName, [id]);
  }
  
  /**
   * Delete multiple items
   * @param ids IDs of the items to delete
   */
  async deleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    
    await this.vectorStore.deleteItems(this.collectionName, ids);
  }
  
  /**
   * Query items by similarity to a given embedding
   * @param embedding Query embedding vector
   * @param options Query options
   */
  async query(embedding: number[], options?: {
    limit?: number;
    threshold?: number;
    where?: Record<string, any>;
  }): Promise<Array<SimilarityResult<T>>> {
    const limit = options?.limit || 10;
    
    // Query the vector store
    const results = await this.vectorStore.query(this.collectionName, {
      queryEmbeddings: [embedding],
      nResults: limit,
      where: options?.where,
      include: ['embeddings', 'metadatas', 'documents', 'distances']
    });
    
    if (!results.ids[0]?.length) {
      return [];
    }
    
    // Process results
    const items: Array<SimilarityResult<T>> = [];
    
    for (let i = 0; i < results.ids[0].length; i++) {
      const id = results.ids[0][i];
      const embeddingResult = results.embeddings?.[0]?.[i];
      const metadata = results.metadatas?.[0]?.[i];
      const document = results.documents?.[0]?.[i];
      const distance = results.distances?.[0]?.[i] || 0;
      
      // Skip if below threshold
      if (options?.threshold !== undefined) {
        // Convert distance to similarity (1 - normalized distance)
        const similarity = 1 - distance;
        if (similarity < options.threshold) {
          continue;
        }
      }
      
      // Convert to item
      const item = this.storageToItem({
        id,
        embedding: embeddingResult,
        metadata,
        document
      });
      
      // Append to results
      items.push({
        item,
        similarity: 1 - distance, // Convert distance to similarity
        distance
      });
    }
    
    return items;
  }
  
  /**
   * Get all items from the collection
   * @param options Options for retrieving all items
   */
  async getAll(options?: {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    where?: Record<string, any>;
  }): Promise<T[]> {
    // Starting getAll operation
    
    // Don't rely on count() for early return as it may be inaccurate
    // Instead, try to fetch the data and let ChromaDB tell us if it's empty
    
    // Use ChromaDB's getAllItems method to retrieve all items without query embeddings
    // Calling vectorStore.getAllItems
    const results = await this.vectorStore.getAllItems(this.collectionName, options);
    
    // Raw results retrieved from getAllItems
    
    if (!results.ids?.length) {
      // No IDs found, returning empty array
      return [];
    }
    
    // Process results (getItems returns flat arrays, not nested like query)
    // Processing retrieved items
    const items = results.ids.map((id, index) => {
      const embedding = results.embeddings?.[index];
      const metadata = results.metadatas?.[index];
      const document = results.documents?.[index];
      
      // Processing item data
      
      const item = this.storageToItem({
        id,
        embedding,
        metadata,
        document
      });
      
      // Item converted successfully
      return item;
    });
    
    // Final processing completed
    
    // Sort if requested
    if (options?.sortBy) {
      const direction = options.sortOrder === 'desc' ? -1 : 1;
      
      items.sort((a, b) => {
        const aValue = (a as any)[options.sortBy!];
        const bValue = (b as any)[options.sortBy!];
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return direction * aValue.localeCompare(bValue);
        } else {
          return direction * (aValue > bValue ? 1 : aValue < bValue ? -1 : 0);
        }
      });
    }
    
    return items;
  }
  
  /**
   * Get the number of items in the collection
   */
  async count(): Promise<number> {
    return this.vectorStore.count(this.collectionName);
  }
}