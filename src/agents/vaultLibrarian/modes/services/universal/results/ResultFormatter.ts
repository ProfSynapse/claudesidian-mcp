/**
 * ResultFormatter - Handles result formatting and presentation
 * Follows Single Responsibility Principle by focusing only on result formatting
 */

import { UniversalSearchResult, UniversalSearchResultItem, SearchResultCategory } from '../../../../types';
import { ConsolidatedSearchResult } from './ResultConsolidator';
import { UniversalSearchValidator } from '../validation/UniversalSearchValidator';

export interface FormattingOptions {
  includeSnippets?: boolean;
  maxSnippetLength?: number;
  includeMetadata?: boolean;
  includeConnectedNotes?: boolean;
  highlightQuery?: string;
}

export interface FormattingResult {
  success: boolean;
  error?: string;
  result?: UniversalSearchResult;
}

/**
 * Service responsible for formatting search results
 * Follows SRP by focusing only on result formatting operations
 */
export class ResultFormatter {
  private validator: UniversalSearchValidator;

  constructor() {
    this.validator = new UniversalSearchValidator();
  }
  /**
   * Format consolidated results into final universal search result
   */
  formatUniversalSearchResult(
    query: string,
    contentResults: UniversalSearchResultItem[],
    fileResults: UniversalSearchResultItem[],
    tagResults: UniversalSearchResultItem[],
    propertyResults: UniversalSearchResultItem[],
    executionTime: number,
    limit: number,
    semanticAvailable: boolean,
    options: FormattingOptions = {}
  ): FormattingResult {
    try {
      const totalResults = contentResults.length + fileResults.length + tagResults.length + propertyResults.length;

      // Apply formatting options
      const formattedContentResults = this.applyFormattingOptions(contentResults, options);
      const formattedFileResults = this.applyFormattingOptions(fileResults, options);
      const formattedTagResults = this.applyFormattingOptions(tagResults, options);
      const formattedPropertyResults = this.applyFormattingOptions(propertyResults, options);

      const result: UniversalSearchResult = {
        success: true,
        query,
        totalResults,
        executionTime,
        categories: {
          files: {
            count: formattedFileResults.length,
            results: formattedFileResults,
            hasMore: formattedFileResults.length >= limit,
            searchMethod: 'fuzzy',
            semanticAvailable
          },
          content: {
            count: formattedContentResults.length,
            results: formattedContentResults,
            hasMore: formattedContentResults.length >= limit,
            searchMethod: this.determineSearchMethod(formattedContentResults),
            semanticAvailable
          },
          tags: {
            count: formattedTagResults.length,
            results: formattedTagResults,
            hasMore: formattedTagResults.length >= limit,
            searchMethod: 'exact',
            semanticAvailable: false
          },
          properties: {
            count: formattedPropertyResults.length,
            results: formattedPropertyResults,
            hasMore: formattedPropertyResults.length >= limit,
            searchMethod: 'exact',
            semanticAvailable: false
          }
        },
        searchStrategy: {
          semanticAvailable,
          categoriesSearched: ['files', 'content', 'tags', 'properties'],
          categoriesExcluded: [],
          fallbacksUsed: []
        },
        contextPrompt: "To read the full content of multiple relevant files from these search results, consider using the ContentManager's batchContent mode with read operations. This allows you to efficiently gather complete context from the most promising files in a single request."
      };

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: `Result formatting failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Format consolidated results into universal search result
   */
  formatConsolidatedResult(
    query: string,
    consolidatedResults: ConsolidatedSearchResult[],
    executionTime: number,
    options: FormattingOptions = {}
  ): FormattingResult {
    try {
      // Convert consolidated results to universal search result items
      const allResults: UniversalSearchResultItem[] = [];

      for (const consolidated of consolidatedResults) {
        const item: UniversalSearchResultItem = {
          id: consolidated.filePath,
          title: this.extractTitle(consolidated.filePath),
          snippet: this.combineSnippets(consolidated.snippets, options),
          score: consolidated.bestScore,
          searchMethod: this.determineSearchMethodFromArray(consolidated.searchMethods),
          metadata: {
            ...consolidated.metadata,
            filePath: consolidated.filePath,
            searchMethods: consolidated.searchMethods,
            snippetCount: consolidated.snippets.length,
            connectedNotes: consolidated.connectedNotes,
            frontmatter: consolidated.frontmatter
          }
        };

        allResults.push(item);
      }

      // Format as universal search result
      const result: UniversalSearchResult = {
        success: true,
        query,
        totalResults: allResults.length,
        executionTime,
        categories: {
          content: {
            count: allResults.length,
            results: allResults,
            hasMore: false,
            searchMethod: 'hybrid',
            semanticAvailable: true
          },
          files: {
            count: 0,
            results: [],
            hasMore: false,
            searchMethod: 'fuzzy',
            semanticAvailable: true
          },
          tags: {
            count: 0,
            results: [],
            hasMore: false,
            searchMethod: 'exact',
            semanticAvailable: false
          },
          properties: {
            count: 0,
            results: [],
            hasMore: false,
            searchMethod: 'exact',
            semanticAvailable: false
          }
        },
        searchStrategy: {
          semanticAvailable: true,
          categoriesSearched: ['content'],
          categoriesExcluded: [],
          fallbacksUsed: []
        },
        contextPrompt: "To read the full content of multiple relevant files from these search results, consider using the ContentManager's batchContent mode with read operations. This allows you to efficiently gather complete context from the most promising files in a single request."
      };

      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: `Consolidated result formatting failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Apply formatting options to results
   */
  private applyFormattingOptions(
    results: UniversalSearchResultItem[],
    options: FormattingOptions
  ): UniversalSearchResultItem[] {
    return results.map(result => {
      let formattedResult = { ...result };

      // Format snippet
      if (options.includeSnippets !== false && result.snippet) {
        formattedResult.snippet = this.formatSnippet(
          result.snippet,
          options.maxSnippetLength,
          options.highlightQuery
        );
      } else if (options.includeSnippets === false) {
        formattedResult.snippet = '';
      }

      // Handle metadata
      if (options.includeMetadata === false) {
        formattedResult.metadata = {};
      } else if (options.includeConnectedNotes === false && formattedResult.metadata) {
        const { connectedNotes, ...metadata } = formattedResult.metadata;
        formattedResult.metadata = metadata;
      }

      return formattedResult;
    });
  }

  /**
   * Format snippet text
   */
  private formatSnippet(
    snippet: string,
    maxLength?: number,
    highlightQuery?: string
  ): string {
    let formatted = snippet;

    // Truncate if needed
    if (maxLength && formatted.length > maxLength) {
      formatted = formatted.substring(0, maxLength) + '...';
    }

    // Highlight query terms
    if (highlightQuery) {
      formatted = this.highlightQueryTerms(formatted, highlightQuery);
    }

    return formatted;
  }

  /**
   * Highlight query terms in text with validation to prevent split() errors
   */
  private highlightQueryTerms(text: string, query: string): string {
    const context = this.validator.createValidationContext('ResultFormatter', 'highlightQueryTerms', 'query_validation');
    
    if (!text) return text;

    // Validate query parameter before string operations to prevent errors
    const validatedQuery = this.validator.validateQuery(query, context);
    
    if (validatedQuery.length === 0) {
      return text;
    }
    
    // Safe to perform string operations - guaranteed valid string
    const terms = validatedQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    let highlighted = text;

    for (const term of terms) {
      const regex = new RegExp(`(${this.escapeRegExp(term)})`, 'gi');
      highlighted = highlighted.replace(regex, '**$1**');
    }

    return highlighted;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Combine snippets into a single text with content validation
   */
  private combineSnippets(
    snippets: Array<{ content: string; searchMethod: string; score: number }>,
    options: FormattingOptions
  ): string {
    if (!snippets || snippets.length === 0) return '';

    const context = this.validator.createValidationContext('ResultFormatter', 'combineSnippets', 'content_validation');
    
    // Validate all snippet content to prevent undefined values in join()
    const validatedSnippets = this.validator.validateSnippetsArray(snippets, context);
    
    if (validatedSnippets.length === 0) {
      return '';
    }

    // Sort by score
    const sortedSnippets = validatedSnippets.sort((a, b) => b.score - a.score);

    // Take the best snippets
    const topSnippets = sortedSnippets.slice(0, 3);

    // Combine and format - now safe as all content is validated
    let combined = topSnippets.map(s => s.content).join(' ... ');

    // Apply length limit
    if (options.maxSnippetLength && combined.length > options.maxSnippetLength) {
      combined = combined.substring(0, options.maxSnippetLength) + '...';
    }

    return combined;
  }

  /**
   * Extract title from file path
   */
  private extractTitle(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    const filename = lastSlash !== -1 ? filePath.substring(lastSlash + 1) : filePath;
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(0, lastDot) : filename;
  }

  /**
   * Determine search method from results
   */
  private determineSearchMethod(results: UniversalSearchResultItem[]): 'semantic' | 'fuzzy' | 'exact' | 'hybrid' {
    if (results.length === 0) return 'fuzzy';

    const methods = results.map(r => r.searchMethod);
    
    // Priority order: hybrid > semantic > fuzzy > exact
    if (methods.includes('hybrid')) return 'hybrid';
    if (methods.includes('semantic')) return 'semantic';
    if (methods.includes('fuzzy')) return 'fuzzy';
    return 'exact';
  }

  /**
   * Determine search method from array
   */
  private determineSearchMethodFromArray(methods: string[]): 'semantic' | 'fuzzy' | 'exact' | 'hybrid' {
    if (methods.includes('hybrid')) return 'hybrid';
    if (methods.includes('semantic')) return 'semantic';
    if (methods.includes('fuzzy')) return 'fuzzy';
    return 'exact';
  }

  /**
   * Create empty result
   */
  createEmptyResult(query: string, executionTime: number): UniversalSearchResult {
    return {
      success: true,
      query,
      totalResults: 0,
      executionTime,
      categories: {
        files: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'fuzzy',
          semanticAvailable: false
        },
        content: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'fuzzy',
          semanticAvailable: false
        },
        tags: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'exact',
          semanticAvailable: false
        },
        properties: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'exact',
          semanticAvailable: false
        }
      },
      searchStrategy: {
        semanticAvailable: false,
        categoriesSearched: [],
        categoriesExcluded: [],
        fallbacksUsed: []
      },
      contextPrompt: "To read the full content of multiple relevant files from these search results, consider using the ContentManager's batchContent mode with read operations. This allows you to efficiently gather complete context from the most promising files in a single request."
    };
  }

  /**
   * Create error result
   */
  createErrorResult(query: string, error: string): UniversalSearchResult {
    return {
      success: false,
      query,
      totalResults: 0,
      executionTime: 0,
      error,
      categories: {
        files: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'fuzzy',
          semanticAvailable: false
        },
        content: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'fuzzy',
          semanticAvailable: false
        },
        tags: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'exact',
          semanticAvailable: false
        },
        properties: {
          count: 0,
          results: [],
          hasMore: false,
          searchMethod: 'exact',
          semanticAvailable: false
        }
      },
      searchStrategy: {
        semanticAvailable: false,
        categoriesSearched: [],
        categoriesExcluded: [],
        fallbacksUsed: []
      },
      contextPrompt: "To read the full content of multiple relevant files from these search results, consider using the ContentManager's batchContent mode with read operations. This allows you to efficiently gather complete context from the most promising files in a single request."
    };
  }
}