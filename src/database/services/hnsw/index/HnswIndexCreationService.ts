/**
 * HnswIndexCreationService - Handles HNSW index creation logic
 * Follows Single Responsibility Principle by focusing only on index creation
 */

import { logger } from '../../../../utils/logger';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { ContentHashService } from '../../embedding/ContentHashService';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswValidationService } from '../validation/HnswValidationService';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { 
  HnswPartitionManager, 
  HnswIndex, 
  PartitionedHnswIndex 
} from '../partitioning/HnswPartitionManager';

export interface IndexCreationResult {
  success: boolean;
  indexType: 'single' | 'partitioned';
  itemsIndexed: number;
  itemsSkipped: number;
  dimension: number;
  partitionCount?: number;
}

export class HnswIndexCreationService {
  private config: HnswConfig;
  private validationService: HnswValidationService;
  private persistenceService: HnswPersistenceOrchestrator;
  private partitionManager: HnswPartitionManager;
  private contentHashService: ContentHashService;
  private hnswLib: any;

  constructor(
    config: HnswConfig,
    validationService: HnswValidationService,
    persistenceService: HnswPersistenceOrchestrator,
    partitionManager: HnswPartitionManager,
    contentHashService: ContentHashService,
    hnswLib: any
  ) {
    this.config = config;
    this.validationService = validationService;
    this.persistenceService = persistenceService;
    this.partitionManager = partitionManager;
    this.contentHashService = contentHashService;
    this.hnswLib = hnswLib;
  }

  /**
   * Create index from scratch
   * @param collectionName Collection name
   * @param items Valid items to index
   * @param dimension Embedding dimension
   * @returns Creation result
   */
  async createIndexFromScratch(
    collectionName: string, 
    items: DatabaseItem[], 
    dimension: number
  ): Promise<IndexCreationResult> {
    try {
      if (this.config.shouldUsePartitioning(items.length)) {
        logger.systemLog(
          `Creating partitioned index for ${items.length} items`,
          'HnswIndexCreationService'
        );
        return await this.createPartitionedIndex(collectionName, items, dimension);
      } else {
        logger.systemLog(
          `Creating single index for ${items.length} items`,
          'HnswIndexCreationService'
        );
        return await this.createSingleIndex(collectionName, items, dimension);
      }
    } catch (error) {
      logger.systemError(
        new Error(`Failed to create index for collection ${collectionName}: ${getErrorMessage(error)}`),
        'HnswIndexCreationService'
      );
      return {
        success: false,
        indexType: 'single',
        itemsIndexed: 0,
        itemsSkipped: items.length,
        dimension,
      };
    }
  }

  /**
   * Create single HNSW index
   * @param collectionName Collection name
   * @param items Items to index
   * @param dimension Embedding dimension
   * @returns Creation result
   */
  async createSingleIndex(
    collectionName: string, 
    items: DatabaseItem[], 
    dimension: number
  ): Promise<IndexCreationResult> {
    const capacity = this.config.calculateOptimalCapacity(items.length);
    
    // Create HNSW index (disable auto-save to prevent concurrent syncFS operations)
    const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
    index.initIndex(
      capacity, // maxElements
      this.config.index.m, // m
      this.config.index.efConstruction, // efConstruction
      100 // randomSeed - use fixed value
    );

    const idToItem = new Map<number, DatabaseItem>();
    const itemIdToHnswId = new Map<string, number>();
    let nextId = 0;
    let skippedCount = 0;

    // Add all items to the index
    for (const item of items) {
      try {
        // Items should already be validated, but double-check critical properties
        if (!item.embedding || item.embedding.length !== dimension) {
          skippedCount++;
          continue;
        }

        const hnswId = nextId++;
        index.addPoint(item.embedding, hnswId, false);
        idToItem.set(hnswId, item);
        itemIdToHnswId.set(String(item.id), hnswId);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        
        // Check for capacity-related errors
        if (this.isCapacityError(errorMessage, nextId)) {
          logger.systemWarn(
            `Capacity limit reached at item ${nextId}. Switching to partitioned indexing.`,
            'HnswIndexCreationService'
          );
          
          // Fall back to partitioned indexing
          return await this.createPartitionedIndex(collectionName, items, dimension);
        }
        
        logger.systemWarn(
          `Failed to add item ${nextId}: ${errorMessage}`,
          'HnswIndexCreationService'
        );
        skippedCount++;
      }
    }

    // Store the index
    const hnswIndex: HnswIndex = {
      index,
      idToItem,
      itemIdToHnswId,
      nextId,
    };

    // Save the actual index to IndexedDB
    await this.persistenceService.saveIndex(collectionName, hnswIndex.index, items, false);

    // Save metadata so the index can be discovered on next startup
    const metadata = {
      collectionName,
      itemCount: items.length - skippedCount,
      dimension,
      lastModified: Date.now(),
      contentHash: this.calculateContentHash(items),
      isPartitioned: false,
      version: '3.0.0',
      indexFilename: `hnsw_${collectionName}`,
      estimatedSize: (items.length - skippedCount) * dimension * 4, // rough estimate
    };

    await this.persistenceService.saveIndexMetadata(collectionName, metadata);

    const itemsIndexed = items.length - skippedCount;
    logger.systemLog(
      `Successfully created single index with ${itemsIndexed} items. Skipped ${skippedCount} invalid items.`,
      'HnswIndexCreationService'
    );

    return {
      success: true,
      indexType: 'single',
      itemsIndexed,
      itemsSkipped: skippedCount,
      dimension,
      hnswIndex, // Return the created index
    } as any;
  }

  /**
   * Create partitioned HNSW index
   * @param collectionName Collection name
   * @param items Items to index
   * @param dimension Embedding dimension
   * @returns Creation result
   */
  async createPartitionedIndex(
    collectionName: string, 
    items: DatabaseItem[], 
    dimension: number
  ): Promise<IndexCreationResult> {
    const partitionedIndex = await this.partitionManager.createPartitionedIndex(
      collectionName,
      items,
      dimension
    );

    // Calculate statistics
    const stats = this.partitionManager.getPartitionStatistics(partitionedIndex);
    
    // Save the partitioned index to IndexedDB
    const partitionsWithCounts = partitionedIndex.partitions.map(partition => ({
      index: partition.index,
      itemCount: partition.idToItem.size,
    }));
    
    await this.persistenceService.savePartitionedIndex(collectionName, partitionsWithCounts, items);

    // Save metadata so the index can be discovered on next startup
    const metadata = {
      collectionName,
      itemCount: stats.totalItems,
      dimension,
      lastModified: Date.now(),
      contentHash: this.calculateContentHash(items),
      isPartitioned: true,
      partitionCount: stats.partitionCount,
      version: '3.0.0',
      indexFilename: `hnsw_${collectionName}`,
      estimatedSize: stats.totalItems * dimension * 4, // rough estimate
    };

    await this.persistenceService.saveIndexMetadata(collectionName, metadata);

    logger.systemLog(
      `Successfully created partitioned index with ${stats.totalItems} items across ${stats.partitionCount} partitions`,
      'HnswIndexCreationService'
    );

    return {
      success: true,
      indexType: 'partitioned',
      itemsIndexed: stats.totalItems,
      itemsSkipped: items.length - stats.totalItems,
      dimension,
      partitionCount: stats.partitionCount,
      partitionedIndex, // Return the created index
    } as any;
  }

  /**
   * Create empty single index structure
   * @param collectionName Collection name
   * @param dimension Embedding dimension
   * @param expectedItemCount Expected number of items
   * @returns Empty single index
   */
  async createEmptySingleIndex(
    collectionName: string, 
    dimension: number, 
    expectedItemCount: number
  ): Promise<HnswIndex> {
    const capacity = this.config.calculateOptimalCapacity(expectedItemCount);
    const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
    index.initIndex(capacity, this.config.index.m, this.config.index.efConstruction, 100);

    return {
      index,
      idToItem: new Map(),
      itemIdToHnswId: new Map(),
      nextId: 0,
    };
  }

  /**
   * Create empty partitioned index structure
   * @param collectionName Collection name
   * @param dimension Embedding dimension
   * @param partitionCount Number of partitions
   * @returns Empty partitioned index
   */
  async createEmptyPartitionedIndex(
    collectionName: string, 
    dimension: number, 
    partitionCount: number
  ): Promise<PartitionedHnswIndex> {
    const partitions: HnswIndex[] = [];
    const capacity = this.config.calculateOptimalCapacity(this.config.partitioning.maxItemsPerPartition);

    for (let i = 0; i < partitionCount; i++) {
      const index = new this.hnswLib.HierarchicalNSW('cosine', dimension, '');
      index.initIndex(capacity, this.config.index.m, this.config.index.efConstruction, 100);

      partitions.push({
        index,
        idToItem: new Map(),
        itemIdToHnswId: new Map(),
        nextId: 0,
      });
    }

    return {
      partitions,
      itemToPartition: new Map(),
      maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
      dimension,
    };
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
   * Calculate content hash for change detection using ContentHashService
   * @param items Items to hash
   * @returns Content hash string
   */
  private calculateContentHash(items: DatabaseItem[]): string {
    // Create a simple hash input based on item IDs and document lengths
    const hashInput = items
      .map(item => `${item.id}:${item.document?.length || 0}`)
      .sort()
      .join('|');
    
    return this.contentHashService.hashContent(hashInput);
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}