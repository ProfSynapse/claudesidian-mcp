/**
 * HnswSearchEngine - Handles HNSW search operations
 * Follows Single Responsibility Principle by focusing only on search
 * Optimizes search performance and handles both single and partitioned indexes
 */

import { logger } from '../../../../utils/logger';
import { DatabaseItem, FilterEngine, WhereClause } from '../../../providers/chroma/services/FilterEngine';
import { HnswConfig } from '../config/HnswConfig';
import { HnswValidationService } from '../validation/HnswValidationService';
import { HnswIndexManager } from '../index/HnswIndexManager';
import { HnswIndex, PartitionedHnswIndex } from '../partitioning/HnswPartitionManager';

export interface ItemWithDistance {
  item: DatabaseItem;
  distance: number;
}

export interface SearchParameters {
  collectionName: string;
  queryEmbedding: number[];
  nResults: number;
  where?: WhereClause;
}

export interface SearchResult {
  items: ItemWithDistance[];
  searchStats: {
    searchMethod: 'single' | 'partitioned';
    totalResults: number;
    searchTime: number;
    partitionsSearched?: number;
    efSearchUsed: number;
  };
}

export class HnswSearchEngine {
  private config: HnswConfig;
  private validationService: HnswValidationService;
  private indexManager: HnswIndexManager;

  constructor(
    config: HnswConfig,
    validationService: HnswValidationService,
    indexManager: HnswIndexManager
  ) {
    this.config = config;
    this.validationService = validationService;
    this.indexManager = indexManager;
  }

  /**
   * Perform semantic search using HNSW indexes
   * @param params Search parameters
   * @returns Search results with statistics
   */
  async searchSimilar(params: SearchParameters): Promise<SearchResult> {
    const startTime = Date.now();

    // Validate search parameters
    const validationResult = this.validationService.validateSearchParameters(params);
    if (!validationResult.isValid) {
      logger.systemWarn(
        `Search validation failed: ${validationResult.formattedError}`,
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    }

    // Validate query embedding specifically
    const embeddingValidation = this.validationService.validateQueryEmbedding(params.queryEmbedding);
    if (!embeddingValidation.isValid) {
      logger.systemWarn(
        `Query embedding validation failed: ${embeddingValidation.formattedError}`,
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    }

    // Check if we have an index for this collection
    if (!this.indexManager.hasIndex(params.collectionName)) {
      logger.systemWarn(
        `No index found for collection: ${params.collectionName}`,
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    }

    try {
      // Check for partitioned index first
      const partitionedIndex = this.indexManager.getPartitionedIndex(params.collectionName);
      if (partitionedIndex) {
        return await this.searchPartitioned(params, partitionedIndex, startTime);
      }

      // Fall back to single index search
      const singleIndex = this.indexManager.getSingleIndex(params.collectionName);
      if (singleIndex) {
        return await this.searchSingle(params, singleIndex, startTime);
      }

      logger.systemWarn(
        `No valid index found for collection: ${params.collectionName}`,
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    } catch (error) {
      logger.systemError(
        new Error(`Search failed for collection ${params.collectionName}: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    }
  }

  /**
   * Search within a single HNSW index
   * @param params Search parameters
   * @param indexData Single index data
   * @param startTime Search start time
   * @returns Search results
   */
  private async searchSingle(
    params: SearchParameters,
    indexData: HnswIndex,
    startTime: number
  ): Promise<SearchResult> {
    try {
      // Calculate optimal efSearch parameter
      const efSearch = this.config.calculateOptimalEfSearch(params.nResults);
      indexData.index.setEfSearch(efSearch);

      // Perform HNSW search with extra results for filtering
      const searchK = Math.max(params.nResults * 3, 100); // Get extra results for filtering
      const searchResults = indexData.index.searchKnn(params.queryEmbedding, searchK, null);

      // Convert HNSW results to our format and apply filtering
      const results: ItemWithDistance[] = [];

      for (let i = 0; i < searchResults.neighbors.length; i++) {
        const hnswId = searchResults.neighbors[i];
        const distance = searchResults.distances[i];
        const item = indexData.idToItem.get(hnswId);

        if (item) {
          // Apply where clause filtering if provided
          if (!params.where || this.matchesWhere(item, params.where)) {
            results.push({ item, distance });
          }
        }
      }

      // Sort by distance (lower is better) and limit results
      results.sort((a, b) => a.distance - b.distance);
      const finalResults = results.slice(0, params.nResults);

      const searchTime = Date.now() - startTime;
      
      logger.systemLog(
        `Single index search completed: ${finalResults.length} results in ${searchTime}ms`,
        'HnswSearchEngine'
      );

      return {
        items: finalResults,
        searchStats: {
          searchMethod: 'single',
          totalResults: finalResults.length,
          searchTime,
          efSearchUsed: efSearch,
        },
      };
    } catch (error) {
      logger.systemError(
        new Error(`Single index search failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchEngine'
      );
      return this.createEmptyResult('single', startTime);
    }
  }

  /**
   * Search across all partitions and merge results
   * @param params Search parameters
   * @param partitionedIndex Partitioned index data
   * @param startTime Search start time
   * @returns Search results
   */
  private async searchPartitioned(
    params: SearchParameters,
    partitionedIndex: PartitionedHnswIndex,
    startTime: number
  ): Promise<SearchResult> {
    try {
      const allResults: ItemWithDistance[] = [];
      const partitionCount = partitionedIndex.partitions.length;
      
      // Calculate how many results to get per partition
      const resultsPerPartition = this.config.calculateResultsPerPartition(
        params.nResults,
        partitionCount
      );

      // Search each partition
      for (let i = 0; i < partitionCount; i++) {
        const partition = partitionedIndex.partitions[i];
        
        try {
          const partitionResults = await this.searchSinglePartition(
            params,
            partition,
            resultsPerPartition
          );
          
          allResults.push(...partitionResults);
        } catch (error) {
          logger.systemWarn(
            `Search failed in partition ${i}: ${error instanceof Error ? error.message : String(error)}`,
            'HnswSearchEngine'
          );
          // Continue with other partitions
        }
      }

      // Sort all results by distance (lower is better)
      allResults.sort((a, b) => a.distance - b.distance);

      // Return top N results
      const finalResults = allResults.slice(0, params.nResults);
      const searchTime = Date.now() - startTime;

      logger.systemLog(
        `Partitioned search completed: ${finalResults.length} results from ${partitionCount} partitions in ${searchTime}ms`,
        'HnswSearchEngine'
      );

      return {
        items: finalResults,
        searchStats: {
          searchMethod: 'partitioned',
          totalResults: finalResults.length,
          searchTime,
          partitionsSearched: partitionCount,
          efSearchUsed: this.config.calculateOptimalEfSearch(resultsPerPartition),
        },
      };
    } catch (error) {
      logger.systemError(
        new Error(`Partitioned search failed: ${error instanceof Error ? error.message : String(error)}`),
        'HnswSearchEngine'
      );
      return this.createEmptyResult('partitioned', startTime);
    }
  }

  /**
   * Search a single partition
   * @param params Search parameters
   * @param partition Single partition index
   * @param nResults Number of results to get from this partition
   * @returns Partition search results
   */
  private async searchSinglePartition(
    params: SearchParameters,
    partition: HnswIndex,
    nResults: number
  ): Promise<ItemWithDistance[]> {
    // Calculate optimal efSearch for this partition
    const efSearch = this.config.calculateOptimalEfSearch(nResults);
    partition.index.setEfSearch(efSearch);

    // Perform HNSW search
    const searchResults = partition.index.searchKnn(params.queryEmbedding, nResults, null);

    // Convert results and apply filtering
    const results: ItemWithDistance[] = [];

    for (let i = 0; i < searchResults.neighbors.length; i++) {
      const hnswId = searchResults.neighbors[i];
      const distance = searchResults.distances[i];
      const item = partition.idToItem.get(hnswId);

      if (item) {
        // Apply where clause filtering if provided
        if (!params.where || this.matchesWhere(item, params.where)) {
          results.push({ item, distance });
        }
      }
    }

    return results;
  }

  /**
   * Check if item matches where clause using FilterEngine
   * @param item Database item
   * @param where Where clause
   * @returns True if item matches
   */
  private matchesWhere(item: DatabaseItem, where: WhereClause): boolean {
    try {
      return FilterEngine.matchesWhereClause(item, where);
    } catch (error) {
      logger.systemWarn(
        `Filter evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        'HnswSearchEngine'
      );
      return false; // Exclude items that fail filter evaluation
    }
  }

  /**
   * Create empty search result
   * @param searchMethod Search method used
   * @param startTime Search start time
   * @returns Empty search result
   */
  private createEmptyResult(searchMethod: 'single' | 'partitioned', startTime: number): SearchResult {
    return {
      items: [],
      searchStats: {
        searchMethod,
        totalResults: 0,
        searchTime: Date.now() - startTime,
        efSearchUsed: 0,
      },
    };
  }

  /**
   * Get search statistics for a collection
   * @param collectionName Collection name
   * @returns Search-related statistics
   */
  getSearchStatistics(collectionName: string): {
    hasIndex: boolean;
    indexType?: 'single' | 'partitioned';
    indexStats?: any;
    optimalEfSearch?: number;
  } {
    const hasIndex = this.indexManager.hasIndex(collectionName);
    if (!hasIndex) {
      return { hasIndex: false };
    }

    const indexStats = this.indexManager.getIndexStatistics(collectionName);
    const optimalEfSearch = this.config.calculateOptimalEfSearch(10); // Default for 10 results

    return {
      hasIndex: true,
      indexType: indexStats?.indexType,
      indexStats,
      optimalEfSearch,
    };
  }

  /**
   * Optimize search parameters for better performance
   * @param nResults Number of results requested
   * @param isPartitioned Whether the index is partitioned
   * @returns Optimized search parameters
   */
  optimizeSearchParameters(nResults: number, isPartitioned: boolean): {
    efSearch: number;
    searchK: number;
    resultsPerPartition?: number;
  } {
    const efSearch = this.config.calculateOptimalEfSearch(nResults);
    const searchK = Math.max(nResults * 3, 100);

    const optimization = {
      efSearch,
      searchK,
    };

    if (isPartitioned) {
      return {
        ...optimization,
        resultsPerPartition: this.config.calculateResultsPerPartition(nResults, 4), // Assume 4 partitions for estimation
      };
    }

    return optimization;
  }

  /**
   * Estimate search performance
   * @param collectionName Collection name
   * @param nResults Number of results
   * @returns Performance estimate
   */
  estimateSearchPerformance(collectionName: string, nResults: number): {
    estimatedTimeMs: number;
    complexity: string;
    recommendations?: string[];
  } {
    const indexStats = this.indexManager.getIndexStatistics(collectionName);
    if (!indexStats) {
      return {
        estimatedTimeMs: 0,
        complexity: 'N/A - no index',
        recommendations: ['Create an index for this collection'],
      };
    }

    // Rough estimates based on index type and size
    let baseTimeMs = 1; // Base search time
    let complexity = 'O(log n)';
    const recommendations: string[] = [];

    if (indexStats.indexType === 'partitioned') {
      // Partitioned search is slightly slower due to merging
      baseTimeMs = Math.log2(indexStats.totalItems / (indexStats.partitionCount || 1)) + 2;
      complexity = `O(log n/p) where p=${indexStats.partitionCount}`;
      
      if (indexStats.loadBalance && indexStats.loadBalance < 0.7) {
        recommendations.push('Consider rebalancing partitions for better performance');
      }
    } else {
      baseTimeMs = Math.log2(indexStats.totalItems) + 1;
    }

    // Factor in efSearch parameter
    const efSearch = this.config.calculateOptimalEfSearch(nResults);
    const efSearchFactor = Math.log2(efSearch) * 0.5;
    
    const estimatedTimeMs = Math.max(baseTimeMs + efSearchFactor, 1);

    // Performance recommendations
    if (nResults > 100) {
      recommendations.push('Consider reducing nResults for faster search');
    }
    
    if (indexStats.totalItems > 10000 && indexStats.indexType === 'single') {
      recommendations.push('Consider using partitioned indexing for large collections');
    }

    return {
      estimatedTimeMs: Math.round(estimatedTimeMs),
      complexity,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * Update configuration
   * @param newConfig New configuration
   */
  updateConfig(newConfig: HnswConfig): void {
    this.config = newConfig;
    this.validationService.updateConfig(newConfig);
  }
}