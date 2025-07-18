/**
 * HnswIndexOperations - Pure HNSW index load/save operations
 * Follows Single Responsibility Principle by handling only index operations
 * Now uses WasmFilesystemManager for all filesystem operations (DRY principle)
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { IndexedDbUtils } from './IndexedDbUtils';
import { IndexLoadResult, IndexSaveResult, IndexMetadata } from './HnswPersistenceOrchestrator';
import { WasmFilesystemManager } from './WasmFilesystemManager';

/**
 * Handles pure HNSW index operations (load/save)
 * Uses WasmFilesystemManager for all filesystem operations to avoid duplication
 */
export class HnswIndexOperations {
  private config: HnswConfig;
  private hnswLib: any;
  private filesystemManager: WasmFilesystemManager;

  constructor(config: HnswConfig, hnswLib: any) {
    this.config = config;
    this.hnswLib = hnswLib;
    this.filesystemManager = new WasmFilesystemManager(config, hnswLib);
    
    // PHASE 1 FIX: Don't initialize filesystem in constructor to avoid WASM timing issues
    // Filesystem will be initialized lazily when first needed
  }

  /**
   * Ensure filesystem is initialized before operations that need it
   */
  private async ensureFilesystemReady(): Promise<boolean> {
    try {
      if (!this.hnswLib?.EmscriptenFileSystemManager) {
        logger.systemLog('[PHASE1-WASM] EmscriptenFileSystemManager not available, deferring filesystem operations', 'HnswIndexOperations');
        return false;
      }
      
      await this.filesystemManager.initializeFileSystem();
      return true;
    } catch (error) {
      logger.systemWarn(`[PHASE1-WASM] Filesystem initialization failed: ${error instanceof Error ? error.message : String(error)}`, 'HnswIndexOperations');
      return false;
    }
  }

  /**
   * Load actual HNSW index from IndexedDB
   */
  async loadIndex(collectionName: string, metadata?: IndexMetadata): Promise<IndexLoadResult> {
    const startTime = Date.now();

    if (!(await this.isIndexedDbSupported())) {
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

    // PHASE 1 FIX: Check WASM readiness before attempting filesystem operations
    if (!(await this.ensureFilesystemReady())) {
      logger.systemLog(`[PHASE1-WASM] Filesystem not ready for ${collectionName}, skipping load`, 'HnswIndexOperations');
      return {
        success: false,
        errorReason: 'WASM filesystem not ready',
        loadTime: Date.now() - startTime,
      };
    }

    try {
      // Sync from IndexedDB to Emscripten FS using filesystem manager
      await this.filesystemManager.syncFromIndexedDB();

      const expectedFilename = metadata.indexFilename || IndexedDbUtils.generateSafeFilename(collectionName);
      
      // Create a new index instance with the correct parameters
      const index = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');

      // Check if file exists using filesystem manager
      const fileExists = await this.filesystemManager.checkFileExists(expectedFilename);
      
      if (!fileExists) {
        return {
          success: false,
          errorReason: `Index file ${expectedFilename} not found in WASM filesystem`,
          loadTime: Date.now() - startTime,
        };
      }

      // Initialize the index with correct parameters
      const maxElements = metadata.itemCount || 1000;
      const M = 16;
      const efConstruction = 200;
      const randomSeed = 100;
      
      index.initIndex(maxElements, M, efConstruction, randomSeed);
      
      // Load the persisted index - readIndex has a bug where it returns undefined instead of boolean
      const readIndexResult = index.readIndex(expectedFilename, maxElements);
      
      // WORKAROUND: readIndex has a bug where it returns undefined instead of boolean
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
      const loadTime = Date.now() - startTime;
      const errorMessage = `Failed to load index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
      
      logger.systemError(
        new Error(errorMessage),
        'HnswIndexOperations'
      );

      return {
        success: false,
        errorReason: errorMessage,
        loadTime,
      };
    }
  }

  /**
   * Save HNSW index with SUPERLATIVE sync coordination
   * Enhanced to work with improved batch sync system
   */
  async saveIndex(
    collectionName: string,
    hnswIndex: any,
    items: DatabaseItem[],
    isPartitioned: boolean,
    partitionCount?: number
  ): Promise<IndexSaveResult> {
    const startTime = Date.now();
    const filename = IndexedDbUtils.generateSafeFilename(collectionName);

    const filesystemReady = await this.ensureFilesystemReady();
    
    if (!filesystemReady) {
      return {
        success: false,
        filename,
        errorReason: 'WASM filesystem not ready',
        saveTime: Date.now() - startTime,
      };
    }

    try {
      const writeResult = await this.writeIndexWithoutSync(hnswIndex, filename);
      
      if (!writeResult.success) {
        return {
          success: false,
          filename,
          errorReason: `Failed to write index to WASM filesystem: ${writeResult.errorReason}`,
          saveTime: Date.now() - startTime,
        };
      }

      const syncStartTime = Date.now();
      const syncResult = await this.filesystemManager.batchSyncToIndexedDB([filename]);
      
      if (!syncResult.success) {
        return {
          success: false,
          filename,
          errorReason: `Sync to IndexedDB failed: ${syncResult.errorReason}`,
          saveTime: Date.now() - startTime,
        };
      }
      
      const syncTime = Date.now() - syncStartTime;
      const verificationStartTime = Date.now();
      const verificationSuccess = await this.filesystemManager.verifyFileExists(filename);
      const verificationTime = Date.now() - verificationStartTime;
      const totalSaveTime = Date.now() - startTime;
      const estimatedSize = this.estimateIndexSize(items.length, this.extractDimension(items));

      return {
        success: verificationSuccess,
        filename,
        saveTime: totalSaveTime,
        syncTime,
        verificationTime,
        estimatedSize,
        verified: verificationSuccess,
      };
    } catch (error) {
      const saveTime = Date.now() - startTime;
      const errorMessage = `Failed to save index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
      
      logger.systemError(new Error(errorMessage), 'HnswIndexOperations');

      return {
        success: false,
        filename,
        errorReason: errorMessage,
        saveTime,
      };
    }
  }

  /**
   * Save partitioned HNSW index with SUPERLATIVE batch processing
   * CRITICAL FIX: Eliminates concurrent syncFS operations that corrupt IndexedDB
   */
  async savePartitionedIndex(
    collectionName: string,
    partitions: Array<{ index: any; itemCount: number }>,
    items: DatabaseItem[]
  ): Promise<IndexSaveResult> {
    const startTime = Date.now();
    const baseFilename = IndexedDbUtils.generateSafeFilename(collectionName);

    
    // CRITICAL FIX: Ensure WASM filesystem is ready before attempting to save partitions
    if (!(await this.ensureFilesystemReady())) {
      logger.systemLog(`[SAVE-PARTITIONED-WASM] Filesystem not ready for ${collectionName}, cannot save partitioned index`, 'HnswIndexOperations');
      return {
        success: false,
        filename: baseFilename,
        errorReason: 'WASM filesystem not ready',
        saveTime: Date.now() - startTime,
      };
    }

    try {
      let totalEstimatedSize = 0;
      const partitionFilenames: string[] = [];

      // PHASE 1: Write all partitions to WASM filesystem WITHOUT syncing (prevents concurrent syncFS)
      for (let i = 0; i < partitions.length; i++) {
        const partition = partitions[i];
        const partitionFilename = `${baseFilename}_part_${i}`;
        partitionFilenames.push(partitionFilename);

        
        // SUPERLATIVE FIX: Use writeIndexWithoutSync to prevent automatic syncing
        const writeResult = await this.writeIndexWithoutSync(partition.index, partitionFilename);
        
        if (!writeResult.success) {
          return {
            success: false,
            filename: partitionFilename,
            errorReason: `Failed to write partition ${i} to WASM filesystem: ${writeResult.errorReason}`,
            saveTime: Date.now() - startTime,
          };
        }

        totalEstimatedSize += this.estimateIndexSize(partition.itemCount, this.extractDimension(items));
      }

      // PHASE 2: Single, coordinated sync to IndexedDB (eliminates concurrent operations)
      const syncStartTime = Date.now();
      
      const syncResult = await this.filesystemManager.batchSyncToIndexedDB(partitionFilenames);
      
      if (!syncResult.success) {
        return {
          success: false,
          filename: baseFilename,
          errorReason: `Batch sync to IndexedDB failed: ${syncResult.errorReason}`,
          saveTime: Date.now() - startTime,
        };
      }
      
      const totalSyncTime = Date.now() - syncStartTime;
      const totalSaveTime = Date.now() - startTime;

      // PHASE 3: Verification that all partitions persisted correctly
      const verificationStartTime = Date.now();
      let verificationSuccess = true;
      
      try {
        for (const filename of partitionFilenames) {
          const exists = await this.filesystemManager.verifyFileExists(filename);
          if (!exists) {
            verificationSuccess = false;
            break;
          }
        }
      } catch (error) {
        verificationSuccess = false;
      }
      
      const verificationTime = Date.now() - verificationStartTime;

      const resultMessage = verificationSuccess 
        ? `Successfully saved and verified partitioned HNSW index for ${collectionName} (${partitions.length} partitions, ${totalEstimatedSize} bytes estimated)`
        : `Saved partitioned HNSW index for ${collectionName} but verification failed (${partitions.length} partitions, ${totalEstimatedSize} bytes estimated)`;

      logger.systemLog(resultMessage, 'HnswIndexOperations');

      return {
        success: verificationSuccess,
        filename: baseFilename,
        saveTime: totalSaveTime,
        syncTime: totalSyncTime,
        verificationTime,
        estimatedSize: totalEstimatedSize,
        verified: verificationSuccess,
      };
    } catch (error) {
      const saveTime = Date.now() - startTime;
      const errorMessage = `Failed to save partitioned index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
      
      logger.systemError(
        new Error(errorMessage),
        'HnswIndexOperations'
      );

      return {
        success: false,
        filename: baseFilename,
        errorReason: errorMessage,
        saveTime,
      };
    }
  }

  /**
   * Write index to WASM filesystem WITHOUT automatic syncing
   * SUPERLATIVE enhancement to prevent concurrent syncFS operations
   */
  private async writeIndexWithoutSync(
    hnswIndex: any, 
    filename: string
  ): Promise<{ success: boolean; errorReason?: string }> {
    try {
      // Check if the index has a writeIndexWithoutSync method (newer WASM versions)
      if (typeof hnswIndex.writeIndexWithoutSync === 'function') {
        const result = await hnswIndex.writeIndexWithoutSync(filename);
        const success = result === true || result === undefined;
        return { success, errorReason: success ? undefined : 'writeIndexWithoutSync returned false' };
      }
      
      // Fallback: Temporarily disable auto-sync during write
      
      // Try to disable auto-sync if the WASM library supports it
      const hadAutoSync = this.hnswLib?.EmscriptenFileSystemManager?.getAutoSync?.();
      if (typeof this.hnswLib?.EmscriptenFileSystemManager?.setAutoSync === 'function') {
        this.hnswLib.EmscriptenFileSystemManager.setAutoSync(false);
      }
      
      try {
        const writeResult = await hnswIndex.writeIndex(filename);
        const success = writeResult === true || writeResult === undefined;
        return { success, errorReason: success ? undefined : 'writeIndex returned false' };
      } finally {
        // Re-enable auto-sync if it was previously enabled
        if (hadAutoSync && typeof this.hnswLib?.EmscriptenFileSystemManager?.setAutoSync === 'function') {
          this.hnswLib.EmscriptenFileSystemManager.setAutoSync(true);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, errorReason: errorMessage };
    }
  }

  /**
   * Load partitioned HNSW index
   */
  async loadPartitionedIndex(
    collectionName: string,
    metadata: IndexMetadata
  ): Promise<IndexLoadResult & { partitions?: any[] }> {
    const startTime = Date.now();

    if (!(await this.isIndexedDbSupported())) {
      return {
        success: false,
        errorReason: 'IndexedDB not supported',
      };
    }

    try {
      // Sync from IndexedDB using filesystem manager
      await this.filesystemManager.syncFromIndexedDB();

      const baseFilename = metadata.indexFilename || IndexedDbUtils.generateSafeFilename(collectionName);
      const partitionCount = metadata.partitionCount || 1;
      const partitions: any[] = [];

      // Load each partition
      for (let i = 0; i < partitionCount; i++) {
        const partitionFilename = `${baseFilename}_part_${i}`;
        
        // Check if partition file exists using filesystem manager
        const fileExists = await this.filesystemManager.checkFileExists(partitionFilename);
        
        if (!fileExists) {
          return {
            success: false,
            errorReason: `Partition file ${partitionFilename} not found in WASM filesystem`,
            loadTime: Date.now() - startTime,
          };
        }

        // Create and load partition index
        const partitionIndex = new this.hnswLib.HierarchicalNSW('cosine', metadata.dimension, '');
        const maxElements = Math.ceil((metadata.itemCount || 0) / partitionCount);
        
        partitionIndex.initIndex(maxElements, 16, 200, 100);
        
        const readResult = await partitionIndex.readIndex(partitionFilename, maxElements);
        if (!readResult && readResult !== undefined) {
          return {
            success: false,
            errorReason: `Failed to read partition ${i} from file ${partitionFilename}`,
            loadTime: Date.now() - startTime,
          };
        }

        partitions.push(partitionIndex);
      }

      logger.systemLog(
        `Successfully loaded partitioned HNSW index for ${collectionName} (${partitionCount} partitions)`,
        'HnswIndexOperations'
      );

      return {
        success: true,
        partitions,
        metadata,
        loadTime: Date.now() - startTime,
      };
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage = `Failed to load partitioned index for ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
      
      logger.systemError(
        new Error(errorMessage),
        'HnswIndexOperations'
      );

      return {
        success: false,
        errorReason: errorMessage,
        loadTime,
      };
    }
  }

  /**
   * Estimate index size based on items and dimensions
   */
  private estimateIndexSize(itemCount: number, dimension: number): number {
    // Rough estimation: each item takes dimension * 4 bytes (float32) + overhead
    const vectorSize = dimension * 4;
    const overhead = 64; // Approximate overhead per item
    return itemCount * (vectorSize + overhead);
  }

  /**
   * Extract dimension from items
   */
  private extractDimension(items: DatabaseItem[]): number {
    const firstEmbedding = items.find(item => item.embedding && item.embedding.length > 0)?.embedding;
    return firstEmbedding?.length || 0;
  }

  /**
   * Check if IndexedDB is supported using existing utilities
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
   * Update configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
    this.filesystemManager.updateConfig(newConfig);
  }

  /**
   * Get filesystem diagnostics
   */
  async performDiagnostics() {
    return this.filesystemManager.performDiagnostics();
  }

  /**
   * Get filesystem state
   */
  async getFilesystemState() {
    return this.filesystemManager.getFilesystemState();
  }
}