/**
 * HnswSearchService - HNSW-accelerated vector similarity search
 * Replaces brute force O(n) search with efficient O(log n) HNSW algorithm
 */

// Import hnswlib-wasm loader function
import { loadHnswlib } from 'hnswlib-wasm';
import { DatabaseItem } from './FilterEngine';
import { FilterEngine, WhereClause } from './FilterEngine';

export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

interface HnswIndex {
  index: any; // HNSW index from hnswlib-wasm
  idToItem: Map<number, DatabaseItem>;
  itemIdToHnswId: Map<string, number>;
  nextId: number;
}

/**
 * High-performance vector search using HNSW (Hierarchical Navigable Small World)
 * Provides O(log n) search instead of O(n) brute force
 */
export class HnswSearchService {
  private indexes: Map<string, HnswIndex> = new Map();
  private isInitialized: boolean = false;
  private hnswLib: any = null;

  /**
   * Initialize HNSW library
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Load HNSW WASM library
      this.hnswLib = await loadHnswlib();
      this.isInitialized = true;
      console.log('[HnswSearchService] HNSW service initialized');
    } catch (error) {
      console.error('[HnswSearchService] Failed to initialize HNSW:', error);
      throw error;
    }
  }

  /**
   * Create or update HNSW index for a collection
   */
  async indexCollection(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) {
      console.log(`[HnswSearchService] No items to index for collection: ${collectionName}`);
      return;
    }

    // Determine embedding dimension from first item
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    if (!firstEmbedding) {
      console.log(`[HnswSearchService] No valid embeddings found for collection: ${collectionName}`);
      return;
    }

    const dimension = firstEmbedding.length;
    console.log(`[HnswSearchService] Creating HNSW index for ${collectionName} with ${items.length} items, dimension: ${dimension}`);

    try {
      // Create new HNSW index using loaded library
      const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
      
      // Initialize with appropriate parameters for performance
      // dimensions, M, efConstruction, maxElements
      index.initIndex(dimension, 16, 200, items.length);
      
      const idToItem = new Map<number, DatabaseItem>();
      const itemIdToHnswId = new Map<string, number>();
      let nextId = 0;
      let skippedCount = 0;

      // Add all items to the index
      for (const item of items) {
        if (item.embedding && item.embedding.length === dimension) {
          const hnswId = nextId++;
          
          // Add to HNSW index
          index.addPoint(item.embedding, hnswId, false);
          
          // Store mappings
          idToItem.set(hnswId, item);
          itemIdToHnswId.set(item.id, hnswId);
        } else {
          skippedCount++;
        }
      }

      // Log summary of skipped items
      if (skippedCount > 0) {
        console.warn(`[HnswSearchService] Skipped ${skippedCount} items with invalid embeddings (expected dimension: ${dimension})`);
      }

      // Store the complete index
      this.indexes.set(collectionName, {
        index,
        idToItem,
        itemIdToHnswId,
        nextId
      });

      console.log(`[HnswSearchService] Successfully indexed ${idToItem.size} items for collection: ${collectionName}`);
    } catch (error) {
      console.error(`[HnswSearchService] Failed to create index for collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Add single item to existing index
   */
  async addItemToIndex(collectionName: string, item: DatabaseItem): Promise<void> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData || !item.embedding) {
      // If no index exists or item has no embedding, skip
      return;
    }

    try {
      const hnswId = indexData.nextId++;
      
      // Add to HNSW index
      indexData.index.addPoint(item.embedding, hnswId, false);
      
      // Store mappings
      indexData.idToItem.set(hnswId, item);
      indexData.itemIdToHnswId.set(item.id, hnswId);
      
    } catch (error) {
      console.error(`[HnswSearchService] Failed to add item ${item.id} to index:`, error);
    }
  }

  /**
   * Remove item from index
   */
  async removeItemFromIndex(collectionName: string, itemId: string): Promise<void> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData) return;

    const hnswId = indexData.itemIdToHnswId.get(itemId);
    if (hnswId !== undefined) {
      // Note: HNSW doesn't support removal, so we just remove from our mappings
      // The actual HNSW index entry will remain but become unreachable
      indexData.idToItem.delete(hnswId);
      indexData.itemIdToHnswId.delete(itemId);
    }
  }

  /**
   * Perform fast HNSW search
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    nResults: number = 10,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    const indexData = this.indexes.get(collectionName);
    if (!indexData || queryEmbedding.length === 0) {
      return [];
    }

    try {
      // Set search parameter (higher = better recall, slower search)
      indexData.index.setEfSearch(Math.max(nResults * 2, 50));
      
      // Perform HNSW search - this is O(log n) instead of O(n)!
      const searchResults = indexData.index.searchKnn(queryEmbedding, nResults * 3); // Get more to account for filtering
      
      // Convert HNSW results to our format
      const results: ItemWithDistance[] = [];
      
      for (let i = 0; i < searchResults.neighbors.length; i++) {
        const hnswId = searchResults.neighbors[i];
        const distance = searchResults.distances[i];
        const item = indexData.idToItem.get(hnswId);
        
        if (item) {
          // Apply where clause filtering if provided
          if (!where || this.matchesWhere(item, where)) {
            results.push({ item, distance });
          }
        }
      }

      // Return top N results after filtering
      return results.slice(0, nResults);
      
    } catch (error) {
      console.error(`[HnswSearchService] Search failed for collection ${collectionName}:`, error);
      return [];
    }
  }

  /**
   * Check if collection has an index
   */
  hasIndex(collectionName: string): boolean {
    return this.indexes.has(collectionName);
  }

  /**
   * Get index statistics
   */
  getIndexStats(collectionName: string): { itemCount: number; dimension: number } | null {
    const indexData = this.indexes.get(collectionName);
    if (!indexData) return null;

    return {
      itemCount: indexData.idToItem.size,
      dimension: indexData.index.getNumDimensions()
    };
  }

  /**
   * Remove index for collection
   */
  removeIndex(collectionName: string): void {
    this.indexes.delete(collectionName);
  }

  /**
   * Clear all indexes
   */
  clearAllIndexes(): void {
    this.indexes.clear();
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): { totalIndexes: number; totalItems: number } {
    let totalItems = 0;
    
    for (const indexData of this.indexes.values()) {
      totalItems += indexData.idToItem.size;
    }

    return {
      totalIndexes: this.indexes.size,
      totalItems
    };
  }

  /**
   * Helper method to apply where clause filtering
   */
  private matchesWhere(item: DatabaseItem, where: WhereClause): boolean {
    return FilterEngine.matchesWhereClause(item, where);
  }
}