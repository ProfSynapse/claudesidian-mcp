import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchPropertyArgs, SearchPropertyResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for searching properties in the vault
 */
export class SearchPropertyMode extends BaseMode<SearchPropertyArgs, SearchPropertyResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
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
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the search results
   */
  async execute(params: SearchPropertyArgs): Promise<SearchPropertyResult> {
    const { key, value, paths, limit } = params;
    
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
      return {
        files: [],
        total: 0
      };
    }
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
          description: 'Paths to search in (optional). Use an empty string "" or "/" to access the root folder. Do not use "."'
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
