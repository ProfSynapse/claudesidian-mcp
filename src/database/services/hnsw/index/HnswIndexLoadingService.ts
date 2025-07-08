/**
 * HnswIndexLoadingService - Handles HNSW index loading and validation logic
 * Follows Single Responsibility Principle by focusing only on index loading
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

export interface IndexLoadingResult {
  success: boolean;
  indexType: 'single' | 'partitioned';
  itemsIndexed: number;
  itemsSkipped: number;
  dimension: number;
  partitionCount?: number;
  singleIndex?: HnswIndex;
  partitionedIndex?: PartitionedHnswIndex;
}

export class HnswIndexLoadingService {
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
   * Load persisted index and validate against current data
   * @param collectionName Collection name
   * @param currentItems Current items
   * @param dimension Expected dimension
   * @returns Load result
   */
  async loadPersistedIndex(
    collectionName: string, 
    currentItems: DatabaseItem[], 
    dimension: number
  ): Promise<IndexLoadingResult> {
    try {
      // Load metadata to determine if index is partitioned
      const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
      if (!metadata) {
        return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
      }

      // Use metadata to determine correct loading method
      if (metadata.isPartitioned) {
        return await this.loadPersistedPartitionedIndex(collectionName, currentItems, dimension);
      } else {
        return await this.loadPersistedSingleIndex(collectionName, currentItems, dimension);
      }
    } catch (error) {
      logger.systemWarn(
        `Error loading persisted index for ${collectionName}: ${getErrorMessage(error)}`,
        'HnswIndexLoadingService'
      );
      return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }
  }

  /**
   * Load persisted single index from IndexedDB
   * @param collectionName Collection name
   * @param currentItems Current items
   * @param dimension Expected dimension
   * @returns Load result
   */
  async loadPersistedSingleIndex(
    collectionName: string, 
    currentItems: DatabaseItem[], 
    dimension: number
  ): Promise<IndexLoadingResult> {
    // Load metadata first, then pass it to loadIndex
    const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
    const loadResult = await this.persistenceService.loadIndex(collectionName, metadata);
    
    if (!loadResult.success || !loadResult.index) {
      logger.systemLog(
        `Failed to load persisted single index for ${collectionName}: ${loadResult.errorReason}`,
        'HnswIndexLoadingService'
      );
      return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }

    // Create the index structure to hold the loaded index
    const indexData: HnswIndex = {
      index: loadResult.index,
      idToItem: new Map(),
      itemIdToHnswId: new Map(),
      nextId: loadResult.metadata?.itemCount || 0,
    };

    // Populate the mapping data from current items
    const populateResult = await this.populateIndexMappings(indexData, currentItems);

    logger.systemLog(
      `Successfully loaded persisted single index for ${collectionName} (${populateResult.itemsMapped} items mapped)`,
      'HnswIndexLoadingService'
    );

    return {
      success: true,
      indexType: 'single',
      itemsIndexed: populateResult.itemsMapped,
      itemsSkipped: populateResult.itemsSkipped,
      dimension,
      singleIndex: indexData,
    };
  }

  /**
   * Load persisted partitioned index from IndexedDB
   * @param collectionName Collection name
   * @param currentItems Current items
   * @param dimension Expected dimension
   * @returns Load result
   */
  async loadPersistedPartitionedIndex(
    collectionName: string, 
    currentItems: DatabaseItem[], 
    dimension: number
  ): Promise<IndexLoadingResult> {
    const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
    if (!metadata?.isPartitioned) {
      return { success: false, indexType: 'partitioned', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }

    const loadResult = await this.persistenceService.loadPartitionedIndex(collectionName, metadata);
    
    if (!loadResult.success || !loadResult.partitions) {
      logger.systemLog(
        `Failed to load persisted partitioned index for ${collectionName}: ${loadResult.errorReason}`,
        'HnswIndexLoadingService'
      );
      return { success: false, indexType: 'partitioned', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }

    // Create the partitioned index structure
    const partitions: HnswIndex[] = loadResult.partitions.map(partitionIndex => ({
      index: partitionIndex,
      idToItem: new Map(),
      itemIdToHnswId: new Map(),
      nextId: 0,
    }));

    const partitionedIndex: PartitionedHnswIndex = {
      partitions,
      itemToPartition: new Map(),
      maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
      dimension,
    };

    // Populate mappings for all partitions
    let totalMapped = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < partitions.length; i++) {
      const partitionItems = this.getItemsForPartition(currentItems, i, partitions.length);
      const populateResult = await this.populateIndexMappings(partitions[i], partitionItems);
      
      // Update partition mapping
      partitionItems.forEach(item => {
        partitionedIndex.itemToPartition.set(item.id, i);
      });
      
      totalMapped += populateResult.itemsMapped;
      totalSkipped += populateResult.itemsSkipped;
    }

    logger.systemLog(
      `Successfully loaded persisted partitioned index for ${collectionName} (${partitions.length} partitions, ${totalMapped} items mapped)`,
      'HnswIndexLoadingService'
    );

    return {
      success: true,
      indexType: 'partitioned',
      itemsIndexed: totalMapped,
      itemsSkipped: totalSkipped,
      dimension,
      partitionCount: partitions.length,
      partitionedIndex,
    };
  }

  /**
   * Populate index mappings for a loaded HNSW index
   * @param indexData Index structure to populate
   * @param items Items to map to the index
   * @returns Mapping result
   */
  private async populateIndexMappings(
    indexData: HnswIndex, 
    items: DatabaseItem[]
  ): Promise<{ itemsMapped: number; itemsSkipped: number }> {
    let itemsMapped = 0;
    let itemsSkipped = 0;
    let hnswId = 0;

    for (const item of items) {
      if (!item.embedding || item.embedding.length === 0) {
        itemsSkipped++;
        continue;
      }

      // Map the item to the HNSW ID
      indexData.idToItem.set(hnswId, item);
      indexData.itemIdToHnswId.set(item.id, hnswId);
      hnswId++;
      itemsMapped++;
    }

    indexData.nextId = hnswId;
    return { itemsMapped, itemsSkipped };
  }

  /**
   * Get items for a specific partition using round-robin distribution
   * @param items All items
   * @param partitionIndex Partition index
   * @param totalPartitions Total number of partitions
   * @returns Items for this partition
   */
  private getItemsForPartition(items: DatabaseItem[], partitionIndex: number, totalPartitions: number): DatabaseItem[] {
    return items.filter((_, index) => index % totalPartitions === partitionIndex);
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}