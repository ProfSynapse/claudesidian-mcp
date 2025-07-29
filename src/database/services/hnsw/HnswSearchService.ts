/**
 * Refactored HNSW Search Service - Clean Architecture
 * Orchestrates specialized services following SOLID principles
 * Maintains backward compatibility while providing clean, focused architecture
 */

import { loadHnswlib } from 'hnswlib-wasm';
import { DatabaseItem, WhereClause } from '../../providers/chroma/services/FilterEngine';
import { TFile, App, Plugin } from 'obsidian';
import { EmbeddingService } from '../EmbeddingService';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { logger } from '../../../utils/logger';

// Import specialized services and orchestrators
import { HnswConfig, HnswConfigOptions } from './config/HnswConfig';
import { HnswCoordinator } from './initialization/FullInitializationOrchestrator';
import { SearchParameters } from './search/HnswSearchEngine';
import { SearchOptions, SearchResult } from './results/HnswResultProcessor';
import { HnswValidationService } from './validation/HnswValidationService';
import { HnswResultProcessor } from './results/HnswResultProcessor';
import { HnswPartitionManager } from './partitioning/HnswPartitionManager';
import { HnswIndexManager } from './index/HnswIndexManager';
import { HnswSearchEngine } from './search/HnswSearchEngine';
import { ProcessedFilesStateManager } from '../state/ProcessedFilesStateManager';
import { ContentHashService } from '../embedding/ContentHashService';
import { HnswPersistenceOrchestrator } from './persistence/HnswPersistenceOrchestrator';
import { HnswMetadataManager } from './persistence/HnswMetadataManager';
import { HnswIndexOperations } from './persistence/HnswIndexOperations';
import { PersistenceManager } from '../../providers/chroma/services/PersistenceManager';

/**
 * Service factory for clean HNSW service dependency creation
 * Follows Single Responsibility and Dependency Inversion principles
 */
class HnswServiceFactory {
  static createServices(config: HnswConfig, hnswLib: any, plugin: Plugin, persistentPath?: string) {
    // Create state and content services
    const stateManager = new ProcessedFilesStateManager(plugin);
    const contentHashService = new ContentHashService(plugin, stateManager);
    
    // Create persistence services - use Node.js fs for sync operations required by PersistenceManager
    const baseDataPath = persistentPath || '.';
    const fs = require('fs');
    const persistenceManager = new PersistenceManager(fs);
    const metadataManager = new HnswMetadataManager(persistenceManager, baseDataPath);
    const indexOperations = new HnswIndexOperations(config, hnswLib);
    
    // Create orchestrated services
    const persistenceOrchestrator = new HnswPersistenceOrchestrator(
      config, hnswLib, metadataManager, indexOperations, contentHashService
    );
    
    const partitionManager = new HnswPartitionManager(config, hnswLib);
    const validationService = new HnswValidationService(config);
    const resultProcessor = new HnswResultProcessor();
    
    const indexManager = new HnswIndexManager(
      config, validationService, persistenceOrchestrator, partitionManager, contentHashService, hnswLib
    );
    
    const searchEngine = new HnswSearchEngine(config, validationService, indexManager);
    
    return {
      validationService,
      persistenceService: persistenceOrchestrator,
      partitionManager,
      indexManager,
      searchEngine,
      resultProcessor,
      stateManager,
      contentHashService
    };
  }
}

// Import initialization coordination
import { IInitializationStateManager } from '../../../services/initialization/interfaces/IInitializationStateManager';
import { ICollectionLoadingCoordinator } from '../../../services/initialization/interfaces/ICollectionLoadingCoordinator';

// Re-export types for backward compatibility
export type { SearchResult } from './results/HnswResultProcessor';


/**
 * Modern, SOLID-compliant HNSW search service
 * Uses service composition and dependency injection
 * Enhanced with initialization coordination to prevent duplicate initialization
 */
export class HnswSearchService {
  // Core dependencies
  private app?: App;
  private plugin: Plugin;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  private persistentPath?: string;

  // Service orchestrators and managers
  private config: HnswConfig;
  private initializationOrchestrator!: HnswCoordinator;

  // Specialized services (accessed through orchestrators)
  private services: any = {};

  // HNSW library and initialization state
  private hnswLib: any = null;
  private isInitialized = false;
  private fullyInitialized = false;
  private isFullyReady = false;
  
  // Background indexing state management (NEW for startup optimization)
  private indexingStatus: 'ready' | 'loading' | 'building' | 'error' = 'ready';
  private readyCollections: Set<string> = new Set();
  private buildingCollections: Set<string> = new Set();
  private backgroundIndexingService?: any; // Will be injected later
  
  // Initialization coordination (injected)
  private initializationStateManager: IInitializationStateManager | null = null;
  private collectionCoordinator: ICollectionLoadingCoordinator | null = null;

  constructor(
    plugin: Plugin,
    app?: App, 
    vectorStore?: IVectorStore, 
    embeddingService?: EmbeddingService, 
    persistentPath?: string,
    configOptions?: HnswConfigOptions
  ) {
    this.plugin = plugin;
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.persistentPath = persistentPath;

    // Initialize configuration
    this.config = configOptions ? new HnswConfig(configOptions) : HnswConfig.getProductionConfig();

    // Note: ServiceInitializer removed - incompatible with IndexedDB/WASM persistence
    // Services are now created directly in HnswCoordinator
    
    logger.systemLog('HnswSearchService constructor completed', 'HnswSearchService');

    // Note: Lightweight services will be initialized async in initialize() method
    // This prevents async operations in constructor
  }
  
  /**
   * Set initialization coordination services (injected by service manager)
   * CRITICAL FIX: Trigger proper initialization after injection
   */
  setInitializationCoordination(
    stateManager: IInitializationStateManager,
    collectionCoordinator: ICollectionLoadingCoordinator
  ): void {
    this.initializationStateManager = stateManager;
    this.collectionCoordinator = collectionCoordinator;
    
    
    // Trigger initialization now that coordination services are available
    this.initialize().then(() => {
      logger.systemLog('Deferred initialization completed successfully', 'HnswSearchService');
    }).catch(error => {
      logger.systemError(new Error(`Failed to initialize after coordination injection: ${error instanceof Error ? error.message : String(error)}`), 'HnswSearchService');
    });
  }


  /**
   * Initialize HNSW library and complete service initialization
   * Now uses coordination system to prevent duplicate initialization
   * CRITICAL FIX: Only initialize if coordination services are available
   */
  async initialize(): Promise<void> {
    
    // CRITICAL: Do not auto-initialize until coordination services are injected
    // This prevents the ServiceLifecycleManager from calling the old initialization path
    if (!this.initializationStateManager) {
      // Return without initializing - coordination system will handle it later
      return;
    }

    // Use coordination system to prevent duplicate initialization
    const result = await this.initializationStateManager.ensureInitialized(
      'hnsw_basic_init',
      async () => {
        await this.performBasicInitialization();
      }
    );
    
    
    if (!result.success) {
      throw result.error || new Error('HNSW basic initialization failed');
    }
  }
  
  
  /**
   * Perform the actual basic initialization
   */
  private async performBasicInitialization(): Promise<void> {
    
    if (this.isInitialized) {
      return;
    }

    try {
      // STEP 1: Load HNSW WASM library
      this.hnswLib = await loadHnswlib();

      // STEP 2: Create all services using factory
      const services = HnswServiceFactory.createServices(this.config, this.hnswLib, this.plugin, this.persistentPath);
      
      // Load state manager
      await services.stateManager.loadState();
      
      // Assign services to instance
      this.services = services;

      // STEP 3: Initialize coordinator with services
      this.initializationOrchestrator = new HnswCoordinator(
        this.config,
        this.services.persistenceService,
        this.services.indexManager,
        this.vectorStore!,
        this.app,
        this.collectionCoordinator || undefined
      );
      
      if (this.collectionCoordinator) {
        this.initializationOrchestrator.setCollectionCoordinator(this.collectionCoordinator);
      }

      this.isInitialized = true;
      
    } catch (error) {
      logger.systemError(
        new Error(`Failed HNSW initialization: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Ensure full initialization including index discovery and collection processing
   * This is called lazily when HNSW functionality is first used or during background initialization
   * Now uses coordination system to prevent duplicate initialization
   */
  async ensureFullyInitialized(): Promise<void> {
    // First ensure basic initialization
    await this.initialize();
    
    if (this.fullyInitialized) {
      return;
    }
    
    if (this.initializationStateManager) {
      // Use coordination system to prevent duplicate full initialization
      const result = await this.initializationStateManager.ensureInitialized(
        'hnsw_full_init',
        async () => {
          await this.performFullInitialization();
        }
      );
      
      if (!result.success) {
        logger.systemError(
          new Error(`HNSW full initialization failed: ${result.error?.message || 'Unknown error'}`),
          'HnswSearchService'
        );
        // Don't throw - mark as initialized to prevent repeated attempts
        this.fullyInitialized = true;
        this.isFullyReady = false;
      }
    } else {
      // Fallback to direct initialization if coordination not available
      await this.performFullInitialization();
    }
  }
  
  /**
   * Perform the actual full initialization
   * CRITICAL FIX: Verify orchestrator exists before calling executeFullInitialization
   */
  private async performFullInitialization(): Promise<void> {
    logger.systemLog('Starting full HNSW initialization', 'HnswSearchService');

    if (this.fullyInitialized) {
      logger.systemLog('Already fully initialized, skipping', 'HnswSearchService');
      return;
    }

    try {
      // CRITICAL FIX: Ensure basic initialization completed before proceeding
      if (!this.initializationOrchestrator) {
        logger.systemLog('Orchestrator not available, ensuring basic initialization completes', 'HnswSearchService');
        await this.performBasicInitialization();
        
        if (!this.initializationOrchestrator) {
          throw new Error('Basic initialization failed to create orchestrator - cannot proceed with full initialization');
        }
      }
      
      // Wait for collections to be loaded if coordinator is available
      if (this.collectionCoordinator) {
        const collectionsResult = await this.collectionCoordinator.waitForCollections();
        logger.systemLog('HNSW waiting for collections completed', 'HnswSearchService');
      }
      
      logger.systemLog('Calling orchestrator.executeFullInitialization with verified orchestrator', 'HnswSearchService');
      const result = await this.initializationOrchestrator.executeFullInitialization();
      
      // Always mark as initialized to prevent repeated attempts
      this.fullyInitialized = true;
      this.isFullyReady = result.success;
      
      logger.systemLog(`Service marked as fully initialized - success: ${result.success}`, 'HnswSearchService');
      
      if (result.success) {
        logger.systemLog('[STARTUP] HNSW initialization completed successfully', 'HnswSearchService');
      } else {
        logger.systemLog(`[STARTUP] HNSW initialization completed with errors - service available (${result.errors.length} errors)`, 'HnswSearchService');
      }
    } catch (criticalError) {
      logger.systemError(
        new Error(`Critical HNSW initialization error: ${criticalError instanceof Error ? criticalError.message : String(criticalError)}`),
        'HnswSearchService'
      );
      // Even critical errors shouldn't prevent the service from being marked as initialized
      this.fullyInitialized = true;
      this.isFullyReady = false; // Set to false for critical errors
      logger.systemLog('[STARTUP] HNSW service marked as initialized despite errors - basic functionality available', 'HnswSearchService');
    }
  }

  /**
   * Create or update HNSW index for a collection
   */
  async indexCollection(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) {
      logger.systemLog(`No items to index for collection: ${collectionName}`, 'HnswSearchService');
      return;
    }

    try {
      const result = await this.services.indexManager.createOrUpdateIndex(collectionName, items);
      
      if (result.success) {
        logger.systemLog(
          `Successfully indexed collection ${collectionName}: ${result.itemsIndexed} items (${result.indexType})`,
          'HnswSearchService'
        );
      } else {
        logger.systemWarn(
          `Failed to index collection ${collectionName}: ${result.itemsSkipped} items skipped`,
          'HnswSearchService'
        );
      }
    } catch (error) {
      logger.systemError(
        new Error(`Indexing failed for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Search for similar items using HNSW index
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    try {
      const searchParams: SearchParameters = {
        collectionName,
        queryEmbedding,
        nResults: options.limit || 10
      };

      if (!this.services.searchEngine || typeof this.services.searchEngine.search !== 'function') {
        throw new Error('Search engine is not properly initialized');
      }
      
      const rawResults = await this.services.searchEngine.search(collectionName, searchParams);
      return this.services.resultProcessor.processResults(rawResults, options);
    } catch (error) {
      logger.systemError(
        new Error(`Search failed for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Search with metadata filtering (delegates to search engine)
   */
  async searchWithMetadataFilter(
    collectionName: string,
    queryEmbedding: number[],
    whereClause: WhereClause,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    try {
      const searchParams: SearchParameters = {
        collectionName,
        queryEmbedding,
        nResults: options.limit || 10,
        where: whereClause
      };

      const rawResults = await this.services.searchEngine.searchWithFilter(collectionName, searchParams);
      return this.services.resultProcessor.processResults(rawResults, options);
    } catch (error) {
      logger.systemError(
        new Error(`Filtered search failed for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }


  /**
   * High-level semantic search interface for string queries with file filtering
   * Used by HybridSearchService and UniversalSearchService
   */
  async searchWithMetadataFilterHighLevel(
    query: string,
    filteredFiles?: any[], // TFile[] or similar
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    try {
      // If no embedding service available, return empty results
      if (!this.embeddingService) {
        logger.systemWarn('No embedding service available for semantic search', 'HnswSearchService');
        return [];
      }

      // Convert string query to embedding
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      
      // Check if embedding generation failed
      if (!queryEmbedding) {
        logger.systemWarn('Failed to generate embedding for query', 'HnswSearchService');
        return [];
      }
      
      // Use the correct collection name that matches FileIndexingService
      const collectionName = 'file_embeddings';
      
      // Convert file filter to where clause if needed
      let whereClause: WhereClause | undefined;
      if (filteredFiles && filteredFiles.length > 0) {
        // Convert TFile[] to file paths for filtering
        const filePaths = filteredFiles
          .filter(file => file && typeof file.path === 'string')
          .map(file => file.path);
          
        if (filePaths.length > 0) {
          whereClause = {
            'metadata.filePath': { '$in': filePaths }
          };
        }
      }

      // Perform the search
      if (whereClause) {
        return await this.searchWithMetadataFilter(collectionName, queryEmbedding, whereClause, options);
      } else {
        return await this.searchSimilar(collectionName, queryEmbedding, options);
      }
    } catch (error) {
      logger.systemError(
        new Error(`High-level semantic search failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      return [];
    }
  }

  /**
   * Add single item to index
   */
  async addItemToIndex(collectionName: string, item: DatabaseItem): Promise<void> {
    await this.initialize();
    await this.services.indexManager.addItemToIndex(collectionName, item);
  }

  /**
   * Remove item from index
   */
  async removeItemFromIndex(collectionName: string, itemId: string): Promise<void> {
    await this.initialize();
    await this.services.indexManager.removeItemFromIndex(collectionName, itemId);
  }


  /**
   * Check if index exists for collection
   */
  hasIndex(collectionName: string): boolean {
    return this.services.indexManager?.hasIndex(collectionName) || false;
  }

  /**
   * Get index statistics
   */
  getIndexStats(collectionName: string): { itemCount: number; dimension: number; partitions?: number } | null {
    const stats = this.services.indexManager?.getIndexStatistics(collectionName);
    if (!stats) return null;
    
    // CRITICAL FIX: The statistics service returns 'totalItems', not 'itemCount'
    return {
      itemCount: stats.totalItems || 0,
      dimension: stats.dimension || 0,
      partitions: stats.partitionCount
    };
  }

  /**
   * Remove index for collection
   */
  removeIndex(collectionName: string): void {
    if (this.services.indexManager) {
      this.services.indexManager.removeIndex(collectionName);
    }
  }

  /**
   * Clear all indexes
   */
  clearAllIndexes(): void {
    if (this.services.indexManager) {
      this.services.indexManager.clearAllIndexes();
    }
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): { totalIndexes: number; totalItems: number; totalPartitions: number } {
    return this.services.indexManager?.getMemoryStats() || { totalIndexes: 0, totalItems: 0, totalPartitions: 0 };
  }

  /**
   * Force rebuild index
   */
  async forceRebuildIndex(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();
    
    // Remove existing index first
    this.removeIndex(collectionName);
    
    // Rebuild with new items
    await this.indexCollection(collectionName, items);
  }

  /**
   * Get service statistics
   */
  getServiceStatistics(): {
    isInitialized: boolean;
    isFullyReady: boolean;
    totalIndexes: number;
    totalItems: number;
    configuredCollections: string[];
  } {
    return {
      isInitialized: this.isInitialized,
      isFullyReady: this.isFullyReady,
      totalIndexes: this.getMemoryStats().totalIndexes,
      totalItems: this.getMemoryStats().totalItems,
      configuredCollections: this.services.indexManager?.getConfiguredCollections() || []
    };
  }

  /**
   * Update configuration
   */
  async updateConfiguration(configOptions: Partial<HnswConfigOptions>): Promise<void> {
    const newConfig = this.config.withOverrides(configOptions);
    this.config = newConfig;
    
    // ServiceInitializer removed - configuration updates handled by individual services
  }

  /**
   * Get search performance estimate
   */
  getSearchPerformanceEstimate(collectionName: string, nResults: number): {
    estimatedTimeMs: number;
    indexType: string;
    itemCount: number;
  } {
    const stats = this.getIndexStats(collectionName);
    if (!stats) {
      return { estimatedTimeMs: -1, indexType: 'none', itemCount: 0 };
    }

    const baseTime = stats.partitions ? 5 : 2; // Partitioned indexes take longer
    const itemFactor = Math.log(stats.itemCount) * 0.1;
    const resultFactor = nResults * 0.05;

    return {
      estimatedTimeMs: baseTime + itemFactor + resultFactor,
      indexType: stats.partitions ? 'partitioned' : 'single',
      itemCount: stats.itemCount
    };
  }

  /**
   * Perform comprehensive service diagnostics
   */
  async diagnose(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
    recommendations: string[];
  }> {
    const details: Record<string, any> = {};
    const recommendations: string[] = [];

    // Check initialization status
    details.initialization = {
      isInitialized: this.isInitialized,
      fullyInitialized: this.fullyInitialized,
      isFullyReady: this.isFullyReady
    };

    // Check service health if orchestrator is available
    if (this.initializationOrchestrator) {
      const healthCheck = await this.initializationOrchestrator.performHealthCheck();
      details.services = healthCheck.services;
      details.serviceMessage = healthCheck.message;
    }

    // Check memory stats
    details.memory = this.getMemoryStats();

    // Check configuration
    details.configuration = {
      persistenceEnabled: this.config.persistence.enabled,
      partitioningEnabled: this.config.partitioning.enabled,
      maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition
    };

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.isInitialized) {
      status = 'unhealthy';
      recommendations.push('Initialize the HNSW service');
    } else if (!this.isFullyReady) {
      status = 'degraded';
      recommendations.push('Complete full initialization for optimal performance');
    }

    if (details.memory.totalIndexes === 0) {
      recommendations.push('Build indexes for collections to enable search');
    }

    return { status, details, recommendations };
  }

  // =====================================
  // NEW: Background Indexing State Management for Startup Optimization
  // =====================================

  /**
   * Mark service as ready for fast loading from IndexedDB
   * Called after health check determines indexes are available
   */
  markReadyForLoading(): void {
    this.indexingStatus = 'ready';
    console.log('[HnswSearchService] Marked as ready for fast loading');
  }

  /**
   * Check if service can handle searches (indexes are ready or loaded)
   */
  isReadyForLoading(): boolean {
    return this.indexingStatus === 'ready' && this.readyCollections.size > 0;
  }

  /**
   * Check if a specific collection is ready for searching
   */
  isCollectionReady(collectionName: string): boolean {
    return this.readyCollections.has(collectionName);
  }

  /**
   * Fast loading from IndexedDB for specific collection
   * Used when health check confirmed indexes are available
   */
  async loadIndexOnDemand(collectionName: string): Promise<void> {
    if (this.readyCollections.has(collectionName)) {
      return; // Already loaded
    }

    if (this.buildingCollections.has(collectionName)) {
      throw new Error(`Collection '${collectionName}' is currently being built in background`);
    }

    try {
      this.indexingStatus = 'loading';
      console.log(`[HnswSearchService] Loading index on-demand for collection: ${collectionName}`);

      // Ensure basic initialization first
      await this.initialize();

      // Load the specific index using IndexManager (this should be fast if persisted)
      if (this.services.indexManager && this.vectorStore) {
        // Get collection items to pass to createOrUpdateIndex (required parameter)
        const allItems = await this.vectorStore.getAllItems(collectionName, {
          limit: undefined,
          offset: 0
        });
        
        if (allItems.ids && allItems.ids.length > 0) {
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
          
          // Use IndexManager to create/load the index (handles both persisted and new)
          await this.services.indexManager.createOrUpdateIndex(collectionName, items);
        }
      } else {
        // Fallback to full initialization if services unavailable
        await this.ensureFullyInitialized();
      }

      this.readyCollections.add(collectionName);
      this.indexingStatus = 'ready';

      console.log(`[HnswSearchService] Successfully loaded index for collection: ${collectionName}`);

    } catch (error) {
      this.indexingStatus = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[HnswSearchService] Failed to load index for ${collectionName}:`, errorMessage);
      throw new Error(`Failed to load index on-demand for collection '${collectionName}': ${errorMessage}`);
    }
  }

  /**
   * Get progress information from background indexing service
   * Used for MCP error responses when indexes are building
   */
  getIndexingProgress(): any {
    if (this.backgroundIndexingService && typeof this.backgroundIndexingService.getProgress === 'function') {
      return this.backgroundIndexingService.getProgress();
    }
    
    // Return default progress if background service not available
    return {
      isActive: this.indexingStatus === 'building',
      completed: 0,
      total: this.buildingCollections.size,
      percentage: 0,
      phase: this.indexingStatus,
      currentCollection: Array.from(this.buildingCollections)[0],
      completedCollections: Array.from(this.readyCollections),
      failedCollections: [],
      errors: []
    };
  }

  /**
   * Inject background indexing service (called by service descriptors)
   */
  setBackgroundIndexingService(backgroundService: any): void {
    this.backgroundIndexingService = backgroundService;
    console.log('[HnswSearchService] Background indexing service injected');
  }

  /**
   * Get collections that are currently building
   */
  getBuildingCollections(): string[] {
    return Array.from(this.buildingCollections);
  }

  /**
   * Get collections that are ready for searching
   */
  getReadyCollections(): string[] {
    return Array.from(this.readyCollections);
  }

  /**
   * Mark collection as building (called by background service)
   */
  markCollectionBuilding(collectionName: string): void {
    this.buildingCollections.add(collectionName);
    this.readyCollections.delete(collectionName);
    this.indexingStatus = 'building';
    console.log(`[HnswSearchService] Marked collection as building: ${collectionName}`);
  }

  /**
   * Mark collection as ready (called by background service when complete)
   */
  markCollectionReady(collectionName: string): void {
    this.buildingCollections.delete(collectionName);
    this.readyCollections.add(collectionName);
    
    // If no more collections building, mark service as ready
    if (this.buildingCollections.size === 0) {
      this.indexingStatus = 'ready';
    }
    
    console.log(`[HnswSearchService] Marked collection as ready: ${collectionName}`);
  }

}