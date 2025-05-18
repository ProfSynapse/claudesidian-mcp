import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchPropertyArgs, SearchPropertyResult } from '../types';
import { SearchOperations } from '../../../database/utils/SearchOperations';
import { ChromaSearchService } from '../../../database/services/ChromaSearchService';

/**
 * Mode for searching properties in the vault
 */
export class SearchPropertyMode extends BaseMode<SearchPropertyArgs, SearchPropertyResult> {
  private app: App;
  private searchOperations: SearchOperations;
  private searchService: ChromaSearchService | null = null;
  
  /**
   * Create a new SearchPropertyMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchProperty',
      'Search Property',
      'Search for properties in the vault',
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
  async execute(params: SearchPropertyArgs): Promise<SearchPropertyResult> {
    const { key, value, paths, limit } = params;
    
    try {
      // Check if ChromaDB search service is available
      if (this.searchService) {
        return await this.executeChromaSearch(params);
      }
      
      // Use standard search method
      return await this.executeStandardSearch(params);
    } catch (error) {
      console.error('Error in searchProperty mode execution:', error);
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
  private async executeChromaSearch(params: SearchPropertyArgs): Promise<SearchPropertyResult> {
    try {
      if (!this.searchService) {
        throw new Error('ChromaDB search service is not available');
      }
      
      const { key, value, paths, limit } = params;
      
      // Create filter for combined search
      const filters: {
        paths?: string[];
        properties?: Record<string, any>;
      } = {};
      
      // Add property filter
      if (key) {
        filters.properties = {};
        filters.properties[key] = value;
      }
      
      // Add path filters if provided
      if (paths && paths.length > 0) {
        filters.paths = paths;
      }
      
      // Execute search with filters via ChromaDB service
      // Using key as a fallback query to get relevant results if no value specified
      const searchQuery = value || key || "";
      const searchResult = await this.searchService.combinedSearch(
        searchQuery,
        filters,
        limit || 50,
        0.1 // Very low threshold because we're mainly relying on property filtering
      );
      
      if (!searchResult.success || !searchResult.matches) {
        throw new Error(searchResult.error || 'Search failed');
      }
      
      // Extract file paths and property values from matches
      const results = [];
      const processedPaths = new Set(); // To avoid duplicates
      
      for (const match of searchResult.matches) {
        // Skip if we've already processed this file
        if (processedPaths.has(match.filePath)) {
          continue;
        }
        
        // Get property value from metadata
        const frontmatter = match.metadata?.frontmatter;
        if (frontmatter && frontmatter[key] !== undefined) {
          results.push({
            path: match.filePath,
            value: String(frontmatter[key])
          });
          
          processedPaths.add(match.filePath);
        }
      }
      
      return {
        success: true,
        files: results,
        total: results.length
      };
    } catch (error) {
      console.error('Error in ChromaDB property search:', error);
      
      // Fall back to standard search on ChromaDB error
      return this.executeStandardSearch(params);
    }
  }
  
  /**
   * Execute search using standard SearchOperations
   * @param params Search parameters
   * @returns Search result using standard search
   */
  private async executeStandardSearch(params: SearchPropertyArgs): Promise<SearchPropertyResult> {
    const { key, value, paths, limit } = params;
    
    // Convert paths to a single path if needed
    const path = paths && paths.length > 0 ? paths[0] : undefined;
    
    // Use SearchOperations directly
    const files = await this.searchOperations.searchByProperty(key, value, {
      path,
      limit
    });
    
    // Convert TFile objects to PropertyMatch objects
    const results = [];
    
    for (const file of files) {
      // Get file metadata from cache to extract the property value
      const metadata = this.app.metadataCache.getFileCache(file);
      if (!metadata?.frontmatter) continue;
      
      const propertyValue = metadata.frontmatter[key];
      
      results.push({
        path: file.path,
        value: String(propertyValue)
      });
    }
    
    return {
      success: true,
      files: results,
      total: results.length
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
        key: {
          type: 'string',
          description: 'Property key'
        },
        value: {
          type: 'string',
          description: 'Property value (optional)'
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
      required: ['key'],
      description: 'Search for properties in the vault'
    };
  }
}
