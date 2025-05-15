import { App } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { ListPropertiesArgs, ListPropertiesResult } from '../types';
import { SearchOperations } from '../utils/SearchOperations';

/**
 * Mode for listing properties in the vault
 */
export class ListPropertiesMode extends BaseMode<ListPropertiesArgs, ListPropertiesResult> {
  private app: App;
  
  /**
   * Create a new ListPropertiesMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'listProperties',
      'List Properties',
      'List properties in the vault',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise that resolves with the list of properties
   */
  async execute(params: ListPropertiesArgs): Promise<ListPropertiesResult> {
    const { key, limit } = params;
    
    try {
      const properties = await SearchOperations.listProperties(this.app, key, limit);
      
      return {
        success: true,
        properties,
        total: Object.keys(properties).length
      };
    } catch (error) {
      console.error('Failed to list properties:', error);
      
      return {
        success: false,
        properties: {},
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
          description: 'Filter by key (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (optional)'
        }
      },
      description: 'List properties in the vault'
    };
  }
}