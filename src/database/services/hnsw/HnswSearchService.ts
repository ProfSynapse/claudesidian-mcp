/**
 * Refactored HNSW Search Service - Clean Architecture
 * Orchestrates specialized services following SOLID principles
 * Maintains backward compatibility while providing clean, focused architecture
 */

import { loadHnswlib } from 'hnswlib-wasm';
import { DatabaseItem, WhereClause } from '../../providers/chroma/services/FilterEngine';
import { TFile, App } from 'obsidian';
import { EmbeddingService } from '../EmbeddingService';
import { IVectorStore } from '../../interfaces/IVectorStore';
import { logger } from '../../../utils/logger';

// Import specialized services and orchestrators
import { HnswConfig, HnswConfigOptions } from './config/HnswConfig';
import { ServiceInitializer } from './initialization/ServiceInitializer';
import { FullInitializationOrchestrator } from './initialization/FullInitializationOrchestrator';
import { DataConversionService } from './conversion/DataConversionService';
import { SearchParameters } from './search/HnswSearchEngine';
import { SearchOptions, SearchResult } from './results/HnswResultProcessor';

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
 * Uses service composition and dependency injection
 */
export class HnswSearchService {
  // Core dependencies
  private app?: App;
  private vectorStore?: IVectorStore;
  private embeddingService?: EmbeddingService;
  private persistentPath?: string;

  // Service orchestrators and managers
  private config: HnswConfig;
  private serviceInitializer: ServiceInitializer;
  private initializationOrchestrator!: FullInitializationOrchestrator;
  private conversionService: DataConversionService;

  // Specialized services (accessed through orchestrators)
  private services: any = {};

  // HNSW library and initialization state
  private hnswLib: any = null;
  private isInitialized = false;
  private fullyInitialized = false;
  private isFullyReady = false;

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

    // Initialize service orchestrators
    this.serviceInitializer = new ServiceInitializer(app, vectorStore, embeddingService, persistentPath, configOptions);
    this.conversionService = new DataConversionService();

    // Initialize lightweight services immediately
    this.initializeLightweightServices();
  }

  /**
   * Initialize lightweight services that don't require HNSW library
   */
  private async initializeLightweightServices(): Promise<void> {
    try {
      this.services = await this.serviceInitializer.initializeServices();
      logger.systemLog('Lightweight HNSW services initialized successfully', 'HnswSearchService');
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize lightweight services: ${error instanceof Error ? error.message : String(error)}`),
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

      // Complete service initialization with HNSW library
      const fullServices = await this.serviceInitializer.initializeWithHnswLib(this.hnswLib);
      
      // Update services with full initialization
      Object.assign(this.services, fullServices);

      // Initialize full initialization orchestrator
      this.initializationOrchestrator = new FullInitializationOrchestrator(
        this.config,
        this.services.persistenceService,
        this.services.indexManager,
        this.app
      );

      this.isInitialized = true;
      
      logger.systemLog('HNSW search service initialized (lightweight) - discovery deferred for performance', 'HnswSearchService');
    } catch (error) {
      logger.systemError(
        new Error(`Failed to initialize HNSW: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Ensure full initialization including index discovery and collection processing
   * This is called lazily when HNSW functionality is first used or during background initialization
   */
  async ensureFullyInitialized(): Promise<void> {
    // First ensure basic initialization
    await this.initialize();
    
    if (this.fullyInitialized) return;

    try {
      const result = await this.initializationOrchestrator.executeFullInitialization();
      
      // Always mark as initialized to prevent repeated attempts
      this.fullyInitialized = true;
      this.isFullyReady = result.success;
      
      if (result.success) {
        logger.systemLog('[STARTUP] HNSW initialization completed successfully', 'HnswSearchService');
      } else {
        logger.systemLog(`[STARTUP] HNSW initialization completed with errors - service available (${result.errors.length} errors)`, 'HnswSearchService');
      }
    } catch (criticalError) {
      // Even critical errors shouldn't prevent the service from being marked as initialized
      this.fullyInitialized = true;
      this.isFullyReady = true;
      logger.systemError(
        new Error(`Critical HNSW initialization error: ${criticalError instanceof Error ? criticalError.message : String(criticalError)}`),
        'HnswSearchService'
      );
      logger.systemLog('[STARTUP] HNSW service marked as initialized despite errors - search will work with available indexes', 'HnswSearchService');
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

  // ===== LEGACY COMPATIBILITY METHODS =====
  // These methods maintain backward compatibility with existing services

  /**
   * Legacy search method that returns ItemWithDistance[] for backward compatibility
   * @deprecated Use searchSimilar() instead, which returns SearchResult[]
   */
  async searchSimilarLegacy(
    collectionName: string,
    queryEmbedding: number[],
    nResults: number,
    whereClause?: WhereClause
  ): Promise<ItemWithDistance[]> {
    const options: SearchOptions = { 
      limit: nResults,
      includeContent: true
    };

    try {
      let searchResults: SearchResult[];
      
      if (whereClause) {
        searchResults = await this.searchWithMetadataFilter(collectionName, queryEmbedding, whereClause, options);
      } else {
        searchResults = await this.searchSimilar(collectionName, queryEmbedding, options);
      }

      // Convert SearchResult[] to ItemWithDistance[] for backward compatibility
      return this.convertSearchResultsToItemWithDistance(searchResults);
    } catch (error) {
      logger.systemError(
        new Error(`Legacy search failed for collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchService'
      );
      throw error;
    }
  }

  /**
   * Convert SearchResult[] to ItemWithDistance[] for legacy compatibility
   */
  private convertSearchResultsToItemWithDistance(searchResults: SearchResult[]): ItemWithDistance[] {
    return searchResults.map(result => {
      const item: DatabaseItem = {
        id: result.id,
        document: result.content || result.snippet,
        embedding: [], // Legacy format doesn't need embeddings in results
        metadata: {
          title: result.title,
          ...result.metadata
        }
      };

      return {
        item,
        distance: 1 - result.score // Convert similarity score to distance
      };
    });
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
      
      // For now, use default collection 'files' - this should be configurable
      const collectionName = 'files';
      
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
   * Index file content (legacy method for backward compatibility)
   */
  async indexFileContent(file: TFile, _content: string): Promise<void> {
    logger.systemWarn('indexFileContent is deprecated - use indexCollection instead', 'HnswSearchService');
  }

  /**
   * Remove file from index (legacy method for backward compatibility)
   */
  async removeFileFromIndex(filePath: string): Promise<void> {
    logger.systemWarn('removeFileFromIndex is deprecated - use removeItemFromIndex instead', 'HnswSearchService');
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
    
    return {
      itemCount: stats.itemCount || 0,
      dimension: stats.dimension || 0,
      partitions: stats.partitions
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
    
    if (this.serviceInitializer) {
      this.serviceInitializer.updateConfiguration(configOptions);
    }
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

  // Legacy method support for backward compatibility
  private parseSearchParameters(
    queryEmbedding: number[],
    options: LegacySearchOptions = {}
  ): SearchParameters {
    return {
      collectionName: '',
      queryEmbedding,
      nResults: options.limit || 10
    };
  }
}