import { 
  ICollectionService, 
  CollectionMetadata, 
  CollectionItems, 
  CollectionQuery, 
  QueryResult, 
  Collection,
  CollectionStats 
} from '../interfaces/ICollectionService';
import { IVectorStore } from '../interfaces/IVectorStore';
import { ChromaCollectionManager } from '../providers/chroma/ChromaCollectionManager';
import { EventManager } from '../../services/EventManager';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * Generic collection service for managing vector store collections
 * Provides a unified interface for collection operations across different vector store implementations
 */
export class CollectionService implements ICollectionService {
  private vectorStore: IVectorStore;
  private collectionManager: ChromaCollectionManager;
  private eventManager?: EventManager;
  private initialized: boolean = false;

  /**
   * Create a new CollectionService
   * @param vectorStore Vector store implementation
   * @param eventManager Optional event manager for emitting events
   */
  constructor(vectorStore: IVectorStore, eventManager?: EventManager) {
    this.vectorStore = vectorStore;
    this.collectionManager = new ChromaCollectionManager(vectorStore);
    this.eventManager = eventManager;
  }

  /**
   * Initialize the collection service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.collectionManager.initialize();
      this.initialized = true;
      console.log('CollectionService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CollectionService:', error);
      throw new Error(`CollectionService initialization failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if a collection exists
   */
  async hasCollection(name: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      return await this.collectionManager.hasCollection(name);
    } catch (error) {
      console.error(`Error checking collection existence for ${name}:`, error);
      throw new Error(`Failed to check collection existence: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(name: string, metadata?: CollectionMetadata): Promise<Collection> {
    this.ensureInitialized();
    
    try {
      // Add creation timestamp if not provided
      const enrichedMetadata = {
        createdAt: new Date().toISOString(),
        ...metadata
      };

      const collection = await this.collectionManager.createCollection(name, enrichedMetadata);
      
      // Emit event
      this.emitEvent('collection-created', { name, metadata: enrichedMetadata });
      
      console.log(`Collection '${name}' created successfully`);
      return collection;
    } catch (error) {
      console.error(`Error creating collection ${name}:`, error);
      throw new Error(`Failed to create collection: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.collectionManager.deleteCollection(name);
      
      // Emit event
      this.emitEvent('collection-deleted', { name });
      
      console.log(`Collection '${name}' deleted successfully`);
    } catch (error) {
      console.error(`Error deleting collection ${name}:`, error);
      throw new Error(`Failed to delete collection: ${getErrorMessage(error)}`);
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      return await this.collectionManager.listCollections();
    } catch (error) {
      console.error('Error listing collections:', error);
      throw new Error(`Failed to list collections: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get a collection by name
   */
  async getCollection(name: string): Promise<Collection> {
    this.ensureInitialized();
    
    try {
      return await this.collectionManager.getCollection(name);
    } catch (error) {
      console.error(`Error getting collection ${name}:`, error);
      throw new Error(`Failed to get collection: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Count items in a collection
   */
  async countItems(name: string): Promise<number> {
    this.ensureInitialized();
    
    try {
      return await this.vectorStore.count(name);
    } catch (error) {
      console.error(`Error counting items in collection ${name}:`, error);
      throw new Error(`Failed to count items: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Add items to a collection
   */
  async addItems(name: string, items: CollectionItems): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Validate items
      this.validateCollectionItems(items);
      
      // Ensure embeddings are provided as required by IVectorStore
      if (!items.embeddings) {
        throw new Error('Embeddings are required when adding items to a collection');
      }
      
      await this.vectorStore.addItems(name, {
        ids: items.ids,
        embeddings: items.embeddings,
        metadatas: items.metadatas,
        documents: items.documents
      });
      
      // Emit event
      this.emitEvent('items-added', { collection: name, count: items.ids.length });
      
      console.log(`Added ${items.ids.length} items to collection '${name}'`);
    } catch (error) {
      console.error(`Error adding items to collection ${name}:`, error);
      throw new Error(`Failed to add items: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete items from a collection
   */
  async deleteItems(name: string, ids: string[]): Promise<void> {
    this.ensureInitialized();
    
    try {
      if (!ids || ids.length === 0) {
        throw new Error('No item IDs provided for deletion');
      }

      await this.vectorStore.deleteItems(name, ids);
      
      // Emit event
      this.emitEvent('items-deleted', { collection: name, count: ids.length });
      
      console.log(`Deleted ${ids.length} items from collection '${name}'`);
    } catch (error) {
      console.error(`Error deleting items from collection ${name}:`, error);
      throw new Error(`Failed to delete items: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Query items from a collection
   */
  async queryItems(name: string, query: CollectionQuery): Promise<QueryResult> {
    this.ensureInitialized();
    
    try {
      // Validate query
      this.validateQuery(query);
      
      const result = await this.vectorStore.query(name, query);
      
      // Emit event
      const resultCount = result.ids?.[0]?.length || 0;
      this.emitEvent('collection-queried', { collection: name, resultCount });
      
      return result;
    } catch (error) {
      console.error(`Error querying collection ${name}:`, error);
      throw new Error(`Failed to query collection: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(name: string): Promise<CollectionStats> {
    this.ensureInitialized();
    
    try {
      const exists = await this.hasCollection(name);
      if (!exists) {
        throw new Error(`Collection '${name}' does not exist`);
      }

      const count = await this.countItems(name);
      const collection = await this.getCollection(name);
      
      return {
        name,
        count,
        lastModified: new Date().toISOString(), // Would need to track this properly
        metadata: collection.metadata
      };
    } catch (error) {
      console.error(`Error getting stats for collection ${name}:`, error);
      throw new Error(`Failed to get collection stats: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CollectionService not initialized. Call initialize() first.');
    }
  }

  /**
   * Validate collection items
   */
  private validateCollectionItems(items: CollectionItems): void {
    if (!items.ids || items.ids.length === 0) {
      throw new Error('Items must have at least one ID');
    }

    // Check that all arrays have the same length
    const length = items.ids.length;
    
    if (items.embeddings && items.embeddings.length !== length) {
      throw new Error(`Embeddings array length (${items.embeddings.length}) must match IDs length (${length})`);
    }
    
    if (items.metadatas && items.metadatas.length !== length) {
      throw new Error(`Metadatas array length (${items.metadatas.length}) must match IDs length (${length})`);
    }
    
    if (items.documents && items.documents.length !== length) {
      throw new Error(`Documents array length (${items.documents.length}) must match IDs length (${length})`);
    }
  }

  /**
   * Validate query parameters
   */
  private validateQuery(query: CollectionQuery): void {
    if (!query.queryEmbeddings && !query.queryTexts) {
      throw new Error('Query must have either queryEmbeddings or queryTexts');
    }

    if (query.queryEmbeddings && query.queryTexts) {
      throw new Error('Query cannot have both queryEmbeddings and queryTexts');
    }

    if (query.nResults && query.nResults <= 0) {
      throw new Error('nResults must be greater than 0');
    }
  }

  /**
   * Emit an event if event manager is available
   */
  private emitEvent(event: string, data: any): void {
    if (this.eventManager) {
      this.eventManager.emit(event, data);
    }
  }
}