/**
 * HnswSearchService - Refactored HNSW search service orchestrator
 * Follows SOLID principles and Boy Scout Rule by delegating to specialized services
 * Maintains backward compatibility while providing clean, focused architecture
 */

import { loadHnswlib } from 'hnswlib-wasm';
import { DatabaseItem, WhereClause } from '../../providers/chroma/services/FilterEngine';
import { TFile, App } from 'obsidian';
import { EmbeddingService } from '../EmbeddingService';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { logger } from '../../../utils/logger';

// Import all specialized services
import { HnswConfig, HnswConfigOptions } from './config/HnswConfig';
import { HnswValidationService } from './validation/HnswValidationService';
import { HnswPersistenceOrchestrator } from './persistence/HnswPersistenceOrchestrator';
import { HnswPersistenceFactory } from './persistence/HnswPersistenceFactory';
import { HnswPartitionManager } from './partitioning/HnswPartitionManager';
import { HnswIndexManager } from './index/HnswIndexManager';
import { HnswSearchEngine, SearchParameters } from './search/HnswSearchEngine';
import { HnswResultProcessor, SearchOptions, SearchResult } from './results/HnswResultProcessor';

// Import existing services for dependency injection
import { PersistenceManager, FileSystemInterface } from '../../providers/chroma/services/PersistenceManager';
import { ContentHashService } from '../embedding/ContentHashService';
import { CacheManager } from '../CacheManager';
// HnswDiscoveryService removed - using HnswMetadataManager directly
import { DiagnosticsService } from '../../providers/chroma/services/DiagnosticsService';

// Re-export types for backward compatibility
export type { SearchResult } from './results/HnswResultProcessor';

// Legacy interfaces for backward compatibility
export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

export interface LegacySearchOptions {
  limit?: number;
  threshold?: number;
  includeContent?: boolean;
}

/**
 * Modern, SOLID-compliant HNSW search service
 * Orchestrates specialized services while maintaining backward compatibility
 */
export class HnswSearchService {
  // Core dependencies
  private app?: App;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  private persistentPath?: string;

  // Specialized services (following SRP)
  private config: HnswConfig;
  private validationService!: HnswValidationService;
  private persistenceService!: HnswPersistenceOrchestrator;
  private partitionManager!: HnswPartitionManager;
  private indexManager!: HnswIndexManager;
  private searchEngine!: HnswSearchEngine;
  private resultProcessor!: HnswResultProcessor;

  // HNSW library and initialization state
  private hnswLib: any = null;
  private isInitialized = false;

  constructor(
    app?: App, 
    vectorStore?: IVectorStore, 
    embeddingService?: EmbeddingService, 
    persistentPath?: string,
    configOptions?: HnswConfigOptions
  ) {
    this.app = app;
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.persistentPath = persistentPath;

    // Initialize configuration
    this.config = configOptions ? new HnswConfig(configOptions) : HnswConfig.getProductionConfig();

    // Initialize all specialized services
    this.initializeServices();
  }

  /**
   * Initialize all specialized services following dependency injection patterns
   */
  private initializeServices(): void {
    try {
      // Create validation service
      this.validationService = new HnswValidationService(this.config);

      // Create persistence service with proper dependencies
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fsModule = require('fs');
      const fs: FileSystemInterface = {
        existsSync: fsModule.existsSync,
        mkdirSync: fsModule.mkdirSync,
        writeFileSync: fsModule.writeFileSync,
        readFileSync: fsModule.readFileSync,
        renameSync: fsModule.renameSync,
        unlinkSync: fsModule.unlinkSync,
        readdirSync: fsModule.readdirSync,
        statSync: fsModule.statSync,
        rmdirSync: fsModule.rmdirSync,
      };

      const persistenceManager = new PersistenceManager(fs);
      const contentHashService = new ContentHashService(this.app as any);
      
      // DiagnosticsService requires multiple dependencies, create a stub for now
      const diagnosticsService = null; // Will be properly initialized later when needed
      
      // Use factory to create the orchestrator with proper dependencies (discoveryService removed)
      this.persistenceService = HnswPersistenceFactory.create(
        this.config,
        null, // hnswLib will be set later in initialize()
        persistenceManager,
        {} as any, // CacheManager not needed anymore
        diagnosticsService as any,
        contentHashService,
        this.persistentPath || '/tmp/hnsw'
      );

      // Result processor has no dependencies
      this.resultProcessor = new HnswResultProcessor();

      logger.systemLog('Specialized services initialized successfully', 'HnswSearchService');
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize services: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Initialize HNSW library and complete service initialization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load HNSW WASM library
      this.hnswLib = await loadHnswlib();

      // Update persistence service with hnswLib - recreate with updated factory
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fsModule = require('fs');
      const fs: FileSystemInterface = {
        existsSync: fsModule.existsSync,
        mkdirSync: fsModule.mkdirSync,
        writeFileSync: fsModule.writeFileSync,
        readFileSync: fsModule.readFileSync,
        renameSync: fsModule.renameSync,
        unlinkSync: fsModule.unlinkSync,
        readdirSync: fsModule.readdirSync,
        statSync: fsModule.statSync,
        rmdirSync: fsModule.rmdirSync,
      };
      
      const persistenceManager = new PersistenceManager(fs);
      const contentHashService = new ContentHashService(this.app as any);
      
      // DiagnosticsService requires multiple dependencies, skip for now
      const diagnosticsService = null;
      
      this.persistenceService = HnswPersistenceFactory.create(
        this.config,
        this.hnswLib,
        persistenceManager,
        {} as any, // CacheManager not needed
        diagnosticsService as any,
        contentHashService,
        this.persistentPath || '/tmp/hnsw'
      );

      // Initialize remaining services that depend on hnswLib
      this.partitionManager = new HnswPartitionManager(this.config, this.hnswLib);
      
      this.indexManager = new HnswIndexManager(
        this.config,
        this.validationService,
        this.persistenceService,
        this.partitionManager,
        contentHashService,
        this.hnswLib
      );

      this.searchEngine = new HnswSearchEngine(
        this.config,
        this.validationService,
        this.indexManager
      );

      this.isInitialized = true;
      
      // Discover and recover existing indexes after initialization
      await this.discoverAndRecoverIndexes();
      
      // Check if we need to build indexes from existing ChromaDB collections
      await this.ensureIndexesForExistingCollections();
      logger.systemLog('HNSW search service initialized successfully', 'HnswSearchService');
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize HNSW: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Create or update HNSW index for a collection
   * @param collectionName Collection name
   * @param items Items to index
   */
  async indexCollection(collectionName: string, items: DatabaseItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) {
      logger.systemLog(`No items to index for collection: ${collectionName}`, 'HnswSearchService');
      return;
    }

    try {
      const result = await this.indexManager.createOrUpdateIndex(collectionName, items);
      
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
    }
  }

  /**
   * Perform fast HNSW search (main search method)
   * @param collectionName Collection name
   * @param queryEmbedding Query embedding
   * @param nResults Number of results
   * @param where Optional filter clause
   * @returns Search results
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    nResults = 10,
    where?: WhereClause
  ): Promise<ItemWithDistance[]> {
    if (!this.isInitialized) {
      logger.systemWarn('HNSW service not initialized', 'HnswSearchService');
      return [];
    }

    try {
      const searchParams: SearchParameters = {
        collectionName,
        queryEmbedding,
        nResults,
        where,
      };

      const searchResult = await this.searchEngine.searchSimilar(searchParams);
      
      logger.systemLog(
        `Search completed: ${searchResult.items.length} results in ${searchResult.searchStats.searchTime}ms`,
        'HnswSearchService'
      );

      return searchResult.items;
    } catch (error) {
      logger.systemError(
        new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      return [];
    }
  }

  /**
   * Search content with metadata filtering (unified search integration)
   * Maintains backward compatibility with existing API
   */
  async searchWithMetadataFilter(
    query: string,
    limitOrFiles?: number | TFile[],
    metadataOrOptions?: any | SearchOptions
  ): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      logger.systemWarn('HNSW service not initialized', 'HnswSearchService');
      return [];
    }

    // Parse overloaded parameters (maintain backward compatibility)
    const { limit, threshold, includeContent, filteredFiles } = this.parseSearchParameters(
      limitOrFiles,
      metadataOrOptions
    );

    const collectionName = 'file_embeddings';

    if (!this.indexManager.hasIndex(collectionName)) {
      logger.systemWarn(`No index found for collection: ${collectionName}`, 'HnswSearchService');
      return [];
    }

    try {
      // Check if embedding service is available
      if (!this.embeddingService) {
        logger.systemWarn('No embedding service available for semantic search', 'HnswSearchService');
        return [];
      }

      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        logger.systemError(new Error('Failed to generate query embedding'), 'HnswSearchService');
        return [];
      }

      // Create where clause for file filtering if needed
      let where: WhereClause | undefined;
      if (filteredFiles && filteredFiles.length > 0) {
        const allowedPaths = filteredFiles.map(f => f.path);
        where = { filePath: { $in: allowedPaths } };
      }

      // Perform search
      const searchParams: SearchParameters = {
        collectionName,
        queryEmbedding,
        nResults: limit,
        where,
      };

      const searchResult = await this.searchEngine.searchSimilar(searchParams);

      // Process results
      const options: SearchOptions = {
        threshold,
        includeContent,
        limit,
      };

      return this.resultProcessor.processForUnifiedSearch(
        searchResult.items,
        filteredFiles,
        options
      );
    } catch (error) {
      logger.systemError(
        new Error(`Metadata search failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      return [];
    }
  }

  /**
   * Parse overloaded search parameters for backward compatibility
   */
  private parseSearchParameters(
    limitOrFiles?: number | TFile[],
    metadataOrOptions?: any | SearchOptions
  ): {
    limit: number;
    threshold: number;
    includeContent: boolean;
    filteredFiles?: TFile[];
  } {
    let limit = 10;
    let threshold = 0.7;
    let includeContent = false;
    let filteredFiles: TFile[] | undefined;

    if (typeof limitOrFiles === 'number') {
      // Old signature: searchWithMetadataFilter(query, limit, metadata)
      limit = limitOrFiles;
    } else if (Array.isArray(limitOrFiles)) {
      // New signature: searchWithMetadataFilter(query, filteredFiles, options)
      filteredFiles = limitOrFiles;
      const options = (metadataOrOptions as SearchOptions) || {};
      limit = options.limit || 10;
      threshold = options.threshold || 0.7;
      includeContent = options.includeContent || false;
    } else if (limitOrFiles === undefined && metadataOrOptions) {
      // Only options provided: searchWithMetadataFilter(query, undefined, options)
      const options = (metadataOrOptions as SearchOptions) || {};
      limit = options.limit || 10;
      threshold = options.threshold || 0.7;
      includeContent = options.includeContent || false;
    }

    return { limit, threshold, includeContent, filteredFiles };
  }

  /**
   * Add single item to existing index
   */
  async addItemToIndex(collectionName: string, item: DatabaseItem): Promise<void> {
    if (!this.isInitialized) return;
    await this.indexManager.addItemToIndex(collectionName, item);
  }

  /**
   * Remove item from index
   */
  async removeItemFromIndex(collectionName: string, itemId: string): Promise<void> {
    if (!this.isInitialized) return;
    await this.indexManager.removeItemFromIndex(collectionName, itemId);
  }

  /**
   * Index file content for unified search (legacy compatibility)
   */
  async indexFileContent(file: TFile, _content: string): Promise<void> {
    // This method is kept for backward compatibility
    // Actual implementation should go through the main indexing pipeline
    logger.systemLog(`File indexing request for: ${file.path}`, 'HnswSearchService');
  }

  /**
   * Remove file from unified search index (legacy compatibility)
   */
  async removeFileFromIndex(filePath: string): Promise<void> {
    const collectionName = 'file_embeddings';
    await this.removeItemFromIndex(collectionName, filePath);
  }

  /**
   * Check if collection has an index
   */
  hasIndex(collectionName: string): boolean {
    if (!this.isInitialized) return false;
    return this.indexManager.hasIndex(collectionName);
  }

  /**
   * Get index statistics
   */
  getIndexStats(collectionName: string): { itemCount: number; dimension: number; partitions?: number } | null {
    if (!this.isInitialized) return null;
    
    const stats = this.indexManager.getIndexStatistics(collectionName);
    if (!stats) return null;

    return {
      itemCount: stats.totalItems,
      dimension: stats.dimension,
      partitions: stats.partitionCount,
    };
  }

  /**
   * Remove index for collection
   */
  removeIndex(collectionName: string): void {
    if (!this.isInitialized) return;
    this.indexManager.removeIndex(collectionName);
  }

  /**
   * Clear all indexes
   */
  clearAllIndexes(): void {
    if (!this.isInitialized) return;
    this.indexManager.clearAllIndexes();
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): { totalIndexes: number; totalItems: number; totalPartitions: number } {
    if (!this.isInitialized) {
      return { totalIndexes: 0, totalItems: 0, totalPartitions: 0 };
    }

    const stats = this.indexManager.getMemoryStatistics();
    return {
      totalIndexes: stats.totalIndexes,
      totalItems: stats.totalItems,
      totalPartitions: stats.totalPartitions,
    };
  }

  /**
   * Force rebuild of index
   */
  async forceRebuildIndex(collectionName: string, items: DatabaseItem[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    await this.indexManager.forceRebuildIndex(collectionName, items);
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStatistics(): {
    initialized: boolean;
    configuration: any;
    indexStats: any;
    persistenceStats: any;
    memoryStats: any;
  } {
    return {
      initialized: this.isInitialized,
      configuration: this.config.toJSON(),
      indexStats: this.isInitialized ? this.indexManager.getMemoryStatistics() : null,
      persistenceStats: this.persistenceService.getStatistics(),
      memoryStats: this.getMemoryStats(),
    };
  }

  /**
   * Update service configuration
   */
  async updateConfiguration(configOptions: Partial<HnswConfigOptions>): Promise<void> {
    const newConfig = this.config.withOverrides(configOptions);
    
    this.config = newConfig;
    
    // Propagate configuration changes to all services
    if (this.isInitialized) {
      this.indexManager.updateConfig(newConfig);
      // Other services are updated through the index manager
    }

    logger.systemLog('Configuration updated successfully', 'HnswSearchService');
  }

  /**
   * Get search performance estimates
   */
  getSearchPerformanceEstimate(collectionName: string, nResults: number): {
    estimatedTimeMs: number;
    complexity: string;
    recommendations?: string[];
  } {
    if (!this.isInitialized) {
      return {
        estimatedTimeMs: 0,
        complexity: 'Service not initialized',
        recommendations: ['Initialize the service first'],
      };
    }

    return this.searchEngine.estimateSearchPerformance(collectionName, nResults);
  }

  /**
   * Diagnostic method for troubleshooting
   */
  async diagnose(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    recommendations: string[];
    details: any;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check initialization
    if (!this.isInitialized) {
      issues.push('Service not initialized');
      recommendations.push('Call initialize() method');
    }

    // Check dependencies
    if (!this.embeddingService) {
      issues.push('No embedding service configured');
      recommendations.push('Configure embedding service for semantic search');
    }

    if (!this.persistentPath && this.config.persistence.enabled) {
      issues.push('Persistence enabled but no path configured');
      recommendations.push('Configure persistent path or disable persistence');
    }

    // Check memory usage
    const memoryStats = this.getMemoryStats();
    if (memoryStats.totalItems > 50000) {
      issues.push('Large number of indexed items may impact performance');
      recommendations.push('Consider using partitioned indexing or index cleanup');
    }

    const status = issues.length === 0 ? 'healthy' : (issues.length < 3 ? 'warning' : 'error');

    return {
      status,
      issues,
      recommendations,
      details: {
        serviceStats: this.getServiceStatistics(),
        memoryStats,
      },
    };
  }

  /**
   * Discover and recover existing indexes from IndexedDB
   * Called automatically during initialization
   * SUPERLATIVE FIX: Now actually loads indexes into memory instead of just metadata
   */
  private async discoverAndRecoverIndexes(): Promise<void> {
    if (!this.persistenceService) {
      logger.systemWarn('Persistence service not available for index discovery', 'HnswSearchService');
      return;
    }

    try {
      logger.systemLog('🔄 Starting enhanced index discovery and recovery process', 'HnswSearchService');
      
      // Enhanced diagnostics with detailed persistence state
      const persistenceStats = await this.persistenceService.getStatistics();
      logger.systemLog(
        `📊 Persistence service state: enabled=${persistenceStats.persistenceEnabled}, indexedDB=${persistenceStats.indexedDbSupported}, cached=${persistenceStats.cachedMetadataCount}`,
        'HnswSearchService'
      );
      
      if (!persistenceStats.persistenceEnabled) {
        logger.systemLog('⚠️  Persistence disabled - skipping index recovery', 'HnswSearchService');
        return;
      }

      if (!persistenceStats.indexedDbSupported) {
        logger.systemWarn('⚠️  IndexedDB not supported - cannot recover indexes', 'HnswSearchService');
        return;
      }
      
      // Check if we have the discovery method
      if (typeof this.persistenceService.discoverExistingIndexes === 'function') {
        try {
          const discoveredCollections = await this.persistenceService.discoverExistingIndexes();
          
          if (discoveredCollections.length > 0) {
            logger.systemLog(
              `🎯 Found ${discoveredCollections.length} existing collections with persisted indexes: ${discoveredCollections.join(', ')}`,
              'HnswSearchService'
            );
            
            let recoveredCount = 0;
            let failedCount = 0;
            
            // SUPERLATIVE FIX: Actually load the indexes into memory
            for (const collectionName of discoveredCollections) {
              try {
                const startTime = Date.now();
                logger.systemLog(`🔄 Attempting to recover index for collection: ${collectionName}`, 'HnswSearchService');
                
                const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
                if (!metadata) {
                  logger.systemWarn(`❌ No metadata found for collection ${collectionName}`, 'HnswSearchService');
                  failedCount++;
                  continue;
                }

                logger.systemLog(
                  `📋 Index metadata found for collection ${collectionName}: ${metadata.itemCount} items, ${metadata.dimension}D, partitioned=${metadata.isPartitioned}`,
                  'HnswSearchService'
                );

                // CRITICAL FIX: Actually load the index into memory instead of just metadata
                const loadResult = await this.persistenceService.loadIndex(collectionName, metadata);
                
                if (loadResult.success && loadResult.index) {
                  // Store the loaded index properly in the index manager
                  const indexData = {
                    index: loadResult.index,
                    idToItem: new Map(),
                    itemIdToHnswId: new Map(),
                    nextId: metadata.itemCount || 0,
                  };

                  // Store in the appropriate index storage
                  if (metadata.isPartitioned) {
                    // For partitioned indexes, we need to handle them differently
                    const partitionedLoadResult = await this.persistenceService.loadPartitionedIndex(collectionName, metadata);
                    if (partitionedLoadResult.success && partitionedLoadResult.partitions) {
                      const partitions = partitionedLoadResult.partitions.map(partitionIndex => ({
                        index: partitionIndex,
                        idToItem: new Map(),
                        itemIdToHnswId: new Map(),
                        nextId: 0,
                      }));

                      const partitionedIndex = {
                        partitions,
                        itemToPartition: new Map(),
                        maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
                        dimension: metadata.dimension,
                      };

                      this.indexManager['partitionedIndexes'].set(collectionName, partitionedIndex);
                      logger.systemLog(`✅ Successfully recovered partitioned index for ${collectionName} (${partitions.length} partitions)`, 'HnswSearchService');
                    } else {
                      logger.systemWarn(`❌ Failed to load partitioned index for ${collectionName}`, 'HnswSearchService');
                      failedCount++;
                      continue;
                    }
                  } else {
                    // Store single index
                    this.indexManager['singleIndexes'].set(collectionName, indexData);
                    logger.systemLog(`✅ Successfully recovered single index for ${collectionName}`, 'HnswSearchService');
                  }

                  const loadTime = Date.now() - startTime;
                  logger.systemLog(
                    `⚡ Index recovery completed for ${collectionName} in ${loadTime}ms`,
                    'HnswSearchService'
                  );
                  recoveredCount++;
                  
                } else {
                  logger.systemWarn(
                    `❌ Failed to load persisted index for ${collectionName}: ${loadResult.errorReason}`,
                    'HnswSearchService'
                  );
                  failedCount++;
                }
              } catch (error) {
                logger.systemError(
                  new Error(`Failed to recover index for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
                  'HnswSearchService'
                );
                failedCount++;
              }
            }
            
            // Enhanced summary logging
            logger.systemLog(
              `🎉 Index recovery completed: ${recoveredCount} recovered, ${failedCount} failed out of ${discoveredCollections.length} discovered`,
              'HnswSearchService'
            );
            
            if (recoveredCount > 0) {
              logger.systemLog(`🚀 Successfully recovered ${recoveredCount} indexes - startup will be faster!`, 'HnswSearchService');
            }
            
          } else {
            logger.systemLog('📭 No existing indexes found during discovery - will build fresh', 'HnswSearchService');
          }
        } catch (discoveryError) {
          // Enhanced error logging with more context
          logger.systemError(
            new Error(`Index discovery failed: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`),
            'HnswSearchService'
          );
          
          // Enhanced fallback logging
          logger.systemLog('🔄 Continuing without discovery - will build indexes fresh during initialization', 'HnswSearchService');
        }
      } else {
        logger.systemWarn('⚠️  Discovery method not available in persistence service', 'HnswSearchService');
      }
    } catch (error) {
      logger.systemError(
        new Error(`Index discovery and recovery failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      // Don't throw - discovery failure shouldn't prevent service initialization
    }
  }

  /**
   * Ensure HNSW indexes exist for all ChromaDB collections with embeddings
   * Called during initialization to build missing indexes
   * SUPERLATIVE FIX: Now checks persistence first before rebuilding
   */
  private async ensureIndexesForExistingCollections(): Promise<void> {
    try {
      logger.systemLog('🔍 Intelligently checking collections for missing HNSW indexes (persistence-first approach)', 'HnswSearchService');
      
      // Get reference to the vector store to check for existing collections
      const vectorStore = (this.app as any)?.plugins?.plugins?.['claudesidian-mcp']?.services?.vectorStore;
      if (!vectorStore) {
        logger.systemWarn('⚠️  Vector store not available for index building', 'HnswSearchService');
        return;
      }

      // List all collections
      const collections = await vectorStore.listCollections();
      logger.systemLog(`📋 Found ${collections.length} collections: ${collections.join(', ')}`, 'HnswSearchService');

      let indexesLoaded = 0;
      let indexesBuilt = 0;
      let indexesSkipped = 0;

      // SUPERLATIVE FIX: Check each collection with intelligent persistence-first logic
      for (const collectionName of collections) {
        try {
          const startTime = Date.now();
          
          // CRITICAL FIX: Check if we already have the index loaded in memory
          if (this.hasIndex(collectionName)) {
            logger.systemLog(`✅ Index already loaded in memory for collection: ${collectionName}`, 'HnswSearchService');
            indexesLoaded++;
            continue;
          }

          // Check if collection has items with embeddings
          const count = await vectorStore.count(collectionName);
          if (count === 0) {
            logger.systemLog(`📭 Skipping empty collection: ${collectionName}`, 'HnswSearchService');
            indexesSkipped++;
            continue;
          }

          logger.systemLog(`🔍 Processing collection: ${collectionName} (${count} items)`, 'HnswSearchService');

          // SUPERLATIVE FIX: Check for persisted index BEFORE attempting to rebuild
          let indexLoadedFromPersistence = false;
          
          if (this.persistenceService) {
            try {
              // Get current items for validation
              const items = await vectorStore.getItems(collectionName, { limit: count });
              const databaseItems = this.convertToDatabaseItems(items);
              
              // Check if we can load from persistence
              const canLoadPersisted = await this.persistenceService.canLoadPersistedIndex(collectionName, databaseItems);
              
              if (canLoadPersisted) {
                logger.systemLog(`🔄 Attempting to load ${collectionName} from persistence instead of rebuilding`, 'HnswSearchService');
                
                // Load metadata to determine index type
                const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
                if (metadata) {
                  // Try to load the actual index
                  let loadResult;
                  
                  if (metadata.isPartitioned) {
                    loadResult = await this.persistenceService.loadPartitionedIndex(collectionName, metadata);
                    if (loadResult.success && loadResult.partitions) {
                      // Store partitioned index
                      const partitions = loadResult.partitions.map(partitionIndex => ({
                        index: partitionIndex,
                        idToItem: new Map(),
                        itemIdToHnswId: new Map(),
                        nextId: 0,
                      }));

                      const partitionedIndex = {
                        partitions,
                        itemToPartition: new Map(),
                        maxItemsPerPartition: this.config.partitioning.maxItemsPerPartition,
                        dimension: metadata.dimension,
                      };

                      // Populate mappings from current items
                      for (let i = 0; i < partitions.length; i++) {
                        const partitionItems = this.getItemsForPartition(databaseItems, i, partitions.length);
                        this.populateIndexMappings(partitions[i], partitionItems, partitionedIndex.itemToPartition, i);
                      }

                      this.indexManager['partitionedIndexes'].set(collectionName, partitionedIndex);
                      indexLoadedFromPersistence = true;
                      logger.systemLog(`✅ Successfully loaded partitioned index from persistence for ${collectionName}`, 'HnswSearchService');
                    }
                  } else {
                    loadResult = await this.persistenceService.loadIndex(collectionName, metadata);
                    if (loadResult.success && loadResult.index) {
                      // Store single index with populated mappings
                      const indexData = {
                        index: loadResult.index,
                        idToItem: new Map(),
                        itemIdToHnswId: new Map(),
                        nextId: metadata.itemCount || 0,
                      };

                      // Populate mappings from current items
                      this.populateIndexMappings(indexData, databaseItems);

                      this.indexManager['singleIndexes'].set(collectionName, indexData);
                      indexLoadedFromPersistence = true;
                      logger.systemLog(`✅ Successfully loaded single index from persistence for ${collectionName}`, 'HnswSearchService');
                    }
                  }
                }
              }
            } catch (persistenceError) {
              logger.systemWarn(
                `⚠️  Failed to load ${collectionName} from persistence: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
                'HnswSearchService'
              );
            }
          }

          // FALLBACK: Only rebuild if we couldn't load from persistence
          if (!indexLoadedFromPersistence) {
            logger.systemLog(`🔨 Building fresh HNSW index for collection: ${collectionName} (${count} items)`, 'HnswSearchService');
            
            // Get items from the collection
            const items = await vectorStore.getItems(collectionName, { limit: count });
            
            // Convert to DatabaseItem format
            const databaseItems = this.convertToDatabaseItems(items);
            
            if (databaseItems.length > 0) {
              // Build the index using the service's own indexCollection method
              await this.indexCollection(collectionName, databaseItems);
              logger.systemLog(`✅ Successfully built fresh HNSW index for ${collectionName}: ${databaseItems.length} items indexed`, 'HnswSearchService');
              indexesBuilt++;
            } else {
              logger.systemWarn(`⚠️  No valid items with embeddings found in collection: ${collectionName}`, 'HnswSearchService');
              indexesSkipped++;
            }
          } else {
            indexesLoaded++;
          }

          const processingTime = Date.now() - startTime;
          logger.systemLog(`⚡ Collection ${collectionName} processed in ${processingTime}ms`, 'HnswSearchService');
          
        } catch (error) {
          logger.systemError(
            new Error(`Failed to process collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
            'HnswSearchService'
          );
          indexesSkipped++;
        }
      }

      // Enhanced summary with detailed metrics
      const totalProcessed = indexesLoaded + indexesBuilt + indexesSkipped;
      logger.systemLog(
        `🎉 Collection processing completed: ${indexesLoaded} loaded from persistence, ${indexesBuilt} built fresh, ${indexesSkipped} skipped (${totalProcessed} total)`,
        'HnswSearchService'
      );

      if (indexesLoaded > 0) {
        logger.systemLog(`🚀 Persistence optimization successful: ${indexesLoaded} indexes loaded instantly!`, 'HnswSearchService');
      }

    } catch (error) {
      logger.systemError(
        new Error(`Failed to ensure indexes for existing collections: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
    }
  }

  /**
   * Helper method to populate index mappings for loaded indexes
   * SUPERLATIVE ADDITION: Essential for proper index recovery
   */
  private populateIndexMappings(
    indexData: any, 
    items: DatabaseItem[], 
    itemToPartition?: Map<string, number>, 
    partitionIndex?: number
  ): void {
    let hnswId = 0;

    for (const item of items) {
      if (!item.embedding || item.embedding.length === 0) {
        continue;
      }

      // Map the item to the HNSW ID
      indexData.idToItem.set(hnswId, item);
      indexData.itemIdToHnswId.set(item.id, hnswId);
      
      // For partitioned indexes, track which partition this item belongs to
      if (itemToPartition !== undefined && partitionIndex !== undefined) {
        itemToPartition.set(item.id, partitionIndex);
      }
      
      hnswId++;
    }

    indexData.nextId = hnswId;
  }

  /**
   * Helper method to get items for a specific partition using round-robin distribution
   * SUPERLATIVE ADDITION: Supports partitioned index loading
   */
  private getItemsForPartition(items: DatabaseItem[], partitionIndex: number, totalPartitions: number): DatabaseItem[] {
    return items.filter((_, index) => index % totalPartitions === partitionIndex);
  }

  /**
   * Convert ChromaDB items to DatabaseItem format
   */
  private convertToDatabaseItems(items: any): DatabaseItem[] {
    const databaseItems: DatabaseItem[] = [];
    
    if (!items.ids || !items.embeddings || !items.documents) {
      return databaseItems;
    }

    for (let i = 0; i < items.ids.length; i++) {
      const rawEmbedding = items.embeddings[i] || [];
      
      // Convert embedding to regular array of numbers
      let validEmbedding: number[] = [];
      
      if (rawEmbedding && typeof rawEmbedding === 'object' && rawEmbedding.length > 0) {
        // Handle typed arrays (Float32Array, Float64Array, etc.) and regular arrays
        if (Array.isArray(rawEmbedding) || rawEmbedding.constructor?.name?.includes('Array')) {
          validEmbedding = Array.from(rawEmbedding).map((val: any) => {
            const numVal = Number(val);
            if (isNaN(numVal) || !isFinite(numVal)) {
              return 0; // Default to 0 for invalid values
            }
            return numVal;
          });
        }
      }
      
      const item: DatabaseItem = {
        id: String(items.ids[i]),
        embedding: validEmbedding,
        document: String(items.documents[i] || ''),
        metadata: items.metadatas?.[i] || {}
      };
      
      // Only include items that have valid embeddings
      if (item.embedding && item.embedding.length > 0) {
        databaseItems.push(item);
      } else {
        logger.systemWarn(
          `Skipping item ${i} with invalid embedding: length=${item.embedding?.length}`,
          'HnswSearchService'
        );
      }
    }

    return databaseItems;
  }
}