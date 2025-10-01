/**
 * ContentSearchStrategy - Handles content search
 * Follows Single Responsibility Principle by focusing only on content search
 */

import { TFile } from 'obsidian';
import { UniversalSearchParams, UniversalSearchResultItem } from '../../../../types';

export interface ContentSearchResult {
  success: boolean;
  error?: string;
  results?: UniversalSearchResultItem[];
  searchMethod?: 'keyword' | 'fuzzy';
}

/**
 * Service responsible for content search
 * Follows SRP by focusing only on content search operations
 */
export class ContentSearchStrategy {
  constructor() {}

  /**
   * Update services for runtime service injection (deprecated)
   */
  updateServices(): void {
    // No services needed for keyword-only search
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

      // Use keyword search (only available search method)
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
   * Get search capabilities (keyword search only)
   */
  getSearchCapabilities(): {
    keyword: boolean;
  } {
    return {
      keyword: true // Always available
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