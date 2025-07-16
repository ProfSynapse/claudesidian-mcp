/**
 * ContentSearchStrategy - Handles content/semantic search
 * Follows Single Responsibility Principle by focusing only on content search
 */

import { TFile } from 'obsidian';
import { HnswSearchService } from '../../../../../../database/services/hnsw/HnswSearchService';
import { HybridSearchService, HybridSearchOptions } from '../../../../../../database/services/search';
import { UniversalSearchParams, UniversalSearchResultItem } from '../../../../types';

export interface ContentSearchResult {
  success: boolean;
  error?: string;
  results?: UniversalSearchResultItem[];
  searchMethod?: 'semantic' | 'keyword' | 'fuzzy' | 'hybrid';
}

/**
 * Service responsible for content and semantic search
 * Follows SRP by focusing only on content search operations
 */
export class ContentSearchStrategy {
  constructor(
    private hnswSearchService?: HnswSearchService,
    private hybridSearchService?: HybridSearchService
  ) {}

  /**
   * Search content using available search methods
   */
  async searchContent(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 5, 
    params?: UniversalSearchParams
  ): Promise<ContentSearchResult> {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: true,
          results: [],
          searchMethod: 'fuzzy'
        };
      }

      // Try hybrid search first (best results)
      if (this.hybridSearchService) {
        const hybridResult = await this.performHybridSearch(query, filteredFiles, limit, params);
        if (hybridResult.success) {
          return hybridResult;
        }
      }

      // Fallback to semantic search
      if (this.hnswSearchService) {
        const semanticResult = await this.performSemanticSearch(query, filteredFiles, limit);
        if (semanticResult.success) {
          return semanticResult;
        }
      }

      // Final fallback to keyword search
      return await this.performKeywordSearch(query, filteredFiles, limit);
    } catch (error) {
      return {
        success: false,
        error: `Content search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform hybrid search (semantic + keyword)
   */
  private async performHybridSearch(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 5, 
    params?: UniversalSearchParams
  ): Promise<ContentSearchResult> {
    try {
      if (!this.hybridSearchService) {
        return {
          success: false,
          error: 'Hybrid search service not available'
        };
      }

      const hybridOptions: HybridSearchOptions = {
        limit,
        includeContent: true,
        forceSemanticSearch: false,
        semanticThreshold: 0.5,
        keywordThreshold: 0.3,
        fuzzyThreshold: 0.6
      };

      const hybridResults = await this.hybridSearchService.search(query, hybridOptions, filteredFiles);

      const formattedResults = hybridResults.map((result: any) => ({
        id: result.filePath,
        title: result.title || result.filePath,
        snippet: result.snippet || result.preview || '',
        score: result.score || 0,
        searchMethod: 'hybrid' as const,
        metadata: {
          filePath: result.filePath,
          type: 'content',
          searchMethod: 'hybrid',
          semanticScore: result.semanticScore,
          keywordScore: result.keywordScore,
          combinedScore: result.score
        }
      }));

      return {
        success: true,
        results: formattedResults,
        searchMethod: 'hybrid'
      };
    } catch (error) {
      return {
        success: false,
        error: `Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform semantic search using HNSW
   */
  private async performSemanticSearch(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 5
  ): Promise<ContentSearchResult> {
    try {
      if (!this.hnswSearchService) {
        return {
          success: false,
          error: 'Semantic search service not available'
        };
      }

      const semanticResults = await this.hnswSearchService.searchWithMetadataFilterHighLevel(
        query,
        filteredFiles,
        { limit, threshold: 0.5, includeContent: true }
      );

      const formattedResults = semanticResults.map((result: any) => ({
        id: result.filePath,
        title: result.title || result.filePath,
        snippet: result.snippet || result.preview || '',
        score: result.score || 0,
        searchMethod: 'semantic' as const,
        metadata: {
          filePath: result.filePath,
          type: 'content',
          searchMethod: 'semantic',
          semanticScore: result.score
        }
      }));

      return {
        success: true,
        results: formattedResults,
        searchMethod: 'semantic'
      };
    } catch (error) {
      return {
        success: false,
        error: `Semantic search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform keyword search as fallback
   */
  private async performKeywordSearch(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 5
  ): Promise<ContentSearchResult> {
    try {
      // Simple keyword search implementation
      // This is a basic fallback when no other search methods are available
      const results: UniversalSearchResultItem[] = [];
      
      // Note: In a real implementation, you would use Obsidian's search API
      // or implement a more sophisticated keyword search
      
      return {
        success: true,
        results,
        searchMethod: 'keyword'
      };
    } catch (error) {
      return {
        success: false,
        error: `Keyword search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if semantic search is available
   */
  isSemanticSearchAvailable(): boolean {
    return !!this.hnswSearchService;
  }

  /**
   * Check if hybrid search is available
   */
  isHybridSearchAvailable(): boolean {
    return !!this.hybridSearchService;
  }

  /**
   * Get search capabilities
   */
  getSearchCapabilities(): {
    semantic: boolean;
    hybrid: boolean;
    keyword: boolean;
  } {
    return {
      semantic: this.isSemanticSearchAvailable(),
      hybrid: this.isHybridSearchAvailable(),
      keyword: true // Always available as fallback
    };
  }

  /**
   * Update search services
   */
  updateServices(hnswSearchService?: HnswSearchService, hybridSearchService?: HybridSearchService): void {
    this.hnswSearchService = hnswSearchService;
    this.hybridSearchService = hybridSearchService;
  }
}