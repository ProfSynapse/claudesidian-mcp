/**
 * HNSW Coordinator - Simplified initialization replacing complex orchestration
 * Coordinates direct comparison between ChromaDB collections and IndexedDB indexes
 * Boy Scout Rule: Replacing 361-line complex orchestrator with simple, reliable logic
 */

import { App } from 'obsidian';
import { HnswConfig } from '../config/HnswConfig';
import { HnswPersistenceOrchestrator } from '../persistence/HnswPersistenceOrchestrator';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { IVectorStore } from '../../../interfaces/IVectorStore';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { logger } from '../../../../utils/logger';

// Import coordination interfaces
import { ICollectionLoadingCoordinator } from '../../../../services/initialization/interfaces/ICollectionLoadingCoordinator';

/**
 * Simplified initialization result
 */
export interface HnswInitializationResult {
  success: boolean;
  collectionsProcessed: number;
  indexesBuilt: number;
  indexesLoaded: number;
  indexesSkipped: number;
  errors: string[];
  duration: number;
}

/**
 * HnswCoordinator - Simplified direct coordination replacing complex orchestration
 * Directly compares ChromaDB collections with IndexedDB indexes and rebuilds as needed
 * Boy Scout Rule: Clean, simple logic instead of complex multi-phase orchestration
 */
class HnswCoordinator {
  private config: HnswConfig;
  private app?: App;
  private persistenceService: HnswPersistenceOrchestrator;
  private indexManager: HnswIndexManager;
  private vectorStore: IVectorStore;
  private collectionCoordinator: ICollectionLoadingCoordinator | null = null;

  constructor(
    config: HnswConfig,
    persistenceService: HnswPersistenceOrchestrator,
    indexManager: HnswIndexManager,
    vectorStore: IVectorStore,
    app?: App,
    collectionCoordinator?: ICollectionLoadingCoordinator
  ) {
    this.config = config;
    this.app = app;
    this.persistenceService = persistenceService;
    this.indexManager = indexManager;
    this.vectorStore = vectorStore;
    this.collectionCoordinator = collectionCoordinator || null;
  }
  
  /**
   * Set collection loading coordinator (for dependency injection)
   */
  setCollectionCoordinator(coordinator: ICollectionLoadingCoordinator): void {
    this.collectionCoordinator = coordinator;
  }

  /**
   * Execute simple initialization: compare ChromaDB collections with IndexedDB indexes
   * Implements your requirements: compare existing embeddings to persisted index, reindex if needed
   */
  async executeFullInitialization(): Promise<HnswInitializationResult> {
    const startTime = Date.now();
    const result: HnswInitializationResult = {
      success: false,
      collectionsProcessed: 0,
      indexesBuilt: 0,
      indexesLoaded: 0,
      indexesSkipped: 0,
      errors: [],
      duration: 0
    };

    logger.systemLog('[HNSW-COORDINATOR] Starting simple index comparison and rebuild', 'HnswCoordinator');

    try {
      // Wait for collection loading coordinator if available
      if (this.collectionCoordinator) {
        try {
          await this.collectionCoordinator.waitForCollections(30000);
        } catch (error) {
          logger.systemWarn('Collection coordinator timeout, proceeding anyway', 'HnswCoordinator');
        }
      }

      // Step 1: Get all ChromaDB collections (your existing embeddings)
      const collections = await this.getChromaCollections();
      logger.systemLog(`[HNSW-COORDINATOR] Found ${collections.length} ChromaDB collections to process`, 'HnswCoordinator');

      // Step 2: For each collection, compare with IndexedDB and reindex if needed
      for (const collection of collections) {
        try {
          const collectionResult = await this.processCollection(collection);
          result.collectionsProcessed++;
          
          if (collectionResult.action === 'built') {
            result.indexesBuilt++;
          } else if (collectionResult.action === 'loaded') {
            result.indexesLoaded++;
          } else {
            result.indexesSkipped++;
          }
        } catch (error) {
          const errorMsg = `${collection.name}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          logger.systemWarn(`[HNSW-COORDINATOR] Collection processing failed: ${errorMsg}`, 'HnswCoordinator');
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      logger.systemLog(
        `[HNSW-COORDINATOR] Initialization completed: ${result.indexesBuilt} built, ${result.indexesLoaded} loaded, ${result.indexesSkipped} skipped (${result.duration}ms)`,
        'HnswCoordinator'
      );

    } catch (criticalError) {
      result.success = false;
      result.duration = Date.now() - startTime;
      
      const errorMessage = criticalError instanceof Error ? criticalError.message : String(criticalError);
      result.errors.push(`Critical error: ${errorMessage}`);
      
      logger.systemError(
        new Error(`[HNSW-COORDINATOR] Critical initialization error: ${errorMessage}`),
        'HnswCoordinator'
      );
    }

    return result;
  }

  /**
   * Get ChromaDB collections with their items using correct IVectorStore interface
   * Replaces complex discovery with direct ChromaDB queries
   */
  private async getChromaCollections(): Promise<Array<{name: string, items: DatabaseItem[], count: number}>> {
    logger.systemLog('Getting ChromaDB collections directly', 'HnswCoordinator');
    
    try {
      const collections: Array<{name: string, items: DatabaseItem[], count: number}> = [];
      
      // Get all available collection names (returns string[])
      const collectionNames = await this.vectorStore.listCollections();
      logger.systemLog(`Found collections: ${collectionNames.join(', ')}`, 'HnswCoordinator');
      
      // Process each collection
      for (const collectionName of collectionNames) {
        try {
          // Check if collection exists
          const hasCollection = await this.vectorStore.hasCollection(collectionName);
          if (!hasCollection) {
            logger.systemWarn(`Collection ${collectionName} doesn't exist, skipping`, 'HnswCoordinator');
            continue;
          }

          // Get collection count first
          const count = await this.vectorStore.count(collectionName);
          if (count === 0) {
            logger.systemLog(`Collection ${collectionName} is empty, skipping`, 'HnswCoordinator');
            continue;
          }

          // Get all items from the collection
          const allItems = await this.vectorStore.getAllItems(collectionName, {
            limit: undefined,
            offset: 0
          });

          if (!allItems.ids || allItems.ids.length === 0) {
            logger.systemLog(`Collection ${collectionName} has no items, skipping`, 'HnswCoordinator');
            continue;
          }

          // Convert to DatabaseItem[] format
          const items: DatabaseItem[] = [];
          for (let i = 0; i < allItems.ids.length; i++) {
            items.push({
              id: allItems.ids[i],
              document: allItems.documents?.[i] || '',
              embedding: allItems.embeddings?.[i] || [],
              metadata: allItems.metadatas?.[i] || {}
            });
          }

          collections.push({
            name: collectionName,
            items,
            count: items.length
          });

          logger.systemLog(`Loaded collection ${collectionName} with ${items.length} items`, 'HnswCoordinator');

        } catch (collectionError) {
          logger.systemWarn(`Failed to load collection ${collectionName}: ${collectionError instanceof Error ? collectionError.message : String(collectionError)}`, 'HnswCoordinator');
        }
      }
      
      logger.systemLog(`Successfully loaded ${collections.length} collections for processing`, 'HnswCoordinator');
      return collections;
      
    } catch (error) {
      logger.systemError(
        new Error(`Failed to get ChromaDB collections: ${error instanceof Error ? error.message : String(error)}`),
        'HnswCoordinator'
      );
      return [];
    }
  }

  /**
   * Process a single collection: compare ChromaDB with IndexedDB and reindex if needed
   * Implements your core requirement: compare existing embeddings to persisted index
   */
  private async processCollection(collection: {name: string, items: DatabaseItem[], count: number}): Promise<{action: 'built' | 'loaded' | 'skipped'}> {
    const { name, items, count } = collection;
    
    logger.systemLog(`Processing collection ${name} (${count} items)`, 'HnswCoordinator');

    try {
      // Step 1: Check if we already have an HNSW index in memory
      if (this.indexManager.hasIndex(name)) {
        const indexStats = this.indexManager.getIndexStatistics(name);
        logger.systemLog(`Collection ${name} already has in-memory index (${indexStats?.totalItems || 0} items)`, 'HnswCoordinator');
        
        if (indexStats && indexStats.totalItems === count) {
          logger.systemLog(`Collection ${name} index is current, skipping`, 'HnswCoordinator');
          return { action: 'skipped' };
        }
      }

      // Step 2: Check if we can load from persisted IndexedDB
      logger.systemLog(`Checking persisted index for ${name}`, 'HnswCoordinator');
      const canLoadPersisted = await this.persistenceService.canLoadPersistedIndex(name, items);
      logger.systemLog(`Collection ${name} can load persisted: ${canLoadPersisted}`, 'HnswCoordinator');
      
      if (canLoadPersisted) {
        // Try to load from IndexedDB
        try {
          const indexResult = await this.indexManager.createOrUpdateIndex(name, items);
          if (indexResult.success && indexResult.itemsIndexed > 0) {
            logger.systemLog(`Collection ${name} loaded from IndexedDB (${indexResult.itemsIndexed} items)`, 'HnswCoordinator');
            return { action: 'loaded' };
          } else {
            logger.systemWarn(`Collection ${name} load failed, will rebuild`, 'HnswCoordinator');
          }
        } catch (loadError) {
          logger.systemWarn(`Collection ${name} load error: ${loadError instanceof Error ? loadError.message : String(loadError)}, will rebuild`, 'HnswCoordinator');
        }
      }

      // Step 3: No valid persisted index, rebuild from scratch
      logger.systemLog(`Collection ${name} needs rebuild - creating new index`, 'HnswCoordinator');
      
      // Clear any existing index first
      this.indexManager.removeIndex(name);
      
      // Build new index
      const buildResult = await this.indexManager.createOrUpdateIndex(name, items);
      
      if (buildResult.success && buildResult.itemsIndexed > 0) {
        logger.systemLog(`Collection ${name} successfully rebuilt (${buildResult.itemsIndexed} items, ${buildResult.indexType})`, 'HnswCoordinator');
        return { action: 'built' };
      } else {
        throw new Error(`Index creation failed: ${buildResult.itemsSkipped} items skipped`);
      }

    } catch (error) {
      logger.systemError(
        new Error(`Collection ${name} processing failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswCoordinator'
      );
      throw error;
    }
  }

  /**
   * Simple health check for the coordinator
   */
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    message: string;
  }> {
    const services = {
      persistence: !!this.persistenceService,
      indexManager: !!this.indexManager,
      vectorStore: !!this.vectorStore
    };

    const healthyServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.keys(services).length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (healthyServices === totalServices) {
      status = 'healthy';
      message = 'All services operational';
    } else if (healthyServices >= 2) {
      status = 'degraded';
      message = `${healthyServices}/${totalServices} services operational`;
    } else {
      status = 'unhealthy';
      message = `Only ${healthyServices}/${totalServices} services operational`;
    }

    logger.systemLog(message, 'HnswCoordinator');
    return { status, services, message };
  }
}

// Export the new simplified coordinator
export { HnswCoordinator };