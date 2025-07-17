/**
 * Collection Processing Service for HNSW Search
 * Handles building missing indexes for existing collections following SRP
 */

import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { DataConversionService } from '../conversion/DataConversionService';
import { logger } from '../../../../utils/logger';

/**
 * Result of collection processing operation
 */
export interface CollectionProcessingResult {
  processed: number;
  built: number;
  loaded: number;
  skipped: number;
  errors: Array<{ collection: string; error: string }>;
}

/**
 * Service responsible for processing collections and building missing indexes
 * Follows SRP by focusing only on collection processing logic
 */
export class CollectionProcessingService {
  private config: HnswConfig;
  private indexManager: HnswIndexManager;
  private conversionService: DataConversionService;

  constructor(
    config: HnswConfig,
    indexManager: HnswIndexManager,
    conversionService: DataConversionService
  ) {
    this.config = config;
    this.indexManager = indexManager;
    this.conversionService = conversionService;
  }

  /**
   * Ensure HNSW indexes exist for all ChromaDB collections with embeddings
   * Called during initialization to build missing indexes
   */
  async ensureIndexesForExistingCollections(app?: any, discoveredCollections?: string[]): Promise<CollectionProcessingResult> {
    const result: CollectionProcessingResult = {
      processed: 0,
      built: 0,
      loaded: 0,
      skipped: 0,
      errors: []
    };

    try {
      logger.systemLog('[COLLECTION-PROCESSING] Checking collections for missing HNSW indexes', 'CollectionProcessingService');
      
      // Get reference to the vector store
      const vectorStore = this.getVectorStore(app);
      if (!vectorStore) {
        logger.systemWarn('[COLLECTION-PROCESSING] Vector store not available', 'CollectionProcessingService');
        return result;
      }

      // Use discovered collections if available, otherwise list all collections
      const collections = discoveredCollections && discoveredCollections.length > 0 
        ? discoveredCollections 
        : await vectorStore.listCollections();
      
      const source = discoveredCollections && discoveredCollections.length > 0 ? 'discovered' : 'vector store';
      logger.systemLog(`[COLLECTION-PROCESSING] Found ${collections.length} collections to process from ${source}`, 'CollectionProcessingService');
      
      // Add diagnostic logging
      console.log('[HNSW-COLLECTION-DEBUG] Collection processing info:', {
        collections,
        source,
        discoveredCollections,
        vectorStoreType: vectorStore.constructor.name,
        hasListCollections: typeof vectorStore.listCollections
      });

      // Process each collection
      for (const collectionName of collections) {
        try {
          const processed = await this.processSingleCollection(collectionName, vectorStore);
          result.processed++;
          
          if (processed.built) {
            result.built++;
          } else if (processed.loaded) {
            result.loaded++;
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.skipped++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({ collection: collectionName, error: errorMessage });
          
          logger.systemError(
            new Error(`Failed to process collection ${collectionName}: ${errorMessage}`),
            'CollectionProcessingService'
          );
        }
      }

      // Log summary
      const totalProcessed = result.built + result.loaded + result.skipped;
      logger.systemLog(
        `[COLLECTION-PROCESSING] Collection processing completed: ${result.built} built, ${result.skipped} skipped (${totalProcessed} total)`,
        'CollectionProcessingService'
      );

    } catch (error) {
      logger.systemError(
        new Error(`Failed to ensure indexes for existing collections: ${error instanceof Error ? error.message : String(error)}`),
        'CollectionProcessingService'
      );
    }

    return result;
  }

  /**
   * Process a single collection
   */
  private async processSingleCollection(
    collectionName: string, 
    vectorStore: any
  ): Promise<{ built: boolean; loaded: boolean; skipped: boolean }> {
    const startTime = Date.now();
    
    logger.systemLog(`🔍 Processing collection: ${collectionName}`, 'CollectionProcessingService');

    // Get collection info
    const count = await vectorStore.count(collectionName);
    
    // Add diagnostic logging with more details
    console.log('[HNSW-COLLECTION-PROCESSING-DEBUG] Processing collection:', {
      collectionName,
      itemCount: count,
      hasIndex: this.indexManager.hasIndex(collectionName),
      indexManagerType: this.indexManager.constructor.name,
      vectorStoreType: vectorStore.constructor.name
    });
    
    // Add additional diagnostic - try to get actual items to verify count
    try {
      const items = await vectorStore.getAllItems(collectionName, { limit: 10 });
      const actualCount = items.ids.length;
      console.log('[HNSW-COLLECTION-PROCESSING-DEBUG] Collection verification:', {
        collectionName,
        countMethod: count,
        actualItemsFound: actualCount,
        sampleIds: items.ids.slice(0, 3)
      });
    } catch (error) {
      console.log('[HNSW-COLLECTION-PROCESSING-DEBUG] Failed to verify collection:', {
        collectionName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    if (count === 0) {
      logger.systemLog(`⚠️ Collection ${collectionName} is empty - will be populated through file processing pipeline`, 'CollectionProcessingService');
      // Don't skip empty collections - they will be populated by the file processing pipeline
      // Just check if index exists and return accordingly
      if (this.indexManager.hasIndex(collectionName)) {
        return { built: false, loaded: true, skipped: false };
      } else {
        return { built: false, loaded: false, skipped: true };
      }
    }

    // Check if index already exists
    if (this.indexManager.hasIndex(collectionName)) {
      logger.systemLog(`✅ Index already exists for ${collectionName}`, 'CollectionProcessingService');
      return { built: false, loaded: true, skipped: false };
    }

    // Attempt to load from persistence first
    const indexLoadedFromPersistence = await this.tryLoadFromPersistence(collectionName);
    
    if (!indexLoadedFromPersistence) {
      // Build fresh index
      const built = await this.buildFreshIndex(collectionName, vectorStore, count);
      return { built, loaded: false, skipped: !built };
    } else {
      return { built: false, loaded: true, skipped: false };
    }
  }

  /**
   * Try to load index from persistence
   */
  private async tryLoadFromPersistence(collectionName: string): Promise<boolean> {
    try {
      // For now, we'll skip loading from persistence since the method doesn't exist
      // This would need to be implemented in the index manager
      const loaded = false;
      if (loaded) {
        logger.systemLog(`📁 Successfully loaded ${collectionName} from persistence`, 'CollectionProcessingService');
        return true;
      }
      return false;
    } catch (error) {
      logger.systemWarn(
        `Failed to load ${collectionName} from persistence: ${error instanceof Error ? error.message : String(error)}`,
        'CollectionProcessingService'
      );
      return false;
    }
  }

  /**
   * Build fresh index for collection
   */
  private async buildFreshIndex(
    collectionName: string, 
    vectorStore: any, 
    count: number
  ): Promise<boolean> {
    try {
      logger.systemLog(`🔨 Building fresh HNSW index for collection: ${collectionName} (${count} items)`, 'CollectionProcessingService');
      
      // Get all items from the collection
      const items = await vectorStore.getAllItems(collectionName, { limit: count });
      
      // Convert to DatabaseItem format
      const databaseItems = this.conversionService.convertToDatabaseItems(items);
      
      if (databaseItems.length === 0) {
        logger.systemWarn(`⚠️ No valid items with embeddings found in collection: ${collectionName}`, 'CollectionProcessingService');
        return false;
      }

      // Build the index using the index manager
      const result = await this.indexManager.createOrUpdateIndex(collectionName, databaseItems);
      
      if (result.success) {
        logger.systemLog(`✅ Successfully built fresh HNSW index for ${collectionName}: ${databaseItems.length} items indexed`, 'CollectionProcessingService');
        return true;
      } else {
        logger.systemWarn(`❌ Failed to build index for ${collectionName}: ${result.itemsSkipped} items skipped`, 'CollectionProcessingService');
        return false;
      }
    } catch (error) {
      logger.systemError(
        new Error(`Failed to build fresh index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'CollectionProcessingService'
      );
      return false;
    }
  }

  /**
   * Get vector store from app context
   */
  private getVectorStore(app?: any): any {
    try {
      return app?.plugins?.plugins?.['claudesidian-mcp']?.services?.vectorStore;
    } catch (error) {
      logger.systemWarn(`Failed to get vector store: ${error instanceof Error ? error.message : String(error)}`, 'CollectionProcessingService');
      return null;
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    totalCollectionsProcessed: number;
    indexesBuilt: number;
    indexesLoaded: number;
    collectionsSkipped: number;
  } {
    // This could be enhanced to track stats across multiple processing runs
    return {
      totalCollectionsProcessed: 0,
      indexesBuilt: 0,
      indexesLoaded: 0,
      collectionsSkipped: 0
    };
  }

  /**
   * Validate collection for indexing
   */
  async validateCollectionForIndexing(
    collectionName: string, 
    vectorStore: any
  ): Promise<{ valid: boolean; reason?: string; itemCount?: number }> {
    try {
      const count = await vectorStore.count(collectionName);
      
      if (count === 0) {
        return { valid: false, reason: 'Collection is empty', itemCount: 0 };
      }

      // For now, we'll use a reasonable default since config.performance doesn't exist
      const maxItemsPerCollection = 100000; // Reasonable default
      if (count > maxItemsPerCollection) {
        return { 
          valid: false, 
          reason: `Collection too large: ${count} > ${maxItemsPerCollection}`, 
          itemCount: count 
        };
      }

      return { valid: true, itemCount: count };
    } catch (error) {
      return { 
        valid: false, 
        reason: `Validation failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
}