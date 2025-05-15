import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { SearchTagArgs, SearchTagResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for searching tags in the vault
 */
export class SearchTagMode extends BaseMode<SearchTagArgs, SearchTagResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
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
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the search results
   */
  async execute(params: SearchTagArgs): Promise<SearchTagResult> {
    const { tag, paths, limit } = params;
    
    try {
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
    } catch (error) {
      return {
        success: false,
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
