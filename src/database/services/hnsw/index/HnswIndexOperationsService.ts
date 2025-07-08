/**
 * HnswIndexOperationsService - Handles HNSW index operations (add, remove, update)
 * Follows Single Responsibility Principle by focusing only on index operations
 */

import { logger } from '../../../../utils/logger';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { 
  HnswPartitionManager, 
  HnswIndex, 
  PartitionedHnswIndex 
} from '../partitioning/HnswPartitionManager';

export interface ItemOperationResult {
  success: boolean;
  itemsAdded: number;
  itemsSkipped: number;
  itemsRemoved?: number;
}

export class HnswIndexOperationsService {
  private config: HnswConfig;
  private persistenceService: HnswPersistenceOrchestrator;
  private partitionManager: HnswPartitionManager;

  constructor(
    config: HnswConfig,
    persistenceService: HnswPersistenceOrchestrator,
    partitionManager: HnswPartitionManager
  ) {
    this.config = config;
    this.persistenceService = persistenceService;
    this.partitionManager = partitionManager;
  }

  /**
   * Add single item to existing index
   * @param collectionName Collection name
   * @param item Item to add
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns True if successfully added
   */
  async addItemToIndex(
    collectionName: string, 
    item: DatabaseItem,
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<boolean> {
    // Check partitioned index first
    if (partitionedIndex) {
      return await this.partitionManager.addItemToPartitionedIndex(partitionedIndex, item);
    }

    // Check single index
    if (!singleIndex || !item.embedding) {
      return false;
    }

    try {
      const hnswId = singleIndex.nextId++;
      singleIndex.index.addPoint(item.embedding, hnswId, false);
      singleIndex.idToItem.set(hnswId, item);
      singleIndex.itemIdToHnswId.set(item.id, hnswId);
      return true;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (this.isCapacityError(errorMessage, singleIndex.nextId)) {
        logger.systemWarn(
          `HNSW index capacity limit reached when adding item ${item.id}. Index may need rebuilding.`,
          'HnswIndexOperationsService'
        );
      } else {
        logger.systemWarn(
          `Failed to add item ${item.id} to index: ${errorMessage}`,
          'HnswIndexOperationsService'
        );
      }
      return false;
    }
  }

  /**
   * Remove item from index
   * @param collectionName Collection name
   * @param itemId Item ID to remove
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns True if item was found and removed
   */
  async removeItemFromIndex(
    collectionName: string, 
    itemId: string,
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<boolean> {
    // Check partitioned index first
    if (partitionedIndex) {
      return await this.partitionManager.removeItemFromPartitionedIndex(partitionedIndex, itemId);
    }

    // Check single index
    if (!singleIndex) {
      return false;
    }

    const hnswId = singleIndex.itemIdToHnswId.get(itemId);
    if (hnswId !== undefined) {
      // Note: HNSW doesn't support removal, so we just remove from our mappings
      singleIndex.idToItem.delete(hnswId);
      singleIndex.itemIdToHnswId.delete(itemId);
      return true;
    }

    return false;
  }

  /**
   * Add new items to a loaded index (incremental update)
   * @param collectionName Collection name
   * @param currentItems All current items
   * @param previousItemCount Number of items in the loaded index
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns Result of adding new items
   */
  async addNewItemsToLoadedIndex(
    collectionName: string, 
    currentItems: DatabaseItem[], 
    previousItemCount: number,
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<ItemOperationResult> {
    const newItemsCount = currentItems.length - previousItemCount;
    if (newItemsCount <= 0) {
      return { success: true, itemsAdded: 0, itemsSkipped: 0 };
    }

    logger.systemLog(
      `Adding ${newItemsCount} new items to loaded index for collection: ${collectionName}`,
      'HnswIndexOperationsService'
    );

    // Sort items by ID for consistent ordering
    const sortedCurrentItems = currentItems.sort((a, b) => a.id.localeCompare(b.id));
    const newItems = sortedCurrentItems.slice(previousItemCount);

    let itemsAdded = 0;
    let itemsSkipped = 0;

    for (const item of newItems) {
      const success = await this.addItemToIndex(collectionName, item, singleIndex, partitionedIndex);
      if (success) {
        itemsAdded++;
      } else {
        itemsSkipped++;
      }
    }

    // Save the updated index if new items were added
    if (itemsAdded > 0) {
      await this.saveIndexAfterUpdate(collectionName, currentItems, singleIndex, partitionedIndex);
    }

    logger.systemLog(
      `Successfully added ${itemsAdded} new items to loaded index for collection: ${collectionName}`,
      'HnswIndexOperationsService'
    );

    return { success: true, itemsAdded, itemsSkipped };
  }

  /**
   * Update multiple items in the index
   * @param collectionName Collection name
   * @param items Items to update
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns Update result
   */
  async updateItemsInIndex(
    collectionName: string,
    items: DatabaseItem[],
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<ItemOperationResult> {
    let itemsAdded = 0;
    let itemsSkipped = 0;

    // For updates, we need to remove old items and add new ones
    // Since HNSW doesn't support true updates, we'll just remove from mappings and add again
    for (const item of items) {
      // Remove existing item
      await this.removeItemFromIndex(collectionName, item.id, singleIndex, partitionedIndex);
      
      // Add updated item
      const success = await this.addItemToIndex(collectionName, item, singleIndex, partitionedIndex);
      if (success) {
        itemsAdded++;
      } else {
        itemsSkipped++;
      }
    }

    // Save the updated index
    if (itemsAdded > 0) {
      await this.saveIndexAfterUpdate(collectionName, items, singleIndex, partitionedIndex);
    }

    return { success: true, itemsAdded, itemsSkipped };
  }

  /**
   * Batch process items for index operations
   * @param collectionName Collection name
   * @param items Items to process
   * @param operation Operation to perform ('add' | 'remove' | 'update')
   * @param singleIndex Single index (if available)
   * @param partitionedIndex Partitioned index (if available)
   * @returns Batch operation result
   */
  async batchProcessItems(
    collectionName: string,
    items: DatabaseItem[],
    operation: 'add' | 'remove' | 'update',
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<ItemOperationResult> {
    const batchSize = 100; // Default batch size
    let totalAdded = 0;
    let totalSkipped = 0;
    let totalRemoved = 0;

    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      let batchResult: ItemOperationResult;
      
      switch (operation) {
        case 'add':
          batchResult = await this.processBatchAdd(collectionName, batch, singleIndex, partitionedIndex);
          break;
        case 'remove':
          batchResult = await this.processBatchRemove(collectionName, batch, singleIndex, partitionedIndex);
          break;
        case 'update':
          batchResult = await this.updateItemsInIndex(collectionName, batch, singleIndex, partitionedIndex);
          break;
        default:
          batchResult = { success: false, itemsAdded: 0, itemsSkipped: batch.length };
      }

      totalAdded += batchResult.itemsAdded;
      totalSkipped += batchResult.itemsSkipped;
      totalRemoved += batchResult.itemsRemoved || 0;

      // Log progress
      if (i + batchSize < items.length) {
        logger.systemLog(
          `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} for ${operation} operation`,
          'HnswIndexOperationsService'
        );
      }
    }

    return { 
      success: true, 
      itemsAdded: totalAdded, 
      itemsSkipped: totalSkipped, 
      itemsRemoved: totalRemoved 
    };
  }

  /**
   * Process batch add operation
   * @param collectionName Collection name
   * @param items Items to add
   * @param singleIndex Single index
   * @param partitionedIndex Partitioned index
   * @returns Batch add result
   */
  private async processBatchAdd(
    collectionName: string,
    items: DatabaseItem[],
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<ItemOperationResult> {
    let itemsAdded = 0;
    let itemsSkipped = 0;

    for (const item of items) {
      const success = await this.addItemToIndex(collectionName, item, singleIndex, partitionedIndex);
      if (success) {
        itemsAdded++;
      } else {
        itemsSkipped++;
      }
    }

    return { success: true, itemsAdded, itemsSkipped };
  }

  /**
   * Process batch remove operation
   * @param collectionName Collection name
   * @param items Items to remove
   * @param singleIndex Single index
   * @param partitionedIndex Partitioned index
   * @returns Batch remove result
   */
  private async processBatchRemove(
    collectionName: string,
    items: DatabaseItem[],
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<ItemOperationResult> {
    let itemsRemoved = 0;
    let itemsSkipped = 0;

    for (const item of items) {
      const success = await this.removeItemFromIndex(collectionName, item.id, singleIndex, partitionedIndex);
      if (success) {
        itemsRemoved++;
      } else {
        itemsSkipped++;
      }
    }

    return { success: true, itemsAdded: 0, itemsSkipped, itemsRemoved };
  }

  /**
   * Save index after incremental updates
   * @param collectionName Collection name
   * @param items All current items
   * @param singleIndex Single index
   * @param partitionedIndex Partitioned index
   */
  private async saveIndexAfterUpdate(
    collectionName: string, 
    items: DatabaseItem[],
    singleIndex?: HnswIndex,
    partitionedIndex?: PartitionedHnswIndex
  ): Promise<void> {
    try {
      if (partitionedIndex) {
        // Save partitioned index
        const partitionsWithCounts = partitionedIndex.partitions.map(partition => ({
          index: partition.index,
          itemCount: partition.idToItem.size,
        }));
        
        await this.persistenceService.savePartitionedIndex(collectionName, partitionsWithCounts, items);
      } else if (singleIndex) {
        // Save single index
        await this.persistenceService.saveIndex(collectionName, singleIndex.index, items, false);
      }
      
      logger.systemLog(
        `Successfully saved updated index for collection: ${collectionName}`,
        'HnswIndexOperationsService'
      );
    } catch (error) {
      logger.systemError(
        new Error(`Failed to save updated index for ${collectionName}: ${getErrorMessage(error)}`),
        'HnswIndexOperationsService'
      );
    }
  }

  /**
   * Check if error indicates capacity limit
   * @param errorMessage Error message
   * @param currentItemCount Current item count
   * @returns True if capacity error
   */
  private isCapacityError(errorMessage: string, currentItemCount: number): boolean {
    return (
      errorMessage.includes('maximum number of elements') ||
      errorMessage.includes('max_elements') ||
      errorMessage.includes('maximum number of el') ||
      (errorMessage.includes('std::runtime_error') && currentItemCount > 500)
    );
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}