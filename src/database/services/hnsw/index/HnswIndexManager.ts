/**
 * HnswIndexManager - Manages HNSW index lifecycle and operations
 * Follows Single Responsibility Principle by focusing only on index orchestration
 * Delegates specific operations to specialized services
 */

import { logger } from '../../../../utils/logger';
import { getErrorMessage } from '../../../../utils/errorUtils';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswValidationService } from '../validation/HnswValidationService';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { 
  HnswPartitionManager, 
  HnswIndex, 
  PartitionedHnswIndex 
} from '../partitioning/HnswPartitionManager';
import { ContentHashService } from '../../embedding/ContentHashService';
import { HnswIndexCreationService, IndexCreationResult } from './HnswIndexCreationService';
import { HnswIndexLoadingService } from './HnswIndexLoadingService';
import { HnswIndexOperationsService } from './HnswIndexOperationsService';
import { HnswIndexStatisticsService, IndexStatistics } from './HnswIndexStatisticsService';

export type { IndexCreationResult, IndexStatistics };

export class HnswIndexManager {
  private config: HnswConfig;
  private validationService: HnswValidationService;
  private persistenceService: HnswPersistenceOrchestrator;
  private partitionManager: HnswPartitionManager;
  private contentHashService: ContentHashService;
  private hnswLib: any;

  // Specialized services
  private creationService: HnswIndexCreationService;
  private loadingService: HnswIndexLoadingService;
  private operationsService: HnswIndexOperationsService;
  private statisticsService: HnswIndexStatisticsService;

  // Index storage
  private singleIndexes = new Map<string, HnswIndex>();
  private partitionedIndexes = new Map<string, PartitionedHnswIndex>();

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

    // Initialize specialized services
    this.creationService = new HnswIndexCreationService(
      config,
      validationService,
      persistenceService,
      partitionManager,
      contentHashService,
      hnswLib
    );
    this.loadingService = new HnswIndexLoadingService(
      config,
      persistenceService,
      partitionManager
    );
    this.operationsService = new HnswIndexOperationsService(
      config,
      persistenceService,
      partitionManager
    );
    this.statisticsService = new HnswIndexStatisticsService(
      partitionManager
    );
  }

  /**
   * Create or update index for a collection
   * @param collectionName Collection name
   * @param items Items to index
   * @returns Index creation result
   */
  async createOrUpdateIndex(collectionName: string, items: DatabaseItem[]): Promise<IndexCreationResult> {
    logger.systemLog(
      `Creating/updating index for collection: ${collectionName} with ${items.length} items`,
      'HnswIndexManager'
    );

    try {
      // Validate collection for indexing
      const validationResult = this.validationService.validateCollectionForIndexing(collectionName, items);
      if (!validationResult.isValid) {
        return {
          success: false,
          indexType: 'single',
          itemsIndexed: 0,
          itemsSkipped: items.length,
          dimension: 0,
        };
      }

      const validItems = validationResult.validItems;
      const dimension = validationResult.dimension!;

      // Try to load existing index first
      const canLoadPersisted = await this.persistenceService.canLoadPersistedIndex(collectionName, validItems);
      if (canLoadPersisted) {
        const loadResult = await this.loadingService.loadPersistedIndex(collectionName, validItems, dimension);
        if (loadResult.success) {
          // Store the loaded index
          this.storeLoadedIndex(collectionName, loadResult);
          
          // Check for new items to add
          const newItemsResult = await this.operationsService.addNewItemsToLoadedIndex(
            collectionName,
            validItems,
            loadResult.itemsIndexed,
            loadResult.singleIndex,
            loadResult.partitionedIndex
          );
          
          return {
            success: true,
            indexType: loadResult.indexType,
            itemsIndexed: loadResult.itemsIndexed + newItemsResult.itemsAdded,
            itemsSkipped: loadResult.itemsSkipped + newItemsResult.itemsSkipped,
            dimension: loadResult.dimension,
            partitionCount: loadResult.partitionCount,
          };
        }
      }

      // Create new index from scratch
      return await this.createIndexFromScratch(collectionName, validItems, dimension);
    } catch (error) {
      logger.systemError(
        new Error(`Failed to create/update index for collection ${collectionName}: ${getErrorMessage(error)}`),
        'HnswIndexManager'
      );
      return {
        success: false,
        indexType: 'single',
        itemsIndexed: 0,
        itemsSkipped: items.length,
        dimension: 0,
      };
    }
  }

  /**
   * Create index from scratch
   * @param collectionName Collection name
   * @param items Valid items to index
   * @param dimension Embedding dimension
   * @returns Creation result
   */
  private async createIndexFromScratch(
    collectionName: string, 
    items: DatabaseItem[], 
    dimension: number
  ): Promise<IndexCreationResult> {
    // Remove any existing indexes for this collection
    this.removeIndex(collectionName);

    const startTime = Date.now();
    const creationResult = await this.creationService.createIndexFromScratch(collectionName, items, dimension);
    
    if (creationResult.success) {
      // Store the created index
      this.storeCreatedIndex(collectionName, creationResult);
      
      // Record build metrics
      const buildTime = Date.now() - startTime;
      this.statisticsService.recordBuildMetrics(
        collectionName,
        buildTime,
        creationResult.indexType
      );
    }
    
    return creationResult;
  }

  /**
   * Store created index in appropriate storage
   * @param collectionName Collection name
   * @param creationResult Creation result containing the index
   */
  private storeCreatedIndex(collectionName: string, creationResult: any): void {
    if (creationResult.indexType === 'single' && creationResult.hnswIndex) {
      this.singleIndexes.set(collectionName, creationResult.hnswIndex);
    } else if (creationResult.indexType === 'partitioned' && creationResult.partitionedIndex) {
      this.partitionedIndexes.set(collectionName, creationResult.partitionedIndex);
    }
  }

  /**
   * Store loaded index in appropriate storage
   * @param collectionName Collection name
   * @param loadResult Load result containing the index
   */
  private storeLoadedIndex(collectionName: string, loadResult: any): void {
    if (loadResult.indexType === 'single' && loadResult.singleIndex) {
      this.singleIndexes.set(collectionName, loadResult.singleIndex);
    } else if (loadResult.indexType === 'partitioned' && loadResult.partitionedIndex) {
      this.partitionedIndexes.set(collectionName, loadResult.partitionedIndex);
    }
  }

  /**
   * Add single item to existing index
   * @param collectionName Collection name
   * @param item Item to add
   * @returns True if successfully added
   */
  async addItemToIndex(collectionName: string, item: DatabaseItem): Promise<boolean> {
    const singleIndex = this.singleIndexes.get(collectionName);
    const partitionedIndex = this.partitionedIndexes.get(collectionName);
    
    const success = await this.operationsService.addItemToIndex(
      collectionName,
      item,
      singleIndex,
      partitionedIndex
    );
    
    if (success) {
      this.statisticsService.recordOperationMetrics(collectionName, 'add', 1);
    }
    
    return success;
  }

  /**
   * Remove item from index
   * @param collectionName Collection name
   * @param itemId Item ID to remove
   * @returns True if item was found and removed
   */
  async removeItemFromIndex(collectionName: string, itemId: string): Promise<boolean> {
    const singleIndex = this.singleIndexes.get(collectionName);
    const partitionedIndex = this.partitionedIndexes.get(collectionName);
    
    const success = await this.operationsService.removeItemFromIndex(
      collectionName,
      itemId,
      singleIndex,
      partitionedIndex
    );
    
    if (success) {
      this.statisticsService.recordOperationMetrics(collectionName, 'remove', 1);
    }
    
    return success;
  }

  /**
   * Check if collection has an index
   * @param collectionName Collection name
   * @returns True if index exists
   */
  hasIndex(collectionName: string): boolean {
    return this.singleIndexes.has(collectionName) || this.partitionedIndexes.has(collectionName);
  }

  /**
   * Get single index for collection
   * @param collectionName Collection name
   * @returns Single index or null
   */
  getSingleIndex(collectionName: string): HnswIndex | null {
    return this.singleIndexes.get(collectionName) || null;
  }

  /**
   * Get partitioned index for collection
   * @param collectionName Collection name
   * @returns Partitioned index or null
   */
  getPartitionedIndex(collectionName: string): PartitionedHnswIndex | null {
    return this.partitionedIndexes.get(collectionName) || null;
  }

  /**
   * Get index statistics
   * @param collectionName Collection name
   * @returns Index statistics or null
   */
  getIndexStatistics(collectionName: string): IndexStatistics | null {
    const singleIndex = this.singleIndexes.get(collectionName);
    const partitionedIndex = this.partitionedIndexes.get(collectionName);
    
    return this.statisticsService.getIndexStatistics(collectionName, singleIndex, partitionedIndex);
  }

  /**
   * Get memory usage statistics
   * @returns Memory usage statistics
   */
  getMemoryStatistics() {
    return this.statisticsService.getMemoryStatistics(this.singleIndexes, this.partitionedIndexes);
  }

  /**
   * Remove index for collection
   * @param collectionName Collection name
   */
  removeIndex(collectionName: string): void {
    this.singleIndexes.delete(collectionName);
    this.partitionedIndexes.delete(collectionName);
    this.statisticsService.clearPerformanceMetrics(collectionName);
  }

  /**
   * Clear all indexes
   */
  clearAllIndexes(): void {
    this.singleIndexes.clear();
    this.partitionedIndexes.clear();
    this.statisticsService.clearAllPerformanceMetrics();
  }

  /**
   * Force rebuild of index
   * @param collectionName Collection name
   * @param items Items to index
   * @returns Rebuild result
   */
  async forceRebuildIndex(collectionName: string, items: DatabaseItem[]): Promise<IndexCreationResult> {
    logger.systemLog(
      `Force rebuilding index for collection: ${collectionName}`,
      'HnswIndexManager'
    );
    
    await this.persistenceService.forceRebuild(collectionName);
    this.removeIndex(collectionName);
    
    const result = await this.createOrUpdateIndex(collectionName, items);
    
    if (result.success) {
      this.statisticsService.recordBuildMetrics(
        collectionName,
        Date.now(),
        result.indexType,
        true // isRebuild
      );
    }
    
    return result;
  }

  /**
   * Record search performance metrics
   * @param collectionName Collection name
   * @param searchTime Search time in milliseconds
   */
  recordSearchMetrics(collectionName: string, searchTime: number): void {
    const indexType = this.partitionedIndexes.has(collectionName) ? 'partitioned' : 'single';
    this.statisticsService.recordSearchMetrics(collectionName, searchTime, indexType);
  }

  /**
   * Get performance metrics for a collection
   * @param collectionName Collection name
   * @returns Performance metrics or null
   */
  getPerformanceMetrics(collectionName: string) {
    return this.statisticsService.getPerformanceMetrics(collectionName);
  }

  /**
   * Get aggregated statistics across all collections
   * @returns Aggregated statistics
   */
  getAggregatedStatistics() {
    return this.statisticsService.getAggregatedStatistics(this.singleIndexes, this.partitionedIndexes);
  }

  /**
   * Update configuration for all services
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
    this.validationService.updateConfig(newConfig);
    this.persistenceService.updateConfig(newConfig);
    this.partitionManager.updateConfig(newConfig);
    this.creationService.updateConfig(newConfig);
    this.loadingService.updateConfig(newConfig);
    this.operationsService.updateConfig(newConfig);
  }
}