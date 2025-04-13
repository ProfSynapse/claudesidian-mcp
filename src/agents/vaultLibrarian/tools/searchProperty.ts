import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { SearchPropertyArgs, SearchPropertyResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for searching properties in the vault
 */
export class SearchPropertyTool extends BaseTool<SearchPropertyArgs, SearchPropertyResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
  /**
   * Create a new SearchPropertyTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchProperty',
      'Search for properties in the vault',
      '1.1.0'
    );
    
    this.app = app;
    this.searchOperations = new SearchOperations(app);
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the search results
   */
  async execute(args: SearchPropertyArgs): Promise<SearchPropertyResult> {
    const { key, value, paths, limit } = args;
    
    try {
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
        files: results,
        total: results.length
      };
    } catch (error) {
      console.error('Failed to search property:', error);
      
      return {
        files: [],
        total: 0
      };
    }
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
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