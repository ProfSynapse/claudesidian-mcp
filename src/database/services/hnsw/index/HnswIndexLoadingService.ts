/**
 * HnswIndexLoadingService - Handles HNSW index loading and validation logic
 * Follows Single Responsibility Principle by focusing only on index loading
 * SUPERLATIVE ENHANCEMENT: Improved reliability, performance, and error handling
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
   * SUPERLATIVE ENHANCEMENT: Improved validation, error handling, and performance tracking
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
    const startTime = Date.now();
    
    try {
      logger.systemLog(`🔄 Starting enhanced index loading for collection: ${collectionName}`, 'HnswIndexLoadingService');
      
      // Load metadata to determine if index is partitioned
      const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
      if (!metadata) {
        logger.systemWarn(`❌ No metadata found for collection: ${collectionName}`, 'HnswIndexLoadingService');
        return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
      }

      logger.systemLog(
        `📋 Loaded metadata for ${collectionName}: ${metadata.itemCount} items, ${metadata.dimension}D, partitioned=${metadata.isPartitioned}`,
        'HnswIndexLoadingService'
      );

      // Enhanced validation
      if (metadata.dimension !== dimension && dimension > 0) {
        logger.systemWarn(
          `⚠️  Dimension mismatch for ${collectionName}: metadata=${metadata.dimension}, expected=${dimension}`,
          'HnswIndexLoadingService'
        );
      }

      // Use metadata to determine correct loading method with enhanced error handling
      let result: IndexLoadingResult;
      
      if (metadata.isPartitioned) {
        logger.systemLog(`🔄 Loading partitioned index for ${collectionName}`, 'HnswIndexLoadingService');
        result = await this.loadPersistedPartitionedIndex(collectionName, currentItems, dimension);
      } else {
        logger.systemLog(`🔄 Loading single index for ${collectionName}`, 'HnswIndexLoadingService');
        result = await this.loadPersistedSingleIndex(collectionName, currentItems, dimension);
      }

      const loadTime = Date.now() - startTime;
      
      if (result.success) {
        logger.systemLog(
          `✅ Successfully loaded ${result.indexType} index for ${collectionName} in ${loadTime}ms (${result.itemsIndexed} items)`,
          'HnswIndexLoadingService'
        );
      } else {
        logger.systemWarn(
          `❌ Failed to load index for ${collectionName} after ${loadTime}ms`,
          'HnswIndexLoadingService'
        );
      }

      return result;
      
    } catch (error) {
      const loadTime = Date.now() - startTime;
      logger.systemError(
        new Error(`Enhanced index loading failed for ${collectionName} after ${loadTime}ms: ${getErrorMessage(error)}`),
        'HnswIndexLoadingService'
      );
      return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }
  }

  /**
   * Load persisted single index from IndexedDB
   * SUPERLATIVE ENHANCEMENT: Better error handling, performance tracking, and validation
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
    const startTime = Date.now();
    
    try {
      logger.systemLog(`🔄 Loading single index for collection: ${collectionName}`, 'HnswIndexLoadingService');
      
      // Load metadata first, then pass it to loadIndex with enhanced validation
      const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
      if (!metadata) {
        logger.systemWarn(`❌ No metadata available for ${collectionName}`, 'HnswIndexLoadingService');
        return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
      }

      // Enhanced metadata validation
      if (metadata.dimension !== dimension && dimension > 0) {
        logger.systemWarn(
          `⚠️  Dimension mismatch detected: metadata=${metadata.dimension}, expected=${dimension}`,
          'HnswIndexLoadingService'
        );
      }

      logger.systemLog(`📂 Loading index data from persistence...`, 'HnswIndexLoadingService');
      const loadResult = await this.persistenceService.loadIndex(collectionName, metadata);
      
      if (!loadResult.success || !loadResult.index) {
        logger.systemWarn(
          `❌ Failed to load persisted single index for ${collectionName}: ${loadResult.errorReason}`,
          'HnswIndexLoadingService'
        );
        return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
      }

      logger.systemLog(`✅ Index data loaded successfully, creating index structure...`, 'HnswIndexLoadingService');

      // Create the index structure to hold the loaded index with enhanced initialization
      const indexData: HnswIndex = {
        index: loadResult.index,
        idToItem: new Map(),
        itemIdToHnswId: new Map(),
        nextId: metadata.itemCount || 0,
      };

      // CRITICAL FIX: Verify the loaded index actually contains data before populating mappings
      const actualIndexCount = loadResult.index.getCurrentCount?.() || 0;
      console.log(`[INDEX-LOADING-DEBUG] Loaded index for ${collectionName} has ${actualIndexCount} items`);
      
      if (actualIndexCount === 0 && metadata.itemCount > 0) {
        logger.systemWarn(
          `❌ Index file appears empty for ${collectionName}: loaded ${actualIndexCount} items but metadata claims ${metadata.itemCount}`,
          'HnswIndexLoadingService'
        );
        return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
      }
      
      // Populate the mapping data from current items with performance tracking
      logger.systemLog(`🔄 Populating index mappings for ${currentItems.length} items...`, 'HnswIndexLoadingService');
      const populateStartTime = Date.now();
      const populateResult = await this.populateIndexMappings(indexData, currentItems);
      const populateTime = Date.now() - populateStartTime;

      const totalTime = Date.now() - startTime;

      logger.systemLog(
        `✅ Successfully loaded persisted single index for ${collectionName} in ${totalTime}ms (${populateResult.itemsMapped} items mapped in ${populateTime}ms)`,
        'HnswIndexLoadingService'
      );

      // Enhanced validation of mapping results
      if (populateResult.itemsMapped === 0 && currentItems.length > 0) {
        logger.systemWarn(
          `⚠️  No items were mapped for ${collectionName} despite having ${currentItems.length} current items`,
          'HnswIndexLoadingService'
        );
      }

      return {
        success: true,
        indexType: 'single',
        itemsIndexed: populateResult.itemsMapped,
        itemsSkipped: populateResult.itemsSkipped,
        dimension,
        singleIndex: indexData,
      };
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.systemError(
        new Error(`Enhanced single index loading failed for ${collectionName} after ${totalTime}ms: ${getErrorMessage(error)}`),
        'HnswIndexLoadingService'
      );
      return { success: false, indexType: 'single', itemsIndexed: 0, itemsSkipped: 0, dimension };
    }
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