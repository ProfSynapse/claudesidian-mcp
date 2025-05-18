import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchTagArgs, SearchTagResult } from '../types';
import { SearchOperations } from '../../../database/utils/SearchOperations';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';

/**
 * Mode for searching tags in the vault
 */
export class SearchTagMode extends BaseMode<SearchTagArgs, SearchTagResult> {
  private app: App;
  private searchOperations: SearchOperations;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new SearchTagMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchTag',
      'Search Tag',
      'Search for tags in the vault',
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
  async execute(params: SearchTagArgs): Promise<SearchTagResult> {
    const { tag, paths, limit } = params;
    
    try {
      // Check if ChromaDB search service is available and can be used
      if (this.searchService) {
        return await this.executeChromaSearch(params);
      }
      
      // Use standard search method
      return await this.executeStandardSearch(params);
    } catch (error) {
      console.error('Error in searchTag mode execution:', error);
      return {
        success: false,
        files: [],
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
  private async executeChromaSearch(params: SearchTagArgs): Promise<SearchTagResult> {
    try {
      if (!this.searchService) {
        throw new Error('ChromaDB search service is not available');
      }
      
      const { tag, paths, limit } = params;
      
      // Create filter for combined search
      const filters: {
        tags?: string[];
        paths?: string[];
      } = {};
      
      // Add tag to search for
      filters.tags = [tag];
      
      // Add path filters if provided
      if (paths && paths.length > 0) {
        filters.paths = paths;
      }
      
      // Execute search with filters via ChromaDB service
      // Note: We're not using a text query here, just filtering by tag
      // Using tag name as a fallback query to get relevant results
      const searchResult = await this.searchService.combinedSearch(
        tag, // Using tag as query for better relevance
        filters,
        limit || 50,
        0.1 // Very low threshold because we're mainly relying on tag filtering
      );
      
      if (!searchResult.success || !searchResult.matches) {
        throw new Error(searchResult.error || 'Search failed');
      }
      
      // Extract file paths from matches
      const filePaths = searchResult.matches.map(match => match.filePath);
      
      // Remove duplicates to ensure each file is only listed once
      const uniqueFilePaths = Array.from(new Set(filePaths));
      
      return {
        success: true,
        files: uniqueFilePaths,
        total: uniqueFilePaths.length
      };
    } catch (error) {
      console.error('Error in ChromaDB tag search:', error);
      
      // Fall back to standard search on ChromaDB error
      return this.executeStandardSearch(params);
    }
  }
  
  /**
   * Execute search using standard SearchOperations
   * @param params Search parameters
   * @returns Search result using standard search
   */
  private async executeStandardSearch(params: SearchTagArgs): Promise<SearchTagResult> {
    const { tag, paths, limit } = params;
    
    // Convert paths to a single path if needed
    const path = paths && paths.length > 0 ? paths[0] : undefined;
    
    // Use SearchOperations directly
    const files = await this.searchOperations.searchByTag(tag, {
      path,
      limit
    });
    
    // Convert TFile objects to paths
    const filePaths = files.map(file => file.path);
    
    return {
      success: true,
      files: filePaths,
      total: filePaths.length
    };
  }
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
    return {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Tag to search for'
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
        }
      },
      required: ['tag'],
      description: 'Search for tags in the vault'
    };
  }
}
