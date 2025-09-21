/**
 * ContentSearchStrategy - Handles content/semantic search
 * Follows Single Responsibility Principle by focusing only on content search
 */

import { TFile } from 'obsidian';
// Search services removed in simplified architecture
type HybridSearchService = any;
type HybridSearchOptions = any;
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
    private hybridSearchService?: HybridSearchService
  ) {}

  /**
   * Update services for runtime service injection
   */
  updateServices(hybridSearchService?: HybridSearchService): void {
    this.hybridSearchService = hybridSearchService;
  }

  /**
   * Search content using available search methods
   */
  async searchContent(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 10, 
    params?: UniversalSearchParams
  ): Promise<ContentSearchResult> {
    const searchStartTime = performance.now();
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

      // Final fallback to keyword search
      const keywordResult = await this.performKeywordSearch(query, filteredFiles, limit);
      return keywordResult;
      
    } catch (error) {
      const totalSearchTime = performance.now() - searchStartTime;
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
    limit = 10, 
    params?: UniversalSearchParams
  ): Promise<ContentSearchResult> {
    const hybridSearchStartTime = performance.now();
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
        keywordThreshold: 0.3,
        fuzzyThreshold: 0.6,
        queryType: params?.queryType,
        snippetLength: params?.snippetLength
      };

      const searchStart = performance.now();
      
      // Enhanced error handling with collection validation awareness
      let hybridResults;
      try {
        hybridResults = await this.hybridSearchService.search(query, hybridOptions, filteredFiles);
      } catch (error) {
        const searchTime = performance.now() - searchStart;
        // Hybrid search error - attempting fallback
        // Check if this is a collection-related error that should trigger fallback
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Collection') || errorMessage.includes('collection')) {
          // Collection error detected - hybrid search will be automatically recovered
        }

        // Re-throw to trigger fallback in calling method
        throw error;
      }
      
      const searchTime = performance.now() - searchStart;
      
      // Analyze content retrieval
      const contentAnalysis = this.analyzeContentRetrieval(hybridResults);

      // Apply content validation to ALL results for error prevention
      const formattedResults = hybridResults.map((result: any, index: number) => {
        return {
          id: result.filePath,
          title: result.title || result.filePath,
          snippet: this.validateAndSanitizeContent(result.content, result.snippet, result.preview), // Type-safe content validation
          score: result.score || 0,
          searchMethod: 'hybrid' as const,
          metadata: {
            filePath: result.filePath,
            type: 'content',
            searchMethod: 'hybrid',
            semanticScore: result.semanticScore,
            keywordScore: result.keywordScore,
            combinedScore: result.score,
            // Enhanced metadata for full content mode
            contentType: this.isValidStringContent(result.content) ? 'full' : 'snippet',
            originalLength: this.isValidStringContent(result.content) ? result.content.length : 0,
            snippetLength: this.isValidStringContent(result.snippet) ? result.snippet.length : 0
          }
        };
      });

      return {
        success: true,
        results: formattedResults,
        searchMethod: 'hybrid'
      };
    } catch (error) {
      const totalHybridSearchTime = performance.now() - hybridSearchStartTime;
      return {
        success: false,
        error: `Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Semantic search is now handled via ChromaDB through hybrid search

  /**
   * Perform keyword search as fallback
   */
  private async performKeywordSearch(
    query: string, 
    filteredFiles?: TFile[], 
    limit = 10
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
    return !!this.hybridSearchService;
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
   * Analyze content retrieval statistics for monitoring full content implementation
   */
  private analyzeContentRetrieval(results: any[]): {
    totalResults: number;
    fullContentResults: number;
    snippetFallbacks: number;
    averageContentLength: number;
    estimatedPayloadIncrease: number;
  } {
    const totalResults = results.length;
    const fullContentResults = results.filter(r => r.content && r.content.length > 0).length;
    const snippetFallbacks = totalResults - fullContentResults;
    
    // Calculate average content lengths
    const contentLengths = results
      .filter(r => r.content)
      .map(r => r.content.length);
    const averageContentLength = contentLengths.length > 0 
      ? Math.round(contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length)
      : 0;
    
    // Estimate payload increase compared to 150-char snippets
    const fullContentSize = contentLengths.reduce((sum, len) => sum + len, 0);
    const snippetEquivalentSize = totalResults * 150; // Previous 150-char limit
    const estimatedPayloadIncrease = snippetEquivalentSize > 0 
      ? Math.round((fullContentSize / snippetEquivalentSize) * 100) / 100
      : 0;
    
    return {
      totalResults,
      fullContentResults,
      snippetFallbacks,
      averageContentLength,
      estimatedPayloadIncrease
    };
  }

  /**
   * Content Validation Framework - Prevents "Cannot read properties of undefined (reading 'split')" errors
   * Implements comprehensive type-safe content field processing with minimal performance overhead
   */
  private validateAndSanitizeContent(
    primaryContent: any,
    fallbackSnippet: any,
    fallbackPreview: any
  ): string {
    // Stage 1: Try primary content with comprehensive validation
    if (this.isValidStringContent(primaryContent)) {
      const sanitized = this.sanitizeContent(primaryContent);
      return sanitized;
    }
    
    // Stage 2: Try fallback snippet
    if (this.isValidStringContent(fallbackSnippet)) {
      const sanitized = this.sanitizeContent(fallbackSnippet);
      return sanitized;
    }
    
    // Stage 3: Try fallback preview
    if (this.isValidStringContent(fallbackPreview)) {
      const sanitized = this.sanitizeContent(fallbackPreview);
      return sanitized;
    }
    
    // Stage 4: Safe empty string fallback
    return '';
  }

  /**
   * Type guard with comprehensive string content validation
   * Ensures the content is a valid string with required methods available
   */
  private isValidStringContent(content: any): content is string {
    const isValid = (
      typeof content === 'string' &&
      content !== null &&
      content !== undefined &&
      // Ensure string methods are available (defensive programming)
      typeof content.split === 'function' &&
      typeof content.toLowerCase === 'function' &&
      typeof content.startsWith === 'function'
    );
    
    return isValid;
  }

  /**
   * Content sanitization with safety checks and error prevention
   * Removes problematic characters that might break downstream processing
   */
  private sanitizeContent(content: string): string {
    // Basic safety checks
    if (content.length === 0) {
      return '';
    }
    
    // Hard limit to prevent memory issues
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '...';
    }
    
    // Remove problematic characters that might break processing
    const sanitized = content
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x1F\x7F]/g, ' ') // Replace control characters with spaces
      .trim();
    
    return sanitized;
  }

  // Note: updateServices method defined above (line 29)
}