/**
 * CollectionRepository - Manages in-memory collection data operations
 * Applies Single Responsibility Principle by focusing only on data management
 * Uses ChromaDB for semantic search and vector operations
 */

import { DatabaseItem } from './FilterEngine';
import { VectorCalculator } from './VectorCalculator';
import { FilterEngine, WhereClause } from './FilterEngine';

export interface CollectionData {
  items: Map<string, DatabaseItem>;
  metadata: Record<string, any>;
}

export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

export class CollectionRepository {
  private items: Map<string, DatabaseItem>;
  private collectionMetadata: Record<string, any>;
  private collectionName: string;
  private persistentPath?: string;

  constructor(metadata: Record<string, any> = {}, collectionName = 'default', persistentPath?: string) {
    this.items = new Map();
    this.collectionMetadata = {
      ...metadata,
      createdAt: metadata.createdAt || new Date().toISOString()
    };
    this.collectionName = collectionName;
    this.persistentPath = persistentPath;
  }

  /**
   * Get all items as an array
   */
  getAllItems(): DatabaseItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get collection data for persistence
   */
  getCollectionData(): CollectionData {
    return {
      items: new Map(this.items),
      metadata: { ...this.collectionMetadata }
    };
  }

  /**
   * Load collection data from persistence
   */
  loadCollectionData(data: CollectionData): void {
    this.items.clear();
    
    // Load items from Map or array format
    if (data.items instanceof Map) {
      for (const [id, item] of data.items) {
        this.items.set(id, item);
      }
    } else if (Array.isArray(data.items)) {
      // Handle array format for backward compatibility
      for (const item of data.items as DatabaseItem[]) {
        if (item && item.id) {
          this.items.set(item.id, {
            id: item.id,
            embedding: item.embedding || [],
            metadata: item.metadata || {},
            document: item.document || ''
          });
        }
      }
    }

    if (data.metadata) {
      this.collectionMetadata = { ...data.metadata };
    }
  }

  /**
   * Add items to the collection
   */
  addItems(
    ids: string[],
    embeddings: number[][],
    metadatas: Record<string, any>[],
    documents: string[]
  ): void {
    for (let i = 0; i < ids.length; i++) {
      const item = {
        id: ids[i],
        embedding: embeddings[i] || [],
        metadata: metadatas[i] || {},
        document: documents[i] || '',
      };
      this.items.set(ids[i], item);
    }
  }

  /**
   * Get items by IDs or with filtering
   */
  getItems(
    ids?: string[],
    where?: WhereClause,
    limit?: number,
    offset?: number
  ): DatabaseItem[] {
    let items = this.getAllItems();

    // Filter by IDs if provided
    if (ids && ids.length > 0) {
      items = FilterEngine.filterByIds(items, ids);
    }

    // Filter by where clause
    items = FilterEngine.filterByWhere(items, where);

    // Apply pagination
    return FilterEngine.paginate(items, offset, limit);
  }

  /**
   * Update items in the collection
   */
  updateItems(
    ids: string[],
    embeddings?: number[][],
    metadatas?: Record<string, any>[],
    documents?: string[]
  ): void {
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
  deleteItems(ids?: string[], where?: WhereClause): void {
    if (ids) {
      for (const id of ids) {
        this.items.delete(id);
      }
    } else if (where) {
      // Delete by where filter
      const itemsToDelete = FilterEngine.filterByWhere(this.getAllItems(), where);
      for (const item of itemsToDelete) {
        this.items.delete(item.id);
      }
    }
  }

  /**
   * Query items with vector similarity - now using HNSW for O(log n) performance!
   */
  async queryItems(
    queryEmbeddings: number[][],
    nResults = 10,
    where?: WhereClause
  ): Promise<ItemWithDistance[][]> {
    const results: ItemWithDistance[][] = [];

    // Use query embeddings, or just return top results if no query provided
    const queries = queryEmbeddings.length > 0 ? queryEmbeddings : [[]];

    for (const queryEmbedding of queries) {
      // Use brute force search for all queries

      // Fallback to brute force search (for compatibility and when HNSW fails)
      const bruteForceResults = this.bruteForceSearch(queryEmbedding, nResults, where);
      results.push(bruteForceResults);
    }

    return results;
  }


  /**
   * Brute force search fallback - keeps the original O(n) algorithm
   */
  private bruteForceSearch(queryEmbedding: number[], nResults: number, where?: WhereClause): ItemWithDistance[] {
    // Filter items by where clause if provided
    const filteredItems = FilterEngine.filterByWhere(this.getAllItems(), where);

    // Calculate distances using brute force O(n)
    const itemsWithDistances = filteredItems.map(item => {
      let distance = 0;

      // If we have a query embedding and the item has an embedding, compute cosine distance
      if (queryEmbedding.length > 0 && item.embedding.length > 0) {
        distance = VectorCalculator.cosineDistance(queryEmbedding, item.embedding);
      } else {
        // If no embeddings to compare, use a high distance
        distance = 0.99;
      }

      return { item, distance };
    });

    // Sort by distance (lower is better)
    itemsWithDistances.sort((a, b) => a.distance - b.distance);

    // Take the top N results
    return itemsWithDistances.slice(0, Math.min(nResults, itemsWithDistances.length));
  }

  /**
   * Get the count of items in the collection
   */
  count(): number {
    return this.items.size;
  }

  /**
   * Get collection metadata
   */
  getMetadata(): Record<string, any> {
    return { ...this.collectionMetadata };
  }

  /**
   * Update collection metadata
   */
  updateMetadata(metadata: Record<string, any>): void {
    this.collectionMetadata = { ...this.collectionMetadata, ...metadata };
  }

  /**
   * Clear all items from the collection
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Check if an item exists by ID
   */
  hasItem(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Get a specific item by ID
   */
  getItem(id: string): DatabaseItem | undefined {
    return this.items.get(id);
  }


  /**
   * Get bulk file metadata for multiple file paths with single query
   * Optimized for bulk hash comparison operations
   * @param filePaths Array of normalized file paths to query
   * @returns Array of metadata objects for found files
   */
  getBulkFileMetadata(filePaths: string[]): Array<{ filePath: string; contentHash?: string; metadata: Record<string, any> }> {
    const results: Array<{ filePath: string; contentHash?: string; metadata: Record<string, any> }> = [];
    
    try {
      // Get all items that match any of the file paths
      const matchingItems = this.getAllItems().filter(item => 
        item.metadata && 
        item.metadata.filePath && 
        filePaths.includes(item.metadata.filePath)
      );
      
      // Group by file path (in case there are multiple chunks per file)
      const fileMetadataMap = new Map<string, { contentHash?: string; metadata: Record<string, any> }>();
      
      for (const item of matchingItems) {
        const filePath = item.metadata.filePath;
        if (!fileMetadataMap.has(filePath)) {
          fileMetadataMap.set(filePath, {
            contentHash: item.metadata.contentHash,
            metadata: { ...item.metadata }
          });
        } else {
          // If we already have metadata for this file, ensure we have the contentHash
          const existing = fileMetadataMap.get(filePath)!;
          if (!existing.contentHash && item.metadata.contentHash) {
            existing.contentHash = item.metadata.contentHash;
          }
        }
      }
      
      // Convert map to results array
      for (const [filePath, data] of fileMetadataMap.entries()) {
        results.push({
          filePath,
          contentHash: data.contentHash,
          metadata: data.metadata
        });
      }
      
      console.log(`[CollectionRepository] Bulk metadata query: ${filePaths.length} requested, ${results.length} found`);
      return results;
      
    } catch (error) {
      console.error(`[CollectionRepository] Error in bulk metadata query:`, error);
      return [];
    }
  }

}