/**
 * HnswPartitionManager - Handles HNSW index partitioning logic
 * Follows Single Responsibility Principle by focusing only on partitioning
 * Enables different partitioning strategies and optimizations
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';

export interface HnswIndex {
  index: any; // HNSW index from hnswlib-wasm
  idToItem: Map<number, DatabaseItem>;
  itemIdToHnswId: Map<string, number>;
  nextId: number;
}

export interface PartitionedHnswIndex {
  partitions: HnswIndex[];
  itemToPartition: Map<string, number>; // Maps item ID to partition index
  maxItemsPerPartition: number;
  dimension: number;
}

export interface PartitionDistribution {
  partitionIndex: number;
  items: DatabaseItem[];
  capacity: number;
}

export class HnswPartitionManager {
  private config: HnswConfig;
  private hnswLib: any;

  constructor(config: HnswConfig, hnswLib: any) {
    this.config = config;
    this.hnswLib = hnswLib;
  }

  /**
   * Create partitioned HNSW indexes for large collections
   * @param collectionName Collection name for logging
   * @param items Items to partition and index
   * @param dimension Embedding dimension
   * @returns Partitioned index structure
   */
  async createPartitionedIndex(
    collectionName: string, 
    items: DatabaseItem[], 
    dimension: number
  ): Promise<PartitionedHnswIndex> {
    try {
      const partitionCount = this.config.calculatePartitionCount(items.length);
      const distributions = this.distributeItemsAcrossPartitions(items, partitionCount);
      
      logger.systemLog(
        `Creating ${partitionCount} partitions for ${items.length} items in collection ${collectionName}`,
        'HnswPartitionManager'
      );

      const partitions: HnswIndex[] = [];
      const itemToPartition = new Map<string, number>();
      let totalSkipped = 0;

      // Create each partition
      for (let i = 0; i < distributions.length; i++) {
        const distribution = distributions[i];
        
        logger.systemLog(
          `Creating partition ${i + 1}/${partitionCount} with ${distribution.items.length} items`,
          'HnswPartitionManager'
        );

        const partitionResult = await this.createSinglePartition(
          distribution,
          dimension,
          i
        );

        partitions.push(partitionResult.partition);
        
        // Update item-to-partition mapping
        partitionResult.successfulItems.forEach(item => {
          itemToPartition.set(item.id, i);
        });

        totalSkipped += partitionResult.skippedCount;
      }

      const result: PartitionedHnswIndex = {
        partitions,
        itemToPartition,
        maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
        dimension,
      };

      logger.systemLog(
        `Successfully created ${partitionCount} partitions. Total skipped: ${totalSkipped}`,
        'HnswPartitionManager'
      );

      return result;
    } catch (error) {
      logger.systemError(
        new Error(`Failed to create partitioned index for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswPartitionManager'
      );
      throw error;
    }
  }

  /**
   * Distribute items across partitions using round-robin strategy
   * @param items Items to distribute
   * @param partitionCount Number of partitions
   * @returns Array of partition distributions
   */
  private distributeItemsAcrossPartitions(
    items: DatabaseItem[], 
    partitionCount: number
  ): PartitionDistribution[] {
    const distributions: PartitionDistribution[] = [];
    
    // Initialize partitions
    for (let i = 0; i < partitionCount; i++) {
      distributions.push({
        partitionIndex: i,
        items: [],
        capacity: this.config.calculateOptimalCapacity(this.config.partitioning.maxItemsPerPartition),
      });
    }

    // Distribute items using round-robin for even distribution
    items.forEach((item, index) => {
      const partitionIndex = index % partitionCount;
      distributions[partitionIndex].items.push(item);
    });

    return distributions;
  }

  /**
   * Create a single partition index
   * @param distribution Partition distribution
   * @param dimension Embedding dimension
   * @param partitionIndex Index of this partition
   * @returns Created partition with metadata
   */
  private async createSinglePartition(
    distribution: PartitionDistribution,
    dimension: number,
    partitionIndex: number
  ): Promise<{
    partition: HnswIndex;
    successfulItems: DatabaseItem[];
    skippedCount: number;
  }> {
    // Create HNSW index for this partition
    const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, null);
    index.initIndex(
      dimension,
      this.config.index.m,
      this.config.index.efConstruction,
      distribution.capacity
    );

    const idToItem = new Map<number, DatabaseItem>();
    const itemIdToHnswId = new Map<string, number>();
    let nextId = 0;
    let skippedCount = 0;
    const successfulItems: DatabaseItem[] = [];

    // Add items to this partition
    for (const item of distribution.items) {
      try {
        // Validation should be done by validation service before this point
        if (!item.embedding || item.embedding.length !== dimension) {
          skippedCount++;
          continue;
        }

        const hnswId = nextId++;
        index.addPoint(item.embedding, hnswId, false);
        idToItem.set(hnswId, item);
        itemIdToHnswId.set(item.id, hnswId);
        successfulItems.push(item);
      } catch (error) {
        logger.systemWarn(
          `Failed to add item to partition ${partitionIndex}: ${error instanceof Error ? error.message : String(error)}`,
          'HnswPartitionManager'
        );
        skippedCount++;
      }
    }

    const partition: HnswIndex = {
      index,
      idToItem,
      itemIdToHnswId,
      nextId,
    };

    return {
      partition,
      successfulItems,
      skippedCount,
    };
  }

  /**
   * Add item to an existing partitioned index
   * @param partitionedIndex Existing partitioned index
   * @param item Item to add
   * @returns True if item was successfully added
   */
  async addItemToPartitionedIndex(
    partitionedIndex: PartitionedHnswIndex,
    item: DatabaseItem
  ): Promise<boolean> {
    if (!item.embedding || item.embedding.length !== partitionedIndex.dimension) {
      return false;
    }

    try {
      // Determine which partition should get this item
      const targetPartitionIndex = this.selectPartitionForNewItem(partitionedIndex);
      const targetPartition = partitionedIndex.partitions[targetPartitionIndex];

      // Add to the partition
      const hnswId = targetPartition.nextId++;
      targetPartition.index.addPoint(item.embedding, hnswId, false);
      targetPartition.idToItem.set(hnswId, item);
      targetPartition.itemIdToHnswId.set(item.id, hnswId);
      
      // Update partition mapping
      partitionedIndex.itemToPartition.set(item.id, targetPartitionIndex);

      return true;
    } catch (error) {
      logger.systemWarn(
        `Failed to add item ${item.id} to partitioned index: ${error instanceof Error ? error.message : String(error)}`,
        'HnswPartitionManager'
      );
      return false;
    }
  }

  /**
   * Remove item from partitioned index
   * @param partitionedIndex Partitioned index
   * @param itemId Item ID to remove
   * @returns True if item was found and removed
   */
  async removeItemFromPartitionedIndex(
    partitionedIndex: PartitionedHnswIndex,
    itemId: string
  ): Promise<boolean> {
    const partitionIndex = partitionedIndex.itemToPartition.get(itemId);
    if (partitionIndex === undefined) {
      return false;
    }

    const partition = partitionedIndex.partitions[partitionIndex];
    const hnswId = partition.itemIdToHnswId.get(itemId);
    
    if (hnswId !== undefined) {
      // Note: HNSW doesn't support removal, so we just remove from our mappings
      partition.idToItem.delete(hnswId);
      partition.itemIdToHnswId.delete(itemId);
      partitionedIndex.itemToPartition.delete(itemId);
      return true;
    }

    return false;
  }

  /**
   * Select the best partition for a new item
   * Currently uses simple round-robin, but could be enhanced with load balancing
   * @param partitionedIndex Existing partitioned index
   * @returns Index of the selected partition
   */
  private selectPartitionForNewItem(partitionedIndex: PartitionedHnswIndex): number {
    // Simple strategy: find partition with fewest items
    let minItems = Infinity;
    let selectedPartition = 0;

    partitionedIndex.partitions.forEach((partition, index) => {
      const itemCount = partition.idToItem.size;
      if (itemCount < minItems) {
        minItems = itemCount;
        selectedPartition = index;
      }
    });

    return selectedPartition;
  }

  /**
   * Get statistics for partitioned index
   * @param partitionedIndex Partitioned index
   * @returns Detailed statistics
   */
  getPartitionStatistics(partitionedIndex: PartitionedHnswIndex): {
    totalItems: number;
    partitionCount: number;
    itemsPerPartition: number[];
    avgItemsPerPartition: number;
    maxItemsPerPartition: number;
    minItemsPerPartition: number;
    loadBalance: number; // 0-1, where 1 is perfectly balanced
  } {
    const itemsPerPartition = partitionedIndex.partitions.map(p => p.idToItem.size);
    const totalItems = itemsPerPartition.reduce((sum, count) => sum + count, 0);
    const avgItems = totalItems / partitionedIndex.partitions.length;
    const maxItems = Math.max(...itemsPerPartition);
    const minItems = Math.min(...itemsPerPartition);
    
    // Calculate load balance (closer to 1 means better balance)
    const variance = itemsPerPartition.reduce((sum, count) => sum + Math.pow(count - avgItems, 2), 0) / partitionedIndex.partitions.length;
    const loadBalance = avgItems > 0 ? Math.max(0, 1 - (Math.sqrt(variance) / avgItems)) : 1;

    return {
      totalItems,
      partitionCount: partitionedIndex.partitions.length,
      itemsPerPartition,
      avgItemsPerPartition: avgItems,
      maxItemsPerPartition: maxItems,
      minItemsPerPartition: minItems,
      loadBalance,
    };
  }

  /**
   * Rebalance partitions if load is uneven
   * @param partitionedIndex Partitioned index to rebalance
   * @returns True if rebalancing was performed
   */
  async rebalancePartitions(partitionedIndex: PartitionedHnswIndex): Promise<boolean> {
    const stats = this.getPartitionStatistics(partitionedIndex);
    
    // Only rebalance if load balance is poor (< 0.7)
    if (stats.loadBalance >= 0.7) {
      return false;
    }

    logger.systemLog(
      `Rebalancing partitions due to poor load balance: ${stats.loadBalance.toFixed(2)}`,
      'HnswPartitionManager'
    );

    // For now, we'll just log that rebalancing is needed
    // Full rebalancing would require rebuilding partitions
    logger.systemWarn(
      'Partition rebalancing detected but not implemented - consider rebuilding index',
      'HnswPartitionManager'
    );

    return false;
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}