import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { SearchTagArgs, SearchTagResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for searching tags in the vault
 */
export class SearchTagTool extends BaseTool<SearchTagArgs, SearchTagResult> {
  private app: App;
  private searchOperations: SearchOperations;
  
  /**
   * Create a new SearchTagTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'searchTag',
      'Search for tags in the vault',
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
  async execute(args: SearchTagArgs): Promise<SearchTagResult> {
    const { tag, paths, limit } = args;
    
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
        files: filePaths,
        total: filePaths.length
      };
    } catch (error) {
      console.error('Failed to search tag:', error);
      
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