/**
 * CollectionRepository - Manages in-memory collection data operations
 * CONSOLIDATED: Now includes SizeCalculatorService functionality for storage analysis
 * Applies Single Responsibility Principle by focusing only on data management
 * Uses ChromaDB for semantic search and vector operations
 * Enhanced with comprehensive storage size calculation and optimization features
 */

import { FilterEngine, DatabaseItem, WhereClause } from './FilterEngine';
import type { StorageEfficiency, ICollectionManager } from '../types/ChromaTypes';

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
  // CONSOLIDATED: SizeCalculatorService dependencies
  private persistenceManager?: any; // For directory operations
  private collectionManager?: ICollectionManager; // For multi-collection operations

  constructor(
    metadata: Record<string, any> = {}, 
    collectionName = 'default', 
    persistentPath?: string,
    persistenceManager?: any,
    collectionManager?: ICollectionManager
  ) {
    this.items = new Map();
    this.collectionMetadata = {
      ...metadata,
      createdAt: metadata.createdAt || new Date().toISOString()
    };
    this.collectionName = collectionName;
    this.persistentPath = persistentPath;
    this.persistenceManager = persistenceManager;
    this.collectionManager = collectionManager;
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
   * Load selected items for contextual embedding loading
   * Only loads embeddings for specific file paths to reduce memory usage
   * @param filePaths Array of file paths to load embeddings for
   * @param fullData Complete collection data to filter from
   */
  loadSelectedItems(filePaths: string[], fullData: CollectionData): void {
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    let itemsLoaded = 0;
    let totalEmbeddingSize = 0;
    const filePathSet = new Set(filePaths); // For O(1) lookup
    
    const totalAvailable = fullData.items instanceof Map ? fullData.items.size : 
                          (Array.isArray(fullData.items) ? (fullData.items as DatabaseItem[]).length : 0);
    
    console.log(`[CollectionRepository:${this.collectionName}] Loading selected items:`, {
      requestedFiles: filePaths.length,
      totalAvailableItems: totalAvailable,
      memoryPressure: this.getMemoryPressureLevel()
    });
    
    try {
      // Clear existing items for selective loading
      this.items.clear();
      
      // Load items from Map or array format, filtering by file paths
      if (fullData.items instanceof Map) {
        for (const [id, item] of Array.from(fullData.items)) {
          if (item.metadata?.filePath && filePathSet.has(item.metadata.filePath)) {
            this.items.set(id, item);
            itemsLoaded++;
            if (item.embedding && Array.isArray(item.embedding)) {
              totalEmbeddingSize += item.embedding.length * 8; // 8 bytes per float64
            }
          }
        }
      } else if (Array.isArray(fullData.items)) {
        // Handle array format for backward compatibility
        for (const item of fullData.items as DatabaseItem[]) {
          if (item?.id && item.metadata?.filePath && filePathSet.has(item.metadata.filePath)) {
            const processedItem = {
              id: item.id,
              embedding: item.embedding || [],
              metadata: item.metadata || {},
              document: item.document || ''
            };
            this.items.set(item.id, processedItem);
            itemsLoaded++;
            if (processedItem.embedding && Array.isArray(processedItem.embedding)) {
              totalEmbeddingSize += processedItem.embedding.length * 8;
            }
          }
        }
      }

      // Update metadata
      if (fullData.metadata) {
        this.collectionMetadata = { ...fullData.metadata };
      }

      const endTime = performance.now();
      const finalMemory = this.getMemoryUsage();
      const loadTime = endTime - startTime;
      const memoryDelta = finalMemory - initialMemory;

      console.log(`[CollectionRepository:${this.collectionName}] Selective load complete:`, {
        itemsLoaded,
        requestedFiles: filePaths.length,
        loadTimeMs: Math.round(loadTime),
        estimatedEmbeddingSizeMB: Math.round(totalEmbeddingSize / 1024 / 1024 * 100) / 100,
        memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024 * 100) / 100,
        totalItems: this.items.size,
        memoryReductionPercent: fullData.items instanceof Map ? 
          Math.round((1 - (this.items.size / fullData.items.size)) * 100) : 0,
        memoryPressure: this.getMemoryPressureLevel()
      });

      // Warn if selective loading used significant memory
      if (memoryDelta > 100 * 1024 * 1024) { // > 100MB
        console.warn(`[CollectionRepository:${this.collectionName}] HIGH SELECTIVE MEMORY USAGE: ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }

    } catch (error) {
      console.error(`[CollectionRepository:${this.collectionName}] Error during selective loading:`, error);
      // Keep any items that were successfully loaded
    }
  }

  /**
   * Load collection data from persistence (full loading - original method)
   */
  loadCollectionData(data: CollectionData): void {
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    this.items.clear();
    
    let itemsLoaded = 0;
    let totalEmbeddingSize = 0;
    
    // Load items from Map or array format
    if (data.items instanceof Map) {
      for (const [id, item] of Array.from(data.items)) {
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
        distance = FilterEngine.cosineDistance(queryEmbedding, item.embedding);
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
      for (const [filePath, data] of Array.from(fileMetadataMap.entries())) {
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
   * Get all available file paths in the collection without loading full data
   * Used for discovering files available for contextual loading
   * @param fullData Complete collection data to extract file paths from
   * @returns Array of unique file paths
   */
  getAvailableFilePaths(fullData: CollectionData): string[] {
    const filePaths = new Set<string>();
    
    try {
      // Extract file paths from items without loading full embeddings
      if (fullData.items instanceof Map) {
        for (const [, item] of Array.from(fullData.items)) {
          if (item.metadata?.filePath) {
            filePaths.add(item.metadata.filePath);
          }
        }
      } else if (Array.isArray(fullData.items)) {
        for (const item of fullData.items as DatabaseItem[]) {
          if (item?.metadata?.filePath) {
            filePaths.add(item.metadata.filePath);
          }
        }
      }

      const pathArray = Array.from(filePaths);
      console.log(`[CollectionRepository:${this.collectionName}] Found ${pathArray.length} unique file paths`);
      
      return pathArray;

    } catch (error) {
      console.error(`[CollectionRepository:${this.collectionName}] Error extracting file paths:`, error);
      return [];
    }
  }

  /**
   * Check if embeddings exist for specific file paths without loading them
   * @param filePaths Array of file paths to check
   * @param fullData Complete collection data to check against
   * @returns Object mapping file paths to boolean (exists or not)
   */
  checkFilePathsExist(filePaths: string[], fullData: CollectionData): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const availablePaths = new Set(this.getAvailableFilePaths(fullData));
    
    for (const filePath of filePaths) {
      result[filePath] = availablePaths.has(filePath);
    }
    
    return result;
  }

  /**
   * Get collection metadata for contextual loading decisions
   * @param fullData Complete collection data
   * @returns Lightweight metadata for loading decisions
   */
  getContextualLoadingMetadata(fullData: CollectionData): {
    totalItems: number;
    uniqueFiles: number;
    estimatedSizeMB: number;
    oldestItem?: number;
    newestItem?: number;
  } {
    let totalItems = 0;
    let totalEmbeddingSize = 0;
    let oldestTime = Date.now();
    let newestTime = 0;
    const filePaths = new Set<string>();

    try {
      if (fullData.items instanceof Map) {
        totalItems = fullData.items.size;
        for (const [, item] of Array.from(fullData.items)) {
          if (item.metadata?.filePath) {
            filePaths.add(item.metadata.filePath);
          }
          if (item.embedding && Array.isArray(item.embedding)) {
            totalEmbeddingSize += item.embedding.length * 8;
          }
          if (item.metadata?.timestamp) {
            const timestamp = Number(item.metadata.timestamp);
            oldestTime = Math.min(oldestTime, timestamp);
            newestTime = Math.max(newestTime, timestamp);
          }
        }
      } else if (Array.isArray(fullData.items)) {
        const itemsArray = fullData.items as DatabaseItem[];
        totalItems = itemsArray.length;
        for (const item of itemsArray) {
          if (item?.metadata?.filePath) {
            filePaths.add(item.metadata.filePath);
          }
          if (item?.embedding && Array.isArray(item.embedding)) {
            totalEmbeddingSize += item.embedding.length * 8;
          }
          if (item?.metadata?.timestamp) {
            const timestamp = Number(item.metadata.timestamp);
            oldestTime = Math.min(oldestTime, timestamp);
            newestTime = Math.max(newestTime, timestamp);
          }
        }
      }

      return {
        totalItems,
        uniqueFiles: filePaths.size,
        estimatedSizeMB: Math.round(totalEmbeddingSize / 1024 / 1024 * 100) / 100,
        oldestItem: newestTime > 0 ? oldestTime : undefined,
        newestItem: newestTime > 0 ? newestTime : undefined
      };

    } catch (error) {
      console.error(`[CollectionRepository:${this.collectionName}] Error getting contextual metadata:`, error);
      return {
        totalItems: 0,
        uniqueFiles: 0,
        estimatedSizeMB: 0
      };
    }
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

  // ============================================================================
  // SIZE CALCULATOR SERVICE FUNCTIONALITY (CONSOLIDATED)
  // ============================================================================

  /**
   * Calculate the total database size in MB
   */
  async calculateTotalDatabaseSize(): Promise<number> {
    if (!this.persistentPath || !this.persistenceManager) {
      return 0;
    }

    try {
      if (!(await this.persistenceManager.directoryExists(this.persistentPath))) {
        return 0;
      }

      return await this.persistenceManager.calculateDirectorySize(this.persistentPath);
    } catch (error) {
      console.error('[CollectionRepository] Error calculating total database size:', error);
      return 0;
    }
  }

  /**
   * Calculate the size of memory-related collections only
   */
  async calculateMemoryDatabaseSize(): Promise<number> {
    if (!this.persistentPath || !this.persistenceManager) {
      return 0;
    }

    try {
      // Use simple string concatenation to avoid path duplication in Electron environment
      const collectionsDir = `${this.persistentPath}/collections`;
      
      if (!(await this.persistenceManager.directoryExists(collectionsDir))) {
        return 0;
      }

      return await this.persistenceManager.calculateMemoryCollectionsSize(collectionsDir);
    } catch (error) {
      console.error('[CollectionRepository] Error calculating memory database size:', error);
      return 0;
    }
  }

  /**
   * Calculate the size of a specific collection
   */
  async calculateCollectionSize(collectionName: string): Promise<number> {
    if (!this.persistentPath || !this.persistenceManager) {
      return 0;
    }

    try {
      // Use simple string concatenation to avoid path duplication in Electron environment
      const collectionsDir = `${this.persistentPath}/collections`;
      
      return await this.persistenceManager.calculateCollectionSize(collectionsDir, collectionName);
    } catch (error) {
      console.error(`[CollectionRepository] Error calculating size for collection ${collectionName}:`, error);
      return 0;
    }
  }

  /**
   * Get storage usage breakdown by collection
   */
  async getStorageBreakdown(): Promise<Record<string, number>> {
    if (!this.persistentPath || !this.persistenceManager) {
      return {};
    }

    try {
      // Use simple string concatenation to avoid path duplication in Electron environment
      const collectionsDir = `${this.persistentPath}/collections`;
      
      if (!(await this.persistenceManager.directoryExists(collectionsDir))) {
        return {};
      }

      return await this.persistenceManager.getCollectionSizeBreakdown(collectionsDir);
    } catch (error) {
      console.error('[CollectionRepository] Error getting storage breakdown:', error);
      return {};
    }
  }

  /**
   * Check if database size exceeds a threshold
   */
  async exceedsThreshold(thresholdMB: number): Promise<boolean> {
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      return totalSize > thresholdMB;
    } catch (error) {
      console.error('[CollectionRepository] Error checking size threshold:', error);
      return false;
    }
  }

  /**
   * Get storage efficiency metrics
   */
  async getStorageEfficiency(): Promise<StorageEfficiency> {
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const itemCount = await this.getTotalItemCount();
      const averageItemSize = itemCount > 0 ? totalSize / itemCount : 0;
      
      // Calculate compression ratio (compared to theoretical uncompressed size)
      // This is a rough estimate based on average embedding size
      const estimatedUncompressedSize = itemCount * 0.01; // Assume 10KB per item uncompressed
      const compression = estimatedUncompressedSize > 0 ? totalSize / estimatedUncompressedSize : 1;

      return {
        totalSize,
        itemCount,
        averageItemSize,
        compression
      };
    } catch (error) {
      console.error('[CollectionRepository] Error calculating storage efficiency:', error);
      return {
        totalSize: 0,
        itemCount: 0,
        averageItemSize: 0,
        compression: 1
      };
    }
  }

  /**
   * Get size trend over time (if we have historical data)
   */
  async getSizeTrend(days = 7): Promise<Record<string, number>> {
    // This would require historical tracking, for now return current size
    const currentSize = await this.calculateTotalDatabaseSize();
    const today = new Date().toISOString().split('T')[0];
    
    return {
      [today]: currentSize
    };
  }

  /**
   * Get collection size ranking
   */
  async getCollectionSizeRanking(): Promise<Array<{ name: string; size: number; percentage: number }>> {
    try {
      const breakdown = await this.getStorageBreakdown();
      const totalSize = Object.values(breakdown).reduce((sum, size) => sum + size, 0);
      
      const ranking = Object.entries(breakdown)
        .map(([name, size]) => ({
          name,
          size,
          percentage: totalSize > 0 ? (size / totalSize) * 100 : 0
        }))
        .sort((a, b) => b.size - a.size);

      return ranking;
    } catch (error) {
      console.error('[CollectionRepository] Error getting collection size ranking:', error);
      return [];
    }
  }

  /**
   * Estimate storage growth rate
   */
  async estimateGrowthRate(): Promise<{
    dailyGrowth: number;
    weeklyGrowth: number;
    monthlyGrowth: number;
  }> {
    // This would require historical tracking
    // For now, return zero growth estimates
    return {
      dailyGrowth: 0,
      weeklyGrowth: 0,
      monthlyGrowth: 0
    };
  }

  /**
   * Get storage optimization suggestions
   */
  async getOptimizationSuggestions(): Promise<string[]> {
    const suggestions: string[] = [];
    
    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const breakdown = await this.getStorageBreakdown();
      const ranking = await this.getCollectionSizeRanking();

      // Size-based suggestions
      if (totalSize > 1000) { // > 1GB
        suggestions.push('Consider archiving old data to reduce database size');
      }

      if (totalSize > 500) { // > 500MB
        suggestions.push('Consider implementing data pruning strategies');
      }

      // Collection-based suggestions
      if (ranking.length > 0) {
        const largestCollection = ranking[0];
        if (largestCollection.percentage > 70) {
          suggestions.push(`Collection '${largestCollection.name}' takes up ${largestCollection.percentage.toFixed(1)}% of storage - consider optimization`);
        }
      }

      // Check for empty or very small collections
      const emptyCollections = ranking.filter(c => c.size < 0.01); // < 10KB
      if (emptyCollections.length > 0) {
        suggestions.push(`Found ${emptyCollections.length} nearly empty collections that could be cleaned up`);
      }

      // Memory-specific suggestions
      const memorySize = await this.calculateMemoryDatabaseSize();
      const memoryPercentage = totalSize > 0 ? (memorySize / totalSize) * 100 : 0;
      
      if (memoryPercentage > 50) {
        suggestions.push('Memory traces and sessions take up significant space - consider implementing retention policies');
      }

    } catch (error) {
      console.error('[CollectionRepository] Error generating optimization suggestions:', error);
      suggestions.push('Unable to analyze storage for optimization suggestions');
    }

    return suggestions;
  }

  /**
   * Get total item count across all collections
   */
  private async getTotalItemCount(): Promise<number> {
    if (!this.collectionManager) {
      // If no collection manager, return count of this collection only
      return this.count();
    }

    try {
      const collections = await this.collectionManager.listCollections();
      let totalCount = 0;

      for (const collectionName of collections) {
        try {
          const collection = await this.collectionManager.ensureCollection(collectionName);
          const count = await collection.count();
          totalCount += count;
        } catch (error) {
          // Continue with other collections if one fails
          console.warn(`[CollectionRepository] Failed to count items in collection ${collectionName}:`, error);
        }
      }

      return totalCount;
    } catch (error) {
      console.error('[CollectionRepository] Error getting total item count:', error);
      return this.count(); // Fallback to current collection count
    }
  }

  /**
   * Check if storage needs maintenance
   */
  async needsMaintenance(): Promise<{
    needsMaintenance: boolean;
    reasons: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    try {
      const totalSize = await this.calculateTotalDatabaseSize();
      const efficiency = await this.getStorageEfficiency();

      // Size checks
      if (totalSize > 2000) { // > 2GB
        reasons.push('Database size exceeds 2GB');
        severity = 'high';
      } else if (totalSize > 1000) { // > 1GB
        reasons.push('Database size exceeds 1GB');
        severity = severity === 'low' ? 'medium' : severity;
      }

      // Efficiency checks
      if (efficiency.compression > 2) {
        reasons.push('Storage compression ratio suggests inefficient storage');
        severity = severity === 'low' ? 'medium' : severity;
      }

      // Item distribution checks
      const ranking = await this.getCollectionSizeRanking();
      if (ranking.length > 0 && ranking[0].percentage > 90) {
        reasons.push('Single collection dominates storage (>90%)');
        severity = severity === 'low' ? 'medium' : severity;
      }

    } catch (error) {
      reasons.push('Unable to analyze storage health');
      severity = 'medium';
    }

    return {
      needsMaintenance: reasons.length > 0,
      reasons,
      severity
    };
  }

}