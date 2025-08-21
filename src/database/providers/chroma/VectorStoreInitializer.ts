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
import { 
  IDirectoryService, 
  IChromaClientFactory, 
  ICollectionManager, 
  IDiagnosticsService, 
  ISizeCalculatorService 
} from './types/ChromaTypes';

// Collection lifecycle management (consolidated)
import { CollectionService } from '../../services/core/CollectionService';

// Initialization coordination
import { ICollectionLoadingCoordinator } from '../../../services/initialization/interfaces/ICollectionLoadingCoordinator';

// Context-aware embedding loading
import { ContextualEmbeddingManager } from '../../services/indexing/contextual/ContextualEmbeddingManager';

export interface VectorStoreInitializationResult {
  client: InstanceType<typeof ChromaClient>;
  collectionService?: CollectionService;
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

export interface CollectionDiagnostics {
  name: string;
  exists: boolean;
  estimatedItems: number | string;
  lastModified?: number | null;
  status: 'available' | 'missing' | 'error' | 'creation_failed';
  memoryFootprintMB?: number;
  loadingTimeMs?: number;
  error?: string;
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
   * LAZY LOADING: Eliminates collection loading during startup for memory optimization
   */
  async initialize(context: InitializationContext): Promise<VectorStoreInitializationResult> {
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    // Starting lazy initialization

    try {
      // Step 1: Validate configuration
      await this.validateConfiguration(context);

      // Step 2: Create ChromaDB client
      const client = await this.initializeClient(context);

      // Step 3: Initialize contextual embedding manager (for search operations only)
      const contextualLoadStartTime = performance.now();
      const contextualEmbeddingManager = await this.initializeContextualEmbeddingManager(context, client);
      const contextualLoadEndTime = performance.now();
      const contextualMemoryAfter = this.getMemoryUsage();

      // Contextual embedding manager initialized

      // ELIMINATED: Collection metadata loading, standard collection creation, lifecycle management, diagnostics
      // Collections will be created on-demand during first search operations
      // This eliminates memory spikes during startup

      const endTime = performance.now();
      const finalMemory = this.getMemoryUsage();

      // CRITICAL CHANGE: Do NOT call setInitializationComplete()
      // Keep the system in lazy-loading mode permanently
      // Collections and data will only load when specifically needed for search operations

      return {
        client,
        contextualEmbeddingManager
      };

    } catch (error) {
      const errorTime = performance.now();
      const errorMemory = this.getMemoryUsage();
      
      console.error(`[VectorStoreInitializer] Initialization failed:`, error instanceof Error ? error.message : String(error));
      
      throw new Error(`ChromaDB lazy initialization failed: ${error instanceof Error ? error.message : String(error)}`);
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
   */
  private async initializeContextualEmbeddingManager(
    context: InitializationContext, 
    client: InstanceType<typeof ChromaClient>
  ): Promise<ContextualEmbeddingManager> {
    // Initialize contextual embedding manager

    try {
      // Create vector store wrapper for the contextual manager
      const vectorStoreWrapper = {
        listCollections: async () => {
          // Get collection metadata without loading full data
          const collections = await context.collectionManager.listCollections();
          return collections;
        }
      };

      // Get memory settings from plugin data (if available) or use adaptive defaults
      const pluginData = await context.plugin.loadData();
      const memorySettings = pluginData?.memory;
      const systemMemory = await this.getSystemMemoryInfo();
      const adaptiveConfig = await this.getAdaptiveContextualConfig(systemMemory);
      
      const contextualManager = new ContextualEmbeddingManager(
        context.plugin,
        vectorStoreWrapper as any, // Type assertion for the wrapper
        {
          maxMemoryMB: memorySettings?.contextualEmbedding?.maxMemoryMB || adaptiveConfig.maxMemoryMB,
          memoryPressureThreshold: memorySettings?.contextualEmbedding?.memoryPressureThreshold || adaptiveConfig.memoryPressureThreshold,
          recentFilesLimit: memorySettings?.contextualEmbedding?.recentFilesLimit || adaptiveConfig.recentFilesLimit
        }
      );

      // First initialize the manager
      await contextualManager.initialize();

      // Then run startup-specific initialization with context-aware loading
      // Skip startup loading to maintain lazy loading approach
      // Context-aware startup initialization complete

      return contextualManager;

    } catch (error) {
      console.error('[VectorStoreInitializer] Failed to initialize contextual embedding manager:', error);
      throw error;
    }
  }

  /**
   * Get adaptive contextual configuration based on system capabilities
   * ADAPTIVE SYSTEM: Adjusts memory and loading strategy based on system resources
   */
  private async getAdaptiveContextualConfig(systemInfo?: { memoryGB?: number }) {
    const currentMemoryPressure = this.getMemoryPressureLevel();
    const systemMemoryGB = systemInfo?.memoryGB || 8; // Default assumption

    // Determine adaptive configuration based on system memory

    // Adaptive strategy based on system capabilities and current memory pressure
    if (currentMemoryPressure === 'critical' || currentMemoryPressure === 'high' || systemMemoryGB < 4) {
      return {
        strategy: 'minimal',
        maxMemoryMB: 25,
        memoryPressureThreshold: 0.75,
        recentFilesLimit: 15,
        description: 'Conservative loading for low-memory systems'
      };
    } else if (currentMemoryPressure === 'moderate' || systemMemoryGB < 8) {
      return {
        strategy: 'balanced',
        maxMemoryMB: 75,
        memoryPressureThreshold: 0.85,
        recentFilesLimit: 50,
        description: 'Balanced loading for moderate-memory systems'
      };
    } else {
      return {
        strategy: 'comprehensive',
        maxMemoryMB: 150,
        memoryPressureThreshold: 0.9,
        recentFilesLimit: 75,
        description: 'Comprehensive loading for high-memory systems'
      };
    }
  }

  /**
   * Get system memory information (placeholder - would integrate with system APIs)
   */
  private async getSystemMemoryInfo(): Promise<{ memoryGB?: number }> {
    try {
      // Placeholder for system memory detection
      // In a real implementation, this might use navigator.deviceMemory or other APIs
      const memoryAPI = (performance as any).memory;
      if (memoryAPI) {
        const limitMB = memoryAPI.jsHeapSizeLimit / 1024 / 1024;
        const estimatedSystemGB = Math.round(limitMB / 1024 * 4); // Rough estimate
        return { memoryGB: Math.max(4, Math.min(estimatedSystemGB, 32)) };
      }
    } catch (error) {
      console.debug('[VectorStoreInitializer] Could not detect system memory:', error);
    }
    
    return { memoryGB: 8 }; // Conservative default
  }

  /**
   * Initialize collection metadata without loading full data
   * Lightweight alternative to full collection loading
   */
  private async initializeCollectionMetadata(context: InitializationContext): Promise<void> {
    try {
      // Initializing collection metadata
      
      // Track memory before listCollections() call
      const memoryBefore = this.getMemoryUsage();
      // Memory tracking before collections list
      
      // Only load collection schemas and metadata, not full data
      const collections = await context.collectionManager.listCollections();
      
      // Track memory after listCollections() call
      const memoryAfter = this.getMemoryUsage();
      const memoryDelta = memoryAfter - memoryBefore;
      // Memory tracking after collections list
      
      if (memoryDelta > 100 * 1024 * 1024) { // > 100MB
        console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in listCollections(): ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }
      
      let metadataCount = 0;
      for (const collectionName of collections) {
        try {
          // Register collection with manager but don't load data yet (CONTEXT-AWARE MODE)
          // Track memory before collection creation
          const memoryBefore = this.getMemoryUsage();
          // Memory tracking before collection creation
          
          const collection = await context.collectionManager.getOrCreateCollection(collectionName, true); // Context-aware mode
          
          // Track memory after collection creation
          const memoryAfter = this.getMemoryUsage();
          const memoryDelta = memoryAfter - memoryBefore;
          // Memory tracking after collection creation
          
          if (memoryDelta > 50 * 1024 * 1024) { // > 50MB
            console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in getOrCreateCollection(${collectionName}): ${Math.round(memoryDelta / 1024 / 1024)}MB`);
          }
          
          if (collection) {
            context.collectionManager.registerCollection(collectionName, collection);
            metadataCount++;
          }
        } catch (error) {
          console.warn(`[VectorStoreInitializer] Failed to initialize metadata for ${collectionName}:`, error);
        }
      }
      
      // Collection metadata initialization completed
      
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
            // Collection doesn't exist - create it (CONTEXT-AWARE MODE)
            // Track memory before collection creation
            const memoryBefore = this.getMemoryUsage();
            // Memory tracking before collection creation
            
            await context.collectionManager.createCollection(collectionName, {
              distance: 'cosine',
              description: `Standard collection: ${collectionName}`,
              createdBy: 'VectorStoreInitializer',
              createdAt: new Date().toISOString()
            }, true); // Context-aware mode
            
            // Track memory after collection creation
            const memoryAfter = this.getMemoryUsage();
            const memoryDelta = memoryAfter - memoryBefore;
            // Memory tracking after collection creation
            
            if (memoryDelta > 50 * 1024 * 1024) { // > 50MB
              console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in createCollection(${collectionName}): ${Math.round(memoryDelta / 1024 / 1024)}MB`);
            }
            
            createdCount++;
            // Created standard collection
          }
        } catch (collectionError) {
          console.warn(`[VectorStoreInitializer] Failed to ensure collection ${collectionName}:`, collectionError);
          // Continue with other collections
        }
      }
      
      console.info(`[VectorStoreInitializer] Standard collections: ${existingCount} existing, ${createdCount} created`);
      
      // Perform context-aware collection refresh without loading data
      await this.performContextAwareCollectionRefresh(context);
      
    } catch (error) {
      const errorMsg = `Standard collection initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[VectorStoreInitializer] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  /**
   * Initializes collection lifecycle manager
   */
  private async initializeLifecycleManager(context: InitializationContext): Promise<CollectionService | undefined> {
    try {
      // Track memory before listCollections() call
      const memoryBefore = this.getMemoryUsage();
      // Lifecycle manager memory tracking before
      
      // Check if we have any collections to manage
      const collections = await context.collectionManager.listCollections();
      
      // Track memory after listCollections() call
      const memoryAfter = this.getMemoryUsage();
      const memoryDelta = memoryAfter - memoryBefore;
      // Lifecycle manager memory tracking after
      
      if (memoryDelta > 100 * 1024 * 1024) { // > 100MB
        console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in LifecycleManager listCollections(): ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }
      
      if (collections.length === 0) {
        // No collections found - skipping lifecycle manager initialization
        return undefined;
      }

      // Create lifecycle manager - assuming we need a vector store instance
      // This might need adjustment based on the actual interface requirements
      const lifecycleManager = new CollectionService(
        context.plugin,
        context as any, // vectorStore
        context.collectionManager,
        context as any, // client 
        context.directoryService
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
    lifecycleManager?: CollectionService
  ): Promise<CollectionService | undefined> {
    try {
      if (!lifecycleManager) {
        // No lifecycle manager available - skipping health monitoring
        return undefined;
      }
      
      // Initialize health monitor
      const healthMonitor = lifecycleManager; // CollectionService handles health monitoring
      
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
      // Stop health monitoring through collection service
      if (result.collectionService) {
        // Collection service handles its own cleanup
        await result.collectionService.cleanup();
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
   * Log collection metadata diagnostics with lightweight approach
   * CRITICAL FIX: Uses metadata-only approach instead of loading all data
   * Memory Impact: Reduces startup memory usage by avoiding expensive collection.count() calls
   */
  private async logCollectionDiagnosticsLightweight(context: InitializationContext): Promise<CollectionDiagnostics[]> {
    const diagnostics: CollectionDiagnostics[] = [];
    
    try {
      // Collection metadata diagnostics
      
      for (const collectionName of VectorStoreInitializer.STANDARD_COLLECTIONS) {
        const collectionDiagnostic = await this.getCollectionMetadataOnly(context, collectionName);
        diagnostics.push(collectionDiagnostic);
        
        // Log diagnostic information without loading full data
        if (collectionDiagnostic.exists) {
          // Collection exists with diagnostic information
          
          // Warn about large collections based on estimated size
          if (typeof collectionDiagnostic.estimatedItems === 'number' && collectionDiagnostic.estimatedItems > 10000) {
            console.warn(`[VectorStoreInitializer:${collectionName}] ESTIMATED LARGE COLLECTION: ~${collectionDiagnostic.estimatedItems} items (estimate only)`);
          }
        } else {
          // Collection diagnostic error or not found
        }
      }
      
      const existingCollections = diagnostics.filter(d => d.exists).length;
      // Metadata diagnostics completed
      
      return diagnostics;
      
    } catch (error) {
      console.warn(`[VectorStoreInitializer] Lightweight diagnostics failed:`, error);
      return diagnostics; // Return partial results
    }
  }

  /**
   * Get collection metadata without loading full collection data
   * MEMORY OPTIMIZATION: Uses filesystem and minimal ChromaDB calls to avoid bulk loading
   */
  private async getCollectionMetadataOnly(
    context: InitializationContext, 
    collectionName: string
  ): Promise<CollectionDiagnostics> {
    try {
      // First, check if collection exists using enhanced hasCollection (filesystem-first)
      const collectionExists = await context.collectionManager.hasCollection(collectionName);
      
      if (!collectionExists) {
        return {
          name: collectionName,
          exists: false,
          status: 'missing',
          estimatedItems: 0,
          memoryFootprintMB: 0
        };
      }

      // Collection exists - get minimal metadata without loading data (CONTEXT-AWARE MODE)
      try {
        // Track memory before collection access
        const memoryBefore = this.getMemoryUsage();
        // Memory tracking before metadata collection
        
        const collection = await context.collectionManager.getOrCreateCollection(collectionName, true); // Context-aware mode for metadata
        
        // Track memory after collection access
        const memoryAfter = this.getMemoryUsage();
        const memoryDelta = memoryAfter - memoryBefore;
        // Memory tracking after metadata collection
        
        if (memoryDelta > 50 * 1024 * 1024) { // > 50MB
          console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in metadata getOrCreateCollection(${collectionName}): ${Math.round(memoryDelta / 1024 / 1024)}MB`);
        }
        if (!collection) {
          return {
            name: collectionName,
            exists: false,
            status: 'creation_failed',
            estimatedItems: 0,
            error: 'Could not create or access collection',
            memoryFootprintMB: 0
          };
        }

        // Try to get minimal metadata without triggering full data load
        let estimatedCount: number | string = 'unknown';
        let lastModified: number | null = null;
        
        try {
          // Estimate collection size from filesystem without triggering bulk loading
          const fsEstimate = await this.estimateCollectionSizeFromFilesystem(context, collectionName);
          if (fsEstimate !== null && fsEstimate !== undefined) {
            estimatedCount = fsEstimate;
          } else {
            // Fallback: Use very limited query to check if collection has any data
            // This is safer than count() which loads everything
            try {
              const limitedQuery = await collection.get({ limit: 1 });
              if (limitedQuery && limitedQuery.ids && limitedQuery.ids.length > 0) {
                estimatedCount = 'has_data';
              } else {
                estimatedCount = 0;
              }
            } catch (queryError) {
              console.warn(`[VectorStoreInitializer] Limited query failed for ${collectionName}:`, queryError);
              estimatedCount = 'query_failed';
            }
          }
          lastModified = Date.now(); // Current time as approximate
        } catch (fsError) {
          // Filesystem estimation failed
          console.warn(`[VectorStoreInitializer] Filesystem estimation failed for ${collectionName}:`, fsError);
          estimatedCount = 'fs_failed';
        }
        
        return {
          name: collectionName,
          exists: true,
          estimatedItems: estimatedCount,
          lastModified,
          status: 'available',
          memoryFootprintMB: 0, // No data loaded into memory
          loadingTimeMs: 0
        };

      } catch (accessError) {
        return {
          name: collectionName,
          exists: true, // Exists but has issues
          status: 'error',
          estimatedItems: 'unknown',
          error: `Access error: ${accessError instanceof Error ? accessError.message : String(accessError)}`,
          memoryFootprintMB: 0
        };
      }
      
    } catch (error) {
      return {
        name: collectionName,
        exists: false,
        status: 'error',
        estimatedItems: 0,
        error: `Metadata check failed: ${error instanceof Error ? error.message : String(error)}`,
        memoryFootprintMB: 0
      };
    }
  }

  /**
   * Estimate collection size from filesystem without loading data
   * PERFORMANCE: Fast filesystem-based size estimation to avoid memory loading
   */
  private async estimateCollectionSizeFromFilesystem(context: InitializationContext, collectionName: string): Promise<number | null> {
    try {
      // Try to get size estimate from filesystem if persistent path is available
      if (context.config.persistentPath && context.directoryService) {
        const collectionDir = `${context.config.persistentPath}/collections/${collectionName}`;
        
        try {
          // Use available IDirectoryService methods instead of missing methods
          const dirSizeMB = await context.directoryService.calculateDirectorySize(collectionDir);
          if (dirSizeMB > 0) {
            // Very rough estimate: ~1-2KB per embedding item, so ~500-1000 items per MB
            const estimatedItems = Math.round(dirSizeMB * 750); // Average estimate
            return estimatedItems;
          }
        } catch (fsError) {
          // Filesystem access failed - not critical
          console.debug(`[VectorStoreInitializer] Filesystem estimation failed for ${collectionName}:`, fsError);
        }
      }
      
      return null; // No estimate available
    } catch (error) {
      return null;
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
   * Disable context-aware mode for all collections after initialization
   * This allows normal search operations that require full data access
   */
  private async disableContextAwareModeForAllCollections(context: InitializationContext): Promise<void> {
    try {
      // Disabling context-aware mode
      
      const collections = await context.collectionManager.listCollections();
      let disabledCount = 0;
      
      for (const collectionName of collections) {
        try {
          // Get the collection without context-aware mode to access the real collection
          const collection = await context.collectionManager.getOrCreateCollection(collectionName, false);
          
          // Disable context-aware mode if the collection supports it
          if (collection && typeof (collection as any).disableContextAwareMode === 'function') {
            (collection as any).disableContextAwareMode();
            disabledCount++;
          }
        } catch (error) {
          console.warn(`[VectorStoreInitializer] Failed to disable context-aware mode for ${collectionName}:`, error);
        }
      }
      
      // Context-aware mode disabled for collections
      
    } catch (error) {
      console.warn('[VectorStoreInitializer] Failed to disable context-aware mode for collections:', error);
      // Continue - this is not critical for initialization
    }
  }

  /**
   * Perform context-aware collection refresh that updates metadata without loading data
   * MEMORY OPTIMIZATION: Refreshes collection registry without bulk data loading
   */
  private async performContextAwareCollectionRefresh(context: InitializationContext): Promise<void> {
    try {
      // Starting context-aware collection refresh
      const memoryBefore = this.getMemoryUsage();
      
      // Refresh collection list with metadata-only approach
      const collections = await context.collectionManager.listCollections();
      
      let refreshedCount = 0;
      let skipCount = 0;
      
      for (const collectionName of collections) {
        try {
          // Check if collection exists without loading data
          const exists = await context.collectionManager.hasCollection(collectionName);
          
          if (exists) {
            // Update collection registry with minimal metadata
            // This refreshes the internal cache without loading all data
            const collection = await context.collectionManager.getOrCreateCollection(collectionName, true); // Context-aware mode
            
            if (collection) {
              // Register collection for future operations
              context.collectionManager.registerCollection(collectionName, collection);
              refreshedCount++;
            } else {
              skipCount++;
            }
          } else {
            skipCount++;
          }
          
        } catch (collectionError) {
          console.warn(`[VectorStoreInitializer] Failed to refresh collection ${collectionName}:`, collectionError);
          skipCount++;
        }
      }
      
      const memoryAfter = this.getMemoryUsage();
      const memoryDelta = memoryAfter - memoryBefore;
      
      // Memory impact monitoring
      if (memoryDelta > 50 * 1024 * 1024) { // > 50MB
        console.warn(`[VectorStoreInitializer] ⚠️ MEMORY SPIKE in context-aware refresh: ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      } else {
        console.debug(`[VectorStoreInitializer] Context-aware refresh completed with minimal memory impact: ${Math.round(memoryDelta / 1024 / 1024)}MB`);
      }
      
      console.info(`[VectorStoreInitializer] Context-aware refresh: ${refreshedCount} collections refreshed, ${skipCount} skipped`);
      
    } catch (error) {
      console.warn('[VectorStoreInitializer] Context-aware collection refresh failed:', error);
      // Continue without refresh - not critical for initialization
    }
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