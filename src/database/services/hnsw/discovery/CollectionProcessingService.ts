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
   * NEW: Check processed files state to avoid unnecessary processing
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

      // NEW: Check if we can skip processing based on state
      const stateManager = this.getStateManager(app);
      if (stateManager && await this.shouldSkipProcessing(stateManager, vectorStore, app)) {
        logger.systemLog('[COLLECTION-PROCESSING] ⚡ Skipping collection processing - files already processed', 'CollectionProcessingService');
        return result;
      }

      // Get all collections from vector store
      let collections: string[];
      try {
        const allCollections = await vectorStore.listCollections();
        
        if (discoveredCollections && discoveredCollections.length > 0) {
          // Merge discovered collections with all collections to ensure completeness
          const allCollectionsSet = new Set(allCollections);
          for (const discovered of discoveredCollections) {
            allCollectionsSet.add(discovered);
          }
          collections = Array.from(allCollectionsSet) as string[];
        } else {
          collections = allCollections;
        }
      } catch (error) {
        logger.systemError(
          new Error(`Failed to list collections from vector store: ${error instanceof Error ? error.message : String(error)}`),
          'CollectionProcessingService'
        );
        collections = discoveredCollections || [];
      }
      
      logger.systemLog(`[COLLECTION-PROCESSING] Processing ${collections.length} collections`, 'CollectionProcessingService');

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
    
    const count = await vectorStore.count(collectionName);
    
    if (count === 0) {
      return this.indexManager.hasIndex(collectionName) 
        ? { built: false, loaded: true, skipped: false }
        : { built: false, loaded: false, skipped: true };
    }

    // Check if index already exists
    if (this.indexManager.hasIndex(collectionName)) {
      return { built: false, loaded: true, skipped: false };
    }

    // Attempt to load from persistence first
    const indexLoadedFromPersistence = await this.tryLoadFromPersistence(collectionName);
    
    if (!indexLoadedFromPersistence) {
      const built = await this.buildFreshIndex(collectionName, vectorStore, count);
      
      if (!built) {
        logger.systemError(
          new Error(`Fresh index building FAILED for ${collectionName} with ${count} items`),
          'CollectionProcessingService'
        );
      }
      
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
      if (this.indexManager && typeof (this.indexManager as any).loadExistingIndex === 'function') {
        const loaded = await (this.indexManager as any).loadExistingIndex(collectionName);
        return !!loaded;
      }
      return false;
    } catch (error) {
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
      const items = await vectorStore.getAllItems(collectionName, { 
        limit: count,
        include: ['embeddings']
      });
      
      const databaseItems = this.conversionService.convertToDatabaseItems(items);
      
      if (databaseItems.length === 0) {
        logger.systemWarn(`No valid items with embeddings found in collection: ${collectionName}`, 'CollectionProcessingService');
        return false;
      }

      const result = await this.indexManager.createOrUpdateIndex(collectionName, databaseItems);
      
      if (!result.success) {
        logger.systemWarn(`Failed to build index for ${collectionName}: ${result.itemsSkipped} items skipped`, 'CollectionProcessingService');
      }
      
      return result.success;
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
   * Get state manager from app context
   */
  private getStateManager(app?: any): any {
    try {
      return app?.plugins?.plugins?.['claudesidian-mcp']?.services?.stateManager;
    } catch (error) {
      logger.systemWarn(`Failed to get state manager: ${error instanceof Error ? error.message : String(error)}`, 'CollectionProcessingService');
      return null;
    }
  }

  /**
   * Check if we should skip processing based on processed files state
   */
  private async shouldSkipProcessing(stateManager: any, vectorStore: any, app?: any): Promise<boolean> {
    try {
      const processedCount = stateManager.getProcessedFilesCount();
      
      if (processedCount === 0) {
        return false; // No processed files, need to process
      }
      
      // Check if we have a reasonable number of processed files
      const vaultFiles = app?.vault?.getMarkdownFiles?.() || [];
      const totalFiles = vaultFiles.length;
      
      // Skip if we have processed files and they represent a significant portion of the vault
      if (processedCount > 0 && totalFiles > 0 && processedCount >= Math.min(totalFiles * 0.8, 10)) {
        // Check if collection has data that matches our state
        const collectionCount = await vectorStore.count('file_embeddings');
        if (collectionCount > 0) {
          logger.systemLog(`[COLLECTION-PROCESSING] State indicates ${processedCount} files processed, collection has ${collectionCount} items`, 'CollectionProcessingService');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.systemWarn(`Failed to check if processing should be skipped: ${error instanceof Error ? error.message : String(error)}`, 'CollectionProcessingService');
      return false; // If we can't determine, err on the side of processing
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