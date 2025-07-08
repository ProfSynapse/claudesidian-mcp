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
   */
  private async discoverAndRecoverIndexes(): Promise<void> {
    if (!this.persistenceService) {
      logger.systemWarn('Persistence service not available for index discovery', 'HnswSearchService');
      return;
    }

    try {
      logger.systemLog('Starting index discovery and recovery process', 'HnswSearchService');
      
      // Debug: Check persistence service state
      const persistenceStats = await this.persistenceService.getStatistics();
      logger.systemLog(
        `Persistence service state: enabled=${persistenceStats.persistenceEnabled}, indexedDB=${persistenceStats.indexedDbSupported}, cached=${persistenceStats.cachedMetadataCount}`,
        'HnswSearchService'
      );
      
      // Check if we have the discovery method
      if (typeof this.persistenceService.discoverExistingIndexes === 'function') {
        try {
          const discoveredCollections = await this.persistenceService.discoverExistingIndexes();
          
          if (discoveredCollections.length > 0) {
            logger.systemLog(
              `Found ${discoveredCollections.length} existing collections with indexes: ${discoveredCollections.join(', ')}`,
              'HnswSearchService'
            );
            
            // For each discovered collection, try to validate and load the index
            for (const collectionName of discoveredCollections) {
              try {
                const metadata = await this.persistenceService.loadIndexMetadata(collectionName);
                if (metadata) {
                  logger.systemLog(
                    `Index metadata found for collection ${collectionName}: ${metadata.itemCount} items, ${metadata.dimension}D`,
                    'HnswSearchService'
                  );
                  
                  // Index will be loaded on-demand when actually needed
                  // This prevents startup delays while still enabling discovery
                }
              } catch (error) {
                logger.systemWarn(
                  `Failed to load metadata for discovered collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`,
                  'HnswSearchService'
                );
              }
            }
          } else {
            logger.systemLog('No existing indexes found during discovery', 'HnswSearchService');
          }
        } catch (discoveryError) {
          // Discovery failed - log detailed diagnostic information
          logger.systemError(
            new Error(`Index discovery failed: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`),
            'HnswSearchService'
          );
          
          // Continue initialization without discovery - indexes will be built fresh
          logger.systemLog('Continuing without discovery - will build indexes fresh during initialization', 'HnswSearchService');
        }
      } else {
        logger.systemWarn('Discovery method not available in persistence service', 'HnswSearchService');
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
   */
  private async ensureIndexesForExistingCollections(): Promise<void> {
    try {
      logger.systemLog('Checking for existing collections that need HNSW indexes', 'HnswSearchService');
      
      // Get reference to the vector store to check for existing collections
      const vectorStore = (this.app as any)?.plugins?.plugins?.['claudesidian-mcp']?.services?.vectorStore;
      if (!vectorStore) {
        logger.systemWarn('Vector store not available for index building', 'HnswSearchService');
        return;
      }

      // List all collections
      const collections = await vectorStore.listCollections();
      logger.systemLog(`Found ${collections.length} collections: ${collections.join(', ')}`, 'HnswSearchService');

      // Check each collection for missing indexes
      for (const collectionName of collections) {
        try {
          // Skip if we already have an index
          if (this.hasIndex(collectionName)) {
            logger.systemLog(`Index already exists for collection: ${collectionName}`, 'HnswSearchService');
            continue;
          }

          // Check if collection has items with embeddings
          const count = await vectorStore.count(collectionName);
          if (count === 0) {
            logger.systemLog(`Skipping empty collection: ${collectionName}`, 'HnswSearchService');
            continue;
          }

          logger.systemLog(`Building missing HNSW index for collection: ${collectionName} (${count} items)`, 'HnswSearchService');
          
          // Get items from the collection
          const items = await vectorStore.getItems(collectionName, { limit: count });
          
          // Convert to DatabaseItem format
          const databaseItems = this.convertToDatabaseItems(items);
          
          if (databaseItems.length > 0) {
            // Build the index using the service's own indexCollection method
            await this.indexCollection(collectionName, databaseItems);
            logger.systemLog(`Successfully built HNSW index for ${collectionName}: ${databaseItems.length} items indexed`, 'HnswSearchService');
          } else {
            logger.systemWarn(`No valid items with embeddings found in collection: ${collectionName}`, 'HnswSearchService');
          }
        } catch (error) {
          logger.systemError(
            new Error(`Failed to build index for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
            'HnswSearchService'
          );
        }
      }
    } catch (error) {
      logger.systemError(
        new Error(`Failed to ensure indexes for existing collections: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
    }
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
      const item: DatabaseItem = {
        id: items.ids[i],
        embedding: items.embeddings[i] || [],
        document: items.documents[i] || '',
        metadata: items.metadatas?.[i] || {}
      };
      
      // Only include items that have valid embeddings
      if (item.embedding && item.embedding.length > 0) {
        databaseItems.push(item);
      }
    }

    return databaseItems;
  }
}