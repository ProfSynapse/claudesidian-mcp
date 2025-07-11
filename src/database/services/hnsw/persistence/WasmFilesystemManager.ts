/**
 * WasmFilesystemManager - Dedicated WASM filesystem management service
 * Follows Single Responsibility Principle by handling only WASM filesystem operations
 * Extracted from HnswIndexOperations to promote reusability and separation of concerns
 */

import { logger } from '../../../../utils/logger';
import { HnswConfig } from '../config/HnswConfig';
import { IndexedDbUtils } from './IndexedDbUtils';

export interface FilesystemState {
  initialized: boolean;
  synced: boolean;
  accessible: boolean;
  timestamp: string;
}

export interface FilesystemDiagnostics {
  status: 'healthy' | 'warning' | 'error';
  emscriptenManager: {
    available: boolean;
    initialized: boolean;
    synced: boolean;
    canCheckFiles: boolean;
  };
  indexedDb: {
    supported: boolean;
    quotaInfo: any;
  };
  recommendations: string[];
}

/**
 * Manages WASM filesystem operations with proper initialization and verification
 * Reusable across different WASM modules, not just HNSW
 */
export class WasmFilesystemManager {
  private config: HnswConfig;
  private hnswLib: any;
  private static syncQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(config: HnswConfig, hnswLib: any) {
    this.config = config;
    this.hnswLib = hnswLib;
  }

  /**
   * Initialize IDBFS filesystem to ensure proper persistence
   * This fixes the core issue where index files don't persist properly
   */
  async initializeFileSystem(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      logger.systemWarn('EmscriptenFileSystemManager not available during initialization', 'WasmFilesystemManager');
      return;
    }

    try {
      // Check if already initialized
      if (this.hnswLib.EmscriptenFileSystemManager.isInitialized?.()) {
        logger.systemLog('IDBFS already initialized', 'WasmFilesystemManager');
        this.initialized = true;
        return;
      }

      logger.systemLog('🔧 Initializing IDBFS filesystem for persistence...', 'WasmFilesystemManager');
      
      // Initialize IDBFS - this is crucial for persistence
      this.hnswLib.EmscriptenFileSystemManager.initializeFileSystem('IDBFS');
      
      // Verify initialization
      const initialized = this.hnswLib.EmscriptenFileSystemManager.isInitialized?.();
      if (initialized) {
        logger.systemLog('✅ IDBFS filesystem initialized successfully', 'WasmFilesystemManager');
        this.initialized = true;
      } else {
        logger.systemWarn('⚠️  IDBFS initialization status unclear', 'WasmFilesystemManager');
      }
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize IDBFS: ${error instanceof Error ? error.message : String(error)}`),
        'WasmFilesystemManager'
      );
    }
  }

  /**
   * Sync Emscripten FS to IndexedDB (save operation)
   */
  async syncToIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Ensure IDBFS is initialized before sync
    await this.initializeFileSystem();

    // Queue sync operations to prevent conflicts
    const syncOperation = WasmFilesystemManager.syncQueue.then(async () => {
      try {
        logger.systemLog('🔄 Syncing TO IndexedDB (save operation)', 'WasmFilesystemManager');
        
        // Verify filesystem state before sync
        const preCheckPassed = await this.verifyFilesystemState('pre-save-sync');
        logger.systemLog(`Pre-save-sync filesystem check: ${preCheckPassed ? 'PASSED' : 'FAILED'}`, 'WasmFilesystemManager');
        
        // Add small delay to batch multiple writeIndex operations
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Use Promise wrapper to ensure proper async handling with timeout
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            this.hnswLib.EmscriptenFileSystemManager.syncFS(false, (error: any) => {
              if (error) {
                logger.systemError(new Error(`syncFS callback error: ${error}`), 'WasmFilesystemManager');
                reject(error);
              } else {
                logger.systemLog('✅ Sync to IndexedDB callback executed successfully', 'WasmFilesystemManager');
                resolve();
              }
            });
          }),
          // Add timeout to prevent hanging
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Save sync operation timed out')), this.config.indexedDb.syncTimeoutMs);
          })
        ]);
        
        // Verify sync completion
        const postCheckPassed = await this.verifyFilesystemState('post-save-sync');
        logger.systemLog(`Post-save-sync filesystem check: ${postCheckPassed ? 'PASSED' : 'FAILED'}`, 'WasmFilesystemManager');
        
        // Add post-sync delay to ensure operation completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        logger.systemLog('✅ Successfully synced TO IndexedDB with verification', 'WasmFilesystemManager');
      } catch (error) {
        logger.systemError(
          new Error(`Failed to sync to IndexedDB: ${error instanceof Error ? error.message : String(error)}`),
          'WasmFilesystemManager'
        );
        throw error;
      }
    });

    WasmFilesystemManager.syncQueue = syncOperation;
    return syncOperation;
  }

  /**
   * Sync IndexedDB to Emscripten FS (load operation)
   */
  async syncFromIndexedDB(): Promise<void> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      throw new Error('EmscriptenFileSystemManager not available');
    }

    // Ensure IDBFS is initialized before sync
    await this.initializeFileSystem();

    // Queue sync operations to prevent conflicts
    const syncOperation = WasmFilesystemManager.syncQueue.then(async () => {
      const maxRetries = 5;
      const baseDelay = 150;
      let lastError: Error | null = null;
      const startTime = Date.now();
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const attemptStartTime = Date.now();
        try {
          logger.systemLog(`🔄 Syncing FROM IndexedDB (load operation) - Attempt ${attempt}/${maxRetries}`, 'WasmFilesystemManager');
          
          // Check filesystem state before sync
          const preCheckPassed = await this.verifyFilesystemState('pre-sync');
          logger.systemLog(`Pre-sync filesystem check: ${preCheckPassed ? 'PASSED' : 'FAILED'}`, 'WasmFilesystemManager');
          
          // Use Promise wrapper to ensure proper async handling with timeout
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              this.hnswLib.EmscriptenFileSystemManager.syncFS(true, (error: any) => {
                if (error) {
                  logger.systemError(new Error(`syncFS callback error: ${error}`), 'WasmFilesystemManager');
                  reject(error);
                } else {
                  logger.systemLog('✅ Sync from IndexedDB callback executed successfully', 'WasmFilesystemManager');
                  resolve();
                }
              });
            }),
            // Add timeout to prevent hanging
            new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error('Sync operation timed out')), this.config.indexedDb.syncTimeoutMs);
            })
          ]);
          
          // CRITICAL: Verify filesystem is ready and files are accessible
          const stabilizationDelay = Math.min(100 + (attempt * 25), 300);
          await new Promise(resolve => setTimeout(resolve, stabilizationDelay));
          
          // Post-sync verification
          const postCheckPassed = await this.verifyFilesystemState('post-sync');
          logger.systemLog(`Post-sync filesystem check: ${postCheckPassed ? 'PASSED' : 'FAILED'}`, 'WasmFilesystemManager');
          
          const attemptTime = Date.now() - attemptStartTime;
          const totalTime = Date.now() - startTime;
          
          logger.systemLog(
            `✅ Successfully synced FROM IndexedDB in ${attemptTime}ms (total: ${totalTime}ms, attempt ${attempt})`,
            'WasmFilesystemManager'
          );
          
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const attemptTime = Date.now() - attemptStartTime;
          
          logger.systemWarn(
            `⚠️  Sync attempt ${attempt}/${maxRetries} failed after ${attemptTime}ms: ${lastError.message}`,
            'WasmFilesystemManager'
          );
          
          if (attempt < maxRetries) {
            // Enhanced exponential backoff with jitter
            const delay = baseDelay * Math.pow(1.5, attempt - 1) + Math.random() * 50;
            logger.systemLog(`⏳ Retrying sync in ${Math.round(delay)}ms...`, 'WasmFilesystemManager');
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      const totalTime = Date.now() - startTime;
      const errorMessage = `Failed to sync from IndexedDB after ${maxRetries} attempts in ${totalTime}ms: ${lastError?.message}`;
      
      logger.systemError(new Error(errorMessage), 'WasmFilesystemManager');
      throw new Error(`Failed to sync from IndexedDB: ${lastError?.message}`);
    });

    WasmFilesystemManager.syncQueue = syncOperation;
    return syncOperation;
  }

  /**
   * Check if file exists with retry mechanism to handle sync timing issues
   */
  async checkFileExists(filename: string): Promise<boolean> {
    const maxRetries = 5;
    const baseDelay = 100;
    
    logger.systemLog(`🔍 Checking for file existence: ${filename}`, 'WasmFilesystemManager');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure filesystem is ready before checking
        const fsReady = await this.verifyFilesystemState(`file-check-${attempt}`);
        if (!fsReady) {
          logger.systemWarn(`Filesystem not ready on attempt ${attempt}`, 'WasmFilesystemManager');
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
            continue;
          }
          return false;
        }

        const exists = this.hnswLib?.EmscriptenFileSystemManager?.checkFileExists?.(filename);
        
        logger.systemLog(
          `File ${filename} existence check (attempt ${attempt}): ${exists ? 'EXISTS' : 'NOT_FOUND'}`,
          'WasmFilesystemManager'
        );
        
        if (exists) {
          logger.systemLog(`✅ File ${filename} found on attempt ${attempt}`, 'WasmFilesystemManager');
          return true;
        }
        
        if (attempt < maxRetries) {
          logger.systemLog(
            `⏳ File ${filename} not found on attempt ${attempt}, retrying in ${baseDelay * attempt}ms...`,
            'WasmFilesystemManager'
          );
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      } catch (error) {
        logger.systemWarn(
          `❌ Error checking file existence on attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
          'WasmFilesystemManager'
        );
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      }
    }
    
    logger.systemWarn(`❌ File ${filename} not found after ${maxRetries} attempts`, 'WasmFilesystemManager');
    return false;
  }

  /**
   * Verify filesystem state and readiness
   */
  async verifyFilesystemState(phase: string): Promise<boolean> {
    if (!this.hnswLib?.EmscriptenFileSystemManager) {
      return false;
    }

    try {
      // Check if filesystem is initialized
      const initialized = this.hnswLib.EmscriptenFileSystemManager.isInitialized?.();
      logger.systemLog(`[${phase}] Filesystem initialized: ${initialized}`, 'WasmFilesystemManager');

      // Check if filesystem is synced
      const synced = this.hnswLib.EmscriptenFileSystemManager.isSynced?.();
      logger.systemLog(`[${phase}] Filesystem synced: ${synced}`, 'WasmFilesystemManager');

      // Try to verify filesystem access
      const canAccess = typeof this.hnswLib.EmscriptenFileSystemManager.checkFileExists === 'function';
      logger.systemLog(`[${phase}] Filesystem accessible: ${canAccess}`, 'WasmFilesystemManager');
      
      return initialized && canAccess;
    } catch (error) {
      logger.systemWarn(`[${phase}] Filesystem verification failed: ${error}`, 'WasmFilesystemManager');
      return false;
    }
  }

  /**
   * Get current filesystem state
   */
  async getFilesystemState(): Promise<FilesystemState> {
    const state = await this.verifyFilesystemState('state-check');
    return {
      initialized: this.hnswLib?.EmscriptenFileSystemManager?.isInitialized?.() || false,
      synced: this.hnswLib?.EmscriptenFileSystemManager?.isSynced?.() || false,
      accessible: state,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Comprehensive diagnostic method for troubleshooting WASM filesystem issues
   */
  async performDiagnostics(): Promise<FilesystemDiagnostics> {
    const diagnostics = {
      emscriptenManager: {
        available: !!this.hnswLib?.EmscriptenFileSystemManager,
        initialized: false,
        synced: false,
        canCheckFiles: false,
      },
      indexedDb: {
        supported: false,
        quotaInfo: null as any,
      },
    };

    const recommendations: string[] = [];

    try {
      // Check Emscripten FileSystemManager
      if (this.hnswLib?.EmscriptenFileSystemManager) {
        diagnostics.emscriptenManager.initialized = 
          this.hnswLib.EmscriptenFileSystemManager.isInitialized?.() || false;
        diagnostics.emscriptenManager.synced = 
          this.hnswLib.EmscriptenFileSystemManager.isSynced?.() || false;
        diagnostics.emscriptenManager.canCheckFiles = 
          typeof this.hnswLib.EmscriptenFileSystemManager.checkFileExists === 'function';

        if (!diagnostics.emscriptenManager.initialized) {
          recommendations.push('Call initializeFileSystem() before operations');
        }
        if (!diagnostics.emscriptenManager.synced) {
          recommendations.push('Ensure sync operations complete successfully');
        }
        if (!diagnostics.emscriptenManager.canCheckFiles) {
          recommendations.push('Update hnswlib-wasm to version with file checking support');
        }
      } else {
        recommendations.push('Ensure hnswlib-wasm is properly loaded');
      }

      // Check IndexedDB support using existing utility
      try {
        const storageInfo = await IndexedDbUtils.checkIndexedDbSupport();
        diagnostics.indexedDb.supported = storageInfo.supported;
        diagnostics.indexedDb.quotaInfo = storageInfo;

        if (!storageInfo.supported) {
          recommendations.push('Use a modern browser with IndexedDB support');
        }
      } catch (error) {
        recommendations.push('Check browser compatibility and permissions');
      }

      // Determine overall status
      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      if (recommendations.length > 3) {
        status = 'error';
      } else if (recommendations.length > 0) {
        status = 'warning';
      }

      logger.systemLog(
        `🔍 WASM Filesystem Diagnostics [${status.toUpperCase()}]: ${recommendations.length} issues found`,
        'WasmFilesystemManager'
      );

      return {
        status,
        emscriptenManager: diagnostics.emscriptenManager,
        indexedDb: diagnostics.indexedDb,
        recommendations,
      };
    } catch (error) {
      logger.systemError(
        new Error(`Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`),
        'WasmFilesystemManager'
      );

      return {
        status: 'error',
        emscriptenManager: diagnostics.emscriptenManager,
        indexedDb: diagnostics.indexedDb,
        recommendations: ['Fix diagnostic errors before proceeding'],
      };
    }
  }

  /**
   * Update configuration and reinitialize if needed
   */
  updateConfig(newConfig: HnswConfig): void {
    const oldConfig = this.config;
    this.config = newConfig;

    // Reinitialize filesystem if persistence settings changed
    if (oldConfig.persistence.enabled !== newConfig.persistence.enabled) {
      logger.systemLog('Persistence settings changed, reinitializing filesystem...', 'WasmFilesystemManager');
      this.initialized = false;
      this.initializeFileSystem();
    }
  }
}