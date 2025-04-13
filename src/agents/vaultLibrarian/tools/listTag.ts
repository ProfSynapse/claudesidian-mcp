import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ListTagArgs, ListTagResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Tool for listing tags in the vault
 */
export class ListTagTool extends BaseTool<ListTagArgs, ListTagResult> {
  private app: App;
  
  /**
   * Create a new ListTagTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listTag',
      'List tags in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the list of tags
   */
  async execute(args: ListTagArgs): Promise<ListTagResult> {
    const { prefix, limit } = args;
    
    try {
      const tags = SearchOperations.listTags(this.app, prefix, limit);
      
      return {
        tags,
        total: tags.length
      };
    } catch (error) {
      console.error('Failed to list tags:', error);
      
      return {
        tags: [],
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
        prefix: {
          type: 'string',
          description: 'Filter by prefix (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional)'
        }
      },
      description: 'List tags in the vault'
    };
  }
}