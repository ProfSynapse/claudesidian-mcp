/**
 * MockVectorStore - ChromaDB simulation for HNSW initialization testing
 * Loads fixture data and simulates ChromaDB operations without external dependencies
 * Provides comprehensive testing scenarios and debugging capabilities
 */

import { IVectorStore } from '../../src/database/interfaces/IVectorStore';
import { DatabaseItem } from '../../src/database/providers/chroma/services/FilterEngine';

export interface MockCollectionData {
  name: string;
  items: DatabaseItem[];
  count: number;
  metadata: Record<string, any>;
}

export interface MockVectorStoreConfig {
  collections?: MockCollectionData[];
  simulateFailures?: {
    listCollections?: boolean;
    hasCollection?: boolean;
    count?: boolean;
    getAllItems?: boolean;
  };
  delays?: {
    listCollections?: number;
    getAllItems?: number;
  };
}

/**
 * Mock implementation of IVectorStore for testing HNSW initialization
 */
export class MockVectorStore implements IVectorStore {
  private collections: Map<string, MockCollectionData> = new Map();
  private config: MockVectorStoreConfig;
  private operations: Array<{
    timestamp: number;
    operation: string;
    collectionName?: string;
    success: boolean;
    data?: any;
  }> = [];

  constructor(config: MockVectorStoreConfig = {}) {
    this.config = config;
    
    // Load collections from config
    if (config.collections) {
      for (const collection of config.collections) {
        this.collections.set(collection.name, collection);
      }
    }
  }

  /**
   * List all available collections
   */
  async listCollections(): Promise<string[]> {
    await this.simulateDelay('listCollections');
    
    if (this.config.simulateFailures?.listCollections) {
      this.recordOperation('listCollections', undefined, false);
      throw new Error('Mock failure: listCollections');
    }

    const collectionNames = Array.from(this.collections.keys());
    this.recordOperation('listCollections', undefined, true, { collections: collectionNames });
    return collectionNames;
  }

  /**
   * Check if collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    if (this.config.simulateFailures?.hasCollection) {
      this.recordOperation('hasCollection', collectionName, false);
      throw new Error(`Mock failure: hasCollection for ${collectionName}`);
    }

    const exists = this.collections.has(collectionName);
    this.recordOperation('hasCollection', collectionName, true, { exists });
    return exists;
  }

  /**
   * Get collection item count
   */
  async count(collectionName: string): Promise<number> {
    if (this.config.simulateFailures?.count) {
      this.recordOperation('count', collectionName, false);
      throw new Error(`Mock failure: count for ${collectionName}`);
    }

    const collection = this.collections.get(collectionName);
    const count = collection?.count || 0;
    
    this.recordOperation('count', collectionName, true, { count });
    return count;
  }

  /**
   * Get all items from collection (for HNSW indexing)
   */
  async getAllItems(
    collectionName: string, 
    options?: { limit?: number; offset?: number }
  ): Promise<{
    ids: string[];
    documents?: string[];
    embeddings?: number[][];
    metadatas?: Record<string, any>[];
  }> {
    await this.simulateDelay('getAllItems');
    
    if (this.config.simulateFailures?.getAllItems) {
      this.recordOperation('getAllItems', collectionName, false);
      throw new Error(`Mock failure: getAllItems for ${collectionName}`);
    }

    const collection = this.collections.get(collectionName);
    if (!collection) {
      this.recordOperation('getAllItems', collectionName, false, { error: 'Collection not found' });
      return { ids: [], documents: [], embeddings: [], metadatas: [] };
    }

    const { limit, offset = 0 } = options || {};
    let items = collection.items;
    
    // Apply offset and limit
    if (offset > 0) {
      items = items.slice(offset);
    }
    if (limit && limit > 0) {
      items = items.slice(0, limit);
    }

    const result = {
      ids: items.map(item => item.id),
      documents: items.map(item => item.document),
      embeddings: items.map(item => item.embedding),
      metadatas: items.map(item => item.metadata)
    };

    this.recordOperation('getAllItems', collectionName, true, { 
      itemCount: items.length,
      requestedLimit: limit,
      requestedOffset: offset
    });

    return result;
  }

  // === Additional IVectorStore methods (simplified for testing) ===

  async addItems(
    collectionName: string,
    items: DatabaseItem[]
  ): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    // Add items to collection
    collection.items.push(...items);
    collection.count = collection.items.length;

    this.recordOperation('addItems', collectionName, true, { itemCount: items.length });
  }

  async updateItems(
    collectionName: string,
    items: DatabaseItem[]
  ): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    // Update items by ID
    for (const newItem of items) {
      const existingIndex = collection.items.findIndex(item => item.id === newItem.id);
      if (existingIndex >= 0) {
        collection.items[existingIndex] = newItem;
      }
    }

    this.recordOperation('updateItems', collectionName, true, { itemCount: items.length });
  }

  async deleteItems(
    collectionName: string,
    ids: string[]
  ): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    // Remove items by ID
    collection.items = collection.items.filter(item => !ids.includes(item.id));
    collection.count = collection.items.length;

    this.recordOperation('deleteItems', collectionName, true, { deletedCount: ids.length });
  }

  async queryItems(
    collectionName: string,
    queryEmbedding: number[],
    options?: {
      nResults?: number;
      where?: Record<string, any>;
      includeMetadata?: boolean;
    }
  ): Promise<{
    ids: string[];
    distances: number[];
    documents?: string[];
    metadatas?: Record<string, any>[];
  }> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      return { ids: [], distances: [], documents: [], metadatas: [] };
    }

    // Simple mock query - return first N items with mock distances
    const nResults = options?.nResults || 10;
    const items = collection.items.slice(0, nResults);
    
    const result = {
      ids: items.map(item => item.id),
      distances: items.map(() => Math.random() * 0.5), // Mock similarity scores
      documents: items.map(item => item.document),
      metadatas: options?.includeMetadata ? items.map(item => item.metadata) : undefined
    };

    this.recordOperation('queryItems', collectionName, true, { nResults: items.length });
    return result;
  }

  async createCollection(
    collectionName: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const collection: MockCollectionData = {
      name: collectionName,
      items: [],
      count: 0,
      metadata: metadata || {}
    };

    this.collections.set(collectionName, collection);
    this.recordOperation('createCollection', collectionName, true);
  }

  async deleteCollection(collectionName: string): Promise<void> {
    const deleted = this.collections.delete(collectionName);
    this.recordOperation('deleteCollection', collectionName, deleted);
  }

  // === Testing Utilities ===

  /**
   * Load fixture data from JSON
   */
  loadFixtureData(fixtureData: any): void {
    if (fixtureData.items) {
      // Single collection format
      const collectionName = fixtureData.metadata?.collectionName || 'default';
      const collection: MockCollectionData = {
        name: collectionName,
        items: fixtureData.items,
        count: fixtureData.items.length,
        metadata: fixtureData.metadata || {}
      };
      this.collections.set(collectionName, collection);
    } else if (Array.isArray(fixtureData)) {
      // Multiple collections format
      for (const collectionData of fixtureData) {
        this.collections.set(collectionData.name, collectionData);
      }
    }
  }

  /**
   * Add collection for testing
   */
  addMockCollection(collection: MockCollectionData): void {
    this.collections.set(collection.name, collection);
  }

  /**
   * Get collection data for verification
   */
  getMockCollection(collectionName: string): MockCollectionData | undefined {
    return this.collections.get(collectionName);
  }

  /**
   * Get all operations for debugging
   */
  getOperationHistory(): typeof this.operations {
    return [...this.operations];
  }

  /**
   * Clear operation history
   */
  clearOperationHistory(): void {
    this.operations.length = 0;
  }

  /**
   * Configure failure simulation
   */
  setFailureMode(failures: NonNullable<MockVectorStoreConfig['simulateFailures']>): void {
    this.config.simulateFailures = { ...this.config.simulateFailures, ...failures };
  }

  /**
   * Set operation delays for performance testing
   */
  setDelays(delays: NonNullable<MockVectorStoreConfig['delays']>): void {
    this.config.delays = { ...this.config.delays, ...delays };
  }

  /**
   * Reset all collections and state
   */
  reset(): void {
    this.collections.clear();
    this.operations.length = 0;
    this.config.simulateFailures = {};
    this.config.delays = {};
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    collections: string[];
    totalItems: number;
    operations: number;
  } {
    const collections = Array.from(this.collections.keys());
    const totalItems = Array.from(this.collections.values())
      .reduce((sum, collection) => sum + collection.count, 0);
    
    return {
      collections,
      totalItems,
      operations: this.operations.length
    };
  }

  // === Private Methods ===

  private async simulateDelay(operation: keyof NonNullable<MockVectorStoreConfig['delays']>): Promise<void> {
    const delay = this.config.delays?.[operation];
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private recordOperation(
    operation: string,
    collectionName: string | undefined,
    success: boolean,
    data?: any
  ): void {
    this.operations.push({
      timestamp: Date.now(),
      operation,
      collectionName,
      success,
      data
    });
  }
}