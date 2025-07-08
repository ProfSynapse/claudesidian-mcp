/**
 * HnswIndexOperations - Pure HNSW index load/save operations
 * Follows Single Responsibility Principle by handling only index operations
 * Boy Scout Rule: Extracted from the monolithic HnswPersistenceService for better separation
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { IndexedDbUtils } from './IndexedDbUtils';
import { IndexLoadResult, IndexSaveResult, IndexMetadata } from './HnswPersistenceOrchestrator';

/**
 * Handles pure HNSW index operations (load/save)
 * Extracted from HnswPersistenceService to follow SRP
 */
export class HnswIndexOperations {
  private config: HnswConfig;
  private hnswLib: any;
  private static syncQueue: Promise<void> = Promise.resolve();

  constructor(config: HnswConfig, hnswLib: any) {
    this.config = config;
    this.hnswLib = hnswLib;
  }

  /**
   * Load actual HNSW index from IndexedDB
   * Extracted from HnswPersistenceService.loadIndex() (lines 169-231)
   */
  async loadIndex(collectionName: string, metadata?: IndexMetadata): Promise<IndexLoadResult> {
    const startTime = Date.now();

    if (!this.isIndexedDbSupported()) {
      return {
        success: false,
        errorReason: 'IndexedDB not supported',
      };
    }

    if (!metadata) {
      return {
        success: false,
        errorReason: 'No metadata provided',
      };
    }

    try {
      // Sync from IndexedDB to Emscripten FS
      await this.syncFromIndexedDB();

      // Create a new index instance with the correct parameters
      const index = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, null);

      // Diagnostic logging to identify filename mismatch
      const expectedFilename = metadata.indexFilename || IndexedDbUtils.generateSafeFilename(collectionName);
      const fallbackFilename = `hnsw_${collectionName}`;
      
      logger.systemLog(
        `Attempting to load index for ${collectionName}. Expected filename: ${expectedFilename}, Fallback: ${fallbackFilename}`,
        'HnswIndexOperations'
      );

      // List files in WASM filesystem after sync
      logger.systemLog(
        `EmscriptenFileSystemManager available: ${!!this.hnswLib?.EmscriptenFileSystemManager}`,
        'HnswIndexOperations'
      );
      
      if (this.hnswLib?.EmscriptenFileSystemManager) {
        const fsManager = this.hnswLib.EmscriptenFileSystemManager;
        logger.systemLog(
          `listFiles method available: ${!!fsManager.listFiles}`,
          'HnswIndexOperations'
        );
        
        if (fsManager.listFiles) {
          try {
            const wasmFiles = fsManager.listFiles();
            logger.systemLog(
              `WASM filesystem files after sync: ${Array.isArray(wasmFiles) ? wasmFiles.join(', ') : 'Not an array: ' + typeof wasmFiles}`,
              'HnswIndexOperations'
            );
          } catch (error) {
            logger.systemLog(
              `Error listing WASM files: ${error instanceof Error ? error.message : String(error)}`,
              'HnswIndexOperations'
            );
          }
        }
      }

      // Check if file exists before attempting to load
      logger.systemLog(
        `checkFileExists method available: ${!!this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists}`,
        'HnswIndexOperations'
      );
      
      const fileExists = this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(expectedFilename);
      logger.systemLog(
        `File existence check for ${expectedFilename}: ${fileExists}`,
        'HnswIndexOperations'
      );
      
      if (!fileExists) {
        logger.systemLog(
          `Index file ${expectedFilename} does not exist in WASM filesystem`,
          'HnswIndexOperations'
        );
        return {
          success: false,
          errorReason: `Index file ${expectedFilename} not found in WASM filesystem`,
          loadTime: Date.now() - startTime,
        };
      }

      // Load the persisted index
      const success = await index.readIndex(expectedFilename, false);
      if (!success) {
        return {
          success: false,
          errorReason: `Failed to read index from file ${expectedFilename}`,
          loadTime: Date.now() - startTime,
        };
      }

      logger.systemLog(
        `Successfully loaded HNSW index for ${collectionName} (${metadata.itemCount || 0} items, ${metadata.dimension || 0}D)`,
        'HnswIndexOperations'
      );

      return {
        success: true,
        index,
        metadata,
        loadTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorReason = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.systemError(
        new Error(`Failed to load index for ${collectionName}: ${errorReason}`),
        'HnswIndexOperations'
      );

      return {
        success: false,
        errorReason,
        loadTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Save actual HNSW index to IndexedDB
   * Extracted from HnswPersistenceService.saveIndex() (lines 242-329)
   */
  async saveIndex(
    collectionName: string,
    hnswIndex: any,
    items: DatabaseItem[],
    isPartitioned: boolean,
    partitionCount?: number
  ): Promise<IndexSaveResult> {
    const startTime = Date.now();

    if (!this.config.persistence.enabled || !this.isIndexedDbSupported()) {
      return {
        success: false,
        filename: '',
        errorReason: 'Persistence disabled or IndexedDB not supported',
      };
    }

    try {
      const filename = IndexedDbUtils.generateSafeFilename(collectionName);
      const estimatedSize = IndexedDbUtils.estimateIndexSize(
        items.length,
        this.extractDimension(items),
        isPartitioned
      );

      // Check storage quota before saving
      const hasSpace = await IndexedDbUtils.validateStorageQuota(estimatedSize);
      if (!hasSpace) {
        return {
          success: false,
          filename,
          errorReason: 'Insufficient storage space',
          estimatedSize,
        };
      }

      // Save the index to Emscripten FS
      await hnswIndex.writeIndex(filename);
      const saveTime = Date.now() - startTime;

      // Sync to IndexedDB
      const syncStartTime = Date.now();
      await this.syncToIndexedDB();
      const syncTime = Date.now() - syncStartTime;

      logger.systemLog(
        `Successfully saved HNSW index for ${collectionName} (${items.length} items, ${estimatedSize} bytes estimated)`,
        'HnswIndexOperations'
      );

      return {
        success: true,
        filename,
        saveTime,
        syncTime,
        estimatedSize,
      };
    } catch (error) {
      const errorReason = `Save failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.systemError(
        new Error(`Failed to save index for ${collectionName}: ${errorReason}`),
        'HnswIndexOperations'
      );

      return {
        success: false,
        filename: IndexedDbUtils.generateSafeFilename(collectionName),
        saveTime: Date.now() - startTime,
        errorReason,
      };
    }
  }

  /**
   * Save partition indexes to IndexedDB
   * Extracted from HnswPersistenceService.savePartitionedIndex() (lines 338-435)
   */
  async savePartitionedIndex(
    collectionName: string,
    partitions: Array<{ index: any; itemCount: number }>,
    items: DatabaseItem[]
  ): Promise<IndexSaveResult> {
    const startTime = Date.now();

    if (!this.config.persistence.enabled || !this.isIndexedDbSupported()) {
      return {
        success: false,
        filename: '',
        errorReason: 'Persistence disabled or IndexedDB not supported',
      };
    }

    try {
      const baseFilename = IndexedDbUtils.generateSafeFilename(collectionName);
      let totalEstimatedSize = 0;
      const savedPartitions: string[] = [];

      // Save each partition
      for (let i = 0; i < partitions.length; i++) {
        const partition = partitions[i];
        const partitionFilename = IndexedDbUtils.generatePartitionFilename(collectionName, i);
        
        const partitionSize = IndexedDbUtils.estimateIndexSize(
          partition.itemCount,
          this.extractDimension(items),
          false
        );
        totalEstimatedSize += partitionSize;

        // Save partition index
        await partition.index.writeIndex(partitionFilename);
        savedPartitions.push(partitionFilename);
      }

      // Check total storage quota
      const hasSpace = await IndexedDbUtils.validateStorageQuota(totalEstimatedSize);
      if (!hasSpace) {
        return {
          success: false,
          filename: baseFilename,
          errorReason: 'Insufficient storage space for partitioned index',
          estimatedSize: totalEstimatedSize,
        };
      }

      const saveTime = Date.now() - startTime;

      // Sync all partitions to IndexedDB
      const syncStartTime = Date.now();
      await this.syncToIndexedDB();
      const syncTime = Date.now() - syncStartTime;

      logger.systemLog(
        `Successfully saved partitioned HNSW index for ${collectionName} (${partitions.length} partitions, ${totalEstimatedSize} bytes estimated)`,
        'HnswIndexOperations'
      );

      return {
        success: true,
        filename: baseFilename,
        saveTime,
        syncTime,
        estimatedSize: totalEstimatedSize,
      };
    } catch (error) {
      const errorReason = `Partitioned save failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.systemError(
        new Error(`Failed to save partitioned index for ${collectionName}: ${errorReason}`),
        'HnswIndexOperations'
      );

      return {
        success: false,
        filename: IndexedDbUtils.generateSafeFilename(collectionName),
        saveTime: Date.now() - startTime,
        errorReason,
      };
    }
  }

  /**
   * Load partitioned index from IndexedDB
   * Extracted from HnswPersistenceService.loadPartitionedIndex() (lines 442-507)
   */
  async loadPartitionedIndex(
    collectionName: string, 
    metadata: IndexMetadata
  ): Promise<IndexLoadResult & { partitions?: any[] }> {
    const startTime = Date.now();

    if (!this.isIndexedDbSupported() || !metadata.isPartitioned) {
      return {
        success: false,
        errorReason: 'IndexedDB not supported or index not partitioned',
      };
    }

    try {
      // Sync from IndexedDB
      await this.syncFromIndexedDB();

      // List files in WASM filesystem after sync
      logger.systemLog(
        `EmscriptenFileSystemManager available (partitioned): ${!!this.hnswLib?.EmscriptenFileSystemManager}`,
        'HnswIndexOperations'
      );
      
      if (this.hnswLib?.EmscriptenFileSystemManager) {
        const fsManager = this.hnswLib.EmscriptenFileSystemManager;
        logger.systemLog(
          `listFiles method available (partitioned): ${!!fsManager.listFiles}`,
          'HnswIndexOperations'
        );
        
        if (fsManager.listFiles) {
          try {
            const wasmFiles = fsManager.listFiles();
            logger.systemLog(
              `WASM filesystem files after sync (partitioned): ${Array.isArray(wasmFiles) ? wasmFiles.join(', ') : 'Not an array: ' + typeof wasmFiles}`,
              'HnswIndexOperations'
            );
          } catch (error) {
            logger.systemLog(
              `Error listing WASM files (partitioned): ${error instanceof Error ? error.message : String(error)}`,
              'HnswIndexOperations'
            );
          }
        }
      }

      const partitions: any[] = [];
      const partitionCount = metadata.partitionCount || 1;

      // Load each partition
      for (let i = 0; i < partitionCount; i++) {
        const partitionFilename = IndexedDbUtils.generatePartitionFilename(collectionName, i);
        
        logger.systemLog(
          `Attempting to load partition ${i} for ${collectionName}. Expected filename: ${partitionFilename}`,
          'HnswIndexOperations'
        );
        
        // Create new index instance for this partition
        const partitionIndex = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, null);
        
        // Check if partition file exists before attempting to load
        logger.systemLog(
          `checkFileExists method available for partition: ${!!this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists}`,
          'HnswIndexOperations'
        );
        
        const partitionFileExists = this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(partitionFilename);
        logger.systemLog(
          `Partition file existence check for ${partitionFilename}: ${partitionFileExists}`,
          'HnswIndexOperations'
        );
        
        if (!partitionFileExists) {
          logger.systemLog(
            `Partition file ${partitionFilename} does not exist in WASM filesystem`,
            'HnswIndexOperations'
          );
          return {
            success: false,
            errorReason: `Partition file ${partitionFilename} not found in WASM filesystem`,
            loadTime: Date.now() - startTime,
          };
        }
        
        // Load the partition
        const success = await partitionIndex.readIndex(partitionFilename, false);
        if (!success) {
          return {
            success: false,
            errorReason: `Failed to load partition ${i} with filename ${partitionFilename}`,
            loadTime: Date.now() - startTime,
          };
        }

        partitions.push(partitionIndex);
      }

      logger.systemLog(
        `Successfully loaded ${partitionCount} partitions for ${collectionName}`,
        'HnswIndexOperations'
      );

      return {
        success: true,
        metadata,
        partitions,
        loadTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorReason = `Partitioned load failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.systemError(
        new Error(`Failed to load partitioned index for ${collectionName}: ${errorReason}`),
        'HnswIndexOperations'
      );

      return {
        success: false,
        errorReason,
        loadTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync Emscripten FS to IndexedDB (save operation)
   * Extracted from HnswPersistenceService.syncToIndexedDB() (lines 512-531)
   * Now queued to prevent concurrent sync operations
   */
  private async syncToIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Queue sync operations to prevent conflicts - properly await the queue
    const syncOperation = HnswIndexOperations.syncQueue.then(async () => {
      try {
        logger.systemLog('Syncing TO IndexedDB (save operation)', 'HnswIndexOperations');
        
        // Use Promise wrapper to ensure proper async handling
        await new Promise<void>((resolve, reject) => {
          this.hnswLib.EmscriptenFileSystemManager.syncFS(false, (error: any) => {
            if (error) {
              logger.systemError(
                new Error(`syncFS callback error: ${error}`),
                'HnswIndexOperations'
              );
              reject(error);
            } else {
              logger.systemLog('Sync to IndexedDB callback executed', 'HnswIndexOperations');
              resolve();
            }
          });
        });
        
        logger.systemLog('Successfully synced TO IndexedDB', 'HnswIndexOperations');
      } catch (error) {
        logger.systemError(
          new Error(`Failed to sync to IndexedDB: ${error instanceof Error ? error.message : String(error)}`),
          'HnswIndexOperations'
        );
        throw new Error(`Failed to sync to IndexedDB: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    HnswIndexOperations.syncQueue = syncOperation;
    return syncOperation;
  }

  /**
   * Sync IndexedDB to Emscripten FS (load operation)
   * Extracted from HnswPersistenceService.syncFromIndexedDB() (lines 536-555)
   * Now queued to prevent concurrent sync operations
   */
  private async syncFromIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Queue sync operations to prevent conflicts - properly await the queue
    const syncOperation = HnswIndexOperations.syncQueue.then(async () => {
      try {
        logger.systemLog('Syncing FROM IndexedDB (load operation)', 'HnswIndexOperations');
        
        // Use Promise wrapper to ensure proper async handling
        await new Promise<void>((resolve, reject) => {
          this.hnswLib.EmscriptenFileSystemManager.syncFS(true, (error: any) => {
            if (error) {
              logger.systemError(
                new Error(`syncFS callback error: ${error}`),
                'HnswIndexOperations'
              );
              reject(error);
            } else {
              logger.systemLog('Sync from IndexedDB callback executed', 'HnswIndexOperations');
              resolve();
            }
          });
        });
        
        logger.systemLog('Successfully synced FROM IndexedDB', 'HnswIndexOperations');
      } catch (error) {
        logger.systemError(
          new Error(`Failed to sync from IndexedDB: ${error instanceof Error ? error.message : String(error)}`),
          'HnswIndexOperations'
        );
        throw new Error(`Failed to sync from IndexedDB: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    HnswIndexOperations.syncQueue = syncOperation;
    return syncOperation;
  }

  /**
   * Check if IndexedDB is supported
   * Uses existing IndexedDbUtils
   */
  private async isIndexedDbSupported(): Promise<boolean> {
    try {
      const storageInfo = await IndexedDbUtils.checkIndexedDbSupport();
      return storageInfo.supported;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract dimension from items
   * Extracted from HnswPersistenceService.extractDimension() (lines 746-749)
   */
  private extractDimension(items: DatabaseItem[]): number {
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    return firstEmbedding?.length || 0;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
  }
}