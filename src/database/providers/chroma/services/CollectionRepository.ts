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
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    this.items.clear();
    
    let itemsLoaded = 0;
    let totalEmbeddingSize = 0;
    
    // Load items from Map or array format
    if (data.items instanceof Map) {
      for (const [id, item] of data.items) {
        this.items.set(id, item);
        itemsLoaded++;
        if (item.embedding) {
          totalEmbeddingSize += item.embedding.length * 8; // 8 bytes per float64
        }
      }
    } else if (Array.isArray(data.items)) {
      // Handle array format for backward compatibility
      for (const item of data.items as DatabaseItem[]) {
        if (item && item.id) {
          const processedItem = {
            id: item.id,
            embedding: item.embedding || [],
            metadata: item.metadata || {},
            document: item.document || ''
          };
          this.items.set(item.id, processedItem);
          itemsLoaded++;
          if (processedItem.embedding) {
            totalEmbeddingSize += processedItem.embedding.length * 8;
          }
        }
      }
    }

    if (data.metadata) {
      this.collectionMetadata = { ...data.metadata };
    }

    const endTime = performance.now();
    const finalMemory = this.getMemoryUsage();
    const loadTime = endTime - startTime;
    const memoryDelta = finalMemory - initialMemory;

    console.log(`[CollectionRepository:${this.collectionName}] Load complete:`, {
      itemsLoaded,
      loadTimeMs: Math.round(loadTime),
      estimatedEmbeddingSizeMB: Math.round(totalEmbeddingSize / 1024 / 1024 * 100) / 100,
      memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024 * 100) / 100,
      totalItems: this.items.size,
      memoryPressure: this.getMemoryPressureLevel()
    });

    // Warn if memory usage is concerning
    if (memoryDelta > 500 * 1024 * 1024) { // > 500MB
      console.warn(`[CollectionRepository:${this.collectionName}] HIGH MEMORY USAGE: Collection loaded ${Math.round(memoryDelta / 1024 / 1024)}MB`);
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
   * Query items with vector similarity using cosine distance
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
      const searchResults = this.vectorSearch(queryEmbedding, nResults, where);
      results.push(searchResults);
    }

    return results;
  }


  /**
   * Vector similarity search using cosine distance
   */
  private vectorSearch(queryEmbedding: number[], nResults: number, where?: WhereClause): ItemWithDistance[] {
    // Filter items by where clause if provided
    const filteredItems = FilterEngine.filterByWhere(this.getAllItems(), where);

    // Calculate cosine distances for all items
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
    const startTime = performance.now();
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

      const queryTime = performance.now() - startTime;
      console.log(`[CollectionRepository:${this.collectionName}] Bulk metadata query:`, {
        requested: filePaths.length,
        found: results.length,
        queryTimeMs: Math.round(queryTime * 100) / 100,
        totalItems: this.items.size,
        memoryPressure: this.getMemoryPressureLevel()
      });
      
      return results;
      
    } catch (error) {
      console.error(`[CollectionRepository:${this.collectionName}] Error in bulk metadata query:`, error);
      return [];
    }
  }

  /**
   * Get current memory usage in bytes (browser API)
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Get memory pressure level for diagnostics
   */
  private getMemoryPressureLevel(): string {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      if (!memory) return 'unknown';
      
      const used = memory.usedJSHeapSize || 0;
      const limit = memory.jsHeapSizeLimit || 0;
      
      if (limit === 0) return 'unknown';
      
      const percentage = (used / limit) * 100;
      if (percentage > 90) return 'critical';
      if (percentage > 75) return 'high';
      if (percentage > 50) return 'moderate';
      return 'low';
    }
    return 'unknown';
  }

  /**
   * Get detailed memory and collection statistics for diagnostics
   */
  getDiagnosticInfo(): {
    collectionName: string;
    itemCount: number;
    estimatedSizeMB: number;
    memoryUsageMB: number;
    memoryPressure: string;
    largestEmbeddingDim: number;
    averageEmbeddingDim: number;
  } {
    const items = this.getAllItems();
    let totalEmbeddingSize = 0;
    let largestEmbeddingDim = 0;
    let totalEmbeddingDims = 0;
    let embeddingCount = 0;

    for (const item of items) {
      if (item.embedding && item.embedding.length > 0) {
        const embeddingSize = item.embedding.length * 8; // 8 bytes per float64
        totalEmbeddingSize += embeddingSize;
        largestEmbeddingDim = Math.max(largestEmbeddingDim, item.embedding.length);
        totalEmbeddingDims += item.embedding.length;
        embeddingCount++;
      }
    }

    const memoryUsage = this.getMemoryUsage();

    return {
      collectionName: this.collectionName,
      itemCount: items.length,
      estimatedSizeMB: Math.round(totalEmbeddingSize / 1024 / 1024 * 100) / 100,
      memoryUsageMB: Math.round(memoryUsage / 1024 / 1024 * 100) / 100,
      memoryPressure: this.getMemoryPressureLevel(),
      largestEmbeddingDim: largestEmbeddingDim,
      averageEmbeddingDim: embeddingCount > 0 ? Math.round(totalEmbeddingDims / embeddingCount) : 0
    };
  }

}