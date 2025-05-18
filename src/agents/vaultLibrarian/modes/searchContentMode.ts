import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchContentArgs, SearchContentResult } from '../types';
import { SearchOperations } from '../../../database/utils/SearchOperations';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';

/**
 * Mode for searching content in the vault
 */
export class SearchContentMode extends BaseMode<SearchContentArgs, SearchContentResult> {
  private app: App;
  private searchOperations: SearchOperations;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new SearchContentMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchContent',
      'Search Content',
      'Search for content in the vault',
      '1.1.0'
    );
    
    this.app = app;
    this.searchOperations = new SearchOperations(app);
    
    // Initialize ChromaDB search service if available
    try {
      const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
      if (plugin?.services?.searchService) {
        this.searchService = plugin.services.searchService;
      }
    } catch (error) {
      console.error('Error initializing ChromaDB search service:', error);
    }
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the search results
   */
  async execute(params: SearchContentArgs): Promise<SearchContentResult> {
    const { query, paths, limit, includeMetadata = true, searchFields, weights, includeContent = false } = params;
    
    try {
      // First check if we can use ChromaDB for this search
      if (this.searchService && this.isChromaCompatibleSearch(params)) {
        return await this.executeChromaSearch(params);
      }
      
      // Use the standard search method otherwise
      // Convert paths to a single path if needed
      const path = paths && paths.length > 0 ? paths[0] : undefined;
      
      // Use SearchOperations directly
      const utilResults = await this.searchOperations.search(query, {
        path,
        limit,
        includeMetadata,
        searchFields: searchFields || ['title', 'content', 'tags'],
        weights,
        includeContent
      });
      
      // Convert to VaultLibrarian search result format
      const results = utilResults.map(result => {
        // Find the best match to generate a snippet
        const bestMatch = result.matches.reduce((best, current) =>
          current.score > best.score ? current : best,
          { score: 0 } as any
        );
        
        // Generate snippet from content if available
        let snippet = '';
        let line = 1;
        let position = 0;
        
        if (result.content && bestMatch.term) {
          snippet = this.searchOperations.getSnippet(result.content, bestMatch.term);
          
          // Calculate line and position
          const lines = result.content.split('\n');
          let currentPos = 0;
          
          for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            const linePos = lineText.toLowerCase().indexOf(bestMatch.term.toLowerCase());
            
            if (linePos !== -1) {
              line = i + 1;
              position = linePos;
              break;
            }
            
            currentPos += lineText.length + 1; // +1 for newline
          }
        } else {
          snippet = `Match found in ${result.file.path} (score: ${result.score.toFixed(2)})`;
        }
        
        return {
          path: result.file.path,
          snippet,
          line,
          position,
          score: result.score
        };
      });
      
      // Enhanced result with more metadata
      return {
        success: true,
        results,
        total: results.length,
        // Add additional metadata
        averageScore: this.calculateAverageScore(results),
        topResult: results.length > 0 ? results[0].path : undefined
      };
    } catch (error) {
      console.error('Error in searchContent mode execution:', error);
      return {
        success: false,
        results: [],
        total: 0,
        error: error.message
      };
    }
  }
  
  /**
   * Execute search using ChromaDB
   * @param params Search parameters
   * @returns Search result using ChromaDB
   */
  private async executeChromaSearch(params: SearchContentArgs): Promise<SearchContentResult> {
    try {
      if (!this.searchService) {
        throw new Error('ChromaDB search service is not available');
      }
      
      const { query, paths, limit, searchFields } = params;
      
      // Create a combined search config
      const filters: any = {};
      
      // Add path filters if provided
      if (paths && paths.length > 0) {
        filters.paths = paths;
      }
      
      // Add any specific search field filters
      if (searchFields && searchFields.length > 0) {
        // Map searchFields to ChromaDB filter fields if needed
      }
      
      // Execute combined search via ChromaDB service
      const searchResult = await this.searchService.combinedSearch(
        query,
        filters,
        limit || 10,
        0.6 // Lower threshold for content search
      );
      
      if (!searchResult.success || !searchResult.matches) {
        throw new Error(searchResult.error || 'Search failed');
      }
      
      // Convert ChromaDB results to SearchContentResult format
      const results = searchResult.matches.map(match => ({
        path: match.filePath,
        snippet: match.content.length > 100 ? match.content.substring(0, 97) + '...' : match.content,
        line: match.lineStart || 1,
        position: 0,
        score: match.similarity
      }));
      
      return {
        success: true,
        results,
        total: results.length,
        averageScore: this.calculateAverageScore(results),
        topResult: results.length > 0 ? results[0].path : undefined
      };
    } catch (error) {
      console.error('Error in ChromaDB search:', error);
      
      // Fall back to standard search on ChromaDB error
      return this.executeStandardSearch(params);
    }
  }
  
  /**
   * Check if the search can be handled by ChromaDB
   * @param params Search parameters
   * @returns Whether ChromaDB can handle this search
   */
  private isChromaCompatibleSearch(params: SearchContentArgs): boolean {
    // For now, simple check if the search service is available
    // In the future, we could have more complex logic here
    return !!this.searchService;
  }
  
  /**
   * Execute search using standard SearchOperations
   * @param params Search parameters
   * @returns Search result using standard search
   */
  private async executeStandardSearch(params: SearchContentArgs): Promise<SearchContentResult> {
    const { query, paths, limit, includeMetadata = true, searchFields, weights, includeContent = false } = params;
    
    // Convert paths to a single path if needed
    const path = paths && paths.length > 0 ? paths[0] : undefined;
    
    // Use SearchOperations directly
    const utilResults = await this.searchOperations.search(query, {
      path,
      limit,
      includeMetadata,
      searchFields: searchFields || ['title', 'content', 'tags'],
      weights,
      includeContent
    });
    
    // Convert to VaultLibrarian search result format
    const results = utilResults.map(result => {
      // Find the best match to generate a snippet
      const bestMatch = result.matches.reduce((best, current) =>
        current.score > best.score ? current : best,
        { score: 0 } as any
      );
      
      // Generate snippet from content if available
      let snippet = '';
      let line = 1;
      let position = 0;
      
      if (result.content && bestMatch.term) {
        snippet = this.searchOperations.getSnippet(result.content, bestMatch.term);
        
        // Calculate line and position
        const lines = result.content.split('\n');
        let currentPos = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const linePos = lineText.toLowerCase().indexOf(bestMatch.term.toLowerCase());
          
          if (linePos !== -1) {
            line = i + 1;
            position = linePos;
            break;
          }
          
          currentPos += lineText.length + 1; // +1 for newline
        }
      } else {
        snippet = `Match found in ${result.file.path} (score: ${result.score.toFixed(2)})`;
      }
      
      return {
        path: result.file.path,
        snippet,
        line,
        position,
        score: result.score
      };
    });
    
    // Enhanced result with more metadata
    return {
      success: true,
      results,
      total: results.length,
      // Add additional metadata
      averageScore: this.calculateAverageScore(results),
      topResult: results.length > 0 ? results[0].path : undefined
    };
  }
  
  /**
   * Calculate the average score of search results
   * @param results Search results
   * @returns Average score
   */
  private calculateAverageScore(results: any[]): number | undefined {
    if (results.length === 0) {
      return undefined;
    }
    
    // If results have a score property, calculate average
    if (results[0].score !== undefined) {
      const sum = results.reduce((total, result) => total + result.score, 0);
      return sum / results.length;
    }
    
    return undefined;
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session identifier to track related tool calls'
        },
        query: {
          type: 'string',
          description: 'Query to search for'
        },
        paths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to search in (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional)'
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include metadata in the search (optional, default: true)'
        },
        searchFields: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['title', 'content', 'tags', 'category', 'description']
          },
          description: 'Fields to search in (optional, default: ["title", "content", "tags"])'
        },
        includeContent: {
          type: 'boolean',
          description: 'Whether to include content in the results (optional, default: false)'
        }
      },
      required: ['query', 'sessionId'],
      description: 'Search for content in the vault with advanced options'
    };
  }
}
