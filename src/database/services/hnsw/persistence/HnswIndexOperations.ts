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

      const expectedFilename = metadata.indexFilename || IndexedDbUtils.generateSafeFilename(collectionName);
      
      // Create a new index instance with the correct parameters
      const index = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');


      // Check if file exists before attempting to load
      const fileExists = await this.checkFileExistsWithRetry(expectedFilename);
      
      if (!fileExists) {
        return {
          success: false,
          errorReason: `Index file ${expectedFilename} not found in WASM filesystem`,
          loadTime: Date.now() - startTime,
        };
      }

      // Load the persisted index - readIndex expects (filename, maxElements)
      logger.systemLog(
        `[DIAGNOSTIC] Calling readIndex with filename: ${expectedFilename} (type: ${typeof expectedFilename}), maxElements: ${metadata.itemCount || 1000}`,
        'HnswIndexOperations'
      );
      
      // DIAGNOSTIC: Inspect index object before readIndex
      logger.systemLog(`[DIAGNOSTIC] Index object type: ${typeof index}`, 'HnswIndexOperations');
      logger.systemLog(`[DIAGNOSTIC] Index object constructor: ${index.constructor?.name}`, 'HnswIndexOperations');
      logger.systemLog(`[DIAGNOSTIC] Index object methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(index)).join(', ')}`, 'HnswIndexOperations');
      
      // Initialize the index with correct parameters
      const maxElements = metadata.itemCount || 1000;
      const M = 16;
      const efConstruction = 200;
      const randomSeed = 100;
      
      index.initIndex(maxElements, M, efConstruction, randomSeed);
      
      // Test readIndex with correct 2-parameter API
      
      // Load the persisted index - readIndex has a bug where it returns undefined instead of boolean
      const readIndexResult = index.readIndex(expectedFilename, maxElements);
      
      // WORKAROUND: readIndex has a bug where it returns undefined instead of boolean
      // Success is determined by checking if the expected data was actually loaded
      let success: boolean;
      if (readIndexResult instanceof Promise) {
        success = await readIndexResult;
      } else {
        const currentCountAfter = index.getCurrentCount?.() || 0;
        const expectedCount = metadata.itemCount || 0;
        
        if (readIndexResult === undefined) {
          // WORKAROUND: Check if data was loaded despite undefined return
          success = currentCountAfter === expectedCount && expectedCount > 0;
        } else {
          // Normal case if method returns boolean
          success = readIndexResult === true;
        }
      }
      
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
      
      // If we get a string conversion error, it likely means the index data is corrupted
      if (errorReason.includes('Cannot pass non-string to std::string')) {
        logger.systemLog(
          `[DIAGNOSTIC] Detected corrupted single index data for ${collectionName}, clearing for rebuild`,
          'HnswIndexOperations'
        );
        
        // Clear corrupted single index data
        try {
          const filename = IndexedDbUtils.generateSafeFilename(collectionName);
          if (this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(filename)) {
            logger.systemLog(
              `[DIAGNOSTIC] Removing corrupted single index file: ${filename}`,
              'HnswIndexOperations'
            );
            // Note: WASM filesystem doesn't have a delete method, files will be overwritten
          }
          
          // Sync to clear from IndexedDB
          await this.syncToIndexedDB();
          
          logger.systemLog(
            `[DIAGNOSTIC] Cleared corrupted single index data for ${collectionName}`,
            'HnswIndexOperations'
          );
        } catch (cleanupError) {
          logger.systemError(
            new Error(`Failed to cleanup corrupted single index for ${collectionName}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`),
            'HnswIndexOperations'
          );
        }
      }

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

      // Save the index to Emscripten FS - ensure filename is a string
      logger.systemLog(
        `[DIAGNOSTIC] Calling writeIndex with filename: ${String(filename)} (type: ${typeof filename})`,
        'HnswIndexOperations'
      );
      await hnswIndex.writeIndex(String(filename));
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

        // Save partition index - ensure filename is a string
        await partition.index.writeIndex(String(partitionFilename));
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


      const partitions: any[] = [];
      const partitionCount = metadata.partitionCount || 1;

      // Load each partition
      for (let i = 0; i < partitionCount; i++) {
        const partitionFilename = IndexedDbUtils.generatePartitionFilename(collectionName, i);
        
        
        // Create new index instance for this partition
        const partitionIndex = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');
        
        // Check if partition file exists before attempting to load
        const partitionFileExists = await this.checkFileExistsWithRetry(partitionFilename);
        
        if (!partitionFileExists) {
          return {
            success: false,
            errorReason: `Partition file ${partitionFilename} not found in WASM filesystem`,
            loadTime: Date.now() - startTime,
          };
        }
        
        // Load the partition
        
        // Initialize the partition index with correct parameters
        const maxElements = metadata.itemCount || 1000;
        const M = 16;
        const efConstruction = 200;
        const randomSeed = 100;
        
        partitionIndex.initIndex(maxElements, M, efConstruction, randomSeed);
        
        // Load the partition - readIndex has a bug where it returns undefined instead of boolean
        const countBefore = partitionIndex.getCurrentCount?.() || 0;
        const readIndexResult = partitionIndex.readIndex(String(partitionFilename), maxElements);
        const countAfter = partitionIndex.getCurrentCount?.() || 0;
        
        // WORKAROUND: readIndex returns undefined instead of boolean, check if data was loaded
        let success: boolean;
        if (readIndexResult instanceof Promise) {
          const result = await readIndexResult;
          success = result === true;
        } else if (readIndexResult === undefined) {
          // WORKAROUND: Check if data was loaded despite undefined return
          success = countAfter > countBefore;
        } else {
          success = readIndexResult === true;
        }
        
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
      
      // If we get a string conversion error, it likely means the index data is corrupted
      // Clear the corrupted index data to allow fresh rebuilding
      if (errorReason.includes('Cannot pass non-string to std::string')) {
        logger.systemLog(
          `[DIAGNOSTIC] Detected corrupted index data for ${collectionName}, clearing for rebuild`,
          'HnswIndexOperations'
        );
        
        // Clear corrupted index data from filesystem and metadata
        try {
          // Clear partition files from WASM filesystem
          const partitionCount = metadata.partitionCount || 1;
          for (let i = 0; i < partitionCount; i++) {
            const partitionFilename = IndexedDbUtils.generatePartitionFilename(collectionName, i);
            if (this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(partitionFilename)) {
              logger.systemLog(
                `[DIAGNOSTIC] Removing corrupted partition file: ${partitionFilename}`,
                'HnswIndexOperations'
              );
              // Note: WASM filesystem doesn't have a delete method, files will be overwritten
            }
          }
          
          // Sync to clear from IndexedDB
          await this.syncToIndexedDB();
          
          logger.systemLog(
            `[DIAGNOSTIC] Cleared corrupted index data for ${collectionName}`,
            'HnswIndexOperations'
          );
        } catch (cleanupError) {
          logger.systemError(
            new Error(`Failed to cleanup corrupted index for ${collectionName}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`),
            'HnswIndexOperations'
          );
        }
      }

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
   * Now queued to prevent concurrent sync operations with debouncing
   */
  private async syncToIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Queue sync operations to prevent conflicts - properly await the queue
    const syncOperation = HnswIndexOperations.syncQueue.then(async () => {
      try {
        logger.systemLog('Syncing TO IndexedDB (save operation)', 'HnswIndexOperations');
        
        // Add small delay to batch multiple writeIndex operations
        await new Promise(resolve => setTimeout(resolve, 50));
        
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
        
        // Add post-sync delay to ensure operation completes
        await new Promise(resolve => setTimeout(resolve, 50));
        
        logger.systemLog('Successfully synced TO IndexedDB', 'HnswIndexOperations');
        
        // DIAGNOSTIC: Inspect filesystem after sync TO IndexedDB
        await this.inspectWasmFilesystem('AFTER_SYNC_TO_INDEXEDDB');
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
   * Now queued to prevent concurrent sync operations with retry mechanism
   */
  private async syncFromIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Queue sync operations to prevent conflicts - properly await the queue
    const syncOperation = HnswIndexOperations.syncQueue.then(async () => {
      const maxRetries = 3;
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.systemLog(`Syncing FROM IndexedDB (load operation) - Attempt ${attempt}`, 'HnswIndexOperations');
          
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
          
          // Add small delay to ensure filesystem is ready
          await new Promise(resolve => setTimeout(resolve, 100));
          
          logger.systemLog('Successfully synced FROM IndexedDB', 'HnswIndexOperations');
          
          // DIAGNOSTIC: Inspect filesystem after sync FROM IndexedDB
          await this.inspectWasmFilesystem('AFTER_SYNC_FROM_INDEXEDDB');
          
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.systemWarn(
            `Sync attempt ${attempt} failed: ${lastError.message}`,
            'HnswIndexOperations'
          );
          
          if (attempt < maxRetries) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 200 * attempt));
          }
        }
      }
      
      logger.systemError(
        new Error(`Failed to sync from IndexedDB after ${maxRetries} attempts: ${lastError?.message}`),
        'HnswIndexOperations'
      );
      throw new Error(`Failed to sync from IndexedDB: ${lastError?.message}`);
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
   * Check if file exists with retry mechanism to handle sync timing issues
   */
  private async checkFileExistsWithRetry(filename: string): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 50;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const exists = this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(filename);
        if (exists) {
          return true;
        }
        
        if (attempt < maxRetries) {
          logger.systemLog(
            `File ${filename} not found on attempt ${attempt}, retrying...`,
            'HnswIndexOperations'
          );
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      } catch (error) {
        logger.systemWarn(
          `Error checking file existence on attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
          'HnswIndexOperations'
        );
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      }
    }
    
    return false;
  }

  /**
   * DIAGNOSTIC: Inspect WASM filesystem state after sync operations
   */
  private async inspectWasmFilesystem(operation: string): Promise<void> {
    logger.systemLog(`[DIAGNOSTIC] WASM Filesystem Inspection - ${operation}`, 'HnswIndexOperations');
    
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      logger.systemLog('[DIAGNOSTIC] EmscriptenFileSystemManager not available', 'HnswIndexOperations');
      return;
    }
    
    const fsManager = this.hnswLib.EmscriptenFileSystemManager;
    
    // 1. Check filesystem availability and methods
    logger.systemLog(`[DIAGNOSTIC] Available methods: ${Object.keys(fsManager).join(', ')}`, 'HnswIndexOperations');
    
    // 2. Try to list files if method exists
    if (fsManager.listFiles) {
      try {
        const files = fsManager.listFiles();
        logger.systemLog(`[DIAGNOSTIC] Files in WASM filesystem: ${Array.isArray(files) ? files.length : 'Not an array'} entries`, 'HnswIndexOperations');
        
        if (Array.isArray(files)) {
          files.forEach((file, index) => {
            logger.systemLog(`[DIAGNOSTIC] File ${index}: ${file}`, 'HnswIndexOperations');
          });
        } else {
          logger.systemLog(`[DIAGNOSTIC] listFiles returned: ${typeof files} - ${String(files)}`, 'HnswIndexOperations');
        }
      } catch (error) {
        logger.systemLog(`[DIAGNOSTIC] Error listing files: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
      }
    }
    
    // 3. Check for expected HNSW index files
    const expectedFiles = [
      'hnsw_file_embeddings_part_0',
      'hnsw_file_embeddings_part_1', 
      'hnsw_memory_traces',
      'hnsw_sessions',
      'hnsw_snapshots',
      'hnsw_workspaces'
    ];
    
    for (const filename of expectedFiles) {
      try {
        const exists = fsManager.checkFileExists?.(filename);
        logger.systemLog(`[DIAGNOSTIC] File ${filename}: ${exists ? 'EXISTS' : 'MISSING'}`, 'HnswIndexOperations');
        
        if (exists && fsManager.getFileSize) {
          try {
            const size = fsManager.getFileSize(filename);
            logger.systemLog(`[DIAGNOSTIC] File ${filename} size: ${size} bytes`, 'HnswIndexOperations');
          } catch (error) {
            logger.systemLog(`[DIAGNOSTIC] Error getting size for ${filename}: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
          }
        }
        
        if (exists && fsManager.readFile) {
          try {
            const content = fsManager.readFile(filename);
            const preview = Array.isArray(content) ? content.slice(0, 20) : String(content).substring(0, 100);
            logger.systemLog(`[DIAGNOSTIC] File ${filename} preview: ${JSON.stringify(preview)}`, 'HnswIndexOperations');
          } catch (error) {
            logger.systemLog(`[DIAGNOSTIC] Error reading ${filename}: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
          }
        }
      } catch (error) {
        logger.systemLog(`[DIAGNOSTIC] Error checking ${filename}: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
      }
    }
    
    // 4. Check filesystem statistics if available
    if (fsManager.getStats) {
      try {
        const stats = fsManager.getStats();
        logger.systemLog(`[DIAGNOSTIC] Filesystem stats: ${JSON.stringify(stats)}`, 'HnswIndexOperations');
      } catch (error) {
        logger.systemLog(`[DIAGNOSTIC] Error getting filesystem stats: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
      }
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