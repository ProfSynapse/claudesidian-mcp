/**
 * HnswIndexStatisticsService - Handles HNSW index statistics and memory usage calculations
 * Follows Single Responsibility Principle by focusing only on statistics and metrics
 */

import { logger } from '../../../../utils/logger';
import { HnswPartitionManager, HnswIndex, PartitionedHnswIndex } from '../partitioning/HnswPartitionManager';

export interface IndexStatistics {
  collectionName: string;
  indexType: 'single' | 'partitioned';
  totalItems: number;
  dimension: number;
  partitionCount?: number;
  loadBalance?: number;
  memoryUsage?: {
    totalIndexes: number;
    totalPartitions: number;
  };
  performance?: {
    averageSearchTime?: number;
    indexBuildTime?: number;
    lastUpdated?: number;
  };
}

export interface MemoryStatistics {
  totalIndexes: number;
  totalItems: number;
  totalPartitions: number;
  singleIndexCount: number;
  partitionedIndexCount: number;
  estimatedMemoryUsage?: number;
  collections?: {
    [collectionName: string]: {
      type: 'single' | 'partitioned';
      items: number;
      partitions?: number;
      memoryEstimate: number;
    };
  };
}

export interface PerformanceMetrics {
  collectionName: string;
  indexType: 'single' | 'partitioned';
  searchMetrics: {
    averageSearchTime: number;
    totalSearches: number;
    lastSearchTime: number;
  };
  buildMetrics: {
    buildTime: number;
    lastBuildTime: number;
    rebuildCount: number;
  };
  operationMetrics: {
    itemsAdded: number;
    itemsRemoved: number;
    itemsUpdated: number;
    lastOperationTime: number;
  };
}

export class HnswIndexStatisticsService {
  private partitionManager: HnswPartitionManager;
  private performanceMetrics = new Map<string, PerformanceMetrics>();

  constructor(partitionManager: HnswPartitionManager) {
    this.partitionManager = partitionManager;
  }

  /**
   * Get index statistics for a collection
   * @param collectionName Collection name
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns Index statistics or null
   */
  getIndexStatistics(
    collectionName: string,
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): IndexStatistics | null {
    if (partitionedIndex) {
      return this.getPartitionedIndexStatistics(collectionName, partitionedIndex);
    }

    if (singleIndex) {
      return this.getSingleIndexStatistics(collectionName, singleIndex);
    }

    return null;
  }

  /**
   * Get statistics for a partitioned index
   * @param collectionName Collection name
   * @param partitionedIndex Partitioned index
   * @returns Partitioned index statistics
   */
  private getPartitionedIndexStatistics(
    collectionName: string,
    partitionedIndex: PartitionedHnswIndex
  ): IndexStatistics {
    const stats = this.partitionManager.getPartitionStatistics(partitionedIndex);
    const performanceMetrics = this.performanceMetrics.get(collectionName);

    return {
      collectionName,
      indexType: 'partitioned',
      totalItems: stats.totalItems,
      dimension: partitionedIndex.dimension,
      partitionCount: stats.partitionCount,
      loadBalance: stats.loadBalance,
      memoryUsage: {
        totalIndexes: 1,
        totalPartitions: stats.partitionCount,
      },
      performance: performanceMetrics ? {
        averageSearchTime: performanceMetrics.searchMetrics.averageSearchTime,
        indexBuildTime: performanceMetrics.buildMetrics.buildTime,
        lastUpdated: performanceMetrics.operationMetrics.lastOperationTime,
      } : undefined,
    };
  }

  /**
   * Get statistics for a single index
   * @param collectionName Collection name
   * @param singleIndex Single index
   * @returns Single index statistics
   */
  private getSingleIndexStatistics(
    collectionName: string,
    singleIndex: HnswIndex
  ): IndexStatistics {
    const performanceMetrics = this.performanceMetrics.get(collectionName);

    return {
      collectionName,
      indexType: 'single',
      totalItems: singleIndex.idToItem.size,
      dimension: singleIndex.index.getNumDimensions(),
      memoryUsage: {
        totalIndexes: 1,
        totalPartitions: 0,
      },
      performance: performanceMetrics ? {
        averageSearchTime: performanceMetrics.searchMetrics.averageSearchTime,
        indexBuildTime: performanceMetrics.buildMetrics.buildTime,
        lastUpdated: performanceMetrics.operationMetrics.lastOperationTime,
      } : undefined,
    };
  }

  /**
   * Get memory usage statistics across all indexes
   * @param singleIndexes Map of single indexes
   * @param partitionedIndexes Map of partitioned indexes
   * @returns Memory usage statistics
   */
  getMemoryStatistics(
    singleIndexes: Map<string, HnswIndex>,
    partitionedIndexes: Map<string, PartitionedHnswIndex>
  ): MemoryStatistics {
    let totalItems = 0;
    let totalPartitions = 0;
    let estimatedMemoryUsage = 0;
    const collections: { [key: string]: any } = {};

    // Count single indexes
    for (const [collectionName, singleIndex] of singleIndexes.entries()) {
      const itemCount = singleIndex.idToItem.size;
      const dimension = singleIndex.index.getNumDimensions();
      const memoryEstimate = this.estimateIndexMemoryUsage(itemCount, dimension, 'single');
      
      totalItems += itemCount;
      estimatedMemoryUsage += memoryEstimate;
      
      collections[collectionName] = {
        type: 'single',
        items: itemCount,
        memoryEstimate,
      };
    }

    // Count partitioned indexes
    for (const [collectionName, partitionedIndex] of partitionedIndexes.entries()) {
      const partitionCount = partitionedIndex.partitions.length;
      let partitionItemCount = 0;
      
      for (const partition of partitionedIndex.partitions) {
        partitionItemCount += partition.idToItem.size;
      }
      
      const memoryEstimate = this.estimateIndexMemoryUsage(
        partitionItemCount, 
        partitionedIndex.dimension, 
        'partitioned', 
        partitionCount
      );
      
      totalPartitions += partitionCount;
      totalItems += partitionItemCount;
      estimatedMemoryUsage += memoryEstimate;
      
      collections[collectionName] = {
        type: 'partitioned',
        items: partitionItemCount,
        partitions: partitionCount,
        memoryEstimate,
      };
    }

    return {
      totalIndexes: singleIndexes.size + partitionedIndexes.size,
      totalItems,
      totalPartitions,
      singleIndexCount: singleIndexes.size,
      partitionedIndexCount: partitionedIndexes.size,
      estimatedMemoryUsage,
      collections,
    };
  }

  /**
   * Get detailed performance metrics for a collection
   * @param collectionName Collection name
   * @returns Performance metrics or null
   */
  getPerformanceMetrics(collectionName: string): PerformanceMetrics | null {
    return this.performanceMetrics.get(collectionName) || null;
  }

  /**
   * Record search performance metrics
   * @param collectionName Collection name
   * @param searchTime Search time in milliseconds
   * @param indexType Index type used
   */
  recordSearchMetrics(collectionName: string, searchTime: number, indexType: 'single' | 'partitioned'): void {
    const existing = this.performanceMetrics.get(collectionName);
    
    if (existing) {
      const totalSearches = existing.searchMetrics.totalSearches + 1;
      const totalTime = existing.searchMetrics.averageSearchTime * existing.searchMetrics.totalSearches + searchTime;
      
      existing.searchMetrics = {
        averageSearchTime: totalTime / totalSearches,
        totalSearches,
        lastSearchTime: Date.now(),
      };
    } else {
      this.performanceMetrics.set(collectionName, {
        collectionName,
        indexType,
        searchMetrics: {
          averageSearchTime: searchTime,
          totalSearches: 1,
          lastSearchTime: Date.now(),
        },
        buildMetrics: {
          buildTime: 0,
          lastBuildTime: 0,
          rebuildCount: 0,
        },
        operationMetrics: {
          itemsAdded: 0,
          itemsRemoved: 0,
          itemsUpdated: 0,
          lastOperationTime: 0,
        },
      });
    }
  }

  /**
   * Record index build performance metrics
   * @param collectionName Collection name
   * @param buildTime Build time in milliseconds
   * @param indexType Index type built
   * @param isRebuild Whether this was a rebuild
   */
  recordBuildMetrics(
    collectionName: string, 
    buildTime: number, 
    indexType: 'single' | 'partitioned',
    isRebuild: boolean = false
  ): void {
    const existing = this.performanceMetrics.get(collectionName);
    
    if (existing) {
      existing.buildMetrics = {
        buildTime,
        lastBuildTime: Date.now(),
        rebuildCount: existing.buildMetrics.rebuildCount + (isRebuild ? 1 : 0),
      };
    } else {
      this.performanceMetrics.set(collectionName, {
        collectionName,
        indexType,
        searchMetrics: {
          averageSearchTime: 0,
          totalSearches: 0,
          lastSearchTime: 0,
        },
        buildMetrics: {
          buildTime,
          lastBuildTime: Date.now(),
          rebuildCount: isRebuild ? 1 : 0,
        },
        operationMetrics: {
          itemsAdded: 0,
          itemsRemoved: 0,
          itemsUpdated: 0,
          lastOperationTime: 0,
        },
      });
    }
  }

  /**
   * Record operation metrics (add, remove, update)
   * @param collectionName Collection name
   * @param operation Operation type
   * @param itemCount Number of items affected
   */
  recordOperationMetrics(
    collectionName: string, 
    operation: 'add' | 'remove' | 'update',
    itemCount: number
  ): void {
    const existing = this.performanceMetrics.get(collectionName);
    
    if (existing) {
      switch (operation) {
        case 'add':
          existing.operationMetrics.itemsAdded += itemCount;
          break;
        case 'remove':
          existing.operationMetrics.itemsRemoved += itemCount;
          break;
        case 'update':
          existing.operationMetrics.itemsUpdated += itemCount;
          break;
      }
      existing.operationMetrics.lastOperationTime = Date.now();
    }
  }

  /**
   * Get aggregated statistics across all collections
   * @param singleIndexes Map of single indexes
   * @param partitionedIndexes Map of partitioned indexes
   * @returns Aggregated statistics
   */
  getAggregatedStatistics(
    singleIndexes: Map<string, HnswIndex>,
    partitionedIndexes: Map<string, PartitionedHnswIndex>
  ): {
    totalCollections: number;
    totalItems: number;
    averageItemsPerCollection: number;
    memoryUsage: MemoryStatistics;
    performanceSummary: {
      averageSearchTime: number;
      totalSearches: number;
      averageBuildTime: number;
    };
  } {
    const memoryUsage = this.getMemoryStatistics(singleIndexes, partitionedIndexes);
    const totalCollections = singleIndexes.size + partitionedIndexes.size;
    
    let totalSearchTime = 0;
    let totalSearches = 0;
    let totalBuildTime = 0;
    let buildCount = 0;
    
    for (const metrics of this.performanceMetrics.values()) {
      totalSearchTime += metrics.searchMetrics.averageSearchTime * metrics.searchMetrics.totalSearches;
      totalSearches += metrics.searchMetrics.totalSearches;
      totalBuildTime += metrics.buildMetrics.buildTime;
      buildCount += 1;
    }
    
    return {
      totalCollections,
      totalItems: memoryUsage.totalItems,
      averageItemsPerCollection: totalCollections > 0 ? memoryUsage.totalItems / totalCollections : 0,
      memoryUsage,
      performanceSummary: {
        averageSearchTime: totalSearches > 0 ? totalSearchTime / totalSearches : 0,
        totalSearches,
        averageBuildTime: buildCount > 0 ? totalBuildTime / buildCount : 0,
      },
    };
  }

  /**
   * Estimate memory usage for an index
   * @param itemCount Number of items
   * @param dimension Embedding dimension
   * @param indexType Index type
   * @param partitionCount Number of partitions (for partitioned indexes)
   * @returns Estimated memory usage in bytes
   */
  private estimateIndexMemoryUsage(
    itemCount: number,
    dimension: number,
    indexType: 'single' | 'partitioned',
    partitionCount?: number
  ): number {
    // Base memory per item (embedding + metadata)
    const baseMemoryPerItem = dimension * 4 + 100; // 4 bytes per float + metadata overhead
    
    // HNSW graph overhead (connections, levels)
    const graphOverheadPerItem = 50; // Estimated overhead for HNSW graph structure
    
    // Partitioning overhead
    const partitioningOverhead = indexType === 'partitioned' && partitionCount ? 
      partitionCount * 1000 : 0; // 1KB per partition overhead
    
    return itemCount * (baseMemoryPerItem + graphOverheadPerItem) + partitioningOverhead;
  }

  /**
   * Clear performance metrics for a collection
   * @param collectionName Collection name
   */
  clearPerformanceMetrics(collectionName: string): void {
    this.performanceMetrics.delete(collectionName);
  }

  /**
   * Clear all performance metrics
   */
  clearAllPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }

  /**
   * Export performance metrics for analysis
   * @returns Exported metrics data
   */
  exportPerformanceMetrics(): { [collectionName: string]: PerformanceMetrics } {
    const exported: { [collectionName: string]: PerformanceMetrics } = {};
    
    for (const [collectionName, metrics] of this.performanceMetrics.entries()) {
      exported[collectionName] = { ...metrics };
    }
    
    return exported;
  }
}