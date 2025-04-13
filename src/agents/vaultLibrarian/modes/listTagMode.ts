import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListTagArgs, ListTagResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for listing tags in the vault
 */
export class ListTagMode extends BaseMode<ListTagArgs, ListTagResult> {
  private app: App;
  
  /**
   * Create a new ListTagMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listTag',
      'List Tags',
      'List tags in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of tags
   */
  async execute(params: ListTagArgs): Promise<ListTagResult> {
    const { prefix, limit } = params;
    
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
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  getParameterSchema(): any {
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