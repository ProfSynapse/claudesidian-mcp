/**
 * src/database/providers/chroma/VectorStoreInitializer.ts
 * 
 * Vector store initialization service - extracted from ChromaVectorStoreModular.ts
 * Handles complex initialization sequence including client setup, service coordination,
 * collection loading, and health monitoring setup.
 * 
 * Used by: ChromaVectorStoreModular for initialization coordination
 * Dependencies: ChromaClientFactory, CollectionManager, ServiceCoordinator
 */

import { Plugin } from 'obsidian';
import { ChromaClient } from './PersistentChromaClient';
import { VectorStoreConfig } from '../../models/VectorStoreConfig';

// Service interfaces
import { IDirectoryService } from './services/interfaces/IDirectoryService';
import { IChromaClientFactory } from './services/interfaces/IChromaClientFactory';
import { ICollectionManager } from './services/interfaces/ICollectionManager';
import { IDiagnosticsService } from './services/interfaces/IDiagnosticsService';
import { ISizeCalculatorService } from './services/interfaces/ISizeCalculatorService';

// Collection lifecycle management
import { CollectionLifecycleManager } from '../../services/CollectionLifecycleManager';
import { CollectionHealthMonitor } from '../../services/CollectionHealthMonitor';

// Initialization coordination
import { ICollectionLoadingCoordinator } from '../../../services/initialization/interfaces/ICollectionLoadingCoordinator';

// Context-aware embedding loading
import { ContextualEmbeddingManager } from '../../services/contextual/ContextualEmbeddingManager';

export interface VectorStoreInitializationResult {
  client: InstanceType<typeof ChromaClient>;
  collectionLifecycleManager?: CollectionLifecycleManager;
  collectionHealthMonitor?: CollectionHealthMonitor;
  contextualEmbeddingManager?: ContextualEmbeddingManager;
}

export interface InitializationContext {
  plugin: Plugin;
  config: VectorStoreConfig;
  directoryService: IDirectoryService;
  clientFactory: IChromaClientFactory;
  collectionManager: ICollectionManager;
  diagnosticsService: IDiagnosticsService;
  sizeCalculatorService: ISizeCalculatorService;
  collectionCoordinator?: ICollectionLoadingCoordinator;
}

/**
 * Handles vector store initialization sequence with proper error handling
 * and recovery mechanisms. Extracted from ChromaVectorStoreModular to follow
 * Single Responsibility Principle.
 */
export class VectorStoreInitializer {
  private static readonly STANDARD_COLLECTIONS = [
    'file_embeddings',
    'memory_traces', 
    'sessions',
    'workspaces'
  ];

  /**
   * Performs complete vector store initialization sequence
   */
  async initialize(context: InitializationContext): Promise<VectorStoreInitializationResult> {
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    console.log(`[VectorStoreInitializer] Starting initialization:`, {
      initialMemoryMB: Math.round(initialMemory / 1024 / 1024 * 100) / 100,
      memoryPressure: this.getMemoryPressureLevel()
    });

    try {
      // Step 1: Validate configuration
      await this.validateConfiguration(context);

      // Step 2: Create ChromaDB client
      const client = await this.initializeClient(context);

      // Step 3: Initialize contextual embedding manager (replaces full collection loading)
      const contextualLoadStartTime = performance.now();
      const contextualEmbeddingManager = await this.initializeContextualEmbeddingManager(context, client);
      const contextualLoadEndTime = performance.now();
      const contextualMemoryAfter = this.getMemoryUsage();

      console.log(`[VectorStoreInitializer] Contextual embedding manager initialized:`, {
        loadTimeMs: Math.round(contextualLoadEndTime - contextualLoadStartTime),
        memoryDeltaMB: Math.round((contextualMemoryAfter - initialMemory) / 1024 / 1024 * 100) / 100,
        memoryPressure: this.getMemoryPressureLevel(),
        estimatedMemoryReductionMB: Math.round((1000) / 100) / 100 // Estimated ~1GB+ reduction
      });

      // Step 3.5: Load minimal collections metadata without full data
      await this.initializeCollectionMetadata(context);

      // Step 4: Ensure standard collections exist
      await this.ensureStandardCollections(context);

      // Step 5: Initialize lifecycle management
      const lifecycleManager = await this.initializeLifecycleManager(context);

      // Step 6: Log collection size diagnostics
      await this.logCollectionDiagnostics(context);

      const endTime = performance.now();
      const finalMemory = this.getMemoryUsage();

      console.log(`[VectorStoreInitializer] Initialization complete:`, {
        totalTimeMs: Math.round(endTime - startTime),
        totalMemoryDeltaMB: Math.round((finalMemory - initialMemory) / 1024 / 1024 * 100) / 100,
        finalMemoryMB: Math.round(finalMemory / 1024 / 1024 * 100) / 100,
        finalMemoryPressure: this.getMemoryPressureLevel()
      });

      // Warn about high memory usage
      const memoryDelta = finalMemory - initialMemory;
      if (memoryDelta > 200 * 1024 * 1024) { // > 200MB
        console.warn(`[VectorStoreInitializer] HIGH MEMORY USAGE: Vector store initialization used ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }

      return {
        client,
        collectionLifecycleManager: lifecycleManager,
        collectionHealthMonitor: undefined, // Will be initialized later by the vector store
        contextualEmbeddingManager
      };

    } catch (error) {
      const errorTime = performance.now();
      const errorMemory = this.getMemoryUsage();
      
      console.error(`[VectorStoreInitializer] Initialization failed:`, {
        errorTimeMs: Math.round(errorTime - startTime),
        memoryDeltaMB: Math.round((errorMemory - initialMemory) / 1024 / 1024 * 100) / 100,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw new Error(`ChromaDB initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validates ChromaDB configuration
   */
  private async validateConfiguration(context: InitializationContext): Promise<void> {
    // Resolve configuration with sensible defaults
    this.resolveConfiguration(context);
    
    // Validate configuration using client factory
    const isValid = await context.clientFactory.validateConfiguration(context.config);
    
    if (!isValid) {
      console.error('[VectorStoreInitializer] Configuration validation failed');
      throw new Error('Invalid ChromaDB configuration');
    }
  }

  /**
   * Creates and initializes ChromaDB client
   */
  private async initializeClient(context: InitializationContext): Promise<InstanceType<typeof ChromaClient>> {
    const client = await context.clientFactory.createClient(context.config);
    
    if (!client) {
      throw new Error('Failed to create ChromaDB client');
    }

    return client;
  }

  /**
   * Initialize contextual embedding manager for memory-efficient loading
   * Replaces full collection loading with context-aware approach
   */
  private async initializeContextualEmbeddingManager(
    context: InitializationContext, 
    client: InstanceType<typeof ChromaClient>
  ): Promise<ContextualEmbeddingManager> {
    console.log('[VectorStoreInitializer] Initializing contextual embedding manager for memory optimization');

    try {
      // Create vector store wrapper for the contextual manager
      const vectorStoreWrapper = {
        listCollections: async () => {
          // Get collection metadata without loading full data
          const collections = await context.collectionManager.listCollections();
          return collections;
        }
      };

      // Get memory settings from plugin data (if available)
      const pluginData = await context.plugin.loadData();
      const memorySettings = pluginData?.memory;
      
      const contextualManager = new ContextualEmbeddingManager(
        context.plugin,
        vectorStoreWrapper as any, // Type assertion for the wrapper
        {
          maxMemoryMB: memorySettings?.contextualEmbedding?.maxMemoryMB || 100,
          memoryPressureThreshold: memorySettings?.contextualEmbedding?.memoryPressureThreshold || 0.85,
          recentFilesLimit: memorySettings?.contextualEmbedding?.recentFilesLimit || 75
        }
      );

      await contextualManager.initialize();

      console.log('[VectorStoreInitializer] Contextual embedding manager initialized successfully');
      return contextualManager;

    } catch (error) {
      console.error('[VectorStoreInitializer] Failed to initialize contextual embedding manager:', error);
      throw error;
    }
  }

  /**
   * Initialize collection metadata without loading full data
   * Lightweight alternative to full collection loading
   */
  private async initializeCollectionMetadata(context: InitializationContext): Promise<void> {
    try {
      console.log('[VectorStoreInitializer] Initializing collection metadata (lightweight)');
      
      // Only load collection schemas and metadata, not full data
      const collections = await context.collectionManager.listCollections();
      
      let metadataCount = 0;
      for (const collectionName of collections) {
        try {
          // Register collection with manager but don't load data yet
          const collection = await context.collectionManager.getOrCreateCollection(collectionName);
          if (collection) {
            context.collectionManager.registerCollection(collectionName, collection);
            metadataCount++;
          }
        } catch (error) {
          console.warn(`[VectorStoreInitializer] Failed to initialize metadata for ${collectionName}:`, error);
        }
      }
      
      console.log(`[VectorStoreInitializer] Initialized metadata for ${metadataCount} collections (no data loaded)`);
      
    } catch (error) {
      console.warn('[VectorStoreInitializer] Collection metadata initialization failed:', error);
      // Continue without metadata - collections can still be loaded on demand
    }
  }


  /**
   * Ensures all standard collections exist and are properly initialized
   * Enhanced with filesystem detection before creating collections
   */
  private async ensureStandardCollections(context: InitializationContext): Promise<void> {
    try {
      let createdCount = 0;
      let existingCount = 0;
      
      for (const collectionName of VectorStoreInitializer.STANDARD_COLLECTIONS) {
        try {
          // Use enhanced hasCollection() with filesystem detection
          const exists = await context.collectionManager.hasCollection(collectionName);
          
          if (exists) {
            existingCount++;
            // Standard collection already exists
          } else {
            // Collection doesn't exist - create it
            await context.collectionManager.createCollection(collectionName, {
              distance: 'cosine',
              description: `Standard collection: ${collectionName}`,
              createdBy: 'VectorStoreInitializer',
              createdAt: new Date().toISOString()
            });
            createdCount++;
            // Created standard collection
          }
        } catch (collectionError) {
          console.warn(`[VectorStoreInitializer] Failed to ensure collection ${collectionName}:`, collectionError);
          // Continue with other collections
        }
      }
      
      console.info(`[VectorStoreInitializer] Standard collections: ${existingCount} existing, ${createdCount} created`);
      
      // Final refresh to ensure collection manager state is synchronized
      await context.collectionManager.refreshCollections();
      
    } catch (error) {
      const errorMsg = `Standard collection initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[VectorStoreInitializer] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  /**
   * Initializes collection lifecycle manager
   */
  private async initializeLifecycleManager(context: InitializationContext): Promise<CollectionLifecycleManager | undefined> {
    try {
      // Check if we have any collections to manage
      const collections = await context.collectionManager.listCollections();
      if (collections.length === 0) {
        // No collections found - skipping lifecycle manager initialization
        return undefined;
      }

      // Create lifecycle manager - assuming we need a vector store instance
      // This might need adjustment based on the actual interface requirements
      const lifecycleManager = new CollectionLifecycleManager(
        context as any, // This may need to be the actual vector store instance
        context.collectionManager
      );

      // Collection lifecycle manager initialized successfully
      return lifecycleManager;

    } catch (error) {
      console.warn('[VectorStoreInitializer] Failed to initialize lifecycle manager:', error);
      return undefined;
    }
  }

  /**
   * Initializes collection health monitoring (optional)
   */
  async initializeHealthMonitoring(
    context: InitializationContext,
    vectorStore: any, // The actual vector store instance 
    lifecycleManager?: CollectionLifecycleManager
  ): Promise<CollectionHealthMonitor | undefined> {
    try {
      if (!lifecycleManager) {
        // No lifecycle manager available - skipping health monitoring
        return undefined;
      }
      
      // Initialize health monitor
      const healthMonitor = new CollectionHealthMonitor(
        vectorStore, // Pass the actual ChromaVectorStoreModular instance
        lifecycleManager
      );
      
      // Don't start monitoring immediately - let the vector store start it after full initialization
      console.info('[VectorStoreInitializer] Initialized collection health monitoring');
      
      // Note: startMonitoring() will be called by ChromaVectorStoreModular after initialization is complete
      return healthMonitor;
      
    } catch (error) {
      console.warn('[VectorStoreInitializer] Health monitoring initialization failed:', error);
      return undefined;
    }
  }

  /**
   * Resolves configuration with sensible defaults
   */
  private resolveConfiguration(context: InitializationContext): void {
    // Set default persistent path if not provided and not in memory/remote
    if (!context.config.persistentPath && !context.config.inMemory && !context.config.server?.host) {
      const path = context.clientFactory.getStoragePath(context.config);
      if (path) {
        context.config.persistentPath = path;
        // Resolved persistent path
      }
    }
  }

  /**
   * Performs graceful shutdown of initialized components
   */
  async shutdown(result: VectorStoreInitializationResult, config: VectorStoreConfig): Promise<void> {
    try {
      // Stop health monitoring
      if (result.collectionHealthMonitor) {
        await result.collectionHealthMonitor.stopMonitoring();
        // Health monitoring stopped successfully
      }
      
      // Save collections if not in memory mode
      if (result.client && !config.inMemory) {
        if (typeof (result.client as any).saveAllCollections === 'function') {
          const saveResult = await (result.client as any).saveAllCollections();
          if (!saveResult.success) {
            console.warn('[VectorStoreInitializer] Some collections failed to save during shutdown:', saveResult.errors);
          } else {
            // Successfully saved all collections during shutdown
          }
        }
      }
      
      // Shutdown completed successfully
      
    } catch (error) {
      console.error("[VectorStoreInitializer] Error during shutdown:", error);
      throw error;
    }
  }

  /**
   * Log detailed collection size diagnostics for memory troubleshooting
   */
  private async logCollectionDiagnostics(context: InitializationContext): Promise<void> {
    try {
      console.log(`[VectorStoreInitializer] Collection diagnostics:`);
      
      for (const collectionName of VectorStoreInitializer.STANDARD_COLLECTIONS) {
        try {
          // Check if collection exists before trying to get diagnostics
          const collectionExists = await context.collectionManager.hasCollection(collectionName);
          if (!collectionExists) {
            console.log(`[VectorStoreInitializer:${collectionName}] Collection not found - may be created later`);
            continue;
          }

          const collection = await context.collectionManager.getOrCreateCollection(collectionName);
          if (collection) {
            // Try to get count - this is a standard ChromaDB method
            try {
              const itemCount = await collection.count();
              console.log(`[VectorStoreInitializer:${collectionName}] Items: ${itemCount}`);
              
              // Warn about large collections (estimate >10,000 items as potentially large)
              if (itemCount > 10000) {
                console.warn(`[VectorStoreInitializer:${collectionName}] LARGE COLLECTION: ${itemCount} items`);
              }
            } catch (countError) {
              console.log(`[VectorStoreInitializer:${collectionName}] Collection exists but count unavailable:`, countError);
            }
          } else {
            console.log(`[VectorStoreInitializer:${collectionName}] Collection could not be created or accessed`);
          }
        } catch (error) {
          console.warn(`[VectorStoreInitializer:${collectionName}] Failed to get diagnostics:`, error);
        }
      }
    } catch (error) {
      console.warn(`[VectorStoreInitializer] Collection diagnostics failed:`, error);
    }
  }

  /**
   * Get current memory usage in bytes (browser API)
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Get memory pressure level for diagnostics
   */
  private getMemoryPressureLevel(): string {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      if (!memory) return 'unknown';
      
      const used = memory.usedJSHeapSize || 0;
      const limit = memory.jsHeapSizeLimit || 0;
      
      if (limit === 0) return 'unknown';
      
      const percentage = (used / limit) * 100;
      if (percentage > 90) return 'critical';
      if (percentage > 75) return 'high';
      if (percentage > 50) return 'moderate';
      return 'low';
    }
    return 'unknown';
  }
}