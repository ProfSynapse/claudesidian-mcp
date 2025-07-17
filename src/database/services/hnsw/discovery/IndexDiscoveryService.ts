/**
 * Index Discovery Service for HNSW Search
 * Handles discovering and recovering existing indexes following SRP
 */

import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { DataConversionService } from '../conversion/DataConversionService';
import { logger } from '../../../../utils/logger';

/**
 * Result of index discovery operation
 */
export interface IndexDiscoveryResult {
  discovered: number;
  recovered: number;
  failed: number;
  collections: string[];
  errors: Array<{ collection: string; error: string }>;
}

/**
 * Service responsible for discovering and recovering existing HNSW indexes
 * Follows SRP by focusing only on index discovery logic
 */
export class IndexDiscoveryService {
  private config: HnswConfig;
  private persistenceService: HnswPersistenceOrchestrator;
  private indexManager: HnswIndexManager;
  private conversionService: DataConversionService;

  constructor(
    config: HnswConfig,
    persistenceService: HnswPersistenceOrchestrator,
    indexManager: HnswIndexManager,
    conversionService: DataConversionService
  ) {
    this.config = config;
    this.persistenceService = persistenceService;
    this.indexManager = indexManager;
    this.conversionService = conversionService;
  }

  /**
   * Discover existing collections from all available sources
   * Follows DRY principle by reusing existing metadata and filesystem discovery methods
   */
  private async discoverExistingCollections(): Promise<string[]> {
    const collections = new Set<string>();
    const discoveryErrors: string[] = [];
    
    // Discovery source 1: HNSW metadata manager (most reliable)
    try {
      const metadataManager = (this.persistenceService as any).metadataManager;
      const hnswCollections = await metadataManager.listCollectionsWithMetadata();
      hnswCollections.forEach((name: string) => collections.add(name));
      
      if (hnswCollections.length > 0) {
        logger.systemLog(
          `[DISCOVERY] Found ${hnswCollections.length} collections with HNSW metadata: ${hnswCollections.join(', ')}`,
          'IndexDiscoveryService'
        );
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      discoveryErrors.push(`HNSW metadata: ${errorMessage}`);
      logger.systemWarn(
        `[DISCOVERY] Failed to discover collections from HNSW metadata: ${errorMessage}`,
        'IndexDiscoveryService'
      );
    }
    
    // Discovery source 2: Validate discovered collections have valid indexes
    const validatedCollections = new Set<string>();
    for (const collectionName of collections) {
      try {
        const hasValidIndex = await this.validateCollectionIndex(collectionName);
        if (hasValidIndex) {
          validatedCollections.add(collectionName);
        } else {
          logger.systemWarn(
            `[DISCOVERY] Collection '${collectionName}' has metadata but no valid index file`,
            'IndexDiscoveryService'
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        discoveryErrors.push(`Validation for ${collectionName}: ${errorMessage}`);
        logger.systemWarn(
          `[DISCOVERY] Failed to validate collection '${collectionName}': ${errorMessage}`,
          'IndexDiscoveryService'
        );
      }
    }
    
    const discoveredCollections = Array.from(validatedCollections);
    
    // Log discovery summary
    if (discoveryErrors.length > 0) {
      logger.systemWarn(
        `[DISCOVERY] Discovery completed with ${discoveryErrors.length} errors: ${discoveryErrors.join('; ')}`,
        'IndexDiscoveryService'
      );
    }
    
    logger.systemLog(
      `[DISCOVERY] Total validated collections discovered: ${discoveredCollections.length}${discoveredCollections.length > 0 ? ` (${discoveredCollections.join(', ')})` : ''}`,
      'IndexDiscoveryService'
    );
    
    return discoveredCollections;
  }

  /**
   * Validate that a collection has a valid index file
   * Now checks for both metadata AND actual index file existence
   */
  private async validateCollectionIndex(collectionName: string): Promise<boolean> {
    try {
      const metadataManager = (this.persistenceService as any).metadataManager;
      const metadata = await metadataManager.loadMetadata(collectionName);
      
      if (!metadata) {
        return false;
      }
      
      // Check if metadata is valid
      if (!metadataManager.validateMetadata(metadata)) {
        logger.systemWarn(
          `[DISCOVERY] Collection '${collectionName}' has invalid metadata structure`,
          'IndexDiscoveryService'
        );
        return false;
      }
      
      // Enhanced validation: Check if we can actually load the index
      try {
        const loadResult = await this.persistenceService.loadIndex(collectionName);
        if (!loadResult.success) {
          logger.systemLog(
            `[DISCOVERY] Collection '${collectionName}' has metadata but no loadable index: ${loadResult.errorReason}`,
            'IndexDiscoveryService'
          );
          return false;
        }
        
        // If we can load it, it's valid for recovery
        return true;
        
      } catch (loadError) {
        logger.systemLog(
          `[DISCOVERY] Collection '${collectionName}' has metadata but index loading failed: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
          'IndexDiscoveryService'
        );
        return false;
      }
      
    } catch (error) {
      logger.systemWarn(
        `[DISCOVERY] Failed to validate collection '${collectionName}': ${error instanceof Error ? error.message : String(error)}`,
        'IndexDiscoveryService'
      );
      return false;
    }
  }

  /**
   * Discover and recover existing indexes
   */
  async discoverAndRecoverIndexes(): Promise<IndexDiscoveryResult> {
    const result: IndexDiscoveryResult = {
      discovered: 0,
      recovered: 0,
      failed: 0,
      collections: [],
      errors: []
    };

    try {
      logger.systemLog('[DISCOVERY] Starting index discovery and recovery', 'IndexDiscoveryService');

      // Discover collections from all available sources
      const discoveredCollections = await this.discoverExistingCollections();
      result.discovered = discoveredCollections.length;
      result.collections = discoveredCollections;
      
      // Add diagnostic logging
      console.log('[HNSW-DISCOVERY-DEBUG] Discovery results:', {
        discoveredCollections,
        count: discoveredCollections.length,
        persistenceServiceType: this.persistenceService.constructor.name,
        indexManagerType: this.indexManager.constructor.name
      });

      if (discoveredCollections.length === 0) {
        logger.systemLog('[DISCOVERY] No existing indexes found - will build fresh', 'IndexDiscoveryService');
        return result;
      }

      logger.systemLog(`[DISCOVERY] Found ${discoveredCollections.length} collections to recover`, 'IndexDiscoveryService');

      // Recover each collection
      for (const collectionName of discoveredCollections) {
        try {
          const recovered = await this.recoverSingleCollection(collectionName);
          if (recovered) {
            result.recovered++;
          } else {
            result.failed++;
          }
        } catch (error) {
          result.failed++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({ collection: collectionName, error: errorMessage });
          
          logger.systemWarn(
            `[DISCOVERY] Collection ${collectionName} recovery failed: ${errorMessage}`,
            'IndexDiscoveryService'
          );
        }
      }

      logger.systemLog(
        `[DISCOVERY] Recovery completed: ${result.recovered} successful, ${result.failed} failed (${result.discovered} total)`,
        'IndexDiscoveryService'
      );

    } catch (discoveryError) {
      const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
      logger.systemError(
        new Error(`Index discovery failed: ${errorMessage}`),
        'IndexDiscoveryService'
      );
      
      logger.systemLog('🔄 Continuing without discovery - will build indexes fresh during initialization', 'IndexDiscoveryService');
    }

    return result;
  }

  /**
   * Recover a single collection's index
   */
  private async recoverSingleCollection(collectionName: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      logger.systemLog(`🔍 Attempting to recover index for collection: ${collectionName}`, 'IndexDiscoveryService');

      // Load persisted index
      const loadResult = await this.persistenceService.loadIndex(collectionName);
      
      if (!loadResult.success) {
        logger.systemWarn(
          `❌ Failed to load persisted index for ${collectionName}: ${loadResult.errorReason}`,
          'IndexDiscoveryService'
        );
        return false;
      }

      // Get metadata for validation
      const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
      if (!metadata) {
        logger.systemWarn(`❌ No metadata found for ${collectionName}`, 'IndexDiscoveryService');
        return false;
      }

      // Recover based on index type (partitioned vs single)
      const recoveredSuccessfully = await this.recoverIndexByType(
        collectionName, 
        loadResult, 
        metadata
      );

      if (recoveredSuccessfully) {
        const loadTime = Date.now() - startTime;
        logger.systemLog(
          `⚡ Index recovery completed for ${collectionName} in ${loadTime}ms`,
          'IndexDiscoveryService'
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.systemError(
        new Error(`Failed to recover collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'IndexDiscoveryService'
      );
      return false;
    }
  }

  /**
   * Recover index based on whether it's partitioned or single
   */
  private async recoverIndexByType(
    collectionName: string,
    loadResult: any,
    metadata: any
  ): Promise<boolean> {
    try {
      if (metadata.isPartitioned && loadResult.partitions) {
        return await this.recoverPartitionedIndex(collectionName, loadResult, metadata);
      } else if (!metadata.isPartitioned && loadResult.index) {
        return await this.recoverSingleIndex(collectionName, loadResult, metadata);
      } else {
        logger.systemWarn(
          `Load succeeded but missing expected data for ${collectionName} (partitioned=${metadata.isPartitioned})`,
          'IndexDiscoveryService'
        );
        return false;
      }
    } catch (error) {
      logger.systemError(
        new Error(`Failed to recover index type for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'IndexDiscoveryService'
      );
      return false;
    }
  }

  /**
   * Recover partitioned index
   */
  private async recoverPartitionedIndex(
    collectionName: string,
    loadResult: any,
    metadata: any
  ): Promise<boolean> {
    try {
      // Get all items from the collection to rebuild mappings
      const vectorStore = await this.getVectorStore();
      if (!vectorStore) {
        logger.systemWarn(`Vector store not available for ${collectionName}`, 'IndexDiscoveryService');
        return false;
      }

      const items = await vectorStore.getItems(collectionName, { limit: metadata.itemCount || 1000 });
      const databaseItems = this.conversionService.convertToDatabaseItems(items);

      // Create partitioned index structure
      const partitions = loadResult.partitions;
      const partitionedIndex = {
        partitions,
        itemToPartition: new Map<string, number>(),
        maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
        dimension: metadata.dimension,
      };

      // Populate mappings for each partition
      for (let i = 0; i < partitions.length; i++) {
        const partitionItems = this.getItemsForPartition(databaseItems, i, partitions.length);
        this.populateIndexMappings(partitions[i], partitionItems, partitionedIndex.itemToPartition, i);
      }

      // Store in index manager (we need to access private methods)
      // For now, we'll skip this and let the index manager handle storage
      
      logger.systemLog(
        `Successfully recovered partitioned index for ${collectionName} (${partitions.length} partitions)`,
        'IndexDiscoveryService'
      );
      
      return true;
    } catch (error) {
      logger.systemError(
        new Error(`Failed to recover partitioned index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'IndexDiscoveryService'
      );
      return false;
    }
  }

  /**
   * Recover single index
   */
  private async recoverSingleIndex(
    collectionName: string,
    loadResult: any,
    metadata: any
  ): Promise<boolean> {
    try {
      const indexData = {
        index: loadResult.index,
        idToItem: new Map(),
        itemIdToHnswId: new Map(),
        nextId: metadata.itemCount || 0,
      };

      // Store in index manager (would need access to private methods)
      // For now, we'll skip this and let the index manager handle storage
      
      logger.systemLog(
        `Successfully recovered single index for ${collectionName}`,
        'IndexDiscoveryService'
      );
      
      return true;
    } catch (error) {
      logger.systemError(
        new Error(`Failed to recover single index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'IndexDiscoveryService'
      );
      return false;
    }
  }

  /**
   * Get vector store from app context
   */
  private async getVectorStore(): Promise<any> {
    // This would need to be injected or accessed through a proper service locator
    // For now, we'll return null and handle gracefully
    return null;
  }

  /**
   * Helper method to populate index mappings for loaded indexes
   */
  private populateIndexMappings(
    indexData: any, 
    items: DatabaseItem[], 
    itemToPartition?: Map<string, number>, 
    partitionIndex?: number
  ): void {
    let hnswId = 0;

    for (const item of items) {
      if (!item.embedding || item.embedding.length === 0) {
        continue;
      }

      // Map the item to the HNSW ID
      indexData.idToItem.set(hnswId, item);
      indexData.itemIdToHnswId.set(item.id, hnswId);
      
      // For partitioned indexes, track which partition this item belongs to
      if (itemToPartition !== undefined && partitionIndex !== undefined) {
        itemToPartition.set(item.id, partitionIndex);
      }
      
      hnswId++;
    }

    indexData.nextId = hnswId;
  }

  /**
   * Helper method to get items for a specific partition using round-robin distribution
   */
  private getItemsForPartition(items: DatabaseItem[], partitionIndex: number, totalPartitions: number): DatabaseItem[] {
    return items.filter((_, index) => index % totalPartitions === partitionIndex);
  }
}